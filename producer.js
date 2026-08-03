(function () {
  "use strict";

  // ============ 상수 ============
  const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
  const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
  const TTS_MODEL = "gemini-2.5-flash-preview-tts";
  const KIE_CREATE = "https://api.kie.ai/api/v1/jobs/createTask";
  const KIE_RECORD = "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=";
  // 이미지 1장당 예상 비용(원) — 대략치. 환율/모델에 따라 달라질 수 있음.
  const IMG_COST = {
    "gemini-2.5-flash-image": 55, "gemini-2.5-flash-image-preview": 55,
    "gemini-2.0-flash-preview-image-generation": 55,
    "nano-banana-2": 30, "nano-banana-pro": 60, "nano-banana-2-lite": 15
  };
  const LS = {
    claude: "yeti_api_key",          // 대본 공방과 공유
    gemini: "yeti_gemini_key",
    model: "yeti_model_daebon",      // 대본 공방과 공유
    imgModel: "yeti_img_model",
    textProvider: "yeti_text_provider", // 'claude' | 'gemini'
    geminiTextModel: "yeti_gemini_text_model",
    provider: "yeti_img_provider",   // 항상 'kie'
    kie: "yeti_kie_key",
    kieModel: "yeti_kie_model",
    kieVideoModel: "yeti_kie_video_model",
    kieRes: "yeti_kie_res",
    channelName: "yeti_channel_name",
    typecast: "yeti_typecast_key",
    typecastVoice: "yeti_typecast_voice",      // 구버전(마이그레이션용)
    typecastVoiceKo: "yeti_typecast_voice_ko",
    typecastVoiceJa: "yeti_typecast_voice_ja",
    geminiVoice: "yeti_gemini_voice",          // 구버전
    geminiVoiceKo: "yeti_gemini_voice_ko",
    geminiVoiceJa: "yeti_gemini_voice_ja",
    projects: "yeti_projects"
  };
  const TYPECAST_URL = "https://api.typecast.ai/v1/text-to-speech";
  const GEMINI_VOICES = [
    ["Kore", "Kore — 차분·기본 (여)"], ["Aoede", "Aoede — 부드러움 (여)"], ["Leda", "Leda — 밝고 또렷 (여)"],
    ["Callirrhoe", "Callirrhoe — 편안함 (여)"], ["Sulafat", "Sulafat — 따뜻함 (여)"], ["Achernar", "Achernar — 또렷 (여)"],
    ["Charon", "Charon — 묵직·낮음 (남)"], ["Puck", "Puck — 경쾌 (남)"], ["Fenrir", "Fenrir — 강렬 (남)"],
    ["Orus", "Orus — 단단함 (남)"], ["Enceladus", "Enceladus — 숨결 섞인 (남)"], ["Iapetus", "Iapetus — 담담 (남)"]
  ];

  const STEPS = [
    { key: "category", name: "주제 고르기" },
    { key: "topic", name: "주제 추천" },
    { key: "script", name: "대본·정보" },
    { key: "prompt", name: "이미지 프롬프트" },
    { key: "image", name: "이미지 생성" },
    { key: "thumb", name: "썸네일" },
    { key: "voice", name: "음성·자막" },
    { key: "edit", name: "편집·미리보기" },
    { key: "export", name: "캡컷 내보내기" }
  ];
  const stepOf = (k) => STEPS.findIndex((s) => s.key === k);
  function goStep(k) { stepIdx = stepOf(k); project.lastStep = k; saveProject(); render(); }

  // 언어별 설정 (한국 야담 / 일본 괴담·옛이야기)
  const LANG = {
    ko: {
      name: "한국어", flag: "🇰🇷",
      audience: "한국 시니어(50~70대) 대상 '야담·옛날이야기' 유튜브",
      setting: "Korean, Joseon-era, wearing historically accurate hanbok",
      watermark: "AI로 제작되었습니다",
      style: "semi-realistic Korean manhwa illustration, painterly rendering, refined detailed eyes, clean confident linework, soft cinematic shading, mature historical drama tone"
    },
    ja: {
      name: "日本語", flag: "🇯🇵",
      audience: "일본 시니어(50~70대) 대상 '괴담·옛이야기(昔話)' 유튜브",
      setting: "Japanese, Edo-era, wearing historically accurate kimono",
      watermark: "AIで制作されました",
      style: "semi-realistic Japanese historical manga illustration, painterly rendering, refined detailed eyes, clean confident linework, soft cinematic shading, mature period drama tone"
    }
  };
  const langDirective = () => project.lang === "ja"
    ? "\n\n중요: 결과의 모든 텍스트(제목·설명·태그·대본 등)는 반드시 자연스러운 '일본어'로 작성한다."
    : "";

  // 언어별 그림체 프리셋 — 한국: 참고 이미지형 2D 민담 애니 / 일본: 부드러운 애니 셀화풍
  const STYLE_PRESETS = {
    ko: [
      { name: "부드러운 시대극 웹툰", desc: "단정한 얼굴·부드러운 셀 명암·따뜻한 자연색", preview: "assets/style-ko-soft-webtoon.png", tail: "soft premium Korean historical webtoon illustration, elegant realistic-but-drawn faces, smooth clean ink lines, gentle cel shading, warm natural earth palette, polished detailed Joseon village backgrounds, emotional and approachable" },
      { name: "영화풍 만화", desc: "성숙한 인물·붓질 질감·극적인 따뜻한 조명", preview: "assets/style-ko-cinematic-manhwa.png", tail: "cinematic painterly Korean historical manhwa, mature proportional faces, refined brush rendering over crisp line art, dramatic warm rim light, deep burgundy and navy palette, richly textured historical interiors" },
      { name: "강렬한 웹툰 (추천)", desc: "마음에 든 기존 3번째 이미지·역동적 구도·강한 명암", preview: "assets/style-ko-webtoon.png", tail: "bold modern Korean historical webtoon illustration, angular expressive faces, dynamic cinematic perspective, crisp variable ink lines, strong cel shadows, high-contrast teal and orange palette, graphic detailed palace and Joseon village backgrounds" },
      { name: "2D 애니 스타일", desc: "자연스러운 성인 비율·정교한 선·선명한 셀 채색", preview: "assets/style-ko-clean-cel.png", tail: "clean contemporary Korean historical 2D cel-animation, adult natural proportions, precise thin-to-medium outlines, bright controlled cel colors, crisp facial acting, detailed but simplified Joseon architecture, balanced cinematic composition, no chibi" },
      { name: "파스텔 2D 애니", desc: "복숭아·하늘·크림색의 낮은 대비와 부드러운 분위기", preview: "assets/style-ko-pastel-anime.png", tail: "pastel Korean historical 2D animation, natural adult proportions, delicate clean outlines, soft peach sky-blue cream and sage palette, low contrast, gentle cel shading, subtle paper texture, warm dreamy sunlight, beautiful simplified Joseon village backgrounds, no chibi" },
      { name: "어두운 미스터리 웹툰", desc: "각진 중년 얼굴·날카로운 눈빛·달빛과 붉은 포인트", preview: "assets/style-ko-mystery-webtoon.png", tail: "dark mystery Korean historical webtoon, angular mature faces, sharp expressive eyes, dynamic low-angle framing, crisp black ink, dramatic hard cel shadows, moonlit blue palette with restrained red accents, detailed government courtyards" }
    ],
    ja: [
      { name: "애니 셀화 (기본)", desc: "깔끔한 셀 채색, 정겨운 옛이야기 느낌", tail: "traditional Japanese folktale anime illustration, clean cel shading, flat soft colors, gentle rounded faces, hand-painted rural scenery, warm nostalgic wholesome mood" },
      { name: "애니 셀화 · 밝고 따뜻", desc: "화사하고 따뜻한 햇살 색감", tail: "Japanese folktale anime illustration, clean cel shading, bright warm sunny palette, soft gentle faces, lush hand-painted countryside, cheerful nostalgic mood" },
      { name: "애니 셀화 · 차분한 톤", desc: "가라앉은 색, 애틋한 분위기", tail: "Japanese folktale anime illustration, cel shading, muted calm subdued palette, gentle faces, quiet melancholic atmosphere, soft hand-painted background" },
      { name: "애니 셀화 · 배경 디테일", desc: "정교하게 그린 풍경 배경", tail: "Japanese folktale anime illustration, clean cel shading, richly detailed hand-painted scenic backgrounds, soft gentle characters, atmospheric depth, warm tones" },
      { name: "우키요에풍", desc: "전통 목판화 느낌, 굵은 외곽선", tail: "ukiyo-e Japanese woodblock print style, flat colors, bold outlines, traditional patterns, Edo period aesthetic, elegant composition" }
    ]
  };
  const stylePresetsFor = (lang) => STYLE_PRESETS[lang] || STYLE_PRESETS.ko;
  const defaultStyleFor = (lang) => lang === "ko" ? STYLE_PRESETS.ko[2].tail : stylePresetsFor(lang)[0].tail;
  function migrateOldKoreanStyle(p) {
    if (p?.lang === "ko" && (!p.style || /semi-realistic|realistic faces|Korean manhwa|Korean folktale|retro Korean TV|picture-book watercolor|dark Korean folklore ink|traditional Korean minhwa/i.test(p.style))) p.style = defaultStyleFor("ko");
    return p;
  }

  // 대본 규칙(정제본 v11.3) — 제목 패턴 / 인트로 / 고정 멘트
  const TITLE_PATTERNS =
    "- 충격 행동 + 반전 궁금증: 장터에서 아기를 100냥에 사온 과부, 그 아이의 정체는?\n" +
    "- A vs B 대비: 큰 며느리는 땅 갖고 막내 며느리는 시어머니를 가졌다\n" +
    "- 상황 + 미완성 반응: 세자빈 간택에 거지 차림으로 나온 처자, 모두 비웃었는데..\n" +
    "- 은혜 행동 + 그날 밤 결과: 흰 뱀을 구한 농부, 그날 밤 문 앞에 나타난 소녀\n" +
    "- 신분역전 + 운명: 거지 소년을 거둔 과부, 10년 후 벌어진 일";
  const CTA_KO = "구독과 좋아요는 더 좋은 이야기를 만드는 힘이 됩니다. 그럼 지금부터…";
  const OUTRO_KO =
    "다음 영상을 빠르게 만나보시려면 좋아요와 구독을 눌러주세요. " +
    "지금 화면에 나오는 더 재미있는 영상들도 함께 해주세요. " +
    "그럼 모두 행복한 하루 보내세요. 감사합니다.";

  const CATEGORIES = [
    { key: "권선징악", emoji: "⚖️", desc: "착한 이는 복 받고 악한 이는 벌 받는 통쾌한 이야기" },
    { key: "귀신·괴담", emoji: "👻", desc: "밤에 오싹해지는 처녀귀신·도깨비·저주 이야기" },
    { key: "사랑·비극", emoji: "💔", desc: "신분을 넘은 사랑, 애틋하고 가슴 아픈 이야기" },
    { key: "역사 인물", emoji: "🏯", desc: "임금·어사·명의 등 실존感 인물의 숨은 일화" },
    { key: "해학·풍자", emoji: "😆", desc: "양반을 골리는 하인, 웃음 터지는 재치 이야기" },
    { key: "미스터리·추리", emoji: "🔍", desc: "억울한 죽음의 진실을 파헤치는 사건 이야기" },
    { key: "가족·효", emoji: "🏠", desc: "부모·자식의 정, 눈물 나는 효심 이야기" },
    { key: "재물·출세", emoji: "💰", desc: "가난뱅이가 복을 얻어 신분 상승하는 이야기" },
    { key: "복수·응징", emoji: "⚔️", desc: "짓밟힌 이가 통쾌하게 되갚는 사이다 이야기" }
  ];

  // ============ 상태 ============
  let stepIdx = 0;
  let busy = false;
  let project = newProject();

  function newProject(lang) {
    lang = lang || "ko";
    return {
      id: "p" + Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastStep: "category",
      lang: lang,
      category: "",
      topics: [],
      topicIdx: -1,
      title: "",
      titleTag: "",
      description: "",
      tags: [],
      style: defaultStyleFor(lang),
      scenes: [],       // {text, imagePrompt, imageDataUrl, audioDataUrl, durationSec, isIntro, zoom}
      characters: [],   // {name, look, imageDataUrl, imageUrl} — 모든 장면에 고정되는 주인공
      watermark: LANG[lang].watermark,
      thumb: { copies: [], chosen: -1, imagePrompt: "", imageDataUrl: "" }
    };
  }

  // 로컬 서버(server.ps1)로 열었을 때만 CORS 우회 중계 사용
  const onLocalServer = () => /^https?:$/.test(location.protocol) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const apiFetch = (url, opts) => onLocalServer() ? fetch("/__proxy?u=" + encodeURIComponent(url), opts) : fetch(url, opts);

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };

  // ============ 키/설정 ============
  const claudeKey = () => localStorage.getItem(LS.claude) || "";
  const geminiKey = () => localStorage.getItem(LS.gemini) || "";
  const claudeModel = () => localStorage.getItem(LS.model) || "claude-opus-5";
  const textProvider = () => localStorage.getItem(LS.textProvider) || "claude";
  const geminiTextModel = () => {
    const m = localStorage.getItem(LS.geminiTextModel);
    // 신규 사용자에게 막힌 옛 모델명은 최신 별칭으로 자동 교정
    if (!m || /^gemini-2\.5-flash$|^gemini-1\.5-flash$|^gemini-2\.0-flash$/.test(m)) return "gemini-flash-latest";
    return m;
  };
  // 이미지·영상 생성 API — KIE.ai 전용 (글작성 키와 분리)
  const kieKey = () => localStorage.getItem(LS.kie) || "";
  const kieModel = () => localStorage.getItem(LS.kieModel) || "nano-banana-2";
  const kieVideoModel = () => localStorage.getItem(LS.kieVideoModel) || "veo3-fast";
  const imgKeyOk = () => !!kieKey();
  const imgCostWon = () => IMG_COST[kieModel()] || 30;
  const imgCostText = () => `약 <b>${imgCostWon()}원/장</b> (KIE.ai 크레딧 기준 추정)`;
  const channelName = () => localStorage.getItem(LS.channelName) || "설루온";
  const typecastKey = () => localStorage.getItem(LS.typecast) || "";
  const typecastVoice = () => (project.lang === "ja"
    ? (localStorage.getItem(LS.typecastVoiceJa) || localStorage.getItem(LS.typecastVoice))
    : (localStorage.getItem(LS.typecastVoiceKo) || localStorage.getItem(LS.typecastVoice))) || "";
  const geminiVoice = () => (project.lang === "ja"
    ? (localStorage.getItem(LS.geminiVoiceJa) || localStorage.getItem(LS.geminiVoice))
    : (localStorage.getItem(LS.geminiVoiceKo) || localStorage.getItem(LS.geminiVoice))) || "Kore";

  // ============ 토스트 ============
  let tT;
  function toast(m) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = m; t.hidden = false;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(tT);
    tT = setTimeout(() => { t.classList.remove("show"); setTimeout(() => (t.hidden = true), 260); }, 2100);
  }

  // ============ 대본 JSON 호출 (엔진: Gemini 무료 / Claude) ============
  async function claudeJSON(system, user, maxTokens) {
    if (textProvider() === "gemini") return geminiJSON(system, user, maxTokens);
    const key = claudeKey();
    if (!key) throw new Error("NO_CLAUDE_KEY");
    const res = await fetch(CLAUDE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: claudeModel(),
        max_tokens: maxTokens || 8000,
        system: system,
        messages: [{ role: "user", content: user }]
      })
    });
    if (!res.ok) {
      let d = ""; try { d = (await res.json()).error?.message; } catch (e) { d = await res.text(); }
      throw new Error(`Claude ${res.status}: ${d}`);
    }
    const j = await res.json();
    const text = (j.content || []).map((c) => c.text || "").join("");
    return parseJSON(text);
  }
  // Gemini 무료 텍스트 생성 (Google AI Studio 키의 무료 사용량 사용)
  async function geminiJSON(system, user, maxTokens) {
    const key = geminiKey();
    if (!key) throw new Error("NO_GEMINI_KEY");
    // 최신 Gemini는 thinking 토큰이 출력 한도를 잡아먹으므로 넉넉히(최소 16000) 확보
    const cap = Math.min(Math.max(maxTokens || 8000, 16000), 60000);
    const call = (noThink) => {
      const gen = { temperature: 0.95, maxOutputTokens: cap, responseMimeType: "application/json" };
      // thinking(생각) 토큰이 출력 한도를 잡아먹어 JSON이 잘리는 것 방지 → 끔
      if (noThink) gen.thinkingConfig = { thinkingBudget: 0 };
      return fetch(GEMINI_BASE + geminiTextModel() + ":generateContent?key=" + encodeURIComponent(key), {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: user }] }], generationConfig: gen })
      });
    };
    let res = await call(true);
    if (!res.ok) {
      let d = ""; try { d = (await res.clone().json()).error?.message || ""; } catch (e) {}
      // thinkingConfig 미지원 모델이면 그 옵션 없이 재시도
      if (/thinking|Unknown name|not supported|Invalid|INVALID_ARGUMENT/i.test(d)) res = await call(false);
    }
    if (!res.ok) {
      let d = ""; try { d = (await res.json()).error?.message; } catch (e) { d = await res.text(); }
      throw new Error(`Gemini(대본) ${res.status}: ${d}`);
    }
    const j = await res.json();
    const cand = j.candidates?.[0];
    const text = (cand?.content?.parts || []).map((p) => p.text || "").join("");
    if (!text) {
      if (cand?.finishReason === "MAX_TOKENS") throw new Error("Gemini 응답이 잘렸어요(길이 초과). 모델을 gemini-2.5-flash로 바꾸거나 다시 시도하세요.");
      throw new Error("Gemini 응답이 비었어요. 다시 시도하세요.");
    }
    return parseJSON(text);
  }

  function parseJSON(text) {
    let t = (text || "").trim();
    if (!t) throw new Error("AI 응답이 비었어요. 다시 시도하세요.");
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1].trim();
    const s = t.indexOf("{"), e = t.lastIndexOf("}");
    const a = t.indexOf("["), b = t.lastIndexOf("]");
    let cut = t;
    if (a >= 0 && (a < s || s < 0)) cut = t.slice(a, b + 1);
    else if (s >= 0) cut = t.slice(s, e + 1);
    try { return JSON.parse(cut); }
    catch (err) {
      // 잘린 JSON 배열 복구 시도: 마지막 완성된 항목까지만 취함
      const salv = salvageArray(cut);
      if (salv) return salv;
      throw new Error("AI 응답이 잘렸어요(길이 초과). 다시 시도하면 대개 해결돼요.");
    }
  }
  // 잘린 JSON 배열에서 '완성된 최상위 항목'(객체 또는 문자열)만 골라 복구
  function salvageArray(cut) {
    if (cut[0] !== "[") return null;
    const items = []; let depth = 0, inStr = false, esc = false, start = -1;
    for (let i = 1; i < cut.length; i++) {
      const ch = cut[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') { inStr = false; if (depth === 0 && start >= 0) { items.push(cut.slice(start, i + 1)); start = -1; } }
        continue;
      }
      if (ch === '"') { if (depth === 0 && start < 0) start = i; inStr = true; continue; }
      if (ch === "{" || ch === "[") { if (depth === 0 && start < 0) start = i; depth++; continue; }
      if (ch === "}" || ch === "]") { if (depth > 0) { depth--; if (depth === 0 && start >= 0) { items.push(cut.slice(start, i + 1)); start = -1; } } else break; continue; }
    }
    if (!items.length) return null;
    // 뒤에서부터 완성된 만큼만 파싱 (마지막 잘린 항목 버림)
    for (let k = items.length; k > 0; k--) {
      try { return JSON.parse("[" + items.slice(0, k).join(",") + "]"); } catch (e) {}
    }
    return null;
  }

  // ============ 이미지 헬퍼 ============
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function blobToDataURL(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  }

  // ============ KIE.ai 공용 (createTask → recordInfo 폴링) ============
  // 이미지·영상 모두 같은 흐름. maxTries 만큼 2초 간격 폴링. 결과 URL 반환.
  async function kieTask(model, input, maxTries) {
    const key = kieKey();
    if (!key) throw new Error("NO_KIE_KEY");
    const create = await apiFetch(KIE_CREATE, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + key },
      body: JSON.stringify({ model, input })
    });
    if (!create.ok) {
      let d = ""; try { d = (await create.json()).msg; } catch (e) { d = await create.text(); }
      throw new Error(`KIE ${create.status}: ${d}`);
    }
    const cj = await create.json();
    // KIE는 HTTP 200이어도 본문 code로 오류를 알림 (예: 433=포인트 부족)
    if (cj.code && cj.code !== 200) {
      if (cj.code === 433 || /point|insufficient|credit|balance/i.test(cj.msg || "")) throw new Error("KIE_NO_CREDIT");
      throw new Error(`KIE ${cj.code}: ${cj.msg || ""}`);
    }
    const taskId = cj.data?.taskId || cj.data?.id || cj.taskId;
    if (!taskId) throw new Error("KIE: " + (cj.msg || "taskId 없음") + " " + JSON.stringify(cj).slice(0, 100));
    for (let n = 0; n < (maxTries || 90); n++) {
      await sleep(2000);
      const q = await apiFetch(KIE_RECORD + encodeURIComponent(taskId), { headers: { "authorization": "Bearer " + key } });
      if (!q.ok) continue;
      const qj = await q.json();
      const st = qj.data?.state;
      if (st === "success") {
        let rj = qj.data.resultJson;
        if (typeof rj === "string") { try { rj = JSON.parse(rj); } catch (e) { rj = {}; } }
        const url = rj.resultUrls?.[0] || rj.result_urls?.[0] || (Array.isArray(rj.resultUrls) ? rj.resultUrls[0] : null);
        if (!url) throw new Error("KIE: 결과 URL 없음");
        return url;
      }
      if (st === "fail") throw new Error("KIE 실패: " + (qj.data.failMsg || "알 수 없음"));
    }
    throw new Error("KIE 시간 초과. 나중에 다시 시도하세요.");
  }

  // ---- 일관성(캐릭터·화풍) 고정 ----
  function characterAge(c) {
    const saved = parseInt(c?.age, 10);
    if (saved >= 1 && saved <= 100) return saved;
    const source = `${c?.name || ""} ${c?.look || ""}`;
    const explicit = source.match(/(?:age|aged|나이)\s*[:：]?\s*(\d{1,3})/i);
    if (explicit) return Math.max(1, Math.min(100, parseInt(explicit[1], 10)));
    if (/대감|고관대작|정승|판서/.test(source)) return 58;
    if (/과부/.test(source)) return 38;
    if (/노파|노인|할머니|할아버지/.test(source)) return 70;
    return 40;
  }
  // 모든 장면에 같은 주인공 외형을 강제
  function charLockText() {
    const cs = (project.characters || []).filter((c) => c.look);
    if (!cs.length) return "";
    return "Keep these recurring characters IDENTICAL in every image — same face, hairstyle, age and clothing every time: " +
      cs.map((c) => `[${c.name}] exactly ${characterAge(c)} years old; ${c.look}`).join("; ") + ". The visible face and body must match each exact numeric age. ";
  }
  // 화풍 고정 + 실사화 방지 (nano-banana가 실사로 튀는 것 차단)
  function styleLockText() {
    return " . Art style (keep EXACTLY the same across all images): " + (project.style || "flat 2D Korean webtoon manhwa illustration") +
      ". Follow the selected style literally: keep its character proportions, face design, line weight, shading method, palette and background rendering identical across every scene. CRITICAL: hand-drawn 2D only, NOT photorealistic, NOT a real photograph, NOT 3D render, and do not mix in another illustration style. no text, no letters, no watermark.";
  }
  // 캐릭터 참조 이미지(공개 URL만) — nano-banana 이미지 조건부 생성용
  function charRefUrls() {
    return (project.characters || []).map((c) => c.imageUrl).filter((u) => u && /^https?:\/\//.test(u));
  }

  const kieRes = () => localStorage.getItem(LS.kieRes) || "2K"; // 해상도(1K/2K/4K) — 기본 2K로 비용 절약(4K 기본은 비쌈)

  // ---- KIE 이미지 생성 (주인공·화풍 고정 포함) ----
  async function genImage(prompt) {
    const full = charLockText() + prompt + styleLockText() + " 16:9 widescreen cinematic composition.";
    const input = { prompt: full, aspect_ratio: "16:9", resolution: kieRes(), output_format: "png" };
    const refs = charRefUrls();
    if (refs.length) input.image_input = refs.slice(0, 3); // 주인공 참조로 일관성 강화(nano-banana-2 필드: image_input)
    const url = await kieTask(kieModel(), input, 90);
    try { const r = await apiFetch(url); return await blobToDataURL(await r.blob()); }
    catch (e) { return url; } // CORS로 바이트 못 가져오면 URL 그대로(미리보기는 됨, ZIP 제외)
  }

  // ---- 주인공 캐릭터 레퍼런스 이미지 생성 ----
  async function genCharImage(idx) {
    const c = project.characters[idx];
    const prompt = "Character reference sheet, single full-body character, front view, neutral standing pose, clear visible face, plain light background. " +
      c.look + ` CRITICAL AGE LOCK: exactly ${characterAge(c)} years old. Face, skin, hair and body must visibly match age ${characterAge(c)}, never younger or older. ` + styleLockText();
    const url = await kieTask(kieModel(), { prompt, aspect_ratio: "3:4", resolution: kieRes(), output_format: "png" }, 90);
    c.imageUrl = url; // 조건부 생성용 원본 URL 보관
    try { const r = await apiFetch(url); c.imageDataUrl = await blobToDataURL(await r.blob()); }
    catch (e) { c.imageDataUrl = url; }
    return c.imageDataUrl;
  }

  // ---- KIE 인트로 영상 생성 (이미지→영상 또는 텍스트→영상) ----
  async function genVideoKIE(prompt, imageUrl) {
    const input = { prompt: prompt, aspect_ratio: "16:9" };
    // 인트로 이미지가 공개 URL(http)이면 image-to-video 입력으로 넣는다. (data URL은 못 넣음 → 텍스트→영상)
    if (imageUrl && /^https?:\/\//.test(imageUrl)) { input.image_urls = [imageUrl]; input.image_url = imageUrl; }
    const url = await kieTask(kieVideoModel(), input, 180); // 영상은 오래 걸림(최대 6분)
    return url; // 영상은 URL 그대로 사용(미리보기/다운로드)
  }

  // ============ Gemini TTS ============
  async function genTTS(text) {
    const key = geminiKey();
    if (!key) throw new Error("NO_GEMINI_KEY");
    const body = {
      contents: [{ parts: [{ text: text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: geminiVoice() } } }
      }
    };
    const res = await fetch(GEMINI_BASE + TTS_MODEL + ":generateContent?key=" + encodeURIComponent(key), {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
    });
    if (!res.ok) {
      let d = ""; try { d = (await res.json()).error?.message; } catch (e) { d = await res.text(); }
      throw new Error(`Gemini 음성 ${res.status}: ${d}`);
    }
    const j = await res.json();
    const part = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
    if (!part) throw new Error("음성이 생성되지 않았습니다.");
    const mime = part.inlineData.mimeType || "audio/L16;rate=24000";
    const rate = parseInt((mime.match(/rate=(\d+)/) || [])[1] || "24000", 10);
    const wav = pcm16ToWav(base64ToBytes(part.inlineData.data), rate);
    return { dataUrl: "data:audio/wav;base64," + bytesToBase64(wav), durationSec: (wav.length - 44) / 2 / rate };
  }

  // ============ 타입캐스트 TTS ============
  function measureAudio(dataUrl) {
    return new Promise((res) => {
      const a = new Audio();
      a.onloadedmetadata = () => res(isFinite(a.duration) ? a.duration : 0);
      a.onerror = () => res(0);
      a.src = dataUrl;
    });
  }
  async function genTypecast(text) {
    const key = typecastKey();
    if (!key) throw new Error("NO_TYPECAST_KEY");
    if (!typecastVoice()) throw new Error("NO_TYPECAST_VOICE");
    const res = await apiFetch(TYPECAST_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + key },
      body: JSON.stringify({
        voice_id: typecastVoice(),
        text: text,
        model: "ssfm-v30",
        language: project.lang === "ja" ? "jpn" : "kor",
        output: { audio_format: "wav" }
      })
    });
    if (!res.ok) {
      let d = ""; try { d = JSON.stringify(await res.json()); } catch (e) { d = await res.text(); }
      throw new Error(`Typecast ${res.status}: ${d.slice(0, 120)}`);
    }
    const ct = res.headers.get("content-type") || "";
    let dataUrl;
    if (ct.includes("application/json")) {
      const j = await res.json();
      const b64 = j.audio || j.audio_base64 || j.data;
      const url = j.audio_url || j.url;
      if (b64) dataUrl = "data:audio/wav;base64," + b64;
      else if (url) { const r = await fetch(url); dataUrl = await blobToDataURL(await r.blob()); }
      else throw new Error("Typecast: 오디오를 찾을 수 없음");
    } else {
      dataUrl = await blobToDataURL(await res.blob());
    }
    const dur = (await measureAudio(dataUrl)) || estDur(text);
    return { dataUrl, durationSec: dur };
  }

  async function loadTypecastVoices() {
    const key = ($("#prodTypecastKey").value || typecastKey()).trim();
    if (!key) { toast("타입캐스트 API 키를 먼저 넣어주세요"); return; }
    const btn = $("#prodTcLoadVoices"); const sel = $("#prodTcVoiceSelect");
    if (btn) { btn.disabled = true; btn.textContent = "불러오는 중…"; }
    try {
      let data = null;
      for (const url of ["https://api.typecast.ai/v1/voices", "https://api.typecast.ai/v2/voices"]) {
        try {
          const r = await apiFetch(url, { headers: { "authorization": "Bearer " + key } });
          if (r.ok) { data = await r.json(); break; }
        } catch (e) {}
      }
      if (!data) throw new Error("목소리 목록을 불러오지 못했어요(CORS/키 확인).");
      const arr = Array.isArray(data) ? data : (data.voices || data.result || data.data || []);
      if (!arr.length) throw new Error("목소리가 없습니다.");
      sel.innerHTML = "";
      arr.forEach((v) => {
        const id = v.voice_id || v.id || v.actor_id || v.voiceId;
        const name = v.name || v.voice_name || v.display_name || v.title || id;
        const lang = v.language || v.lang || (Array.isArray(v.languages) ? v.languages.join("/") : "");
        if (!id) return;
        const o = el("option", null, esc(name) + (lang ? ` (${esc(String(lang))})` : ""));
        o.value = id; sel.appendChild(o);
      });
      const cur = typecastVoice();
      if (cur) sel.value = cur;
      toast(arr.length + "개 불러옴 · 아래 '한국어에 넣기/일본어에 넣기'로 지정하세요");
    } catch (e) {
      toast("실패: " + String(e.message).slice(0, 60));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "목소리 불러오기"; }
    }
  }

  // ============ 바이트 헬퍼 ============
  function base64ToBytes(b64) {
    const bin = atob(b64), a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  function bytesToBase64(bytes) {
    let s = ""; const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function pcm16ToWav(pcm, rate) {
    const out = new Uint8Array(44 + pcm.length);
    const dv = new DataView(out.buffer);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, "RIFF"); dv.setUint32(4, 36 + pcm.length, true); ws(8, "WAVE");
    ws(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    ws(36, "data"); dv.setUint32(40, pcm.length, true);
    out.set(pcm, 44);
    return out;
  }

  // ============ Store-only ZIP ============
  const CRC = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function makeZip(files) {  // files: [{name, bytes}]
    const enc = new TextEncoder();
    const chunks = [], central = [];
    let offset = 0;
    files.forEach((f) => {
      const name = enc.encode(f.name);
      const data = f.bytes;
      const crc = crc32(data);
      const lh = new Uint8Array(30 + name.length);
      const dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true);
      dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0, true);
      dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true);
      dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true);
      lh.set(name, 30);
      chunks.push(lh, data);
      const ch = new Uint8Array(46 + name.length);
      const cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
      ch.set(name, 46);
      central.push(ch);
      offset += lh.length + data.length;
    });
    const cd = concat(central);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, cd.length, true); ev.setUint32(16, offset, true);
    return new Blob([concat(chunks), cd, end], { type: "application/zip" });
  }
  function concat(arrs) {
    let len = 0; arrs.forEach((a) => (len += a.length));
    const out = new Uint8Array(len); let o = 0;
    arrs.forEach((a) => { out.set(a, o); o += a.length; });
    return out;
  }
  function download(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ============ SRT ============
  function srtTime(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60), ms = Math.round((sec % 1) * 1000);
    const p = (n, l) => String(n).padStart(l, "0");
    return `${p(h, 2)}:${p(m, 2)}:${p(s, 2)},${p(ms, 3)}`;
  }
  function buildSRT() {
    let t = 0, out = "";
    project.scenes.forEach((s, i) => {
      const dur = s.durationSec || estDur(s.text);
      out += `${i + 1}\n${srtTime(t)} --> ${srtTime(t + dur)}\n${s.text.trim()}\n\n`;
      t += dur;
    });
    return out;
  }
  function estDur(text) { return Math.max(2, Math.round((text || "").replace(/\s/g, "").length / (SCRIPT_CPM / 60))); }

  // ============ 렌더 ============
  function render() {
    migrateOldKoreanStyle(project);
    renderStepper();
    const body = $("#prodBody");
    body.innerHTML = "";
    renderNav();
    keyBar(body);
    const key = STEPS[stepIdx].key;
    ({
      category: renderCategory, topic: renderTopic, script: renderScript,
      prompt: renderPrompt, image: renderImage, thumb: renderThumb, voice: renderVoice,
      edit: renderEdit, export: renderExport
    }[key])(body);
  }

  function keyBar(body) {
    const gemText = textProvider() === "gemini";
    if (gemText ? geminiKey() : claudeKey()) return;
    const textLabel = gemText ? "Google AI 키(대본 무료)" : "Anthropic(Claude) 키";
    const bar = el("div", "keybar");
    const txt = el("div", null, "🔑 시작하려면 API 키가 필요해요 — " + `<b>${textLabel}</b>`);
    bar.appendChild(txt);
    const b = el("button", "btn sm btn-primary", "여기에 API 키 입력하기");
    b.onclick = openKeys;
    bar.appendChild(b);
    body.appendChild(bar);
  }

  function renderStepper() {
    const w = $("#prodStepper"); w.innerHTML = "";
    STEPS.forEach((s, i) => {
      if (i) w.appendChild(el("div", "pstep-line"));
      const st = el("div", "pstep" + (i === stepIdx ? " active" : i < stepIdx ? " done" : ""));
      st.appendChild(el("div", "pstep-dot", i < stepIdx ? "✓" : String(i + 1)));
      st.appendChild(el("div", "pstep-name", s.name));
      // 단계 번호를 눌러서 바로 이동
      st.title = "이 단계로 이동";
      st.style.cursor = busy ? "default" : "pointer";
      if (!busy) st.onclick = () => { if (i !== stepIdx) { stepIdx = i; project.lastStep = STEPS[i].key; saveProject(); render(); } };
      w.appendChild(st);
    });
  }

  function renderNav() {
    const nav = $("#prodNav"); nav.innerHTML = "";
    const back = el("button", "btn sm", "← 뒤로");
    back.disabled = stepIdx === 0 || busy;
    back.onclick = () => { if (stepIdx > 0) { stepIdx--; project.lastStep = STEPS[stepIdx].key; saveProject(); render(); } };
    nav.appendChild(back);
    // 오른쪽 버튼은 각 단계 렌더가 필요 시 추가
    const right = el("div", "editor-buttons");
    right.id = "prodNavRight";
    nav.appendChild(right);
  }
  function navBtn(label, fn, primary) {
    const b = el("button", "btn sm" + (primary ? " btn-primary" : ""), label);
    b.disabled = busy;
    b.onclick = fn;
    $("#prodNavRight").appendChild(b);
    return b;
  }

  function loading(body, note) {
    body.innerHTML = "";
    const w = el("div", "prod-loading");
    w.appendChild(el("div", "spinner"));
    w.appendChild(el("div", "prod-loading-note", note || "생성 중…"));
    body.appendChild(w);
  }
  function showErr(body, msg) {
    const e = el("div", "prod-err", msg);
    body.prepend(e);
  }
  function keyMissingMsg(e) {
    const m = String(e.message);
    if (m.includes("NO_CLAUDE_KEY")) return "⚙ 키 설정에서 <b>Anthropic API 키</b>를 먼저 넣어주세요.";
    if (m.includes("NO_GEMINI_KEY")) return "⚙ 키 설정에서 <b>✍️ 글작성(대본) API</b> 칸에 <b>Google AI 키(AIza…)</b>를 먼저 넣어주세요.";
    if (m.includes("NO_KIE_KEY")) return "⚙ 키 설정에서 <b>KIE.ai 키</b>를 먼저 넣어주세요.";
    // Gemini 모델 사용 불가(404/deprecated)
    if (/Gemini\(대본\)\s*404/.test(m) || /no longer available|is not found|not supported|update your code to use a newer model/.test(m)) {
      return "⚙ <b>Gemini 대본 모델</b>이 지금 계정에서 안 돼요.<br>🔑 API 키 → <b>Gemini 대본 모델</b> 칸에서 <b>gemini-2.0-flash</b>(또는 gemini-flash-latest)로 바꾸고 저장 후 다시 시도하세요. <small>(원본: " + esc(m) + ")</small>";
    }
    // Gemini 인증 오류(잘못된 키/빈 키/키 위치 혼동)
    if (/Gemini\(대본\)\s*(400|401|403)/.test(m) || /invalid authentication|API key not valid|API_KEY_INVALID|Expected OAuth/.test(m)) {
      return "🔑 <b>글작성(대본) Google AI 키가 올바르지 않아요.</b><br>" +
        "① 🔑 API 키 → <b>✍️ 글작성(대본) API</b> 칸에 <b>AIza…</b>로 시작하는 키를 넣었는지 확인하세요(🖼️ 이미지 칸이 아니라 글작성 칸!).<br>" +
        "② 키는 <a href='https://aistudio.google.com/apikey' target='_blank' rel='noopener'>aistudio.google.com/apikey</a>에서 무료로 발급해요(OAuth 클라이언트 ID 아님).<br>" +
        "③ 저장 후 다시 시도하세요. <small>(원본: " + esc(m) + ")</small>";
    }
    if (m.includes("Failed to fetch")) return "네트워크/CORS 오류. 인터넷 연결과 키를 확인하세요. (게시본이 아닌 로컬 파일에서 실행해야 합니다.)";
    return "오류: " + esc(m);
  }
  function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  // 글작성 Google AI 키가 진짜 되는지 즉석 확인
  async function testGeminiKey() {
    const out = $("#prodTestGeminiResult");
    const key = ($("#prodGeminiKey").value || "").trim();
    const set = (msg, ok) => { if (out) { out.innerHTML = msg; out.style.color = ok ? "var(--good)" : "var(--danger)"; } };
    if (!key) { set("❌ 키가 비었어요. AIza…로 시작하는 키를 넣으세요.", false); return; }
    if (/apps\.googleusercontent\.com/.test(key) || key.includes(".apps.")) {
      set("❌ 이건 <b>OAuth 클라이언트 ID</b>예요. 대본용은 <b>AIza…</b> API 키가 필요합니다.", false); return;
    }
    if (!/^AIza/.test(key)) { set("⚠ 보통 <b>AIza</b>로 시작해요. 그래도 테스트해볼게요…", false); }
    else set("⏳ 테스트 중…", true);
    try {
      const res = await fetch(GEMINI_BASE + geminiTextModel() + ":generateContent?key=" + encodeURIComponent(key), {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }], generationConfig: { maxOutputTokens: 5 } })
      });
      if (res.ok) { set("✅ 키 정상! <b>저장</b>을 누른 뒤 대본을 만들 수 있어요.", true); return; }
      let d = ""; try { d = (await res.json()).error?.message || ""; } catch (e) { d = await res.text(); }
      if (res.status === 400 && /API key not valid|API_KEY_INVALID/.test(d)) set("❌ 잘못된 키예요. <a href='https://aistudio.google.com/apikey' target='_blank' rel='noopener'>aistudio.google.com/apikey</a>에서 새로 발급하세요.", false);
      else if (/SERVICE_DISABLED|has not been used|is disabled/.test(d)) set("❌ 이 키 프로젝트에서 <b>Generative Language API</b>가 꺼져 있어요. 콘솔에서 사용 설정 후 다시 시도.", false);
      else if (res.status === 401 || /OAuth|invalid authentication/.test(d)) set("❌ 키가 인식되지 않아요(OAuth 오류). <b>AIza…</b> API 키가 맞는지 확인하세요(로그인 ID 아님).", false);
      else set("❌ 오류 " + res.status + ": " + esc(d.slice(0, 90)), false);
    } catch (e) { set("❌ 네트워크 오류: " + esc(String(e.message).slice(0, 60)), false); }
  }

  // 이 키에서 실제로 대본 생성(generateContent) 가능한 모델 목록 불러오기
  async function loadGeminiModels() {
    const out = $("#prodGeminiModelsResult");
    const key = ($("#prodGeminiKey").value || "").trim();
    const set = (msg, ok) => { if (out) { out.innerHTML = msg; out.style.color = ok ? "var(--good)" : "var(--danger)"; } };
    if (!key) { set("❌ 먼저 Google AI 키를 넣으세요.", false); return; }
    set("⏳ 불러오는 중…", true);
    try {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=" + encodeURIComponent(key));
      if (!res.ok) {
        let d = ""; try { d = (await res.json()).error?.message || ""; } catch (e) { d = await res.text(); }
        set("❌ 목록 실패: " + esc(d.slice(0, 90)), false); return;
      }
      const j = await res.json();
      const models = (j.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => (m.name || "").replace(/^models\//, ""))
        .filter((n) => /gemini/.test(n) && !/embedding|aqa|imagen|tts|image|vision-latest/.test(n));
      if (!models.length) { set("❌ 사용 가능한 대본 모델이 없어요. 키/프로젝트를 확인하세요.", false); return; }
      // 데이터리스트 갱신
      const dl = $("#geminiTextModelList");
      if (dl) { dl.innerHTML = ""; models.forEach((n) => { const o = el("option"); o.value = n; dl.appendChild(o); }); }
      // 좋은 기본값 자동 선택: flash-latest > 아무 flash > 첫 번째
      const pick = models.find((n) => /flash-latest/.test(n)) || models.find((n) => /flash/.test(n) && !/lite/.test(n)) || models.find((n) => /flash/.test(n)) || models[0];
      $("#prodGeminiTextModel").value = pick;
      set(`✅ ${models.length}개 발견! <b>${esc(pick)}</b> 선택됨. <b>저장</b> 누르세요.`, true);
    } catch (e) { set("❌ 네트워크 오류: " + esc(String(e.message).slice(0, 60)), false); }
  }

  // ---- 1. 카테고리 ----
  function renderCategory(body) {
    body.appendChild(el("h2", "prod-h", "어떤 이야기를 만들까요?"));
    body.appendChild(el("p", "prod-sub", "카테고리를 고르면 <b>유튜브에서 잘 되는 주제 10개</b>를 추천해 드려요."));
    const grid = el("div", "cat-grid");
    CATEGORIES.forEach((c) => {
      const card = el("div", "cat-card" + (project.category === c.key ? " sel" : ""));
      card.appendChild(el("div", "cat-emoji", c.emoji));
      card.appendChild(el("div", "cat-name", c.key));
      card.appendChild(el("div", "cat-desc", c.desc));
      card.onclick = () => {
        project.category = c.key;
        document.querySelectorAll(".cat-card").forEach((x) => x.classList.remove("sel"));
        card.classList.add("sel");
      };
      grid.appendChild(card);
    });
    body.appendChild(grid);
    navBtn("주제 10개 추천 받기 →", loadTopics, true);
  }

  // 최근 30일 실제 인기 영상 표본 (YouTube 키 있을 때) — 확률 추정 근거
  async function fetchTrendingSample(lang) {
    const key = localStorage.getItem("yeti_yt_key");
    if (!key) return null;
    const region = lang === "ja" ? "JP" : "KR";
    const q = lang === "ja" ? "怪談 昔話" : "야담 옛날이야기 사연";
    const after = new Date(Date.now() - 30 * 86400000).toISOString();
    try {
      const s = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount&publishedAfter=${after}&q=${encodeURIComponent(q)}&regionCode=${region}&maxResults=12&key=${key}`);
      if (!s.ok) return null;
      const ids = ((await s.json()).items || []).map((x) => x.id.videoId).filter(Boolean).join(",");
      if (!ids) return null;
      const v = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids}&key=${key}`);
      if (!v.ok) return null;
      return ((await v.json()).items || [])
        .map((it) => ({ title: it.snippet.title, views: Number(it.statistics.viewCount || 0) }))
        .sort((a, b) => b.views - a.views).slice(0, 10);
    } catch (e) { return null; }
  }

  async function loadTopics() {
    if (!project.category) { toast("카테고리를 먼저 고르세요"); return; }
    const body = $("#prodBody");
    busy = true; loading(body, "실제 인기 영상을 참고해 주제 10개를 뽑는 중…"); renderNav();
    try {
      const trend = await fetchTrendingSample(project.lang);
      const sys = `너는 ${LANG[project.lang].audience} 채널의 '클릭률 극대화' 제목 카피라이터다. 시청자가 스크롤하다 멈추고 저절로 누르게 만드는 후킹 제목을 잘 뽑는다. 반드시 유효한 JSON만 출력한다.`;
      const usr =
`카테고리: "${project.category}"

이 카테고리로, 시니어 시청자가 <b>도저히 안 누르고 못 배기는</b> 초강력 후킹 제목 10개를 뽑아줘.
후킹 원칙(반드시 반영):
- 첫머리에 충격·반전·금기의 냄새를 풍긴다(예: 팔려간, 버려진, 소름, 죽은 줄 알았던, 감히).
- 구체적 숫자·금액·관계 대비를 넣는다(100냥, 10년 후, 셋째 며느리 vs 맏며느리).
- 결말·정체는 절대 노출하지 말고, "그 아이의 정체는?", "그날 밤 벌어진 일" 처럼 궁금증에서 끊는다.
- 감정 버튼(억울함·통쾌함·오싹함·애틋함)을 하나 확실히 누른다.
- 흔한 클리셰 반복 금지, 10개 소재를 서로 다르게 분산.
아래 검증된 제목 패턴 골격을 활용(결말·정체 노출 금지):
${TITLE_PATTERNS}
★ 제목 길이 제한(매우 중요): 제목은 <b>썸네일 2줄에 다 들어가야</b> 한다. 짧고 강하게 — 공백 포함 <b>16~24자</b>, 절대 26자 넘기지 말 것. 두 덩어리로 끊어 읽히게(예: "죽은 며느리가 / 10년 만에 돌아왔다"). 길게 늘어지는 제목 금지.
- thumb: 위 제목을 썸네일용 <b>2줄</b>로 나눈 배열. 각 줄 6~12자, 큰 글씨로 시원하게 읽히게.
각 주제는 아래 JSON 배열 형식으로만:
[
  {"title":"짧고 강한 제목(16~24자, 썸네일 2줄에 들어감)","thumb":["썸네일 1줄","썸네일 2줄"],"hook":"왜 끌리는지 한 줄 훅","why":"떡상 포인트 한 줄","score":85},
  ... (정확히 10개)
]
${trend && trend.length ? "★ 최근 30일 실제로 조회수가 높았던 영상들(근거로 삼아라):\n" + trend.map((t) => `- ${t.title} (조회 ${t.views.toLocaleString()})`).join("\n") + "\n위 실제 사례와 소재·후킹이 얼마나 닮았는지를 근거로 score를 매겨라. 실제 대박 영상과 매우 유사하면 높게, 동떨어지면 낮게.\n" : ""}score는 '떡상(대박) 확률' 추정 정수(%)다. 40~95 사이에서 현실적으로 분산(전부 90+ 금지). 클릭률·소재 신선함·감정 강도·위 실제 데이터와의 유사도를 종합.${langDirective()}`;
      const arr = await claudeJSON(sys, usr, 8000);
      project.topics = (Array.isArray(arr) ? arr : [])
        .filter((t) => t && typeof t === "object" && (t.title || "").trim())
        .slice(0, 10)
        .map((t) => ({ ...t, score: Math.max(0, Math.min(100, parseInt(t.score, 10) || 70)) }))
        .sort((a, b) => b.score - a.score);
      if (!project.topics.length) throw new Error("주제를 만들지 못했어요. 다시 시도해 주세요.");
      project.topicIdx = -1;
      busy = false; goStep("topic");
    } catch (e) {
      busy = false; renderCategory(body); showErr(body, keyMissingMsg(e));
    } finally { busy = false; }
  }

  // ---- 2. 주제 선택 ----
  function renderTopic(body) {
    body.appendChild(el("h2", "prod-h", "마음에 드는 주제를 고르세요"));
    const grounded = !!localStorage.getItem("yeti_yt_key");
    body.appendChild(el("p", "prod-sub", `카테고리: <b>${esc(project.category)}</b> · 확률순 정렬. 🔥 <b>떡상 확률</b>은 ${grounded ? "최근 30일 <b>실제 인기 영상 데이터</b>를 반영한" : "AI"} 추정치예요${grounded ? "" : " (유튜브 키를 넣으면 실제 데이터 반영)"}.`));
    const list = el("div", "topic-list");
    project.topics.forEach((t, i) => {
      const c = el("div", "topic-card" + (project.topicIdx === i ? " sel" : ""));
      if (typeof t.score === "number") {
        const tier = t.score >= 85 ? "hot" : t.score >= 70 ? "mid" : "low";
        c.appendChild(el("div", "topic-score " + tier, `🔥 떡상 ${t.score}%`));
      }
      c.appendChild(el("div", "topic-rank", `${i + 1}위`));
      c.appendChild(el("div", "topic-title", esc(t.title || "")));
      if (Array.isArray(t.thumb) && t.thumb.length) {
        const th = el("div", "topic-thumb2");
        th.innerHTML = "🖼 썸네일 2줄: " + t.thumb.slice(0, 2).map((x) => `<b>${esc(x)}</b>`).join(" · ");
        c.appendChild(th);
      }
      if (t.hook) c.appendChild(el("div", "topic-hook", esc(t.hook)));
      if (t.why) c.appendChild(el("div", "topic-why", "📈 " + esc(t.why)));
      c.onclick = () => {
        project.topicIdx = i;
        document.querySelectorAll(".topic-card").forEach((x) => x.classList.remove("sel"));
        c.classList.add("sel");
      };
      list.appendChild(c);
    });
    body.appendChild(list);
    navBtn("↻ 다시 추천", loadTopics);
    navBtn("이 주제로 대본 만들기 →", loadScript, true);
  }

  // 대본: 1시간 30분~2시간(약 35,000~40,000자). 뼈대 → 장면별 긴 나레이션 배치 생성.
  const SCENE_COUNT = 40;   // 장면 수 (이미지 컷 수) — 40컷 고정
  const BATCH = 4;          // 배치당 장면 수
  const SCRIPT_CPM = 300;   // 낭독 분당 글자수(추정) — 30,000자 ≈ 100분

  async function loadScript() {
    if (project.topicIdx < 0) { toast("주제를 하나 고르세요"); return; }
    const body = $("#prodBody");
    const ja = project.lang === "ja";
    const topic = project.topics[project.topicIdx];
    busy = true; loading(body, "이야기 뼈대(제목·설명·장면 흐름)를 잡는 중…"); renderNav();
    try {
      // ── 1단계: 패키지 + 장면 개요 ──
      const sysO = `너는 ${LANG[project.lang].audience} 대본 기획자다. 결말·정체는 제목/인트로에서 노출하지 않는다. 반드시 유효한 JSON만 출력.`;
      const usrO =
`카테고리: ${project.category}
선택한 주제: ${topic.title}
훅: ${topic.hook || ""}
${langDirective()}
1시간 30분~2시간짜리 긴 영상의 뼈대를 만들어줘. 7단계 골격(발단→일상·갈등씨앗→사건→시련(가장 길게, 에피소드 여럿)→위기→반전·해결→마무리)을 ${SCENE_COUNT}개 장면으로 촘촘히 나눠라.
제목은 아래 패턴 중 하나(결말 노출 금지): ${TITLE_PATTERNS}
★ 제목은 <b>썸네일 2줄에 다 들어가게</b> 짧고 강하게: 공백 포함 16~24자(최대 26자). 후킹·떡상 지향, 결말 노출 금지.
★ A/B 테스트용: 서로 <b>각도가 다른</b> 후킹 제목 2개(A/B)와 태그 2개(A/B)를 만들어라. B는 A와 다른 감정버튼·다른 표현으로.
JSON만:
{
 "title":"제목 A (16~24자, 썸네일 2줄, 결말 노출 금지)",
 "titleB":"제목 B (A와 다른 각도의 후킹, 16~24자)",
 "titleTag":"제목 옆 태그 A (2~4개, ${ja ? "#日本昔話 등" : "#야담 #실화 등"})",
 "titleTagB":"제목 옆 태그 B (A와 다른 조합)",
 "description":"유튜브 설명란 (4~6문장 + '${channelName()}' 채널 구독 유도)",
 "tags":["태그","8~12개"],
 "scenes":[ {"beat":"장면1 한 줄 요약(=인트로 도입)","isIntro":true}, {"beat":"장면2 한 줄 요약","isIntro":false} ]
}
scenes는 정확히 ${SCENE_COUNT}개. 각 beat는 한 컷 이미지로 그릴 수 있는 한 장면. 전체가 이어지는 완결된 이야기.`;
      const pkg = await claudeJSON(sysO, usrO, 6000);
      project.title = pkg.title || topic.title;
      project.titleB = pkg.titleB || "";
      project.titleTag = pkg.titleTag || "";
      project.titleTagB = pkg.titleTagB || "";
      project.description = pkg.description || "";
      project.tags = Array.isArray(pkg.tags) ? pkg.tags : [];
      let beats = (pkg.scenes || []).map((s) => ({ beat: s.beat || "", isIntro: !!s.isIntro }));
      if (!beats.length) throw new Error("장면 개요를 만들지 못했어요.");
      if (!beats.some((b) => b.isIntro)) beats[0].isIntro = true;
      project.scenes = beats.map((b, i) => ({
        text: "", beat: b.beat, isIntro: b.isIntro,
        imagePrompt: "", imageDataUrl: "", audioDataUrl: "", durationSec: 0,
        zoom: b.isIntro ? "in" : (i % 2 ? "out" : "in")
      }));
      saveProject();

      // ── 2단계: 장면별 긴 나레이션 배치 생성 ──
      const outline = beats.map((b, i) => `${i + 1}. ${b.beat}`).join("\n");
      const sysN = `너는 ${LANG[project.lang].audience} 낭독 대본 작가다. 규칙:
- '~습니다'와 '~지요'를 섞고 같은 어미를 3문장 이상 연속 금지.${ja ? " (일본어면 です/ます체)" : ""}
- 요약 대신 인물 대사를 자주. 수사 질문('그런데 이게 웬일입니까?')·전환 문장('그때였습니다')으로 리듬.
- 문장은 짧게. ${ja ? "쉬운 일본어." : "한자 없이 순 한글."} 결말·정체는 인트로에서 노출 금지.
- 반드시 JSON 배열(문자열들)만 출력. 항목 수는 요청한 장면 수와 정확히 일치.`;
      const n = project.scenes.length;
      for (let b = 0; b < n; b += BATCH) {
        const end = Math.min(b + BATCH, n);
        loading(body, `장면 대본 작성 중… (${end}/${n})  ⏳ 길이가 길어 시간이 걸려요`);
        const prev = b > 0 ? project.scenes[b - 1].text.slice(-200) : "";
        const targets = [];
        for (let i = b; i < end; i++) targets.push(`${i + 1}${project.scenes[i].isIntro ? "(인트로)" : ""}: ${project.scenes[i].beat}`);
        const usrN =
`제목: ${project.title}
전체 장면 개요:
${outline}

${prev ? "직전 장면 마지막 부분(자연스럽게 이어서):\n" + prev + "\n\n" : ""}지금은 아래 장면들의 '완성된 낭독 대본'만 순서대로 써라.
★ 길이 필수(매우 중요): 인트로 외 각 장면은 <b>최소 1000자, 목표 1200~1500자</b>. 짧으면 안 된다. 대사·심리묘사·상황묘사·회상을 충분히 넣어 분량을 채워라(40장면 합계 30,000~40,000자 = 1시간 30분~2시간).
${targets.map((t) => "- " + t).join("\n")}
${b === 0 ? `\n첫 장면(인트로)은 6문장 포맷: 파격 대사→압축 상황(결말 금지)→'그런데…' 궁금증→마지막에 "${ja ? "구독 유도 문구를 일본어로" : CTA_KO}". (인트로만 250자 내외로 짧게)` : ""}
${end === n ? `\n마지막 장면은 이 이야기에 맞는 주제 한 문장 + 고정 마무리 멘트: "${ja ? OUTRO_KO + " (일본어로)" : OUTRO_KO}"` : ""}
${langDirective()}
JSON 배열만, 정확히 ${end - b}개: ["장면 대본", ...]`;
        try {
          const arr = await claudeJSON(sysN, usrN, 12000);
          (arr || []).forEach((t, k) => { if (project.scenes[b + k]) project.scenes[b + k].text = String(t); });
        } catch (e) {
          for (let i = b; i < end; i++) if (!project.scenes[i].text) project.scenes[i].text = "(이 장면 생성 실패 — 편집에서 직접 쓰거나 다시 시도)";
        }
        saveProject();
      }
      const total = project.scenes.reduce((a, s) => a + (s.text || "").replace(/\s/g, "").length, 0);
      busy = false; goStep("script");
      toast(`대본 완성 · 약 ${total.toLocaleString()}자 (~${Math.round(total / SCRIPT_CPM)}분)`);
    } catch (e) {
      busy = false; renderTopic(body); showErr(body, keyMissingMsg(e));
    } finally { busy = false; }
  }

  // ---- 3. 대본·정보 편집 ----
  function field(label, value, multiline, onInput) {
    const f = el("div", "pkg-field");
    const lab = el("div", "pkg-label");
    lab.appendChild(el("span", null, label));
    const copy = el("button", "copy-mini", "복사");
    copy.onclick = () => { navigator.clipboard.writeText(value()); copy.textContent = "복사됨"; setTimeout(() => (copy.textContent = "복사"), 1000); };
    lab.appendChild(copy);
    f.appendChild(lab);
    const inp = multiline ? el("textarea") : el("input");
    if (!multiline) inp.type = "text";
    inp.value = value();
    inp.oninput = () => onInput(inp.value);
    f.appendChild(inp);
    return f;
  }

  function renderScript(body) {
    body.appendChild(el("h2", "prod-h", "대본과 유튜브 정보"));
    body.appendChild(el("p", "prod-sub", "자유롭게 <b>고쳐 쓸 수</b> 있어요. 다 됐으면 다음 단계로 넘어가세요."));
    const pkg = el("div", "pkg");
    const abNote = el("p", "prod-sub");
    abNote.style.margin = "0 0 6px";
    abNote.innerHTML = "🅰️🅱️ 제목·태그를 <b>A/B 두 개</b>로 준비했어요. 유튜브 <b>제목 실험(A/B 테스트)</b>에 A와 B를 각각 넣어 어느 쪽이 더 터지는지 비교하세요.";
    pkg.appendChild(abNote);
    pkg.appendChild(field("제목 A", () => project.title, false, (v) => { project.title = v; saveDebounced(); }));
    pkg.appendChild(field("제목 B", () => project.titleB || "", false, (v) => { project.titleB = v; saveDebounced(); }));
    pkg.appendChild(field("제목 옆 태그 A", () => project.titleTag, false, (v) => { project.titleTag = v; saveDebounced(); }));
    pkg.appendChild(field("제목 옆 태그 B", () => project.titleTagB || "", false, (v) => { project.titleTagB = v; saveDebounced(); }));
    pkg.appendChild(field("설명", () => project.description, true, (v) => { project.description = v; saveDebounced(); }));
    pkg.appendChild(field("설명 아래 태그 (쉼표로 구분)", () => project.tags.join(", "), true, (v) => { project.tags = v.split(",").map((x) => x.trim()).filter(Boolean); saveDebounced(); }));

    const totalChars = project.scenes.reduce((a, s) => a + (s.text || "").replace(/\s/g, "").length, 0);
    const mm = Math.round(totalChars / SCRIPT_CPM); // 낭독 분당 글자수 기준
    const lenTier = totalChars >= 30000 ? "good" : totalChars >= 24000 ? "mid" : "low";
    const lenNote = el("div", "pkg-label");
    lenNote.innerHTML = `<span>전체 대본 · <b class="len-${lenTier}">약 ${mm}분</b> (${totalChars.toLocaleString("ko")}자) — ${totalChars >= 27000 ? "1시간 30분↑ 목표 도달" : "1시간 30분엔 30,000자↑ 필요 (아래 '더 길게'로 늘리세요)"}</span>`;
    pkg.appendChild(lenNote);

    // 칸 나누지 않고 하나의 대본으로 표시 (장면은 빈 줄로 구분되어 내부 관리)
    const ta = el("textarea", "script-all");
    ta.value = project.scenes.map((s) => s.text).join("\n\n");
    ta.style.minHeight = "420px"; ta.style.lineHeight = "1.7";
    ta.oninput = () => { syncScriptText(ta.value); saveDebounced(); };
    pkg.appendChild(ta);
    body.appendChild(pkg);

    navBtn("📋 전체 대본 복사", () => { navigator.clipboard.writeText(project.scenes.map((s) => s.text).join("\n\n")); toast("전체 대본을 복사했어요"); });
    navBtn("⬆ 더 길게 늘리기", expandScript);
    navBtn("이미지 프롬프트 만들기 →", loadPrompts, true);
  }

  // 하나의 텍스트를 빈 줄 기준으로 나눠 40개 장면에 다시 배분(장면 수는 유지)
  function syncScriptText(full) {
    const blocks = String(full).split(/\n{2,}/).map((x) => x.trim());
    const n = project.scenes.length;
    if (blocks.length === n) { project.scenes.forEach((s, i) => (s.text = blocks[i])); return; }
    for (let i = 0; i < n; i++) {
      if (i < n - 1) project.scenes[i].text = blocks[i] || "";
      else project.scenes[i].text = blocks.slice(i).join("\n\n"); // 마지막 장면에 나머지 전부
    }
  }

  // 기존 대본을 새 이야기 없이 더 길게(풍부하게) 늘리기
  async function expandScript() {
    if (!project.scenes.length) { toast("먼저 대본을 만들어주세요"); return; }
    const body = $("#prodBody");
    busy = true; loading(body, "대본을 더 길게 늘리는 중…"); renderNav();
    try {
      const n = project.scenes.length;
      const sysE = `너는 ${LANG[project.lang].audience} 낭독 대본을 '더 길고 풍부하게' 늘리는 작가다. 원래 내용·순서·결말은 그대로 두고, 대사·심리묘사·상황묘사·회상을 더해 각 장면을 1.5~2배로 늘린다. 반드시 JSON 배열(문자열)만, 요청 개수와 정확히 일치.`;
      for (let b = 0; b < n; b += BATCH) {
        const end = Math.min(b + BATCH, n);
        loading(body, `대본 늘리는 중… (${end}/${n})`);
        const items = [];
        for (let i = b; i < end; i++) items.push(`[장면 ${i + 1}${project.scenes[i].isIntro ? " · 인트로: 짧게 유지" : ""}]\n${project.scenes[i].text}`);
        const usrE =
`아래 장면 대본들을 각각 더 길게 늘려줘. 규칙:
- 새로운 사건·인물 추가 금지. 기존 내용을 대사·심리·상황 묘사로 풍부하게만.
- 인트로 외 각 장면 목표 1200~1500자.  인트로는 지금 길이 유지.
- 어미 반복 금지, 자연스러운 낭독체.${langDirective()}
JSON 배열만, 정확히 ${end - b}개: ["늘린 장면 대본", ...]

${items.join("\n\n")}`;
        try {
          const arr = await claudeJSON(sysE, usrE, 12000);
          (Array.isArray(arr) ? arr : []).forEach((t, k) => { if (project.scenes[b + k] && String(t).trim()) project.scenes[b + k].text = String(t); });
        } catch (e) {}
        saveProject();
      }
      busy = false; render();
      const total = project.scenes.reduce((a, s) => a + (s.text || "").replace(/\s/g, "").length, 0);
      toast(`대본 늘리기 완료 · 약 ${total.toLocaleString()}자 (~${Math.round(total / SCRIPT_CPM)}분)`);
    } catch (e) {
      busy = false; render(); showErr($("#prodBody"), keyMissingMsg(e));
    } finally { busy = false; }
  }

  // ---- 4. 이미지 프롬프트 (배치로 나눠서 — 응답 잘림 방지) ----
  async function loadPrompts() {
    const body = $("#prodBody");
    busy = true; loading(body, "각 장면의 이미지 프롬프트를 만드는 중…"); renderNav();
    try {
      const n = project.scenes.length;
      const PB = 5; // 한 번에 5장면씩 → 잘림 위험 최소화
      const charBlock = (project.characters || []).filter((c) => c.look).length
        ? "\n고정 주인공(등장할 때 항상 이 외형·숫자 나이 그대로 묘사):\n" + project.characters.filter((c) => c.look).map((c) => `- ${c.name}, 정확히 ${characterAge(c)}세: ${c.look}`).join("\n") + "\n"
        : "";
      const sys = "너는 대본을 나노 바나나(이미지 생성)용 영어 프롬프트로 바꾸는 전문가다. 각 장면을 한 컷으로 그릴 수 있게 시각적으로 구체화한다. 반드시 유효한 JSON 배열만 출력.";
      const mkUsr = (scenes) =>
`화풍(STYLE_TAIL): ${project.style}
인물 기본: ${LANG[project.lang].setting}${charBlock}

아래 ${scenes.length}개 장면을 각각 위 화풍으로 그릴 영어 이미지 프롬프트로 만들어줘. 규칙:
- 각 프롬프트는 완결된 영어 문장 2~4개. 콤마 키워드 나열 금지.
- 인물은 ${LANG[project.lang].setting} 를 명시하고, 같은 인물은 장면마다 같은 복식·머리로 일관되게.
- '과부'는 혼인 상태일 뿐 노인을 뜻하지 않는다. 노인 단서가 없으면 30~45세로 그리고 백발·깊은 주름·노파 외모를 금지한다.
- '대감·고관대작·정승·판서'는 젊다는 단서가 없으면 50~65세의 중후하고 권위 있는 남성으로 그리고 청년·소년 얼굴을 금지한다.
- 모든 인물의 숫자 나이와 얼굴 연령을 일치시키고, 신분이나 호칭만으로 임의로 젊거나 늙게 바꾸지 않는다.
- 장면마다 샷을 다르게. '정면에서 두 손 모은' 반복 금지.
- 배경은 실제 로케이션. 회색 스튜디오 배경 금지.
- 각 프롬프트 끝에 반드시: "no text, no letters, no words, no modern objects. ${project.style}"
JSON 배열만, 정확히 ${scenes.length}개: ["english image prompt", ...]

장면들:
${scenes.join("\n")}`;
      let failed = 0;
      for (let b = 0; b < n; b += PB) {
        const end = Math.min(b + PB, n);
        loading(body, `이미지 프롬프트 만드는 중… (${b + 1}~${end} / ${n})`);
        const scenes = [];
        for (let i = b; i < end; i++) scenes.push(`${i + 1}${project.scenes[i].isIntro ? "(인트로)" : ""}: ${(project.scenes[i].text || "").slice(0, 800)}`);
        // 한 묶음 실패해도 전체 멈추지 않게 — 두 번 시도, 그래도 안 되면 건너뜀
        let arr = null;
        for (let attempt = 0; attempt < 2 && !arr; attempt++) {
          try { arr = await claudeJSON(sys, mkUsr(scenes), 8000); } catch (e) { arr = null; }
        }
        if (Array.isArray(arr)) arr.forEach((p, k) => { if (project.scenes[b + k] && String(p).trim()) project.scenes[b + k].imagePrompt = String(p); });
        else failed += (end - b);
        saveProject();
      }
      busy = false; goStep("prompt");
      if (failed) toast(`${failed}개 장면은 프롬프트 생성 실패 — 이미지 단계에서 대본으로 자동 대체돼요. '↻ 다시 만들기'로 채울 수 있어요.`);
    } catch (e) {
      busy = false; render(); showErr($("#prodBody"), keyMissingMsg(e));
    } finally { busy = false; }
  }

  function renderPrompt(body) {
    body.appendChild(el("h2", "prod-h", "이미지 프롬프트"));
    body.appendChild(el("p", "prod-sub", project.lang === "ja" ? "일본 민담용 애니 셀화풍을 선택하세요." : "미리보기 이미지를 보고 한국 시대극 그림체를 선택하세요. 추천 기본값은 강렬한 웹툰입니다."));

    body.appendChild(el("div", "field-label", "그림체 고르기"));
    const grid = el("div", "style-list");
    stylePresetsFor(project.lang).forEach((preset) => {
      const chip = el("button", "style-chip" + (project.style === preset.tail ? " sel" : ""));
      if (preset.preview) {
        const preview = el("div", "style-preview"); preview.style.backgroundImage = `url("${preset.preview}")`;
        chip.appendChild(preview);
      }
      chip.insertAdjacentHTML("beforeend", `<b>${esc(preset.name)}</b><span>${esc(preset.desc)}</span>`);
      chip.onclick = () => { project.style = preset.tail; saveDebounced(); render(); };
      grid.appendChild(chip);
    });
    body.appendChild(grid);

    const styleF = field("직접 다듬기 (STYLE_TAIL · 영어)", () => project.style, true, (v) => { project.style = v; saveDebounced(); });
    styleF.style.marginTop = "14px";
    body.appendChild(styleF);
    const pkg = el("div", "pkg");
    project.scenes.forEach((s, i) => {
      const c = el("div", "scene");
      c.appendChild(el("div", "scene-no", `장면 ${i + 1}${s.isIntro ? " · 인트로" : ""}`));
      const ta = el("textarea"); ta.value = s.imagePrompt; ta.oninput = () => { s.imagePrompt = ta.value; saveDebounced(); };
      c.appendChild(ta);
      pkg.appendChild(c);
    });
    body.appendChild(pkg);
    navBtn("↻ 프롬프트 다시 만들기", loadPrompts);
    navBtn("이미지 만들기 →", () => { goStep("image"); }, true);
  }

  // ---- 5. 이미지 ----
  function renderImage(body) {
    body.appendChild(el("h2", "prod-h", "이미지 생성"));
    const n = project.scenes.length;
    const total = imgCostWon() * n;
    body.appendChild(el("p", "prod-sub", `내 <b>이미지 생성 API</b>로 앱에서 바로 만들거나(유료), 무료 사이트에서 만든 그림을 <b>올리기</b>로 넣어도 돼요.`));

    const cost = el("div", "keybar");
    cost.style.marginBottom = "18px";
    cost.innerHTML = `💰 예상 비용 — 이미지 1장 ${imgCostText()}. 이 영상은 장면 <b>${n}개</b> → 전부 생성 시 <b>약 ${total.toLocaleString("ko")}원</b>. <br>🆓 아끼려면: <b>드롭샷</b>·<b>Bing 이미지 크리에이터</b>·<b>구글 Gemini(무료 사용량)</b> 등에서 만들어 <b>이미지 올리기</b>로 넣으세요.`;
    body.appendChild(cost);

    // 주인공 고정 섹션 (장면 생성 전에 먼저)
    body.appendChild(characterSection());

    const pkg = el("div", "pkg");
    project.scenes.forEach((s, i) => pkg.appendChild(sceneImageCard(s, i)));
    body.appendChild(pkg);
    navBtn("전체 생성 (없는 것만 · 유료)", genAllImages);
    navBtn("프롬프트 전체 복사", copyAllImagePrompts);
    navBtn("이미지 전체 다운로드", downloadImagesZip);
    navBtn("썸네일 만들기 →", () => { goStep("thumb"); }, true);
  }

  function copyAllImagePrompts() {
    const txt = project.scenes.map((s, i) => `[장면 ${i + 1}${s.isIntro ? " · 인트로" : ""}]\n${s.imagePrompt || s.text}`).join("\n\n");
    navigator.clipboard.writeText(txt);
    toast("이미지 프롬프트 전체를 복사했어요");
  }

  // ---- 주인공 캐릭터(고정) 섹션 ----
  function characterSection() {
    const wrap = el("div", "char-box");
    wrap.appendChild(el("div", "prod-h2", "🧍 주인공 캐릭터 (고정)"));
    wrap.appendChild(el("p", "prod-sub", "먼저 <b>주인공</b>을 정해두면, 아래 장면 이미지를 만들 때 <b>같은 얼굴·복장</b>으로 고정돼요. 그림체도 자동으로 고정(실사화 방지)됩니다."));

    const chars = project.characters || [];
    if (!chars.length) {
      const b = el("button", "btn btn-primary sm", "✨ 대본에서 주인공 뽑기");
      b.onclick = loadCharacters;
      wrap.appendChild(b);
      return wrap;
    }
    const grid = el("div", "pkg");
    chars.forEach((c, i) => grid.appendChild(charCard(c, i)));
    wrap.appendChild(grid);
    const re = el("button", "btn sm", "↻ 주인공 다시 뽑기");
    re.onclick = loadCharacters;
    wrap.appendChild(re);
    const note = el("p", "prod-sub");
    note.style.marginTop = "8px";
    note.innerHTML = charRefUrls().length
      ? "✅ 주인공 참조 이미지가 있어서 장면마다 <b>더 강하게 고정</b>됩니다."
      : "💡 주인공 이미지를 <b>생성</b>해 두면(또는 올리면) 장면 일관성이 더 좋아져요. (없어도 외형 설명으로 고정됩니다)";
    wrap.appendChild(note);
    return wrap;
  }

  function charCard(c, i) {
    const card = el("div", "scene");
    card.appendChild(el("div", "scene-no", `주인공 ${i + 1}`));
    const row = el("div", "scene-img-row");
    const box = el("div", "scene-img"); box.id = "char-" + i;
    if (c.imageDataUrl) { const im = el("img"); im.src = c.imageDataUrl; box.appendChild(im); }
    else box.textContent = "이미지 없음";
    row.appendChild(box);
    const right = el("div", "scene-prompt");
    const nameIn = el("input"); nameIn.type = "text"; nameIn.value = c.name || ""; nameIn.placeholder = "이름/호칭";
    nameIn.style.marginBottom = "6px";
    nameIn.oninput = () => { c.name = nameIn.value; saveDebounced(); };
    right.appendChild(nameIn);
    const ageIn = el("input"); ageIn.type = "number"; ageIn.min = "1"; ageIn.max = "100"; ageIn.value = String(characterAge(c)); ageIn.placeholder = "나이 (숫자)";
    ageIn.style.marginBottom = "6px";
    ageIn.oninput = () => { c.age = Math.max(1, Math.min(100, parseInt(ageIn.value, 10) || characterAge(c))); saveDebounced(); };
    right.appendChild(el("div", "field-label", "나이 (숫자로 직접 수정)"));
    right.appendChild(ageIn);
    const ta = el("textarea"); ta.value = c.look || ""; ta.style.minHeight = "60px"; ta.placeholder = "고정 외형(영어)";
    ta.oninput = () => { c.look = ta.value; saveDebounced(); };
    right.appendChild(ta);
    const acts = el("div", "scene-actions");
    const gen = el("button", "btn sm btn-primary", c.imageDataUrl ? "다시 생성" : `✨ 생성 (약 ${imgCostWon()}원)`);
    gen.onclick = () => genOneChar(i);
    acts.appendChild(gen);
    const up = el("label", "btn sm btn-ghost", "🖼 올리기");
    const file = el("input"); file.type = "file"; file.accept = "image/*"; file.style.display = "none";
    file.onchange = () => {
      if (!file.files[0]) return;
      const reader = new FileReader();
      reader.onload = () => { c.imageDataUrl = reader.result; c.imageUrl = ""; saveProject(); render(); toast("주인공 이미지 업로드"); };
      reader.readAsDataURL(file.files[0]);
    };
    up.appendChild(file);
    acts.appendChild(up);
    right.appendChild(acts);
    row.appendChild(right);
    card.appendChild(row);
    return card;
  }

  async function loadCharacters() {
    const body = $("#prodBody");
    busy = true; loading(body, "대본에서 주인공을 뽑는 중…"); renderNav();
    try {
      const key = project.scenes.map((s) => s.text).join(" ").slice(0, 3000);
      const sys = "너는 대본에서 반복 등장하는 핵심 인물을 뽑아 '이미지 생성용 고정 외형'을 만드는 전문가다. 반드시 유효한 JSON 배열만 출력.";
      const usr =
`제목: ${project.title}
줄거리(일부): ${key}
인물 기본 설정: ${LANG[project.lang].setting}
화풍: ${project.style}

이 이야기에 반복 등장하는 핵심 주인공 1~4명을 뽑아줘.
- name: 한국어 이름/호칭(예: 젊은 선비, 주모, 최 대감)
- age: 대본 단서를 근거로 확정한 숫자 나이
- look: 장면마다 똑같이 유지할 고정 외형을 '영어'로 자세히 — 성별, 정확한 숫자 나이, 얼굴 특징, 머리 모양/색, 상의·하의·외투와 색, 소품. ${LANG[project.lang].setting} 반영. 완결 영어 문장 1~2개.
나이 규칙:
- '과부'는 혼인 상태이지 노인이 아니다. 다른 단서가 없으면 30~45세이며 백발·깊은 주름·노파 외모를 금지한다.
- '대감·고관대작·정승·판서'는 젊다는 단서가 없으면 50~65세의 중후하고 권위 있는 남성이다. 청년 얼굴을 금지한다.
- '노파·노인·할머니·할아버지'가 명시된 경우에만 65세 이상으로 정한다.
JSON 배열만: [{"name":"..","age":38,"look":".."}]`;
      const arr = await claudeJSON(sys, usr, 2000);
      project.characters = (Array.isArray(arr) ? arr : []).slice(0, 4)
        .map((c) => ({ name: c.name || "", age: Math.max(1, Math.min(100, parseInt(c.age, 10) || characterAge(c))), look: c.look || "", imageDataUrl: "", imageUrl: "" }));
      saveProject();
      busy = false; render();
    } catch (e) {
      busy = false; render(); showErr($("#prodBody"), keyMissingMsg(e));
    } finally { busy = false; }
  }

  async function genOneChar(i) {
    if (!imgKeyOk()) { toast("⚙ 이미지 생성 API 키를 먼저 넣어주세요"); openKeys(); return; }
    const box = $("#char-" + i);
    if (box) { box.innerHTML = ""; box.appendChild(el("div", "spinner")); }
    try {
      await genCharImage(i);
      saveProject(); render();
      toast(`주인공 ${i + 1} 이미지 생성 완료`);
    } catch (e) {
      if (box) { box.innerHTML = ""; box.textContent = "실패"; }
      toast("주인공 생성 실패: " + kieErrMsg(e));
    }
  }

  function sceneImageCard(s, i) {
    const c = el("div", "scene");
    c.appendChild(el("div", "scene-no", `장면 ${i + 1}${s.isIntro ? " · 인트로" : ""}`));
    const row = el("div", "scene-img-row");
    const imgBox = el("div", "scene-img");
    imgBox.id = "img-" + i;
    if (s.imageDataUrl) { const im = el("img"); im.src = s.imageDataUrl; imgBox.appendChild(im); }
    else imgBox.textContent = "대기 중";
    row.appendChild(imgBox);
    const right = el("div", "scene-prompt");
    const ta = el("textarea"); ta.value = s.imagePrompt; ta.style.minHeight = "56px";
    ta.oninput = () => { s.imagePrompt = ta.value; saveDebounced(); };
    right.appendChild(ta);
    const acts = el("div", "scene-actions");
    const gen = el("button", "btn sm btn-primary", `✨ 생성 (약 ${imgCostWon()}원)`);
    gen.onclick = () => genOneImage(i);
    acts.appendChild(gen);

    const cp = el("button", "btn sm", "📋 프롬프트 복사");
    cp.onclick = () => { navigator.clipboard.writeText(s.imagePrompt || s.text); toast(`장면 ${i + 1} 프롬프트 복사`); };
    acts.appendChild(cp);

    const up = el("label", "btn sm btn-ghost", "🖼 이미지 올리기");
    const file = el("input"); file.type = "file"; file.accept = "image/*"; file.style.display = "none";
    file.onchange = () => { if (file.files[0]) loadImageFile(i, file.files[0]); };
    up.appendChild(file);
    acts.appendChild(up);

    if (s.imageDataUrl) {
      const dl = el("button", "btn sm", "다운로드");
      dl.onclick = () => downloadOneImage(i);
      acts.appendChild(dl);
    }
    right.appendChild(acts);
    row.appendChild(right);
    c.appendChild(row);
    return c;
  }

  function loadImageFile(i, fileObj) {
    const reader = new FileReader();
    reader.onload = () => {
      project.scenes[i].imageDataUrl = reader.result;
      saveProject();
      const box = $("#img-" + i);
      if (box) { box.innerHTML = ""; const im = el("img"); im.src = reader.result; box.appendChild(im); }
      render();
      toast(`장면 ${i + 1} 이미지 업로드`);
    };
    reader.readAsDataURL(fileObj);
  }

  function downloadOneImage(i) {
    const s = project.scenes[i];
    if (!s.imageDataUrl) return;
    if (/^https?:\/\//.test(s.imageDataUrl)) { window.open(s.imageDataUrl, "_blank"); return; }
    const m = s.imageDataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
    if (!m) return;
    const ext = m[1].split("/")[1].replace("jpeg", "jpg");
    download(new Blob([base64ToBytes(m[2])], { type: m[1] }), `scene_${String(i + 1).padStart(2, "0")}.${ext}`);
  }
  function downloadImagesZip() {
    const files = [];
    project.scenes.forEach((s, i) => {
      if (s.imageDataUrl) {
        const m = s.imageDataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
        if (m) files.push({ name: `scene_${String(i + 1).padStart(2, "0")}.${m[1].split("/")[1].replace("jpeg", "jpg")}`, bytes: base64ToBytes(m[2]) });
      }
    });
    if (!files.length) { toast("먼저 이미지를 넣어주세요"); return; }
    download(makeZip(files), `${(project.title || "images").replace(/[\\/:*?"<>|]/g, "_")}_이미지.zip`);
    toast(files.length + "개 이미지를 내려받았어요");
  }

  async function genOneImage(i) {
    if (!imgKeyOk()) { toast("⚙ 이미지 생성 API 키를 먼저 넣어주세요"); openKeys(); return; }
    const s = project.scenes[i];
    const box = $("#img-" + i);
    if (box) { box.innerHTML = ""; box.appendChild(el("div", "spinner")); }
    try {
      s.imageDataUrl = await genImage(s.imagePrompt || s.text);
      saveProject();
      if (box) { box.innerHTML = ""; const im = el("img"); im.src = s.imageDataUrl; box.appendChild(im); }
      return { ok: true };
    } catch (e) {
      if (box) { box.innerHTML = ""; box.textContent = "실패"; }
      toast("이미지 실패: " + kieErrMsg(e));
      return { ok: false, credit: String(e.message).includes("KIE_NO_CREDIT") };
    }
  }
  // KIE/이미지 오류를 사람이 읽기 쉬운 한국어로
  function kieErrMsg(e) {
    const m = String(e.message);
    if (m.includes("KIE_NO_CREDIT")) return "KIE 433: 이 API 키로 '포인트 부족' 응답. 크레딧이 있어도 뜨면 → ① kie.ai/logs 에서 실제 사유 확인 ② API 키에 사용한도 걸렸는지 확인 ③ 해상도 1K로 낮춰보기";
    if (/NO_(GEMINI|KIE)_KEY/.test(m)) return "이미지 API 키 필요";
    if (/Failed to fetch/.test(m)) return "CORS/네트워크 — 웹주소에선 KIE가 막힐 수 있어요(로컬 .bat 실행)";
    return m.slice(0, 70);
  }
  async function genAllImages() {
    if (!imgKeyOk()) { toast("⚙ 이미지 생성 API 키를 먼저 넣어주세요"); openKeys(); return; }
    // 이미 이미지가 있는 장면은 건너뜀 → 오류로 멈춰도 처음부터 다시 안 함(크레딧 절약)
    const todo = [];
    project.scenes.forEach((s, i) => { if (!s.imageDataUrl) todo.push(i); });
    const done = project.scenes.length - todo.length;
    if (!todo.length) { toast("모든 장면에 이미 이미지가 있어요. 특정 장면만 바꾸려면 그 장면의 '다시 생성'을 쓰세요."); return; }
    if (!confirm(`${done ? `이미 만든 ${done}개는 건너뛰고, ` : ""}남은 ${todo.length}개 장면만 생성해요. 약 ${(imgCostWon() * todo.length).toLocaleString("ko")}원. 진행할까요?`)) return;
    let ok = 0;
    for (const i of todo) {
      const r = await genOneImage(i);
      if (r && r.ok) ok++;
      if (r && r.credit) { toast(`⛔ ${ok}개 만들고 중단(KIE 오류). 이미 만든 건 그대로 있어요 — 고친 뒤 '전체 생성'을 다시 누르면 남은 것만 이어서 만듭니다.`); return; }
    }
    toast(`이미지 생성 완료 (${ok}개 추가)`);
  }

  // ---- 5.5 썸네일 ----
  function renderThumb(body) {
    body.appendChild(el("h2", "prod-h", "썸네일"));
    body.appendChild(el("p", "prod-sub", "참고 이미지처럼 <b>2D 민담 이미지 + 큰 다색 글자</b>가 합쳐진 완성 썸네일 4종을 만들고, 마음에 드는 하나를 클릭해 선택합니다."));

    const t = project.thumb || (project.thumb = { copies: [], chosen: -1, imagePrompt: "", imageDataUrl: "" });

    if (!t.copies.length) {
      const btn = el("button", "btn btn-primary", "✨ 썸네일 카피 만들기");
      btn.onclick = genThumbCopies;
      body.appendChild(btn);
    } else {
      body.appendChild(el("div", "field-label", "카피 고르기 (클릭)"));
      const list = el("div", "topic-list");
      t.copies.forEach((c, i) => {
        const card = el("div", "topic-card" + (t.chosen === i ? " sel" : ""));
        if (c.finalDataUrl) {
          const preview = el("img"); preview.src = c.finalDataUrl; preview.alt = `썸네일 후보 ${i + 1}`;
          preview.style.width = "100%"; preview.style.maxWidth = "520px"; preview.style.borderRadius = "10px"; preview.style.marginBottom = "10px";
          card.appendChild(preview);
        }
        card.appendChild(el("div", "topic-rank", c.pos || (i < 2 ? "좌측 4줄" : "하단 2줄")));
        const lines = el("div", "topic-title");
        lines.style.whiteSpace = "pre-line"; lines.style.fontSize = "18px";
        lines.textContent = (c.lines || []).join("\n");
        card.appendChild(lines);
        if (c.imageKo) card.appendChild(el("div", "topic-hook", "🖼 " + esc(c.imageKo)));
        card.onclick = () => { t.chosen = i; t.imageDataUrl = c.imageDataUrl || ""; t.finalDataUrl = c.finalDataUrl || ""; saveDebounced(); render(); };
        list.appendChild(card);
      });
      body.appendChild(list);

      const makeFour = el("button", "btn btn-primary", t.copies.every((c) => c.finalDataUrl) ? "↻ 이미지+글자 4개 다시 생성" : `✨ 이미지+글자 4개 생성 (약 ${(imgCostWon() * 4).toLocaleString("ko")}원)`);
      makeFour.onclick = () => genFourThumbCandidates(makeFour);
      body.appendChild(makeFour);

      if (t.chosen >= 0) {
        const box = el("div", "scene");
        box.style.marginTop = "16px";
        box.appendChild(el("div", "scene-no", "썸네일 이미지"));
        const promptTxt = t.copies[t.chosen].imageEn || t.copies[t.chosen].imageKo || "";
        box.appendChild(el("p", "prod-sub", `내 이미지 API로 바로 만들거나(약 ${imgCostWon()}원), 무료 사이트에서 만들어 <b>올리기</b>로 넣으세요.`));
        const imgWrap = el("div", "scene-img"); imgWrap.style.width = "100%"; imgWrap.style.maxWidth = "480px"; imgWrap.id = "thumbImg";
        if (t.imageDataUrl) { const im = el("img"); im.src = t.imageDataUrl; imgWrap.appendChild(im); }
        else imgWrap.textContent = "아직 없음";
        box.appendChild(imgWrap);
        const acts = el("div", "scene-actions");
        const gen = el("button", "btn sm btn-primary", t.imageDataUrl ? "다시 생성" : `✨ 생성 (약 ${imgCostWon()}원)`);
        gen.onclick = genThumbImage;
        acts.appendChild(gen);
        const cpp = el("button", "btn sm", "📋 이미지 프롬프트 복사");
        cpp.onclick = () => { navigator.clipboard.writeText(promptTxt); toast("썸네일 이미지 프롬프트 복사"); };
        acts.appendChild(cpp);
        const up = el("label", "btn sm btn-ghost", "🖼 이미지 올리기");
        const file = el("input"); file.type = "file"; file.accept = "image/*"; file.style.display = "none";
        file.onchange = () => {
          if (!file.files[0]) return;
          const reader = new FileReader();
          reader.onload = () => { t.imageDataUrl = reader.result; saveProject(); render(); toast("썸네일 이미지 업로드"); };
          reader.readAsDataURL(file.files[0]);
        };
        up.appendChild(file);
        acts.appendChild(up);
        if (t.imageDataUrl) {
          const dl = el("button", "btn sm", "원본 다운로드");
          dl.onclick = () => { if (/^https?:/.test(t.imageDataUrl)) window.open(t.imageDataUrl); else { const m = t.imageDataUrl.match(/^data:(image\/\w+);base64,(.*)$/); if (m) download(new Blob([base64ToBytes(m[2])], { type: m[1] }), "thumbnail.png"); } };
          acts.appendChild(dl);
          const compose = el("button", "btn sm btn-primary", "🅰️ 글자 얹어 완성");
          compose.onclick = () => composeThumb();
          acts.appendChild(compose);
        }
        const cp = el("button", "btn sm btn-ghost", "카피 복사");
        cp.onclick = () => { navigator.clipboard.writeText((t.copies[t.chosen].lines || []).join("\n")); toast("카피를 복사했어요"); };
        acts.appendChild(cp);
        box.appendChild(acts);
        body.appendChild(box);

        // 글자 얹은 완성 썸네일
        if (t.finalDataUrl) {
          const fin = el("div", "scene"); fin.style.marginTop = "14px";
          fin.appendChild(el("div", "scene-no", "✅ 완성 썸네일 (글자 포함)"));
          const fw = el("div", "scene-img"); fw.style.width = "100%"; fw.style.maxWidth = "560px";
          const fi = el("img"); fi.src = t.finalDataUrl; fw.appendChild(fi); fin.appendChild(fw);
          const fa = el("div", "scene-actions");
          const fdl = el("button", "btn sm btn-primary", "완성본 다운로드");
          fdl.onclick = () => { const m = t.finalDataUrl.match(/^data:(image\/\w+);base64,(.*)$/); if (m) download(new Blob([base64ToBytes(m[2])], { type: m[1] }), "thumbnail_final.png"); };
          fa.appendChild(fdl);
          fin.appendChild(fa);
          body.appendChild(fin);
        }
      }
    }

    if (t.copies.length) navBtn("↻ 카피 다시 만들기", genThumbCopies);
    navBtn("음성·자막 만들기 →", () => goStep("voice"), true);
  }

  async function genThumbCopies() {
    const body = $("#prodBody");
    busy = true; loading(body, "썸네일 카피 4종을 만드는 중…"); renderNav();
    try {
      const key = project.scenes.map((s) => s.text).join(" ").slice(0, 1200);
      const sys = `너는 ${LANG[project.lang].audience} 썸네일 카피 전문가다. 결말·정체는 절대 노출하지 않는다. 반드시 유효한 JSON만 출력.`;
      const usr =
`제목: ${project.title}
줄거리 일부: ${key}

이 영상의 썸네일 카피 4종과 각 이미지 묘사를 만들어줘.${langDirective()}
규칙:
- 1,2번은 '좌측 4줄'(한 줄 5~7자, 줄 안에서 의미 완결), 3,4번은 '하단 2줄'(한 줄 12~16자).
- 결말·정체·범인을 알 수 없게. 단서는 1~2개만. 뻔한 완료형 '~했다' 금지.
- 4개의 사건 골격이 서로 달라야 함.
- imageKo: 감정이 터지는 순간 한 컷(설명적 전신 금지, 얼굴/시선/동작 정점). 밤이어도 얼굴 보이게.
- imageEn: 위 장면의 영어 이미지 프롬프트(완결 문장 2~3개). ${LANG[project.lang].setting}. 현재 선택한 화풍을 정확히 적용한다: ${project.style}. 카피 자리(좌측4줄→왼쪽, 하단2줄→아래)를 비운다. 얼굴 잘 보이게, 어둠으로 덮지 않기. 글자/자막/말풍선 절대 없음.
JSON만:
{"copies":[
 {"pos":"좌측 4줄","lines":["..","..","..",".."],"imageKo":"..","imageEn":".."},
 {"pos":"좌측 4줄","lines":["..","..","..",".."],"imageKo":"..","imageEn":".."},
 {"pos":"하단 2줄","lines":["..",".."],"imageKo":"..","imageEn":".."},
 {"pos":"하단 2줄","lines":["..",".."],"imageKo":"..","imageEn":".."}
]}`;
      const r = await claudeJSON(sys, usr, 4000);
      project.thumb = { copies: (r.copies || []).slice(0, 4), chosen: -1, imagePrompt: "", imageDataUrl: "" };
      saveProject();
      busy = false; render();
    } catch (e) {
      busy = false; render(); showErr($("#prodBody"), keyMissingMsg(e));
    } finally { busy = false; }
  }

  async function genThumbImage() {
    const t = project.thumb;
    if (t.chosen < 0) { toast("카피를 먼저 고르세요"); return; }
    if (!imgKeyOk()) { toast("⚙ 이미지 생성 API 키를 먼저 넣어주세요"); openKeys(); return; }
    const box = $("#thumbImg");
    if (box) { box.innerHTML = ""; box.appendChild(el("div", "spinner")); }
    try {
      const c = t.copies[t.chosen];
      const prompt = (c.imageEn || c.imageKo || project.title) +
        " . emotional climax moment, face clearly visible, warm readable lighting, leave empty space for title text. no text, no letters, no captions, no speech bubbles. " + project.style;
      t.imagePrompt = prompt;
      t.imageDataUrl = await genImage(prompt);
      c.imageDataUrl = t.imageDataUrl;
      saveProject(); render();
    } catch (e) {
      if (box) { box.innerHTML = ""; box.textContent = "실패"; }
      toast("썸네일 실패: " + (/NO_(GEMINI|KIE)_KEY/.test(String(e.message)) ? "이미지 API 키 필요" : String(e.message).slice(0, 60)));
    }
  }

  async function composeThumbCandidate(c, imageDataUrl) {
    const lines = (c.lines || []).filter((x) => x && x.trim());
    const leftMode = /좌측/.test(c.pos || "") || lines.length >= 3;
    const img = await loadImg(imageDataUrl);
    try { await document.fonts.load("900 100px 'Nanum Myeongjo'"); await document.fonts.ready; } catch (e) {}
    const W = 1280, H = 720;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d"); drawCover(ctx, img, W, H);
    ctx.textBaseline = "alphabetic"; ctx.lineJoin = "round";
    if (leftMode) {
      const fs = Math.round(H * 0.135); ctx.font = `900 ${fs}px 'Nanum Myeongjo', 'Malgun Gothic', sans-serif`; ctx.textAlign = "left";
      const lh = fs * 1.12, x = Math.round(W * 0.04); let y = Math.round((H - lh * lines.length) / 2) + fs;
      lines.forEach((line) => { drawTextOutlined(ctx, line, x, y, fs); y += lh; });
    } else {
      const fs = Math.round(H * 0.11); ctx.font = `900 ${fs}px 'Nanum Myeongjo', 'Malgun Gothic', sans-serif`; ctx.textAlign = "center";
      const lh = fs * 1.15; let y = H - Math.round(H * 0.06) - lh * (lines.length - 1);
      lines.forEach((line) => { drawTextOutlined(ctx, line, W / 2, y, fs); y += lh; });
    }
    return cv.toDataURL("image/png");
  }

  async function genFourThumbCandidates(btn) {
    const t = project.thumb;
    if (!imgKeyOk()) { toast("⚙ 이미지 생성 API 키를 먼저 넣어주세요"); openKeys(); return; }
    if (!confirm(`썸네일 후보 이미지 4장을 만들고 글자를 합성합니다. 약 ${(imgCostWon() * 4).toLocaleString("ko")}원입니다. 진행할까요?`)) return;
    btn.disabled = true;
    let made = 0;
    try {
      for (let i = 0; i < Math.min(4, t.copies.length); i++) {
        const c = t.copies[i]; btn.textContent = `썸네일 만드는 중… (${i + 1}/4)`;
        const prompt = (c.imageEn || c.imageKo || project.title) +
          " . Use the exact currently selected illustration style for character design, linework, shading, palette and background: " + project.style + ". Strong emotional thumbnail composition with a clearly readable face. Keep the requested text area visually uncluttered. no text, no letters, no captions, no speech bubbles.";
        c.imageDataUrl = await genImage(prompt);
        c.finalDataUrl = await composeThumbCandidate(c, c.imageDataUrl);
        made++; saveProject();
      }
      t.chosen = 0; t.imageDataUrl = t.copies[0]?.imageDataUrl || ""; t.finalDataUrl = t.copies[0]?.finalDataUrl || "";
      saveProject(); render(); toast("완성 썸네일 4개를 만들었습니다");
    } catch (e) {
      saveProject(); render(); toast(`썸네일 ${made}개 생성 후 중단: ${kieErrMsg(e)}`);
    }
  }

  // 썸네일 이미지 위에 카피 글자를 얹어 '완성 썸네일' 만들기 (캔버스 합성)
  async function composeThumb() {
    const t = project.thumb;
    if (t.chosen < 0 || !t.imageDataUrl) { toast("이미지와 카피를 먼저 준비하세요"); return; }
    const c = t.copies[t.chosen];
    const lines = (c.lines || []).filter((x) => x && x.trim());
    if (!lines.length) { toast("카피 글자가 없어요"); return; }
    const leftMode = /좌측/.test(c.pos || "") || lines.length >= 3; // 좌측 4줄 / 하단 2줄
    try {
      const img = await loadImg(t.imageDataUrl);
      try { await document.fonts.load("900 100px 'Nanum Myeongjo'"); await document.fonts.ready; } catch (e) {}
      // 16:9 캔버스(1280x720)에 이미지를 꽉 채워 그림
      const W = 1280, H = 720;
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d");
      drawCover(ctx, img, W, H);
      ctx.textBaseline = "alphabetic";
      ctx.lineJoin = "round";
      if (leftMode) {
        // 좌측 세로 4줄: 큰 글씨, 왼쪽 정렬, 세로 중앙
        const fs = Math.round(H * 0.135);
        ctx.font = `900 ${fs}px 'Nanum Myeongjo', 'Malgun Gothic', sans-serif`;
        ctx.textAlign = "left";
        const lh = fs * 1.12, x = Math.round(W * 0.05);
        let y = Math.round((H - lh * lines.length) / 2) + fs;
        lines.forEach((ln) => { drawTextOutlined(ctx, ln, x, y, fs); y += lh; });
      } else {
        // 하단 2줄: 큰 글씨, 가운데 정렬, 아래쪽
        const fs = Math.round(H * 0.11);
        ctx.font = `900 ${fs}px 'Nanum Myeongjo', 'Malgun Gothic', sans-serif`;
        ctx.textAlign = "center";
        const lh = fs * 1.15;
        let y = H - Math.round(H * 0.06) - lh * (lines.length - 1);
        lines.forEach((ln) => { drawTextOutlined(ctx, ln, W / 2, y, fs); y += lh; });
      }
      t.finalDataUrl = cv.toDataURL("image/png");
      saveProject(); render();
      toast("완성 썸네일 만들었어요 ✅");
    } catch (e) {
      // http 이미지(CORS)면 캔버스 오염으로 실패
      toast(/taint|secur|cross/i.test(String(e.message)) ? "이 이미지는 글자 얹기 불가(외부 URL). '이미지 올리기'로 넣은 파일이면 됩니다." : "글자 얹기 실패: " + String(e.message).slice(0, 50));
    }
  }
  function loadImg(src) {
    return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => rej(new Error("이미지 로드 실패")); im.src = src; });
  }
  function drawCover(ctx, img, W, H) {
    const r = Math.max(W / img.width, H / img.height);
    const w = img.width * r, h = img.height * r;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  }
  function drawTextOutlined(ctx, text, x, y, fs) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = fs * 0.18; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = fs * 0.06;
    ctx.lineWidth = Math.max(6, fs * 0.16); ctx.strokeStyle = "#000";
    ctx.strokeText(text, x, y);
    ctx.shadowColor = "transparent";
    const colors = ["#b9ff48", "#ff674d", "#55e5ff", "#ffd84d"];
    let colorIndex = 0; for (let i = 0; i < text.length; i++) colorIndex = (colorIndex + text.charCodeAt(i)) % colors.length;
    ctx.fillStyle = colors[colorIndex]; // 참고 썸네일처럼 줄마다 초록·빨강·하늘·노랑
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ---- 6. 음성·자막 ----
  function renderVoice(body) {
    body.appendChild(el("h2", "prod-h", "음성 · 자막"));
    const hasTC = !!typecastKey() && !!typecastVoice();
    body.appendChild(el("p", "prod-sub", hasTC
      ? "<b>타입캐스트 API</b>로 장면별 음성을 자동 생성합니다. (파일 업로드·Gemini 음성도 가능) 음성 길이에 맞춰 자막(SRT)이 자동 싱크됩니다."
      : "타입캐스트 <b>API 키/voice_id</b>를 ⚙에 넣으면 버튼 한 번으로 자동 생성돼요. 없으면 타입캐스트 앱에서 만든 음성을 <b>올리기</b>로 넣으세요. (Gemini 음성도 가능)"));

    if (!hasTC) {
      const kb = el("div", "keybar"); kb.style.marginBottom = "16px";
      kb.innerHTML = "🗣 타입캐스트 API로 자동 생성하려면 키가 필요해요.";
      const b = el("button", "btn sm btn-primary", "타입캐스트 키 입력"); b.onclick = openKeys;
      kb.appendChild(b); body.appendChild(kb);
    }

    const pkg = el("div", "pkg");
    project.scenes.forEach((s, i) => {
      const c = el("div", "scene");
      const head = el("div", "scene-head");
      head.appendChild(el("div", "scene-no", `장면 ${i + 1}${s.isIntro ? " · 인트로" : ""}`));
      head.appendChild(el("span", "pi-meta", s.durationSec ? `${s.durationSec.toFixed(1)}초` : "음성 없음"));
      c.appendChild(head);
      c.appendChild(el("div", null, esc(s.text)));
      const acts = el("div", "scene-actions");

      const tc = el("button", "btn sm btn-primary", "🗣 타입캐스트 음성");
      tc.onclick = () => genOneTypecast(i, tc);
      acts.appendChild(tc);

      const up = el("label", "btn sm", "🎙 음성 올리기");
      const file = el("input"); file.type = "file"; file.accept = "audio/*"; file.style.display = "none";
      file.onchange = () => { if (file.files[0]) loadAudioFile(i, file.files[0]); };
      up.appendChild(file);
      acts.appendChild(up);

      const gen = el("button", "btn sm btn-ghost", "Gemini 음성");
      gen.onclick = () => genOneVoice(i, gen);
      acts.appendChild(gen);

      if (s.audioDataUrl) {
        const au = el("audio"); au.controls = true; au.src = s.audioDataUrl; au.style.height = "34px"; au.style.maxWidth = "220px";
        acts.appendChild(au);
      }
      c.appendChild(acts);
      pkg.appendChild(c);
    });
    body.appendChild(pkg);
    navBtn("전체 타입캐스트 음성 생성", genAllTypecast);
    navBtn("전체 Gemini 음성 생성", genAllVoices);
    navBtn("편집·미리보기 →", () => { goStep("edit"); }, true);
  }

  async function genOneTypecast(i, btn) {
    const s = project.scenes[i];
    if (!typecastKey() || !typecastVoice()) { toast("⚙에 타입캐스트 키/voice_id를 넣어주세요"); openKeys(); return; }
    if (btn) { btn.disabled = true; btn.textContent = "생성 중…"; }
    try {
      const r = await genTypecast(s.text);
      s.audioDataUrl = r.dataUrl; s.durationSec = r.durationSec;
      saveProject(); render();
    } catch (e) {
      const m = String(e.message);
      toast("타입캐스트 실패: " + (/NO_TYPECAST_VOICE/.test(m) ? "voice_id 필요" : /NO_TYPECAST_KEY/.test(m) ? "API 키 필요" : /Failed to fetch/.test(m) ? "CORS/네트워크(웹은 막힐 수 있음 → 업로드 사용)" : m.slice(0, 70)));
      if (btn) { btn.disabled = false; btn.textContent = "🗣 타입캐스트 음성"; }
    }
  }
  async function genAllTypecast() {
    if (!typecastKey() || !typecastVoice()) { toast("⚙에 타입캐스트 키/voice_id를 넣어주세요"); openKeys(); return; }
    for (let i = 0; i < project.scenes.length; i++) {
      try { const r = await genTypecast(project.scenes[i].text); project.scenes[i].audioDataUrl = r.dataUrl; project.scenes[i].durationSec = r.durationSec; }
      catch (e) { toast("일부 실패: " + String(e.message).slice(0, 50)); break; }
    }
    saveProject(); render(); toast("타입캐스트 음성 생성 완료");
  }

  function loadAudioFile(i, fileObj) {
    const s = project.scenes[i];
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const au = new Audio();
      au.onloadedmetadata = () => {
        s.audioDataUrl = dataUrl;
        s.durationSec = isFinite(au.duration) ? au.duration : estDur(s.text);
        saveProject(); render();
        toast(`장면 ${i + 1} 음성 업로드 (${s.durationSec.toFixed(1)}초)`);
      };
      au.onerror = () => {
        s.audioDataUrl = dataUrl; s.durationSec = estDur(s.text);
        saveProject(); render();
        toast(`장면 ${i + 1} 음성 업로드`);
      };
      au.src = dataUrl;
    };
    reader.readAsDataURL(fileObj);
  }
  async function genOneVoice(i, btn) {
    const s = project.scenes[i];
    if (btn) { btn.disabled = true; btn.textContent = "생성 중…"; }
    try {
      const r = await genTTS(s.text);
      s.audioDataUrl = r.dataUrl; s.durationSec = r.durationSec;
      saveProject(); render();
    } catch (e) {
      toast("음성 실패: " + (String(e.message).includes("NO_GEMINI_KEY") ? "Gemini 키 필요" : e.message.slice(0, 60)));
      if (btn) { btn.disabled = false; btn.textContent = "음성 생성"; }
    }
  }
  async function genAllVoices() {
    if (!geminiKey()) { toast("⚙ Google AI 키가 필요해요"); openKeys(); return; }
    for (let i = 0; i < project.scenes.length; i++) {
      const s = project.scenes[i];
      try { const r = await genTTS(s.text); s.audioDataUrl = r.dataUrl; s.durationSec = r.durationSec; }
      catch (e) { toast("일부 음성 실패: " + e.message.slice(0, 50)); }
    }
    saveProject(); render();
    toast("음성 생성 완료");
  }

  // ---- 7. 편집 · 미리보기 (캡컷 스타일) ----
  function renderEdit(body) {
    body.appendChild(el("h2", "prod-h", "편집 · 미리보기"));
    body.appendChild(el("p", "prod-sub", "장면별 <b>줌 방향·자막·길이</b>를 다듬고 <b>▶ 재생</b>으로 미리보세요. 인트로는 영상처럼 강조돼요. 최종 컷 편집은 캡컷에서."));

    const wm = field("왼쪽 상단 워터마크 문구", () => project.watermark, false, (v) => { project.watermark = v; saveDebounced(); });
    body.appendChild(wm);

    const pkg = el("div", "pkg");
    project.scenes.forEach((s, i) => pkg.appendChild(sceneEditCard(s, i)));
    body.appendChild(pkg);

    navBtn("▶ 전체 미리보기", () => openPlayer(0, false));
    navBtn("캡컷 내보내기 →", () => { goStep("export"); }, true);
  }

  function sceneEditCard(s, i) {
    const c = el("div", "scene");
    const head = el("div", "scene-head");
    head.appendChild(el("div", "scene-no", `장면 ${i + 1}`));
    const badge = el("span", "scene-badge", s.isIntro ? "인트로" : "일반");
    badge.style.cursor = "pointer"; badge.title = "인트로 여부 전환";
    badge.onclick = () => { s.isIntro = !s.isIntro; saveDebounced(); render(); };
    head.appendChild(badge);
    c.appendChild(head);

    const row = el("div", "scene-img-row");
    const imgBox = el("div", "scene-img");
    if (s.imageDataUrl) { const im = el("img"); im.src = s.imageDataUrl; imgBox.appendChild(im); }
    else imgBox.textContent = "이미지 없음";
    row.appendChild(imgBox);

    const right = el("div", "scene-prompt");
    right.appendChild(el("div", "field-label", "자막 (음성 내용)"));
    const ta = el("textarea"); ta.value = s.text; ta.style.minHeight = "54px";
    ta.oninput = () => { s.text = ta.value; saveDebounced(); };
    right.appendChild(ta);

    const ctl = el("div", "edit-ctl");
    const zsel = el("select");
    [["in", "줌 인"], ["out", "줌 아웃"], ["none", "고정"]].forEach(([v, l]) => {
      const o = el("option", null, l); o.value = v; if ((s.zoom || "in") === v) o.selected = true; zsel.appendChild(o);
    });
    zsel.onchange = () => { s.zoom = zsel.value; saveDebounced(); };
    const zwrap = el("label", "edit-mini"); zwrap.appendChild(el("span", null, "줌")); zwrap.appendChild(zsel);
    ctl.appendChild(zwrap);

    const dur = el("input"); dur.type = "number"; dur.min = "1"; dur.step = "0.5";
    dur.value = (s.durationSec || estDur(s.text)).toFixed(1); dur.style.width = "76px";
    dur.onchange = () => { s.durationSec = parseFloat(dur.value) || estDur(s.text); saveDebounced(); };
    const dwrap = el("label", "edit-mini"); dwrap.appendChild(el("span", null, "길이(초)")); dwrap.appendChild(dur);
    ctl.appendChild(dwrap);

    const play = el("button", "btn sm", "▶ 이 장면");
    play.onclick = () => openPlayer(i, true);
    ctl.appendChild(play);

    if (s.isIntro && s.imageDataUrl) {
      const rec = el("button", "btn sm", "🎬 인트로 클립(webm)");
      rec.onclick = () => recordIntroClip(i);
      ctl.appendChild(rec);
    }
    if (s.isIntro) {
      const kv = el("button", "btn sm btn-primary", s.videoUrl ? "🎞 인트로 영상 다시" : "🎞 인트로 영상 생성 (KIE)");
      kv.onclick = () => genIntroVideoKIE(i, kv);
      ctl.appendChild(kv);
      const grok = el("button", "btn sm", "🎥 영상 프롬프트만");
      grok.onclick = () => genGrokIntro(i, grok);
      ctl.appendChild(grok);
    }
    right.appendChild(ctl);

    if (s.isIntro && s.videoUrl) {
      const vb = el("div", "grok-box");
      vb.appendChild(el("div", "field-label", "🎞 KIE 인트로 영상"));
      const vid = el("video"); vid.src = s.videoUrl; vid.controls = true; vid.style.width = "100%"; vid.style.borderRadius = "10px";
      vb.appendChild(vid);
      const va = el("div", "scene-actions");
      const vopen = el("button", "btn sm", "새 탭에서 열기/저장");
      vopen.onclick = () => window.open(s.videoUrl, "_blank");
      va.appendChild(vopen);
      vb.appendChild(va);
      right.appendChild(vb);
    }

    if (s.grokImage || s.grokVideo) {
      const gb = el("div", "grok-box");
      gb.appendChild(grokField("Grok 이미지 프롬프트", s.grokImage || ""));
      gb.appendChild(grokField("Grok 영상 프롬프트", s.grokVideo || ""));
      right.appendChild(gb);
    }

    row.appendChild(right);
    c.appendChild(row);
    return c;
  }

  function grokField(label, value) {
    const f = el("div", "pkg-field");
    const lab = el("div", "pkg-label");
    lab.appendChild(el("span", null, label));
    const copy = el("button", "copy-mini", "복사");
    copy.onclick = () => { navigator.clipboard.writeText(value); copy.textContent = "복사됨"; setTimeout(() => (copy.textContent = "복사"), 1000); };
    lab.appendChild(copy);
    f.appendChild(lab);
    const ta = el("textarea"); ta.value = value; ta.readOnly = true; ta.style.minHeight = "70px"; ta.style.fontSize = "13px";
    f.appendChild(ta);
    return f;
  }

  async function genGrokIntro(i, btn) {
    const s = project.scenes[i];
    if (btn) { btn.disabled = true; btn.textContent = "생성 중…"; }
    try {
      const STYLE_LINE = "Drawn illustration in webtoon manhwa comic style with clear bold line art and flat cel-shaded coloring like the attached reference. 16:9 aspect ratio.";
      const sys = "너는 Grok용 인트로 훅 프롬프트 생성기다. 대본 대사는 한 글자도 수정하지 않는다. 스포일러(정체·반전) 금지. 모든 출력에 텍스트·자막·말풍선 금지. 반드시 유효한 JSON만 출력.";
      const usr =
`인트로 장면: ${s.text}
인물 설정: ${LANG[project.lang].setting}

이 장면으로 Grok용 [이미지 프롬프트]와 [영상 프롬프트]를 영어로 만들어줘.
- image: 인물 동작·위치·배경·조명을 산문 영어로. 끝에 "no text no letters no words no modern objects." 그리고 스타일 라인 그대로 붙이기: "${STYLE_LINE}"
- video: 이미지에 이미 있는 외형·세팅·그림체는 반복하지 말고 ACTION / CAMERA / MOOD만. 카메라는 push-in 계열, "Camera moves, the subject does not walk or change position." 포함. 장면 대사(큰따옴표)가 있으면 그 대사 그대로 lip-sync(입만 움직임), 없으면 완전 무음("Completely silent. Mute audio."). 끝에 "CRITICAL: NO text, NO subtitles, NO captions, NO speech bubbles, NO written words."
JSON만: {"image":"...","video":"..."}`;
      const r = await claudeJSON(sys, usr, 3000);
      s.grokImage = r.image || ""; s.grokVideo = r.video || "";
      saveProject(); render();
      toast("Grok 인트로 프롬프트 생성 완료");
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = "🎥 Grok 영상 프롬프트"; }
      toast("실패: " + keyMissingMsgPlain(e));
    }
  }
  function keyMissingMsgPlain(e) {
    const m = String(e.message);
    if (m.includes("KIE_NO_CREDIT")) return "KIE 포인트(크레딧) 부족 — kie.ai에서 충전 후 다시 시도";
    if (m.includes("NO_CLAUDE_KEY")) return "Anthropic 키 필요";
    if (m.includes("NO_KIE_KEY")) return "KIE.ai 키 필요";
    if (/Failed to fetch/.test(m)) return "CORS/네트워크 — 웹주소에선 KIE가 막힐 수 있어요(로컬 .bat 실행 권장)";
    return m.slice(0, 80);
  }

  // 인트로 이미지를 KIE로 영상 변환
  async function genIntroVideoKIE(i, btn) {
    if (!imgKeyOk()) { toast("⚙ KIE.ai 키를 먼저 넣어주세요"); openKeys(); return; }
    const s = project.scenes[i];
    const orig = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "영상 생성 중… (수분)"; }
    try {
      // 영상 프롬프트 확보: 없으면 먼저 생성
      if (!s.grokVideo) { try { await genGrokIntroSilently(i); } catch (e) {} }
      const prompt = s.grokVideo || s.text || project.title;
      // 이미지가 공개 URL이면 이미지→영상, data URL(업로드/base64)이면 텍스트→영상
      const imgUrl = (s.imageDataUrl && /^https?:\/\//.test(s.imageDataUrl)) ? s.imageDataUrl : null;
      if (s.imageDataUrl && !imgUrl) toast("인트로 이미지가 파일이라 텍스트→영상으로 만듭니다");
      s.videoUrl = await genVideoKIE(prompt, imgUrl);
      saveProject(); render();
      toast("인트로 영상 생성 완료 🎞");
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = orig; }
      toast("영상 실패: " + keyMissingMsgPlain(e));
    }
  }
  // 버튼/렌더 없이 grokVideo만 채우기 (영상 생성 전 프롬프트 확보용)
  async function genGrokIntroSilently(i) {
    const s = project.scenes[i];
    const sys = "너는 영상 생성용 인트로 프롬프트 생성기다. 스포일러 금지. 출력에 텍스트·자막·말풍선 금지. 반드시 유효한 JSON만 출력.";
    const usr =
`인트로 장면: ${s.text}
인물 설정: ${LANG[project.lang].setting}
이 장면의 [영상 프롬프트]를 영어로 만들어줘. ACTION / CAMERA / MOOD 중심, 카메라는 push-in 계열 "Camera moves, the subject does not walk or change position." 포함. 끝에 "CRITICAL: NO text, NO subtitles, NO captions, NO written words."
JSON만: {"video":"..."}`;
    const r = await claudeJSON(sys, usr, 2000);
    s.grokVideo = r.video || s.grokVideo || "";
  }

  function openPlayer(startIdx, single) {
    let idx = startIdx || 0;
    let audio = null, timer = null, stopped = false;
    const overlay = el("div", "player");
    overlay.innerHTML =
      "<div class='player-box'><div class='player-stage'><img class='player-img' id='pImg' alt=''></div>" +
      "<div class='player-wm' id='pWm'></div><div class='player-cap' id='pCap'></div>" +
      "<button class='player-x' id='pX' title='닫기'>✕</button></div>";
    document.body.appendChild(overlay);
    $("#pWm").textContent = project.watermark;
    function cleanup() { stopped = true; if (timer) clearTimeout(timer); if (audio) audio.pause(); overlay.remove(); }
    $("#pX").onclick = cleanup;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(); });
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { cleanup(); document.removeEventListener("keydown", esc); } });

    function playScene() {
      if (stopped) return;
      if (idx >= project.scenes.length) { cleanup(); return; }
      const s = project.scenes[idx];
      const im = $("#pImg");
      const dur = s.durationSec || estDur(s.text);
      const big = s.isIntro ? 1.22 : 1.12;
      const z = s.zoom || "in";
      im.style.transition = "none";
      im.src = s.imageDataUrl || "";
      im.style.opacity = s.imageDataUrl ? "1" : "0.2";
      if (z === "in") { im.style.transform = "scale(1)"; requestAnimationFrame(() => { im.style.transition = `transform ${dur}s linear`; im.style.transform = `scale(${big})`; }); }
      else if (z === "out") { im.style.transform = `scale(${big})`; requestAnimationFrame(() => { im.style.transition = `transform ${dur}s linear`; im.style.transform = "scale(1)"; }); }
      else { im.style.transform = "scale(1.04)"; }
      $("#pCap").textContent = s.text;
      if (audio) { audio.pause(); audio = null; }
      if (s.audioDataUrl) { audio = new Audio(s.audioDataUrl); audio.play().catch(() => {}); }
      timer = setTimeout(() => { idx++; if (single) { cleanup(); return; } playScene(); }, dur * 1000);
    }
    playScene();
  }

  async function recordIntroClip(i) {
    const s = project.scenes[i];
    if (!s.imageDataUrl) { toast("인트로 이미지가 없어요"); return; }
    if (typeof MediaRecorder === "undefined") { toast("이 브라우저는 영상 저장을 지원하지 않아요"); return; }
    try {
      const img = new Image(); img.src = s.imageDataUrl; await img.decode();
      const W = 1280, H = 720;
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d");
      const stream = cv.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const done = new Promise((r) => (rec.onstop = r));
      const dur = (s.durationSec || 5);
      const ir = img.width / img.height, cr = W / H;
      let sw, sh; if (ir > cr) { sh = img.height; sw = sh * cr; } else { sw = img.width; sh = sw / cr; }
      const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
      rec.start();
      const t0 = performance.now();
      (function draw() {
        const p = Math.min(1, (performance.now() - t0) / (dur * 1000));
        const zoom = 1 - 0.18 * p;              // push-in by cropping tighter
        const zw = sw * zoom, zh = sh * zoom;
        ctx.drawImage(img, sx + (sw - zw) / 2, sy + (sh - zh) / 2, zw, zh, 0, 0, W, H);
        ctx.font = "bold 26px sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 6;
        ctx.fillText(project.watermark, 26, 46);
        ctx.shadowBlur = 0;
        if (p < 1 && !document.hidden) requestAnimationFrame(draw); else rec.stop();
      })();
      toast("인트로 영상 만드는 중…");
      await done;
      download(new Blob(chunks, { type: "video/webm" }), `intro_scene_${i + 1}.webm`);
      toast("인트로 영상(webm) 저장 완료");
    } catch (e) { toast("인트로 영상 실패: " + e.message.slice(0, 50)); }
  }

  // ---- 8. 캡컷 내보내기 ----
  function renderExport(body) {
    body.appendChild(el("h2", "prod-h", "캡컷으로 내보내기"));
    body.appendChild(el("p", "prod-sub", "아래 버튼을 누르면 <b>이미지 · 음성 · 자막(SRT) · 대본 · 유튜브 정보</b>를 한 폴더(ZIP)로 내려받습니다. 압축을 풀고 캡컷에 불러오세요."));

    const nImg = project.scenes.filter((s) => s.imageDataUrl).length;
    const nAud = project.scenes.filter((s) => s.audioDataUrl).length;
    const stat = el("div", "pkg");
    stat.appendChild(el("div", "prod-sub",
      `장면 <b>${project.scenes.length}</b>개 · 이미지 <b>${nImg}</b>개 · 음성 <b>${nAud}</b>개 준비됨`));
    body.appendChild(stat);

    // 유튜브 업로드 정보 (복사용)
    const yt = el("div", "scene");
    yt.appendChild(el("div", "scene-no", "유튜브 업로드 정보 (복사해서 붙여넣기)"));
    yt.appendChild(copyRow("제목 A", project.title || ""));
    if (project.titleB) yt.appendChild(copyRow("제목 B (A/B 테스트용)", project.titleB));
    yt.appendChild(copyRow("제목 옆 태그 A", project.titleTag || ""));
    if (project.titleTagB) yt.appendChild(copyRow("제목 옆 태그 B", project.titleTagB));
    yt.appendChild(copyRow("설명", project.description || "", true));
    yt.appendChild(copyRow("설명 아래 태그", (project.tags || []).join(", "), true));
    body.appendChild(yt);

    const guide = el("div", "scene");
    guide.innerHTML =
      "<div class='scene-no'>캡컷 사용법 (초보자용)</div>" +
      "<ol style='margin:8px 0 0;padding-left:20px;line-height:1.9;font-size:14px'>" +
      "<li>ZIP 압축을 풉니다.</li>" +
      "<li>캡컷에서 새 프로젝트 → <b>images</b> 폴더의 사진을 번호 순서대로 타임라인에 올립니다.</li>" +
      "<li><b>audio</b> 폴더의 같은 번호 음성을 각 사진 아래에 맞춥니다. (사진 길이 = 음성 길이)</li>" +
      "<li>인트로(장면1)는 좀 더 크게/영상처럼, 나머지 사진은 <b>줌 인/줌 아웃</b> 효과를 줍니다.</li>" +
      "<li>자막: <b>subtitles.srt</b>를 캡컷 자막 가져오기로 불러옵니다.</li>" +
      "<li>왼쪽 위에 텍스트로 <b>“" + esc(project.watermark) + "”</b>를 넣습니다.</li>" +
      "<li>유튜브 제목·설명·태그는 <b>youtube_info.txt</b>에서 복사해 씁니다.</li>" +
      "</ol>";
    body.appendChild(guide);

    navBtn("📦 캡컷용 ZIP 내려받기", doExport, true);
  }

  function copyRow(label, value, multiline) {
    const f = el("div", "pkg-field");
    const lab = el("div", "pkg-label");
    lab.appendChild(el("span", null, label));
    const copy = el("button", "copy-mini", "복사");
    copy.onclick = () => { navigator.clipboard.writeText(value); copy.textContent = "복사됨 ✓"; setTimeout(() => (copy.textContent = "복사"), 1200); };
    lab.appendChild(copy);
    f.appendChild(lab);
    const box = multiline ? el("textarea") : el("input");
    if (!multiline) box.type = "text";
    box.value = value; box.readOnly = true;
    if (multiline) box.style.minHeight = "64px";
    box.onclick = () => box.select();
    f.appendChild(box);
    return f;
  }
  function strBytes(s) { return new TextEncoder().encode(s); }
  async function doExport() {
    const files = [];
    const pad = (n) => String(n + 1).padStart(2, "0");
    project.scenes.forEach((s, i) => {
      if (s.imageDataUrl) {
        const m = s.imageDataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
        if (m) files.push({ name: `images/scene_${pad(i)}.${m[1].split("/")[1].replace("jpeg", "jpg")}`, bytes: base64ToBytes(m[2]) });
      }
      if (s.audioDataUrl) {
        const m = s.audioDataUrl.match(/^data:audio\/([\w.+-]+);base64,(.*)$/);
        if (m) {
          let ext = m[1].split(";")[0].replace("mpeg", "mp3").replace("x-wav", "wav").replace("wave", "wav");
          if (!/^(mp3|wav|m4a|aac|ogg|opus)$/.test(ext)) ext = "mp3";
          files.push({ name: `audio/scene_${pad(i)}.${ext}`, bytes: base64ToBytes(m[2]) });
        }
      }
    });
    if (project.thumb && project.thumb.imageDataUrl) {
      const tm = project.thumb.imageDataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
      if (tm) files.push({ name: `thumbnail.${tm[1].split("/")[1].replace("jpeg", "jpg")}`, bytes: base64ToBytes(tm[2]) });
    }
    if (project.thumb && project.thumb.chosen >= 0) {
      const c = project.thumb.copies[project.thumb.chosen];
      if (c) files.push({ name: "thumbnail_copy.txt", bytes: strBytes(`[썸네일 카피]\n${(c.lines || []).join("\n")}`) });
    }
    files.push({ name: "subtitles.srt", bytes: strBytes(buildSRT()) });
    files.push({ name: "script.txt", bytes: strBytes(project.scenes.map((s, i) => `[장면 ${i + 1}${s.isIntro ? " 인트로" : ""} · 줌:${s.zoom || "in"} · ${(s.durationSec || estDur(s.text)).toFixed(1)}초]\n${s.text}`).join("\n\n")) });
    files.push({
      name: "youtube_info.txt",
      bytes: strBytes(`■ 제목 A\n${project.title}\n\n■ 제목 B (A/B 테스트용)\n${project.titleB || "-"}\n\n■ 제목 옆 태그 A\n${project.titleTag}\n\n■ 제목 옆 태그 B\n${project.titleTagB || "-"}\n\n■ 설명\n${project.description}\n\n■ 태그\n${project.tags.join(", ")}\n\n■ 워터마크(왼쪽 위 문구)\n${project.watermark}`)
    });
    const introVid = project.scenes.find((s) => s.isIntro && s.videoUrl);
    const introLine = introVid ? `\n\n■ 인트로 영상(KIE 생성): 아래 링크에서 받아 맨 앞에 배치하세요.\n${introVid.videoUrl}` : "";
    files.push({ name: "capcut_guide.txt", bytes: strBytes("images/ 를 번호순으로 타임라인에 올리고, audio/ 의 같은 번호 음성을 아래에 맞추세요.\n인트로 외 이미지는 줌 인/아웃 효과, 자막은 subtitles.srt 가져오기.\n왼쪽 위 텍스트: " + project.watermark + introLine) });

    if (files.length <= 4) { toast("먼저 이미지/음성을 생성하세요"); return; }
    const blob = makeZip(files);
    download(blob, `${(project.title || "야담영상").replace(/[\\/:*?"<>|]/g, "_")}_캡컷.zip`);
    toast("ZIP을 내려받았어요");
  }

  // ============ 프로젝트 저장 (IndexedDB — 이미지 많아도 용량 걱정 없음) ============
  function idbOpen() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("yeti_db", 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("kv")) r.result.createObjectStore("kv"); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function idbGet(key) {
    return idbOpen().then((db) => new Promise((res, rej) => {
      const t = db.transaction("kv", "readonly").objectStore("kv").get(key);
      t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
    }));
  }
  function idbSet(key, val) {
    return idbOpen().then((db) => new Promise((res, rej) => {
      const t = db.transaction("kv", "readwrite").objectStore("kv").put(val, key);
      t.onsuccess = () => res(); t.onerror = () => rej(t.error);
    }));
  }

  let _projCache = null;   // 메모리 캐시 (IDB에서 로드)
  let _projLoaded = false; // IDB 최초 로드 완료 여부

  function loadProjects() {
    if (_projCache === null) { try { _projCache = JSON.parse(localStorage.getItem(LS.projects)) || []; } catch (e) { _projCache = []; } }
    return _projCache;
  }
  function persistProjects() {
    idbSet("projects", _projCache).catch(() => {});
    // 가벼운 백업(이미지 제외)도 localStorage에 — IDB 못 쓰는 환경 대비
    try {
      const light = _projCache.map((p) => ({ ...p, scenes: (p.scenes || []).map((s) => ({ ...s, imageDataUrl: "", audioDataUrl: "" })), characters: (p.characters || []).map((c) => ({ ...c, imageDataUrl: "" })), thumb: p.thumb ? { ...p.thumb, imageDataUrl: "", finalDataUrl: "", copies: (p.thumb.copies || []).map((c) => ({ ...c, imageDataUrl: "", finalDataUrl: "" })) } : p.thumb }));
      localStorage.setItem(LS.projects, JSON.stringify(light));
    } catch (e) {}
  }
  function saveProject() {
    project.lastStep = STEPS[stepIdx]?.key || project.lastStep || "category";
    project.updatedAt = Date.now();
    const all = loadProjects();
    const idx = all.findIndex((p) => p.id === project.id);
    const meta = { ...project };
    if (idx >= 0) all[idx] = meta; else all.unshift(meta);
    persistProjects();
  }
  // 최초 IDB 로드 — 이미지 포함 전체 프로젝트 복원
  function initProjectStore() {
    idbGet("projects").then(async (list) => {
      if (list === undefined) {
        // 최초 실행: 기존 localStorage 데이터를 IDB로 이관
        const ls = loadProjects();
        if (ls.length) { _projCache = ls; await idbSet("projects", ls).catch(() => {}); }
        else _projCache = [];
      } else {
        _projCache = Array.isArray(list) ? list : [];
      }
      _projLoaded = true;
      if ($("#prodProjPanel") && !$("#prodProjPanel").hidden) renderProjList();
    }).catch(() => { _projLoaded = true; loadProjects(); });
  }

  function renderProjList() {
    const w = $("#prodProjList"); w.innerHTML = "";
    if (!_projLoaded) { w.appendChild(el("div", "prod-sub", "불러오는 중…")); }
    const all = loadProjects();
    if (!all.length) { if (_projLoaded) w.appendChild(el("div", "prod-sub", "저장된 프로젝트가 없어요.")); return; }
    all.forEach((p) => {
      const it = el("div", "proj-item");
      const t = el("div", "pi-title", esc(p.title || p.topics?.[p.topicIdx]?.title || p.category || "제목 미정"));
      t.onclick = () => {
        project = migrateOldKoreanStyle(p); if (!project.characters) project.characters = [];
        const savedStep = stepOf(project.lastStep || "");
        stepIdx = savedStep >= 0 ? savedStep : (p.scenes?.length ? stepOf("script") : p.topics?.length ? stepOf("topic") : 0);
        $("#prodProjPanel").hidden = true; saveProject(); render(); toast(`${STEPS[stepIdx].name} 단계부터 이어서 작업합니다`);
      };
      it.appendChild(t);
      const savedStep = stepOf(p.lastStep || "");
      it.appendChild(el("div", "pi-meta", `이어하기 · ${savedStep >= 0 ? STEPS[savedStep].name : "대본·정보"} · ${new Date(p.updatedAt || p.createdAt).toLocaleString("ko")}`));
      const del = el("button", null, "삭제");
      del.onclick = () => { _projCache = loadProjects().filter((x) => x.id !== p.id); persistProjects(); renderProjList(); };
      it.appendChild(del);
      w.appendChild(it);
    });
  }

  function openKeys() {
    $("#prodProjPanel").hidden = true;
    const p = $("#prodKeyPanel"); p.hidden = !p.hidden;
    if (!p.hidden) {
      if ($("#prodChannelName")) $("#prodChannelName").value = channelName();
      const tp = $("#prodTextProvider");
      if (tp) { tp.value = textProvider(); tp.dispatchEvent(new Event("change")); }
      $("#prodClaudeKey").value = claudeKey();
      if ($("#prodGeminiKey")) $("#prodGeminiKey").value = geminiKey();
      if ($("#prodGeminiTextModel")) $("#prodGeminiTextModel").value = geminiTextModel();
      $("#prodModel").value = claudeModel();
      if ($("#prodKieKey")) $("#prodKieKey").value = kieKey();
      if ($("#prodKieModel")) $("#prodKieModel").value = kieModel();
      if ($("#prodKieRes")) $("#prodKieRes").value = kieRes();
      if ($("#prodKieVideoModel")) $("#prodKieVideoModel").value = kieVideoModel();
      $("#prodTypecastKey").value = typecastKey();
      $("#prodTypecastVoiceKo").value = localStorage.getItem(LS.typecastVoiceKo) || localStorage.getItem(LS.typecastVoice) || "";
      $("#prodTypecastVoiceJa").value = localStorage.getItem(LS.typecastVoiceJa) || "";
      $("#prodGeminiVoiceKo").value = localStorage.getItem(LS.geminiVoiceKo) || localStorage.getItem(LS.geminiVoice) || "Kore";
      $("#prodGeminiVoiceJa").value = localStorage.getItem(LS.geminiVoiceJa) || localStorage.getItem(LS.geminiVoice) || "Kore";
    }
  }

  // ============ 초기화 ============
  function init() {
    initProjectStore(); // IndexedDB에서 저장된 프로젝트 복원

    // 상단 제목을 활성 탭에 맞춰 갱신
    const tabsEl = document.getElementById("tabs");
    const topTitle = document.getElementById("topTitle");
    if (tabsEl && topTitle) tabsEl.addEventListener("click", (e) => {
      const t = e.target.closest(".tab");
      if (t && t.dataset.title) topTitle.textContent = t.dataset.title;
    });

    $("#prodSettings").onclick = openKeys;
    $("#prodProjects").onclick = () => { $("#prodKeyPanel").hidden = true; const p = $("#prodProjPanel"); p.hidden = !p.hidden; if (!p.hidden) renderProjList(); };
    const textSel = $("#prodTextProvider");
    if (textSel) textSel.onchange = () => {
      const gem = textSel.value === "gemini";
      if ($("#geminiTextField")) $("#geminiTextField").hidden = !gem;
      if ($("#claudeTextField")) $("#claudeTextField").hidden = gem;
    };

    if ($("#prodTestGemini")) $("#prodTestGemini").onclick = testGeminiKey;
    if ($("#prodLoadGeminiModels")) $("#prodLoadGeminiModels").onclick = loadGeminiModels;

    $("#prodSaveKeys").onclick = () => {
      if ($("#prodChannelName")) localStorage.setItem(LS.channelName, $("#prodChannelName").value.trim() || "설루온");
      if (textSel) localStorage.setItem(LS.textProvider, textSel.value);
      localStorage.setItem(LS.claude, $("#prodClaudeKey").value.trim());
      if ($("#prodGeminiKey")) localStorage.setItem(LS.gemini, $("#prodGeminiKey").value.trim());
      if ($("#prodGeminiTextModel")) localStorage.setItem(LS.geminiTextModel, $("#prodGeminiTextModel").value.trim() || "gemini-2.0-flash");
      localStorage.setItem(LS.model, $("#prodModel").value.trim() || "claude-opus-5");
      localStorage.setItem(LS.provider, "kie");
      if ($("#prodKieKey")) localStorage.setItem(LS.kie, $("#prodKieKey").value.trim());
      if ($("#prodKieModel")) localStorage.setItem(LS.kieModel, $("#prodKieModel").value.trim() || "nano-banana-2");
      if ($("#prodKieRes")) localStorage.setItem(LS.kieRes, $("#prodKieRes").value);
      if ($("#prodKieVideoModel")) localStorage.setItem(LS.kieVideoModel, $("#prodKieVideoModel").value.trim() || "veo3-fast");
      localStorage.setItem(LS.typecast, $("#prodTypecastKey").value.trim());
      localStorage.setItem(LS.typecastVoiceKo, $("#prodTypecastVoiceKo").value.trim());
      localStorage.setItem(LS.typecastVoiceJa, $("#prodTypecastVoiceJa").value.trim());
      localStorage.setItem(LS.geminiVoiceKo, $("#prodGeminiVoiceKo").value);
      localStorage.setItem(LS.geminiVoiceJa, $("#prodGeminiVoiceJa").value);
      $("#prodKeyPanel").hidden = true;
      render();
      toast("키를 저장했어요");
    };

    // Gemini 목소리 드롭다운(한/일) 채우기
    ["#prodGeminiVoiceKo", "#prodGeminiVoiceJa"].forEach((sid) => {
      const sel = $(sid); if (!sel || sel.options.length) return;
      GEMINI_VOICES.forEach(([v, label]) => { const o = el("option", null, label); o.value = v; sel.appendChild(o); });
    });
    $("#prodGeminiVoiceKo").value = localStorage.getItem(LS.geminiVoiceKo) || localStorage.getItem(LS.geminiVoice) || "Kore";
    $("#prodGeminiVoiceJa").value = localStorage.getItem(LS.geminiVoiceJa) || localStorage.getItem(LS.geminiVoice) || "Kore";

    // 타입캐스트 목소리 목록 불러오기 + 언어별 지정
    const tcLoad = $("#prodTcLoadVoices");
    if (tcLoad) tcLoad.onclick = () => loadTypecastVoices();
    if ($("#prodTcToKo")) $("#prodTcToKo").onclick = () => { const v = $("#prodTcVoiceSelect").value; if (v) { $("#prodTypecastVoiceKo").value = v; toast("한국어 목소리로 지정"); } };
    if ($("#prodTcToJa")) $("#prodTcToJa").onclick = () => { const v = $("#prodTcVoiceSelect").value; if (v) { $("#prodTypecastVoiceJa").value = v; toast("일본어 목소리로 지정"); } };

    // 언어 전환 (한국어 / 日本語)
    const langT = $("#langToggle");
    if (langT) {
      const syncLang = () => langT.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.lang === project.lang));
      langT.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-lang]");
        if (!b) return;
        const started = project.scenes.length > 0 || project.topics.length > 0;
        if (started && b.dataset.lang !== project.lang &&
            !confirm("언어를 바꾸면 새 프로젝트로 시작합니다. 계속할까요?")) return;
        if (started && b.dataset.lang !== project.lang) { project = newProject(b.dataset.lang); stepIdx = 0; }
        else { project.lang = b.dataset.lang; if (!project.scenes.length) { project.style = defaultStyleFor(project.lang); project.watermark = LANG[project.lang].watermark; } }
        syncLang(); render();
      });
      syncLang();
    }

    // 유튜브 벤치마킹 제목 → 대본 시작 (외부 연결)
    window.prodStartFromTitle = function (title) {
      const t = document.querySelector('.tab[data-tab="producer"]');
      if (t) t.click();
      project = newProject(project.lang);
      project.category = "벤치마킹";
      project.topics = [{ title: title, hook: "유튜브 벤치마킹 주제", why: "" }];
      project.topicIdx = 0;
      goStep("topic");
      toast("이 제목으로 대본을 만들 수 있어요");
    };

    render();
    // 키가 없으면 처음부터 입력창을 열어 눈에 띄게
    if (!claudeKey()) openKeys();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

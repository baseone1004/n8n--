(function () {
  "use strict";

  // ============ 상수 ============
  const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
  const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
  const TTS_MODEL = "gemini-2.5-flash-preview-tts";
  const KIE_CREATE = "https://api.kie.ai/api/v1/jobs/createTask";
  const KIE_RECORD = "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=";
  const LS = {
    claude: "yeti_api_key",          // 대본 공방과 공유
    gemini: "yeti_gemini_key",
    model: "yeti_model_daebon",      // 대본 공방과 공유
    imgModel: "yeti_img_model",
    provider: "yeti_img_provider",   // 'gemini' | 'kie'
    kie: "yeti_kie_key",
    kieModel: "yeti_kie_model",
    typecast: "yeti_typecast_key",
    typecastVoice: "yeti_typecast_voice",
    projects: "yeti_projects"
  };
  const TYPECAST_URL = "https://api.typecast.ai/v1/text-to-speech";

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
  function goStep(k) { stepIdx = stepOf(k); render(); }

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

  // 언어별 그림체 프리셋 — 한국: 반실사 웹툰(만화)풍 / 일본: 부드러운 애니 셀화풍
  const STYLE_PRESETS = {
    ko: [
      { name: "반실사 웹툰 (기본)", desc: "정제된 실사 얼굴 + 웹툰 채색, 차분한 색감", tail: "semi-realistic Korean webtoon manhwa illustration, detailed painterly rendering, refined realistic faces, muted earthy color palette, soft cinematic lighting, mature historical drama mood" },
      { name: "반실사 웹툰 · 진한 명암", desc: "강한 그림자·대비, 묵직한 분위기", tail: "semi-realistic Korean webtoon manhwa illustration, detailed rendering, refined realistic faces, strong dramatic chiaroscuro shadows, high contrast, deep moody color grading, cinematic" },
      { name: "반실사 웹툰 · 부드러운 톤", desc: "은은한 파스텔, 따뜻하고 잔잔", tail: "semi-realistic Korean webtoon manhwa illustration, soft gentle rendering, refined realistic faces, muted soft pastel palette, warm diffused lighting, calm nostalgic mood" },
      { name: "반실사 웹툰 · 디테일 강화", desc: "정교한 선·질감, 섬세한 묘사", tail: "highly detailed semi-realistic Korean manhwa illustration, intricate linework and textures, refined realistic faces, rich painterly detail, natural muted colors, cinematic depth" },
      { name: "반실사 웹툰 · 수채 느낌", desc: "수채화로 물든 부드러운 채색", tail: "semi-realistic Korean manhwa illustration with watercolor-washed coloring, refined realistic faces, soft blended tones, delicate linework, gentle painterly mood" }
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
      lang: lang,
      category: "",
      topics: [],
      topicIdx: -1,
      title: "",
      titleTag: "",
      description: "",
      tags: [],
      style: STYLE_PRESETS[lang][0].tail,
      scenes: [],       // {text, imagePrompt, imageDataUrl, audioDataUrl, durationSec, isIntro, zoom}
      watermark: LANG[lang].watermark,
      thumb: { copies: [], chosen: -1, imagePrompt: "", imageDataUrl: "" }
    };
  }

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
  const imgModel = () => localStorage.getItem(LS.imgModel) || "gemini-2.5-flash-image";
  const imgProvider = () => localStorage.getItem(LS.provider) || "gemini";
  const kieKey = () => localStorage.getItem(LS.kie) || "";
  const kieModel = () => localStorage.getItem(LS.kieModel) || "nano-banana-2";
  const typecastKey = () => localStorage.getItem(LS.typecast) || "";
  const typecastVoice = () => localStorage.getItem(LS.typecastVoice) || "";
  const imgKeyOk = () => imgProvider() === "kie" ? !!kieKey() : !!geminiKey();

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

  // ============ Claude JSON 호출 ============
  async function claudeJSON(system, user, maxTokens) {
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
  function parseJSON(text) {
    let t = text.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1].trim();
    const s = t.indexOf("{"), e = t.lastIndexOf("}");
    const a = t.indexOf("["), b = t.lastIndexOf("]");
    let cut = t;
    if (a >= 0 && (a < s || s < 0)) cut = t.slice(a, b + 1);
    else if (s >= 0) cut = t.slice(s, e + 1);
    return JSON.parse(cut);
  }

  // ============ 이미지 생성 (제공자 분기) ============
  async function genImage(prompt) {
    return imgProvider() === "kie" ? genImageKIE(prompt) : genImageGemini(prompt);
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function blobToDataURL(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  }

  // ---- KIE.ai (createTask → recordInfo 폴링) ----
  async function genImageKIE(prompt) {
    const key = kieKey();
    if (!key) throw new Error("NO_KIE_KEY");
    const create = await fetch(KIE_CREATE, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + key },
      body: JSON.stringify({
        model: kieModel(),
        input: { prompt: prompt + " . 16:9 widescreen cinematic composition, no text, no watermark, no letters.", aspect_ratio: "16:9", output_format: "png" }
      })
    });
    if (!create.ok) {
      let d = ""; try { d = (await create.json()).msg; } catch (e) { d = await create.text(); }
      throw new Error(`KIE ${create.status}: ${d}`);
    }
    const cj = await create.json();
    const taskId = cj.data?.taskId || cj.data?.id || cj.taskId;
    if (!taskId) throw new Error("KIE: taskId 없음 " + JSON.stringify(cj).slice(0, 120));
    for (let n = 0; n < 90; n++) {
      await sleep(2000);
      const q = await fetch(KIE_RECORD + encodeURIComponent(taskId), { headers: { "authorization": "Bearer " + key } });
      if (!q.ok) continue;
      const qj = await q.json();
      const st = qj.data?.state;
      if (st === "success") {
        let rj = qj.data.resultJson;
        if (typeof rj === "string") { try { rj = JSON.parse(rj); } catch (e) { rj = {}; } }
        const url = rj.resultUrls?.[0] || rj.result_urls?.[0] || (Array.isArray(rj.resultUrls) ? rj.resultUrls[0] : null);
        if (!url) throw new Error("KIE: 결과 URL 없음");
        try { const r = await fetch(url); return await blobToDataURL(await r.blob()); }
        catch (e) { return url; } // CORS로 바이트 못 가져오면 URL 그대로(미리보기는 됨, ZIP 제외)
      }
      if (st === "fail") throw new Error("KIE 실패: " + (qj.data.failMsg || "알 수 없음"));
    }
    throw new Error("KIE 시간 초과(3분). 나중에 다시 시도하세요.");
  }

  // ---- Google Gemini 직접 ----
  async function genImageGemini(prompt) {
    const key = geminiKey();
    if (!key) throw new Error("NO_GEMINI_KEY");
    const model = imgModel();
    const body = {
      contents: [{ parts: [{ text: prompt + " . 16:9 widescreen cinematic composition, no text, no watermark, no letters." }] }]
    };
    if (/2\.0-flash-preview-image/.test(model)) {
      body.generationConfig = { responseModalities: ["TEXT", "IMAGE"] };
    }
    const res = await fetch(GEMINI_BASE + model + ":generateContent?key=" + encodeURIComponent(key), {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
    });
    if (!res.ok) {
      let d = ""; try { d = (await res.json()).error?.message; } catch (e) { d = await res.text(); }
      throw new Error(`Gemini 이미지 ${res.status}: ${d}`);
    }
    const j = await res.json();
    const parts = j.candidates?.[0]?.content?.parts || [];
    for (const p of parts) {
      if (p.inlineData?.data) return "data:" + (p.inlineData.mimeType || "image/png") + ";base64," + p.inlineData.data;
    }
    const txt = parts.map((p) => p.text || "").join(" ");
    throw new Error("이미지가 생성되지 않았습니다. " + (txt || "모델 응답에 이미지 없음"));
  }

  // ============ Gemini TTS ============
  async function genTTS(text) {
    const key = geminiKey();
    if (!key) throw new Error("NO_GEMINI_KEY");
    const body = {
      contents: [{ parts: [{ text: text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }
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
    const res = await fetch(TYPECAST_URL, {
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
  function estDur(text) { return Math.max(2, Math.round((text || "").replace(/\s/g, "").length / 5.5)); }

  // ============ 렌더 ============
  function render() {
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
    const needC = !claudeKey(), needI = !imgKeyOk();
    if (!needC && !needI) return;
    const imgLabel = imgProvider() === "kie" ? "KIE.ai 키" : "Google AI 키";
    const bar = el("div", "keybar");
    const txt = el("div", null,
      "🔑 시작하려면 API 키가 필요해요 — " +
      (needC ? "<b>Anthropic 키</b>" : "") + (needC && needI ? " · " : "") +
      (needI ? `<b>${imgLabel}</b>` : ""));
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
      w.appendChild(st);
    });
  }

  function renderNav() {
    const nav = $("#prodNav"); nav.innerHTML = "";
    const back = el("button", "btn sm", "← 뒤로");
    back.disabled = stepIdx === 0 || busy;
    back.onclick = () => { if (stepIdx > 0) { stepIdx--; render(); } };
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
    if (String(e.message).includes("NO_CLAUDE_KEY")) return "⚙ 키 설정에서 <b>Anthropic API 키</b>를 먼저 넣어주세요.";
    if (String(e.message).includes("NO_GEMINI_KEY")) return "⚙ 키 설정에서 <b>Google AI(Gemini) 키</b>를 먼저 넣어주세요.";
    if (String(e.message).includes("NO_KIE_KEY")) return "⚙ 키 설정에서 <b>KIE.ai 키</b>를 먼저 넣어주세요.";
    if (String(e.message).includes("Failed to fetch")) return "네트워크/CORS 오류. 인터넷 연결과 키를 확인하세요. (게시본이 아닌 로컬 파일에서 실행해야 합니다.)";
    return "오류: " + esc(e.message);
  }
  function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

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

  async function loadTopics() {
    if (!project.category) { toast("카테고리를 먼저 고르세요"); return; }
    const body = $("#prodBody");
    busy = true; loading(body, "떡상할 만한 주제 10개를 뽑는 중…"); renderNav();
    try {
      const sys = `너는 ${LANG[project.lang].audience} 채널 기획 전문가다. 조회수가 잘 나오는(떡상하는) 주제를 잘 안다. 반드시 유효한 JSON만 출력한다. 설명·군더더기 금지.`;
      const usr =
`카테고리: "${project.category}"

이 카테고리로 ${LANG[project.lang].audience}에서 클릭률·조회수가 높을 만한 이야기 주제 10개를 추천해줘.
자극적이되 흔한 클리셰의 반복은 피하고, 서로 소재가 겹치지 않게 분산해줘.
제목은 아래 검증된 패턴 중 하나를 활용해서 궁금증을 남긴다(결말·정체 노출 금지):
${TITLE_PATTERNS}
각 주제는 아래 JSON 배열 형식으로만:
[
  {"title":"영상 제목 후보(호기심 유발, 25~35자)","hook":"왜 끌리는지 한 줄 훅","why":"떡상 포인트 한 줄"},
  ... (정확히 10개)
]${langDirective()}`;
      const arr = await claudeJSON(sys, usr, 4000);
      project.topics = Array.isArray(arr) ? arr.slice(0, 10) : [];
      project.topicIdx = -1;
      busy = false; goStep("topic");
    } catch (e) {
      busy = false; renderCategory(body); showErr(body, keyMissingMsg(e));
    } finally { busy = false; }
  }

  // ---- 2. 주제 선택 ----
  function renderTopic(body) {
    body.appendChild(el("h2", "prod-h", "마음에 드는 주제를 고르세요"));
    body.appendChild(el("p", "prod-sub", `카테고리: <b>${esc(project.category)}</b> · 하나를 선택하면 제목·태그·설명·대본을 만들어 드려요.`));
    const list = el("div", "topic-list");
    project.topics.forEach((t, i) => {
      const c = el("div", "topic-card" + (project.topicIdx === i ? " sel" : ""));
      c.appendChild(el("div", "topic-rank", `${i + 1}위`));
      c.appendChild(el("div", "topic-title", esc(t.title || "")));
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

  async function loadScript() {
    if (project.topicIdx < 0) { toast("주제를 하나 고르세요"); return; }
    const body = $("#prodBody");
    busy = true; loading(body, "제목·태그·설명·대본을 짓는 중… (조금 걸려요)"); renderNav();
    try {
      const topic = project.topics[project.topicIdx];
      const ja = project.lang === "ja";
      const sys = `너는 ${LANG[project.lang].audience} 대본 작가다. 낭독용 옛이야기체로 장면이 눈에 그려지게 쓴다. 규칙:
- 결말·정체·반전은 제목과 인트로에서 절대 미리 노출하지 않는다.
- 나레이션은 '~습니다'와 '~지요'를 섞고, 같은 어미를 3문장 이상 연속하지 않는다.${ja ? " (일본어면 정중한 낭독체 です/ます를 자연스럽게 섞는다.)" : ""}
- 요약 나레이션보다 인물 대사를 자주 넣는다. 수사 질문('그런데 이게 웬일입니까?')·짧은 전환 문장('그때였습니다')으로 리듬을 만든다.
- 문장은 15~25자로 짧게. ${ja ? "쉬운 일본어로 쓴다." : "한자 없이 순 한글로 쓴다."} 비하 호칭은 전체 2회 이하.
- 반드시 유효한 JSON만 출력.`;
      const usr =
`카테고리: ${project.category}
선택한 주제: ${topic.title}
훅: ${topic.hook || ""}

이 주제로 유튜브 영상 한 편 분량의 패키지를 만들어줘.${langDirective()}

[제목] 아래 패턴 중 하나로(결말·정체 노출 금지):
${TITLE_PATTERNS}

[인트로 = 첫 장면(isIntro:true), 6문장 포맷]
1) 파격적인 대사 한 줄(큰따옴표, 날것의 감정, 구체적 숫자·물건)
2~4) 상황을 압축해서. 결과·결말 절대 금지. '지금 이 순간'만
5) '그런데…'로 시작하는 궁금증(닫힌 질문 금지)
6) 고정 구독 유도 문구: "${ja ? "→ 위 문장을 자연스러운 일본어로" : CTA_KO}"

[본문 = 7단계 골격으로 장면 전개]
발단(옛날 옛적 구체적 지역, 주인공의 결핍) → 일상과 갈등의 씨앗 → 사건 발생 → 시련(가장 길게, 장소·상대 다른 에피소드 여럿) → 위기(밑바닥) → 반전·해결(증표로 정체·결백 증명, 악인 몰락, 보상) → 마무리.
초반에 심은 결핍·물건·증표를 후반에 회수한다.

[마지막 장면 = 마무리]
이 이야기에만 맞는 주제 한 문장(뻔한 교훈 금지) + 이어서 고정 마무리 멘트: "${ja ? "→ 아래를 자연스러운 일본어로: " + OUTRO_KO : OUTRO_KO}"

JSON만:
{
  "title": "최종 영상 제목(호기심 자극, 30자 내외, 결말 노출 금지)",
  "titleTag": "제목 옆 태그/키워드 2~4개 (${ja ? "#日本昔話 등" : "#야담 #실화 등"})",
  "description": "유튜브 설명란 글 (4~6문장, 이야기 소개 + 구독 유도)",
  "tags": ["설명 아래 태그", "8~12개"],
  "scenes": [
    {"text":"장면1 = 인트로(위 6문장 포맷)", "isIntro": true},
    {"text":"장면2 ...", "isIntro": false}
  ]
}
장면(scenes)은 14~18개. 각 장면은 한 컷 이미지로 그릴 수 있는 한 순간. 전체가 자연스럽게 이어지는 완결된 이야기.`;
      const pkg = await claudeJSON(sys, usr, 12000);
      project.title = pkg.title || topic.title;
      project.titleTag = pkg.titleTag || "";
      project.description = pkg.description || "";
      project.tags = Array.isArray(pkg.tags) ? pkg.tags : [];
      project.scenes = (pkg.scenes || []).map((s, i) => ({
        text: s.text || "", isIntro: !!s.isIntro,
        imagePrompt: "", imageDataUrl: "", audioDataUrl: "", durationSec: 0,
        zoom: s.isIntro ? "in" : (i % 2 ? "out" : "in")
      }));
      if (project.scenes.length && !project.scenes.some((s) => s.isIntro)) project.scenes[0].isIntro = true;
      saveProject();
      busy = false; goStep("script");
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
    pkg.appendChild(field("제목", () => project.title, false, (v) => { project.title = v; saveDebounced(); }));
    pkg.appendChild(field("제목 옆 태그", () => project.titleTag, false, (v) => { project.titleTag = v; saveDebounced(); }));
    pkg.appendChild(field("설명", () => project.description, true, (v) => { project.description = v; saveDebounced(); }));
    pkg.appendChild(field("설명 아래 태그 (쉼표로 구분)", () => project.tags.join(", "), true, (v) => { project.tags = v.split(",").map((x) => x.trim()).filter(Boolean); saveDebounced(); }));

    const sceneHead = el("div", "pkg-field");
    sceneHead.appendChild(el("div", "pkg-label", `<span>장면 대본 (${project.scenes.length}개)</span>`));
    pkg.appendChild(sceneHead);
    project.scenes.forEach((s, i) => pkg.appendChild(sceneTextCard(s, i)));
    body.appendChild(pkg);

    navBtn("이미지 프롬프트 만들기 →", loadPrompts, true);
  }

  function sceneTextCard(s, i) {
    const c = el("div", "scene");
    const head = el("div", "scene-head");
    head.appendChild(el("div", "scene-no", `장면 ${i + 1}`));
    const badge = el("span", "scene-badge", s.isIntro ? "인트로" : "일반");
    badge.style.cursor = "pointer"; badge.title = "인트로 여부 전환";
    badge.onclick = () => { s.isIntro = !s.isIntro; badge.textContent = s.isIntro ? "인트로" : "일반"; saveDebounced(); };
    head.appendChild(badge);
    c.appendChild(head);
    const ta = el("textarea"); ta.value = s.text; ta.oninput = () => { s.text = ta.value; saveDebounced(); };
    c.appendChild(ta);
    return c;
  }

  // ---- 4. 이미지 프롬프트 ----
  async function loadPrompts() {
    const body = $("#prodBody");
    busy = true; loading(body, "각 장면의 이미지 프롬프트를 만드는 중…"); renderNav();
    try {
      const sys = "너는 대본을 나노 바나나(이미지 생성)용 영어 프롬프트로 바꾸는 전문가다. 각 장면을 한 컷으로 그릴 수 있게 시각적으로 구체화한다. 반드시 유효한 JSON 배열만 출력.";
      const scenes = project.scenes.map((s, i) => `${i + 1}${s.isIntro ? "(인트로)" : ""}: ${s.text}`).join("\n");
      const usr =
`화풍(STYLE_TAIL): ${project.style}
인물 기본: ${LANG[project.lang].setting}

아래 장면들을 각각 위 화풍으로 그릴 영어 이미지 프롬프트로 만들어줘. 규칙:
- 각 프롬프트는 완결된 영어 문장 2~4개. 콤마 키워드 나열 금지.
- 인물은 ${LANG[project.lang].setting} 를 명시하고, 같은 인물은 장면마다 같은 복식·머리로 일관되게 묘사(외투/상의/하의 분리).
- 장면마다 샷을 다르게(클로즈업/미디엄/롱/투샷/오버숄더/로우앵글/측면 등 이웃 장면과 다르게).
- 인물 자세를 장면마다 다르게(걷다 멈춤/뒤돌아봄/손 뻗기/기대기/먼 곳 응시/웅크려 살핌 등). '정면에서 두 손 모은' 반복 금지.
- 배경은 실제 로케이션(마당/논밭/돌담/숲/관아/초가/기와집 등). 회색 스튜디오 배경 금지.
- 각 프롬프트 끝에 반드시: "no text, no letters, no words, no modern objects. ${project.style}"
- 결말·정체를 이미지로 스포일하지 않는다.
JSON 배열만, 장면 순서대로 정확히 ${project.scenes.length}개:
["english image prompt for scene 1", "...", ...]

장면들:
${scenes}`;
      const arr = await claudeJSON(sys, usr, 8000);
      (arr || []).forEach((p, i) => { if (project.scenes[i]) project.scenes[i].imagePrompt = String(p); });
      saveProject();
      busy = false; goStep("prompt");
    } catch (e) {
      busy = false; render(); showErr($("#prodBody"), keyMissingMsg(e));
    } finally { busy = false; }
  }

  function renderPrompt(body) {
    body.appendChild(el("h2", "prod-h", "이미지 프롬프트"));
    body.appendChild(el("p", "prod-sub", `그림체를 고르면 모든 장면에 적용돼요. ${project.lang === "ja" ? "일본 민담용 애니 셀화풍" : "한국 야담용 반실사 웹툰풍"} 중에서 선택하세요.`));

    body.appendChild(el("div", "field-label", "그림체 고르기"));
    const grid = el("div", "style-list");
    stylePresetsFor(project.lang).forEach((preset) => {
      const chip = el("button", "style-chip" + (project.style === preset.tail ? " sel" : ""));
      chip.innerHTML = `<b>${esc(preset.name)}</b><span>${esc(preset.desc)}</span>`;
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
    navBtn("이미지 전부 생성 →", () => { goStep("image"); genAllImages(); }, true);
  }

  // ---- 5. 이미지 생성 ----
  function renderImage(body) {
    body.appendChild(el("h2", "prod-h", "이미지 생성"));
    const prov = imgProvider() === "kie" ? "KIE.ai 크레딧" : "Google Gemini(장당 과금)";
    body.appendChild(el("p", "prod-sub", `현재 이미지 생성 방식: <b>${prov}</b> (⚙ 키 설정에서 변경). 또는 다른 데서 만든 이미지를 <b>올리기</b>로 넣어도 돼요.`));

    const tip = el("div", "keybar");
    tip.style.marginBottom = "18px";
    tip.innerHTML = "💰 비용 팁 — <b>KIE.ai 크레딧</b> 또는 <b>드롭샷 Pro(나노 바나나 무제한)</b>에서 뽑아 <b>이미지 올리기</b>로 넣으면 저렴/무료. 앱에서 Google 직접 생성은 장당 약 50~60원.";
    body.appendChild(tip);

    const pkg = el("div", "pkg");
    project.scenes.forEach((s, i) => pkg.appendChild(sceneImageCard(s, i)));
    body.appendChild(pkg);
    navBtn("전체 다시 생성", genAllImages);
    navBtn("이미지 전체 다운로드", downloadImagesZip);
    navBtn("썸네일 만들기 →", () => { goStep("thumb"); }, true);
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
    const one = el("button", "btn sm", "🍌 나노바나나 생성");
    one.onclick = () => genOneImage(i);
    acts.appendChild(one);

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
    if (!files.length) { toast("먼저 이미지를 생성하세요"); return; }
    download(makeZip(files), `${(project.title || "images").replace(/[\\/:*?"<>|]/g, "_")}_이미지.zip`);
    toast(files.length + "개 이미지를 내려받았어요");
  }

  async function genOneImage(i) {
    const s = project.scenes[i];
    const box = $("#img-" + i);
    if (box) { box.innerHTML = ""; box.appendChild(el("div", "spinner")); }
    try {
      s.imageDataUrl = await genImage(s.imagePrompt || s.text);
      saveProject();
      if (box) { box.innerHTML = ""; const im = el("img"); im.src = s.imageDataUrl; box.appendChild(im); }
    } catch (e) {
      if (box) { box.innerHTML = ""; box.textContent = "실패"; }
      const m = String(e.message);
      toast("이미지 실패: " + (/NO_(GEMINI|KIE)_KEY/.test(m) ? "이미지 키 필요" : /Failed to fetch/.test(m) ? "CORS/네트워크(로컬 실행 확인)" : m.slice(0, 60)));
    }
  }
  async function genAllImages() {
    if (!imgKeyOk()) { toast("⚙ 이미지 생성용 키를 먼저 넣어주세요"); openKeys(); return; }
    for (let i = 0; i < project.scenes.length; i++) { await genOneImage(i); }
    toast("이미지 생성 완료");
  }

  // ---- 5.5 썸네일 ----
  function renderThumb(body) {
    body.appendChild(el("h2", "prod-h", "썸네일"));
    body.appendChild(el("p", "prod-sub", "클릭을 부르는 <b>썸네일 카피 4종</b>을 만들고, 고른 카피에 맞춰 <b>썸네일 이미지</b>(글자 들어갈 자리 비움)를 생성합니다. 글자는 캡컷/편집기에서 얹으세요."));

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
        card.appendChild(el("div", "topic-rank", c.pos || (i < 2 ? "좌측 4줄" : "하단 2줄")));
        const lines = el("div", "topic-title");
        lines.style.whiteSpace = "pre-line"; lines.style.fontSize = "18px";
        lines.textContent = (c.lines || []).join("\n");
        card.appendChild(lines);
        if (c.imageKo) card.appendChild(el("div", "topic-hook", "🖼 " + esc(c.imageKo)));
        card.onclick = () => { t.chosen = i; saveDebounced(); render(); };
        list.appendChild(card);
      });
      body.appendChild(list);

      if (t.chosen >= 0) {
        const box = el("div", "scene");
        box.style.marginTop = "16px";
        box.appendChild(el("div", "scene-no", "썸네일 이미지"));
        const imgWrap = el("div", "scene-img"); imgWrap.style.width = "100%"; imgWrap.style.maxWidth = "480px"; imgWrap.id = "thumbImg";
        if (t.imageDataUrl) { const im = el("img"); im.src = t.imageDataUrl; imgWrap.appendChild(im); }
        else imgWrap.textContent = "아직 생성 안 됨";
        box.appendChild(imgWrap);
        const acts = el("div", "scene-actions");
        const gen = el("button", "btn sm btn-primary", t.imageDataUrl ? "다시 생성" : "썸네일 이미지 생성");
        gen.onclick = genThumbImage;
        acts.appendChild(gen);
        if (t.imageDataUrl) {
          const dl = el("button", "btn sm", "이미지 다운로드");
          dl.onclick = () => { if (/^https?:/.test(t.imageDataUrl)) window.open(t.imageDataUrl); else { const m = t.imageDataUrl.match(/^data:(image\/\w+);base64,(.*)$/); if (m) download(new Blob([base64ToBytes(m[2])], { type: m[1] }), "thumbnail.png"); } };
          acts.appendChild(dl);
        }
        const cp = el("button", "btn sm btn-ghost", "카피 복사");
        cp.onclick = () => { navigator.clipboard.writeText((t.copies[t.chosen].lines || []).join("\n")); toast("카피를 복사했어요"); };
        acts.appendChild(cp);
        box.appendChild(acts);
        body.appendChild(box);
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
- imageEn: 위 장면의 영어 이미지 프롬프트(완결 문장 2~3개). ${LANG[project.lang].setting}. 카피 자리(좌측4줄→왼쪽, 하단2줄→아래)를 비운다. 얼굴 잘 보이게, 어둠으로 덮지 않기. 글자/자막/말풍선 절대 없음.
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
    const box = $("#thumbImg");
    if (box) { box.innerHTML = ""; box.appendChild(el("div", "spinner")); }
    try {
      const c = t.copies[t.chosen];
      const prompt = (c.imageEn || c.imageKo || project.title) +
        " . emotional climax moment, face clearly visible, warm readable lighting, leave empty space for title text. no text, no letters, no captions, no speech bubbles. " + project.style;
      t.imagePrompt = prompt;
      t.imageDataUrl = await genImage(prompt);
      saveProject(); render();
    } catch (e) {
      if (box) { box.innerHTML = ""; box.textContent = "실패"; }
      toast("썸네일 실패: " + (/NO_(GEMINI|KIE)_KEY/.test(String(e.message)) ? "이미지 키 필요" : String(e.message).slice(0, 60)));
    }
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
      const grok = el("button", "btn sm", "🎥 Grok 영상 프롬프트");
      grok.onclick = () => genGrokIntro(i, grok);
      ctl.appendChild(grok);
    }
    right.appendChild(ctl);

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
    if (m.includes("NO_CLAUDE_KEY")) return "Anthropic 키 필요";
    return m.slice(0, 60);
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
      bytes: strBytes(`■ 제목\n${project.title}\n\n■ 제목 옆 태그\n${project.titleTag}\n\n■ 설명\n${project.description}\n\n■ 태그\n${project.tags.join(", ")}\n\n■ 워터마크(왼쪽 위 문구)\n${project.watermark}`)
    });
    files.push({ name: "capcut_guide.txt", bytes: strBytes("images/ 를 번호순으로 타임라인에 올리고, audio/ 의 같은 번호 음성을 아래에 맞추세요.\n인트로 외 이미지는 줌 인/아웃 효과, 자막은 subtitles.srt 가져오기.\n왼쪽 위 텍스트: " + project.watermark) });

    if (files.length <= 4) { toast("먼저 이미지/음성을 생성하세요"); return; }
    const blob = makeZip(files);
    download(blob, `${(project.title || "야담영상").replace(/[\\/:*?"<>|]/g, "_")}_캡컷.zip`);
    toast("ZIP을 내려받았어요");
  }

  // ============ 프로젝트 저장 ============
  let saveT;
  function saveDebounced() { clearTimeout(saveT); saveT = setTimeout(saveProject, 500); }
  function loadProjects() { try { return JSON.parse(localStorage.getItem(LS.projects)) || []; } catch (e) { return []; } }
  function saveProject() {
    const all = loadProjects();
    const idx = all.findIndex((p) => p.id === project.id);
    const meta = { ...project };
    if (idx >= 0) all[idx] = meta; else all.unshift(meta);
    try { localStorage.setItem(LS.projects, JSON.stringify(all)); }
    catch (e) { toast("저장 공간이 부족해요(이미지가 많으면 용량 초과). 캡컷으로 내보낸 뒤 새로 시작하세요."); }
  }

  function renderProjList() {
    const w = $("#prodProjList"); w.innerHTML = "";
    const all = loadProjects();
    if (!all.length) { w.appendChild(el("div", "prod-sub", "저장된 프로젝트가 없어요.")); return; }
    all.forEach((p) => {
      const it = el("div", "proj-item");
      const t = el("div", "pi-title", esc(p.title || p.topics?.[p.topicIdx]?.title || p.category || "제목 미정"));
      t.onclick = () => { project = p; stepIdx = p.scenes?.length ? 2 : 1; $("#prodProjPanel").hidden = true; render(); };
      it.appendChild(t);
      it.appendChild(el("div", "pi-meta", new Date(p.createdAt).toLocaleDateString("ko")));
      const del = el("button", null, "삭제");
      del.onclick = () => { localStorage.setItem(LS.projects, JSON.stringify(loadProjects().filter((x) => x.id !== p.id))); renderProjList(); };
      it.appendChild(del);
      w.appendChild(it);
    });
  }

  function openKeys() {
    $("#prodProjPanel").hidden = true;
    const p = $("#prodKeyPanel"); p.hidden = !p.hidden;
    if (!p.hidden) {
      $("#prodClaudeKey").value = claudeKey();
      $("#prodGeminiKey").value = geminiKey();
      $("#prodModel").value = claudeModel();
      $("#prodImgModel").value = imgModel();
      const provSel = $("#prodProvider");
      if (provSel) { provSel.value = imgProvider(); provSel.dispatchEvent(new Event("change")); }
      $("#prodKieKey").value = kieKey();
      $("#prodKieModel").value = kieModel();
      $("#prodTypecastKey").value = typecastKey();
      $("#prodTypecastVoice").value = typecastVoice();
    }
  }

  // ============ 초기화 ============
  function init() {
    // 상단 제목을 활성 탭에 맞춰 갱신
    const tabsEl = document.getElementById("tabs");
    const topTitle = document.getElementById("topTitle");
    if (tabsEl && topTitle) tabsEl.addEventListener("click", (e) => {
      const t = e.target.closest(".tab");
      if (t && t.dataset.title) topTitle.textContent = t.dataset.title;
    });

    $("#prodSettings").onclick = openKeys;
    $("#prodProjects").onclick = () => { $("#prodKeyPanel").hidden = true; const p = $("#prodProjPanel"); p.hidden = !p.hidden; if (!p.hidden) renderProjList(); };
    const provSel = $("#prodProvider");
    const syncProvFields = () => {
      const kie = provSel.value === "kie";
      $("#kieFields").hidden = !kie;
      $("#geminiFields").hidden = kie;
    };
    if (provSel) provSel.onchange = syncProvFields;

    $("#prodSaveKeys").onclick = () => {
      localStorage.setItem(LS.claude, $("#prodClaudeKey").value.trim());
      localStorage.setItem(LS.gemini, $("#prodGeminiKey").value.trim());
      localStorage.setItem(LS.model, $("#prodModel").value.trim() || "claude-opus-5");
      localStorage.setItem(LS.imgModel, $("#prodImgModel").value.trim() || "gemini-2.5-flash-image");
      localStorage.setItem(LS.provider, provSel ? provSel.value : "gemini");
      localStorage.setItem(LS.kie, $("#prodKieKey").value.trim());
      localStorage.setItem(LS.kieModel, $("#prodKieModel").value.trim() || "nano-banana-2");
      localStorage.setItem(LS.typecast, $("#prodTypecastKey").value.trim());
      localStorage.setItem(LS.typecastVoice, $("#prodTypecastVoice").value.trim());
      $("#prodKeyPanel").hidden = true;
      render();
      toast("키를 저장했어요");
    };

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
        else { project.lang = b.dataset.lang; if (!project.scenes.length) { project.style = STYLE_PRESETS[project.lang][0].tail; project.watermark = LANG[project.lang].watermark; } }
        syncLang(); render();
      });
      syncLang();
    }

    render();
    // 키가 없으면 처음부터 입력창을 열어 눈에 띄게
    if (!claudeKey()) openKeys();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

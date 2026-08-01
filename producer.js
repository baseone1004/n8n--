(function () {
  "use strict";

  // ============ 상수 ============
  const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
  const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
  const TTS_MODEL = "gemini-2.5-flash-preview-tts";
  const LS = {
    claude: "yeti_api_key",          // 대본 공방과 공유
    gemini: "yeti_gemini_key",
    model: "yeti_model_daebon",      // 대본 공방과 공유
    imgModel: "yeti_img_model",
    projects: "yeti_projects"
  };

  const STEPS = [
    { key: "category", name: "주제 고르기" },
    { key: "topic", name: "주제 추천" },
    { key: "script", name: "대본·정보" },
    { key: "prompt", name: "이미지 프롬프트" },
    { key: "image", name: "이미지 생성" },
    { key: "voice", name: "음성·자막" },
    { key: "export", name: "캡컷 내보내기" }
  ];

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

  const STYLE_TAIL_DEFAULT =
    "semi-realistic Korean manhwa illustration, painterly rendering, refined detailed eyes, clean confident linework, soft cinematic shading, mature historical drama tone";

  // ============ 상태 ============
  let stepIdx = 0;
  let busy = false;
  let project = newProject();

  function newProject() {
    return {
      id: "p" + Date.now(),
      createdAt: Date.now(),
      category: "",
      topics: [],
      topicIdx: -1,
      title: "",
      titleTag: "",
      description: "",
      tags: [],
      style: STYLE_TAIL_DEFAULT,
      scenes: [],       // {text, imagePrompt, imageDataUrl, audioDataUrl, durationSec, isIntro}
      watermark: "AI로 제작되었습니다"
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

  // ============ Gemini 이미지 ============
  async function genImage(prompt) {
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
    const key = STEPS[stepIdx].key;
    ({
      category: renderCategory, topic: renderTopic, script: renderScript,
      prompt: renderPrompt, image: renderImage, voice: renderVoice, export: renderExport
    }[key])(body);
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
      const sys = "너는 한국 시니어(50~70대) 대상 '야담·옛날이야기' 유튜브 채널 기획 전문가다. 조회수가 잘 나오는(떡상하는) 주제를 잘 안다. 반드시 유효한 JSON만 출력한다. 설명·군더더기 금지.";
      const usr =
`카테고리: "${project.category}"

이 카테고리로 시니어 야담 유튜브에서 클릭률·조회수가 높을 만한 이야기 주제 10개를 추천해줘.
자극적이되 흔한 클리셰의 반복은 피하고, 서로 소재가 겹치지 않게 분산해줘.
각 주제는 아래 JSON 배열 형식으로만:
[
  {"title":"영상 제목 후보(호기심 유발, 25자 내외)","hook":"왜 끌리는지 한 줄 훅","why":"떡상 포인트 한 줄"},
  ... (정확히 10개)
]`;
      const arr = await claudeJSON(sys, usr, 4000);
      project.topics = Array.isArray(arr) ? arr.slice(0, 10) : [];
      project.topicIdx = -1;
      busy = false; stepIdx = 1; render();
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
      const sys = "너는 한국 시니어 대상 야담 유튜브 대본 작가다. 몰입되는 옛이야기체(옛날 옛적…)로, 장면이 눈에 그려지게 쓴다. 반드시 유효한 JSON만 출력한다.";
      const usr =
`카테고리: ${project.category}
선택한 주제: ${topic.title}
훅: ${topic.hook || ""}

이 주제로 유튜브 영상 한 편 분량의 패키지를 만들어줘. JSON만:
{
  "title": "최종 영상 제목(호기심 자극, 30자 내외)",
  "titleTag": "제목 옆에 붙일 태그/키워드 (예: #야담 #실화 형태, 2~4개)",
  "description": "유튜브 설명란 글 (4~6문장, 이야기 소개 + 구독 유도)",
  "tags": ["설명 아래 넣을 태그", "8~12개", "..."],
  "scenes": [
    {"text":"장면1 나레이션(옛이야기체, 2~4문장). 첫 장면은 강렬한 도입=인트로.", "isIntro": true},
    {"text":"장면2 ...", "isIntro": false}
  ]
}
장면(scenes)은 12~18개로 나눠줘. 각 장면은 한 컷의 이미지로 그릴 수 있는 하나의 순간이어야 한다. 전체가 자연스럽게 이어지는 완결된 이야기여야 한다.`;
      const pkg = await claudeJSON(sys, usr, 12000);
      project.title = pkg.title || topic.title;
      project.titleTag = pkg.titleTag || "";
      project.description = pkg.description || "";
      project.tags = Array.isArray(pkg.tags) ? pkg.tags : [];
      project.scenes = (pkg.scenes || []).map((s) => ({
        text: s.text || "", isIntro: !!s.isIntro,
        imagePrompt: "", imageDataUrl: "", audioDataUrl: "", durationSec: 0
      }));
      if (project.scenes.length && !project.scenes.some((s) => s.isIntro)) project.scenes[0].isIntro = true;
      saveProject();
      busy = false; stepIdx = 2; render();
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
      const sys = "너는 대본을 Google 이미지 생성 모델(나노 바나나)용 영어 프롬프트로 바꾸는 전문가다. 조선시대 배경·한복 고증을 지키고, 각 장면을 한 컷으로 그릴 수 있게 시각적으로 구체화한다. 색상·조명 단어는 최소화하고 인물/구도/행동 중심. 반드시 유효한 JSON만 출력.";
      const scenes = project.scenes.map((s, i) => `${i + 1}${s.isIntro ? "(인트로)" : ""}: ${s.text}`).join("\n");
      const usr =
`화풍(STYLE_TAIL): ${project.style}

아래 장면들 각각을 위 화풍으로 그릴 영어 이미지 프롬프트로 만들어줘.
인물은 Korean, Joseon-era, 한복 명사를 명시. 장면 흐름상 같은 인물은 일관되게 묘사.
JSON 배열만, 장면 순서대로 정확히 ${project.scenes.length}개:
["english image prompt for scene 1", "...", ...]

장면들:
${scenes}`;
      const arr = await claudeJSON(sys, usr, 8000);
      (arr || []).forEach((p, i) => { if (project.scenes[i]) project.scenes[i].imagePrompt = String(p); });
      saveProject();
      busy = false; stepIdx = 3; render();
    } catch (e) {
      busy = false; render(); showErr($("#prodBody"), keyMissingMsg(e));
    } finally { busy = false; }
  }

  function renderPrompt(body) {
    body.appendChild(el("h2", "prod-h", "이미지 프롬프트"));
    body.appendChild(el("p", "prod-sub", `화풍: <b>${esc(project.style)}</b> · 프롬프트를 다듬고 다음에서 실제 이미지를 만듭니다.`));
    const styleF = field("화풍(STYLE_TAIL) — 영어", () => project.style, true, (v) => { project.style = v; saveDebounced(); });
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
    navBtn("이미지 전부 생성 →", () => { stepIdx = 4; render(); genAllImages(); }, true);
  }

  // ---- 5. 이미지 생성 ----
  function renderImage(body) {
    body.appendChild(el("h2", "prod-h", "이미지 생성"));
    body.appendChild(el("p", "prod-sub", "나노 바나나(Gemini)로 장면 이미지를 만듭니다. 마음에 안 들면 <b>다시 생성</b>을 누르세요."));
    const pkg = el("div", "pkg");
    project.scenes.forEach((s, i) => pkg.appendChild(sceneImageCard(s, i)));
    body.appendChild(pkg);
    navBtn("전체 다시 생성", genAllImages);
    navBtn("음성·자막 만들기 →", () => { stepIdx = 5; render(); }, true);
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
    const one = el("button", "btn sm", "이 장면 생성");
    one.onclick = () => genOneImage(i);
    acts.appendChild(one);
    right.appendChild(acts);
    row.appendChild(right);
    c.appendChild(row);
    return c;
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
      toast("이미지 실패: " + (String(e.message).includes("NO_GEMINI_KEY") ? "Gemini 키 필요" : e.message.slice(0, 60)));
    }
  }
  async function genAllImages() {
    if (!geminiKey()) { toast("⚙ 키 설정에서 Google AI 키를 넣어주세요"); openKeys(); return; }
    for (let i = 0; i < project.scenes.length; i++) { await genOneImage(i); }
    toast("이미지 생성 완료");
  }

  // ---- 6. 음성·자막 ----
  function renderVoice(body) {
    body.appendChild(el("h2", "prod-h", "음성 · 자막"));
    body.appendChild(el("p", "prod-sub", "Gemini TTS로 장면별 나레이션을 만들고, 그 길이에 맞춰 <b>자막(SRT)</b>을 자동으로 맞춥니다."));
    const pkg = el("div", "pkg");
    project.scenes.forEach((s, i) => {
      const c = el("div", "scene");
      const head = el("div", "scene-head");
      head.appendChild(el("div", "scene-no", `장면 ${i + 1}`));
      head.appendChild(el("span", "pi-meta", s.durationSec ? `${s.durationSec.toFixed(1)}초` : "미생성"));
      c.appendChild(head);
      c.appendChild(el("div", null, esc(s.text)));
      const acts = el("div", "scene-actions");
      const gen = el("button", "btn sm", "음성 생성");
      gen.onclick = () => genOneVoice(i, gen);
      acts.appendChild(gen);
      if (s.audioDataUrl) {
        const au = el("audio"); au.controls = true; au.src = s.audioDataUrl; au.style.height = "34px";
        acts.appendChild(au);
      }
      c.appendChild(acts);
      pkg.appendChild(c);
    });
    body.appendChild(pkg);
    navBtn("전체 음성 생성", genAllVoices);
    navBtn("캡컷 내보내기 →", () => { stepIdx = 6; render(); }, true);
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

  // ---- 7. 캡컷 내보내기 ----
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
        const m = s.audioDataUrl.match(/^data:audio\/\w+;base64,(.*)$/);
        if (m) files.push({ name: `audio/scene_${pad(i)}.wav`, bytes: base64ToBytes(m[1]) });
      }
    });
    files.push({ name: "subtitles.srt", bytes: strBytes(buildSRT()) });
    files.push({ name: "script.txt", bytes: strBytes(project.scenes.map((s, i) => `[장면 ${i + 1}${s.isIntro ? " 인트로" : ""}]\n${s.text}`).join("\n\n")) });
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
    $("#prodSaveKeys").onclick = () => {
      localStorage.setItem(LS.claude, $("#prodClaudeKey").value.trim());
      localStorage.setItem(LS.gemini, $("#prodGeminiKey").value.trim());
      localStorage.setItem(LS.model, $("#prodModel").value.trim() || "claude-opus-5");
      localStorage.setItem(LS.imgModel, $("#prodImgModel").value.trim() || "gemini-2.5-flash-image");
      $("#prodKeyPanel").hidden = true;
      toast("키를 저장했어요");
    };
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

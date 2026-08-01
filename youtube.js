(function () {
  "use strict";
  const API = "https://www.googleapis.com/youtube/v3/";
  const LS_KEY = "yeti_yt_key";

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const ytKey = () => localStorage.getItem(LS_KEY) || "";
  const nf = (n) => Number(n || 0).toLocaleString("ko");
  const esc = (s) => { const d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; };
  function fmtDate(s) { const d = new Date(s); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; }
  function daysAgo(s) { return Math.floor((Date.now() - new Date(s)) / 86400000); }

  let tT;
  function toast(m) {
    const t = $("#toast"); if (!t) return;
    t.textContent = m; t.hidden = false;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(tT); tT = setTimeout(() => { t.classList.remove("show"); setTimeout(() => (t.hidden = true), 260); }, 2200);
  }

  async function ytGet(path, params) {
    const key = ytKey();
    if (!key) throw new Error("NO_YT_KEY");
    const q = new URLSearchParams(Object.assign({ key: key }, params)).toString();
    const res = await fetch(API + path + "?" + q);
    if (!res.ok) {
      let d = ""; try { d = (await res.json()).error?.message; } catch (e) { d = await res.text(); }
      throw new Error(`YouTube ${res.status}: ${d}`);
    }
    return res.json();
  }
  function errMsg(e) {
    const m = String(e.message);
    if (m.includes("NO_YT_KEY")) return "먼저 YouTube Data API 키를 저장하세요.";
    if (/Failed to fetch/.test(m)) return "네트워크 오류. 인터넷/키를 확인하세요.";
    if (/403/.test(m)) return "키 오류 또는 할당량 초과일 수 있어요. " + m;
    return m;
  }
  function loadingInto(node, text) {
    node.innerHTML = "";
    const w = el("div", "prod-loading");
    w.appendChild(el("div", "spinner"));
    w.appendChild(el("div", "prod-loading-note", text || "불러오는 중…"));
    node.appendChild(w);
  }

  // ---- 채널 분석 ----
  async function resolveChannelId(input) {
    let v = input.trim();
    const mChan = v.match(/channel\/(UC[\w-]+)/);
    if (mChan) return mChan[1];
    if (/^UC[\w-]{20,}$/.test(v)) return v;
    let handle = "";
    const mHandle = v.match(/@([\w.\-가-힣ぁ-んァ-ン一-龥]+)/);
    if (mHandle) handle = mHandle[1];
    else if (!/youtube\.com|youtu\.be/.test(v)) handle = v.replace(/^@/, "");
    if (handle) {
      const r = await ytGet("channels", { part: "id", forHandle: "@" + handle });
      if (r.items && r.items[0]) return r.items[0].id;
    }
    // fallback: search
    const s = await ytGet("search", { part: "snippet", type: "channel", q: v, maxResults: 1 });
    if (s.items && s.items[0]) return s.items[0].snippet.channelId || s.items[0].id.channelId;
    throw new Error("채널을 찾지 못했어요. @핸들이나 채널 URL을 확인하세요.");
  }

  async function analyzeChannel() {
    const out = $("#ytChannelResult");
    const input = $("#ytChannel").value.trim();
    if (!input) { toast("채널 @핸들이나 URL을 넣어주세요"); return; }
    if (!ytKey()) { toast("먼저 API 키를 저장하세요"); $("#ytKey").focus(); return; }
    loadingInto(out, "채널을 분석하는 중…");
    try {
      const id = await resolveChannelId(input);
      const ch = await ytGet("channels", { part: "snippet,statistics,contentDetails", id: id });
      const c = ch.items && ch.items[0];
      if (!c) throw new Error("채널 정보를 가져오지 못했어요.");
      const st = c.statistics || {};
      out.innerHTML = "";

      const head = el("div", "yt-channel-head");
      const th = c.snippet.thumbnails?.default?.url;
      if (th) { const im = el("img", "yt-ch-thumb"); im.src = th; head.appendChild(im); }
      const info = el("div");
      info.appendChild(el("div", "yt-ch-title", esc(c.snippet.title)));
      info.appendChild(el("div", "prod-sub", esc((c.snippet.description || "").slice(0, 80))));
      head.appendChild(info);
      out.appendChild(head);

      const stats = el("div", "yt-stats");
      const stat = (label, val) => { const b = el("div", "yt-stat"); b.appendChild(el("div", "yt-stat-num", val)); b.appendChild(el("div", "yt-stat-label", label)); return b; };
      stats.appendChild(stat("구독자", st.hiddenSubscriberCount ? "비공개" : nf(st.subscriberCount)));
      stats.appendChild(stat("총 조회수", nf(st.viewCount)));
      stats.appendChild(stat("영상 수", nf(st.videoCount)));
      out.appendChild(stats);

      out.appendChild(el("div", "yt-note", "※ 수익(매출)은 API로 제공되지 않습니다. YouTube 스튜디오에서 확인하세요."));

      // 최근 영상
      const uploads = c.contentDetails?.relatedPlaylists?.uploads;
      if (uploads) {
        const pi = await ytGet("playlistItems", { part: "contentDetails", playlistId: uploads, maxResults: 10 });
        const ids = (pi.items || []).map((x) => x.contentDetails.videoId).join(",");
        if (ids) {
          const vids = await ytGet("videos", { part: "snippet,statistics", id: ids });
          out.appendChild(el("div", "field-label", "최근 영상"));
          const list = el("div", "yt-video-list");
          (vids.items || []).forEach((v) => list.appendChild(videoRow(v)));
          out.appendChild(list);
        }
      }
    } catch (e) { out.innerHTML = ""; out.appendChild(el("div", "prod-err", errMsg(e))); }
  }

  function videoRow(v) {
    const s = v.statistics || {}, sn = v.snippet;
    const row = el("div", "yt-video");
    const th = sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url;
    const a = el("a"); a.href = "https://youtu.be/" + v.id; a.target = "_blank"; a.rel = "noopener";
    if (th) { const im = el("img"); im.src = th; a.appendChild(im); }
    row.appendChild(a);
    const info = el("div", "yt-video-info");
    info.appendChild(el("div", "yt-video-title", esc(sn.title)));
    info.appendChild(el("div", "yt-video-meta", `조회 ${nf(s.viewCount)} · 👍 ${nf(s.likeCount)} · 💬 ${nf(s.commentCount)} · ${fmtDate(sn.publishedAt)}`));
    row.appendChild(info);
    return row;
  }

  // ---- 벤치마킹 ----
  async function searchBenchmark() {
    const out = $("#ytBenchResult");
    if (!ytKey()) { toast("먼저 API 키를 저장하세요"); $("#ytKey").focus(); return; }
    const q = $("#ytQuery").value.trim() || "야담 옛날이야기";
    const region = $("#ytRegion").value;
    const relLang = region === "JP" ? "ja" : region === "US" ? "en" : "ko";
    loadingInto(out, "최근 7일 급상승 영상을 찾는 중…");
    try {
      const after = new Date(Date.now() - 7 * 86400000).toISOString();
      const s = await ytGet("search", { part: "snippet", type: "video", order: "viewCount", publishedAfter: after, q: q, regionCode: region, relevanceLanguage: relLang, maxResults: 20 });
      const ids = (s.items || []).map((x) => x.id.videoId).filter(Boolean).join(",");
      if (!ids) { out.innerHTML = ""; out.appendChild(el("div", "yt-note", "결과가 없어요. 검색어를 바꿔보세요.")); return; }
      const vids = await ytGet("videos", { part: "snippet,statistics", id: ids });
      const items = (vids.items || []).sort((a, b) => Number(b.statistics.viewCount || 0) - Number(a.statistics.viewCount || 0)).slice(0, 10);
      out.innerHTML = "";
      out.appendChild(el("div", "yt-note", `"${esc(q)}" · 최근 7일 · 조회수 상위 ${items.length}개`));
      const list = el("div", "yt-bench-list");
      items.forEach((v, i) => list.appendChild(benchCard(v, i)));
      out.appendChild(list);
    } catch (e) { out.innerHTML = ""; out.appendChild(el("div", "prod-err", errMsg(e))); }
  }

  function benchCard(v, i) {
    const s = v.statistics || {}, sn = v.snippet;
    const card = el("div", "yt-bench");
    const th = sn.thumbnails?.medium?.url || sn.thumbnails?.high?.url;
    const a = el("a", "yt-bench-thumb"); a.href = "https://youtu.be/" + v.id; a.target = "_blank"; a.rel = "noopener";
    if (th) { const im = el("img"); im.src = th; a.appendChild(im); }
    a.appendChild(el("span", "yt-bench-rank", `${i + 1}`));
    card.appendChild(a);
    const info = el("div", "yt-bench-info");
    info.appendChild(el("div", "yt-bench-title", esc(sn.title)));
    info.appendChild(el("div", "yt-video-meta", `${esc(sn.channelTitle)} · 조회 ${nf(s.viewCount)} · ${daysAgo(sn.publishedAt)}일 전`));
    const acts = el("div", "scene-actions");
    const mk = el("button", "btn sm btn-primary", "✍️ 이 제목으로 대본 만들기");
    mk.onclick = () => {
      if (window.prodStartFromTitle) window.prodStartFromTitle(sn.title);
      else toast("영상 만들기 탭에서 사용하세요");
    };
    acts.appendChild(mk);
    const open = el("a", "btn sm"); open.textContent = "영상 열기"; open.href = "https://youtu.be/" + v.id; open.target = "_blank"; open.rel = "noopener";
    acts.appendChild(open);
    info.appendChild(acts);
    card.appendChild(info);
    return card;
  }

  function init() {
    if (!$("#panel-youtube")) return;
    $("#ytKey").value = ytKey();
    $("#ytSaveKey").onclick = () => { localStorage.setItem(LS_KEY, $("#ytKey").value.trim()); toast("YouTube 키를 저장했어요"); };
    $("#ytAnalyze").onclick = analyzeChannel;
    $("#ytChannel").addEventListener("keydown", (e) => { if (e.key === "Enter") analyzeChannel(); });
    $("#ytSearch").onclick = searchBenchmark;
    $("#ytQuery").addEventListener("keydown", (e) => { if (e.key === "Enter") searchBenchmark(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

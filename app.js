(function () {
  "use strict";

  const STORAGE_KEY = "yetiyagi_stories_v1";
  const SEED_KEYS = ["opening", "character", "setting", "event", "item", "moral"];
  const SEED_LABELS = {
    opening: "시작하는 말",
    character: "등장인물",
    setting: "때와 곳",
    event: "일어나는 일",
    item: "신묘한 물건",
    moral: "전하는 교훈"
  };

  // ---- 상태 ----
  let currentSeed = {};   // 마지막으로 뽑은 씨앗
  let editingId = null;   // 수정 중인 이야기 id (없으면 새 글)

  // ---- 도우미 ----
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function loadStories() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function saveStories(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
  }
  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => (el.hidden = true), 260);
    }, 1900);
  }

  // ---- 탭 전환 ----
  function switchTab(name) {
    $$(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === name));
    $$(".panel").forEach((p) => p.classList.toggle("is-active", p.id === "panel-" + name));
    if (name === "library") renderLibrary();
  }
  $("#tabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (tab) switchTab(tab.dataset.tab);
  });

  // ---- 영감 얻기 ----
  function rollOne(key, animate) {
    const val = pick(window.SEED_DATA[key]);
    currentSeed[key] = val;
    const el = $("#seed-" + key);
    if (animate) {
      el.classList.add("flip");
      setTimeout(() => {
        el.textContent = val;
        el.classList.remove("flip");
      }, 170);
    } else {
      el.textContent = val;
    }
  }
  function rollAll() {
    SEED_KEYS.forEach((k, i) => setTimeout(() => rollOne(k, true), i * 70));
  }

  $("#rollAll").addEventListener("click", rollAll);
  $$(".reroll").forEach((btn) =>
    btn.addEventListener("click", () => rollOne(btn.dataset.reroll, true))
  );

  $("#useSeed").addEventListener("click", () => {
    if (!Object.keys(currentSeed).length) {
      toast("먼저 씨앗을 뽑아 주세요");
      return;
    }
    applySeedToEditor();
    switchTab("write");
    toast("씨앗을 이야기 짓기로 옮겼어요");
  });

  // ---- 씨앗을 에디터로 ----
  function applySeedToEditor() {
    const strip = $("#seedStrip");
    const chips = $("#seedChips");
    chips.innerHTML = "";
    SEED_KEYS.forEach((k) => {
      if (currentSeed[k] && currentSeed[k] !== "없음 (신묘한 물건은 나오지 않는 이야기)") {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = currentSeed[k];
        chips.appendChild(chip);
      }
    });
    strip.hidden = false;
    // 본문이 비어 있으면 시작하는 말을 미리 적어 준다
    const body = $("#body");
    if (!body.value.trim() && currentSeed.opening) {
      body.value = currentSeed.opening + "\n\n";
      updateCount();
    }
  }

  $("#insertSeed").addEventListener("click", () => {
    const lines = [];
    if (currentSeed.character) lines.push(`● 등장인물: ${currentSeed.character}`);
    if (currentSeed.setting) lines.push(`● 때와 곳: ${currentSeed.setting}`);
    if (currentSeed.event) lines.push(`● 일어나는 일: ${currentSeed.event}`);
    if (currentSeed.item && !currentSeed.item.startsWith("없음")) lines.push(`● 신묘한 물건: ${currentSeed.item}`);
    if (currentSeed.moral) lines.push(`● 전하는 교훈: ${currentSeed.moral}`);
    const memo = "〔이야기 씨앗〕\n" + lines.join("\n") + "\n\n";
    const body = $("#body");
    body.value = memo + body.value;
    updateCount();
    toast("씨앗을 본문 앞에 적어 두었어요");
  });

  // ---- 에디터 ----
  function updateCount() {
    const n = $("#body").value.length;
    $("#wordCount").textContent = n.toLocaleString() + "자";
  }
  $("#body").addEventListener("input", updateCount);

  function resetEditor() {
    editingId = null;
    $("#genre").selectedIndex = 0;
    $("#title").value = "";
    $("#body").value = "";
    $("#seedStrip").hidden = true;
    currentSeed = {};
    updateCount();
  }

  $("#newStory").addEventListener("click", () => {
    if ($("#title").value.trim() || $("#body").value.trim()) {
      if (!confirm("지금 쓰던 내용을 지우고 새 이야기를 시작할까요?")) return;
    }
    resetEditor();
    toast("새 이야기를 시작해요");
  });

  $("#saveStory").addEventListener("click", () => {
    const title = $("#title").value.trim();
    const body = $("#body").value.trim();
    if (!title) { toast("제목을 지어 주세요"); $("#title").focus(); return; }
    if (!body) { toast("이야기 본문을 적어 주세요"); $("#body").focus(); return; }

    const list = loadStories();
    if (editingId) {
      const s = list.find((x) => x.id === editingId);
      if (s) {
        s.genre = $("#genre").value;
        s.title = title;
        s.body = body;
        s.updated = Date.now();
      }
    } else {
      list.unshift({
        id: "s" + Date.now() + Math.random().toString(36).slice(2, 6),
        genre: $("#genre").value,
        title,
        body,
        created: Date.now(),
        updated: Date.now()
      });
    }
    saveStories(list);
    updateLibCount();
    resetEditor();
    toast("이야기를 서재에 갈무리했어요");
    switchTab("library");
  });

  // ---- 서재 ----
  function updateLibCount() {
    $("#libCount").textContent = loadStories().length;
  }

  function renderLibrary() {
    const wrap = $("#libraryList");
    const q = $("#search").value.trim().toLowerCase();
    let list = loadStories();
    if (q) {
      list = list.filter(
        (s) => s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q)
      );
    }
    wrap.innerHTML = "";
    $("#libEmpty").hidden = list.length > 0;
    if (q && list.length === 0) {
      $("#libEmpty").hidden = false;
      $("#libEmpty").innerHTML = "찾는 이야기가 없어요.";
    } else if (!q) {
      $("#libEmpty").innerHTML = "아직 지은 이야기가 없어요. <b>이야기 짓기</b>에서 첫 이야기를 남겨 보세요.";
    }

    list.forEach((s) => {
      const card = document.createElement("article");
      card.className = "story-card";
      card.innerHTML = `
        <span class="genre-tag">${escapeHtml(s.genre)}</span>
        <h3>${escapeHtml(s.title)}</h3>
        <p class="excerpt">${escapeHtml(s.body)}</p>
        <div class="card-foot">
          <span>${fmtDate(s.updated)} · ${s.body.length.toLocaleString()}자</span>
          <button class="card-del" data-del="${s.id}" title="지우기">지우기</button>
        </div>`;
      card.addEventListener("click", (e) => {
        if (e.target.closest(".card-del")) return;
        openReader(s.id);
      });
      wrap.appendChild(card);
    });

    wrap.querySelectorAll(".card-del").forEach((btn) => {
      btn.addEventListener("click", () => {
        const s = loadStories().find((x) => x.id === btn.dataset.del);
        if (s && confirm(`〈${s.title}〉 이야기를 정말 지울까요?`)) {
          saveStories(loadStories().filter((x) => x.id !== btn.dataset.del));
          updateLibCount();
          renderLibrary();
          toast("이야기를 지웠어요");
        }
      });
    });
  }
  $("#search").addEventListener("input", renderLibrary);

  // ---- 읽기 창 ----
  let readerId = null;
  function openReader(id) {
    const s = loadStories().find((x) => x.id === id);
    if (!s) return;
    readerId = id;
    $("#readerGenre").textContent = s.genre;
    $("#readerTitle").textContent = s.title;
    $("#readerDate").textContent = "지은 날 " + fmtDate(s.created) +
      (s.updated !== s.created ? " · 고친 날 " + fmtDate(s.updated) : "");
    $("#readerBody").textContent = s.body;
    $("#readerModal").hidden = false;
  }
  function closeReader() {
    $("#readerModal").hidden = true;
    readerId = null;
  }
  $$("[data-close]").forEach((el) => el.addEventListener("click", closeReader));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#readerModal").hidden) closeReader();
  });

  $("#editFromReader").addEventListener("click", () => {
    const s = loadStories().find((x) => x.id === readerId);
    if (!s) return;
    editingId = s.id;
    $("#genre").value = s.genre;
    $("#title").value = s.title;
    $("#body").value = s.body;
    $("#seedStrip").hidden = true;
    updateCount();
    closeReader();
    switchTab("write");
    toast("고쳐 쓰기 모드로 열었어요");
  });

  // ---- 내보내기 ----
  function download(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  function storyToText(s) {
    return `[${s.genre}] ${s.title}\n지은 날: ${fmtDate(s.created)}\n\n${s.body}\n`;
  }

  $("#exportOne").addEventListener("click", () => {
    const s = loadStories().find((x) => x.id === readerId);
    if (s) download(`${s.title}.txt`, storyToText(s));
  });

  $("#exportAll").addEventListener("click", () => {
    const list = loadStories();
    if (!list.length) { toast("내보낼 이야기가 없어요"); return; }
    const all = list.map(storyToText).join("\n\n──────────\n\n");
    download("옛이야기_모음.txt", all);
    toast(`${list.length}편을 내보냈어요`);
  });

  // ---- 시작 ----
  function init() {
    rollAll();
    updateLibCount();
    updateCount();
  }
  init();
})();

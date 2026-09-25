/* AMPS Reader — Phases A–D UI extensions */
(function () {
  "use strict";

  let api;
  let glossaryIndex = null;
  let searchCache = {};
  let readTimer = null;
  let readStart = null;

  function T(k) { return window.AmpsI18n?.t(k) || k; }

  const COVER_PALETTES = [
    ["#e85d04", "#9a3412"], ["#c9a227", "#7c5e10"], ["#2d6a4f", "#1b4332"],
    ["#1d4e89", "#0d2d54"], ["#6b2d5c", "#3d1835"], ["#b5451b", "#6b280f"],
    ["#4a6741", "#2d3f28"], ["#5c4d7d", "#352a4f"], ["#8b4513", "#4a2508"],
    ["#1a535c", "#0d2f35"], ["#9b2226", "#5c1417"], ["#0077b6", "#004e7a"],
  ];

  function bookCoverStyle(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const [a, b] = COVER_PALETTES[h % COVER_PALETTES.length];
    return `background:linear-gradient(155deg,${a} 0%,${b} 100%)`;
  }

  async function loadGlossaryIndex() {
    if (glossaryIndex) return glossaryIndex;
    const res = await fetch("data/glossary-index.json");
    glossaryIndex = await res.json();
    return glossaryIndex;
  }

  async function searchShard(bookId) {
    if (searchCache[bookId]) return searchCache[bookId];
    const res = await fetch("data/search/" + bookId + ".json");
    searchCache[bookId] = await res.json();
    return searchCache[bookId];
  }

  function normSearch(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function textMatchesQuery(text, query) {
    const raw = String(text || "");
    const ql = String(query || "").toLowerCase();
    if (ql && raw.toLowerCase().includes(ql)) return true;
    const hay = normSearch(raw);
    const needle = normSearch(query);
    if (!needle) return false;
    if (hay.includes(needle)) return true;
    return needle.split(" ").filter(w => w.length > 1).every(w => hay.includes(w));
  }

  function searchShardRows(shard) {
    if (Array.isArray(shard)) return shard;
    if (shard?.entries) {
      return shard.entries.map(e => ({
        c: e.chapterId || e.c,
        p: e.id || e.p,
        t: e.t || [e.sanskritRoman, e.devanagari, e.bangla, e.wordMeaning, e.text].filter(Boolean).join("\n"),
        chapterTitle: e.chapterTitle,
      }));
    }
    return [];
  }

  function searchSnippet(text, q) {
    const raw = String(text || "");
    const ql = String(q || "").toLowerCase();
    let idx = ql ? raw.toLowerCase().indexOf(ql) : -1;
    if (idx < 0) {
      const first = normSearch(q).split(" ").filter(Boolean)[0] || "";
      idx = first ? normSearch(raw).indexOf(first) : -1;
      if (idx < 0) return raw.slice(0, 120);
      const ratio = raw.length / Math.max(1, normSearch(raw).length);
      idx = Math.max(0, Math.floor(idx * ratio) - 20);
    }
    return raw.slice(Math.max(0, idx - 50), idx + q.length + 80);
  }

  async function fastSearch(catalog, q, limit) {
    const hits = [];
    const manifest = catalog.searchManifest || catalog.books;
    const books = Array.isArray(manifest) ? manifest : catalog.books;
    const bookList = [...books];
    bookList.sort((a, b) => {
      const idA = a.id || a;
      const idB = b.id || b;
      if (idA === "samskrta-shloka") return -1;
      if (idB === "samskrta-shloka") return 1;
      return 0;
    });

    for (const b of bookList) {
      const id = b.id || b;
      if (hits.length >= limit) break;
      try {
        const rows = searchShardRows(await searchShard(id));
        rows.forEach(row => {
          if (hits.length >= limit) return;
          const body = row.t || row.text || "";
          if (!textMatchesQuery(body, q)) return;
          hits.push({
            bookId: id,
            bookTitle: catalog.books.find(x => x.id === id)?.title || id,
            chapterId: row.c,
            chapterTitle: row.chapterTitle,
            paraId: row.p,
            snippet: searchSnippet(body, q),
          });
        });
      } catch (_) { /* skip */ }
    }
    return hits;
  }

  function globalGlossaryLookup(q) {
    if (!glossaryIndex || !q) return [];
    const ql = q.toLowerCase();
    return glossaryIndex.filter(g =>
      g.term.toLowerCase().includes(ql) || ql.includes(g.term.toLowerCase().slice(0, 4))
    ).slice(0, 20);
  }

  function install(app) {
    api = app;
    const { state } = api;

    if (!state.stats) state.stats = window.AmpsStats?.ensure() || {};
    if (!state.collections) state.collections = [];
    if (!state.importedBooks) state.importedBooks = {};
    if (!state.settings.lang) state.settings.lang = "en";
    window.AmpsI18n?.setLang(state.settings.lang);

    if (!localStorage.getItem("amps-reader-v3")) {
      window.AmpsSync?.restoreAutoBackup(state);
    }

    const origSave = api.saveState;
    api.saveState = function () {
      origSave();
      if (state.settings.autoBackup !== false) window.AmpsSync?.autoBackup(state);
    };

    window.addEventListener("beforeunload", () => {
      if (readStart) {
        const mins = Math.max(1, Math.round((Date.now() - readStart) / 60000));
        state.stats = window.AmpsStats.recordSession(state.stats, mins, state._readBook, state._readChapter);
        api.saveState();
      }
      window.AmpsSync?.autoBackup(state);
    });

    api.renderStats = renderStats;
    api.renderGlossary = renderGlossary;
    api.renderCollections = renderCollections;
    api.renderImport = renderImport;
    api.fastSearch = fastSearch;
    api.globalGlossaryLookup = globalGlossaryLookup;
    api.loadGlossaryIndex = loadGlossaryIndex;
    api.startReadTimer = startReadTimer;
    api.renderCommentaryBlock = renderCommentaryBlock;
    api.enhancePresentMode = enhancePresentMode;
    // Keep public surface on window.AmpsAdUI (install receives a throwaway app bag).
    window.AmpsAdUI.startReadTimer = startReadTimer;
    window.AmpsAdUI.renderCommentaryBlock = renderCommentaryBlock;
    window.AmpsAdUI.globalGlossaryLookup = globalGlossaryLookup;
    window.AmpsAdUI.loadGlossaryIndex = loadGlossaryIndex;
  }

  function startReadTimer(bookId, chapterId) {
    if (!api?.state) return;
    const state = api.state;
    readStart = Date.now();
    state._readBook = bookId;
    state._readChapter = chapterId;
    if (state.route === "paths" && state.params.parts[1]) {
      window.AmpsStats.markPathChapter(state.stats, state.params.parts[1], bookId, chapterId);
    }
  }

  function renderStats() {
    const s = api.state.stats || {};
    const streak = window.AmpsStats?.streak(s) || 0;
    const today = window.AmpsStats?.todayMinutes(s) || 0;
    const goal = s.goalMinutes || 20;
    const pct = Math.min(100, Math.round((today / goal) * 100));
    const body = `
      <section class="hero hero-compact"><h1>${T("stats")}</h1></section>
      <div class="stats-grid">
        <div class="stat-card"><span class="stat-val">${today}</span><span class="stat-lbl">${T("todayGoal")} / ${goal} min</span></div>
        <div class="stat-card"><span class="stat-val">${streak}</span><span class="stat-lbl">${T("streak")}</span></div>
        <div class="stat-card"><span class="stat-val">${Object.keys(s.chaptersOpened || {}).length}</span><span class="stat-lbl">${T("booksRead")}</span></div>
      </div>
      <div class="mini-progress" style="margin:1rem 0"><div class="mini-progress-fill" style="width:${pct}%"></div></div>
      <label>${T("todayGoal")} (minutes)<input type="number" id="goalMin" min="5" max="180" value="${goal}" /></label>
      <button type="button" class="btn btn-gold" id="saveGoal">Save</button>`;
    api.renderShell(body, {
      title: T("stats"),
      tab: "more",
      bind: () => {
        document.getElementById("saveGoal")?.addEventListener("click", () => {
          api.state.stats.goalMinutes = +document.getElementById("goalMin").value || 20;
          api.saveState();
          renderStats();
        });
      },
    });
  }

  async function renderGlossary() {
    await loadGlossaryIndex();
    const q = (api.state.params.q || "").toLowerCase();
    let list = glossaryIndex;
    if (q) list = globalGlossaryLookup(q);
    let body = `<section class="hero hero-compact"><h1>${T("glossary")}</h1>
      <p class="hero-sub">${glossaryIndex.length} terms</p></section>
      <div class="search-bar"><input type="search" id="glossQ" placeholder="Sanskrit / Bengali term…" value="${api.esc(api.state.params.q || "")}" /></div>
      <div class="gloss-results">`;
    list.slice(0, 80).forEach(g => {
      body += `<button type="button" class="gloss-hit-btn" data-book="${api.esc(g.bookId)}">
        <strong>${api.esc(g.term)}</strong><p>${api.esc(g.def)}</p><small>${api.esc(g.bookTitle)}</small></button>`;
    });
    body += `</div>`;
    api.renderShell(body, {
      title: T("glossary"),
      tab: "more",
      bind: () => {
        document.getElementById("glossQ")?.addEventListener("input", e => {
          api.state.params.q = e.target.value;
          renderGlossary();
        });
        document.querySelectorAll(".gloss-hit-btn").forEach(el => {
          el.addEventListener("click", () => api.navigate("book", { bookId: el.dataset.book }));
        });
      },
    });
  }

  function renderCollections() {
    const cols = api.state.collections || [];
    let body = `<section class="hero hero-compact"><h1>${T("collections")}</h1></section>
      <input type="text" id="colTitle" placeholder="Collection title" />
      <button type="button" class="btn btn-gold btn-sm" id="btnNewCol">+ New</button>`;
    cols.forEach(c => {
      body += `<div class="note-card"><h3>${api.esc(c.title)}</h3><p class="muted">${c.items.length} passages</p>
        <button type="button" class="btn btn-ghost btn-sm" data-export-col="${api.esc(c.id)}">Export TXT</button>
        <button type="button" class="btn btn-ghost btn-sm" data-export-html="${api.esc(c.id)}">Class pack PDF/HTML</button>
        <button type="button" class="btn btn-ghost btn-sm danger" data-del-col="${api.esc(c.id)}">Delete</button></div>`;
    });
    api.renderShell(body, {
      title: T("collections"),
      tab: "more",
      bind: () => {
        document.getElementById("btnNewCol")?.addEventListener("click", () => {
          const t = document.getElementById("colTitle")?.value?.trim();
          if (!t) return;
          api.state.collections.push(window.AmpsSync.createCollection(t));
          api.saveState();
          renderCollections();
        });
        document.querySelectorAll("[data-export-col]").forEach(el => {
          el.addEventListener("click", () => {
            const c = api.state.collections.find(x => x.id === el.dataset.exportCol);
            if (!c) return;
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([window.AmpsSync.exportCollection(c)], { type: "text/plain" }));
            a.download = c.title + ".txt";
            a.click();
          });
        });
        document.querySelectorAll("[data-export-html]").forEach(el => {
          el.addEventListener("click", () => {
            const c = api.state.collections.find(x => x.id === el.dataset.exportHtml);
            if (!c || !window.AmpsEnhance?.exportCollectionHtml) return;
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([window.AmpsEnhance.exportCollectionHtml(c)], { type: "text/html" }));
            a.download = c.title + "-class-pack.html";
            a.click();
          });
        });
        document.querySelectorAll("[data-del-col]").forEach(el => {
          el.addEventListener("click", () => {
            api.state.collections = api.state.collections.filter(x => x.id !== el.dataset.delCol);
            api.saveState();
            renderCollections();
          });
        });
      },
    });
  }

  function renderImport() {
    const imported = Object.values(api.state.importedBooks || {});
    let body = `<section class="hero hero-compact"><h1>${T("importBook")}</h1></section>
      <label class="btn btn-gold import-label">Choose EPUB or PDF<input type="file" id="importFile" accept=".epub,.pdf" hidden /></label>
      <p class="muted">Imported books stay on this device.</p>`;
    imported.forEach(b => {
      body += `<button type="button" class="book-card" data-book="${api.esc(b.id)}">
        <div class="book-cover book-cover-card" style="${bookCoverStyle(b.id)}"><span class="book-cover-title">${api.esc(b.title)}</span></div>
        <div class="book-card-body"><h3>${api.esc(b.title)}</h3><p>${b.format?.toUpperCase()} · ${b.chapters?.length} sections</p></div></button>`;
    });
    api.renderShell(body, {
      title: T("importBook"),
      tab: "more",
      bind: () => {
        document.getElementById("importFile")?.addEventListener("change", async e => {
          const file = e.target.files?.[0];
          if (!file || !window.AmpsImport) return;
          try {
            const book = await window.AmpsImport.importFile(file);
            api.state.importedBooks[book.id] = book;
            api.state.bookCache[book.id] = book;
            api.saveState();
            alert(T("importSuccess"));
            renderImport();
          } catch (err) { alert(err.message); }
        });
        document.querySelectorAll("[data-book]").forEach(el => {
          el.addEventListener("click", () => api.navigate("book", { bookId: el.dataset.book }));
        });
      },
    });
  }

  function renderCommentaryBlock(ch, showCommentary) {
    if (!showCommentary) return "";
    let html = "";
    if (ch.editorialNotes?.length) {
      html += `<aside class="commentary-block editorial"><h4>${T("editorial")}</h4>`;
      ch.editorialNotes.forEach(n => { html += `<p>${api.esc(n)}</p>`; });
      html += `</aside>`;
    }
    return html;
  }

  function enhancePresentMode(book, ch, container) {
    if (!container) return;
    let idx = 0;
    const paras = ch.paragraphs;
    const theme = api.state.settings.presentTheme || "light";
    container.classList.add("present-enhanced", "present-" + theme);
    function show() {
      const p = paras[idx];
      container.innerHTML = `
        <h1>${api.esc(ch.title)}</h1>
        <p class="present-para present-active">${api.esc(p?.text || "")}</p>
        <p class="muted">${idx + 1} / ${paras.length}</p>`;
    }
    show();
    const next = () => { if (idx < paras.length - 1) { idx++; show(); } };
    const prev = () => { if (idx > 0) { idx--; show(); } };
    document.getElementById("btnPresentNext")?.addEventListener("click", next);
    document.getElementById("btnPresentPrev")?.addEventListener("click", prev);
    if (api.state.settings.presentAuto) {
      window.AmpsAudio?.speakParagraphs(
        paras.map(p => p.text),
        paras.map(p => p.id),
        api.state.settings.ttsRate,
        i => { if (i >= 0) { idx = i; show(); } },
        window.AmpsAudio?.normalizePreset?.(api.state.settings.ttsVoice) || "in-en-female"
      );
    }
  }

  window.AmpsAdUI = { install, renderStats, renderGlossary, renderCollections, renderImport, fastSearch, enhancePresentMode };
})();

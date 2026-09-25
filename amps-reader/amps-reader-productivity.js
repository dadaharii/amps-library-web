/* AMPS Reader — productivity: study sidebar, chapter search, missions, sync v2 */
(function () {
  "use strict";

  let api = null;
  let sleepInterval = null;
  let sessionTick = null;

  const TABS = ["summary", "notes", "glossary", "listen", "qa", "intel"];

  function ensureState() {
    if (!api?.state) return;
    const s = api.state;
    s.productivity = {
      studyPanelOpen: false,
      studyPanelTab: "summary",
      chapterSearch: "",
      chapterSearchIdx: 0,
      skipFootnotesTts: false,
      autoSync: false,
      tabletSplit: true,
      sleepMinutes: 0,
      sleepEnd: 0,
      missionDay: "",
      ...(s.productivity || {}),
    };
    s.userStudyCards = s.userStudyCards || {};
    s.readingSessions = s.readingSessions || [];
    if (!s.settings.ttsSkipFootnotes && s.productivity.skipFootnotesTts) {
      s.settings.ttsSkipFootnotes = s.productivity.skipFootnotesTts;
    }
  }

  function dayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function esc(s) {
    return api?.esc ? api.esc(s) : String(s || "");
  }

  function uid() {
    return api?.uid ? api.uid() : "id-" + Date.now().toString(36);
  }

  function currentSession() {
    const s = api.state.readingSessions;
    const today = dayKey();
    let row = s.find(r => r.day === today && !r.ended);
    if (!row) {
      row = { day: today, started: Date.now(), ended: null, minutes: 0, paragraphs: 0, highlights: 0, books: {} };
      s.push(row);
      if (s.length > 90) s.splice(0, s.length - 90);
    }
    return row;
  }

  function trackReading(bookId, chapterId) {
    ensureState();
    const row = currentSession();
    const bk = row.books[bookId] || { chapters: {}, lastChapter: chapterId, lastAt: Date.now() };
    bk.lastChapter = chapterId;
    bk.lastAt = Date.now();
    bk.chapters[chapterId] = (bk.chapters[chapterId] || 0) + 1;
    row.books[bookId] = bk;
    api.saveState();
  }

  function startSessionTimer() {
    clearInterval(sessionTick);
    sessionTick = setInterval(() => {
      const row = currentSession();
      row.minutes = (row.minutes || 0) + 0.5;
      api.saveState();
    }, 30000);
  }

  function stopSessionTimer() {
    clearInterval(sessionTick);
    sessionTick = null;
  }

  function sessionStatsHtml() {
    ensureState();
    const today = dayKey();
    const row = api.state.readingSessions.find(r => r.day === today) || { minutes: 0, paragraphs: 0, highlights: 0 };
    const week = api.state.readingSessions.filter(r => {
      const d = new Date(r.day);
      const now = new Date();
      return (now - d) < 7 * 86400000;
    });
    const weekMin = week.reduce((a, r) => a + (r.minutes || 0), 0);
    return `<section class="productivity-session-card">
      <p class="hero-eyebrow">Reading session</p>
      <div class="stats-inline">
        <span>${Math.round(row.minutes || 0)} min active today</span> ·
        <span>${Math.round(weekMin)} min this week</span> ·
        <span>${row.highlights || 0} highlights today</span>
      </div>
    </section>`;
  }

  function studyMissionHtml() {
    ensureState();
    const p = api.state.productivity;
    const today = dayKey();
    if (p.missionDay !== today) {
      p.missionDay = today;
      p.mission = { readMinutes: 15, highlight: 1, reviewCards: 5, completed: false };
    }
    const m = p.mission || { readMinutes: 15, highlight: 1 };
    const row = api.state.readingSessions.find(r => r.day === today);
    const doneMin = Math.round(row?.minutes || 0);
    const doneHl = row?.highlights || 0;
    const due = dueUserCardKeys().length + Object.values(api.state.study?.cards || {}).filter(c => c.due <= Date.now()).length;
    const readPct = Math.min(100, Math.round((doneMin / m.readMinutes) * 100));
    const hlPct = Math.min(100, Math.round((doneHl / m.highlight) * 100));
    const complete = doneMin >= m.readMinutes && doneHl >= m.highlight;
    if (complete) m.completed = true;
    return `<section class="productivity-mission-card ${complete ? "mission-complete" : ""}">
      <p class="hero-eyebrow">Today's study mission ${complete ? "✓" : ""}</p>
      <p><strong>Read ${m.readMinutes} min</strong> — ${doneMin} min (${readPct}%)</p>
      <div class="productivity-mission-progress"><span style="width:${readPct}%"></span></div>
      <p style="margin-top:0.65rem"><strong>Mark 1 passage</strong> — ${doneHl} done</p>
      <div class="productivity-mission-progress"><span style="width:${hlPct}%"></span></div>
      <p class="muted" style="margin-top:0.65rem">${due} cards due · <a href="#study">Review</a>${complete ? " · Mission complete!" : ""}</p>
    </section>`;
  }

  function dueUserCardKeys() {
    const now = Date.now();
    return Object.entries(api?.state?.userStudyCards || {})
      .filter(([, c]) => (c.due || 0) <= now)
      .map(([k]) => k);
  }

  function knowledgeGraphHtml() {
    const links = {};
    const nodes = {};
    (api.state.highlights || []).slice(-300).forEach(h => {
      const words = String(h.text || "").toLowerCase().split(/\s+/)
        .map(w => w.replace(/[^a-z0-9āīūṛṃ]/gi, ""))
        .filter(w => w.length > 4);
      const uniq = [...new Set(words)].slice(0, 8);
      uniq.forEach(w => {
        nodes[w] = nodes[w] || { count: 0, books: new Set() };
        nodes[w].count += 1;
        if (h.bookId) nodes[w].books.add(h.bookId);
      });
      for (let i = 0; i < uniq.length; i += 1) {
        for (let j = i + 1; j < uniq.length; j += 1) {
          const a = uniq[i];
          const b = uniq[j];
          const k = a < b ? `${a}|${b}` : `${b}|${a}`;
          links[k] = (links[k] || 0) + 1;
        }
      }
    });
    const topNodes = Object.entries(nodes).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
    const topLinks = Object.entries(links).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!topNodes.length) return "";
    return `<section class="productivity-graph-card">
      <p class="hero-eyebrow">Your study themes</p>
      <div class="productivity-graph-tags">${topNodes.map(([t, n]) =>
        `<span title="${n.books.size} book(s)">${esc(t)} <small>×${n.count}</small></span>`
      ).join("")}</div>
      ${topLinks.length ? `<p class="muted" style="margin-top:0.65rem">Connected ideas</p>
        <ul class="productivity-graph-links">${topLinks.map(([k, n]) => {
          const [a, b] = k.split("|");
          return `<li>${esc(a)} ↔ ${esc(b)} <span class="muted">(${n})</span></li>`;
        }).join("")}</ul>` : ""}
    </section>`;
  }

  function todayExtrasHtml() {
    if (!api) return "";
    return sessionStatsHtml() + studyMissionHtml() + knowledgeGraphHtml();
  }

  function smarterResumeHtml(bookId, ch, book) {
    const prog = api.state.progress[bookId];
    if (!prog?.chapterId) return "";
    const pct = prog.pct != null ? Math.round(prog.pct) : null;
    const label = prog.chapterId === ch.id ? "Continue this chapter" : `Resume ${prog.chapterId}`;
    const listen = api.state.audioProgress?.[bookId + "|" + ch.id];
    let extra = "";
    if (listen?.paraId) extra = " · audio bookmark saved";
  if (pct != null) extra = ` · ${pct}% of book` + extra;
    return `<div class="reader-resume-banner" id="readerResumeBanner">
      <span>${esc(label)}${extra}</span>
      <div>
        ${prog.chapterId !== ch.id ? `<button type="button" class="btn btn-gold btn-sm" data-resume-ch="${esc(prog.chapterId)}">Jump to last chapter</button>` : ""}
        ${listen?.paraId ? `<button type="button" class="btn btn-ghost btn-sm" id="btnResumeAudio">Continue listening</button>` : ""}
      </div>
    </div>`;
  }

  function chapterSearchBarHtml() {
    const q = api.state.productivity?.chapterSearch || "";
    return `<div class="reader-chapter-search" id="chapterSearchBar">
      <input type="search" id="chapterSearchInput" placeholder="Search in this chapter…" value="${esc(q)}" />
      <button type="button" class="btn btn-ghost btn-sm" id="btnChapterSearchPrev" title="Previous">↑</button>
      <button type="button" class="btn btn-ghost btn-sm" id="btnChapterSearchNext" title="Next">↓</button>
      <span class="chapter-search-count" id="chapterSearchCount"></span>
    </div>`;
  }

  function chapterSummaryBullets(book, chapterId, ch) {
    const summary = window.AmpsStudy?.summarizeChapter?.(book, chapterId);
    if (summary?.bullets?.length) return summary.bullets;
    if (ch?.paragraphs?.length) {
      return ch.paragraphs.slice(0, 8).map(p => (p.summary?.[0] || p.text || "").slice(0, 160)).filter(Boolean);
    }
    return [];
  }

  function studyPanelBodyHtml(tab, bookId, chapterId, book, ch) {
    try {
      if (tab === "summary") {
        const bullets = chapterSummaryBullets(book, chapterId, ch);
        return `<p class="muted">${esc(book?.title || "")} · ${esc(ch?.title || "")}</p>
          <h4>Key points</h4>
          <ol>${bullets.slice(0, 8).map(s => `<li>${esc(s)}</li>`).join("") || "<li class='muted'>No summary yet</li>"}</ol>
          <button type="button" class="btn btn-ghost btn-sm" id="btnStudyOpenCompanion">Full companion view</button>`;
      }
      if (tab === "notes") {
        const notes = chapterNotes(bookId, chapterId);
        const hls = chapterHighlights(bookId, chapterId);
        return `<p class="muted">${notes.length} notes · ${hls.length} highlights</p>
          ${notes.length ? notes.map(n => `<div class="reader-study-card"><strong>📝</strong>${esc(n.body)}</div>`).join("") : "<p class='muted'>No notes in this chapter. Select text and tap 📝.</p>"}
          ${hls.length ? `<h4>Highlights</h4>${hls.slice(0, 12).map(h => `<div class="reader-study-card">${esc(h.text)}</div>`).join("")}` : ""}`;
      }
      if (tab === "glossary") {
        return `<input type="search" id="studyGlossSearch" placeholder="Lookup term…" />
          <div id="studyGlossResults" class="gloss-results"><p class="muted">Type a Sanskrit or Bengali term</p></div>`;
      }
      if (tab === "listen") {
        const q = api.state.audioQueue || [];
        const listening = document.body.classList.contains("tts-reading");
        const paused = document.body.classList.contains("tts-paused") || !!api.state.ui?.audioPaused;
        return `<p class="muted">Listen tools for this chapter</p>
          <div class="reader-sheet-list">
            <button type="button" class="btn btn-gold btn-sm" id="studyBtnListen">Human discourse</button>
            <button type="button" class="btn btn-ghost btn-sm" id="studyBtnNormal">Normal reading</button>
            <button type="button" class="btn btn-ghost btn-sm" id="studyBtnPravachan">Pravachan style</button>
            <button type="button" class="btn btn-ghost btn-sm" id="studyBtnContinue">Continue last</button>
            <button type="button" class="btn btn-ghost btn-sm" id="studyBtnPause"${listening ? "" : " disabled"}>${paused ? "Paused" : "Pause"}</button>
            <button type="button" class="btn btn-ghost btn-sm" id="studyBtnResume"${paused ? "" : " disabled"}>Resume</button>
            <button type="button" class="btn btn-ghost btn-sm" id="studyBtnStop"${listening || paused ? "" : " disabled"}>Stop</button>
            <button type="button" class="btn btn-ghost btn-sm" id="studyBtnQueue">Add to playlist</button>
          </div>
          <label class="check-row" style="margin-top:0.75rem">
            <input type="checkbox" id="studySkipFootnotes" ${api.state.settings.ttsSkipFootnotes ? "checked" : ""} />
            Skip footnote numbers while listening
          </label>
          <label>Sleep timer (minutes)
            <input type="number" id="studySleepTimer" min="0" max="120" value="${api.state.productivity.sleepMinutes || 0}" />
          </label>
          <p class="muted">Playlist: ${q.length} chapter(s) queued · tap a highlighted word to listen from there</p>`;
      }
      if (tab === "qa") {
        return `<p class="muted">Grounded answers from this chapter only.</p>
          <input type="search" id="studyQaInput" placeholder="What does this chapter say about…?" />
          <button type="button" class="btn btn-gold btn-sm" id="btnStudyQaAsk" style="margin:0.5rem 0">Ask with citations</button>
          <div id="studyQaResults"></div>
          <button type="button" class="btn btn-ghost btn-sm" id="btnStudyFullQa">Open full Q&A</button>`;
      }
      if (tab === "intel") {
        const paras = ch?.paragraphs || [];
        const words = paras.reduce((a, p) => a + String(p.text || "").split(/\s+/).length, 0);
        const readMin = Math.max(1, Math.round(words / 200));
        const hls = chapterHighlights(bookId, chapterId).length;
        const notes = chapterNotes(bookId, chapterId).length;
        const dueInBook = Object.keys(api.state.study?.cards || {}).filter(k => k.startsWith(bookId + "|")).length;
        return `<div class="chapter-intel-grid">
          <div class="intel-stat"><span>Paragraphs</span><strong>${paras.length}</strong></div>
          <div class="intel-stat"><span>Est. read time</span><strong>~${readMin} min</strong></div>
          <div class="intel-stat"><span>Your highlights</span><strong>${hls}</strong></div>
          <div class="intel-stat"><span>Your notes</span><strong>${notes}</strong></div>
          <div class="intel-stat"><span>SRS points in book</span><strong>${dueInBook}</strong></div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" id="btnIntelStudy" style="margin-top:0.75rem">Open study mode</button>`;
      }
    } catch (err) {
      console.error("Study panel render failed:", err);
      return `<p class="muted">Could not load this tab. Tap ✕ to return to reading.</p>`;
    }
    return `<p class="muted">Choose a study tab above.</p>`;
  }

  function studyPanelHtml(open, bookId, chapterId, book, ch) {
    const tab = api.state.productivity?.studyPanelTab || "summary";
    const tabBtns = TABS.map(t =>
      `<button type="button" class="${tab === t ? "active" : ""}" data-study-tab="${t}">${t === "qa" ? "Q&A" : t.charAt(0).toUpperCase() + t.slice(1)}</button>`
    ).join("");
    const body = open ? studyPanelBodyHtml(tab, bookId, chapterId, book, ch) : "";
    return `<div class="reader-study-backdrop ${open ? "" : "hidden"}" id="studyPanelBackdrop" aria-hidden="true"></div>
      <aside class="reader-study-panel ${open ? "open" : ""}" id="studyPanel" aria-label="Study panel">
        <div class="reader-study-head" id="studyPanelHead">
          <h3>Study</h3>
          <button type="button" class="reader-study-close" id="btnCloseStudyPanel" aria-label="Close study panel">
            <span class="reader-study-close-icon" aria-hidden="true">✕</span>
            <span class="reader-study-close-label">Close</span>
          </button>
        </div>
        <div class="reader-study-tabs">${tabBtns}</div>
        <div class="reader-study-body" id="studyPanelBody">${body || "<p class='muted'>Tap a tab to study alongside reading.</p>"}</div>
        <div class="reader-study-foot">
          <button type="button" class="reader-study-close-full" id="btnCloseStudyPanelFoot" aria-label="Close study panel">Close study panel</button>
        </div>
      </aside>`;
  }

  function syncStudyPanelDom(open) {
    document.body.classList.toggle("reader-study-open", !!open);
    document.getElementById("studyPanel")?.classList.toggle("open", !!open);
    document.getElementById("studyPanelBackdrop")?.classList.toggle("hidden", !open);
    document.getElementById("btnStudyPanel")?.classList.toggle("active", !!open);
    document.getElementById("btnStudyPanel")?.setAttribute("aria-pressed", open ? "true" : "false");
  }

  let studyPanelEscapeBound = false;

  function bindStudyPanelClose() {
    const closeStudy = () => toggleStudyPanel(false);
    const backdrop = document.getElementById("studyPanelBackdrop");
    if (backdrop && !backdrop.dataset.studyCloseBound) {
      backdrop.dataset.studyCloseBound = "1";
      backdrop.addEventListener("click", closeStudy);
    }
    if (!studyPanelEscapeBound) {
      studyPanelEscapeBound = true;
      document.addEventListener("keydown", e => {
        if (e.key === "Escape" && api.state.productivity?.studyPanelOpen) {
          e.preventDefault();
          closeStudy();
        }
      });
    }
    ["btnCloseStudyPanel", "btnCloseStudyPanelFoot"].forEach(id => {
      const btn = document.getElementById(id);
      if (!btn || btn.dataset.studyCloseBound) return;
      btn.dataset.studyCloseBound = "1";
      btn.addEventListener("click", closeStudy);
    });
    bindStudyPanelSwipe(closeStudy);
  }

  function bindStudyPanelSwipe(closeStudy) {
    const head = document.getElementById("studyPanelHead");
    if (!head || head.dataset.swipeBound) return;
    head.dataset.swipeBound = "1";
    let startY = 0;
    let dragging = false;
    const onStart = e => {
      if (!api.state.productivity?.studyPanelOpen || window.innerWidth >= 900) return;
      startY = e.touches?.[0]?.clientY ?? 0;
      dragging = true;
    };
    const onMove = e => {
      if (!dragging) return;
      const y = e.touches?.[0]?.clientY ?? startY;
      if (y - startY > 72) {
        dragging = false;
        closeStudy();
      }
    };
    const onEnd = () => { dragging = false; };
    head.addEventListener("touchstart", onStart, { passive: true });
    head.addEventListener("touchmove", onMove, { passive: true });
    head.addEventListener("touchend", onEnd, { passive: true });
    head.addEventListener("touchcancel", onEnd, { passive: true });
  }

  function readerExtrasHtml(bookId, ch, book) {
    ensureState();
    const open = !!api.state.productivity.studyPanelOpen;
    document.body.classList.remove("reader-tablet-split", "reader-study-open");
    document.body.classList.toggle("reader-tablet-capable", window.innerWidth >= 900);
    if (open) document.body.classList.add("reader-study-open");
    if (api.state.productivity.tabletSplit && window.innerWidth >= 900 && open) {
      document.body.classList.add("reader-tablet-split");
    }
    return `<div class="reader-layout-split">
      <div class="reader-main-col">
      ${smarterResumeHtml(bookId, ch, book)}
      ${chapterSearchBarHtml()}`;
  }

  function readerSplitCloseHtml(bookId, ch, book) {
    ensureState();
    const open = !!api.state.productivity.studyPanelOpen;
    return `</div>${studyPanelHtml(open, bookId, ch?.id, book, ch)}</div>`;
  }

  function chapterNotes(bookId, chapterId) {
    return (api.state.notes || []).filter(n => n.bookId === bookId && n.chapterId === chapterId);
  }

  function chapterHighlights(bookId, chapterId) {
    return (api.state.highlights || []).filter(h => h.bookId === bookId && h.chapterId === chapterId);
  }

  function bindStudyTabActions(tab, bookId, chapterId, book, ch) {
    if (tab === "summary") {
      document.getElementById("btnStudyOpenCompanion")?.addEventListener("click", () => {
        api.navigate("companion", { bookId, chapterId });
      });
      return;
    }
    if (tab === "glossary") {
      document.getElementById("studyGlossSearch")?.addEventListener("input", e => {
        const hits = window.AmpsFeatures?.lookupGlossary?.(e.target.value, book) || [];
        const el = document.getElementById("studyGlossResults");
        if (!el) return;
        el.innerHTML = hits.length ? hits.map(h =>
          `<div class="gloss-hit"><strong>${esc(h.term)}</strong><p>${esc(h.def)}</p></div>`
        ).join("") : `<p class="muted">Type a Sanskrit or Bengali term</p>`;
      });
      return;
    }
    if (tab === "listen") {
      document.getElementById("studyBtnListen")?.addEventListener("click", () => {
        api.state.settings.ttsReadingStyle = "human";
        api.saveState();
        api.startReaderAudio?.("human", false);
      });
      document.getElementById("studyBtnNormal")?.addEventListener("click", () => api.startReaderAudio?.("normal", false));
      document.getElementById("studyBtnPravachan")?.addEventListener("click", () => api.startReaderAudio?.("pravachan", false));
      document.getElementById("studyBtnContinue")?.addEventListener("click", () => {
        api.startReaderAudio?.(api.state.settings.ttsReadingStyle || "human", true);
      });
      document.getElementById("studyBtnPause")?.addEventListener("click", () => api.pauseReaderAudio?.());
      document.getElementById("studyBtnResume")?.addEventListener("click", () => api.resumeReaderAudio?.());
      document.getElementById("studyBtnStop")?.addEventListener("click", () => api.stopTtsPlayback?.());
      document.getElementById("studyBtnQueue")?.addEventListener("click", () => {
        const key = bookId + "|" + chapterId;
        const q = api.state.audioQueue || [];
        if (!q.includes(key)) {
          api.state.audioQueue.push(key);
          api.saveState();
          renderStudyTab("listen", bookId, chapterId, book, ch);
        }
      });
      document.getElementById("studySkipFootnotes")?.addEventListener("change", e => {
        api.state.settings.ttsSkipFootnotes = e.target.checked;
        api.state.productivity.skipFootnotesTts = e.target.checked;
        api.saveState();
      });
      document.getElementById("studySleepTimer")?.addEventListener("change", e => {
        const m = +e.target.value;
        api.state.productivity.sleepMinutes = m;
        if (m > 0) startSleepTimer(m);
        api.saveState();
      });
      return;
    }
    if (tab === "qa") {
      const runQa = async () => {
        const q = document.getElementById("studyQaInput")?.value?.trim();
        const el = document.getElementById("studyQaResults");
        if (!q || !el) return;
        el.innerHTML = `<p class="muted">Searching chapter…</p>`;
        const res = await window.AmpsSourceQa?.answerFromSource?.({ bookId, chapterId, question: q, limit: 6 });
        if (res?.citations?.length && window.AmpsSourceQa?.renderResultHtml) {
          el.innerHTML = window.AmpsSourceQa.renderResultHtml(res);
          el.querySelectorAll(".source-qa-cite").forEach(btn => {
            btn.addEventListener("click", () => {
              const paraId = btn.dataset.para;
              document.getElementById(paraId)?.scrollIntoView({ behavior: "smooth", block: "center" });
              toggleStudyPanel(false);
            });
          });
          return;
        }
        const hits = searchChapterText(ch, q).slice(0, 5);
        el.innerHTML = hits.length
          ? hits.map(h => `<div class="reader-study-card"><p>${esc(h.snippet)}</p>
              <button type="button" class="btn btn-ghost btn-sm" data-goto-para="${esc(h.paraId)}">Open ¶</button></div>`).join("")
          : `<p class="muted">No matching passage. Try fewer words.</p>`;
        el.querySelectorAll("[data-goto-para]").forEach(btn => {
          btn.addEventListener("click", () => {
            document.getElementById(btn.dataset.gotoPara)?.scrollIntoView({ behavior: "smooth", block: "center" });
            toggleStudyPanel(false);
          });
        });
      };
      document.getElementById("btnStudyQaAsk")?.addEventListener("click", runQa);
      document.getElementById("studyQaInput")?.addEventListener("keydown", e => { if (e.key === "Enter") runQa(); });
      document.getElementById("btnStudyFullQa")?.addEventListener("click", () => {
        api.navigate("source-qa", { bookId, chapterId });
      });
      return;
    }
    if (tab === "intel") {
      document.getElementById("btnIntelStudy")?.addEventListener("click", () => {
        api.navigate("study", { bookId });
      });
    }
  }

  function renderStudyTab(tab, bookId, chapterId, book, ch) {
    const body = document.getElementById("studyPanelBody");
    if (!body) return;
    body.innerHTML = studyPanelBodyHtml(tab, bookId, chapterId, book, ch);
    bindStudyTabActions(tab, bookId, chapterId, book, ch);
  }

  function searchChapterText(ch, query) {
    const q = String(query || "").toLowerCase().trim();
    if (!q || q.length < 2) return [];
    const terms = q.split(/\s+/).filter(Boolean);
    const out = [];
    (ch.paragraphs || []).forEach(p => {
      const t = String(p.text || "").toLowerCase();
      const score = terms.reduce((s, term) => s + (t.includes(term) ? 1 : 0), 0);
      if (score > 0) {
        const idx = t.indexOf(terms[0]);
        const snippet = String(p.text || "").slice(Math.max(0, idx - 40), idx + 120);
        out.push({ paraId: p.id, score, snippet });
      }
    });
    return out.sort((a, b) => b.score - a.score);
  }

  function applyChapterSearch(ch) {
    const q = (api.state.productivity?.chapterSearch || "").trim().toLowerCase();
    const article = document.getElementById("readerArticle");
    if (!article) return;
    const paras = article.querySelectorAll(".reader-para");
    const hits = [];
    paras.forEach(el => {
      el.classList.remove("chapter-search-hit", "chapter-search-active");
      if (!q || q.length < 2) return;
      const text = (el.querySelector(".para-text")?.textContent || "").toLowerCase();
      if (text.includes(q)) {
        el.classList.add("chapter-search-hit");
        hits.push(el);
      }
    });
    const countEl = document.getElementById("chapterSearchCount");
    if (!q || q.length < 2) {
      if (countEl) countEl.textContent = "";
      api.state.productivity.chapterSearchIdx = 0;
      return;
    }
    if (countEl) countEl.textContent = hits.length ? `${hits.length} match(es)` : "No matches";
    if (hits.length) {
      let idx = api.state.productivity.chapterSearchIdx || 0;
      if (idx >= hits.length) idx = 0;
      hits.forEach((el, i) => el.classList.toggle("chapter-search-active", i === idx));
      hits[idx]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function toggleStudyPanel(open, ctx) {
    ensureState();
    const next = open != null ? open : !api.state.productivity.studyPanelOpen;
    api.state.productivity.studyPanelOpen = next;
    syncStudyPanelDom(next);
    bindStudyPanelClose();
    if (next && window.innerWidth >= 900 && api.state.productivity.tabletSplit) {
      document.body.classList.add("reader-tablet-split");
    } else {
      document.body.classList.remove("reader-tablet-split");
    }
    api.saveState();
    if (!next) return;
    const bookId = ctx?.bookId || api.state.params?.parts?.[1];
    const chapterId = ctx?.chapterId || api.state.params?.parts?.[2];
    const book = ctx?.book;
    const ch = ctx?.ch;
    const tab = api.state.productivity.studyPanelTab || "summary";
    if (book && ch) {
      renderStudyTab(tab, bookId, chapterId, book, ch);
      return;
    }
    if (!bookId || !api.loadBook) return;
    api.loadBook(bookId).then(loaded => {
      const chapter = loaded.chapters.find(c => c.id === chapterId) || loaded.chapters[0];
      renderStudyTab(tab, bookId, chapterId, loaded, chapter);
    }).catch(() => {
      const body = document.getElementById("studyPanelBody");
      if (body) body.innerHTML = `<p class="muted">Could not load study tools. Tap ✕ to close.</p>`;
    });
  }

  function bindReader(bookId, chapterId, book, ch) {
    ensureState();
    trackReading(bookId, chapterId);
    bindActivityTracking();
    bindStudyPanelClose();

    document.querySelectorAll("[data-study-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        api.state.productivity.studyPanelTab = btn.dataset.studyTab;
        api.saveState();
        document.querySelectorAll("[data-study-tab]").forEach(b => b.classList.toggle("active", b === btn));
        renderStudyTab(btn.dataset.studyTab, bookId, chapterId, book, ch);
      });
    });

    if (api.state.productivity.studyPanelOpen) {
      syncStudyPanelDom(true);
      bindStudyTabActions(api.state.productivity.studyPanelTab || "summary", bookId, chapterId, book, ch);
    }

    const searchInput = document.getElementById("chapterSearchInput");
    searchInput?.addEventListener("input", e => {
      api.state.productivity.chapterSearch = e.target.value;
      api.state.productivity.chapterSearchIdx = 0;
      api.saveState();
      applyChapterSearch(ch);
    });
    if (api.state.productivity.chapterSearch) applyChapterSearch(ch);

    document.getElementById("btnChapterSearchNext")?.addEventListener("click", () => {
      api.state.productivity.chapterSearchIdx = (api.state.productivity.chapterSearchIdx || 0) + 1;
      applyChapterSearch(ch);
    });
    document.getElementById("btnChapterSearchPrev")?.addEventListener("click", () => {
      api.state.productivity.chapterSearchIdx = Math.max(0, (api.state.productivity.chapterSearchIdx || 0) - 1);
      applyChapterSearch(ch);
    });

    document.querySelector("[data-resume-ch]")?.addEventListener("click", e => {
      const chId = e.currentTarget.dataset.resumeCh;
      if (chId) api.navigate("read", { bookId, chapterId: chId });
    });
    document.getElementById("btnResumeAudio")?.addEventListener("click", () => {
      api.dispatchSheet?.("tts-continue");
    });

    window.addEventListener("beforeunload", stopSessionTimer, { once: true });
  }

  function selectionToolbarExtra() {
    return `<button type="button" class="hl-btn note" id="btnAddStudyDeck" title="Add to study deck">📚</button>`;
  }

  function bindSelectionStudyDeck(bookId, chapterId, hideToolbar) {
    document.getElementById("btnAddStudyDeck")?.addEventListener("click", () => {
      const sel = api.state.ui.selection;
      if (!sel?.text) return;
      ensureState();
      const key = "hl|" + uid();
      api.state.userStudyCards[key] = {
        ...window.AmpsStudy?.defaultCard?.() || { ease: 2.5, interval: 0, due: Date.now(), reps: 0, lapses: 0 },
        front: sel.text.slice(0, 280),
        back: "",
        bookId,
        chapterId,
        paraId: sel.paraId,
        created: Date.now(),
      };
      const row = currentSession();
      row.highlights = (row.highlights || 0) + 1;
      api.saveState();
      window.getSelection()?.removeAllRanges();
      hideToolbar();
      alert("Added to your study deck. Review from Study → Custom cards.");
    });
  }

  function filterTtsText(text) {
    if (!api?.state?.settings?.ttsSkipFootnotes) return String(text || "");
    return String(text || "")
      .replace(/\(\s*\d+\s*\)/g, " ")
      .replace(/\[\s*\d+\s*\]/g, " ")
      .replace(/\s+\d+\s*(?=[,.;])/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(s) {
    return String(s || "").toLowerCase().split(/[^a-z0-9āīūṛṃ]+/).filter(w => w.length > 2);
  }

  function bm25Score(doc, queryTerms, avgLen, docFreq, N) {
    const k1 = 1.2;
    const b = 0.75;
    const tf = {};
    const words = tokenize(doc);
    words.forEach(w => { tf[w] = (tf[w] || 0) + 1; });
    const len = words.length || 1;
    let score = 0;
    queryTerms.forEach(term => {
      const freq = tf[term] || 0;
      if (!freq) return;
      const df = docFreq[term] || 1;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      score += idf * (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * len / avgLen));
    });
    return score;
  }

  function rankSearchHits(hits, q) {
    if (!hits?.length || !q) return hits;
    const terms = tokenize(q);
    if (!terms.length) return hits;
    const docs = hits.map(h => h.snippet || h.text || "");
    const N = docs.length;
    const avgLen = docs.reduce((a, d) => a + tokenize(d).length, 0) / N || 1;
    const docFreq = {};
    docs.forEach(d => {
      const seen = {};
      tokenize(d).forEach(w => {
        if (!seen[w]) { docFreq[w] = (docFreq[w] || 0) + 1; seen[w] = 1; }
      });
    });
    return hits.map((h, i) => ({
      ...h,
      _bm25: bm25Score(docs[i], terms, avgLen, docFreq, N),
    })).sort((a, b) => (b._bm25 || 0) - (a._bm25 || 0));
  }

  function enhanceSearchHtml(q, html, textHits) {
    if (!textHits?.length) return html;
    const ranked = rankSearchHits(textHits, q);
    if (ranked === textHits) return html;
    return html.replace(
      /<section class="section"><h2 class="section-head">In text/,
      `<section class="section"><h2 class="section-head">In text (ranked)`
    );
  }

  function startSleepTimer(minutes) {
    clearInterval(sleepInterval);
    const end = Date.now() + minutes * 60000;
    api.state.productivity.sleepEnd = end;
    sleepInterval = setInterval(() => {
      if (Date.now() >= end) {
        clearInterval(sleepInterval);
        api.stopTtsPlayback?.();
        api.state.productivity.sleepEnd = 0;
        alert("Sleep timer — playback stopped");
      }
    }, 5000);
    const tts = window.AmpsAudio?.TTS || window.AmpsFeatures?.TTS;
    tts?.sleepTimer?.(minutes, () => api.stopTtsPlayback?.());
  }

  function initAutoSync() {
    const run = async () => {
      if (document.visibilityState !== "visible") return;
      const lic = api.state.license;
      const base = lic?.apiBaseUrl || api.state.settings?.apiBaseUrl;
      if (lic?.email && lic?.licenseKey && base && window.AmpsSync?.syncAccountLww) {
        try {
          const result = await window.AmpsSync.syncAccountLww(api.state, {
            email: lic.email,
            licenseKey: lic.licenseKey,
            apiBaseUrl: base,
          });
          api.saveState?.();
          if (result.action === "pulled") api.renderFromState?.();
        } catch (_) { /* offline ok */ }
        return;
      }
      if (!api.state.productivity.autoSync || !api.state.settings.syncEndpoint) return;
      try {
        const result = await window.AmpsSync.syncEndpointLww?.(api.state.settings.syncEndpoint, api.state);
        api.saveState?.();
        if (result?.action === "pulled") api.renderFromState?.();
      } catch (_) { /* offline ok */ }
    };
    document.addEventListener("visibilitychange", () => { run(); });
    setTimeout(run, 2500);
  }

  let activityTimer = null;
  let lastReaderActivity = 0;

  function markReaderActivity() {
    lastReaderActivity = Date.now();
  }

  function bindActivityTracking() {
    clearInterval(activityTimer);
    lastReaderActivity = Date.now();
    const onActivity = () => markReaderActivity();
    window.addEventListener("scroll", onActivity, { passive: true });
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") markReaderActivity();
    });
    activityTimer = setInterval(() => {
      if (document.hidden || api.state.route !== "read") return;
      if (Date.now() - lastReaderActivity > 90000) return;
      const row = currentSession();
      row.activeSeconds = (row.activeSeconds || 0) + 5;
      row.minutes = row.activeSeconds / 60;
      api.saveState();
    }, 5000);
  }

  function buildUserStudyQueue(mode) {
    const all = Object.keys(api.state.userStudyCards || {});
    let keys = mode === "due" ? dueUserCardKeys() : all;
    if (!keys.length && mode === "due") keys = all.slice(0, 20);
    for (let i = keys.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    return keys.slice(0, 25);
  }

  function customStudyCardsSectionHtml() {
    if (!api?.state) return "";
    const cards = Object.entries(api.state.userStudyCards || {});
    const due = dueUserCardKeys().length;
    if (!cards.length) {
      return `<p class="muted" style="margin-top:1rem">Highlight text while reading and tap 📚 to build a custom study deck.</p>`;
    }
    const preview = cards.slice(0, 5).map(([, c]) =>
      `<div class="reader-study-card"><strong>${esc((c.front || "").slice(0, 120))}</strong><span class="muted">${esc(c.bookId || "")}</span></div>`
    ).join("");
    return `<section class="section productivity-custom-cards" style="margin-top:1rem">
      <h2 class="section-head">Custom cards (${cards.length}, ${due} due)</h2>
      ${preview}
      <div class="quick-grid" style="margin-top:0.75rem">
        <button type="button" class="btn btn-gold btn-sm" id="btnStartUserStudy">Review custom cards</button>
        <button type="button" class="btn btn-ghost btn-sm" id="btnStartUserStudyDue">Due only (${due})</button>
      </div>
    </section>`;
  }

  function bindCustomStudyButtons() {
    document.getElementById("btnStartUserStudy")?.addEventListener("click", () => {
      const queue = buildUserStudyQueue("all");
      if (!queue.length) return alert("No custom cards yet.");
      api.state.userStudySession = { queue, idx: 0, revealed: false, mode: "all" };
      api.saveState();
      api.renderFromState();
    });
    document.getElementById("btnStartUserStudyDue")?.addEventListener("click", () => {
      const queue = buildUserStudyQueue("due");
      if (!queue.length) return alert("No cards due right now.");
      api.state.userStudySession = { queue, idx: 0, revealed: false, mode: "due" };
      api.saveState();
      api.renderFromState();
    });
  }

  async function renderUserStudyReview() {
    const session = api.state.userStudySession;
    if (!session?.queue?.length) {
      api.state.userStudySession = null;
      api.saveState();
      api.navigate("study");
      return;
    }
    const key = session.queue[session.idx];
    const card = api.state.userStudyCards[key];
    if (!card) {
      session.idx += 1;
      if (session.idx >= session.queue.length) api.state.userStudySession = null;
      api.saveState();
      return renderUserStudyReview();
    }
    const body = `<section class="hero hero-compact"><h1>Custom study</h1>
      <p class="hero-sub">Card ${session.idx + 1} of ${session.queue.length}</p></section>
      <div class="study-card modern-card">
        <p class="muted">${esc(card.bookId || "")}</p>
        <div class="study-front">${esc(card.front || "")}</div>
        ${session.revealed ? `<div class="study-back">${card.back ? esc(card.back) : "<span class='muted'>Recall the passage, then rate yourself.</span>"}</div>` : ""}
        <div class="quick-grid">
          ${!session.revealed ? `<button type="button" class="btn btn-gold" id="btnRevealUserCard">Reveal</button>` : ""}
          ${session.revealed ? `
            <button type="button" class="btn btn-ghost" data-rate="again">Again</button>
            <button type="button" class="btn btn-ghost" data-rate="hard">Hard</button>
            <button type="button" class="btn btn-gold" data-rate="good">Good</button>
            <button type="button" class="btn btn-ghost" data-rate="easy">Easy</button>` : ""}
          <button type="button" class="btn btn-ghost btn-sm" id="btnOpenUserCard">Open in book</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnEndUserStudy">End session</button>
        </div>
      </div>`;
    api.renderShell(body, {
      title: "Custom study",
      tab: "study",
      bind: () => {
        document.getElementById("btnRevealUserCard")?.addEventListener("click", () => {
          session.revealed = true;
          api.saveState();
          renderUserStudyReview();
        });
        document.querySelectorAll("[data-rate]").forEach(btn => {
          btn.addEventListener("click", () => {
            window.AmpsStudy?.rateCard?.(card, btn.dataset.rate);
            session.idx += 1;
            session.revealed = false;
            if (session.idx >= session.queue.length) {
              api.state.userStudySession = null;
              api.saveState();
              alert("Custom study session complete.");
              api.navigate("study");
              return;
            }
            api.saveState();
            renderUserStudyReview();
          });
        });
        document.getElementById("btnOpenUserCard")?.addEventListener("click", () => {
          if (card.bookId && card.chapterId) {
            api.navigate("read", { bookId: card.bookId, chapterId: card.chapterId, paraId: card.paraId });
          }
        });
        document.getElementById("btnEndUserStudy")?.addEventListener("click", () => {
          api.state.userStudySession = null;
          api.saveState();
          api.navigate("study");
        });
      },
    });
  }

  async function semanticLibrarySearch(catalog, q, limit) {
    const terms = tokenize(q);
    if (terms.length < 2) return [];
    const books = (catalog?.books || []).slice(0, 40);
    const hits = [];
    const loader = window.AmpsSourceQa?.loadSearchShard;
    if (!loader) return [];
    await Promise.all(books.map(async b => {
      const shard = await loader(b.id);
      shard.forEach(row => {
        const text = String(row.t || "");
        const lower = text.toLowerCase();
        let score = 0;
        terms.forEach(t => { if (lower.includes(t)) score += t.length > 5 ? 3 : 2; });
        if (!score) return;
        hits.push({
          bookId: b.id,
          bookTitle: b.title,
          chapterId: row.c,
          chapterTitle: row.chapterTitle || row.c,
          paraId: row.p,
          snippet: text.slice(0, 220),
          score,
        });
      });
    }));
    return rankSearchHits(hits, q).slice(0, limit || 25);
  }

  function install(app) {
    api = app;
    ensureState();
    initAutoSync();
    if (api.state.settings.syncEndpoint) {
      api.state.productivity.autoSync = true;
    }
  }

  window.AmpsProductivity = {
    install,
    todayExtrasHtml,
    readerExtrasHtml,
    readerSplitCloseHtml,
    bindReader,
    selectionToolbarExtra,
    bindSelectionStudyDeck,
    filterTtsText,
    rankSearchHits,
    semanticLibrarySearch,
    enhanceSearchHtml,
    toggleStudyPanel,
    customStudyCardsSectionHtml,
    bindCustomStudyButtons,
    renderUserStudyReview,
    trackHighlight: () => {
      const row = currentSession();
      row.highlights = (row.highlights || 0) + 1;
      api?.saveState?.();
    },
  };
})();

/* AMPS Reader — minimal reader toolbar + bottom sheet */
(function () {
  "use strict";

  let api = null;
  let sheetHandlers = null;
  let sheetUiReady = false;
  let lastSheetAct = "";
  let lastSheetActAt = 0;

  function esc(s) {
    return api?.esc ? api.esc(s) : String(s ?? "");
  }

  function getSheetEl() {
    return document.body.querySelector("#readerBottomSheet");
  }

  function getBackdropEl() {
    return document.body.querySelector("#readerSheetBackdrop");
  }

  function sheetIsOpen() {
    const sheet = getSheetEl();
    return !!(sheet && !sheet.classList.contains("hidden"));
  }

  function install(appApi) {
    api = appApi;
    ensureSheetDom();
    initReaderSheetUi();
  }

  function listenIcon(opts) {
    const o = opts || {};
    if (o.audioPaused) return "▶";
    if (o.audioActive) return "⏸";
    return "🔊";
  }

  function listenTitle(opts) {
    const o = opts || {};
    if (o.audioPaused) return "Resume listening";
    if (o.audioActive) return "Pause listening";
    return "Listen";
  }

  function formatTtsRate(rate) {
    const r = Math.min(1.6, Math.max(0.6, +rate || 1));
    return `${r.toFixed(1)}×`;
  }

  function ttsRateControlHtml(rate, idPrefix) {
    const r = Math.min(1.6, Math.max(0.6, +rate || 1));
    const prefix = idPrefix ? `${idPrefix}-` : "";
    return `
      <div class="reader-audio-speed">
        <span class="reader-audio-speed-label">Speed</span>
        <button type="button" class="reader-tts-rate-step" data-reader-tts-rate-step="-0.1" aria-label="Slower">−</button>
        <input type="range" class="reader-tts-rate" id="${prefix}readerTtsRate" data-reader-tts-rate min="0.6" max="1.6" step="0.1" value="${r}" aria-label="Reading speed" />
        <button type="button" class="reader-tts-rate-step" data-reader-tts-rate-step="0.1" aria-label="Faster">+</button>
        <span class="reader-tts-rate-label" data-reader-tts-rate-label>${formatTtsRate(r)}</span>
      </div>`;
  }

  function toolbarHtml(opts) {
    const o = opts || {};
    return `
      <div class="reader-toolbar-wrap reader-toolbar-minimal">
        <div class="reader-toolbar-main">
          <button type="button" class="icon-btn reader-toolbar-btn reader-toolbar-menu" data-reader-act="menu" title="Menu" aria-label="Menu">☰</button>
          <div class="reader-toolbar-meta">
            <span class="reader-chapter">${esc(o.label || "")}</span>
            <span class="reader-eta">${esc(o.remainMin || 0)} min left</span>
          </div>
          <div class="reader-toolbar-actions">
            <button type="button" class="icon-btn reader-toolbar-btn reader-toolbar-bookmark ${o.bookmarked ? "active" : ""}" id="btnBookmark" data-reader-act="bookmark" title="Bookmark this passage" aria-label="Bookmark">☆</button>
            <button type="button" class="icon-btn reader-toolbar-btn reader-toolbar-listen ${o.audioActive || o.audioPaused ? "tts-on" : ""}" id="btnListen" data-reader-act="listen" title="${esc(listenTitle(o))}" aria-label="${esc(listenTitle(o))}">${listenIcon(o)}</button>
            ${o.audioActive || o.audioPaused ? `<button type="button" class="icon-btn reader-toolbar-btn reader-toolbar-stop" id="btnListenStop" data-reader-act="tts-stop" title="Stop audio" aria-label="Stop audio">⏹</button>` : ""}
            <button type="button" class="icon-btn reader-toolbar-btn reader-toolbar-study" id="btnStudyPanel" data-reader-act="study" title="Study panel" aria-label="Study panel">📚</button>
            <button type="button" class="icon-btn reader-toolbar-btn reader-toolbar-text" id="btnReaderSettings" data-reader-act="settings" title="Text settings" aria-label="Text settings">Aa</button>
          </div>
        </div>
        <div class="reader-audio-top-controls" aria-label="Audio controls">
          <button type="button" class="reader-audio-pill reader-audio-toggle ${o.audioActive || o.audioPaused ? "tts-on" : ""}" id="btnMobileListen" data-reader-act="listen" title="${esc(listenTitle(o))}" aria-label="${esc(listenTitle(o))}">
            <span class="reader-audio-icon">${listenIcon(o)}</span><span class="reader-audio-label">${o.audioPaused ? "Resume" : o.audioActive ? "Pause" : "Listen"}</span>
          </button>
          <button type="button" class="reader-audio-pill reader-audio-stop" id="btnMobileStop" data-reader-act="tts-stop" title="Stop audio" aria-label="Stop audio">
            <span>⏹</span><span>Stop</span>
          </button>
        </div>
        ${ttsRateControlHtml(o.ttsRate, "toolbar")}
        <div class="reader-audio-dock reader-audio-mini" id="readerAudioMini" aria-label="Now playing">
          <div class="reader-audio-mini-meta">
            <strong class="reader-audio-mini-title" id="audioMiniTitle">${esc(o.audioTitle || "Listening")}</strong>
            <span class="reader-audio-mini-sub" id="audioMiniSub">${esc(o.audioSub || "")}</span>
            <div class="reader-audio-mini-progress" aria-hidden="true">
              <div class="reader-audio-mini-fill" id="audioMiniFill" style="width:${Math.max(0, Math.min(100, Number(o.audioPct) || 0))}%"></div>
            </div>
          </div>
          <div class="reader-audio-mini-actions">
            <button type="button" class="reader-audio-pill reader-audio-nav" id="btnDockPrev" data-reader-act="tts-prev" title="Previous paragraph" aria-label="Previous paragraph">⏮</button>
            <button type="button" class="reader-audio-pill reader-audio-toggle ${o.audioActive || o.audioPaused ? "tts-on" : ""}" id="btnDockListen" data-reader-act="listen" title="${esc(listenTitle(o))}" aria-label="${esc(listenTitle(o))}">
              <span class="reader-audio-icon">${listenIcon(o)}</span><span class="reader-audio-label">${o.audioPaused ? "Resume" : o.audioActive ? "Pause" : "Listen"}</span>
            </button>
            <button type="button" class="reader-audio-pill reader-audio-nav" id="btnDockNext" data-reader-act="tts-next" title="Next paragraph" aria-label="Next paragraph">⏭</button>
            <button type="button" class="reader-audio-pill reader-audio-stop" id="btnDockStop" data-reader-act="tts-stop" title="Stop audio" aria-label="Stop audio">⏹</button>
          </div>
        </div>
      </div>`;
  }

  function bottomSheetShell() {
    return `
      <div id="readerSheetBackdrop" class="reader-sheet-backdrop hidden" aria-hidden="true"></div>
      <div id="readerBottomSheet" class="reader-bottom-sheet hidden" role="dialog" aria-modal="true" aria-label="Reader menu">
        <div class="reader-sheet-handle" aria-hidden="true"></div>
        <header class="reader-sheet-head">
          <h3 id="readerSheetTitle">Reader menu</h3>
          <button type="button" class="icon-btn reader-sheet-close" id="btnReaderSheetClose" aria-label="Close">✕</button>
        </header>
        <div class="reader-sheet-body" id="readerSheetBody"></div>
      </div>`;
  }

  function purgeLegacySheetDom() {
    document.querySelectorAll("#app #readerBottomSheet, #app #readerSheetBackdrop").forEach(el => el.remove());
  }

  function ensureSheetDom() {
    purgeLegacySheetDom();
    if (!getSheetEl()) {
      const mount = document.createElement("div");
      mount.innerHTML = bottomSheetShell();
      while (mount.firstChild) {
        document.body.appendChild(mount.firstChild);
      }
    }
    attachSheetEvents();
  }

  function sheetBodyHtml(opts) {
    const o = opts || {};
    const playing = !!o.audioActive;
    const paused = !!o.audioPaused;
    return `
      <p class="reader-sheet-section">Navigate</p>
      <div class="reader-sheet-grid">
        <button type="button" class="reader-sheet-item" data-sheet-act="toc"><span>☰</span><strong>Contents</strong><small>Chapter list</small></button>
        <button type="button" class="reader-sheet-item" data-sheet-act="present"><span>▣</span><strong>Discourse mode</strong><small>Presentation view</small></button>
        <button type="button" class="reader-sheet-item" data-sheet-act="glossary"><span>अ</span><strong>Glossary</strong><small>Lookup terms</small></button>
        <button type="button" class="reader-sheet-item" data-sheet-act="study"><span>📚</span><strong>Study panel</strong><small>Notes, summary, Q&A</small></button>
        <button type="button" class="reader-sheet-item" data-sheet-act="immersive"><span>${o.immersive ? "⊡" : "⊞"}</span><strong>${o.immersive ? "Exit full screen" : "Full screen"}</strong><small>Immersive reading</small></button>
      </div>
      <p class="reader-sheet-section">Chapter</p>
      <div class="reader-sheet-grid reader-sheet-grid-2">
        <button type="button" class="reader-sheet-item" data-sheet-act="summary"><span>∑</span><strong>Summarize</strong></button>
        <button type="button" class="reader-sheet-item" data-sheet-act="share"><span>⎘</span><strong>Share</strong></button>
      </div>
      <p class="reader-sheet-section">Listen</p>
      ${ttsRateControlHtml(o.ttsRate, "sheet")}
      <div class="reader-sheet-pauses">
        <p class="reader-sheet-section">Punctuation pauses</p>
        <label class="reader-sheet-pause-row">Comma / clause <span data-tts-pause-label="comma">${Math.round(o.ttsCommaPause || 160)} ms</span>
          <input type="range" data-tts-pause="comma" min="80" max="900" step="10" value="${Math.max(80, o.ttsCommaPause || 160)}" />
        </label>
        <label class="reader-sheet-pause-row">Sentence <span data-tts-pause-label="sentence">${Math.round(o.ttsSentencePause || 280)} ms</span>
          <input type="range" data-tts-pause="sentence" min="180" max="900" step="25" value="${Math.round(o.ttsSentencePause || 280)}" />
        </label>
      </div>
      <div class="reader-sheet-list">
        <button type="button" class="reader-sheet-row" data-sheet-act="tts-human"><span>🎙</span> Podcast narration</button>
        <button type="button" class="reader-sheet-row" data-sheet-act="tts-normal"><span>🔊</span> Normal reading</button>
        <button type="button" class="reader-sheet-row" data-sheet-act="tts-pravachan"><span>🎙</span> Pravachan style</button>
        <button type="button" class="reader-sheet-row" data-sheet-act="tts-download-chapter"><span>⬇</span> Download chapter MP3</button>
        ${o.canGenerateChapterAudio ? `<button type="button" class="reader-sheet-row" data-sheet-act="tts-generate-chapter"><span>💾</span> Prepare chapter for offline</button>` : ""}
        <button type="button" class="reader-sheet-row" data-sheet-act="tts-continue"><span>↩</span> Continue from last paragraph</button>
        ${playing && !paused ? `<button type="button" class="reader-sheet-row" data-sheet-act="tts-pause"><span>⏸</span> Pause</button>` : ""}
        ${paused ? `<button type="button" class="reader-sheet-row" data-sheet-act="tts-resume"><span>▶</span> Resume</button>` : ""}
        ${playing || paused ? `<button type="button" class="reader-sheet-row reader-sheet-row-danger" data-sheet-act="tts-stop"><span>⏹</span> Stop audio</button>` : ""}
      </div>
      <p class="reader-sheet-section">Tools</p>
      <div class="reader-sheet-list">
        <button type="button" class="reader-sheet-row" data-sheet-act="pronunciation"><span>🗣</span> Pronunciation corrections</button>
        <button type="button" class="reader-sheet-row" data-sheet-act="source-qa"><span>?</span> Ask about this chapter</button>
        ${window.AmpsBuildFlags?.presentationBuilder !== false ? `<button type="button" class="reader-sheet-row" data-sheet-act="presentation"><span>▣</span> Presentation Builder</button>` : ""}
      </div>`;
  }

  function sheetHandler() {
    return sheetHandlers || api?.dispatchSheet || null;
  }

  function runSheetAction(act) {
    const handler = sheetHandler();
    if (!act || !handler) {
      console.warn("Reader sheet action ignored (no handler):", act);
      return;
    }
    if (act === "toc" || act === "glossary" || act === "pronunciation" || act === "presentation" || act === "study") {
      closeSheet();
    }
    try {
      const result = handler(act);
      if (result && typeof result.then === "function") {
        result.catch(err => console.error("Reader sheet action failed:", act, err));
      }
    } catch (err) {
      console.error("Reader sheet action failed:", act, err);
    }
  }

  function onSheetPointer(e) {
    if (!sheetIsOpen()) return;

    const sheet = getSheetEl();
    if (!sheet) return;

    if (e.target.closest?.("#btnReaderSheetClose")) {
      e.preventDefault();
      e.stopPropagation();
      closeSheet();
      return;
    }

    const sheetBtn = e.target.closest?.("[data-sheet-act]");
    if (!sheetBtn || !sheet.contains(sheetBtn)) return;

    e.preventDefault();
    e.stopPropagation();
    const act = sheetBtn.dataset.sheetAct;
    const now = Date.now();
    if (act === lastSheetAct && now - lastSheetActAt < 400) return;
    lastSheetAct = act;
    lastSheetActAt = now;
    runSheetAction(act);
  }

  function attachSheetEvents() {
    const sheet = getSheetEl();
    const backdrop = getBackdropEl();
    if (!sheet || sheet.dataset.sheetBound === "1") return;
    sheet.dataset.sheetBound = "1";

    sheet.addEventListener("click", onSheetPointer, true);
    sheet.addEventListener("pointerup", onSheetPointer, true);

    if (backdrop && backdrop.dataset.sheetBound !== "1") {
      backdrop.dataset.sheetBound = "1";
      backdrop.addEventListener("click", e => {
        if (!sheetIsOpen()) return;
        e.preventDefault();
        closeSheet();
      }, true);
      backdrop.addEventListener("pointerup", e => {
        if (!sheetIsOpen()) return;
        e.preventDefault();
        closeSheet();
      }, true);
    }
  }

  function initReaderSheetUi() {
    if (sheetUiReady) return;
    sheetUiReady = true;
  }

  function openSheet(opts) {
    ensureSheetDom();
    const body = document.getElementById("readerSheetBody");
    const backdrop = getBackdropEl();
    const sheet = getSheetEl();
    if (!body || !backdrop || !sheet) return;
    body.innerHTML = sheetBodyHtml(opts);
    backdrop.classList.remove("hidden");
    sheet.classList.remove("hidden");
    backdrop.setAttribute("aria-hidden", "false");
    document.body.classList.add("reader-sheet-open");
  }

  function closeSheet() {
    getBackdropEl()?.classList.add("hidden");
    getSheetEl()?.classList.add("hidden");
    getBackdropEl()?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("reader-sheet-open");
  }

  function refreshSheet(opts) {
    const sheet = getSheetEl();
    if (!sheet || sheet.classList.contains("hidden")) return;
    const body = document.getElementById("readerSheetBody");
    if (body) body.innerHTML = sheetBodyHtml(opts);
  }

  function bindSheet(handlers) {
    sheetHandlers = handlers;
  }

  function syncAudioControlButton(btn, active, paused) {
    if (!btn) return;
    const title = paused ? "Resume listening" : active ? "Pause listening" : "Listen";
    btn.classList.toggle("tts-on", !!(active || paused));
    btn.title = title;
    btn.setAttribute("aria-label", title);
    const icon = btn.querySelector(".reader-audio-icon");
    const label = btn.querySelector(".reader-audio-label");
    if (icon) icon.textContent = paused ? "▶" : active ? "⏸" : "🔊";
    if (label) label.textContent = paused ? "Resume" : active ? "Pause" : "Listen";
  }

  function updateListenButton(active, paused) {
    const btn = document.getElementById("btnListen");
    if (btn) {
      btn.classList.toggle("tts-on", !!(active || paused));
      btn.textContent = paused ? "▶" : active ? "⏸" : "🔊";
      btn.title = paused ? "Resume listening" : active ? "Pause listening" : "Listen";
      btn.setAttribute("aria-label", btn.title);
    }
    syncAudioControlButton(document.getElementById("btnMobileListen"), active, paused);
    syncAudioControlButton(document.getElementById("btnDockListen"), active, paused);
    const stopBtn = document.getElementById("btnListenStop");
    if (stopBtn) stopBtn.classList.toggle("hidden", !(active || paused));
  }

  function updateAudioMiniPlayer(opts) {
    const o = opts || {};
    const title = document.getElementById("audioMiniTitle");
    const sub = document.getElementById("audioMiniSub");
    const fill = document.getElementById("audioMiniFill");
    if (title && o.title != null) title.textContent = o.title;
    if (sub && o.sub != null) sub.textContent = o.sub;
    if (fill && o.pct != null) fill.style.width = `${Math.max(0, Math.min(100, Number(o.pct) || 0))}%`;
  }

  function updateBookmarkButton(active) {
    const btn = document.getElementById("btnBookmark");
    if (!btn) return;
    btn.classList.toggle("active", !!active);
    btn.textContent = active ? "★" : "☆";
    btn.title = active ? "Remove bookmark" : "Bookmark this passage";
    btn.setAttribute("aria-label", btn.title);
  }

  window.AmpsReaderUI = {
    install,
    toolbarHtml,
    ttsRateControlHtml,
    formatTtsRate,
    bottomSheetShell,
    openSheet,
    closeSheet,
    refreshSheet,
    bindSheet,
    updateListenButton,
    updateAudioMiniPlayer,
    updateBookmarkButton,
  };
})();

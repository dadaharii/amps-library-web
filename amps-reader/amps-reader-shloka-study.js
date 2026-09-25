/* AMPS Reader — shloka study modes: hide meaning, memorize, repeat, slow recitation */
(function () {
  "use strict";

  const MODES = {
    off: { label: "Study mode: Off" },
    "hide-meaning": { label: "Hide meaning" },
    memorize: { label: "Memorization (tap to reveal)" },
    "repeat-line": { label: "Repeat each line" },
    "repeat-verse": { label: "Repeat whole verse" },
    slow: { label: "Slow recitation" },
  };

  let api = null;

  function install(appApi) {
    api = appApi;
  }

  function esc(s) {
    return api?.esc ? api.esc(s) : String(s ?? "");
  }

  function getMode(settings) {
    const m = settings?.shlokaStudyMode;
    return MODES[m] ? m : "off";
  }

  function getRepeatCount(settings) {
    const Study = typeof window !== "undefined" ? window.AmpsStudyListen : null;
    if (Study?.clampRepeat) return Study.clampRepeat(settings?.shlokaRepeatCount ?? 3);
    const n = Number(settings?.shlokaRepeatCount);
    if (!Number.isFinite(n)) return 3;
    return Math.min(20, Math.max(1, Math.round(n)));
  }

  function studyBarHtml(settings) {
    const mode = getMode(settings);
    const repeat = getRepeatCount(settings);
    const showRepeat = mode === "repeat-line" || mode === "repeat-verse";
    const opts = Object.entries(MODES).map(([k, v]) =>
      `<option value="${k}" ${mode === k ? "selected" : ""}>${esc(v.label)}</option>`
    ).join("");
    return `
      <div class="shloka-study-bar" id="shlokaStudyBar">
        <label class="shloka-study-label">Study
          <select id="shlokaStudyMode" class="shloka-study-select" aria-label="Study mode">${opts}</select>
        </label>
        ${showRepeat ? `<label class="shloka-study-repeat">×
          <input type="number" id="shlokaRepeatCount" min="1" max="20" value="${repeat}" aria-label="Repeat count" />
        </label>` : ""}
        <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaStudyListen"
          title="Listen with study mode"
          aria-label="Study listen: play the current sútra with the selected study mode">🔊 Study listen</button>
      </div>`;
  }

  function applyDomMode(mode) {
    const article = document.getElementById("readerArticle");
    if (!article) return;
    article.classList.toggle("shloka-hide-meaning", mode === "hide-meaning");
    article.classList.toggle("shloka-memorize", mode === "memorize");
  }

  function bindStudyBar(settings, handlers) {
    const sel = document.getElementById("shlokaStudyMode");
    const repeatEl = document.getElementById("shlokaRepeatCount");
    const btn = document.getElementById("btnShlokaStudyListen");
    sel?.addEventListener("change", () => {
      handlers?.onModeChange?.(sel.value);
    });
    repeatEl?.addEventListener("change", () => {
      const clamped = getRepeatCount({ shlokaRepeatCount: repeatEl.value });
      repeatEl.value = String(clamped);
      handlers?.onRepeatChange?.(clamped);
    });
    // Re-bind on each render (button is recreated). Use once-per-element guard.
    if (btn && btn.dataset.studyListenBound !== "1") {
      btn.dataset.studyListenBound = "1";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        handlers?.onStudyListen?.();
      });
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handlers?.onStudyListen?.();
        }
      });
    }
    applyDomMode(getMode(settings));
    bindMemorizeReveal();
  }

  function bindMemorizeReveal() {
    const article = document.getElementById("readerArticle");
    if (!article || article.dataset.memorizeBound) return;
    article.dataset.memorizeBound = "1";
    article.addEventListener("click", e => {
      const line = e.target.closest?.(".shloka-line:not(.shloka-meaning)");
      if (!line || !article.classList.contains("shloka-memorize")) return;
      line.classList.toggle("shloka-revealed");
    });
  }

  function shlokaSpeakLines(para, prefs) {
    const lines = [];
    const pushLines = (text, kind) => {
      String(text || "").split("\n").filter(r => r.trim()).forEach(row => {
        lines.push({ text: row.trim(), kind });
      });
    };
    const roman = para.sanskritRoman || para.sutraRoman;
    if (prefs.roman && roman) pushLines(roman, "roman");
    else if (prefs.dev && para.devanagari) pushLines(para.devanagari, "dev");
    else if (prefs.bng && para.bangla) pushLines(para.bangla, "bng");
    else if (para.text) pushLines(para.text, "text");
    return lines;
  }

  function buildStudySegments(para, settings, prefs) {
    const mode = getMode(settings);
    const repeat = getRepeatCount(settings);
    const lines = shlokaSpeakLines(para, prefs);
    const segments = [];

    if (mode === "repeat-line") {
      lines.forEach(line => {
        for (let i = 0; i < repeat; i++) {
          segments.push({ text: line.text, pauseBefore: i ? 400 : 200, pauseAfter: 600 });
        }
      });
      return segments;
    }

    if (mode === "repeat-verse" || mode === "off") {
      const verseText = lines.map(l => l.text).join("\n");
      const times = mode === "off" ? 1 : repeat;
      for (let i = 0; i < times; i++) {
        segments.push({ text: verseText, pauseBefore: i ? 500 : 300, pauseAfter: 900 });
      }
      return segments;
    }

    if (mode === "slow") {
      const verseText = lines.map(l => l.text).join(". ");
      segments.push({ text: verseText, pauseBefore: 300, pauseAfter: 800 });
      return segments;
    }

    return null;
  }

  function studyRate(settings, baseRate) {
    return getMode(settings) === "slow" ? Math.min(baseRate, 0.65) : baseRate;
  }

  window.AmpsShlokaStudy = {
    install,
    MODES,
    getMode,
    getRepeatCount,
    studyBarHtml,
    bindStudyBar,
    applyDomMode,
    buildStudySegments,
    studyRate,
    shlokaSpeakLines,
  };
})();

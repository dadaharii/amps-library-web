/* AMPS Reader — temporary Samskrta Shloka book editor (Studio). Set ENABLED = false when done. */
(function (root) {
  "use strict";

  const ENABLED = root.AmpsBuildFlags?.shlokaBookEditor !== false;

  const STORAGE_KEY = "amps-shloka-book-override-v1";
  const OPEN_STORAGE_KEY = "amps-shloka-editor-open";
  const LIVE_SAVE_STORAGE_KEY = "amps-shloka-editor-live-save";
  const BOOK_ID = "samskrta-shloka";
  const VERSES_CHAPTER = "ch-verses";

  let _clearBookCache = null;
  let _rebuildSourceIndexes = null;

  function isEnabled() {
    return ENABLED;
  }

  function sourceLocKey(source) {
    return `${source.bookId}|${source.chapterId}|${source.paraId}`;
  }

  function sortShlokaSources(sources) {
    return [...(sources || [])].sort((a, b) => {
      const byBook = (a.bookTitle || "").localeCompare(b.bookTitle || "", "en", { sensitivity: "base" });
      if (byBook) return byBook;
      const byCh = (a.chapterTitle || "").localeCompare(b.chapterTitle || "", "en", { sensitivity: "base" });
      if (byCh) return byCh;
      return (a.paraId || "").localeCompare(b.paraId || "");
    });
  }

  function formatParaBody(p) {
    const lines = [p.sanskritRoman];
    if (p.devanagari) lines.push(p.devanagari);
    if (p.bangla) lines.push(p.bangla);
    if (p.oriya) lines.push(p.oriya);
    if (p.punjabi) lines.push(p.punjabi);
    if (p.kannada) lines.push(p.kannada);
    if (p.telugu) lines.push(p.telugu);
    if (p.wordMeaning) lines.push(p.wordMeaning);
    return lines.filter(Boolean).join("\n");
  }

  function renumberParagraphs(paragraphs) {
    return paragraphs.map((p, i) => ({
      ...p,
      id: `ch-verses-p${i + 1}`,
    }));
  }

  function syncParaMeta(p) {
    const first = (p.sources || [])[0];
    if (first) {
      p.sourceBookId = first.bookId;
      p.sourceBookTitle = first.bookTitle;
      p.sourceChapterId = first.chapterId;
      p.sourceChapterTitle = first.chapterTitle;
      p.sourceParaId = first.paraId;
    } else {
      p.sourceBookId = null;
      p.sourceBookTitle = null;
      p.sourceChapterId = null;
      p.sourceChapterTitle = null;
      p.sourceParaId = null;
    }
    p.text = formatParaBody(p);
    p.summary = [String(p.sanskritRoman || "").slice(0, 120)];
    return p;
  }

  function mergeSources(into, fromParas, mergeSourcesFlag) {
    if (!mergeSourcesFlag) return into;
    const keys = new Set((into.sources || []).map(sourceLocKey));
    fromParas.forEach(from => {
      (from.sources || []).forEach(source => {
        const key = sourceLocKey(source);
        if (keys.has(key)) return;
        keys.add(key);
        into.sources.push(source);
      });
      if (!into.englishMeaning && from.englishMeaning) into.englishMeaning = from.englishMeaning;
      if (!into.verseMeaning && from.verseMeaning) into.verseMeaning = from.verseMeaning;
      if (!into.hindiMeaning && from.hindiMeaning) into.hindiMeaning = from.hindiMeaning;
      if (!into.wordMeaning && from.wordMeaning) into.wordMeaning = from.wordMeaning;
    });
    into.sources = sortShlokaSources(into.sources || []);
    return syncParaMeta(into);
  }

  function loadOverride() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!Array.isArray(data?.paragraphs) || !data.paragraphs.length) return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  function saveOverride(paragraphs) {
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      paragraphs: renumberParagraphs(paragraphs.map(p => ({ ...p }))),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return payload;
  }

  function clearOverride() {
    localStorage.removeItem(STORAGE_KEY);
    _clearBookCache?.();
  }

  function versesChapter(book) {
    return book?.chapters?.find(c => c.id === VERSES_CHAPTER);
  }

  function applyOverride(book) {
    if (!ENABLED || !book || book.id !== BOOK_ID) return book;
    const ov = loadOverride();
    const ch = versesChapter(book);
    if (!ov || !ch) return book;
    const teluguByRoman = new Map(
      ch.paragraphs
        .filter(p => p.sanskritRoman && p.telugu)
        .map(p => [p.sanskritRoman, p.telugu]),
    );
    ch.paragraphs = ov.paragraphs.map(p => {
      const para = { ...p };
      if (!para.telugu && para.sanskritRoman) {
        para.telugu = teluguByRoman.get(para.sanskritRoman) || "";
      }
      return syncParaMeta(para);
    });
    return book;
  }

  function getParagraphs(book) {
    return [...(versesChapter(book)?.paragraphs || [])];
  }

  function commitParagraphs(book, paragraphs) {
    const ch = versesChapter(book);
    if (!ch) throw new Error("Samskrta Shloka verses chapter not found.");
    ch.paragraphs = renumberParagraphs(paragraphs.map(p => syncParaMeta({ ...p })));
    saveOverride(ch.paragraphs);
    _rebuildSourceIndexes?.(book);
    _clearBookCache?.();
    return ch.paragraphs;
  }

  function removeVerseAt(book, index) {
    const paragraphs = getParagraphs(book);
    if (index < 0 || index >= paragraphs.length) {
      throw new Error("Verse index out of range.");
    }
    paragraphs.splice(index, 1);
    if (!paragraphs.length) throw new Error("Cannot delete the last verse.");
    commitParagraphs(book, paragraphs);
    return Math.min(index, paragraphs.length - 1);
  }

  function mergeVerseInto(book, removeIndex, keepVerseNum, { mergeSources: doMerge = true } = {}) {
    const paragraphs = getParagraphs(book);
    const keepIndex = Number(keepVerseNum) - 1;
    if (!Number.isFinite(keepIndex) || keepIndex < 0 || keepIndex >= paragraphs.length) {
      throw new Error(`Keep verse must be between 1 and ${paragraphs.length}.`);
    }
    if (removeIndex < 0 || removeIndex >= paragraphs.length) {
      throw new Error("Verse index out of range.");
    }
    if (keepIndex === removeIndex) {
      throw new Error("Choose a different verse to keep.");
    }
    const keep = { ...paragraphs[keepIndex] };
    const remove = paragraphs[removeIndex];
    mergeSources(keep, [remove], doMerge);
    paragraphs.splice(removeIndex, 1);
    const newKeepIndex = removeIndex < keepIndex ? keepIndex - 1 : keepIndex;
    paragraphs[newKeepIndex] = keep;
    commitParagraphs(book, paragraphs);
    return newKeepIndex;
  }

  function updateVerseText(book, index, fields) {
    const paragraphs = getParagraphs(book);
    if (index < 0 || index >= paragraphs.length) throw new Error("Verse index out of range.");
    const p = { ...paragraphs[index] };
    const textFields = [
      "sanskritRoman", "devanagari", "bangla", "oriya", "punjabi", "kannada", "telugu",
      "wordMeaning", "verseMeaning", "hindiMeaning", "englishMeaning",
    ];
    textFields.forEach(key => {
      if (fields[key] != null) p[key] = String(fields[key]).trim();
    });
    syncParaMeta(p);
    paragraphs[index] = p;
    commitParagraphs(book, paragraphs);
    return { index, para: paragraphs[index], savedAt: loadOverride()?.updatedAt };
  }

  function readCorrectionFieldsFromForm() {
    return {
      sanskritRoman: document.getElementById("shlokaEditorRoman")?.value,
      devanagari: document.getElementById("shlokaEditorDev")?.value,
      telugu: document.getElementById("shlokaEditorTelugu")?.value,
      englishMeaning: document.getElementById("shlokaEditorEnglish")?.value,
      hindiMeaning: document.getElementById("shlokaEditorHindi")?.value,
      wordMeaning: document.getElementById("shlokaEditorWord")?.value,
    };
  }

  function isLiveSaveEnabled() {
    try {
      const v = localStorage.getItem(LIVE_SAVE_STORAGE_KEY);
      if (v === "0") return false;
      if (v === "1") return true;
    } catch (_) { /* ignore */ }
    return true;
  }

  function setLiveSaveEnabled(on) {
    try {
      localStorage.setItem(LIVE_SAVE_STORAGE_KEY, on ? "1" : "0");
    } catch (_) { /* ignore */ }
  }

  function formatSavedAt(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString();
    } catch (_) {
      return iso;
    }
  }

  function hasOverride() {
    return !!loadOverride();
  }

  function exportBookJson(book) {
    const copy = JSON.parse(JSON.stringify(book));
    applyOverride(copy);
    const blob = new Blob([JSON.stringify(copy)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "samskrta-shloka.json";
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function buildSourceIndex(book) {
    const index = {};
    const ch = versesChapter(book);
    (ch?.paragraphs || []).forEach(p => {
      const label = String(p.sanskritRoman || "").split("\n")[0].slice(0, 72);
      (p.sources || []).forEach(s => {
        if (!s.bookId || !s.chapterId || !s.paraId) return;
        index[`${s.bookId}|${s.chapterId}|${s.paraId}`] = { paraId: p.id, label };
      });
    });
    return index;
  }

  function exportSourceIndexJson(book) {
    const copy = JSON.parse(JSON.stringify(book));
    applyOverride(copy);
    const index = buildSourceIndex(copy);
    const blob = new Blob([JSON.stringify(index)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "shloka-source-index.json";
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function isPanelOpen() {
    try {
      return localStorage.getItem(OPEN_STORAGE_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function setPanelOpen(open) {
    try {
      localStorage.setItem(OPEN_STORAGE_KEY, open ? "1" : "0");
    } catch (_) {}
  }

  function renderPanelHtml(idx, total, para, scriptMode = "all") {
    if (!ENABLED) return "";
    const roman = String(para?.sanskritRoman || "");
    const dev = String(para?.devanagari || "");
    const telugu = String(para?.telugu || "");
    const english = String(para?.englishMeaning || para?.verseMeaning || "");
    const hindi = String(para?.hindiMeaning || "");
    const word = String(para?.wordMeaning || "");
    const ov = loadOverride();
    const sourceCount = (para?.sources || []).length;
    const sourcePreview = (para?.sources || []).slice(0, 3).map(s =>
      [s.bookTitle, s.chapterTitle].filter(Boolean).join(" · ")
    ).join("; ");
    const moreSources = sourceCount > 3 ? ` (+${sourceCount - 3} more)` : "";
    const openAttr = isPanelOpen() ? " open" : "";
    const liveSaveOn = isLiveSaveEnabled();
    const showTelugu = ["all", "scripts", "indic-all", "telugu", "roman-telugu"].includes(scriptMode);
    const savedLabel = ov?.updatedAt ? `Last saved ${formatSavedAt(ov.updatedAt)}` : "Not saved yet";
    return `<details class="modern-card shloka-book-editor-panel" id="shlokaBookEditorPanel"${openAttr}>
      <summary class="shloka-book-editor-summary">
        <span class="shloka-book-editor-summary-title">Draft edits on this device <span class="shloka-editor-badge">browser only</span></span>
        <span class="shloka-book-editor-summary-meta muted">Verse ${idx + 1}${ov ? " · using browser draft" : " · showing bundled book"}</span>
      </summary>
      <div class="shloka-book-editor-body">
      <p class="muted">Edits here stay in this browser only and can hide the live library text. Clear the draft to restore the bundled book, or export JSON when you are ready to commit changes into the app build.</p>
      <p class="shloka-editor-override-note" id="shlokaEditorSavedAt">${ov ? `Browser draft active · ${total} verses · ${savedLabel} · not the live library file` : `Showing live library text · ${savedLabel}`}</p>

      <section class="shloka-editor-corrections">
        <h4 class="shloka-editor-section-title">Edit this verse</h4>
        <label class="muted">Roman
          <textarea id="shlokaEditorRoman" rows="3" spellcheck="false">${escapeAttr(roman)}</textarea>
        </label>
        <label class="muted">Devanagari
          <textarea id="shlokaEditorDev" rows="3" spellcheck="false">${escapeAttr(dev)}</textarea>
        </label>
        ${showTelugu ? `<label class="muted">Telugu
          <textarea id="shlokaEditorTelugu" rows="3" spellcheck="false">${escapeAttr(telugu)}</textarea>
        </label>` : ""}
        <label class="muted">English meaning
          <textarea id="shlokaEditorEnglish" rows="3" spellcheck="false">${escapeAttr(english)}</textarea>
        </label>
        <label class="muted">Hindi meaning
          <textarea id="shlokaEditorHindi" rows="2" spellcheck="false">${escapeAttr(hindi)}</textarea>
        </label>
        <label class="muted">Word meaning
          <textarea id="shlokaEditorWord" rows="2" spellcheck="false">${escapeAttr(word)}</textarea>
        </label>
        <div class="shloka-editor-save-row">
          <label class="muted shloka-editor-check">
            <input type="checkbox" id="shlokaEditorLiveSave" ${liveSaveOn ? "checked" : ""} />
            Auto-save while typing
          </label>
          <button type="button" class="btn btn-gold btn-sm" id="btnShlokaEditorSaveText">Save live</button>
        </div>
      </section>

      <details class="shloka-editor-tools">
        <summary>Duplicate tools (delete / merge)</summary>
      <p class="muted shloka-editor-source-summary">Verse ${idx + 1} has <strong>${sourceCount}</strong> source reference${sourceCount === 1 ? "" : "s"}${sourceCount ? `: ${sourcePreview}${moreSources}` : ""}.</p>
      <div class="shloka-editor-actions quick-grid">
        <button type="button" class="btn btn-ghost btn-sm danger" id="btnShlokaEditorDelete">Delete verse ${idx + 1} only</button>
      </div>
      <p class="muted shloka-editor-delete-hint">Delete alone drops this verse&apos;s references unless you merge them first (below).</p>
      <div class="shloka-editor-merge-row">
        <label class="muted">Keep verse
          <input type="text" inputmode="numeric" pattern="[0-9]*" id="shlokaEditorKeepVerse" class="shloka-rec-num-input" placeholder="e.g. 9" value="" />
        </label>
        <label class="muted shloka-editor-check">
          <input type="checkbox" id="shlokaEditorMergeSources" checked />
          Merge references into kept verse
        </label>
        <button type="button" class="btn btn-gold btn-sm" id="btnShlokaEditorMerge">Keep that · remove ${idx + 1}</button>
      </div>
      </details>

      <details class="shloka-editor-export-tools">
        <summary>Export / reset</summary>
      <div class="shloka-editor-actions quick-grid">
        <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaEditorExport">Download book JSON</button>
        <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaEditorExportIndex">Download source index</button>
        <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaEditorReset">Clear browser draft</button>
      </div>
      </details>
      <p class="muted" id="shlokaEditorStatus"></p>
      </div>
    </details>`;
  }

  function escapeAttr(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function parseVerseNum(value, max) {
    const digits = String(value || "").replace(/[^\d]/g, "");
    const n = digits ? Number(digits) : NaN;
    if (!Number.isFinite(n) || n < 1 || n > max) return NaN;
    return n;
  }

  function bindPanel({ book, idx, verses, reload, esc, preferHuman = true, patchCard }) {
    if (!ENABLED) return;
    const panel = document.getElementById("shlokaBookEditorPanel");
    panel?.addEventListener("toggle", () => {
      setPanelOpen(!!panel.open);
    });
    const status = (msg) => {
      const el = document.getElementById("shlokaEditorStatus");
      if (el) el.textContent = msg || "";
    };
    const refreshSavedLabel = () => {
      const el = document.getElementById("shlokaEditorSavedAt");
      if (!el) return;
      const ov = loadOverride();
      const total = getParagraphs(book).length;
      const savedLabel = ov?.updatedAt ? `Last saved ${formatSavedAt(ov.updatedAt)}` : "Not saved yet";
      el.textContent = ov
        ? `Browser draft active · ${total} verses · ${savedLabel} · not the live library file`
        : `Showing live library text · ${savedLabel}`;
    };
    const refreshVerseView = (newIdx) => {
      const nextIdx = Number.isFinite(newIdx) ? newIdx : idx;
      const para = getParagraphs(book)[nextIdx];
      if (typeof patchCard === "function" && patchCard(para, nextIdx + 1)) {
        refreshSavedLabel();
        return;
      }
      reload(nextIdx);
    };
    const saveLiveCorrections = (opts = {}) => {
      const { quiet = false } = opts;
      try {
        const fields = readCorrectionFieldsFromForm();
        if (fields.englishMeaning != null) fields.verseMeaning = fields.englishMeaning;
        const result = updateVerseText(book, idx, fields);
        verses[idx] = result.para;
        refreshSavedLabel();
        if (!quiet) status(`Saved live · verse ${idx + 1} · ${formatSavedAt(result.savedAt)}`);
        if (!opts.skipRefresh) refreshVerseView(idx);
        return true;
      } catch (err) {
        status(err?.message || "Save failed.");
        return false;
      }
    };

    let autoSaveTimer = null;
    const queueAutoSave = () => {
      if (!isLiveSaveEnabled()) return;
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => saveLiveCorrections({ quiet: true }), 1200);
    };

    document.getElementById("shlokaEditorLiveSave")?.addEventListener("change", e => {
      setLiveSaveEnabled(!!e.target.checked);
      status(e.target.checked ? "Auto-save on — edits save as you type." : "Auto-save off — use Save live or ⌘S.");
    });

    ["shlokaEditorRoman", "shlokaEditorDev", "shlokaEditorTelugu", "shlokaEditorEnglish", "shlokaEditorHindi", "shlokaEditorWord"].forEach(id => {
      document.getElementById(id)?.addEventListener("input", queueAutoSave);
    });

    const onSaveKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveLiveCorrections();
      }
    };
    panel?.addEventListener("keydown", onSaveKey);

    document.getElementById("btnShlokaEditorSaveText")?.addEventListener("click", () => {
      saveLiveCorrections();
    });

    document.getElementById("btnShlokaEditorDelete")?.addEventListener("click", () => {
      const n = idx + 1;
      const preview = String(verses[idx]?.sanskritRoman || "").split("\n")[0].slice(0, 72);
      const srcN = (verses[idx]?.sources || []).length;
      const dropWarn = srcN
        ? `\n\nThis verse has ${srcN} source reference${srcN === 1 ? "" : "s"} that will be lost. Use “Keep that · remove this” instead if you want them merged.`
        : "";
      if (!confirm(`Delete verse ${n} from the book?\n\n${preview}${dropWarn}`)) return;
      try {
        const nextIdx = removeVerseAt(book, idx);
        status(`Deleted verse ${n}. Book now has ${getParagraphs(book).length} verses.`);
        reload(nextIdx);
      } catch (err) {
        status(err?.message || "Delete failed.");
      }
    });

    document.getElementById("btnShlokaEditorMerge")?.addEventListener("click", () => {
      const keepVerse = parseVerseNum(document.getElementById("shlokaEditorKeepVerse")?.value, verses.length);
      if (!Number.isFinite(keepVerse)) {
        status(`Enter a keep verse number from 1 to ${verses.length}.`);
        return;
      }
      const mergeSourcesFlag = !!document.getElementById("shlokaEditorMergeSources")?.checked;
      const removeN = idx + 1;
      const removeSrc = (verses[idx]?.sources || []).length;
      const keepSrc = (verses[keepVerse - 1]?.sources || []).length;
      const refNote = mergeSourcesFlag && removeSrc
        ? `\n\n${removeSrc} reference${removeSrc === 1 ? "" : "s"} from verse ${removeN} will be added to verse ${keepVerse} (${keepSrc} → about ${keepSrc + removeSrc}).`
        : mergeSourcesFlag ? "" : "\n\nReferences will not be merged.";
      if (!confirm(
        `Keep verse ${keepVerse}, remove verse ${removeN}?${refNote}`
      )) return;
      try {
        const nextIdx = mergeVerseInto(book, idx, keepVerse, { mergeSources: mergeSourcesFlag });
        const kept = getParagraphs(book)[nextIdx];
        status(`Kept verse ${keepVerse}, removed verse ${removeN}. Kept verse now has ${(kept?.sources || []).length} source references.`);
        reload(nextIdx);
      } catch (err) {
        status(err?.message || "Merge failed.");
      }
    });

    document.getElementById("btnShlokaEditorExport")?.addEventListener("click", () => {
      try {
        exportBookJson(book);
        status("Downloaded samskrta-shloka.json → amps-reader/data/books/");
      } catch (err) {
        status(err?.message || "Export failed.");
      }
    });

    document.getElementById("btnShlokaEditorExportIndex")?.addEventListener("click", () => {
      try {
        exportSourceIndexJson(book);
        status("Downloaded shloka-source-index.json → amps-reader/data/");
      } catch (err) {
        status(err?.message || "Export failed.");
      }
    });

    document.getElementById("btnShlokaEditorReset")?.addEventListener("click", () => {
      if (!confirm("Clear this browser’s draft edits and reload the live library text?")) return;
      clearOverride();
      status("Browser draft cleared. Showing the live library text again.");
      reload(idx);
    });
  }

  function renderReaderBarHtml() {
    if (!ENABLED) return "";
    const ov = loadOverride();
    return `<div class="shloka-reader-live-bar" id="shlokaReaderLiveBar">
      <p class="muted shloka-reader-live-note">${ov ? "A browser draft is active on this device and may differ from the live library." : "Optional: draft a fix in this browser without leaving the reader."}</p>
      <button type="button" class="btn btn-gold btn-sm" id="btnShlokaReaderCorrect">Edit this verse</button>
      <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaReaderStudio">Open in Studio</button>
    </div>
    <div class="shloka-reader-live-panel modern-card" id="shlokaReaderLivePanel" hidden>
      <div class="shloka-reader-live-head">
        <h4 id="shlokaReaderLiveTitle">Correct verse</h4>
        <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaReaderLiveClose" aria-label="Close">✕</button>
      </div>
      <p class="muted" id="shlokaReaderLiveSaved"></p>
      <label class="muted">Roman
        <textarea id="shlokaReaderRoman" rows="3" spellcheck="false"></textarea>
      </label>
      <label class="muted">Devanagari
        <textarea id="shlokaReaderDev" rows="3" spellcheck="false"></textarea>
      </label>
      <label class="muted">English meaning
        <textarea id="shlokaReaderEnglish" rows="3" spellcheck="false"></textarea>
      </label>
      <label class="muted">Hindi meaning
        <textarea id="shlokaReaderHindi" rows="2" spellcheck="false"></textarea>
      </label>
      <label class="muted">Word meaning
        <textarea id="shlokaReaderWord" rows="2" spellcheck="false"></textarea>
      </label>
      <div class="shloka-editor-save-row">
        <button type="button" class="btn btn-gold btn-sm" id="btnShlokaReaderSave">Save live</button>
      </div>
      <p class="muted" id="shlokaReaderLiveStatus"></p>
    </div>`;
  }

  function verseIndexFromParaId(paraId) {
    const m = String(paraId || "").match(/ch-verses-p(\d+)$/);
    return m ? Number(m[1]) - 1 : -1;
  }

  function bindReaderCorrections({ book, getActiveParaId, patchReaderCard, navigateToStudio, onParaSelect }) {
    if (!ENABLED || !book || book.id !== BOOK_ID) return;
    const panel = document.getElementById("shlokaReaderLivePanel");
    const status = msg => {
      const el = document.getElementById("shlokaReaderLiveStatus");
      if (el) el.textContent = msg || "";
    };
    const refreshSaved = () => {
      const el = document.getElementById("shlokaReaderLiveSaved");
      const ov = loadOverride();
      if (el) el.textContent = ov?.updatedAt ? `Last saved ${formatSavedAt(ov.updatedAt)}` : "";
    };
    let activeIdx = -1;

    const loadForm = idx => {
      const para = getParagraphs(book)[idx];
      if (!para) return;
      activeIdx = idx;
      document.getElementById("shlokaReaderLiveTitle").textContent = `Correct verse ${idx + 1}`;
      document.getElementById("shlokaReaderRoman").value = para.sanskritRoman || "";
      document.getElementById("shlokaReaderDev").value = para.devanagari || "";
      document.getElementById("shlokaReaderEnglish").value = para.englishMeaning || para.verseMeaning || "";
      document.getElementById("shlokaReaderHindi").value = para.hindiMeaning || "";
      document.getElementById("shlokaReaderWord").value = para.wordMeaning || "";
      refreshSaved();
      panel.hidden = false;
      panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
      status("");
    };

    const openForParaId = paraId => {
      const idx = verseIndexFromParaId(paraId);
      if (idx < 0) {
        status("Select a verse first (tap a verse card).");
        return;
      }
      loadForm(idx);
    };

    document.getElementById("btnShlokaReaderCorrect")?.addEventListener("click", () => {
      openForParaId(getActiveParaId?.());
    });
    document.getElementById("btnShlokaReaderStudio")?.addEventListener("click", () => {
      const idx = activeIdx >= 0 ? activeIdx : verseIndexFromParaId(getActiveParaId?.());
      navigateToStudio?.(idx >= 0 ? idx : 0);
    });
    document.getElementById("btnShlokaReaderLiveClose")?.addEventListener("click", () => {
      panel.hidden = true;
      status("");
    });
    document.getElementById("btnShlokaReaderSave")?.addEventListener("click", () => {
      if (activeIdx < 0) return;
      try {
        const fields = {
          sanskritRoman: document.getElementById("shlokaReaderRoman")?.value,
          devanagari: document.getElementById("shlokaReaderDev")?.value,
          englishMeaning: document.getElementById("shlokaReaderEnglish")?.value,
          hindiMeaning: document.getElementById("shlokaReaderHindi")?.value,
          wordMeaning: document.getElementById("shlokaReaderWord")?.value,
        };
        fields.verseMeaning = fields.englishMeaning;
        const result = updateVerseText(book, activeIdx, fields);
        refreshSaved();
        status(`Saved live · verse ${activeIdx + 1}`);
        patchReaderCard?.(result.para, activeIdx + 1);
      } catch (err) {
        status(err?.message || "Save failed.");
      }
    });

    document.getElementById("readerArticle")?.addEventListener("click", e => {
      const card = e.target.closest?.(".shloka-verse-card[data-verse]");
      if (!card || e.target.closest("button,a,input,textarea,select,details,summary")) return;
      onParaSelect?.(card.id);
    });

    return { openForParaId, loadForm };
  }

  function install(opts) {
    _clearBookCache = typeof opts?.clearBookCache === "function" ? opts.clearBookCache : null;
    _rebuildSourceIndexes = typeof opts?.rebuildSourceIndexes === "function" ? opts.rebuildSourceIndexes : null;
  }

  const api = {
    ENABLED,
    isEnabled,
    install,
    applyOverride,
    loadOverride,
    saveOverride,
    clearOverride,
    hasOverride,
    removeVerseAt,
    mergeVerseInto,
    updateVerseText,
    exportBookJson,
    exportSourceIndexJson,
    buildSourceIndex,
    renderPanelHtml,
    renderReaderBarHtml,
    bindPanel,
    bindReaderCorrections,
    verseIndexFromParaId,
    BOOK_ID,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AmpsShlokaBookEditor = api;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);

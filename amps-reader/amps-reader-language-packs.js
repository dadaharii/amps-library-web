/**
 * AMPS Reader — preferred language + approved language-pack delivery.
 * Official packs never call providers. Instant MT is opt-in and stubbable.
 *
 * Works in fixture harness and real Reader when included.
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "amps-reader-language-prefs-v1";
  var MACHINE_CACHE_KEY = "amps-reader-machine-cache-v1";
  var MACHINE_SCHEMA = "amps-reader-machine-cache/1";

  var DISPLAY_MODES = {
    translation_only: "translation_only",
    english_only: "english_only",
    side_by_side: "side_by_side",
    translation_below: "translation_below",
  };

  var STATUS_LABELS = {
    official: "Official translation",
    human_reviewed: "Human reviewed",
    machine: "Machine translation — not human reviewed",
    original: "Original English",
    partial: "Partial translation",
    offline_unavailable: "Translation unavailable offline",
    source_changed: "Source changed — review pending",
  };

  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function savePrefs(prefs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }

  function instantEnabled() {
    if (typeof process !== "undefined" && process.env && process.env.READER_INSTANT_TRANSLATION_ENABLED === "true") {
      return true;
    }
    return global.READER_INSTANT_TRANSLATION_ENABLED === true;
  }

  function loadMachineCache() {
    try {
      return JSON.parse(localStorage.getItem(MACHINE_CACHE_KEY) || "{}") || {};
    } catch (e) {
      return { schemaVersion: MACHINE_SCHEMA, entries: {} };
    }
  }

  function saveMachineCache(cache) {
    localStorage.setItem(MACHINE_CACHE_KEY, JSON.stringify(cache));
  }

  function machineCacheKey(parts) {
    return [parts.bookId, parts.stableSegmentId, parts.sourceHash, parts.targetLanguage, parts.providerFamily || "stub", parts.model || "local-stub", MACHINE_SCHEMA].join("|");
  }

  function sourceHashForText(text) {
    var str = String(text == null ? "" : text);
    var h1 = 0xdeadbeef ^ str.length;
    var h2 = 0x41c6ce57 ^ str.length;
    for (var i = 0; i < str.length; i += 1) {
      var ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    var hex = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
    return "cyrb53:" + hex.padStart(14, "0");
  }

  function clearMachineTranslations() {
    saveMachineCache({ schemaVersion: MACHINE_SCHEMA, entries: {} });
  }

  async function fetchJson(url) {
    var res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("fetch failed " + res.status);
    return res.json();
  }

  async function loadRegistry(base) {
    return fetchJson((base || "") + "data/language-registry.json");
  }

  async function loadPack(base, bookId, language, relativePath) {
    var url = relativePath
      ? (base || "") + relativePath
      : (base || "") + "data/language-packs/" + bookId + "/" + language + "/latest.json";
    return fetchJson(url);
  }

  function verifyPackChecksum(pack) {
    // Browser cannot easily replicate stable stringify; trust install-time verify.
    // Drift detection uses source hashes per segment.
    return Boolean(pack && pack.checksum && pack.segments);
  }

  function segmentTranslation(pack, stableSegmentId, sourceHash) {
    if (
      pack
      && Array.isArray(pack.suppressedSegmentIds)
      && pack.suppressedSegmentIds.includes(stableSegmentId)
    ) {
      return { status: "suppressed" };
    }
    if (!pack || !pack.segments) return { status: "missing" };
    var seg = pack.segments[stableSegmentId];
    if (!seg) return { status: "missing" };
    if (sourceHash && seg.sourceHash && seg.sourceHash !== sourceHash) {
      return { status: "source_changed", label: STATUS_LABELS.source_changed };
    }
    if (pack.status === "official_approved") {
      return { status: "official", text: seg.translation, blocks: seg.blocks || null, label: STATUS_LABELS.official };
    }
    if (pack.status === "human_reviewed_preview") {
      return { status: "human_reviewed", text: seg.translation, blocks: seg.blocks || null, label: STATUS_LABELS.human_reviewed };
    }
    if (pack.status === "machine_unreviewed") {
      return { status: "machine", text: seg.translation, blocks: seg.blocks || null, label: STATUS_LABELS.machine };
    }
    return { status: "original", text: null, label: STATUS_LABELS.original };
  }

  /**
   * Local deterministic stub — never contacts OpenAI/Google.
   */
  async function instantTranslateStub({ text, targetLanguage }) {
    if (!instantEnabled()) {
      throw new Error("Instant translation disabled");
    }
    return {
      translation: "[" + targetLanguage + "] " + String(text || ""),
      status: "machine_unreviewed",
      providerFamily: "stub",
      model: "local-stub",
    };
  }

  function renderSegment(el, english, translated, mode, meta) {
    el.setAttribute("data-stable-segment-id", meta.stableSegmentId || "");
    el.setAttribute("lang", meta.lang || (mode === DISPLAY_MODES.english_only ? "en" : meta.targetLang || "en"));
    if (meta.dir) el.setAttribute("dir", meta.dir);
    el.classList.remove("mode-translation-only", "mode-english-only", "mode-side-by-side", "mode-below");

    var status = document.createElement("span");
    status.className = "translation-status-label";
    status.textContent = meta.label || STATUS_LABELS.original;

    if (mode === DISPLAY_MODES.english_only || !translated) {
      el.classList.add("mode-english-only");
      el.innerHTML = "";
      var en = document.createElement("p");
      en.className = "source-english";
      en.lang = "en";
      en.textContent = english;
      el.appendChild(en);
      el.appendChild(status);
      return;
    }
    if (mode === DISPLAY_MODES.translation_only) {
      el.classList.add("mode-translation-only");
      el.innerHTML = "";
      var tr = document.createElement("p");
      tr.className = "translation-text";
      tr.setAttribute("aria-label", meta.label || "translation");
      if (meta.dir) tr.dir = meta.dir;
      tr.lang = meta.targetLang || "";
      tr.textContent = translated;
      el.appendChild(tr);
      el.appendChild(status);
      // Do not duplicate English for screen readers
      return;
    }
    if (mode === DISPLAY_MODES.side_by_side) {
      el.classList.add("mode-side-by-side");
      el.innerHTML = "";
      var wrap = document.createElement("div");
      wrap.className = "bilingual-row";
      var left = document.createElement("p");
      left.className = "source-english";
      left.lang = "en";
      left.textContent = english;
      var right = document.createElement("p");
      right.className = "translation-text";
      right.lang = meta.targetLang || "";
      if (meta.dir) right.dir = meta.dir;
      right.textContent = translated;
      wrap.appendChild(left);
      wrap.appendChild(right);
      el.appendChild(wrap);
      el.appendChild(status);
      return;
    }
    // translation_below
    el.classList.add("mode-below");
    el.innerHTML = "";
    var en2 = document.createElement("p");
    en2.className = "source-english";
    en2.lang = "en";
    en2.textContent = english;
    var tr2 = document.createElement("p");
    tr2.className = "translation-text";
    tr2.lang = meta.targetLang || "";
    if (meta.dir) tr2.dir = meta.dir;
    tr2.textContent = translated;
    el.appendChild(en2);
    el.appendChild(tr2);
    el.appendChild(status);
  }

  function mountLanguageControls(options) {
    var opts = options || {};
    var select = opts.langSelect || document.getElementById("lang-select");
    var modeSelect = opts.displayMode || document.getElementById("display-mode");
    var statusEl = opts.statusEl || document.getElementById("translation-status");
    var instantBtn = opts.instantBtn || document.getElementById("instant-translate-btn");
    var prefs = loadPrefs();
    var state = {
      language: prefs.language || opts.initialLanguage || "en",
      displayMode: prefs.displayMode || (prefs.language && prefs.language !== "en" ? DISPLAY_MODES.translation_only : DISPLAY_MODES.english_only),
      pack: null,
      registry: null,
      bookId: opts.bookId,
      segments: opts.segments || [],
      base: opts.base || "",
    };

    function announce(msg) {
      if (statusEl) statusEl.textContent = msg;
    }

    async function refresh() {
      savePrefs({ language: state.language, displayMode: state.displayMode });
      if (state.language === "en") {
        if (!state.displayMode || state.displayMode === DISPLAY_MODES.translation_only) {
          state.displayMode = DISPLAY_MODES.english_only;
          if (modeSelect) modeSelect.value = state.displayMode;
        }
        state.pack = null;
        announce(STATUS_LABELS.original);
        renderAll();
        return;
      }
      try {
        var reg = state.registry || (await loadRegistry(state.base));
        state.registry = reg;
        var bookPacks = (reg.books && reg.books[state.bookId] && reg.books[state.bookId].packs) || {};
        var entry = bookPacks[state.language];
        if (!entry) {
          state.pack = null;
          announce("Official translation unavailable. Showing original English.");
          renderAll();
          return;
        }
        if (!state.displayMode || state.displayMode === DISPLAY_MODES.english_only) {
          state.displayMode = DISPLAY_MODES.translation_only;
          if (modeSelect) modeSelect.value = state.displayMode;
        }
        state.pack = await loadPack(state.base, state.bookId, state.language, entry.relativePath);
        if (!verifyPackChecksum(state.pack)) {
          state.pack = null;
          announce(STATUS_LABELS.source_changed);
          renderAll();
          return;
        }
        if (state.pack.partial) announce(STATUS_LABELS.partial);
        else if (state.pack.status === "official_approved") announce(STATUS_LABELS.official);
        else announce(STATUS_LABELS.human_reviewed);
        renderAll();
      } catch (e) {
        state.pack = null;
        announce(STATUS_LABELS.original);
        renderAll();
      }
    }

    function renderAll() {
      var container = opts.contentEl || document.getElementById("book-content");
      if (!container) return;
      state.segments.forEach(function (seg) {
        var node = container.querySelector('[data-stable-segment-id="' + seg.stableSegmentId + '"]');
        if (!node) {
          node = document.createElement("div");
          node.setAttribute("data-stable-segment-id", seg.stableSegmentId);
          container.appendChild(node);
        }
        var result = segmentTranslation(state.pack, seg.stableSegmentId, seg.sourceHash);
        if (result.status === "suppressed") {
          node.hidden = true;
          node.innerHTML = "";
          return;
        }
        node.hidden = false;
        var text = result.text;
        var label = result.label || STATUS_LABELS.original;
        if (result.status === "missing" || result.status === "source_changed") {
          text = null;
          label = result.status === "source_changed" ? STATUS_LABELS.source_changed : STATUS_LABELS.original;
        }
        renderSegment(node, seg.sourceText, text, state.displayMode, {
          stableSegmentId: seg.stableSegmentId,
          label: label,
          targetLang: state.language,
          dir: seg.dir || (state.language === "ar" || state.language === "ur" ? "rtl" : null),
          lang: state.language,
        });
      });
    }

    if (select) {
      select.innerHTML = "";
      var langs = [{ code: "en", name: "Original English", group: "original" }];
      if (state.registry && Array.isArray(state.registry.languages)) {
        state.registry.languages.forEach(function (l) {
          if (l.code !== "en") langs.push({ code: l.code, name: l.nativeName || l.name || l.code, group: "official" });
        });
      } else {
        langs.push(
          { code: "hi", name: "हिन्दी", group: "official" },
          { code: "bn", name: "বাংলা", group: "official" },
          { code: "ar", name: "العربية", group: "official" },
          { code: "ur", name: "اردو", group: "official" }
        );
      }
      var og = document.createElement("optgroup");
      og.label = "Original English";
      var o = document.createElement("option");
      o.value = "en";
      o.textContent = "English";
      og.appendChild(o);
      select.appendChild(og);
      var off = document.createElement("optgroup");
      off.label = "Official translations";
      langs.filter(function (l) { return l.code !== "en"; }).forEach(function (l) {
        var opt = document.createElement("option");
        opt.value = l.code;
        opt.textContent = l.name;
        off.appendChild(opt);
      });
      select.appendChild(off);
      var prev = document.createElement("optgroup");
      prev.label = "Human-reviewed previews";
      select.appendChild(prev);
      var mach = document.createElement("optgroup");
      mach.label = "Instant machine translation";
      var mopt = document.createElement("option");
      mopt.value = "__machine__";
      mopt.textContent = "Machine (opt-in)";
      mopt.disabled = !instantEnabled();
      mach.appendChild(mopt);
      select.appendChild(mach);
      select.value = state.language;
      select.addEventListener("change", function () {
        state.language = select.value === "__machine__" ? state.language : select.value;
        refresh();
      });
    }
    if (modeSelect) {
      modeSelect.value = state.displayMode;
      modeSelect.addEventListener("change", function () {
        state.displayMode = modeSelect.value;
        savePrefs({ language: state.language, displayMode: state.displayMode });
        renderAll();
      });
    }
    if (instantBtn) {
      instantBtn.hidden = !instantEnabled();
      instantBtn.addEventListener("click", async function () {
        if (!instantEnabled() || !navigator.onLine) return;
        var seg = state.segments[0];
        if (!seg) return;
        var out = await instantTranslateStub({ text: seg.sourceText, targetLanguage: state.language });
        var cache = loadMachineCache();
        if (!cache.entries) cache.entries = {};
        var key = machineCacheKey({
          bookId: state.bookId,
          stableSegmentId: seg.stableSegmentId,
          sourceHash: seg.sourceHash,
          targetLanguage: state.language,
        });
        cache.entries[key] = {
          status: "machine_unreviewed",
          generatedAt: new Date().toISOString(),
          sourceHash: seg.sourceHash,
          targetLanguage: state.language,
          translation: out.translation,
        };
        saveMachineCache(cache);
        announce(STATUS_LABELS.machine);
      });
    }

    refresh();
    return {
      getState: function () { return state; },
      refresh: refresh,
      clearMachineTranslations: clearMachineTranslations,
      STATUS_LABELS: STATUS_LABELS,
      DISPLAY_MODES: DISPLAY_MODES,
    };
  }

  global.AmpsReaderLanguagePacks = {
    mountLanguageControls: mountLanguageControls,
    loadRegistry: loadRegistry,
    loadPack: loadPack,
    segmentTranslation: segmentTranslation,
    sourceHashForText: sourceHashForText,
    instantTranslateStub: instantTranslateStub,
    clearMachineTranslations: clearMachineTranslations,
    instantEnabled: instantEnabled,
    STATUS_LABELS: STATUS_LABELS,
    DISPLAY_MODES: DISPLAY_MODES,
    machineCacheKey: machineCacheKey,
  };
})(typeof window !== "undefined" ? window : globalThis);

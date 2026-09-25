/**
 * Bidirectional deep navigation: Samskrta Shloka ↔ AMPS source articles.
 * Stable occurrence IDs, focus/highlight, session return state.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AmpsShlokaDeepNav = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SESSION_KEY = "amps-shloka-deep-nav-v1";
  const OCC_PREFIX = "source-occurrence-";
  const HIGHLIGHT_MS = 5000;
  const SELECTED_CLASS = "source-occurrence-selected";
  const FLASH_CLASS = "source-occurrence-flash";

  function occurrenceId(shlokaId, chapterId, paraId) {
    const s = String(shlokaId || "").trim();
    const p = String(paraId || "").trim();
    // Spec example: source-occurrence-ch-verses-p3-ch4-p5
    // Paragraph ids already embed chapter (ch4-p5), so do not insert chapterId again.
    if (!s || !p) return "";
    return `${OCC_PREFIX}${s}-${p}`;
  }

  function parseOccurrenceId(raw) {
    const id = String(raw || "").trim();
    if (!id.startsWith(OCC_PREFIX)) return null;
    const body = id.slice(OCC_PREFIX.length);
    // source-occurrence-ch-verses-p3-ch4-p5
    const m = body.match(/^(ch-verses-p\d+)-(ch[\w-]*-p[\w-]+)$/i);
    if (!m) return null;
    const paraId = m[2];
    const chapterGuess = paraId.includes("-p") ? paraId.replace(/-p[\w-]+$/i, "") : "";
    return {
      occurrence_id: id,
      shloka_id: m[1],
      source_chapter_id: chapterGuess,
      source_paragraph_id: paraId,
    };
  }

  function buildOccurrenceRecord(opts) {
    const shlokaId = opts.shloka_id || opts.stableShlokaId || "";
    const bookId = opts.source_book_id || opts.bookId || "";
    const chapterId = opts.source_chapter_id || opts.chapterId || "";
    const paraId = opts.source_paragraph_id || opts.paraId || "";
    const endPara = opts.quotation_end_paragraph || opts.endParaId || paraId;
    const occ = occurrenceId(shlokaId, chapterId, paraId);
    return {
      stable_shloka_id: shlokaId,
      source_book_id: bookId,
      source_chapter_id: chapterId,
      source_paragraph_id: paraId,
      occurrence_id: occ,
      quotation_start_paragraph: paraId,
      quotation_end_paragraph: endPara,
      source_title: opts.source_title || opts.bookTitle || "",
      chapter_title: opts.chapter_title || opts.chapterTitle || "",
      exact_source_reference: opts.exact_source_reference || `${bookId}/${chapterId}/${paraId}`,
      quotation_type: opts.quotation_type || "amps_discourse_quotation",
      canonical_route: opts.canonical_route || "",
      match_method: opts.match_method || "explicit_source_mapping",
      match_confidence: opts.match_confidence != null ? opts.match_confidence : 1,
      verified_by: opts.verified_by || "",
      verified_at: opts.verified_at || "",
    };
  }

  function readerHash(bookId, chapterId, paraId, occurrence) {
    let hash = `#read/${encodeURIComponent(bookId)}/${encodeURIComponent(chapterId)}`;
    if (paraId) hash += `/${encodeURIComponent(paraId)}`;
    const q = [];
    if (occurrence) q.push(`occurrence=${encodeURIComponent(occurrence)}`);
    if (q.length) hash += `?${q.join("&")}`;
    return hash;
  }

  function shlokaHash(shlokaId, from) {
    let hash = `#read/samskrta-shloka/ch-verses/${encodeURIComponent(shlokaId)}`;
    const q = [];
    if (from?.bookId) q.push(`fromBook=${encodeURIComponent(from.bookId)}`);
    if (from?.chapterId) q.push(`fromChapter=${encodeURIComponent(from.chapterId)}`);
    if (from?.occurrenceId) q.push(`fromOccurrence=${encodeURIComponent(from.occurrenceId)}`);
    if (from?.paraId) q.push(`fromPara=${encodeURIComponent(from.paraId)}`);
    if (q.length) hash += `?${q.join("&")}`;
    return hash;
  }

  function normalizeSourceIndexEntry(raw) {
    if (!raw) return null;
    if (typeof raw === "string") return { paraId: raw, label: "" };
    if (typeof raw === "object" && raw.paraId) {
      return { paraId: raw.paraId, label: raw.label || "" };
    }
    return null;
  }

  function normalizeSourceIndex(index) {
    const out = {};
    Object.entries(index || {}).forEach(([key, val]) => {
      const n = normalizeSourceIndexEntry(val);
      if (n) out[key] = n;
    });
    return out;
  }

  function prefersReducedMotion() {
    try {
      return !!(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (_) {
      return false;
    }
  }

  function clearOccurrenceHighlight(root) {
    const scope = root || (typeof document !== "undefined" ? document : null);
    if (!scope?.querySelectorAll) return;
    scope.querySelectorAll(`.${FLASH_CLASS}, .${SELECTED_CLASS}`).forEach((el) => {
      el.classList.remove(FLASH_CLASS, SELECTED_CLASS);
    });
  }

  function focusOccurrenceElement(el, opts = {}) {
    if (!el) {
      return { ok: false, reason: "element_missing" };
    }
    const doc = opts.root || (typeof document !== "undefined" ? document : null);
    clearOccurrenceHighlight(doc);
    if (typeof el.setAttribute === "function") {
      if (!el.hasAttribute?.("tabindex")) el.setAttribute("tabindex", "-1");
      if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
    }

    const reduced = prefersReducedMotion();
    // Force layout for content-visibility:auto chapters (long AMPS discourses).
    try {
      let node = el;
      while (node && node !== doc?.body) {
        if (node.style) node.style.contentVisibility = "visible";
        node = node.parentElement;
      }
    } catch (_) {}

    const sticky =
      (typeof document !== "undefined" &&
        (document.querySelector(".shloka-verse-search-wrap") ||
          document.querySelector(".reader-toolbar-wrap") ||
          document.querySelector(".topbar"))) ||
      null;
    let offset = 72;
    try {
      const topbar = document.querySelector(".topbar");
      const toolbar = document.querySelector(".reader-toolbar-wrap");
      offset = (topbar?.getBoundingClientRect?.().height || 52) +
        (toolbar?.getBoundingClientRect?.().height || 0) + 12;
    } catch (_) {}

    // Prefer explicit window scroll — scrollIntoView is unreliable with content-visibility.
    try {
      void el.offsetTop;
      const rect = el.getBoundingClientRect?.();
      if (rect && typeof window !== "undefined") {
        const centerPad = Math.max(24, (window.innerHeight || 600) * 0.2);
        const y = window.scrollY + rect.top - offset - centerPad;
        window.scrollTo({
          top: Math.max(0, y),
          behavior: reduced || opts.instant ? "auto" : "smooth",
        });
      } else if (typeof el.scrollIntoView === "function") {
        el.scrollIntoView({
          behavior: reduced || opts.instant ? "auto" : "smooth",
          block: opts.block || "center",
        });
      }
    } catch (_) {
      try {
        el.scrollIntoView?.({ behavior: "auto", block: "center" });
      } catch (_) {}
    }

    el.classList?.add?.(SELECTED_CLASS);
    if (!reduced) el.classList?.add?.(FLASH_CLASS);

    try {
      el.focus?.({ preventScroll: true });
    } catch (_) {
      try {
        el.focus?.();
      } catch (_) {}
    }

    const ms = opts.highlightMs != null ? opts.highlightMs : HIGHLIGHT_MS;
    if (typeof window !== "undefined" && ms > 0) {
      window.clearTimeout(focusOccurrenceElement._timer);
      focusOccurrenceElement._timer = window.setTimeout(() => {
        el.classList?.remove?.(FLASH_CLASS);
      }, ms);
    }

    return { ok: true, element: el, id: el.id || null };
  }

  /**
   * Resolve target in rendered chapter.
   * Priority: occurrence id → paragraph id → normalized text match.
   */
  function resolveOccurrenceInArticle(article, opts = {}) {
    if (!article) return { ok: false, reason: "no_article", fallback: "chapter" };
    const occ = String(opts.occurrenceId || opts.occurrence || "").trim();
    const paraId = String(opts.paraId || "").trim();
    const needle = String(opts.quoteText || "").trim();

    if (occ) {
      const byOcc =
        article.querySelector(`#${cssEscape(occ)}`) ||
        article.querySelector(`[data-occurrence-id="${cssEscape(occ)}"]`);
      if (byOcc) {
        const el = byOcc.classList?.contains?.("reader-para")
          ? byOcc
          : byOcc.closest?.(".reader-para") || byOcc;
        return {
          ok: true,
          element: el,
          match_method: "occurrence_id",
          match_confidence: 1,
        };
      }
    }

    if (paraId) {
      const byPara =
        article.querySelector(`#${cssEscape(paraId)}`) ||
        article.querySelector(`[data-para="${cssEscape(paraId)}"]`) ||
        article.querySelector(`[data-source-paragraph-id="${cssEscape(paraId)}"]`);
      if (byPara) {
        return {
          ok: true,
          element: byPara,
          match_method: "paragraph_id",
          match_confidence: 0.95,
        };
      }
    }

    if (needle && needle.length >= 12) {
      const norm = normalizeForMatch(needle);
      const paras = article.querySelectorAll(".reader-para[data-para], .reader-para[id]");
      for (const el of paras) {
        const text = normalizeForMatch(el.getAttribute("data-search") || el.textContent || "");
        if (text && (text.includes(norm) || norm.includes(text.slice(0, Math.min(80, norm.length))))) {
          return {
            ok: true,
            element: el,
            match_method: "normalized_text",
            match_confidence: 0.6,
          };
        }
      }
    }

    return {
      ok: false,
      reason: "unresolved",
      fallback: paraId ? "paragraph_missing" : "chapter",
      message: "Exact shloka location could not be resolved.",
    };
  }

  function cssEscape(value) {
    const s = String(value || "");
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
    return s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function normalizeForMatch(text) {
    return String(text || "")
      .normalize("NFC")
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function saveNavSession(payload) {
    try {
      if (typeof sessionStorage === "undefined") return false;
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          ...payload,
          saved_at: new Date().toISOString(),
        })
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadNavSession() {
    try {
      if (typeof sessionStorage === "undefined") return null;
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function clearNavSession() {
    try {
      if (typeof sessionStorage === "undefined") return;
      sessionStorage.removeItem(SESSION_KEY);
    } catch (_) {}
  }

  function occurrenceMarkupAttrs(rec) {
    const id = rec.occurrence_id || occurrenceId(rec.stable_shloka_id, rec.source_chapter_id, rec.source_paragraph_id);
    return {
      id,
      className: "source-shloka-occurrence",
      attrs: {
        "data-occurrence-id": id,
        "data-shloka-id": rec.stable_shloka_id || "",
        "data-source-book-id": rec.source_book_id || "",
        "data-source-chapter-id": rec.source_chapter_id || "",
        "data-source-paragraph-id": rec.source_paragraph_id || "",
        "data-occurrence-start": rec.quotation_start_paragraph || rec.source_paragraph_id || "",
        "data-occurrence-end": rec.quotation_end_paragraph || rec.source_paragraph_id || "",
        tabindex: "-1",
        "aria-label": rec.aria_label || `Shloka occurrence ${rec.stable_shloka_id || ""}`,
      },
    };
  }

  function uniqueOccurrenceIds(records) {
    const seen = new Set();
    const out = [];
    (records || []).forEach((r) => {
      const id = r.occurrence_id || occurrenceId(r.stable_shloka_id, r.source_chapter_id, r.source_paragraph_id);
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push({ ...r, occurrence_id: id });
    });
    return out;
  }

  /**
   * Exact shloka → source target. Always carries bookId + chapterId + paraId.
   * Callers open the book/chapter, then scroll/highlight the paragraph.
   */
  function buildSourceNavTarget(opts = {}) {
    const bookId = String(opts.bookId || "").trim();
    const chapterId = String(opts.chapterId || "").trim();
    const paraId = String(opts.paraId || "").trim();
    const shlokaId = String(opts.shlokaId || opts.stableShlokaId || "").trim();
    return {
      bookId,
      chapterId,
      paraId,
      shlokaId,
      occurrenceId: opts.occurrenceId || occurrenceId(shlokaId, chapterId, paraId),
      exact: Boolean(bookId && chapterId && paraId),
      hash: bookId && chapterId ? readerHash(bookId, chapterId, paraId, opts.occurrenceId || null) : "",
    };
  }

  /** Resolve merged/archived alias → canonical active stable ID. */
  function resolveCanonicalShlokaId(id, aliasMap) {
    const raw = String(id || "").trim();
    if (!raw) return { ok: false, reason: "empty_id", stableId: null };
    const map =
      aliasMap instanceof Map
        ? aliasMap
        : aliasMap && typeof aliasMap === "object"
          ? new Map(
              Object.entries(aliasMap.aliases || aliasMap)
                .filter(([k]) => k !== "schema_version" && k !== "updated_at" && k !== "aliases")
                .map(([k, v]) => [k, typeof v === "string" ? v : v?.canonical_id])
                .filter(([, v]) => v)
            )
          : new Map();
    const seen = new Set();
    let cur = raw;
    let hops = 0;
    while (map.has(cur)) {
      if (seen.has(cur) || hops >= 32) {
        return { ok: false, reason: "alias_cycle", stableId: null };
      }
      seen.add(cur);
      cur = map.get(cur);
      hops += 1;
    }
    return { ok: true, stableId: cur, redirected: hops > 0, fromId: hops ? raw : null };
  }

  /**
   * When the exact paragraph cannot be found, fall back to the chapter with a
   * visible nonfatal warning (caller shows the toast / banner).
   */
  function paragraphMissingFallback(opts = {}) {
    const bookId = String(opts.bookId || "").trim();
    const chapterId = String(opts.chapterId || "").trim();
    const paraId = String(opts.paraId || "").trim();
    return {
      ok: false,
      fallback: "chapter",
      reason: "paragraph_missing",
      bookId,
      chapterId,
      paraId,
      warning: paraId
        ? `Exact paragraph “${paraId}” was not found. Opened the chapter instead.`
        : "Exact paragraph was not found. Opened the chapter instead.",
      hash: bookId && chapterId ? readerHash(bookId, chapterId, null, null) : "",
    };
  }

  /**
   * Neighbors from an ordered active verse list — never pN±1 arithmetic.
   * rows: array of {id} or paragraph objects already in active sequence order.
   */
  function activeNeighbors(rows, stableId) {
    const list = Array.isArray(rows) ? rows : [];
    const id = String(stableId || "").trim();
    const index = list.findIndex((p) => (p.id || p.stableId) === id);
    if (index < 0) {
      return { ok: false, reason: "not_in_active_corpus", index: -1, prev: null, next: null };
    }
    return {
      ok: true,
      index,
      visibleNumber: index + 1,
      stableId: id,
      prev: index > 0 ? list[index - 1] : null,
      next: index < list.length - 1 ? list[index + 1] : null,
      atFirst: index === 0,
      atLast: index === list.length - 1,
    };
  }

  return {
    OCC_PREFIX,
    HIGHLIGHT_MS,
    SELECTED_CLASS,
    FLASH_CLASS,
    occurrenceId,
    parseOccurrenceId,
    buildOccurrenceRecord,
    readerHash,
    shlokaHash,
    normalizeSourceIndexEntry,
    normalizeSourceIndex,
    prefersReducedMotion,
    clearOccurrenceHighlight,
    focusOccurrenceElement,
    resolveOccurrenceInArticle,
    normalizeForMatch,
    saveNavSession,
    loadNavSession,
    clearNavSession,
    occurrenceMarkupAttrs,
    uniqueOccurrenceIds,
    buildSourceNavTarget,
    resolveCanonicalShlokaId,
    paragraphMissingFallback,
    activeNeighbors,
  };
});

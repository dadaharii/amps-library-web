/* AMPS Library — non-destructive TTS highlight controller */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TtsHighlightController = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const CLASSES = Object.freeze({
    paragraph: "is-tts-paragraph-active",
    phrase: "is-tts-phrase-active",
    word: "is-tts-word-active",
    paused: "is-tts-paused",
    retrying: "is-tts-retrying",
    completed: "is-tts-completed",
  });

  /** @type {{ sessionId: string|null, paragraphEl: Element|null, phraseEl: Element|null, wordEl: Element|null }} */
  let state = {
    sessionId: null,
    paragraphEl: null,
    phraseEl: null,
    wordEl: null,
    phraseMark: null,
  };

  function prefersReducedMotion() {
    try {
      return !!root.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    } catch (_) {
      return false;
    }
  }

  function clearPhrase() {
    if (state.phraseMark && state.phraseMark.parentNode) {
      const parent = state.phraseMark.parentNode;
      while (state.phraseMark.firstChild) parent.insertBefore(state.phraseMark.firstChild, state.phraseMark);
      parent.removeChild(state.phraseMark);
    }
    state.phraseMark = null;
    state.phraseEl = null;
    document.querySelectorAll?.("." + CLASSES.phrase).forEach(el => el.classList.remove(CLASSES.phrase));
  }

  function clearWord() {
    document.querySelectorAll?.("." + CLASSES.word).forEach(el => el.classList.remove(CLASSES.word));
    // legacy class
    document.querySelectorAll?.(".tts-word-active").forEach(el => el.classList.remove("tts-word-active"));
    state.wordEl = null;
  }

  function clearAll() {
    clearWord();
    clearPhrase();
    document.querySelectorAll?.(
      `.${CLASSES.paragraph},.${CLASSES.paused},.${CLASSES.retrying},.${CLASSES.completed}`
    ).forEach(el => {
      el.classList.remove(CLASSES.paragraph, CLASSES.paused, CLASSES.retrying, CLASSES.completed);
    });
    state.paragraphEl = null;
    state.sessionId = null;
  }

  function resolveParagraphEl(paragraphId, explicit) {
    if (explicit && explicit.isConnected !== false) return explicit;
    if (!paragraphId || typeof document === "undefined") return null;
    return document.getElementById(paragraphId)
      || document.querySelector?.(`[data-para-id="${paragraphId}"]`)
      || null;
  }

  function scrollOnce(el) {
    if (!el || prefersReducedMotion()) {
      try { el?.scrollIntoView?.({ block: "nearest" }); } catch (_) { /* */ }
      return;
    }
    try {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (_) {
      try { el.scrollIntoView(true); } catch (__) { /* */ }
    }
  }

  function activateParagraph(session, opts) {
    if (!session) return;
    if (state.sessionId && state.sessionId !== session.sessionId) clearAll();
    state.sessionId = session.sessionId;
    const el = resolveParagraphEl(session.paragraphId, session.paragraphElement || opts?.element);
    if (state.paragraphEl && state.paragraphEl !== el) {
      state.paragraphEl.classList.remove(CLASSES.paragraph, CLASSES.paused, CLASSES.retrying);
    }
    state.paragraphEl = el;
    if (el) {
      el.classList.add(CLASSES.paragraph);
      el.classList.remove(CLASSES.completed);
      if (opts?.scroll !== false) scrollOnce(el);
    }
  }

  /**
   * Highlight a chunk/phrase using a non-destructive mark when possible.
   * Falls back to paragraph-level active class only.
   */
  function activateChunk(session, chunk, opts) {
    if (!session || session.sessionId !== state.sessionId) return;
    if (!chunk) return;
    activateParagraph(session, { scroll: false, element: opts?.element });
    clearWord();
    clearPhrase();

    const Caps = root.TtsPlatformCapabilities;
    const allowWord = Caps?.wordHighlightAllowed?.(session.platformHints) && opts?.wordIndex >= 0;

    const para = state.paragraphEl;
    if (!para) return;

    // Prefer existing .tts-word spans for word mode only when reliable
    if (allowWord && Number.isFinite(opts.wordIndex)) {
      const wordEl = para.querySelector?.(`.tts-word[data-wi="${opts.wordIndex}"]`);
      if (wordEl) {
        wordEl.classList.add(CLASSES.word, "tts-word-active");
        state.wordEl = wordEl;
        return;
      }
    }

    // Chunk / phrase highlight: mark class on paragraph; optional Range wrap
    para.classList.add(CLASSES.phrase);
    state.phraseEl = para;
    try {
      if (typeof document !== "undefined" && document.createRange && para.firstChild) {
        const range = document.createRange();
        const textNode = findTextNodeForOffset(para, chunk.canonicalStart, chunk.canonicalEnd);
        if (textNode) {
          const localStart = Math.max(0, chunk.canonicalStart - textNode._ampsAbsStart);
          const localEnd = Math.min(textNode.textContent.length, chunk.canonicalEnd - textNode._ampsAbsStart);
          if (localEnd > localStart) {
            range.setStart(textNode.node, localStart);
            range.setEnd(textNode.node, localEnd);
            const mark = document.createElement("mark");
            mark.className = CLASSES.phrase;
            mark.setAttribute("data-tts-chunk", chunk.chunkId);
            range.surroundContents(mark);
            state.phraseMark = mark;
            // Scroll only if phrase leaves readable viewport
            maybeScrollPhrase(mark);
          }
        }
      }
    } catch (_) {
      // surroundContents can fail on partial elements — paragraph class is enough
    }
  }

  function findTextNodeForOffset(rootEl, start, end) {
    if (!rootEl) return null;
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    let abs = 0;
    let node;
    while ((node = walker.nextNode())) {
      const len = node.textContent.length;
      const nodeStart = abs;
      const nodeEnd = abs + len;
      if (start >= nodeStart && start < nodeEnd && end <= nodeEnd) {
        return { node, _ampsAbsStart: nodeStart };
      }
      // Allow phrase wholly inside this text node
      if (start >= nodeStart && end <= nodeEnd) {
        return { node, _ampsAbsStart: nodeStart };
      }
      abs = nodeEnd;
    }
    return null;
  }

  function maybeScrollPhrase(el) {
    if (!el || prefersReducedMotion()) return;
    try {
      const rect = el.getBoundingClientRect();
      const vh = root.innerHeight || 800;
      const topSafe = 120;
      const bottomSafe = vh * 0.75;
      if (rect.top >= topSafe && rect.bottom <= bottomSafe) return;
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (_) { /* */ }
  }

  function setPaused(session, paused) {
    if (!session || session.sessionId !== state.sessionId) return;
    state.paragraphEl?.classList.toggle(CLASSES.paused, !!paused);
  }

  function setRetrying(session, retrying) {
    if (!session || session.sessionId !== state.sessionId) return;
    state.paragraphEl?.classList.toggle(CLASSES.retrying, !!retrying);
  }

  function markCompleted(session) {
    if (!session || session.sessionId !== state.sessionId) return;
    clearPhrase();
    clearWord();
    state.paragraphEl?.classList.add(CLASSES.completed);
    state.paragraphEl?.classList.remove(CLASSES.paragraph, CLASSES.paused, CLASSES.retrying);
  }

  /** Derive highlight from session state only. */
  function syncFromSession(session, chunk) {
    if (!session) {
      clearAll();
      return;
    }
    if (session.status === "cancelled" || session.status === "idle") {
      clearAll();
      return;
    }
    activateParagraph(session, { scroll: session.status === "speaking" && !chunk });
    if (chunk && (session.status === "speaking" || session.status === "paused")) {
      activateChunk(session, chunk);
    }
    setPaused(session, session.status === "paused");
    setRetrying(session, session.retryCount > 0 && session.status === "speaking");
    if (session.status === "paragraph_completed") markCompleted(session);
  }

  return {
    CLASSES,
    clearAll,
    activateParagraph,
    activateChunk,
    setPaused,
    setRetrying,
    markCompleted,
    syncFromSession,
    getState: () => ({ ...state }),
  };
});

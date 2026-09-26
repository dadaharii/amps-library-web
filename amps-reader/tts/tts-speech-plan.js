/* AMPS Library — safe language-aware speech plan builder */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TtsSpeechPlan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  let _seq = 0;
  function nextId(prefix) {
    _seq += 1;
    return `${prefix}-${_seq}-${Date.now().toString(36)}`;
  }

  function isPunctuationOnly(text) {
    return !/[\p{L}\p{N}]/u.test(String(text || ""));
  }

  function findSafeSplit(text, maxChars) {
    const s = String(text || "");
    if (s.length <= maxChars) return s.length;
    const minKeep = Math.floor(maxChars * 0.35);
    const window = s.slice(0, maxChars + 1);

    function lastMatch(re) {
      let m;
      let last = -1;
      const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      while ((m = r.exec(window)) !== null) {
        const at = m.index + m[0].length;
        if (at >= minKeep && at <= maxChars) last = at;
      }
      return last;
    }

    // Prefer sentence / danda boundaries even if early in the window
    const sentence = lastMatch(/[.!?।॥]["')\]]?\s/);
    if (sentence > 0) return sentence;

    const clause = lastMatch(/[;:]["')\]]?\s/);
    if (clause > 0) return clause;

    const comma = lastMatch(/[,，]["')\]]?\s/);
    if (comma > 0) return comma;

    const space = lastMatch(/\s+(?=\S)/);
    if (space > 0) return space;

    for (let i = Math.min(maxChars, s.length - 1); i >= minKeep; i -= 1) {
      if (/\s/.test(s[i]) && !/[\u0300-\u036f]/.test(s[i + 1] || "")) return i + 1;
    }
    return Math.min(maxChars, s.length);
  }

  function splitIntoSafeChunks(text, maxChars, baseOffset, language, segmentId, paragraphId) {
    const chunks = [];
    let remaining = String(text || "");
    let offset = baseOffset;
    while (remaining.length) {
      if (isPunctuationOnly(remaining)) {
        // Attach punctuation-only remainder to previous chunk when possible
        if (chunks.length) {
          chunks[chunks.length - 1].visibleText += remaining;
          chunks[chunks.length - 1].canonicalEnd = offset + remaining.length;
          chunks[chunks.length - 1].processedText = chunks[chunks.length - 1].visibleText;
        }
        break;
      }
      const take = findSafeSplit(remaining, maxChars);
      const piece = remaining.slice(0, take);
      remaining = remaining.slice(take);
      if (!piece.trim() && isPunctuationOnly(piece)) {
        offset += piece.length;
        continue;
      }
      if (!piece.trim()) {
        offset += piece.length;
        continue;
      }
      const start = offset;
      const end = offset + piece.length;
      offset = end;
      const pause = /[.!?।॥]\s*$/.test(piece) ? "sentence"
        : /[;:]\s*$/.test(piece) ? "clause"
          : /[,]\s*$/.test(piece) ? "comma"
            : "none";
      chunks.push({
        chunkId: nextId("chunk"),
        paragraphId,
        segmentId,
        language,
        canonicalStart: start,
        canonicalEnd: end,
        visibleText: piece,
        processedText: piece,
        expectedPause: pause,
        status: "pending",
      });
    }
    return chunks;
  }

  /**
   * Split text at sentence ends (., !, ?, ।, ॥), merging very short pieces
   * into the next so a lone "Yes." is not spoken as its own utterance.
   */
  function splitSentences(text, minChars) {
    const s = String(text || "");
    const min = Math.max(0, Number(minChars) || 24);
    const pieces = [];
    const re = /[.!?।॥]+["')\]’”]*\s+/g;
    let start = 0;
    let m;
    while ((m = re.exec(s)) !== null) {
      const end = m.index + m[0].length;
      if (end - start >= min) {
        pieces.push({ text: s.slice(start, end), offset: start });
        start = end;
      }
    }
    if (start < s.length) {
      const tail = s.slice(start);
      if (pieces.length && tail.trim().length < min) {
        pieces[pieces.length - 1].text += tail;
      } else {
        pieces.push({ text: tail, offset: start });
      }
    }
    return pieces;
  }

  /**
   * Build a deterministic speech plan for one paragraph.
   */
  function buildSpeechPlan(paragraph, context) {
    const ctx = context || {};
    const Caps = root.TtsPlatformCapabilities;
    const Router = root.TtsLanguageRouter;
    const TextMap = root.TtsTextMap;
    const maxChars = (() => {
      const raw = Number(ctx.maxChunkChars);
      if (Number.isFinite(raw) && raw > 0) {
        // Explicit overrides may be small (tests / constrained engines).
        return Math.max(12, Math.min(500, raw));
      }
      const fromCaps = Caps?.maxChunkChars?.(ctx.platformHints);
      if (Number.isFinite(fromCaps) && fromCaps > 0) return Math.max(80, Math.min(500, fromCaps));
      return 200;
    })();

    const paragraphId = paragraph?.id || paragraph?.paragraphId || ctx.paragraphId || "unknown";
    const canonicalText = String(
      paragraph?.canonicalText != null
        ? paragraph.canonicalText
        : (paragraph?.text || paragraph || "")
    );

    const langSegs = Router?.segment
      ? Router.segment(canonicalText, {
          explicitLanguage: ctx.language || paragraph?.language,
          corpusLanguage: ctx.corpusLanguage || "en",
          element: ctx.element || null,
        })
      : [{ text: canonicalText, language: ctx.language || "en", source: "fallback" }];

    const segments = [];
    let cursor = 0;
    for (const ls of langSegs) {
      const text = String(ls.text || "");
      if (!text) continue;
      // Locate this slice in canonical text from cursor (preserve offsets).
      let start = canonicalText.indexOf(text, cursor);
      if (start < 0) start = cursor;
      const end = start + text.length;
      cursor = end;
      const language = ls.language === "punctuation" || ls.language === "number" || ls.language === "abbreviation"
        ? "en"
        : ls.language;
      const segmentId = nextId("seg");
      const rawChunks = ctx.sentenceChunks
        ? splitSentences(text).flatMap(piece =>
          splitIntoSafeChunks(piece.text, maxChars, start + piece.offset, language, segmentId, paragraphId))
        : splitIntoSafeChunks(text, maxChars, start, language, segmentId, paragraphId);
      const chunks = rawChunks.map(ch => {
        const map = TextMap?.identityMap?.(ch.visibleText, ch.processedText) || {
          canonicalText: ch.visibleText,
          processedText: ch.processedText,
          mappings: [],
        };
        return { ...ch, textMap: map, status: "pending" };
      });
      segments.push({
        segmentId,
        language,
        text,
        canonicalStart: start,
        canonicalEnd: end,
        chunks,
      });
    }

    return {
      paragraphId,
      canonicalText,
      maxChunkChars: maxChars,
      syncMode: Caps?.syncModeFor?.(ctx.platformHints) || "chunk_aligned",
      segments,
      allChunkIds: segments.flatMap(s => s.chunks.map(c => c.chunkId)),
    };
  }

  function flattenChunks(plan) {
    const out = [];
    for (const seg of plan?.segments || []) {
      for (const ch of seg.chunks || []) out.push({ ...ch, language: ch.language || seg.language });
    }
    return out;
  }

  return {
    buildSpeechPlan,
    flattenChunks,
    findSafeSplit,
    isPunctuationOnly,
    splitIntoSafeChunks,
    splitSentences,
  };
});

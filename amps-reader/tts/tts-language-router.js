/* AMPS Library — language router for unified TTS */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TtsLanguageRouter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const LANGS = Object.freeze({
    EN: "en",
    SA_LATN: "sa-Latn",
    SA_DEVA: "sa-Deva",
    HI_DEVA: "hi-Deva",
    BN: "bn",
    PUNCT: "punctuation",
    NUMBER: "number",
    ABBREV: "abbreviation",
    UNKNOWN: "unknown",
  });

  const ORDINARY_ENGLISH_PROBE = Object.freeze([
    "practice", "sake", "the", "name", "same", "one", "were",
    "spiritual", "consciousness", "philosophy", "humanity", "meditation",
  ]);

  const SAMSKRTA_MARK_RE = /[\u0301\u0330ḿṁṃāáīíūúṛṝḷḹśṣńṇṅṋñṭḍḥ॒]|[áÁāĀíÍīĪúÚūŪḿḾṁṃńŃṇṆṅṄṋñÑśŚṣṢṭṬḍḌṛṚ]/u;
  const DEVANAGARI_RE = /[\u0900-\u097F]/;
  const BENGALI_RE = /[\u0980-\u09FF]/;
  const LATIN_WORD_RE = /[\p{L}\p{M}'’‘`]+/gu;

  function terminology() {
    return root.AmpsTtsTerminology || null;
  }

  function normalizeExplicitLang(lang) {
    const s = String(lang || "").trim().toLowerCase();
    if (!s) return null;
    if (s === "en" || s.startsWith("en-")) return LANGS.EN;
    if (s === "sa-latn" || s === "sa-latn" || s === "sa-roma" || s === "sa-roman") return LANGS.SA_LATN;
    if (s === "sa" || s === "sa-deva" || s === "sa-deva" || s === "sanskrit") {
      return s.includes("latn") || s.includes("roman") ? LANGS.SA_LATN : LANGS.SA_DEVA;
    }
    if (s === "hi" || s.startsWith("hi-")) return LANGS.HI_DEVA;
    if (s === "bn" || s.startsWith("bn-")) return LANGS.BN;
    if (s === "sa-latn") return LANGS.SA_LATN;
    if (s === "sa-deva") return LANGS.SA_DEVA;
    // Preserve exact casing forms from HTML
    if (lang === "sa-Latn") return LANGS.SA_LATN;
    if (lang === "sa-Deva") return LANGS.SA_DEVA;
    if (lang === "hi-Deva") return LANGS.HI_DEVA;
    return null;
  }

  function prefersHindiDevanagari(options) {
    return !!options?.preferHindiDevanagari
      || normalizeExplicitLang(options?.corpusLanguage) === LANGS.HI_DEVA;
  }

  function classifyFromDom(el) {
    if (!el) return null;
    const langAttr = el.getAttribute?.("lang") || el.lang || el.closest?.("[lang]")?.getAttribute?.("lang");
    const explicit = normalizeExplicitLang(langAttr);
    if (explicit) return { language: explicit, source: "explicit-lang" };
    const sys = el.getAttribute?.("data-pronunciation-system")
      || el.closest?.("[data-pronunciation-system]")?.getAttribute?.("data-pronunciation-system");
    if (sys === "amps-roman-samskrta") return { language: LANGS.SA_LATN, source: "pronunciation-system" };
    if (sys === "amps-devanagari") return { language: LANGS.SA_DEVA, source: "pronunciation-system" };
    return null;
  }

  function classifyToken(token, options) {
    const raw = String(token || "");
    const t = raw.trim();
    if (!t) return LANGS.PUNCT;
    if (/^[\d]+([.,]\d+)?%?$/.test(t)) return LANGS.NUMBER;
    if (/^(i\.e\.|e\.g\.|etc\.|vs\.|mr\.|mrs\.|dr\.)$/i.test(t)) return LANGS.ABBREV;
    if (!/[\p{L}\p{M}]/u.test(t)) return LANGS.PUNCT;

    if (options?.explicitLanguage) {
      const ex = normalizeExplicitLang(options.explicitLanguage);
      if (ex) return ex;
    }
    if (options?.corpusLanguage) {
      const corp = normalizeExplicitLang(options.corpusLanguage);
      if (corp === LANGS.EN && !DEVANAGARI_RE.test(t) && !SAMSKRTA_MARK_RE.test(t)) {
        const term = terminology()?.lookup?.(t);
        if (term?.language) return term.language;
        return LANGS.EN;
      }
      if (corp && corp !== LANGS.EN) {
        // Corpus language is advisory for unmarked Latin in English books → EN default
      }
    }

    const term = terminology()?.lookup?.(t);
    if (term?.language === LANGS.SA_LATN || term?.language === LANGS.SA_DEVA) {
      return term.language;
    }
    // English AMPS terms (PROUT, Neohumanism) stay English
    if (term?.language === LANGS.EN) return LANGS.EN;

    if (BENGALI_RE.test(t)) return LANGS.BN;
    if (DEVANAGARI_RE.test(t)) {
      // Devanagari default for AMPS library verse context is Samskrta;
      // Hindi only when explicitly marked or the book itself is Hindi.
      if (prefersHindiDevanagari(options)) return LANGS.HI_DEVA;
      return LANGS.SA_DEVA;
    }

    if (SAMSKRTA_MARK_RE.test(t)) return LANGS.SA_LATN;

    // Ordinary Roman prose in English publications → English
    if (/[A-Za-z]/.test(t)) return LANGS.EN;

    return LANGS.UNKNOWN;
  }

  /**
   * Classify a whole string (single language guess for unsegmented callers).
   */
  function classifyText(text, options) {
    const s = String(text || "").trim();
    if (!s) return { language: LANGS.UNKNOWN, source: "empty" };

    if (options?.element) {
      const fromDom = classifyFromDom(options.element);
      if (fromDom) return fromDom;
    }
    if (options?.explicitLanguage) {
      const ex = normalizeExplicitLang(options.explicitLanguage);
      if (ex) return { language: ex, source: "explicit-metadata" };
    }
    if (options?.corpusLanguage) {
      const corp = normalizeExplicitLang(options.corpusLanguage);
      if (corp === LANGS.EN && !DEVANAGARI_RE.test(s) && !SAMSKRTA_MARK_RE.test(s)) {
        return { language: LANGS.EN, source: "corpus-english" };
      }
    }

    if (BENGALI_RE.test(s) && !/[A-Za-z]/.test(s)) {
      return { language: LANGS.BN, source: "script" };
    }
    const dev = (s.match(/[\u0900-\u097F]/g) || []).length;
    const latin = (s.match(/[A-Za-z]/g) || []).length;
    if (dev >= 2 && dev >= latin) {
      return {
        language: prefersHindiDevanagari(options) ? LANGS.HI_DEVA : LANGS.SA_DEVA,
        source: "script",
      };
    }
    if (SAMSKRTA_MARK_RE.test(s) && latin > 0 && !/\b(the|and|is|are|was|were|for|of|to|in|on|with|that|this)\b/i.test(s)) {
      // Pure or mostly marked Samskrta line
      const words = s.match(LATIN_WORD_RE) || [];
      const marked = words.filter(w => SAMSKRTA_MARK_RE.test(w) || terminology()?.lookup?.(w));
      if (words.length && marked.length >= Math.ceil(words.length * 0.6)) {
        return { language: LANGS.SA_LATN, source: "script-marks" };
      }
    }

    // Default Roman prose → English
    if (latin > 0) return { language: LANGS.EN, source: "english-default" };
    return { language: LANGS.UNKNOWN, source: "fallback" };
  }

  /**
   * Segment mixed-language text into contiguous language runs.
   */
  function segment(text, options) {
    const s = String(text || "");
    if (!s) return [];
    if (options?.explicitLanguage) {
      const ex = normalizeExplicitLang(options.explicitLanguage);
      if (ex && ex !== LANGS.EN) {
        return [{ text: s, language: ex, source: "explicit-metadata" }];
      }
    }

    const parts = [];
    const re = /([\p{L}\p{M}'’‘`]+(?:-[\p{L}\p{M}'’‘`]+)*)|(\d+(?:[.,]\d+)?)|(\s+)|([^\s\p{L}\p{M}\d]+)/gu;
    let m;
    let buf = "";
    let bufLang = null;
    let bufSource = null;

    function flush() {
      if (!buf) return;
      parts.push({ text: buf, language: bufLang || LANGS.UNKNOWN, source: bufSource || "segment" });
      buf = "";
      bufLang = null;
      bufSource = null;
    }

    while ((m = re.exec(s)) !== null) {
      const word = m[1];
      const num = m[2];
      const space = m[3];
      const punct = m[4];
      if (space != null) {
        if (bufLang) buf += space;
        else {
          // leading / interstitial space attaches to next content on flush boundary
          if (parts.length) parts[parts.length - 1].text += space;
          else buf += space;
        }
        continue;
      }
      if (punct != null) {
        if (bufLang) buf += punct;
        else if (parts.length) parts[parts.length - 1].text += punct;
        else {
          buf = punct;
          bufLang = LANGS.PUNCT;
          bufSource = "punctuation";
        }
        continue;
      }
      const token = word || num;
      const lang = word
        ? classifyToken(word, options)
        : LANGS.NUMBER;
      const contentLang = (lang === LANGS.PUNCT || lang === LANGS.NUMBER || lang === LANGS.ABBREV)
        ? (bufLang || LANGS.EN)
        : lang;
      if (bufLang && contentLang !== bufLang && lang !== LANGS.PUNCT && lang !== LANGS.NUMBER && lang !== LANGS.ABBREV) {
        flush();
      }
      if (!bufLang) {
        bufLang = contentLang;
        bufSource = "token";
      }
      buf += token;
    }
    flush();

    // Merge punctuation-only / tiny runs into neighbours when helpful
    return mergeTrivial(parts);
  }

  function mergeTrivial(parts) {
    if (parts.length <= 1) return parts;
    const out = [];
    for (const p of parts) {
      if (
        out.length
        && (p.language === LANGS.PUNCT || p.language === LANGS.NUMBER || p.language === LANGS.ABBREV)
      ) {
        out[out.length - 1].text += p.text;
        continue;
      }
      if (out.length && out[out.length - 1].language === p.language) {
        out[out.length - 1].text += p.text;
        continue;
      }
      out.push({ ...p });
    }
    return out;
  }

  /** Regression probes: ordinary English must classify as en. */
  function assertOrdinaryEnglishNeverSamskrta() {
    const failures = [];
    for (const w of ORDINARY_ENGLISH_PROBE) {
      const lang = classifyToken(w, { corpusLanguage: "en" });
      if (lang !== LANGS.EN) failures.push(`${w}→${lang}`);
    }
    if (failures.length) throw new Error(`Ordinary English misclassified: ${failures.join(", ")}`);
    return true;
  }

  return {
    LANGS,
    ORDINARY_ENGLISH_PROBE,
    classifyToken,
    classifyText,
    classifyFromDom,
    segment,
    normalizeExplicitLang,
    assertOrdinaryEnglishNeverSamskrta,
  };
});

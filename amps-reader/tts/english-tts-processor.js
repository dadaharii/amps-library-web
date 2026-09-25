/* AMPS Library — English TTS processor (no Hindi / Samskrta frontend) */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EnglishTtsProcessor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const LOCALE_PREF = Object.freeze(["en-IN", "en-GB", "en-US"]);

  /** Forbidden: these must never run on English prose. */
  const FORBIDDEN_PROCESSORS = Object.freeze([
    "hindi-transliteration",
    "devanagari-conversion",
    "samskrta-correction-rules",
    "roman-samskrta-phonology",
    "hindi-g2p",
  ]);

  function expandAbbreviations(text) {
    return String(text || "")
      .replace(/\bi\s*\.\s*e\s*\./giu, "that is")
      .replace(/\be\s*\.\s*g\s*\./giu, "for example")
      .replace(/\betc\s*\./giu, "etcetera")
      .replace(/\bvs\s*\./giu, "versus");
  }

  function normalizePunctuation(text) {
    return String(text || "")
      .replace(/([.!?])(?=[A-Za-z])/g, "$1 ")
      .replace(/([,;:])(?=[A-Za-z])/g, "$1 ")
      .replace(/\s+([.!?!,;:])/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function expandNumbers(text) {
    if (root.AmpsTtsNumbers?.normalizeGroupedNumbers) {
      return root.AmpsTtsNumbers.normalizeGroupedNumbers(String(text || ""));
    }
    return String(text || "");
  }

  /**
   * Prepare English text for an English pronunciation frontend.
   * Does NOT apply Hindi transliteration, Devanagari conversion, or Samskrta rules.
   * Does NOT add ordinary-English respelling overrides.
   */
  function prepare(text, options) {
    let out = String(text || "").replace(/<[^>]+>/g, " ");
    out = expandAbbreviations(out);
    out = expandNumbers(out);
    out = normalizePunctuation(out);

    // Light English article cue only (optional; native engines usually handle "the")
    if (options?.articleCue === true && root.AmpsAudio?.normalizeEnglishArticleForSpeech) {
      out = root.AmpsAudio.normalizeEnglishArticleForSpeech(out);
    }

    return {
      text: out.trim(),
      language: "en",
      localePreference: LOCALE_PREF.slice(),
      preferredLocale: options?.locale || "en-IN",
      pronunciationFrontend: "english",
      forbiddenProcessors: FORBIDDEN_PROCESSORS.slice(),
      usedOrdinaryEnglishOverrides: false,
    };
  }

  function resolveLocale(availableLocales) {
    const have = (availableLocales || []).map(l => String(l || "").toLowerCase());
    for (const pref of LOCALE_PREF) {
      const p = pref.toLowerCase();
      if (have.some(h => h === p || h.startsWith(p.split("-")[0] + "-" + p.split("-")[1]))) {
        return pref;
      }
      if (have.some(h => h.startsWith("en"))) {
        // continue preferring ordered list
      }
    }
    for (const pref of LOCALE_PREF) {
      if (have.some(h => h.startsWith("en"))) return pref;
    }
    return "en-IN";
  }

  /**
   * Voice is compatible with English only if its language frontend is English.
   * An Indian female Hindi-only voice is NOT compatible.
   */
  function voiceSupportsEnglish(voice) {
    if (!voice) return false;
    const lang = String(voice.lang || voice.locale || "").toLowerCase();
    if (lang.startsWith("en")) return true;
    // Explicit registry flag
    if (Array.isArray(voice.languages) && voice.languages.includes("en")) return true;
    if (Array.isArray(voice.supportedLanguages) && voice.supportedLanguages.includes("en")) return true;
    // Hindi-only
    if (lang.startsWith("hi")) return false;
    return false;
  }

  function markIncompatible(voice, reason) {
    return {
      id: voice?.id || voice?.voiceURI || voice?.name || "unknown",
      compatibleWithEnglish: false,
      reason: reason || "Voice language frontend is not English",
    };
  }

  return {
    LOCALE_PREF,
    FORBIDDEN_PROCESSORS,
    prepare,
    resolveLocale,
    voiceSupportsEnglish,
    markIncompatible,
    expandAbbreviations,
    normalizePunctuation,
  };
});

/**
 * Sanskrit / Roman Saṁskrta speech preprocessing for AMPS Library TTS.
 *
 * IMPORTANT:
 * - Never use this on visible chapter text.
 * - Only pass its output to TTS / audio download / hidden speech buffers.
 * - Display text, stored books, translations, and search indexes stay unchanged.
 *
 * Pipeline priority:
 *   1. Manual pronunciation overrides (JSON + local user corrections)
 *   2. AMPS special pronunciation overrides (phrases + philosophical terms)
 *   3. Library dictionary (17k+ curated speech forms from amps-pronunciation-dictionary.json)
 *   4. Roman Saṁskrta rule engine (roman-samskrta bundle)
 *   5. Rule-based Sanskrit normalizer (diacritic fallback)
 *   6. Original token fallback
 *
 * Run word extraction for review:
 *   node scripts/extract-sanskrit-words.js
 *
 * Review generated CSV:
 *   amps-reader/data/sanskrit_pronunciation_review.csv
 */
(function (root, factory) {
  const api = factory(
    typeof require !== "undefined"
      ? require("./amps-pronunciation-overrides.js")
      : root.AmpsPronunciationOverrides
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof root !== "undefined") {
    root.AmpsSanskritTts = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this, function (Overrides) {
  "use strict";

  const SANSKRIT_MARK_RE = /[\u0300-\u036f\u0301\u0330\u0331āáíīúūṛṝśṣṅñṇṭḍṃṁḿḥḷṝŕÁĀÍĪÚŪṚṜŚṢṬḌṆṄÑḤṀṂṋṅ]/iu;
  const DEVANAGARI_RE = /[\u0900-\u097F]/u;
  const TOKEN_RE = /([\p{L}\p{M}'’‘`]+(?:-[\p{L}\p{M}'’‘`]+)*)/gu;
  const MANUAL_URL = "data/sanskrit_pronunciation_manual.json";
  const LIBRARY_URL = "data/amps-pronunciation-dictionary.json";
  const USER_MANUAL_STORAGE = "amps-sanskrit-pronunciation-manual-v1";

  let manualPromise = null;
  let manualCache = null;
  let librarySpeechPromise = null;
  let librarySpeechMap = null;
  let libraryDevanagariSpeechMap = null;

  function buildLibraryDevanagariSpeechMap(data) {
    const map = new Map();
    (data?.entries || []).forEach(row => {
      const dev = String(row?.devanagari || "").trim().normalize("NFC");
      const speech = String(row?.speech || "").trim();
      if (!dev || !speech) return;
      map.set(dev, speech);
    });
    return map;
  }

  const ENGLISH_STOP = new Set([
    "a", "an", "the", "and", "are", "as", "at", "be", "been", "but", "by", "can", "could", "did", "do", "does",
    "for", "from", "had", "has", "have", "he", "her", "here", "him", "his", "i", "if", "in", "is", "it", "its",
    "may", "more", "not", "of", "on", "one", "or", "our", "she", "should", "that", "their", "then", "there",
    "these", "they", "this", "those", "to", "was", "we", "were", "what", "when", "where", "which", "who", "will",
    "with", "would", "you", "your", "already", "like", "same", "some", "take", "water", "thought", "all", "also",
    "into", "only", "other", "such", "than", "too", "very", "just", "about", "after", "before", "between", "both",
  ]);

  function exactRomanKey(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFC")
      .replace(/[’‘`]/g, "'")
      .trim();
  }

  function stripRomanMarks(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’‘`]/g, "'")
      .replace(/[^a-z0-9' ]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function romanSpeechKey(text) {
    return stripRomanMarks(text)
      .replace(/\bshrii\b/g, "shri")
      .replace(/aa/g, "a")
      .replace(/ii/g, "i")
      .replace(/uu/g, "u");
  }

  function buildLibrarySpeechMap(data) {
    const map = new Map();
    (data?.entries || []).forEach(row => {
      const roman = String(row?.roman || "").trim();
      const speech = String(row?.speech || "").trim();
      if (!roman || !speech) return;
      map.set(exactRomanKey(roman), speech);
      map.set(stripRomanMarks(roman), speech);
      map.set(romanSpeechKey(roman), speech);
    });
    return map;
  }

  async function loadLibrarySpeechMap(options) {
    if (options?.librarySpeechMap instanceof Map) return options.librarySpeechMap;
    if (librarySpeechMap) return librarySpeechMap;
    if (librarySpeechPromise) return librarySpeechPromise;
    librarySpeechPromise = (async () => {
      try {
        if (typeof require !== "undefined") {
          try {
            const data = require("../data/amps-pronunciation-dictionary.json");
            librarySpeechMap = buildLibrarySpeechMap(data);
            libraryDevanagariSpeechMap = buildLibraryDevanagariSpeechMap(data);
            return librarySpeechMap;
          } catch (_) { /* browser bundle */ }
        }
        if (typeof fetch !== "undefined") {
          const base = (() => {
            try {
              const scriptUrl = document.currentScript?.src || "utils/sanskrit-tts.js";
              return new URL(".", new URL(scriptUrl, location.href));
            } catch (_) {
              return null;
            }
          })();
          const url = base ? new URL(LIBRARY_URL, base).toString() : LIBRARY_URL;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            librarySpeechMap = buildLibrarySpeechMap(data);
            libraryDevanagariSpeechMap = buildLibraryDevanagariSpeechMap(data);
            return librarySpeechMap;
          }
        }
      } catch (_) { /* optional */ }
      librarySpeechMap = new Map();
      libraryDevanagariSpeechMap = new Map();
      return librarySpeechMap;
    })();
    return librarySpeechPromise;
  }

  function resetLibrarySpeechCache() {
    librarySpeechMap = null;
    libraryDevanagariSpeechMap = null;
    librarySpeechPromise = null;
  }

  const DICTIONARY_BLOCKLIST = new Set([
    "is", "are", "as", "at", "be", "by", "do", "go", "he", "if", "in", "it", "me", "my", "no", "of", "on", "or", "so", "to", "up", "us", "we",
  ]);

  const SANSKRIT_ROMAN_SUFFIX = /(?:tattva|bhava|bháva|deva|devi|shna|śńa|ttii|ttvi|skrta|dhana|sadhana|yoga|mudra|guna|guńa|krta|murti|múrti|marg|márga|gopa|sutra|mantra|ishvara|iishvara|prapatti|sarathi|sárathi|vraja|kiirtan|dhyana|dhyána|bhakti|karma|jnana|jñána|yajna|yajiṋa|ashtanga|aunga|indriya|indriyas|pranama)$/i;

  const AMPS_KEEP_ROMAN = new Set([
    "parama", "shiva", "shakti", "brahma", "aham", "mahat", "chitta", "citta", "aatmakam", "atman", "krsna",
  ]);

  function formatIndianSpeech(speech) {
    const s = String(speech || "").trim();
    if (!s.includes("-")) return s;
    return s.replace(/-/g, " ").replace(/[ \t]{2,}/g, " ").trim();
  }

  function looksLikeSanskritRoman(plain) {
    if (!plain || plain.length < 4) return false;
    if (ENGLISH_STOP.has(plain) || DICTIONARY_BLOCKLIST.has(plain) || AMPS_KEEP_ROMAN.has(plain)) return false;
    if (SANSKRIT_ROMAN_SUFFIX.test(plain)) return true;
    if (/^(pra|par|vra|krs|kr|kś|br|dh|bh|sh|sv|yog|nad|dev|rak|gop|nar|sam|vid|at|man|pur|rud|gan|vi|shi|mah|anu|bra|dhy|pra|nir|sag|tan|mud|pra|ash|ush)/i.test(plain) && plain.length >= 5) {
      return true;
    }
    if (/tt|dd|dh|bh|ks|sh|gy|ny|jn|kv|tv|kt|pt|nd|mb|rp/.test(plain) && plain.length >= 5) {
      return true;
    }
    return false;
  }

  function lookupLibrarySpeechSafe(token, speechMap) {
    const plain = stripRomanMarks(token);
    if (!plain || plain.length <= 3 || DICTIONARY_BLOCKLIST.has(plain)) return "";
    return lookupLibrarySpeech(token, speechMap);
  }

  function lookupLibrarySpeech(token, speechMap) {
    if (!speechMap?.size) return "";
    const clean = String(token || "").replace(/^[^\p{L}\p{M}'’‘`]+|[^\p{L}\p{M}'’‘`]+$/gu, "");
    if (!clean) return "";
    return speechMap.get(exactRomanKey(clean))
      || speechMap.get(stripRomanMarks(clean))
      || speechMap.get(romanSpeechKey(clean))
      || "";
  }

  function pronounceWithRuleEngine(token) {
    const g = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : {};
    const spoken = g.RomanSamskrtaLib?.pronounceRomanSamskrtaWord?.(token);
    return spoken ? String(spoken).trim() : "";
  }

  function shouldNormalizeToken(token, speechMap) {
    const clean = String(token || "").replace(/^[^\p{L}\p{M}'’‘`]+|[^\p{L}\p{M}'’‘`]+$/gu, "");
    if (!clean) return false;
    const plain = stripRomanMarks(clean);
    if (plain && (ENGLISH_STOP.has(plain) || DICTIONARY_BLOCKLIST.has(plain) || AMPS_KEEP_ROMAN.has(plain))) return false;
    if (hasSanskritMarks(clean)) return true;
    if (looksLikeSanskritRoman(plain)) return true;
    return false;
  }

  function normalizeMode(mode) {
    const m = String(mode || "").trim().toLowerCase();
    if (m === "off" || m === "normal" || m === "none") return "off";
    if (m === "basic") return "basic";
    if (m === "amps-enhanced" || m === "amps-hi-samskrta" || m === "amps" || m === "enhanced") return "amps-enhanced";
    return "amps-enhanced";
  }

  function hasDevanagari(text) {
    return DEVANAGARI_RE.test(String(text || ""));
  }

  function isPureDevanagariToken(token) {
    const clean = String(token || "").replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu, "");
    return !!clean && /^[\u0900-\u097F]+$/.test(clean);
  }

  function lookupDevanagariSpeech(token, devanagariSpeechMap, manualMaps) {
    const clean = String(token || "")
      .replace(/^[^\u0900-\u097F]+|[^\u0900-\u097F]+$/gu, "")
      .normalize("NFC");
    if (!clean) return "";
    return manualMaps?.words?.get(clean)
      || devanagariSpeechMap?.get(clean)
      || "";
  }

  function hasSanskritMarks(text) {
    return SANSKRIT_MARK_RE.test(String(text || ""));
  }

  function preserveCase(template, replacement) {
    if (!template) return replacement;
    if (template === template.toUpperCase()) return replacement.toUpperCase();
    if (template[0] === template[0].toUpperCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  function applyBasicRulesToWord(word) {
    let w = String(word || "").normalize("NFC");
    if (!w) return w;

    w = w
      .replace(/kś|kś|kṣ|ksh/giu, "ksha")
      .replace(/jñ|jiṋ|ji\u1e4b/giu, (m) => preserveCase(m, "jnya"))
      .replace(/ń|ṋ/giu, "ny")
      .replace(/ŕ|ŕ/giu, "ri")
      .replace(/([cC])(?=[aeiouáíúāīū])/g, "$1h")
      .replace(/ā|á|á|Á|Á/g, "aa")
      .replace(/ī|í|í|Í|Í/g, "ee")
      .replace(/ū|ú|ú|Ú|Ú/g, "oo")
      .replace(/ṛ|ŕ/g, "ri")
      .replace(/ṝ/g, "ree")
      .replace(/ś|ṣ|ś/g, "sh")
      .replace(/ṅ/g, "ng")
      .replace(/ñ/g, "ny")
      .replace(/ṇ/g, "n")
      .replace(/ṭ/g, "t")
      .replace(/ḍ/g, "d")
      .replace(/ṃ|ṁ|ḿ|ḿ/g, "m")
      .replace(/ḥ/g, "h")
      .replace(/oṋ|oṃ|om̐/giu, "om")
      .replace(/[\u0300-\u036f]/g, "");

    return w;
  }

  function buildOverrideMaps(manual) {
    const phrases = [];
    const words = new Map();
    const src = manual && typeof manual === "object" ? manual : {};
    Object.entries(src).forEach(([roman, spoken]) => {
      const key = String(roman || "").trim();
      const val = String(spoken || "").trim();
      if (!key || !val) return;
      if (key.includes(" ")) phrases.push([key, val]);
      else {
        words.set(key, val);
        words.set(key.toLowerCase(), val);
      }
    });
    phrases.sort((a, b) => b[0].length - a[0].length);
    return { phrases, words };
  }

  function loadUserManualOverrides() {
    try {
      const raw = localStorage.getItem(USER_MANUAL_STORAGE);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  async function loadManualOverrides() {
    if (manualCache) return manualCache;
    if (manualPromise) return manualPromise;
    manualPromise = (async () => {
      let fileManual = {};
      try {
        if (typeof fetch !== "undefined") {
          const base = (() => {
            try {
              const scriptUrl = document.currentScript?.src || "utils/sanskrit-tts.js";
              return new URL(".", new URL(scriptUrl, location.href));
            } catch (_) {
              return null;
            }
          })();
          const url = base ? new URL(MANUAL_URL, base).toString() : MANUAL_URL;
          const res = await fetch(url);
          if (res.ok) fileManual = await res.json();
        }
      } catch (_) { /* optional file */ }
      const merged = { ...fileManual, ...loadUserManualOverrides() };
      try {
        const rows = JSON.parse(localStorage.getItem("amps-pronunciation-overrides-v1") || "[]");
        (Array.isArray(rows) ? rows : []).forEach(row => {
          const roman = String(row?.roman || "").trim();
          const speech = String(row?.speech || "").trim();
          if (roman && speech) merged[roman] = speech;
        });
      } catch (_) { /* ignore */ }
      manualCache = buildOverrideMaps(merged);
      return manualCache;
    })();
    return manualPromise;
  }

  function resetManualCache() {
    manualCache = null;
    manualPromise = null;
  }

  function lookupManualWord(token, manualMaps) {
    if (!manualMaps?.words) return "";
    return manualMaps.words.get(token)
      || manualMaps.words.get(token.toLowerCase())
      || "";
  }

  function applyManualOverrides(text, manualMaps) {
    if (!manualMaps) return String(text || "");
    let out = Overrides.applyPhraseOverrides(text, manualMaps.phrases || []);
    out = out.replace(TOKEN_RE, (token) => lookupManualWord(token, manualMaps) || token);
    return out;
  }

  function normalizeToken(token, mode, manualMaps, speechMap, devanagariSpeechMap) {
    if (isPureDevanagariToken(token)) {
      const devSpeech = lookupDevanagariSpeech(token, devanagariSpeechMap, manualMaps);
      if (devSpeech) return formatIndianSpeech(devSpeech);
      return token;
    }
    const manual = lookupManualWord(token, manualMaps);
    if (manual) return formatIndianSpeech(manual);
    if (mode === "amps-enhanced") {
      const ampsWord = Overrides.WORD_OVERRIDES.find(([from]) => from.localeCompare(token, undefined, { sensitivity: "accent" }) === 0);
      if (ampsWord) return formatIndianSpeech(preserveCase(token, ampsWord[1]));
    }
    if (!shouldNormalizeToken(token, speechMap)) return token;
    const library = hasSanskritMarks(token) ? lookupLibrarySpeechSafe(token, speechMap) : "";
    if (library) return formatIndianSpeech(preserveCase(token, library));
    const engine = pronounceWithRuleEngine(token);
    if (engine && engine.toLowerCase() !== stripRomanMarks(token)) {
      return formatIndianSpeech(preserveCase(token, engine));
    }
    if (hasSanskritMarks(token)) return formatIndianSpeech(applyBasicRulesToWord(token));
    return token;
  }

  /**
   * Visible text must never be passed through display pipelines — speech only.
   */
  function stripDevanagariGlosses(text) {
    return String(text || "").replace(/\s*[-–—]\s*[\u0900-\u097F]+/gu, "");
  }

  function normalizeSanskritForTTS(text, mode, options) {
    const m = normalizeMode(mode);
    if (m === "off") return String(text || "");
    let out = String(text || "");
    const manualMaps = options?.manualMaps || null;
    const speechMap = options?.librarySpeechMap || null;
    const devanagariSpeechMap = options?.devanagariSpeechMap || null;

    if (manualMaps) out = applyManualOverrides(out, manualMaps);
    if (m === "amps-enhanced" && Overrides?.applyAmpsOverrides) {
      out = Overrides.applyAmpsOverrides(out);
    }
    out = stripDevanagariGlosses(out);

    out = out.replace(TOKEN_RE, token => normalizeToken(token, m, manualMaps, speechMap, devanagariSpeechMap));
    return out.replace(/[ \t]{2,}/g, " ").replace(/\s+([,;:.!?])/g, "$1").trim();
  }

  async function normalizeForSpeech(text, mode, options) {
    const manualMaps = options?.manualMaps || await loadManualOverrides();
    const librarySpeechMap = await loadLibrarySpeechMap(options);
    const devanagariSpeechMap = options?.devanagariSpeechMap || libraryDevanagariSpeechMap || null;
    return normalizeSanskritForTTS(text, mode, {
      ...options,
      manualMaps,
      librarySpeechMap,
      devanagariSpeechMap,
    });
  }

  /**
   * Pause hints for engines without segment timing (browser speech fallback).
   * Primary pause control remains in amps-reader-audio timed segments.
   */
  function formatPauseForTTS(text) {
    return String(text || "")
      .replace(/([,;])(\s*)/g, "$1 ")
      .replace(/([.!?])(\s*)/g, "$1 ")
      .replace(/।/g, "। ")
      .replace(/॥/g, "॥ ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function recommendedSpeechRate(mode, baseRate) {
    const m = normalizeMode(mode);
    const base = Number(baseRate);
    if (m === "off") return Number.isFinite(base) ? base : 1;
    if (Number.isFinite(base)) return base;
    return 0.9;
  }

  return {
    normalizeMode,
    normalizeSanskritForTTS,
    normalizeForSpeech,
    formatPauseForTTS,
    formatIndianSpeech,
    recommendedSpeechRate,
    hasSanskritMarks,
    applyBasicRulesToWord,
    loadManualOverrides,
    loadLibrarySpeechMap,
    buildLibrarySpeechMap,
    buildLibraryDevanagariSpeechMap,
    lookupLibrarySpeech,
    resetManualCache,
    resetLibrarySpeechCache,
    saveUserManualOverride(roman, speech) {
      const map = loadUserManualOverrides();
      const key = String(roman || "").trim();
      const val = String(speech || "").trim();
      if (!key) return false;
      if (!val) delete map[key];
      else map[key] = val;
      localStorage.setItem(USER_MANUAL_STORAGE, JSON.stringify(map));
      resetManualCache();
      return true;
    },
  };
});

/* AMPS Library — TTS voice registry (voice identity ≠ language frontend) */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TtsVoiceRegistry = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VOICES = Object.freeze([
    {
      id: "system-en-in-female",
      displayName: "Indian Female",
      engine: "system",
      gender: "female",
      accent: "Indian English",
      languages: ["en"],
      locale: "en-IN",
      preset: "in-en-female",
      platformAvailability: ["browser", "android", "ios"],
      offlineAvailability: "device-dependent",
      reviewStatus: "reviewed",
      compatibilityTestStatus: "requires-english-frontend",
      notes: "Accent only. Must use English pronunciation frontend, never Hindi G2P.",
    },
    {
      id: "system-en-in-male",
      displayName: "Indian Male",
      engine: "system",
      gender: "male",
      accent: "Indian English",
      languages: ["en"],
      locale: "en-IN",
      preset: "in-en-male",
      platformAvailability: ["browser", "android", "ios"],
      offlineAvailability: "device-dependent",
      reviewStatus: "reviewed",
      compatibilityTestStatus: "requires-english-frontend",
    },
    {
      id: "system-en-female",
      displayName: "English (female)",
      engine: "system",
      gender: "female",
      accent: "General English",
      languages: ["en"],
      locale: "en-GB",
      preset: "en-female",
      platformAvailability: ["browser", "android", "ios"],
      offlineAvailability: "device-dependent",
      reviewStatus: "reviewed",
      compatibilityTestStatus: "ok",
    },
    {
      id: "system-en-male",
      displayName: "English (male)",
      engine: "system",
      gender: "male",
      accent: "General English",
      languages: ["en"],
      locale: "en-GB",
      preset: "en-male",
      platformAvailability: ["browser", "android", "ios"],
      offlineAvailability: "device-dependent",
      reviewStatus: "reviewed",
      compatibilityTestStatus: "ok",
    },
    {
      id: "system-hi-female",
      displayName: "Hindi (female)",
      engine: "system",
      gender: "female",
      accent: "Hindi",
      languages: ["hi"],
      locale: "hi-IN",
      preset: "hi-female",
      platformAvailability: ["browser", "android", "ios"],
      offlineAvailability: "device-dependent",
      reviewStatus: "reviewed",
      compatibilityTestStatus: "hindi-only",
      notes: "Not valid for English prose. Do not select for English merely because female + Indian.",
    },
    {
      id: "system-hi-male",
      displayName: "Hindi (male)",
      engine: "system",
      gender: "male",
      accent: "Hindi",
      languages: ["hi"],
      locale: "hi-IN",
      preset: "hi-male",
      platformAvailability: ["browser", "android", "ios"],
      offlineAvailability: "device-dependent",
      reviewStatus: "reviewed",
      compatibilityTestStatus: "hindi-only",
    },
    {
      id: "system-default",
      displayName: "System default",
      engine: "system",
      gender: "unspecified",
      accent: "device",
      languages: ["en"],
      locale: "en-IN",
      preset: "default",
      platformAvailability: ["browser", "android", "ios"],
      offlineAvailability: "device-dependent",
      reviewStatus: "reviewed",
      compatibilityTestStatus: "device-dependent",
    },
  ]);

  const byId = new Map(VOICES.map(v => [v.id, v]));
  const byPreset = new Map(VOICES.map(v => [v.preset, v]));

  function get(id) {
    return byId.get(id) || null;
  }

  function fromPreset(preset) {
    const p = String(preset || "").trim();
    if (byPreset.has(p)) return byPreset.get(p);
    if (p === "female") return byPreset.get("in-en-female");
    if (p === "male") return byPreset.get("in-en-male");
    if (p === "hi") return byPreset.get("hi-female");
    if (p.startsWith("voice:")) {
      return {
        id: p,
        displayName: "Device voice",
        engine: "system",
        gender: "unspecified",
        accent: "device",
        languages: ["unknown"],
        locale: null,
        preset: p,
        reviewStatus: "device",
        compatibilityTestStatus: "unverified",
      };
    }
    return byPreset.get("in-en-female");
  }

  function supportsLanguage(voice, language) {
    if (!voice) return false;
    const lang = String(language || "").toLowerCase();
    const supported = (voice.languages || []).map(l => String(l).toLowerCase());
    if (lang === "en" || lang.startsWith("en")) return supported.includes("en");
    if (lang === "hi" || lang.startsWith("hi")) return supported.includes("hi");
    if (lang === "sa-latn" || lang === "sa-deva") {
      // Samskrta uses approved human audio or English phonetic path / dedicated processor —
      // Hindi-only voices are not automatic Samskrta engines.
      return supported.includes("en") || supported.includes("sa");
    }
    return false;
  }

  /**
   * Resolve voice for content language. Never pick Hindi-only for English.
   */
  function resolveForLanguage(preferredPreset, contentLanguage) {
    const preferred = fromPreset(preferredPreset);
    const lang = String(contentLanguage || "en");

    if (lang === "en" || lang.startsWith("en")) {
      if (supportsLanguage(preferred, "en")) {
        return { voice: preferred, locale: preferred.locale || "en-IN", ok: true };
      }
      // Hindi preset requested for English → fall back to Indian English of same gender
      const gender = preferred?.gender === "male" ? "male" : "female";
      const fallback = VOICES.find(v => v.languages.includes("en") && v.gender === gender && v.locale === "en-IN")
        || VOICES.find(v => v.languages.includes("en") && v.gender === gender);
      return {
        voice: fallback,
        locale: fallback?.locale || "en-IN",
        ok: true,
        remapped: true,
        reason: "Hindi-only voice incompatible with English frontend",
      };
    }

    if (lang === "hi-Deva" || lang === "hi" || lang.startsWith("hi")) {
      if (supportsLanguage(preferred, "hi")) {
        return { voice: preferred, locale: preferred.locale || "hi-IN", ok: true };
      }
      const gender = preferred?.gender === "male" ? "male" : "female";
      const hi = VOICES.find(v => v.languages.includes("hi") && v.gender === gender);
      return { voice: hi, locale: "hi-IN", ok: !!hi };
    }

    // Samskrta: prefer English phonetic-capable Indian English accent, not Hindi-as-language
    if (lang === "sa-Latn" || lang === "sa-Deva") {
      if (supportsLanguage(preferred, "en")) {
        return { voice: preferred, locale: preferred.locale || "en-IN", ok: true, processor: "amps-samskrta" };
      }
      const gender = preferred?.gender === "male" ? "male" : "female";
      const enIn = VOICES.find(v => v.preset === (gender === "male" ? "in-en-male" : "in-en-female"));
      return { voice: enIn, locale: "en-IN", ok: !!enIn, processor: "amps-samskrta" };
    }

    return { voice: preferred, locale: preferred?.locale || "en-IN", ok: !!preferred };
  }

  function publicUiOptions() {
    return VOICES.filter(v => v.reviewStatus === "reviewed" && v.id !== "system-default").map(v => ({
      id: v.id,
      value: v.preset,
      label: v.displayName,
      languages: v.languages.slice(),
    }));
  }

  return {
    VOICES,
    get,
    fromPreset,
    supportsLanguage,
    resolveForLanguage,
    publicUiOptions,
  };
});

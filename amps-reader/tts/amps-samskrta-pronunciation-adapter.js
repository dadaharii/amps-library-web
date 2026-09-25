/* AMPS Library — adapter over authoritative Samskrta pronunciation sources */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AmpsSamskrtaPronunciationAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const RULE_VERSION = "amps-samskrta-adapter-v1";

  const SOURCE_FILES = Object.freeze([
    "docs/roman-samskrta-pronunciation.md",
    "docs/samskrta-pronunciation-corrections.tsv",
    "docs/samskrta-pronunciation-priority.tsv",
    "docs/samskrta-pronunciation-redownload-raw.tsv",
    "docs/samskrta-pronunciation-review-priority-first.tsv",
    "docs/samskrta-pronunciation-review.md",
    "docs/samskrta-pronunciation-review.tsv",
    "docs/samskrta-pronunciation-top-500.tsv",
  ]);

  /** @type {object|null} */
  let compiled = null;

  function isApprovedStatus(status) {
    const s = String(status || "").trim().toLowerCase();
    return s === "ok" || s === "approved" || s === "accepted";
  }

  function isPendingStatus(status) {
    const s = String(status || "").trim().toLowerCase();
    return s === "" || s === "fix" || s === "pending" || s === "review";
  }

  function stripMarks(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function loadCompiled(data) {
    compiled = data || null;
    return compiled;
  }

  function getCompiled() {
    if (compiled) return compiled;
    if (root.AmpsSamskrtaCompiledLexicon) {
      compiled = root.AmpsSamskrtaCompiledLexicon;
      return compiled;
    }
    return null;
  }

  function lookupApproved(roman) {
    const pack = getCompiled();
    if (!pack?.approvedByRoman) return null;
    const exact = pack.approvedByRoman[String(roman || "").trim()];
    if (exact) return exact;
    return pack.approvedByRomanNorm?.[stripMarks(roman)] || null;
  }

  function lookupReview(roman) {
    const pack = getCompiled();
    if (!pack) return null;
    const key = String(roman || "").trim();
    const norm = stripMarks(key);
    return (
      pack.pendingByRoman?.[key]
      || pack.pendingByRomanNorm?.[norm]
      || pack.priorityByRoman?.[key]
      || pack.priorityByRomanNorm?.[norm]
      || null
    );
  }

  /**
   * Prepare Samskrta text for speech using existing AmpsSanskritTts + approved corrections only.
   */
  async function prepare(text, options) {
    const raw = String(text || "");
    const mode = options?.mode || options?.pronunciationMode || "amps-enhanced";
    const language = options?.language || ( /[\u0900-\u097F]/.test(raw) ? "sa-Deva" : "sa-Latn");

    let spoken = raw;
    const appliedApproved = [];

    // Apply only approved lexicon entries (compiled from authoritative TSVs).
    const pack = getCompiled();
    if (pack?.approvedByRoman && language === "sa-Latn") {
      spoken = spoken.replace(/([\p{L}\p{M}'’‘`]+)/gu, token => {
        const hit = lookupApproved(token);
        if (hit?.speak_as) {
          appliedApproved.push({ roman: token, speak_as: hit.speak_as, status: hit.status });
          return hit.speak_as;
        }
        return token;
      });
    }

    // Defer general phonology to existing AmpsSanskritTts — do not invent a second system.
    if (root.AmpsSanskritTts?.normalizeForSpeech) {
      spoken = await root.AmpsSanskritTts.normalizeForSpeech(spoken, mode, {
        librarySpeechMap: options?.librarySpeechMap,
      });
      if (root.AmpsSanskritTts.formatPauseForTTS) {
        spoken = root.AmpsSanskritTts.formatPauseForTTS(spoken);
      }
    } else if (root.AmpsSanskritTts?.normalizeSanskritForTTS) {
      spoken = root.AmpsSanskritTts.normalizeSanskritForTTS(spoken, mode, options || {});
    }

    const review = [];
    if (language === "sa-Latn") {
      const words = raw.match(/([\p{L}\p{M}'’‘`]+)/gu) || [];
      for (const w of words) {
        const pending = lookupReview(w);
        if (pending && isPendingStatus(pending.status)) {
          review.push({
            roman: w,
            status: pending.status || "pending",
            speak_as: pending.speak_as || "",
            source: pending.sourceFile || "",
          });
        }
      }
    }

    const blockHighPriority = !!options?.blockUnresolvedHighPriority;
    const blocked = blockHighPriority && review.some(r => r.status === "fix" && pack?.highPriorityNorm?.[stripMarks(r.roman)]);

    return {
      text: spoken,
      language,
      pronunciationFrontend: "amps-samskrta",
      adapter: RULE_VERSION,
      appliedApproved,
      reviewStatus: review,
      blocked: !!blocked,
      sources: SOURCE_FILES.slice(),
      compiledMeta: pack
        ? {
            schemaVersion: pack.schemaVersion,
            ruleVersion: pack.ruleVersion,
            generatedAt: pack.generatedAt,
            approvedCount: pack.approvedCount,
            pendingCount: pack.pendingCount,
            sourceHashes: pack.sourceHashes,
          }
        : null,
    };
  }

  function describeSources() {
    return SOURCE_FILES.map(f => {
      const name = f.split("/").pop();
      const roles = {
        "roman-samskrta-pronunciation.md": "Canonical pronunciation specification",
        "samskrta-pronunciation-corrections.tsv": "Approved or proposed correction rules",
        "samskrta-pronunciation-priority.tsv": "General review priority",
        "samskrta-pronunciation-redownload-raw.tsv": "Raw audio/source recovery queue",
        "samskrta-pronunciation-review-priority-first.tsv": "First human-review queue",
        "samskrta-pronunciation-review.md": "Human-review policy and instructions",
        "samskrta-pronunciation-review.tsv": "Review decisions and status",
        "samskrta-pronunciation-top-500.tsv": "Highest-value pronunciation coverage",
      };
      return { file: f, role: roles[name] || "authoritative input" };
    });
  }

  function meta() {
    const pack = getCompiled();
    return {
      schemaVersion: SCHEMA_VERSION,
      ruleVersion: RULE_VERSION,
      sourceFiles: SOURCE_FILES.slice(),
      compiled: !!pack,
      approvedCount: pack?.approvedCount ?? 0,
      pendingCount: pack?.pendingCount ?? 0,
      generatedAt: pack?.generatedAt || null,
    };
  }

  return {
    SCHEMA_VERSION,
    RULE_VERSION,
    SOURCE_FILES,
    isApprovedStatus,
    isPendingStatus,
    loadCompiled,
    getCompiled,
    lookupApproved,
    lookupReview,
    prepare,
    describeSources,
    meta,
    stripMarks,
  };
});

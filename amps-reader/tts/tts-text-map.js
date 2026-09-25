/* AMPS Library — processed TTS text ↔ canonical visible text mapping */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TtsTextMap = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function identityMap(canonicalText, processedText) {
    const c = String(canonicalText || "");
    const p = String(processedText != null ? processedText : c);
    if (c === p) {
      return {
        canonicalText: c,
        processedText: p,
        mappings: c.length
          ? [{ processedStart: 0, processedEnd: p.length, canonicalStart: 0, canonicalEnd: c.length }]
          : [],
      };
    }
    // Prefer proportional span map when lengths differ (abbreviation / Samskrta rewrite).
    return {
      canonicalText: c,
      processedText: p,
      mappings: [
        {
          processedStart: 0,
          processedEnd: p.length,
          canonicalStart: 0,
          canonicalEnd: c.length,
        },
      ],
    };
  }

  function mapProcessedToCanonical(map, processedIndex) {
    const idx = Math.max(0, Number(processedIndex) || 0);
    const mappings = map?.mappings || [];
    if (!mappings.length) return Math.min(idx, String(map?.canonicalText || "").length);
    for (const m of mappings) {
      if (idx >= m.processedStart && idx <= m.processedEnd) {
        const spanP = Math.max(1, m.processedEnd - m.processedStart);
        const spanC = Math.max(0, m.canonicalEnd - m.canonicalStart);
        const t = (idx - m.processedStart) / spanP;
        return Math.round(m.canonicalStart + t * spanC);
      }
    }
    const last = mappings[mappings.length - 1];
    return last.canonicalEnd;
  }

  function mapRange(map, processedStart, processedEnd) {
    return {
      canonicalStart: mapProcessedToCanonical(map, processedStart),
      canonicalEnd: mapProcessedToCanonical(map, processedEnd),
    };
  }

  return {
    identityMap,
    mapProcessedToCanonical,
    mapRange,
  };
});

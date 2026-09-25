/**
 * Speech-only normalization for comma-grouped numerals (12,000 → twelve thousand).
 * Display text is never modified — use only in the TTS pipeline.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AmpsTtsNumbers = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ONES = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen",
  ];
  const TENS = [
    "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
  ];

  const GROUPED_NUMBER_RE = /\b\d{1,3}(?:,\d{2,3})+\b/g;

  function englishBelow1000(n) {
    if (n <= 0) return "";
    if (n < 20) return ONES[n];
    if (n < 100) {
      const rest = n % 10;
      return TENS[Math.floor(n / 10)] + (rest ? " " + ONES[rest] : "");
    }
    const rest = n % 100;
    return ONES[Math.floor(n / 100)] + " hundred" + (rest ? " " + englishBelow1000(rest) : "");
  }

  function numberToEnglish(n) {
    const value = Math.floor(Number(n));
    if (!Number.isFinite(value) || value < 0) return String(n);
    if (value === 0) return "zero";
    const scales = [
      [1e12, "trillion"],
      [1e9, "billion"],
      [1e6, "million"],
      [1e3, "thousand"],
    ];
    const parts = [];
    let rest = value;
    for (const [scale, name] of scales) {
      if (rest >= scale) {
        const chunk = Math.floor(rest / scale);
        rest %= scale;
        parts.push(englishBelow1000(chunk) + " " + name);
      }
    }
    if (rest > 0) parts.push(englishBelow1000(rest));
    return parts.join(" ");
  }

  function groupedNumberToEnglish(raw) {
    const digits = String(raw || "").replace(/,/g, "");
    if (!/^\d+$/.test(digits)) return raw;
    const value = Number(digits);
    if (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER) return raw;
    return numberToEnglish(value);
  }

  function normalizeGroupedNumbers(text) {
    return String(text || "").replace(GROUPED_NUMBER_RE, groupedNumberToEnglish);
  }

  return {
    numberToEnglish,
    groupedNumberToEnglish,
    normalizeGroupedNumbers,
    GROUPED_NUMBER_RE,
  };
});

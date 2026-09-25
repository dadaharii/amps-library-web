/* AMPS Reader — chanda (meter) TTS for Samskrta shlokas */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AmpsShlokaTts = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function pauseSettings(opts) {
    const src = opts || {};
    const commaRaw = Number(src.comma);
    const commaVal = Number.isFinite(commaRaw) && commaRaw > 0 ? commaRaw : 160;
    return {
      comma: Math.max(80, Math.min(900, commaVal)),
      verseShort: Math.max(700, Math.min(2800, Number(src.verseShort) || 1300)),
      verseLong: Math.max(1000, Math.min(3600, Number(src.verseLong) || 2200)),
      beforeVerse: Math.max(600, Math.min(2600, Number(src.beforeVerse) || 1100)),
    };
  }

  function splitIndicLines(text) {
    return String(text || "")
      .split(/\n+/)
      .map(l => l.replace(/[\s|।॥.,;:]+$/g, "").trim())
      .filter(Boolean);
  }

  function splitIndicPadas(line) {
    const raw = String(line || "").trim();
    if (!raw) return [];
    if (/[|।]/.test(raw)) {
      return raw.split(/\s*[|।]\s*/).map(p => p.trim()).filter(Boolean);
    }
    const parts = raw.split(/\s*[,;]\s*/).map(p => p.trim()).filter(Boolean);
    return parts.length ? parts : [raw];
  }

  function resolveSpeakText(para, prefs, options) {
    const entry = options?.getEntry?.() || para || {};
    const p =
      entry.sanskritRoman || entry.sutraRoman || entry.devanagari ? entry : para;
    const roman = String(p.sanskritRoman || p.sutraRoman || "").trim();
    const dev = String(p.devanagari || "").trim();
    const useRoman = prefs?.roman !== false;
    const useDev = prefs?.dev === true;

    if (useRoman && roman) return roman;
    if (useDev && dev) return dev;
    if (roman) return roman;
    if (dev) return dev;
    if (options?.isRomanShloka?.(para?.text)) return String(para.text || "").trim();
    return String(para?.text || "").trim();
  }

  function chandaReadingSegments(text, pauseOpts) {
    const raw = String(text || "").replace(/<[^>]+>/g, " ").trim();
    if (!raw) return [];

    const pauses = pauseSettings(pauseOpts);
    const fmt = window.AmpsShlokaFormat;
    const padaShort = Math.round(pauses.comma * 1.15);
    const padaMid = Math.round(pauses.verseShort * 0.58);
    const padaLine = Math.round(pauses.verseShort * 0.82);
    const verseEnd = pauses.verseLong;
    const beforeVerse = Math.round(pauses.beforeVerse * 0.65);

    if (fmt?.splitRomanParts && /[A-Za-zÁĀÍĪÚŪáāíīúūḿṁṃńṇṅṋñśṣṭḍṛḷṝ]/.test(raw)) {
      const { prefix, body } = fmt.stripSutraPrefix?.(raw) || { prefix: "", body: raw };
      const parts = fmt.splitRomanParts(body);
      if (!parts.length) return [];
      let offset = 0;
      const segments = [];
      parts.forEach((seg, i) => {
        const isLast = i === parts.length - 1;
        const end = seg.end;
        let pauseAfter = Math.round(padaShort * 0.45);
        if (end === ",") pauseAfter = padaShort;
        else if (end === ";" || end === "\n") pauseAfter = padaMid;
        else if (end === ".") pauseAfter = padaLine;
        else if (isLast) pauseAfter = verseEnd;

        const chunk = (i === 0 ? prefix : "") + seg.text;
        segments.push({
          text: chunk,
          offset,
          tone: "chanda",
          rateMultiplier: 0.8,
          pitch: 0.86,
          pauseBefore: i === 0 ? beforeVerse : Math.round(padaShort * 0.35),
          pauseAfter,
        });
        offset += chunk.length + 1;
      });
      return segments;
    }

    const lines = splitIndicLines(raw);
    const segments = [];
    let offset = 0;
    lines.forEach((line, lineIdx) => {
      const padas = splitIndicPadas(line);
      padas.forEach((pada, padaIdx) => {
        const isLastPada = padaIdx === padas.length - 1;
        const isLastLine = lineIdx === lines.length - 1;
        const pauseAfter = isLastPada
          ? (isLastLine ? verseEnd : padaLine)
          : padaMid;
        segments.push({
          text: pada,
          offset,
          tone: "chanda",
          rateMultiplier: 0.8,
          pitch: 0.86,
          pauseBefore: segments.length ? Math.round(padaShort * 0.35) : beforeVerse,
          pauseAfter,
        });
        offset += pada.length + 1;
      });
    });
    return segments;
  }

  function buildStudyChandaSegments(para, prefs, settings) {
    const text = resolveSpeakText(para, prefs, { getEntry: () => para });
    const segments = chandaReadingSegments(text, null);
    const mode = settings?.shlokaStudyMode || "off";
    const rawRepeat = Number(settings?.shlokaRepeatCount);
    const repeat = Number.isFinite(rawRepeat)
      ? Math.min(20, Math.max(1, Math.round(rawRepeat)))
      : 3;

    if (mode === "repeat-line") {
      return segments.flatMap(seg => {
        const out = [];
        for (let i = 0; i < repeat; i++) {
          out.push({
            ...seg,
            pauseBefore: i ? Math.round((seg.pauseBefore || 0) + 180) : seg.pauseBefore,
            pauseAfter: Math.max(seg.pauseAfter || 0, 500),
          });
        }
        return out;
      });
    }

    if (mode === "repeat-verse") {
      const out = [];
      for (let i = 0; i < repeat; i++) {
        segments.forEach((seg, j) => {
          out.push({
            ...seg,
            pauseBefore: j === 0 && i ? 420 : seg.pauseBefore,
            pauseAfter: j === segments.length - 1 ? Math.max(seg.pauseAfter || 0, 900) : seg.pauseAfter,
          });
        });
      }
      return out;
    }

    if (mode === "slow") {
      return segments.map(seg => ({
        ...seg,
        rateMultiplier: 0.68,
        pauseAfter: Math.round((seg.pauseAfter || 0) * 1.15),
      }));
    }

    return segments;
  }

  return {
    resolveSpeakText,
    chandaReadingSegments,
    buildStudyChandaSegments,
    pauseSettings,
  };
});

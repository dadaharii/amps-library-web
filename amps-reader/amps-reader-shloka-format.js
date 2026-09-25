/* AMPS Reader — Samskrta shloka display: italic Roman + pada marks (| । ॥) */
(function () {
  "use strict";

  const DANDA = "\u0964"; // ।
  const DOUBLE_DANDA = "\u0965"; // ॥
  const PADA_PIPE = "|";

  function stripVerseMarkers(roman) {
    return String(roman || "")
      .replace(/\(\s*\d+\s*\)/g, "")
      .replace(/[^\S\n]+/g, " ")
      .trim();
  }

  function cleanRomanLine(part) {
    return String(part || "")
      .replace(/[\s|।॥.,:]+$/g, "")
      .replace(/^\[|\]$/g, "")
      .trim();
  }

  function cleanIndicLine(part) {
    return String(part || "")
      .replace(/[\s;|।॥.,]+$/g, "")
      .trim();
  }

  function splitRomanParts(roman) {
    const raw = stripVerseMarkers(roman);
    if (!raw) return [];

    const hasDelim = /[,;.\n]/.test(raw);
    if (!hasDelim) {
      const one = cleanRomanLine(raw);
      return one ? [{ text: one, end: null }] : [];
    }

    const segments = [];
    let last = 0;
    const re = /[,;.\n]/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const text = cleanRomanLine(raw.slice(last, m.index));
      if (text) segments.push({ text, end: m[0] });
      last = m.index + 1;
    }
    const tail = cleanRomanLine(raw.slice(last));
    if (tail) segments.push({ text: tail, end: null });
    return segments;
  }

  function romanMark(end, isLast) {
    if (end === ",") return PADA_PIPE;
    if (end === ";" || end === "\n") return PADA_PIPE;
    if (end === ".") return "||";
    return isLast ? "||" : PADA_PIPE;
  }

  function indicMark(end, isLast) {
    if (end === ",") return PADA_PIPE;
    if (end === ";" || end === "\n") return DANDA;
    if (end === ".") return DOUBLE_DANDA;
    return isLast ? DOUBLE_DANDA : DANDA;
  }

  function applyMarksFromSegments(segments, markFn) {
    if (!segments.length) return "";
    const lines = [];
    let padas = [];

    const flushPadas = (finalMark) => {
      if (!padas.length) return;
      let line = padas.join(" ");
      if (finalMark && !/[|।॥]$/.test(line)) line += finalMark;
      lines.push(line);
      padas = [];
    };

    segments.forEach((seg, i) => {
      const isLast = i === segments.length - 1;
      const end = seg.end;
      const mark = end ? markFn(end, isLast) : (isLast ? markFn(null, true) : "");

      if (end === ";" || end === "\n") {
        padas.push(seg.text + mark);
        flushPadas();
      } else if (end === ".") {
        padas.push(seg.text + markFn(".", true));
        flushPadas();
      } else if (end === ",") {
        padas.push(seg.text + mark);
      } else {
        padas.push(seg.text + (mark || ""));
        if (isLast) flushPadas();
      }
    });

    if (padas.length) {
      const joined = padas.join(" ");
      lines.push(/[|।॥]$/.test(joined) ? joined : joined + markFn(null, true));
    }

    return lines.join("\n");
  }

  function stripSutraPrefix(text) {
    const m = String(text || "").trim().match(/^(\d+-\d+\.\s+)([\s\S]*)$/);
    if (!m) return { prefix: "", body: String(text || "").trim() };
    return { prefix: m[1], body: m[2].trim() };
  }

  function hasPadaMarks(text) {
    return /[|।॥]$/.test(String(text || "").trim());
  }

  function formatRomanDisplay(roman) {
    const charted = scholarlyRomanToAmpsChart(roman);
    const { prefix, body } = stripSutraPrefix(charted);
    if (hasPadaMarks(body)) return prefix + body;
    const segments = splitRomanParts(body);
    if (!segments.length) return String(charted || "").trim();
    return prefix + applyMarksFromSegments(segments, romanMark);
  }

  /** Convert IAST / scholarly glyphs to AMPS chart Roman Samskrta (always). */
  function scholarlyRomanToAmpsChart(text) {
    let s = String(text || "");
    if (!s) return s;

    const N_CHART = "\u1e4b"; // ṋ — AMPS chart glyph for jñ / ñ nasal

    // jñāna → jiṋána (IAST jñ → chart jiṋ)
    s = s.replace(/j[\u00f1\u00d1]/gi, (m) => `${m[0] === "J" ? "Ji" : "ji"}${N_CHART}`);
    // Typed AMPS variants jiṋ / jin̰ → jiṋ
    s = s.replace(/jin[\u032d\u0330]/gi, (m) => `${m[0] === "J" ? "Ji" : "ji"}${N_CHART}`);
    // leftover combining ṋ / n̰ after ji already handled; bare ñ → ṋ in Latin runs
    s = s.replace(/\u00f1/g, N_CHART).replace(/\u00d1/g, "\u1e4a");
    // ñ (tilde above) from broken NFD of ñ
    s = s.replace(/n\u0303/g, N_CHART).replace(/N\u0303/g, "\u1e4a");
    // n + circumflex/tilde below → precomposed ṋ (display canonical)
    s = s.replace(/n[\u032d\u0330]/g, N_CHART).replace(/N[\u032d\u0330]/g, "\u1e4a");

    // Precomposed long vowels → chart
    s = s.replace(/\u0101/g, "a\u0301").replace(/\u0100/g, "A\u0301"); // ā Ā
    s = s.replace(/\u012b/g, "ii").replace(/\u012a/g, "Ii"); // ī Ī
    s = s.replace(/\u016b/g, "u\u0301").replace(/\u016a/g, "U\u0301"); // ū Ū
    s = s.replace(/\u1e5b/g, "r\u0301").replace(/\u1e5a/g, "R\u0301"); // ṛ
    s = s.replace(/\u1e5d/g, "rr").replace(/\u1e5c/g, "Rr"); // ṝ
    s = s.replace(/\u1e37/g, "l\u0301").replace(/\u1e39/g, "ll"); // ḷ ḹ

    // Combining macron (ā) → combining acute (á)
    s = s.replace(/([aA])\u0304/g, "$1\u0301");
    s = s.replace(/[iI]\u0304/g, (m) => (m[0] === "I" ? "Ii" : "ii"));
    s = s.replace(/([uU])\u0304/g, "$1\u0301");
    s = s.replace(/([rR])\u0304/g, "$1\u0301");

    // Retroflex / sibilants / nasals / visarga / anusvara (IAST)
    s = s.replace(/\u1e6d/g, "t\u0301").replace(/\u1e6c/g, "T\u0301"); // ṭ
    s = s.replace(/\u1e0d/g, "d\u0301").replace(/\u1e0c/g, "D\u0301"); // ḍ
    s = s.replace(/\u1e47/g, "n\u0301").replace(/\u1e46/g, "N\u0301"); // ṇ
    s = s.replace(/\u1e45/g, N_CHART).replace(/\u1e44/g, "\u1e4a"); // ṅ
    s = s.replace(/\u015b/g, "sh").replace(/\u015a/g, "Sh"); // ś
    s = s.replace(/\u1e63/g, "s\u0301").replace(/\u1e62/g, "S\u0301"); // ṣ
    s = s.replace(/\u1e25/g, "h").replace(/\u1e24/g, "H"); // ḥ
    s = s.replace(/\u1e43/g, "m\u0301").replace(/\u1e42/g, "M\u0301"); // ṃ
    s = s.replace(/\u1e41/g, "m\u0301").replace(/\u1e40/g, "M\u0301"); // ṁ
    s = s.replace(/\u1e3f/g, "m\u0301").replace(/\u1e3e/g, "M\u0301"); // ḿ

    return s;
  }

  /** Normalize Roman fields on a shloka paragraph (in place). */
  function normalizeParaRomanFields(para) {
    if (!para || typeof para !== "object") return para;
    if (para.sanskritRoman != null) {
      para.sanskritRoman = scholarlyRomanToAmpsChart(para.sanskritRoman);
    }
    if (para.wordMeaning != null) {
      para.wordMeaning = scholarlyRomanToAmpsChart(para.wordMeaning);
    }
    if (para.verseMeaning != null) {
      para.verseMeaning = scholarlyRomanToAmpsChart(para.verseMeaning);
    }
    if (para.englishMeaning != null) {
      para.englishMeaning = scholarlyRomanToAmpsChart(para.englishMeaning);
    }
    return para;
  }

  function formatIndicDisplay(text) {
    const raw = String(text || "").trim();
    if (!raw) return "";
    if (hasPadaMarks(raw)) return raw;
    const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      return lines.map((ln, i) => {
        const clean = cleanIndicLine(ln);
        return clean + (i < lines.length - 1 ? DANDA : DOUBLE_DANDA);
      }).join("\n");
    }
    const segments = splitRomanParts(raw);
    if (segments.length) return applyMarksFromSegments(segments, indicMark);
    return cleanIndicLine(raw) + DOUBLE_DANDA;
  }

  function countDiacritics(t) {
    let n = 0;
    for (const ch of String(t || "")) {
      if (/[\u0300-\u036f\u0301\u0303\u0304\u0307\u0308]/.test(ch)) n += 1;
      else if (/[áàâäãåéèêëíìîïóòôöõúùûüýÿāīūṛṝḷḹṃḥśṣṭḍṇñḻṅ]/.test(ch)) n += 1;
    }
    // Walkman / PageMaker ASCII apostrophe markers: va'co, apra'pya, A'nanda…
    n += (String(t || "").match(/[A-Za-z]'/g) || []).length;
    return n;
  }

  function hasEnglishGlue(t) {
    return /\b(and|the|is|are|was|were|together|called|means|that|this|which|with|from|into|for|not|but|one|two|three|word|subject|today)\b/i.test(t);
  }

  function isBracketTranslation(t) {
    return /^\[[^\]]+\]\.?\s*$/.test(String(t || "").trim());
  }

  function stripRomanShlokaWrappers(text) {
    return String(text || "")
      .replace(/^\(\s*\d+\s*\)\s*/, "")
      .replace(/^\d+-\d+\.\s+/, "")
      .replace(/^\[+/, "")
      .replace(/\]+\.?\s*$/, "")
      .trim();
  }

  /** Detect standalone Roman Samskrta shloka / sútra lines in discourses. */
  function isRomanShloka(text, prevText, nextText) {
    const raw = String(text || "").trim();
    // Full single-line [English gloss] — not a verse.
    if (isBracketTranslation(raw)) return false;
    // EE / discourse list numbers: "(3) Abhimánaḿ…"
    // Also strip split-bracket wrappers: "[Yato…saha." / "…kutasncana.]"
    const t = stripRomanShlokaWrappers(raw);
    if (t.length < 8 || t.length > 520) return false;
    if (/^(The |In |This |It |He |She |They |We |You |A |An |Today|Once |Some |Many |All |Every |No |Not |When |There |Pran)/i.test(t) && hasEnglishGlue(t)) return false;
    if (hasEnglishGlue(t)) return false;
    // Reject bare numbered English list items; allow verse lines after stripping "(N)"
    if (/^[\d]/.test(t) && !/^\d+-\d+\./.test(raw)) return false;

    const diac = countDiacritics(t);
    const semicolons = (t.match(/;/g) || []).length;
    const mentioned = /\bshloka\b|\bsútra\b|\bsutra\b|\bverse\b|\bcouplet\b/i.test(String(prevText || ""));
    const hasTranslationFollow = isBracketTranslation(nextText);
    const neighborLooksVerse = (other) => {
      const o = stripRomanShlokaWrappers(other);
      if (o.length < 8 || o.length > 220) return false;
      if (hasEnglishGlue(o) || isBracketTranslation(String(other || "").trim())) return false;
      const words = o.split(/\s+/).filter(Boolean);
      if (words.length > 12) return false;
      return countDiacritics(o) >= 2;
    };
    const neighborDevVerse = (other) => {
      const o = String(other || "").trim();
      return /[\u0900-\u097f]{6,}/.test(o) && /[।॥]/.test(o);
    };

    if (/^\d+-\d+\.\s+/.test(raw) && diac >= 2) return true;
    if (mentioned && diac >= 2 && (semicolons >= 1 || t.length < 220)) return true;
    if (hasTranslationFollow && diac >= 4) return true;
    if (semicolons >= 2 && diac >= 4) return true;
    if (semicolons >= 1 && diac >= 6) return true;
    if (diac >= 10 && t.length < 200 && !/\.\s+[A-Z]/.test(t)) return true;
    // Short half-verse / pada lines (often split across paragraphs in EE / Hindi exports)
    const wordCount = t.split(/\s+/).filter(Boolean).length;
    if (diac >= 2 && wordCount <= 12 && t.length < 180 && !/\.\s+[A-Z]/.test(t)) {
      if (neighborLooksVerse(prevText) || neighborLooksVerse(nextText) || neighborDevVerse(prevText) || diac >= 3) return true;
    }
    return false;
  }

  function formatLineForScript(line, kind, lineIndex, lineCount) {
    const ln = String(line || "").trim();
    if (!ln) return "";
    if (hasPadaMarks(ln)) return ln;
    if (kind === "roman") {
      return formatRomanDisplay(ln);
    }
    if (kind === "dev" || kind === "bng" || kind === "or" || kind === "pa" || kind === "kn") {
      if (lineCount > 1) {
        const clean = cleanIndicLine(ln);
        return clean + (lineIndex < lineCount - 1 ? DANDA : DOUBLE_DANDA);
      }
      return formatIndicDisplay(ln);
    }
    return ln;
  }

  window.AmpsShlokaFormat = {
    DANDA,
    DOUBLE_DANDA,
    PADA_PIPE,
    splitRomanParts,
    formatRomanDisplay,
    formatIndicDisplay,
    scholarlyRomanToAmpsChart,
    normalizeParaRomanFields,
    formatLineForScript,
    isRomanShloka,
    hasPadaMarks,
    stripSutraPrefix,
  };
})();

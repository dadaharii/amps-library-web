var RomanSamskrtaLib = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // scripts/normalize-amps-roman.js
  var require_normalize_amps_roman = __commonJS({
    "scripts/normalize-amps-roman.js"(exports, module) {
      "use strict";
      var AVAGRAHA_FROM = /[\u0092\u2018\u2019'`]/g;
      function normalizeAvagraha(text) {
        return String(text || "").replace(AVAGRAHA_FROM, "'");
      }
      function safeStripQuotes(text) {
        let s = String(text || "").replace(/\uFFFD/g, "").trim();
        s = s.replace(/^[\u201C\u201D"\u2018`]+|[\u201C\u201D"\u2018`]+$/g, "");
        return s.trim();
      }
      function fixKnownShlokaSpacing(text) {
        return String(text || "").replace(/Ara\u0301iva\b/gi, "Ara\u0301 iva").replace(/Aráiva\b/gi, "Ara\u0301 iva");
      }
      function normalizeAmpsRoman(text) {
        return fixKnownShlokaSpacing(safeStripQuotes(normalizeAvagraha(text)));
      }
      module.exports = {
        normalizeAvagraha,
        safeStripQuotes,
        fixKnownShlokaSpacing,
        normalizeAmpsRoman
      };
    }
  });

  // scripts/shloka-verse-format.js
  var require_shloka_verse_format = __commonJS({
    "scripts/shloka-verse-format.js"(exports, module) {
      "use strict";
      var DANDA = "\u0964";
      var DOUBLE_DANDA = "\u0965";
      var PADA_PIPE = "|";
      var { safeStripQuotes, normalizeAvagraha } = require_normalize_amps_roman();
      function stripQuotes(text) {
        return safeStripQuotes(text);
      }
      function stripVerseMarkers(roman) {
        return String(roman || "").replace(/\(\s*\d+\s*\)/g, "").replace(/[^\S\n]+/g, " ").trim();
      }
      function cleanRomanLine(part) {
        return String(part || "").replace(/[\s|।॥.,:]+$/g, "").replace(/^\[|\]$/g, "").trim();
      }
      function cleanIndicLine(part) {
        return String(part || "").replace(/[\s;|।॥.,]+$/g, "").trim();
      }
      function splitRomanParts(roman) {
        const raw = stripVerseMarkers(stripQuotes(normalizeAvagraha(roman)));
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
      function padaMark(end) {
        if (end === ",") return PADA_PIPE;
        if (end === ";" || end === "\n") return DANDA;
        return DOUBLE_DANDA;
      }
      function applyShlokaDandas(indicLines, segments) {
        const cleaned = indicLines.map(cleanIndicLine).filter((line, i) => line || segments[i]);
        if (!cleaned.length) return "";
        return cleaned.map((line, i) => line + padaMark(segments[i]?.end)).join("\n");
      }
      function transliterateShlokaVerse2(roman, transliteratePart) {
        const segments = splitRomanParts(roman);
        if (!segments.length) {
          return { roman: "", devanagari: "", bangla: "", oriya: "", punjabi: "", kannada: "", telugu: "", parts: [] };
        }
        const romanOut = segments.map((s) => s.text).join("\n");
        const devParts = [];
        const bngParts = [];
        const orParts = [];
        const paParts = [];
        const knParts = [];
        const teParts = [];
        segments.forEach((seg) => {
          const r = transliteratePart(seg.text);
          devParts.push(r.devanagari || "");
          bngParts.push(r.bangla || "");
          orParts.push(r.oriya || "");
          paParts.push(r.punjabi || "");
          knParts.push(r.kannada || "");
          teParts.push(r.telugu || "");
        });
        return {
          roman: romanOut,
          devanagari: applyShlokaDandas(devParts, segments),
          bangla: applyShlokaDandas(bngParts, segments),
          oriya: applyShlokaDandas(orParts, segments),
          punjabi: applyShlokaDandas(paParts, segments),
          kannada: applyShlokaDandas(knParts, segments),
          telugu: applyShlokaDandas(teParts, segments),
          parts: segments.map((s) => s.text)
        };
      }
      module.exports = {
        DANDA,
        DOUBLE_DANDA,
        PADA_PIPE,
        padaMark,
        splitRomanParts,
        applyShlokaDandas,
        transliterateShlokaVerse: transliterateShlokaVerse2,
        cleanRomanLine,
        stripQuotes,
        stripVerseMarkers
      };
    }
  });

  // scripts/prabhata-transliteration/browser-entry.ts
  var browser_entry_exports = {};
  __export(browser_entry_exports, {
    ROMAN_SAMSKRTA_RULES: () => ROMAN_SAMSKRTA_RULES,
    hasRomanSamskrtaMarks: () => hasRomanSamskrtaMarks,
    pronounceRomanSamskrtaWord: () => pronounceRomanSamskrtaWord,
    transliterate: () => transliterate,
    transliterateVerse: () => transliterateVerse
  });

  // scripts/prabhata-transliteration/rules.ts
  var COMBINING_ACUTE = "\u0301";
  var COMBINING_TILDE_BELOW = "\u0330";
  var M_WITH_ACUTE = "\u1E3F";
  var M_WITH_DOT_BELOW = "\u1E43";
  var AVAGRAHA_CHARS = /* @__PURE__ */ new Set(["'", "\u2019", "\u2018", "\x92", "`"]);

  // scripts/prabhata-transliteration/normalize.ts
  var SCHOLARLY_LONG_A = "\u0101";
  var SCHOLARLY_LONG_I = "\u012B";
  var SCHOLARLY_LONG_U = "\u016B";
  var N_WITH_CIRCUMFLEX_BELOW = "\u1E4B";
  var N_WITH_CIRCUMFLEX_BELOW_CAP = "\u1E4A";
  var COMBINING_CIRCUMFLEX_BELOW = "\u032D";
  var DOT_T = "\u1E6D";
  var DOT_D = "\u1E0D";
  var DOT_N = "\u1E47";
  function retroflexInputToChartStyle(s) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const next = s[i + 1];
      if (ch === DOT_T && next === "h") {
        out += "t" + COMBINING_ACUTE + "h";
        i++;
        continue;
      }
      if (ch === DOT_D && next === "h") {
        out += "d" + COMBINING_ACUTE + "h";
        i++;
        continue;
      }
      if (ch === DOT_T) {
        out += "t" + COMBINING_ACUTE;
        continue;
      }
      if (ch === DOT_D) {
        out += "d" + COMBINING_ACUTE;
        continue;
      }
      if (ch === DOT_N) {
        out += "n" + COMBINING_ACUTE;
        continue;
      }
      out += ch;
    }
    return out;
  }
  function normalizeAnusvaraGlyphs(s) {
    return s.replaceAll(M_WITH_DOT_BELOW, M_WITH_ACUTE).replace(/\u1e3e/g, M_WITH_ACUTE).replace(/[mM]\u0301/g, M_WITH_ACUTE);
  }
  function macronVowelsToChart(s) {
    return s.replaceAll(SCHOLARLY_LONG_A, "\xE1").replaceAll(SCHOLARLY_LONG_I, "ii").replaceAll(SCHOLARLY_LONG_U, "\xFA");
  }
  function normalizeNasalBelowVariants(s) {
    return s.replaceAll(N_WITH_CIRCUMFLEX_BELOW, "n" + COMBINING_TILDE_BELOW).replaceAll(N_WITH_CIRCUMFLEX_BELOW_CAP, "n" + COMBINING_TILDE_BELOW).replaceAll(new RegExp(`([nN])${COMBINING_CIRCUMFLEX_BELOW}`, "g"), "n" + COMBINING_TILDE_BELOW);
  }
  function normalizeAvagrahaInput(s) {
    return s.replace(/[\u0092\u2018\u2019'`]/g, "'");
  }
  function normalizeKnownPrabhataForms(s) {
    const normalizedKundri = "kun" + COMBINING_TILDE_BELOW + "\u0155ii";
    const jiNyaA = "jin" + COMBINING_TILDE_BELOW + "\xE1";
    const jiNyaAnera = jiNyaA + "nera";
    const letterBoundary = String.raw`(?<![\p{L}\p{M}])`;
    const letterBoundaryEnd = String.raw`(?![\p{L}\p{M}])`;
    return s.replace(/SUDR[\u0154\u0155]HA/gi, "sudrd" + COMBINING_ACUTE + "ha").replace(/DR[\u0154\u0155]HA/gi, "drd" + COMBINING_ACUTE + "ha").replace(/KR[\u0154\u0155](?:\u00c1|\u00e1|A\u0301|a\u0301)/g, "kr\xE1").replace(/[\u00d1\u00f1]KHI/g, "nkhi").replace(/\bku(?:n\u0330|n|\u1e4b)[\u0155\u0154]i\b/gi, normalizedKundri).replace(
      new RegExp(
        `${letterBoundary}jin(?:\\u00e1|a\\u0301|A\\u0301|\\u00c1)ner${letterBoundaryEnd}`,
        "giu"
      ),
      jiNyaAnera
    ).replace(
      new RegExp(
        `${letterBoundary}jin(?:\\u00e1|a\\u0301|A\\u0301|\\u00c1)`,
        "giu"
      ),
      jiNyaA
    ).replace(
      /jin(?:\u0330|\u032d)(\u00e1|a\u0301|\u00c1|A\u0301)/giu,
      jiNyaA
    ).replace(/A(?=ji(?:n[\u0330\u032d]))/gi, "a");
  }
  function normalizeScholarlyRomanInput(input) {
    let s = input.normalize("NFC");
    s = normalizeAvagrahaInput(s);
    s = normalizeNasalBelowVariants(s);
    s = normalizeKnownPrabhataForms(s);
    s = macronVowelsToChart(s);
    s = retroflexInputToChartStyle(s);
    s = normalizeAnusvaraGlyphs(s);
    return s;
  }

  // scripts/prabhata-transliteration/schema.ts
  var DEV_VIRAMA = "\u094D";
  var DEV_ANUSVARA = "\u0902";
  var DEV_CHANDRABINDU = "\u0901";
  var DEV_VISARGA = "\u0903";
  var DEV_AVAGRAHA = "\u093D";
  var DEV_UDATTA = "\u0951";
  var DEV_ANUDATTA = "\u0952";
  var BNG_HASANTA = "\u09CD";
  var BNG_ANUSVARA = "\u0982";
  var BNG_CHANDRABINDU = "\u0981";
  var BNG_VISARGA = "\u0983";
  var DEV_INDEP_VOWEL = {
    a: "\u0905",
    \u0101: "\u0906",
    i: "\u0907",
    \u012B: "\u0908",
    u: "\u0909",
    \u016B: "\u090A",
    \u1E5B: "\u090B",
    \u1E5D: "\u0960",
    \u1E37: "\u090C",
    \u1E39: "\u0961",
    e: "\u090F",
    ai: "\u0910",
    o: "\u0913",
    au: "\u0914"
  };
  var DEV_MATRA = {
    a: "",
    \u0101: "\u093E",
    i: "\u093F",
    \u012B: "\u0940",
    u: "\u0941",
    \u016B: "\u0942",
    \u1E5B: "\u0943",
    \u1E5D: "\u0944",
    \u1E37: "\u0962",
    \u1E39: "\u0963",
    e: "\u0947",
    ai: "\u0948",
    o: "\u094B",
    au: "\u094C"
  };
  var DEV_CONS = {
    k: "\u0915",
    kh: "\u0916",
    g: "\u0917",
    gh: "\u0918",
    \u1E45: "\u0919",
    c: "\u091A",
    ch: "\u091B",
    j: "\u091C",
    jh: "\u091D",
    \u00F1: "\u091E",
    \u1E6D: "\u091F",
    \u1E6Dh: "\u0920",
    \u1E0D: "\u0921",
    \u1E0Dh: "\u0922",
    \u1E47: "\u0923",
    t: "\u0924",
    th: "\u0925",
    d: "\u0926",
    dh: "\u0927",
    n: "\u0928",
    p: "\u092A",
    ph: "\u092B",
    b: "\u092C",
    bh: "\u092D",
    m: "\u092E",
    y: "\u092F",
    r: "\u0930",
    \u1E5B: "\u095C",
    l: "\u0932",
    v: "\u0935",
    \u015B: "\u0936",
    \u1E63: "\u0937",
    s: "\u0938",
    h: "\u0939",
    k\u1E63: "\u0915\u094D\u0937",
    j\u00F1: "\u091C\u094D\u091E"
  };
  var BNG_INDEP_VOWEL = {
    a: "\u0985",
    \u0101: "\u0986",
    i: "\u0987",
    \u012B: "\u0988",
    u: "\u0989",
    \u016B: "\u098A",
    \u1E5B: "\u098B",
    \u1E5D: "\u09E0",
    \u1E37: "\u098C",
    \u1E39: "\u09E1",
    e: "\u098F",
    ai: "\u0990",
    o: "\u0993",
    au: "\u0994"
  };
  var BNG_MATRA = {
    a: "",
    \u0101: "\u09BE",
    i: "\u09BF",
    \u012B: "\u09C0",
    u: "\u09C1",
    \u016B: "\u09C2",
    \u1E5B: "\u09C3",
    \u1E5D: "\u09C4",
    \u1E37: "\u09E2",
    \u1E39: "\u09E3",
    e: "\u09C7",
    ai: "\u09C8",
    o: "\u09CB",
    au: "\u09CC"
  };
  var BNG_CONS = {
    k: "\u0995",
    kh: "\u0996",
    g: "\u0997",
    gh: "\u0998",
    \u1E45: "\u0999",
    c: "\u099A",
    ch: "\u099B",
    j: "\u099C",
    jh: "\u099D",
    \u00F1: "\u099E",
    \u1E6D: "\u099F",
    \u1E6Dh: "\u09A0",
    \u1E0D: "\u09A1",
    \u1E0Dh: "\u09A2",
    \u1E47: "\u09A3",
    t: "\u09A4",
    th: "\u09A5",
    d: "\u09A6",
    dh: "\u09A7",
    n: "\u09A8",
    p: "\u09AA",
    ph: "\u09AB",
    b: "\u09AC",
    bh: "\u09AD",
    m: "\u09AE",
    y: "\u09AF",
    r: "\u09B0",
    \u1E5B: "\u09DC",
    l: "\u09B2",
    v: "\u09AC",
    \u015B: "\u09B6",
    \u1E63: "\u09B7",
    s: "\u09B8",
    h: "\u09B9",
    k\u1E63: "\u0995\u09CD\u09B7",
    j\u00F1: "\u099C\u09CD\u099E"
  };

  // scripts/prabhata-transliteration/indic-core.ts
  var devConfig = {
    kind: "devanagari",
    indeps: DEV_INDEP_VOWEL,
    matras: DEV_MATRA,
    cons: DEV_CONS,
    virama: DEV_VIRAMA,
    anusvara: DEV_ANUSVARA,
    chandrabindu: DEV_CHANDRABINDU,
    visarga: DEV_VISARGA,
    avagraha: DEV_AVAGRAHA
  };
  var bngConfig = {
    kind: "bangla",
    indeps: BNG_INDEP_VOWEL,
    matras: BNG_MATRA,
    cons: BNG_CONS,
    virama: BNG_HASANTA,
    anusvara: BNG_ANUSVARA,
    chandrabindu: BNG_CHANDRABINDU,
    visarga: BNG_VISARGA,
    avagraha: DEV_AVAGRAHA
  };
  function entriesSortedByStrLen(cons) {
    return Object.entries(cons).map(([id, str]) => ({ id, str })).sort((a, b) => b.str.length - a.str.length);
  }
  function sortedIndepEntries(indeps) {
    return Object.entries(indeps).filter(([, s]) => s.length > 0).map(([v, s]) => ({ v, s })).sort((a, b) => b.s.length - a.s.length);
  }
  function buildMatraMap(matras) {
    const entries = Object.entries(matras).filter(([, s]) => s.length > 0).map(([v, s]) => ({ v, s })).sort((a, b) => b.s.length - a.s.length);
    return { entries };
  }
  function matchCons(list, s, i) {
    for (const e of list) {
      if (s.startsWith(e.str, i)) return e;
    }
    return null;
  }
  function normalizeDevanagariLatinAcutes(s) {
    return s.replace(/(?<=[\u0900-\u097F])\u0301/g, (match, offset, str) => {
      const prev = str[offset - 1];
      if (prev === DEV_UDATTA || prev === DEV_ANUDATTA) return match;
      return DEV_UDATTA;
    });
  }
  function consumeVedicStressMarks(s, i) {
    let p = i;
    let marks = "";
    while (p < s.length && (s[p] === DEV_UDATTA || s[p] === DEV_ANUDATTA)) {
      marks += s[p];
      p++;
    }
    return { marks, next: p };
  }
  function flattenOnset(onset) {
    const o = [];
    for (const c of onset) {
      if (c === "k\u1E63") {
        o.push("k", "\u1E63");
      } else if (c === "j\xF1") {
        o.push("j", "\xF1");
      } else {
        o.push(c);
      }
    }
    return o;
  }
  function renderIndicSyllable(cfg, seg) {
    const { onset, vowel, anusvara, chandrabindu, visarga } = seg;
    const flat = flattenOnset(onset);
    let body;
    if (flat.length === 0) {
      body = cfg.indeps[vowel];
    } else {
      let s = "";
      for (let k = 0; k < flat.length; k++) {
        const c = flat[k];
        s += cfg.cons[c];
        if (k < flat.length - 1) s += cfg.virama;
      }
      s += cfg.matras[vowel];
      body = s;
    }
    let out = body;
    for (const cc of seg.coda ?? []) {
      out += cfg.cons[cc] + cfg.virama;
    }
    if (anusvara) out += cfg.anusvara;
    if (chandrabindu) out += cfg.chandrabindu;
    if (visarga) out += cfg.visarga;
    if (seg.vedicMarks && cfg.kind === "devanagari") out += seg.vedicMarks;
    return out;
  }
  function renderIndic(cfg, segments) {
    let out = "";
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const next = segments[i + 1];
      if (seg.k === "syllable" && seg.onset.length === 0 && seg.vowel === "u" && !seg.coda?.length && !seg.anusvara && !seg.chandrabindu && !seg.visarga && next?.k === "syllable" && next.onset.length >= 2 && next.onset[0] === "\u1E45" && (next.onset[1] === "k" || next.onset[1] === "kh" || next.onset[1] === "g" || next.onset[1] === "gh")) {
        continue;
      }
      if (seg.k === "space") out += " ";
      else if (seg.k === "avagraha") out += cfg.avagraha;
      else if (seg.k === "punct") out += seg.value;
      else out += renderIndicSyllable(cfg, seg);
    }
    return out;
  }
  function consumeCluster(cfg, list, s, i) {
    const onset = [];
    let p = i;
    while (p < s.length) {
      const m = matchCons(list, s, p);
      if (!m) break;
      onset.push(m.id);
      p += m.str.length;
      if (p < s.length && s[p] === cfg.virama) {
        p += 1;
        continue;
      }
      break;
    }
    return { onset, next: p };
  }
  function parseMods(cfg, s, i) {
    let p = i;
    let anusvara;
    let chandrabindu;
    let visarga;
    while (p < s.length) {
      if (s[p] === cfg.anusvara) {
        anusvara = true;
        p++;
        continue;
      }
      if (s[p] === cfg.chandrabindu) {
        chandrabindu = true;
        p++;
        continue;
      }
      if (s[p] === cfg.visarga) {
        visarga = true;
        p++;
        continue;
      }
      break;
    }
    return { anusvara, chandrabindu, visarga, next: p };
  }
  function consonantTableForParse(cfg) {
    if (cfg.kind !== "bangla") return cfg.cons;
    const pref = cfg.banglaBaVaPreference ?? "b";
    const t = { ...cfg.cons };
    if (pref === "b") delete t.v;
    else delete t.b;
    return t;
  }
  function parseIndic(cfg, input) {
    let s = input.normalize("NFC");
    if (cfg.kind === "devanagari") {
      s = normalizeDevanagariLatinAcutes(s);
    }
    const consList = entriesSortedByStrLen(consonantTableForParse(cfg));
    const indepList = sortedIndepEntries(cfg.indeps);
    const { entries: matraEntries } = buildMatraMap(cfg.matras);
    const out = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === "\r") {
        if (s[i + 1] === "\n") i++;
        out.push({ k: "punct", value: "\n" });
        i++;
        continue;
      }
      if (ch === "\n") {
        out.push({ k: "punct", value: "\n" });
        i++;
        continue;
      }
      if (ch === " " || ch === "	" || ch === "\f" || ch === "\v") {
        out.push({ k: "space" });
        i++;
        continue;
      }
      if (ch === cfg.avagraha) {
        out.push({ k: "avagraha" });
        i++;
        continue;
      }
      let indepHit = null;
      for (const iv of indepList) {
        if (s.startsWith(iv.s, i)) {
          indepHit = { id: iv.v, len: iv.s.length };
          break;
        }
      }
      const { onset: preCluster, next: j0 } = consumeCluster(cfg, consList, s, i);
      if (preCluster.length === 0 && indepHit) {
        let end = i + indepHit.len;
        const vm2 = consumeVedicStressMarks(s, end);
        end = vm2.next;
        const mods2 = parseMods(cfg, s, end);
        end = mods2.next;
        out.push({
          k: "syllable",
          onset: [],
          vowel: indepHit.id,
          vedicMarks: vm2.marks || void 0,
          anusvara: mods2.anusvara,
          chandrabindu: mods2.chandrabindu,
          visarga: mods2.visarga
        });
        i = end;
        continue;
      }
      if (preCluster.length === 0) {
        out.push({ k: "punct", value: ch });
        i++;
        continue;
      }
      let vowel = "a";
      let pos = j0;
      let vowLen = 0;
      for (const me of matraEntries) {
        if (s.startsWith(me.s, pos)) {
          vowel = me.v;
          vowLen = me.s.length;
          break;
        }
      }
      pos += vowLen;
      const vm = consumeVedicStressMarks(s, pos);
      pos = vm.next;
      const mods = parseMods(cfg, s, pos);
      i = mods.next;
      out.push({
        k: "syllable",
        onset: preCluster,
        vowel,
        vedicMarks: vm.marks || void 0,
        anusvara: mods.anusvara,
        chandrabindu: mods.chandrabindu,
        visarga: mods.visarga
      });
    }
    return out;
  }
  function getBanglaConfig(pre) {
    return { ...bngConfig, banglaBaVaPreference: pre?.banglaBaVa };
  }
  function parseDevanagari(s) {
    return parseIndic(devConfig, s);
  }
  function renderDevanagari(segments) {
    return renderIndic(devConfig, segments);
  }
  function parseBangla(s, opts) {
    return parseIndic(getBanglaConfig(opts), s);
  }
  function renderBangla(segments) {
    return renderIndic(bngConfig, segments);
  }

  // scripts/prabhata-transliteration/roman-custom.ts
  var VELAR_N = { k: true, kh: true, g: true, gh: true };
  function isVelarOnset(c) {
    return VELAR_N[c] === true;
  }
  var N_WITH_DOT_ABOVE = "\u1E45";
  var J_LETTER = "\xF1";
  var N_WITH_CIRCUMFLEX_BELOW_CAP2 = "\u1E4A";
  var N_WITH_CIRCUMFLEX_BELOW2 = "\u1E4B";
  var R_WITH_ACUTE = "\u0155";
  var R_WITH_ACUTE_CAP = "\u0154";
  var S_ACUTE = "\u015B";
  var S_DOT_BELOW = "\u1E63";
  var H_DOT_BELOW = "\u1E25";
  var \u1E42_CHARS = /* @__PURE__ */ new Set([M_WITH_ACUTE, "\u1E43"]);
  function startsWithVelarConsonant(s, i) {
    if (i >= s.length) return false;
    const x2 = s.slice(i, i + 2).toLowerCase();
    if (x2 === "kh" || x2 === "gh") return true;
    const x1 = s[i]?.toLowerCase();
    return x1 === "k" || x1 === "g";
  }
  function isWordBoundaryBefore(s, i) {
    if (i <= 0) return true;
    const prev = s[i - 1];
    return /[\s\r\n\t\f\v\-.,;:!?()[\]{}'"`]/.test(prev) || AVAGRAHA_CHARS.has(prev);
  }
  function cerebralAt(s, i) {
    const ch = s[i];
    if (!ch || i + 1 >= s.length || s[i + 1] !== COMBINING_ACUTE) return null;
    const b = ch.toLowerCase();
    if (b === "t") {
      if (i + 2 < s.length && s[i + 2]?.toLowerCase() === "h") return { c: "\u1E6Dh", len: 3 };
      return { c: "\u1E6D", len: 2 };
    }
    if (b === "d") {
      if (i + 2 < s.length && s[i + 2]?.toLowerCase() === "h") return { c: "\u1E0Dh", len: 3 };
      return { c: "\u1E0D", len: 2 };
    }
    if (b === "n") return { c: "\u1E47", len: 2 };
    return null;
  }
  function matchSimpleConsonant(s, i) {
    const cer = cerebralAt(s, i);
    if (cer) return cer;
    const pair = s.slice(i, i + 2).toLowerCase();
    const two = {
      kh: "kh",
      gh: "gh",
      ch: "ch",
      jh: "jh",
      th: "th",
      dh: "dh",
      ph: "ph",
      bh: "bh"
    };
    if (two[pair]) return { c: two[pair], len: 2 };
    const ch0 = s[i];
    const lo = ch0.toLowerCase();
    const one = {
      k: "k",
      g: "g",
      c: "c",
      j: "j",
      t: "t",
      d: "d",
      n: "n",
      p: "p",
      b: "b",
      m: "m",
      y: "y",
      r: "r",
      l: "l",
      v: "v",
      w: "v",
      f: "ph",
      x: "k\u1E63",
      q: "k",
      z: "j",
      h: "h"
    };
    if (ch0 === N_WITH_DOT_ABOVE) return { c: "\u1E45", len: 1 };
    if (ch0 === J_LETTER) return { c: "\xF1", len: 1 };
    if (ch0 === S_DOT_BELOW) return { c: "\u1E63", len: 1 };
    if (lo === "m" && s[i + 1] === COMBINING_ACUTE) return null;
    if (lo === "s" && s[i + 1] === COMBINING_ACUTE) return { c: "\u1E63", len: 2 };
    if (lo === "s" && s[i + 1]?.toLowerCase() === "h") return { c: "\u015B", len: 2 };
    if (ch0 === S_ACUTE) return { c: "\u1E63", len: 1 };
    if (lo === "s") return { c: "s", len: 1 };
    if (ch0 === "\u1E6D") return { c: "\u1E6D", len: 1 };
    if (ch0 === "\u1E0D") return { c: "\u1E0D", len: 1 };
    if (ch0 === "\u1E47") return { c: "\u1E47", len: 1 };
    if (ch0 === N_WITH_CIRCUMFLEX_BELOW_CAP2 || ch0 === N_WITH_CIRCUMFLEX_BELOW2) {
      if (cerebralAt(s, i + 1)) return { c: "\u1E47", len: 1 };
      if (startsWithVelarConsonant(s, i + 1)) return { c: "\u1E45", len: 1 };
      return { c: "\u1E45", len: 1 };
    }
    if (lo === "n" && startsWithVelarConsonant(s, i + 1)) return { c: "\u1E45", len: 1 };
    if (ch0 === R_WITH_ACUTE || ch0 === R_WITH_ACUTE_CAP) return { c: "\u1E5B", len: 1 };
    if (lo === "r" && s[i + 1] === COMBINING_ACUTE) return { c: "\u1E5B", len: 2 };
    if (one[lo]) return { c: one[lo], len: 1 };
    return null;
  }
  function matchKsa(s, i) {
    const x = s.slice(i, i + 2).toLowerCase();
    if (x === "k\u015B" || x === "k\u1E63") return 2;
    return null;
  }
  function startsJi\u1E4B(s, i) {
    return s[i]?.toLowerCase() === "j" && s[i + 1]?.toLowerCase() === "i" && s[i + 2] === "n" && s[i + 3] === COMBINING_TILDE_BELOW;
  }
  function startsI\u1E4B(s, i) {
    if (s[i]?.toLowerCase() !== "i" || s[i + 1] !== "n" || s[i + 2] !== COMBINING_TILDE_BELOW) return false;
    if (i > 0 && s[i - 1]?.toLowerCase() === "j") return false;
    return true;
  }
  function startsU\u1E4B(s, i) {
    return s[i]?.toLowerCase() === "u" && s[i + 1] === "n" && s[i + 2] === COMBINING_TILDE_BELOW;
  }
  function tryParseVowel(s, i) {
    if (i >= s.length) return null;
    if (s.slice(i, i + 2).toLowerCase() === "ae") return { v: "ai", len: 2 };
    if (s.slice(i, i + 2).toLowerCase() === "ao") return { v: "au", len: 2 };
    if (s.slice(i, i + 2).toLowerCase() === "ii") return { v: "\u012B", len: 2 };
    if (s.slice(i, i + 3).toLowerCase() === "lrr") return { v: "\u1E39", len: 3 };
    if (s.slice(i, i + 2).toLowerCase() === "lr") return { v: "\u1E37", len: 2 };
    if (s.slice(i, i + 2).toLowerCase() === "rr") return { v: "\u1E5D", len: 2 };
    const ch = s[i];
    const lo = ch.toLowerCase();
    if (ch === R_WITH_ACUTE || ch === R_WITH_ACUTE_CAP) return null;
    if (lo === "r" && s[i + 1] === COMBINING_ACUTE) return null;
    if (lo === "a" && s[i + 1] === COMBINING_ACUTE) return { v: "\u0101", len: 2 };
    if (lo === "u" && s[i + 1] === COMBINING_ACUTE) return { v: "\u016B", len: 2 };
    if (ch === "\xE1" || ch === "\xC1" || ch === "\u0101") return { v: "\u0101", len: 1 };
    if (ch === "\xFA" || ch === "\xDA" || ch === "\u016B") return { v: "\u016B", len: 1 };
    if (ch === "\u012B" || ch === "\u012A") return { v: "\u012B", len: 1 };
    if (lo === "a") return { v: "a", len: 1 };
    if (lo === "i") {
      if (s[i + 1] === "n" && s[i + 2] === COMBINING_TILDE_BELOW) return null;
      return { v: "i", len: 1 };
    }
    if (lo === "u") {
      if (s[i + 1] === "n" && s[i + 2] === COMBINING_TILDE_BELOW) return null;
      return { v: "u", len: 1 };
    }
    if (lo === "e") return { v: "e", len: 1 };
    if (lo === "o") return { v: "o", len: 1 };
    if (lo === "r") {
      if (i + 1 < s.length) {
        const vAfter = tryParseVowel(s, i + 1);
        if (vAfter) return null;
        if (isConsonantStart(s, i + 1)) {
          if (isWordBoundaryBefore(s, i)) return { v: "\u1E5B", len: 1 };
          return null;
        }
      }
      return { v: "\u1E5B", len: 1 };
    }
    return null;
  }
  function isConsonantStart(s, i) {
    if (startsJi\u1E4B(s, i)) return true;
    if (startsU\u1E4B(s, i)) return true;
    if (s[i] === "i" && startsI\u1E4B(s, i)) return true;
    if (matchKsa(s, i)) return true;
    return matchSimpleConsonant(s, i) !== null;
  }
  function consumeClusterFrom(s, i) {
    const cluster = [];
    let pos = i;
    while (pos < s.length) {
      if ((s[pos] === "r" || s[pos] === "R") && cluster.length > 0) {
        const afterR = pos + 1;
        const nextVowel = tryParseVowel(s, afterR);
        const nextCons = isConsonantStart(s, afterR);
        if (!nextVowel && nextCons) break;
      }
      if (startsJi\u1E4B(s, pos)) {
        cluster.push("j\xF1");
        pos += 4;
        continue;
      }
      if (startsI\u1E4B(s, pos)) {
        cluster.push("\xF1");
        pos += 3;
        continue;
      }
      if (startsU\u1E4B(s, pos)) {
        if (cluster.length > 0) break;
        const v = tryParseVowel(s, pos + 3);
        if (v && v.v === "a" && v.len === 1) break;
        cluster.push("\u1E45");
        pos += 3;
        continue;
      }
      const ks = matchKsa(s, pos);
      if (ks) {
        cluster.push("k\u1E63");
        pos += ks;
        continue;
      }
      if (s[pos] === "j" && s[pos + 1] === J_LETTER) {
        cluster.push("j\xF1");
        pos += 2;
        continue;
      }
      const m = matchSimpleConsonant(s, pos);
      if (!m) break;
      cluster.push(m.c);
      pos += m.len;
    }
    return { cluster, next: pos };
  }
  function parseModifiers(s, i) {
    let pos = i;
    let anusvara;
    let chandrabindu;
    let visarga;
    while (pos < s.length) {
      const ch = s[pos];
      if (ch.toLowerCase() === "m" && s[pos + 1] === COMBINING_ACUTE) {
        anusvara = true;
        pos += 2;
        continue;
      }
      if (\u1E42_CHARS.has(ch)) {
        anusvara = true;
        pos++;
        continue;
      }
      if (ch === H_DOT_BELOW) {
        visarga = true;
        pos++;
        continue;
      }
      if (ch === "n" && s[pos + 1] === COMBINING_TILDE_BELOW) {
        chandrabindu = true;
        pos += 2;
        continue;
      }
      if (ch.toLowerCase() === "h") {
        const after = pos + 1;
        const atBreak = after >= s.length || /[\s;.,!?।॥|:|\-]/.test(s[after]);
        const vowelFollows = after < s.length && tryParseVowel(s, after);
        if (atBreak && !vowelFollows) {
          visarga = true;
          pos++;
          continue;
        }
      }
      break;
    }
    return { anusvara, chandrabindu, visarga, next: pos };
  }
  function tryConsumeCoda(s, i) {
    if (i >= s.length) return { coda: [], next: i };
    const m = matchSimpleConsonant(s, i);
    if (!m) return { coda: [], next: i };
    const after = i + m.len;
    if (after < s.length && /[\u0300-\u036f]/.test(s[after])) return { coda: [], next: i };
    if (after < s.length) {
      if (tryParseVowel(s, after)) return { coda: [], next: i };
      if (\u1E42_CHARS.has(s[after]) || s[after] === H_DOT_BELOW) return { coda: [], next: i };
      if (s[after] === "n" && s[after + 1] === COMBINING_TILDE_BELOW) return { coda: [], next: i };
      if (isConsonantStart(s, after)) return { coda: [], next: i };
    }
    if (m.c === "h" && (after >= s.length || /[\s;.,!?।॥|:|\-]/.test(s[after]))) {
      return { coda: [], next: i };
    }
    if (m.c === "j" && startsJi\u1E4B(s, i)) {
      return { coda: [], next: i };
    }
    return { coda: [m.c], next: after };
  }
  function tryParseU\u1E4BaSyllable(s, i) {
    if (!startsU\u1E4B(s, i)) return null;
    const v = tryParseVowel(s, i + 3);
    if (!v || v.v !== "a" || v.len !== 1) return null;
    return { end: i + 3 + v.len };
  }
  function parseRomanCustom(input) {
    const s = input.normalize("NFD");
    const out = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === "\r") {
        if (s[i + 1] === "\n") i++;
        out.push({ k: "punct", value: "\n" });
        i++;
        continue;
      }
      if (ch === "\n") {
        out.push({ k: "punct", value: "\n" });
        i++;
        continue;
      }
      if (ch === " " || ch === "	" || ch === "\f" || ch === "\v") {
        out.push({ k: "space" });
        i++;
        continue;
      }
      if (AVAGRAHA_CHARS.has(ch)) {
        out.push({ k: "avagraha" });
        i++;
        continue;
      }
      if (ch.toLowerCase() === "m" && s[i + 1] === COMBINING_ACUTE) {
        const prev = out[out.length - 1];
        if (prev && prev.k === "syllable") {
          prev.anusvara = true;
          i += 2;
          continue;
        }
      }
      const u\u1E4Ba = tryParseU\u1E4BaSyllable(s, i);
      if (u\u1E4Ba) {
        let end2 = u\u1E4Ba.end;
        const mods2 = parseModifiers(s, end2);
        end2 = mods2.next;
        const cd2 = tryConsumeCoda(s, end2);
        end2 = cd2.next;
        out.push({
          k: "syllable",
          onset: ["\u1E45"],
          vowel: "a",
          coda: cd2.coda.length ? cd2.coda : void 0,
          anusvara: mods2.anusvara,
          chandrabindu: mods2.chandrabindu,
          visarga: mods2.visarga
        });
        i = end2;
        continue;
      }
      if (!startsI\u1E4B(s, i)) {
        const v0 = tryParseVowel(s, i);
        if (v0) {
          let end2 = i + v0.len;
          const mods2 = parseModifiers(s, end2);
          end2 = mods2.next;
          const cd2 = tryConsumeCoda(s, end2);
          end2 = cd2.next;
          out.push({
            k: "syllable",
            onset: [],
            vowel: v0.v,
            coda: cd2.coda.length ? cd2.coda : void 0,
            anusvara: mods2.anusvara,
            chandrabindu: mods2.chandrabindu,
            visarga: mods2.visarga
          });
          i = end2;
          continue;
        }
      }
      if (!isConsonantStart(s, i)) {
        out.push({ k: "punct", value: ch });
        i++;
        continue;
      }
      const { cluster, next } = consumeClusterFrom(s, i);
      if (cluster.length === 0) {
        out.push({ k: "punct", value: ch });
        i++;
        continue;
      }
      let v = tryParseVowel(s, next);
      if (!v && cluster.length > 0 && (s[next] === "u" || s[next] === "U") && s[next + 1] === "n" && s[next + 2] === COMBINING_TILDE_BELOW && isConsonantStart(s, next + 3)) {
        v = { v: "u", len: 1 };
      }
      if (!v && cluster.length > 0 && (s[next] === "r" || s[next] === "R")) {
        const afterR = next + 1;
        if (isConsonantStart(s, afterR) && !tryParseVowel(s, afterR)) {
          v = { v: "\u1E5B", len: 1 };
        }
      }
      const vowel = v ? v.v : "a";
      let end = v ? next + v.len : next;
      const mods = parseModifiers(s, end);
      end = mods.next;
      const cd = tryConsumeCoda(s, end);
      end = cd.next;
      out.push({
        k: "syllable",
        onset: cluster,
        vowel,
        coda: cd.coda.length ? cd.coda : void 0,
        anusvara: mods.anusvara,
        chandrabindu: mods.chandrabindu,
        visarga: mods.visarga
      });
      i = end;
    }
    return out;
  }
  function vowelToRoman(v) {
    switch (v) {
      case "a":
        return "a";
      case "\u0101":
        return "\xE1";
      case "i":
        return "i";
      case "\u012B":
        return "ii";
      case "u":
        return "u";
      case "\u016B":
        return "\xFA";
      case "\u1E5B":
        return "r";
      case "\u1E5D":
        return "rr";
      case "\u1E37":
        return "lr";
      case "\u1E39":
        return "lrr";
      case "e":
        return "e";
      case "ai":
        return "ae";
      case "o":
        return "o";
      case "au":
        return "ao";
      default:
        return "a";
    }
  }
  function onsetClusterRoman(onset, vowel) {
    const bodies = onset.map(consRomanBody);
    if (bodies.length === 1) return bodies[0] + vowelToRoman(vowel);
    return bodies.slice(0, -1).join("") + bodies[bodies.length - 1] + vowelToRoman(vowel);
  }
  function consRomanBody(c) {
    switch (c) {
      case "kh":
        return "kh";
      case "gh":
        return "gh";
      case "ch":
        return "ch";
      case "jh":
        return "jh";
      case "th":
        return "th";
      case "dh":
        return "dh";
      case "ph":
        return "ph";
      case "bh":
        return "bh";
      case "\u1E6D":
        return "t" + COMBINING_ACUTE;
      case "\u1E6Dh":
        return "t" + COMBINING_ACUTE + "h";
      case "\u1E0D":
        return "d" + COMBINING_ACUTE;
      case "\u1E0Dh":
        return "d" + COMBINING_ACUTE + "h";
      case "\u1E47":
        return "n" + COMBINING_ACUTE;
      case "\u1E5B":
        return R_WITH_ACUTE;
      case "\u015B":
        return "sh";
      case "\u1E63":
        return "s" + COMBINING_ACUTE;
      case "k\u1E63":
        return "k\u015B";
      case "j\xF1":
        return "jin" + COMBINING_TILDE_BELOW;
      default:
        return c;
    }
  }
  function renderSyllableRoman(seg) {
    const { onset, vowel, coda, anusvara, chandrabindu, visarga } = seg;
    const vn = vowelToRoman(vowel);
    let core;
    if (onset.length === 0) {
      core = vn;
    } else if (onset.length === 1 && onset[0] === "\xF1" || onset.length === 1 && onset[0] === "j\xF1") {
      if (onset[0] === "j\xF1") core = "jin" + COMBINING_TILDE_BELOW + vn;
      else core = "in" + COMBINING_TILDE_BELOW + vn;
    } else if (onset.length === 1 && onset[0] === "\u1E45") {
      core = "un" + COMBINING_TILDE_BELOW + vn;
    } else if (onset.length >= 2 && onset[0] === "\u1E45" && isVelarOnset(onset[1])) {
      core = "un" + COMBINING_TILDE_BELOW + onsetClusterRoman(onset.slice(1), vowel);
    } else {
      core = onsetClusterRoman(onset, vowel);
    }
    let s = core;
    for (const cc of coda ?? []) {
      s += consRomanBody(cc);
    }
    if (anusvara) s += M_WITH_ACUTE;
    if (chandrabindu) s += N_WITH_CIRCUMFLEX_BELOW2;
    if (visarga) s += "h";
    return s;
  }
  function segmentsToRomanCustom(segments) {
    let out = "";
    for (const seg of segments) {
      if (seg.k === "space") out += " ";
      else if (seg.k === "avagraha") out += "\u2019";
      else if (seg.k === "punct") out += seg.value;
      else {
        let syl = renderSyllableRoman(seg);
        if (out.endsWith("u") && (syl.startsWith("u" + N_WITH_CIRCUMFLEX_BELOW2) || syl.startsWith("un" + COMBINING_TILDE_BELOW))) {
          syl = syl.slice(1);
        }
        out += syl;
      }
    }
    return out.replaceAll("n" + COMBINING_TILDE_BELOW, N_WITH_CIRCUMFLEX_BELOW2);
  }

  // scripts/prabhata-transliteration/tokenizer.ts
  function fmtOnset(o) {
    return o.join("\xB7");
  }
  function segmentsToTokenRows(segments) {
    const rows = [];
    let i = 0;
    for (const seg of segments) {
      if (seg.k === "syllable") {
        const flags = [];
        if (seg.anusvara) flags.push("anusvara");
        if (seg.chandrabindu) flags.push("candrabindu");
        if (seg.visarga) flags.push("visarga");
        if (seg.vedicMarks) flags.push(`vedic:${seg.vedicMarks}`);
        rows.push({
          index: i++,
          kind: "syllable",
          onset: fmtOnset(seg.onset),
          vowel: seg.vowel,
          flags: flags.length ? flags : void 0
        });
      } else if (seg.k === "punct") {
        rows.push({ index: i++, kind: "punct", punct: seg.value });
      } else {
        rows.push({ index: i++, kind: seg.k });
      }
    }
    return rows;
  }
  function syllableCanonicalString(syl) {
    const o = syl.onset.length ? syl.onset.join("") : "\xD8";
    let x = `${o}+${syl.vowel}`;
    if (syl.coda?.length) x += `+${syl.coda.join("")}`;
    if (syl.anusvara) x += "+\u1E43";
    if (syl.chandrabindu) x += "+~";
    if (syl.visarga) x += "+\u1E25";
    if (syl.vedicMarks) x += `+${syl.vedicMarks}`;
    return x;
  }

  // scripts/prabhata-transliteration/engine.ts
  function countScript(s, re) {
    let n = 0;
    for (const ch of s) {
      if (re.test(ch)) n++;
    }
    return n;
  }
  var RE_DEV = /[\u0900-\u097F]/;
  var RE_BNG = /[\u0980-\u09FF]/;
  var RE_LATIN = /[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/;
  function detectScript(s) {
    const t = s.normalize("NFC").trim();
    if (!t) return "roman-custom";
    const d = countScript(t, RE_DEV);
    const b = countScript(t, RE_BNG);
    const l = countScript(t, RE_LATIN);
    if (d === 0 && b === 0) return "roman-custom";
    if (d >= b && d >= l * 0.3) return "devanagari";
    if (b > d) return "bangla";
    if (l > 0) return "roman-custom";
    return "devanagari";
  }
  function parseSource(text, source, opts) {
    if (source === "roman-custom") {
      let t = text;
      if (opts.acceptScholarlyRomanInput !== false) t = normalizeScholarlyRomanInput(t);
      return parseRomanCustom(t);
    }
    if (source === "devanagari") return parseDevanagari(text);
    return parseBangla(text, { banglaBaVa: opts.banglaBaVa });
  }
  function buildDebug(segments, want) {
    if (!want) return void 0;
    const lines = segmentsToTokenRows(segments).map(
      (r) => r.kind === "syllable" && r.vowel ? `${r.index}	${r.onset ?? ""}	${r.vowel}	${(r.flags ?? []).join(",")}` : `${r.index}	${r.kind}${r.punct ? "	" + r.punct : ""}`
    );
    const canon = segments.filter((s) => s.k === "syllable").map(syllableCanonicalString);
    return [...lines, "", "canonical:", ...canon].join("\n");
  }
  function transliterate(text, source, options = {}) {
    const resolved = source === "auto" ? detectScript(text) : source;
    const segments = parseSource(text, resolved, options);
    return {
      segments,
      roman: segmentsToRomanCustom(segments),
      devanagari: renderDevanagari(segments),
      bangla: renderBangla(segments),
      debug: buildDebug(segments, options.debugCanonical)
    };
  }

  // scripts/prabhata-transliteration/pronunciation.ts
  var ACUTE = "\u0301";
  var NASAL_BELOW = "\u0330";
  var NASAL_CIRCUMFLEX_BELOW = "\u032D";
  var N_WITH_CIRCUMFLEX_BELOW3 = "\u1E4B";
  var ROMAN_SAMSKRTA_MARK_RE = /[\u0301\u0330\u032dḿṁṃāáīíūúṛśṣńṇṅṋñṭḍḥḷṝŕ]/iu;
  function normalizeNasalBelowForPronunciation(s) {
    return s.replaceAll(N_WITH_CIRCUMFLEX_BELOW3, "n" + NASAL_BELOW).replaceAll(new RegExp(`([nN])${NASAL_CIRCUMFLEX_BELOW}`, "g"), "n" + NASAL_BELOW);
  }
  var ROMAN_SAMSKRTA_RULES = [
    ["Roman set", "The Sa\u1E41skrta alphabet uses 29 Roman letters; f, q, qh and z are not Sa\u1E41skrta letters."],
    ["a / a\u0301", "a as in mica; a\u0301 as in father."],
    ["i / ii", "i as in folio; ii is a prolonged i."],
    ["u / u\u0301", "u as in lute; u\u0301 is a prolonged u."],
    ["r / rr / lr / lrr", "r is the vocalic ri sound; rr is prolonged rri; lr is l+ri; lrr is l+rri."],
    ["e / ae / o / ao", "e as in cachet; ae as ai in kaiser; o as in open; ao moves from o to u."],
    ["m\u0301", "Nasalizes the preceding vowel, sometimes like ng in sung."],
    ["h", "After a vowel before a consonant, aspirates the vowel or adds a light ha sound."],
    ["Aspirates", "kh, gh, ch, jh, t\u0301h, d\u0301h, th, dh and ph expel breath."],
    ["un\u032D / in\u032D", "Nasalized wa/ya letter forms; before their matching consonant classes, n is articulated at that location."],
    ["t\u0301 / d\u0301 / n\u0301", "Cerebral t, d and n; plain t and d are dental."],
    ["d\u0301a / d\u0301ha", "In the middle or at the end of a word, pronounced r\u0301a / r\u0301ha."],
    ["y", "At the beginning of a word, like j in jump; medially, like y in you."],
    ["v", "At the beginning of a word, like v in victory; medially, like w in awaken."],
    ["sh / s\u0301", "Palatal and cerebral sh sounds."],
    ["ks\u0301", "An aspirated k or k+sh articulation."],
    ["n\u032D", "After a vowel other than i or u, nasalizes that vowel."],
    ["jin\u032Da / jin\u032Da\u0301", "gya with short a / gya with long a\u0301; after a vowel the g sound is doubled."]
  ];
  function hasRomanSamskrtaMarks(word) {
    return ROMAN_SAMSKRTA_MARK_RE.test(String(word || "").normalize("NFD"));
  }
  function replaceMedialOrFinalCerebrals(s) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]?.toLowerCase();
      if (ch === "d" && s[i + 1] === ACUTE && i > 0) {
        if (s[i + 2]?.toLowerCase() === "h") {
          out += "rh";
          i += 2;
        } else {
          out += "r";
          i += 1;
        }
        continue;
      }
      out += s[i];
    }
    return out;
  }
  function pronounceRomanSamskrtaWord(word) {
    let s = String(word || "").trim().normalize("NFD").toLowerCase();
    if (!s) return "";
    s = normalizeNasalBelowForPronunciation(s);
    s = replaceMedialOrFinalCerebrals(s);
    s = s.replace(new RegExp(`jina${ACUTE}`, "gu"), "gyaa").replace(new RegExp(`ji?n${NASAL_BELOW}a${ACUTE}`, "gu"), "gyaa").replace(new RegExp(`ji?n${NASAL_BELOW}a`, "gu"), "gya").replace(new RegExp(`i?n${NASAL_BELOW}(?=[cCjJ])`, "gu"), "n").replace(new RegExp(`u?n${NASAL_BELOW}(?=[kKgG])`, "gu"), "n").replace(new RegExp(`i?n${NASAL_BELOW}(?=[a${ACUTE}eiou])`, "gu"), "ny").replace(new RegExp(`u?n${NASAL_BELOW}(?=[a${ACUTE}eiou])`, "gu"), "w").replace(new RegExp(`n${NASAL_BELOW}`, "gu"), "n").replace(/m\u0301|ḿ|ṁ|ṃ/gu, "ng").replace(/ks\u0301|kś|kṣ/gu, "kh").replace(/s\u0301|ś|ṣ/gu, "sh").replace(/t\u0301|ṭ/gu, "t").replace(/d\u0301|ḍ/gu, "d").replace(/n\u0301|ṇ/gu, "n").replace(/a\u0301|ā|á/gu, "aa").replace(/i\u0301|ī|í/gu, "ee").replace(/u\u0301|ū|ú/gu, "oo").replace(/ae/gu, "ai").replace(/ao/gu, "au").replace(/ii/gu, "ee").replace(/lrr/gu, "l-ree").replace(/lr/gu, "l-ri").replace(/rr/gu, "rri");
    s = s.replace(/c(?!h)/gu, "ch");
    s = s.replace(/^y/gu, "j");
    s = s.replace(/(?<=.)v/gu, "w");
    return s.replace(/[ḥ]/gu, "h").replace(/[\u0300-\u036f]/gu, "").replace(/[^a-z' -]/gu, "").replace(/\s+/g, " ").trim();
  }

  // scripts/prabhata-transliteration/browser-entry.ts
  var { transliterateShlokaVerse } = require_shloka_verse_format();
  function transliterateVerse(text, options = {}) {
    const opts = { acceptScholarlyRomanInput: true, banglaBaVa: "b", ...options };
    return transliterateShlokaVerse(text, (part) => transliterate(part, "roman-custom", opts));
  }
  return __toCommonJS(browser_entry_exports);
})();

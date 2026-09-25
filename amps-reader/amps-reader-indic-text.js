/* AMPS Reader — general Hindi/Sanskrit verse and footnote recovery */
(function () {
  "use strict";

  const DEV_DIGITS = "०१२३४५६७८९";

  function devanagariNumber(value) {
    let out = "";
    for (const ch of String(value || "")) {
      const n = DEV_DIGITS.indexOf(ch);
      if (n < 0) return null;
      out += String(n);
    }
    return out ? Number(out) : null;
  }

  function fixUnicode(text) {
    return String(text || "")
      .normalize("NFC")
      // Common legacy-font/OCR decompositions of संख्या.
      .replace(/स(?:ं|ङ्)क्?चया/g, "संख्या")
      .replace(/संख्\s*या/g, "संख्या");
  }

  function isDevanagariText(text) {
    const raw = String(text || "");
    const dev = (raw.match(/[\u0900-\u097f]/g) || []).length;
    const letters = (raw.match(/[\p{L}\p{M}]/gu) || []).length;
    return dev >= 4 && dev / Math.max(letters, 1) >= 0.55;
  }

  function explicitFootnote(text) {
    const m = String(text || "").match(/^\s*([०-९]+)[.)]\s*(.+)$/s);
    if (!m) return null;
    return { num: devanagariNumber(m[1]), marker: m[1], text: m[2].trim() };
  }

  function leadingVerseRef(text) {
    const m = String(text || "").match(/^\s*([०-९]+)(?=[\u0900-\u097f])(.+)$/s);
    if (!m) return null;
    return { num: devanagariNumber(m[1]), marker: m[1], text: m[2].trim() };
  }

  // Devanagari has no \b in JS regex; match helper words only as whole words so
  // Sanskrit like "तथा" / "सारथेः" / "चाभ्युत्थान" is not mistaken for Hindi था/थे.
  const WORD_EDGE = "[\\s,;:!?।॥‘’“”\"'()\\-–—]";
  const HINDI_AUX = /है|हैं|था|थी|थे|होगा|होगी|होता|होती|होते|करते|करता|करती|करना|कहते|कहता|देखते|समझ|सकता|सकती|सकते|रहा|रही|रहे|गया|गयी|गई|गये|गए|चाहिए|चाहिये/;
  const HINDI_FUNCTION = /नहीं|भी|यह|वह|कि|ने|लिए|लिये|और|अपने|अपना|अपनी|उनके|उसके|इसके|जैसे|हुआ|हुई|हुए|बात|लोग|लोगों/;
  const POSTPOSITIONS = /के|में|पर|से|को|का|की|एक/;
  const SANSKRIT_SIGNAL = /[ःऽ]|\S:(?=\s|$)|्(?=[\s,।॥’”"']|$)|(?:स्य|न्ति|न्ते|ाम्|ानि|भ्यः|त्वा|ते|ति|नि|मि|सि|म्)(?=[\s,।॥’”"']|$)/u;

  function countWords(text, wordRe) {
    const re = new RegExp(`(?:^|${WORD_EDGE})(?:${wordRe.source})(?=${WORD_EDGE}|$)`, "gu");
    return (String(text || "").match(re) || []).length;
  }

  function looksLikeVerse(text) {
    const raw = String(text || "").trim();
    if (!isDevanagariText(raw) || raw.length > 160) return false;
    if (/^[०-९0-9]+[.)]\s/.test(raw)) return false;
    // Strip trailing quotes / brackets so "….।’’" / "….॥\"" still count as verse lines.
    const core = raw
      .replace(/^[\s“”"‘’'«»\[\(]+/u, "")
      .replace(/[\s“”"‘’'«»\]\)]+$/u, "")
      .trim();
    const hasDouble = /॥|।\s*।/.test(core);
    const hasDanda = /[।॥]/.test(core);
    if (!hasDanda) return false;
    if (/^\(?\s*(?:[०-९0-9a-zA-Zक-ह]{1,2}\s*[.)]|[०-९0-9]{1,2}\s*[।\-])/u.test(core) && !hasDouble) return false;
    if (!hasDouble && /[०-९0-9]{3,}/.test(core)) return false;
    if (!hasDouble && core.split(/\s+/).length < 2 && !(core.length >= 12 && SANSKRIT_SIGNAL.test(core))) return false;

    // Modern Hindi prose — do not treat ordinary sentences as shlokas.
    if (/^(इस|उस|किन्तु|परन्तु|इसलिए|क्योंकि|तब |तो |और |वे |तुम|तुम्ह|मैं |हम |जो |कोई |ठीक|पूर्ण|जीव|ब्रह्म प्रेम|सञ्चय|यही |वही |भारत|अधिक|मनुष्य|साधक|मोक्ष|संघर्ष|व्यष्टि|समष्टि)/u.test(core)) {
      return false;
    }
    if (/कहानी|सम्बन्ध में|पुराण में|के लिए|के ऊपर|मालूम|प्रचार|जाएगा|सुन्दर कहानी|आड़ में/u.test(core)) {
      return false;
    }
    const hindiAux = countWords(core, HINDI_AUX);
    const hindiFn = countWords(core, HINDI_FUNCTION);
    const postpositions = countWords(core, POSTPOSITIONS);
    if (!hasDouble && hindiAux >= 2) return false;
    if (!hasDouble && hindiAux >= 1 && core.length > 85) return false;
    // Short prose with है/था plus multiple postpositions (के/में/…) is not a pada.
    if (!hasDouble && hindiAux >= 1 && postpositions >= 2) return false;
    if (hasDouble && hindiAux + hindiFn + postpositions >= 3) return false;

    // Quoted classical line or double-danda closing pada
    if (/^[“"‘'«]/.test(raw) || /[”"'»’]$/.test(raw)) {
      if (hindiAux >= 1) return false;
      if (!hasDouble && (postpositions >= 2 || hindiFn >= 1)) return false;
      return true;
    }
    if (hasDouble) return true;
    // Short single-danda pada with no modern Hindi auxiliaries
    if (core.length <= 95 && hindiAux === 0 && hindiFn === 0 && postpositions <= 1) {
      return SANSKRIT_SIGNAL.test(core) || postpositions === 0 || core.length <= 45;
    }
    return false;
  }

  /** Paragraph reads as ordinary Hindi prose (used to demote mis-tagged "shloka" roles). */
  function looksLikeProse(text) {
    const raw = String(text || "").trim();
    if (!isDevanagariText(raw)) return false;
    if (looksLikeVerse(raw)) return false;
    const aux = countWords(raw, HINDI_AUX);
    const fn = countWords(raw, HINDI_FUNCTION);
    const post = countWords(raw, POSTPOSITIONS);
    const hindi = aux + fn + post;
    if (/^[“"‘]/.test(raw) && raw.length <= 70 && !/[।॥]/.test(raw.slice(0, -3))) return false;
    if (raw.length > 140) return hindi >= 2;
    if (aux >= 1 || fn >= 2 || post >= 2 || hindi >= 3) return true;
    if (/^[^\s:]{1,12}\s*:\s/u.test(raw) && hindi >= 1) return true;
    return /^\(?\s*(?:[०-९0-9]{1,2}|[क-ह])\s*[.)\-।]?\s/u.test(raw) && /[।.]\s*$/.test(raw);
  }

  function isRoleShloka(p) {
    return String(p?.displayRole || "").toLowerCase() === "shloka" && !looksLikeProse(p.text);
  }

  /**
   * Converters often tag only the opening (‘‘…) and closing (…’’ / ।।) lines of a
   * song or stanza; the short lines between them arrive as plain body text.
   */
  function fillStanzaGaps(paras) {
    const out = [];
    const isAnchor = p => looksLikeVerse(p?.text) || isRoleShloka(p);
    const opens = p => isRoleShloka(p) || /^\s*[‘“"']/.test(String(p?.text || ""));
    const closes = p => isRoleShloka(p) || /(?:[’”"']|।\s*।|॥)\s*[।]?\s*$/.test(String(p?.text || "").trim());
    const isInner = p => {
      const t = String(p?.text || "").trim();
      return t.length > 0 && t.length <= 80 && isDevanagariText(t) && !looksLikeProse(t);
    };
    for (let i = 0; i < paras.length; i += 1) {
      if (!isAnchor(paras[i]) || !opens(paras[i])) continue;
      for (let j = i + 1; j < paras.length && j - i <= 7; j += 1) {
        if (isAnchor(paras[j]) && closes(paras[j])) {
          if (j - i >= 2) for (let k = i; k <= j; k += 1) out.push(k);
          break;
        }
        if (!isInner(paras[j])) break;
      }
    }
    return out;
  }

  function normalizeChapter(ch) {
    if (!Array.isArray(ch?.paragraphs)) return ch;
    // Pack-defined edition chapters carry explicit structural roles — skip verse heuristics.
    if (ch.languagePack?.packDefinedEdition) return ch;
    ch.paragraphs.forEach(p => {
      p.text = fixUnicode(p.text);
      if (Array.isArray(p.summary)) p.summary = p.summary.map(fixUnicode);
    });
    if (Array.isArray(ch.footnotes)) ch.footnotes.forEach(f => { f.text = fixUnicode(f.text); });

    // Recover trailing footnotes exported as ordinary body paragraphs. Once an
    // explicit Devanagari-numbered footnote starts the terminal run, each
    // following terminal paragraph is the next footnote unless already typed.
    let start = -1;
    for (let i = 0; i < ch.paragraphs.length; i += 1) {
      const hit = explicitFootnote(ch.paragraphs[i].text);
      if (hit && /मन्त्रार्थ|मंत्रार्थ|अर्थ\s*[:-]/.test(hit.text)) start = i;
    }
    if (start >= 0 && ch.paragraphs.slice(start).length <= 8) {
      const body = ch.paragraphs.slice(0, start);
      const recovered = ch.paragraphs.slice(start).map((p, i) => {
        const parsed = explicitFootnote(p.text);
        const num = parsed?.num || i + 1;
        return { num, marker: parsed?.marker || DEV_DIGITS[num], text: parsed?.text || p.text, sourceParaId: p.id };
      });
      ch.paragraphs = body;
      ch.footnotes = [...(ch.footnotes || []), ...recovered];
    }

    const verseIndexes = new Set();
    let run = [];
    const commitRun = () => {
      if (run.length >= 2) run.forEach(i => verseIndexes.add(i));
      run = [];
    };
    ch.paragraphs.forEach((p, i) => {
      if (looksLikeVerse(p.text)) run.push(i);
      else commitRun();
      const prev = ch.paragraphs[i - 1];
      if (looksLikeVerse(p.text) && /मन्त्र|मंत्र|श्लोक|śloka|mantra/i.test(prev?.text || "")) verseIndexes.add(i);
    });
    commitRun();
    fillStanzaGaps(ch.paragraphs).forEach(i => verseIndexes.add(i));
    ch.paragraphs.forEach((p, i) => {
      if (/verse|shloka|mantra/i.test(p.contentType || "")) verseIndexes.add(i);
    });
    const verses = [...verseIndexes].sort((a, b) => a - b).map(i => ch.paragraphs[i]);
    const used = new Set();
    verses.forEach(p => {
      const ref = leadingVerseRef(p.text);
      if (ref) {
        p.text = ref.text;
        p.footnoteRefs = [...new Set([...(p.footnoteRefs || []), ref.num])];
        used.add(ref.num);
      }
      p.contentType = p.contentType || "verse";
    });
    const missing = (ch.footnotes || []).map((f, i) => Number(f.num || i + 1)).filter(n => !used.has(n));
    if (missing.length && verses.length) {
      const target = verses[verses.length - 1];
      target.footnoteRefs = [...new Set([...(target.footnoteRefs || []), ...missing])];
    }
    return ch;
  }

  function normalizeBook(book) {
    if (!book?.chapters?.length) return book;
    const sample = book.chapters.flatMap(ch => ch.paragraphs || []).slice(0, 40).map(p => p.text).join(" ");
    if (!isDevanagariText(sample)) return book;
    book.chapters.forEach(normalizeChapter);
    return book;
  }

  window.AmpsIndicText = { fixUnicode, looksLikeVerse, looksLikeProse, normalizeChapter, normalizeBook, devanagariNumber };
})();

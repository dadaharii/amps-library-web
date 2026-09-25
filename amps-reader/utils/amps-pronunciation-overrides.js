/**
 * AMPS special pronunciation overrides for TTS/audio only.
 *
 * Visible chapter text must never be changed here — these replacements apply
 * only to the hidden speech string passed to TTS.
 *
 * To add a new override: add a longer phrase before shorter sub-phrases.
 * Keys are matched case-insensitively; punctuation around tokens is preserved.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof root !== "undefined") {
    root.AmpsPronunciationOverrides = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this, function () {
  "use strict";

  /** Longest phrases first — order matters. */
  const PHRASE_OVERRIDES = [
    ["Shivashaktyátmakaḿ Brahma", "Shiva Shakti Aatmakam Brahma"],
    ["Shivashaktyátmakam Brahma", "Shiva Shakti Aatmakam Brahma"],
    ["Shivashaktyatmakam Brahma", "Shiva Shakti Aatmakam Brahma"],
    ["Shrii Shrii Ánandamúrti", "Shrii Shrii Aanandamoorti"],
    ["Shrii Shrii Ánandamúrti", "Shrii Shrii Aanandamoorti"],
    ["Shrii Shrii Anandamurti", "Shrii Shrii Aanandamoorti"],
    ["Ánanda Márga", "Aananda Maarga"],
    ["Ánanda Márga", "Aananda Maarga"],
    ["Ananda Marga", "Aananda Maarga"],
    ["Parama Puruśa", "Parama Purusha"],
    ["Parama Puruśa", "Parama Purusha"],
    ["Parama Purusa", "Parama Purusha"],
    ["Bhútatattva", "Bhoota tattva"],
    ["Bhútatattva", "Bhoota tattva"],
    ["Bhutatattva", "Bhoota tattva"],
    ["Ahamtattva", "Aham tattva"],
    ["Ahamatattva", "Aham tattva"],
    ["Mahattattva", "Mahat tattva"],
    ["Mahatattva", "Mahat tattva"],
    ["Brahmabháva", "Brahma bhaava"],
    ["Brahmabhava", "Brahma bhaava"],
    ["Brahmacakra", "Brahma chakra"],
    ["Shivashaktyátmakaḿ", "Shiva Shakti Aatmakam"],
    ["Shivashaktyátmakam", "Shiva Shakti Aatmakam"],
    ["Shivashaktyatmakam", "Shiva Shakti Aatmakam"],
    ["Vraja Krśńa", "Vraja Krishn"],
    ["Párthasárathi Krśńa", "Paarthasaarathi Krishn"],
    ["Párthasárathi Krśńa", "Paarthasaarathi Krishn"],
  ];

  const WORD_OVERRIDES = [
    ["Párthasárathi", "Paarthasaarathi"],
    ["Párthasarathi", "Paarthasaarathi"],
    ["Párthasaŕathii", "Paarthasaarathi"],
    ["Párthasárathi", "Paarthasaarathi"],
    ["Parthasarathi", "Paarthasaarathi"],
    ["parthasarathi", "paarthasaarathi"],
    ["prapatti", "pra pat ti"],
    ["Prapatti", "Pra pat ti"],
    ["viprapatti", "vi pra pat ti"],
    ["Viprapatti", "Vi pra pat ti"],
    ["nrtya", "nrit ya"],
    ["Nrtya", "Nrit ya"],
    ["nṛtya", "nrit ya"],
    ["nritya", "nrit ya"],
    ["Nritya", "Nrit ya"],
    ["Káraka", "kaa ra ka"],
    ["Káraka", "kaa ra ka"],
    ["Káraka", "kaa ra ka"],
    ["kāraka", "kaa ra ka"],
    ["karaka", "kaa ra ka"],
    ["Karaka", "Kaa ra ka"],
    ["pranama", "pra naam"],
    ["Pranama", "Pra naam"],
    ["prańáma", "pra naam"],
    ["Prańáma", "Pra naam"],
    ["prańama", "pra naam"],
    ["Prańama", "Pra naam"],
    ["práńáma", "pra naam"],
    ["Práńáma", "Pra naam"],
    ["indriyas", "in dri yaas"],
    ["Indriyas", "In dri yaas"],
    ["indriya", "in driya"],
    ["Indriya", "In driya"],
    ["Vraja", "vra ja"],
    ["vraja", "vra ja"],
    ["Vrája", "vra ja"],
    ["Vrája", "vra ja"],
    ["vrája", "vra ja"],
    ["vrája", "vra ja"],
    ["jiiva", "jee va"],
    ["Jiiva", "jee va"],
    ["jiva", "jee va"],
    ["Jiva", "jee va"],
    ["jiivá", "jee va"],
    ["Jiivá", "jee va"],
    ["jíiva", "jee va"],
    ["jīva", "jee va"],
    ["phalsapha", "phal sa faa"],
    ["phalsaphá", "phal sa faa"],
    ["phalsaphá", "phal sa faa"],
    ["Phalsaphá", "phal sa faa"],
    ["Phalsaphá", "phal sa faa"],
    ["Krśńa", "Krishn"],
    ["krśńa", "krishn"],
    ["Krishna", "Krishn"],
    ["krishna", "krishn"],
    ["Lokavyámohakáraka", "lok vyaa mo ha kaarak"],
    ["Lokavyámohakáraka", "lok vyaa mo ha kaarak"],
    ["Lokavyámohakárakah", "lok vyaa mo ha kaara kah"],
    ["Lokavyamohakáraka", "lok vyaa mo ha kaarak"],
    ["Lokavyamohakárakah", "lok vyaa mo ha kaara kah"],
    ["lokavyámohakárakáh", "lok vyaa mo ha kaara kaah"],
    ["Iishvara", "Eeshwar"],
    ["iishvara", "eeshwar"],
    ["Ishvara", "Eeshwar"],
    ["ishvara", "eeshwar"],
    ["Aśt́āuṋga", "ash taang"],
    ["Aśtáuṋga", "ash taang"],
    ["aśt́áuṋga", "ash taang"],
    ["aśt́auṋga", "ash taang"],
    ["aśt́áḿga", "ash taang"],
    ["Ashtanga", "ash taang"],
    ["ashtanga", "ash taang"],
    ["Sádhaná", "Saadhanaa"],
    ["Sádhaná", "Saadhanaa"],
    ["sádhaná", "Saadhanaa"],
    ["sádhaná", "Saadhanaa"],
    ["Sadhana", "Saadhanaa"],
    ["sadhana", "saadhanaa"],
    ["Puruśa", "Purusha"],
    ["Puruśa", "Purusha"],
    ["Purusa", "Purusha"],
    ["puruśa", "purusha"],
    ["Citta", "Chitta"],
    ["citta", "chitta"],
    ["Ánanda", "Aananda"],
    ["Ánanda", "Aananda"],
    ["Ananda", "Aananda"],
    ["ánanda", "aananda"],
    ["Márga", "Maarga"],
    ["Márga", "Maarga"],
    ["Marga", "Maarga"],
    ["márga", "maarga"],
    ["Máyá", "Maayaa"],
    ["Máyá", "Maayaa"],
    ["Maaya", "Maayaa"],
    ["maya", "maayaa"],
    ["Bhúta", "Bhoota"],
    ["Bhúta", "Bhoota"],
    ["Bhuta", "Bhoota"],
    ["bhúta", "bhoota"],
    ["Brahma", "Brahma"],
    ["brahma", "brahma"],
    ["Prakrti", "Prakriti"],
    ["prakrti", "prakriti"],
    ["Puruśottama", "Purushottama"],
    ["Purushottama", "Purushottama"],
    ["Saḿskrta", "Samskrta"],
    ["Saṁskrta", "Samskrta"],
    ["Samskrta", "Samskrta"],
    ["samskrta", "samskrta"],
    ["Sanskrit", "Samskrta"],
    ["sanskrit", "samskrta"],
    ["Ánandamúrti", "Aanandamoorti"],
    ["Ánandamúrti", "Aanandamoorti"],
    ["Anandamurti", "Aanandamoorti"],
    ["anandamurti", "aanandamoorti"],
  ];

  function escapeRegExp(text) {
    return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function phrasePattern(phrase) {
    const parts = String(phrase || "").trim().split(/\s+/).map(escapeRegExp);
    return new RegExp(`\\b${parts.join("\\s+")}\\b`, "giu");
  }

  function applyPhraseOverrides(text, pairs) {
    let out = String(text || "");
    (pairs || []).forEach(([from, to]) => {
      if (!from || !to) return;
      out = out.replace(phrasePattern(from), to);
    });
    return out;
  }

  function applyWordOverrides(text, pairs) {
    let out = String(text || "");
    (pairs || []).forEach(([from, to]) => {
      if (!from || !to) return;
      const re = new RegExp(`(^|[^\\p{L}\\p{M}])(${escapeRegExp(from)})(?=[^\\p{L}\\p{M}]|$)`, "giu");
      out = out.replace(re, (_, lead, _match) => `${lead}${to}`);
    });
    return out;
  }

  return {
    PHRASE_OVERRIDES,
    WORD_OVERRIDES,
    applyPhraseOverrides,
    applyWordOverrides,
    applyAmpsOverrides(text) {
      let out = String(text || "");
      out = applyPhraseOverrides(out, PHRASE_OVERRIDES);
      out = applyWordOverrides(out, WORD_OVERRIDES);
      return out;
    },
  };
});

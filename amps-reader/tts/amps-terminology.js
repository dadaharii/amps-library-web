/* AMPS Library — protected terminology (specialised terms only; not ordinary English) */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AmpsTtsTerminology = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * Curated AMPS / Saṁskrta terms only.
   * Ordinary English (practice, sake, the, …) must never appear here.
   */
  const TERMS = Object.freeze([
    {
      id: "ananda",
      canonical: "Ánanda",
      aliases: ["Ananda", "Ánanda", "Ánanda"],
      language: "sa-Latn",
      pronunciationRef: "docs/roman-samskrta-pronunciation.md",
      approvalStatus: "canonical-spec",
      source: "AMPS terminology",
    },
    {
      id: "ananda-sutram",
      canonical: "Ánanda Sútram",
      aliases: ["Ananda Sutram", "Ánanda Sútram", "Ananda Sútram"],
      language: "sa-Latn",
      pronunciationRef: "docs/roman-samskrta-pronunciation.md",
      approvalStatus: "canonical-spec",
      source: "AMPS terminology",
    },
    {
      id: "sadhana",
      canonical: "Sádhaná",
      aliases: ["Sadhana", "Sádhaná", "Sádhaná", "sádhaná"],
      language: "sa-Latn",
      pronunciationRef: "docs/samskrta-pronunciation-corrections.tsv#sádhaná",
      approvalStatus: "pending-fix",
      source: "AMPS terminology",
    },
    {
      id: "parama-purusa",
      canonical: "Parama Puruśa",
      aliases: ["Parama Purusa", "Parama Puruśa", "Parama Puruśa"],
      language: "sa-Latn",
      pronunciationRef: "docs/roman-samskrta-pronunciation.md",
      approvalStatus: "canonical-spec",
      source: "AMPS terminology",
    },
    {
      id: "brahma",
      canonical: "Brahma",
      aliases: ["Brahma", "Brahman"],
      language: "sa-Latn",
      pronunciationRef: "docs/samskrta-pronunciation-top-500.tsv#brahma",
      approvalStatus: "pending-review",
      source: "AMPS terminology",
    },
    {
      id: "shiva",
      canonical: "Shiva",
      aliases: ["Shiva", "Śiva", "Siva"],
      language: "sa-Latn",
      pronunciationRef: "docs/roman-samskrta-pronunciation.md",
      approvalStatus: "canonical-spec",
      source: "AMPS terminology",
    },
    {
      id: "shakti",
      canonical: "Shakti",
      aliases: ["Shakti", "Śakti", "Sakti"],
      language: "sa-Latn",
      pronunciationRef: "docs/roman-samskrta-pronunciation.md",
      approvalStatus: "canonical-spec",
      source: "AMPS terminology",
    },
    {
      id: "sutra",
      canonical: "sútra",
      aliases: ["sutra", "sútra", "sútra"],
      language: "sa-Latn",
      pronunciationRef: "docs/roman-samskrta-pronunciation.md",
      approvalStatus: "canonical-spec",
      source: "AMPS terminology",
    },
    {
      id: "kiirtana",
      canonical: "kiirtana",
      aliases: ["kiirtana", "kirtana", "kiirtan"],
      language: "sa-Latn",
      pronunciationRef: "docs/roman-samskrta-pronunciation.md",
      approvalStatus: "canonical-spec",
      source: "AMPS terminology",
    },
    {
      id: "dharma",
      canonical: "dharma",
      aliases: ["dharma", "Dharma"],
      language: "sa-Latn",
      pronunciationRef: "docs/samskrta-pronunciation-top-500.tsv#dharma",
      approvalStatus: "pending-review",
      source: "AMPS terminology",
    },
    {
      id: "tantra",
      canonical: "Tantra",
      aliases: ["Tantra", "tantra"],
      language: "sa-Latn",
      pronunciationRef: "docs/roman-samskrta-pronunciation.md",
      approvalStatus: "canonical-spec",
      source: "AMPS terminology",
    },
    {
      id: "prout",
      canonical: "PROUT",
      aliases: ["PROUT", "Prout"],
      language: "en",
      pronunciationRef: "amps-terminology:prout",
      approvalStatus: "canonical-spec",
      source: "AMPS terminology",
      speakAs: "prout",
    },
    {
      id: "neohumanism",
      canonical: "Neohumanism",
      aliases: ["Neohumanism", "Neo-Humanism", "neo-humanism"],
      language: "en",
      pronunciationRef: "amps-terminology:neohumanism",
      approvalStatus: "canonical-spec",
      source: "AMPS terminology",
      speakAs: "neo-humanism",
    },
    {
      id: "microvita",
      canonical: "Microvita",
      aliases: ["Microvita", "microvita", "Microvitum"],
      language: "en",
      pronunciationRef: "amps-terminology:microvita",
      approvalStatus: "canonical-spec",
      source: "AMPS terminology",
      speakAs: "micro-vita",
    },
  ]);

  const FORBIDDEN_ORDINARY_ENGLISH = Object.freeze([
    "practice", "practise", "sake", "the", "spiritual", "consciousness",
    "philosophy", "universe", "humanity", "meditation", "knowledge",
    "name", "same", "one", "were", "book", "answer",
  ]);

  function stripMarks(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  const byAlias = new Map();
  for (const term of TERMS) {
    for (const a of term.aliases) {
      byAlias.set(stripMarks(a), term);
      byAlias.set(String(a).toLowerCase(), term);
    }
  }

  function lookup(token) {
    const raw = String(token || "").trim();
    if (!raw) return null;
    const key = stripMarks(raw);
    if (FORBIDDEN_ORDINARY_ENGLISH.includes(key)) return null;
    return byAlias.get(key) || byAlias.get(raw.toLowerCase()) || null;
  }

  function assertNoOrdinaryEnglish() {
    for (const term of TERMS) {
      for (const a of term.aliases) {
        const k = stripMarks(a);
        if (FORBIDDEN_ORDINARY_ENGLISH.includes(k)) {
          throw new Error(`Ordinary English must not be in AMPS terminology: ${a}`);
        }
      }
    }
    return true;
  }

  return {
    TERMS,
    FORBIDDEN_ORDINARY_ENGLISH,
    lookup,
    assertNoOrdinaryEnglish,
    stripMarks,
  };
});

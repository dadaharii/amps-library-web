/* Presentation Builder — cross-book search + hydration */
(function () {
  "use strict";

  const SUBJECT_CHIPS = [
    { id: "all", label: "All" },
    { id: "philosophy", label: "Philosophy" },
    { id: "sadhana", label: "Sadhana" },
    { id: "devotion", label: "Devotion" },
    { id: "social", label: "Social" },
    { id: "yoga", label: "Yoga" },
  ];

  const FILTER_MAP = {
    philosophy: ["philosophy", "beginner", "tantra"],
    sadhana: ["sadhana", "tantra", "teacher"],
    devotion: ["devotion"],
    social: ["social", "neohumanism"],
    yoga: ["sadhana"],
  };

  function primarySubject(book, categorizeBook) {
    const ids = categorizeBook ? categorizeBook(book) : [];
    if (ids.includes("devotion")) return "devotion";
    if (ids.includes("social") || ids.includes("neohumanism")) return "social";
    if (ids.includes("philosophy") || ids.includes("beginner")) return "philosophy";
    if (/yoga/i.test(book.title || "") || /yoga/i.test(book.series || "")) return "yoga";
    if (ids.includes("sadhana")) return "sadhana";
    return ids[0] || "general";
  }

  function matchesSubject(subjectId, book, categorizeBook) {
    if (!subjectId || subjectId === "all") return true;
    const ids = categorizeBook ? categorizeBook(book) : [];
    const title = (book.title || "") + " " + (book.series || "");
    if (subjectId === "yoga") {
      return /yoga/i.test(title) || ids.includes("sadhana");
    }
    const allowed = FILTER_MAP[subjectId] || [subjectId];
    return ids.some(id => allowed.includes(id));
  }

  function previewLines(text, maxLines) {
    const lines = String(text || "").split(/\n+/).filter(Boolean);
    const joined = lines.slice(0, maxLines || 4).join(" ");
    if (joined.length > 320) return joined.slice(0, 317) + "…";
    return joined;
  }

  function hitKey(hit) {
    return hit.bookId + ":" + hit.paraId;
  }

  function passageDedupeKey(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function bookMeta(bookById, bookId) {
    const b = bookById?.(bookId);
    return b ? {
      seriesKey: b.seriesKey || "",
      seriesOrder: b.seriesOrder ?? 9999,
      title: b.title || "",
    } : { seriesKey: "", seriesOrder: 9999, title: "" };
  }

  /** Prefer earlier part in the same series (e.g. SS Part 1 over Part 11). */
  function preferPassageRow(kept, candidate, bookById) {
    const bk = bookMeta(bookById, kept.bookId);
    const bc = bookMeta(bookById, candidate.bookId);
    if (bk.seriesKey && bk.seriesKey === bc.seriesKey) {
      return bc.seriesOrder < bk.seriesOrder ? candidate : kept;
    }
    const keptRank = bk.seriesKey ? bk.seriesOrder : 9999;
    const candRank = bc.seriesKey ? bc.seriesOrder : 9999;
    if (candRank < keptRank) return candidate;
    return kept;
  }

  function dedupePassageRows(rows, bookById) {
    const byText = new Map();
    const out = [];
    let skipped = 0;

    for (const row of rows) {
      const key = passageDedupeKey(row.text);
      if (!key || key.length < 24) {
        out.push(row);
        continue;
      }
      const prev = byText.get(key);
      if (!prev) {
        byText.set(key, row);
        out.push(row);
        continue;
      }
      const pick = preferPassageRow(prev, row, bookById);
      if (pick !== prev) {
        const idx = out.findIndex(r => r.key === prev.key);
        if (idx >= 0) out[idx] = pick;
        byText.set(key, pick);
      }
      skipped++;
    }

    return { rows: out, skipped };
  }

  async function hydrateHit(api, hit) {
    const book = await api.loadBook(hit.bookId);
    const ch = book.chapters.find(c => c.id === hit.chapterId);
    if (!ch) return null;
    const paraIdx = ch.paragraphs.findIndex(p => p.id === hit.paraId);
    if (paraIdx < 0) return null;
    const para = ch.paragraphs[paraIdx];
    const categorize = window.AmpsFeatures?.categorizeBook;
    const subject = primarySubject(book, categorize);
    const prepared = window.AmpsPresentationContent?.preparePassageContent({
      text: para.text,
      summary: para.summary,
    }) || { text: para.text, contentBullets: [], contentText: para.text, presenterNotes: para.text };
    return {
      key: hitKey(hit),
      bookId: hit.bookId,
      bookTitle: hit.bookTitle || book.title,
      author: book.subtitle || "Shrii Shrii Anandamurti",
      chapterId: hit.chapterId,
      chapterTitle: hit.chapterTitle || ch.title,
      paraId: hit.paraId,
      text: prepared.text,
      summary: prepared.summary,
      contentBullets: prepared.contentBullets,
      contentText: prepared.contentText,
      presenterNotes: prepared.presenterNotes,
      snippet: previewLines(prepared.contentText || para.text, 4),
      pageRef: (ch.chapterNum ? ch.chapterNum + " — " : "") + ch.title + " · ¶" + (paraIdx + 1),
      pageNumber: paraIdx + 1,
      subject,
    };
  }

  async function searchPassages(api, query, subjectFilter, limit) {
    const catalog = api.state.catalog || await api.loadCatalog();
    const fastSearch = window.AmpsAdUI?.fastSearch;
    if (!fastSearch || !query?.trim()) return [];

    const raw = await fastSearch(catalog, query.trim(), limit || 60);
    const categorize = window.AmpsFeatures?.categorizeBook;
    const bookById = api.bookById || (id => catalog.books.find(b => b.id === id));
    const hydrated = [];
    const seen = new Set();

    for (const hit of raw) {
      if (hydrated.length >= (limit || 60)) break;
      const book = bookById(hit.bookId);
      if (!book) continue;
      if (!matchesSubject(subjectFilter, book, categorize)) continue;
      const key = hitKey(hit);
      if (seen.has(key)) continue;
      seen.add(key);
      const row = await hydrateHit(api, hit);
      if (row) hydrated.push(row);
    }

    const { rows, skipped } = dedupePassageRows(hydrated, bookById);
    rows._duplicatesSkipped = skipped;
    return rows;
  }

  window.AmpsPresentationSearch = {
    SUBJECT_CHIPS,
    searchPassages,
    hydrateHit,
    hitKey,
    previewLines,
    matchesSubject,
    passageDedupeKey,
    preferPassageRow,
    dedupePassageRows,
  };
})();

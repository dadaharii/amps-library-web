/* AMPS Reader — spaced repetition study */
(function () {
  "use strict";

  const SRS = {
    again: { intervalMul: 0, addMinutes: 10, easeDelta: -0.2 },
    hard: { intervalMul: 1.2, addDays: 1, easeDelta: -0.05 },
    good: { intervalMul: 1, easeDelta: 0.05, useEase: true },
    easy: { intervalMul: 1.3, addDays: 1, easeDelta: 0.15, useEase: true },
  };

  function defaultCard() {
    return { ease: 2.5, interval: 0, due: Date.now(), reps: 0, lapses: 0 };
  }

  function cardKey(bookId, pointN) {
    return bookId + "|p|" + pointN;
  }

  function ensureCards(state, book) {
    if (!book?.points) return;
    state.study.cards = state.study.cards || {};
    book.points.forEach(p => {
      const k = cardKey(book.id, p.n);
      if (!state.study.cards[k]) state.study.cards[k] = defaultCard();
    });
  }

  function dueCards(state, bookId, sectionId) {
    const now = Date.now();
    return Object.entries(state.study.cards || {})
      .filter(([k, c]) => {
        if (!k.startsWith(bookId + "|") || c.due > now) return false;
        if (!sectionId) return true;
        const pointN = +k.split("|p|")[1];
        const pt = state._studyBookPoints?.[bookId]?.[pointN];
        return !pt || pt.section === sectionId;
      })
      .map(([k]) => k);
  }

  function newCards(state, bookId, sectionId) {
    return Object.entries(state.study.cards || {})
      .filter(([k, c]) => {
        if (!k.startsWith(bookId + "|") || c.reps) return false;
        if (!sectionId) return true;
        const pointN = +k.split("|p|")[1];
        const pt = state._studyBookPoints?.[bookId]?.[pointN];
        return !pt || pt.section === sectionId;
      })
      .map(([k]) => k);
  }

  function allCards(state, bookId, sectionId) {
    return Object.keys(state.study.cards || {})
      .filter(k => {
        if (!k.startsWith(bookId + "|")) return false;
        if (!sectionId) return true;
        const pointN = +k.split("|p|")[1];
        const pt = state._studyBookPoints?.[bookId]?.[pointN];
        return !pt || pt.section === sectionId;
      });
  }

  function indexBookPoints(book) {
    const map = {};
    (book?.points || []).forEach(p => { map[p.n] = p; });
    return map;
  }

  function studyStats(state, bookId, book) {
    const now = Date.now();
    let due = 0;
    let fresh = 0;
    let mature = 0;
    let learning = 0;
    const total = book?.points?.length || 0;
    (book?.points || []).forEach(p => {
      const c = state.study.cards?.[cardKey(bookId, p.n)] || defaultCard();
      if (!c.reps) fresh += 1;
      else if (c.due <= now) due += 1;
      else if (c.interval >= 21) mature += 1;
      else learning += 1;
    });
    return { due, new: fresh, mature, learning, total };
  }

  function buildStudyQueue(state, bookId, book, opts) {
    const mode = opts?.mode || "due";
    const sectionId = opts?.sectionId || null;
    const limit = opts?.limit || 25;
    let keys;
    if (mode === "new") keys = newCards(state, bookId, sectionId);
    else if (mode === "cram") keys = allCards(state, bookId, sectionId);
    else keys = dueCards(state, bookId, sectionId);
    for (let i = keys.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    return keys.slice(0, limit);
  }

  function pointReadTarget(book, point) {
    if (!book || !point) return null;
    let count = 0;
    for (const ch of book.chapters || []) {
      if (ch.isGlossary) continue;
      for (const para of ch.paragraphs || []) {
        count += 1;
        if (count === point.n) {
          return { bookId: book.id, chapterId: ch.id, paraId: para.id };
        }
      }
    }
    return null;
  }

  function rateCard(card, rating) {
    const rule = SRS[rating] || SRS.good;
    card.ease = Math.max(1.3, (card.ease || 2.5) + (rule.easeDelta || 0));
    card.reps = (card.reps || 0) + 1;
    const now = Date.now();
    if (rating === "again") {
      card.lapses = (card.lapses || 0) + 1;
      card.interval = 0;
      card.due = now + (rule.addMinutes || 10) * 60 * 1000;
      return card;
    }
    let interval = card.interval || 0;
    if (rule.useEase) interval = Math.max(1, Math.round(interval * card.ease));
    else if (rule.intervalMul) interval = Math.max(1, Math.round(interval * rule.intervalMul));
    if (rule.addDays) interval = Math.max(interval, rule.addDays);
    if (!interval) interval = 1;
    card.interval = interval;
    card.due = now + interval * 86400000;
    return card;
  }

  function summarizeChapter(book, chapterId) {
    const ch = book.chapters.find(c => c.id === chapterId);
    if (!ch) return null;
    const bullets = ch.paragraphs
      .flatMap(p => p.summary || [])
      .filter((s, i, arr) => arr.indexOf(s) === i)
      .slice(0, 12);
    return {
      title: ch.title,
      chapterNum: ch.chapterNum,
      bullets,
      paragraphCount: ch.paragraphs.length,
      excerpt: ch.paragraphs[0]?.text?.slice(0, 280) || "",
    };
  }

  function summarizeBook(book) {
    if (!book) return null;
    return book.chapters.map(ch => ({
      id: ch.id,
      title: ch.title,
      chapterNum: ch.chapterNum,
      preview: (ch.paragraphs[0]?.summary?.[0] || ch.paragraphs[0]?.text || "").slice(0, 160),
      paraCount: ch.paragraphs.length,
    }));
  }

  window.AmpsStudy = {
    SRS,
    cardKey,
    ensureCards,
    dueCards,
    newCards,
    allCards,
    buildStudyQueue,
    studyStats,
    pointReadTarget,
    indexBookPoints,
    rateCard,
    defaultCard,
    summarizeChapter,
    summarizeBook,
  };
})();

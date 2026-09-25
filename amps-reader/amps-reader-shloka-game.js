/* AMPS Reader — Samskrta Shloka memorization (494 verses: Roman + Devanagari) */
(function () {
  "use strict";

  const BOOK_ID = "samskrta-shloka";
  const VERSES_CHAPTER = "ch-verses";
  const BATCH_SIZE = 50;

  const GAME_TYPES = {
    flashcards: {
      id: "flashcards",
      label: "Flash cards",
      icon: "🃏",
      hint: "Tap to flip — recall Roman & Devanagari, then mark Know / Still learning",
    },
    memory: {
      id: "memory",
      label: "Memory match",
      icon: "🧩",
      hint: "Match Roman cards to Devanagari pairs — classic visual memory",
    },
    quiz: {
      id: "quiz",
      label: "Quick quiz",
      icon: "⚡",
      hint: "Multiple choice on Roman, Devanagari, or verse number",
    },
    typing: {
      id: "typing",
      label: "Typing challenge",
      icon: "⌨",
      hint: "Type the Roman verse from memory — stronger active recall",
    },
    boss: {
      id: "boss",
      label: "Boss rush",
      icon: "★",
      hint: "Mixed rapid questions across number, Roman, and Devanagari",
    },
  };

  const QUIZ_MODES = {
    devanagari: { id: "devanagari", label: "Devanagari", hint: "See Roman line → pick Devanagari" },
    roman: { id: "roman", label: "Roman", hint: "See Devanagari → pick Roman line" },
    number: { id: "number", label: "Verse #", hint: "See verse → pick its number" },
  };

  function firstLine(text) {
    return String(text || "").split("\n")[0].trim();
  }

  function extractShlokas(book) {
    const ch = (book?.chapters || []).find(c => c.id === VERSES_CHAPTER);
    if (!ch) return [];
    return (ch.paragraphs || []).map((p, i) => {
      const romanFull = (p.sanskritRoman || p.text || "").trim();
      const line = firstLine(romanFull);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      return {
        id: String(i + 1),
        displayNum: `#${i + 1}`,
        chapterId: VERSES_CHAPTER,
        batchId: `b${batchNum}`,
        paraId: p.id,
        roman: line,
        romanFull,
        romanLine: line,
        devanagari: firstLine(p.devanagari),
        devanagariFull: (p.devanagari || "").trim(),
      };
    });
  }

  function chapterMeta(book) {
    const all = extractShlokas(book);
    const batches = [];
    for (let i = 0; i < all.length; i += BATCH_SIZE) {
      const n = Math.floor(i / BATCH_SIZE) + 1;
      const end = Math.min(i + BATCH_SIZE, all.length);
      batches.push({
        id: `b${n}`,
        title: `Verses ${i + 1}–${end}`,
        count: end - i,
        start: i,
      });
    }
    return [{ id: "all", title: "All 494 verses", count: all.length, start: 0 }, ...batches];
  }

  function filterPool(all, chapterId, chapters) {
    if (chapterId === "all") return all;
    const batch = chapters.find(c => c.id === chapterId);
    if (batch?.start != null) return all.slice(batch.start, batch.start + batch.count);
    return all;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pickDistractors(pool, correct, pick, key) {
    const others = shuffle(pool.filter(x => x[key] !== correct[key])).slice(0, pick);
    while (others.length < pick) others.push({ [key]: "—", id: "—" });
    return others;
  }

  function ensureGameState(state) {
    state.shlokaGame = state.shlokaGame || {
      scores: {},
      cardStats: {},
      lastChapter: "b1",
      lastGameType: "flashcards",
      lastQuizMode: "devanagari",
      lastSpeed: true,
      lastPriority: "smart",
      flashFront: "number",
    };
    state.shlokaGame.scores = state.shlokaGame.scores || {};
    state.shlokaGame.cardStats = state.shlokaGame.cardStats || {};
    return state.shlokaGame;
  }

  function cardStat(state, itemId) {
    return ensureGameState(state).cardStats[itemId] || { right: 0, wrong: 0, streak: 0, due: 0 };
  }

  function updateCardStat(state, itemId, ok) {
    const g = ensureGameState(state);
    const prev = cardStat(state, itemId);
    g.cardStats[itemId] = {
      right: prev.right + (ok ? 1 : 0),
      wrong: prev.wrong + (ok ? 0 : 1),
      streak: ok ? prev.streak + 1 : 0,
      due: ok ? Date.now() + Math.min(14, prev.streak + 1) * 86400000 : Date.now(),
      last: Date.now(),
    };
    return g.cardStats[itemId];
  }

  function priorityScore(state, itemId) {
    const s = cardStat(state, itemId);
    return s.wrong * 3 - s.right + (s.streak === 0 && s.wrong ? 2 : 0) + (s.due <= Date.now() ? 5 : 0);
  }

  function pickSessionItems(state, pool, count, priority) {
    if (!pool.length) return [];
    const n = Math.min(pool.length, Math.max(1, count));
    if (priority === "sequential") return pool.slice(0, n);
    if (priority === "random") return shuffle(pool).slice(0, n);
    const ranked = pool.slice().sort((a, b) => priorityScore(state, b.id) - priorityScore(state, a.id));
    const weakTop = ranked.slice(0, Math.ceil(n * 0.7));
    const rest = shuffle(ranked.slice(Math.ceil(n * 0.7))).slice(0, n - weakTop.length);
    return shuffle([...weakTop, ...rest]).slice(0, n);
  }

  function buildFlashDeck(state, pool, opts) {
    const count = opts.fullChapter ? pool.length : Math.min(pool.length, opts.count || 15);
    return shuffle(pickSessionItems(state, pool, count, opts.priority || "smart"));
  }

  function buildMemoryBoard(state, pool, pairCount) {
    const n = Math.min(Math.max(3, pairCount || 6), pool.length, 8);
    const picked = pickSessionItems(state, pool, n, "smart");
    const cards = [];
    picked.forEach((s, i) => {
      cards.push({
        cardId: `r-${i}`,
        sutraId: s.id,
        kind: "roman",
        text: s.romanLine,
        short: s.displayNum,
        open: false,
        matched: false,
        sutra: s,
      });
      cards.push({
        cardId: `d-${i}`,
        sutraId: s.id,
        kind: "devanagari",
        text: s.devanagari || s.id,
        short: "Dev",
        open: false,
        matched: false,
        sutra: s,
      });
    });
    return shuffle(cards);
  }

  function buildQuizQuestion(pool, mode, target) {
    const others = pool.filter(s => s.id !== target.id);
    if (mode === "number") {
      return {
        mode: "number",
        prompt: "Which verse number?",
        visual: target,
        options: shuffle([
          { label: target.displayNum, correct: true },
          ...pickDistractors(others, target, 3, "id").map(s => ({ label: s.displayNum, correct: false })),
        ]),
        answer: target.displayNum,
        target,
      };
    }
    if (mode === "devanagari") {
      return {
        mode: "devanagari",
        prompt: "Pick the Devanagari line",
        visual: { ...target, hideDev: true },
        options: shuffle([
          { label: target.devanagari || "—", correct: true, dev: true },
          ...pickDistractors(others.filter(s => s.devanagari), target, 3, "devanagari")
            .map(s => ({ label: s.devanagari, correct: false, dev: true })),
        ]),
        answer: target.devanagari,
        target,
      };
    }
    return {
      mode: "roman",
      prompt: "Pick the Roman verse",
      visual: { ...target, hideRoman: true },
      options: shuffle([
        { label: target.romanLine, correct: true },
        ...pickDistractors(others, target, 3, "romanLine").map(s => ({ label: s.romanLine, correct: false })),
      ]),
      answer: target.romanLine,
      target,
    };
  }

  function buildQuizSession(state, pool, _chapterSutras, opts) {
    const mode = opts.mode || "devanagari";
    const count = opts.fullChapter ? pool.length : Math.min(pool.length, Math.max(5, opts.count || 15));
    const picked = pickSessionItems(state, pool, count, opts.priority || "smart");
    return shuffle(picked.map(target => buildQuizQuestion(pool, mode, target)));
  }

  function recordScore(state, chapterId, correct, total, streak) {
    const g = ensureGameState(state);
    const prev = g.scores[chapterId] || { best: 0, rounds: 0, mastered: [], bestStreak: 0 };
    const pct = total ? Math.round((correct / total) * 100) : 0;
    g.scores[chapterId] = {
      best: Math.max(prev.best || 0, pct),
      bestStreak: Math.max(prev.bestStreak || 0, streak || 0),
      rounds: (prev.rounds || 0) + 1,
      lastPct: pct,
      lastAt: Date.now(),
      mastered: prev.mastered || [],
    };
    return g.scores[chapterId];
  }

  function markMastered(state, chapterId, itemId, ok) {
    const g = ensureGameState(state);
    const prev = g.scores[chapterId] || { mastered: [] };
    const set = new Set(prev.mastered || []);
    const stat = updateCardStat(state, itemId, ok);
    if (ok && stat.streak >= 2) set.add(itemId);
    else if (!ok) set.delete(itemId);
    g.scores[chapterId] = { ...prev, mastered: [...set] };
  }

  function chapterProgress(state, chapterId, total) {
    const mastered = (ensureGameState(state).scores[chapterId]?.mastered || []).length;
    return { mastered, total, pct: total ? Math.round((mastered / total) * 100) : 0 };
  }

  window.AmpsShlokaGame = {
    BOOK_ID,
    VERSES_CHAPTER,
    GAME_TYPES,
    QUIZ_MODES,
    extractShlokas,
    chapterMeta,
    filterPool,
    buildFlashDeck,
    buildMemoryBoard,
    buildQuizSession,
    ensureGameState,
    recordScore,
    markMastered,
    chapterProgress,
    shuffle,
  };
})();

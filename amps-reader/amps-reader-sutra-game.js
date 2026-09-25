/* AMPS Reader — Ánanda Sútram memorization (85 sútras: Roman + Devanagari) */
(function () {
  "use strict";

  const BOOK_ID = "ananda-sutram";
  const SUTRA_CHAPTER_IDS = ["ch2", "ch3", "ch4", "ch5", "ch6"];

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
      hint: "Multiple choice on Roman, Devanagari, number, or sequence",
    },
    typing: {
      id: "typing",
      label: "Typing challenge",
      icon: "⌨",
      hint: "Type the Roman sútra from memory — stronger active recall",
    },
    boss: {
      id: "boss",
      label: "Boss rush",
      icon: "★",
      hint: "Mixed rapid questions across number, Roman, Devanagari, order, and meaning",
    },
  };

  const QUIZ_MODES = {
    devanagari: { id: "devanagari", label: "Devanagari", hint: "See sútra number → pick Devanagari line" },
    roman: { id: "roman", label: "Roman", hint: "See number + Devanagari → pick Roman line" },
    number: { id: "number", label: "Number", hint: "See Roman + Devanagari → pick sútra number" },
    order: { id: "order", label: "Sequence", hint: "What sútra comes next?" },
    translation: { id: "translation", label: "Meaning", hint: "See sútra → pick English meaning" },
  };

  function sutraIdFromText(text) {
    const m = String(text || "").trim().match(/^(\d+-\d+)\.?\s+/);
    return m ? m[1] : null;
  }

  function isBracketTranslation(text) {
    return /^\[[^\]]+\]\.?\s*$/.test(String(text || "").trim());
  }

  function stripBrackets(text) {
    return String(text || "").replace(/^\[|\]\.?$/g, "").trim();
  }

  function extractSutras(book) {
    const out = [];
    (book?.chapters || []).forEach(ch => {
      if (!SUTRA_CHAPTER_IDS.includes(ch.id)) return;
      const paras = ch.paragraphs || [];
      paras.forEach((p, i) => {
        const id = sutraIdFromText(p.text);
        if (!id) return;
        let translation = "";
        for (let j = i + 1; j < paras.length; j += 1) {
          if (isBracketTranslation(paras[j].text)) {
            translation = stripBrackets(paras[j].text);
            break;
          }
          if (sutraIdFromText(paras[j].text)) break;
        }
        const roman = p.sutraRoman || String(p.text).replace(/^\d+-\d+\.\s+/, "").trim();
        out.push({
          id,
          chapterId: ch.id,
          chapterTitle: ch.title,
          paraId: p.id,
          roman,
          romanLine: `${id}. ${roman}`,
          devanagari: (p.devanagari || "").split("\n")[0].trim(),
          translation,
        });
      });
    });
    return out;
  }

  function chapterMeta(book) {
    const all = extractSutras(book);
    return SUTRA_CHAPTER_IDS.map(chId => {
      const ch = book.chapters.find(c => c.id === chId);
      const sutras = all.filter(s => s.chapterId === chId);
      return {
        id: chId,
        title: ch?.chapterNum ? ch.title : (ch?.title || chId),
        count: sutras.length,
      };
    }).filter(c => c.count > 0);
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
    state.sutraGame = state.sutraGame || {
      scores: {},
      cardStats: {},
      lastChapter: "ch2",
      lastGameType: "flashcards",
      lastQuizMode: "devanagari",
      lastSpeed: true,
      lastPriority: "smart",
      flashFront: "number",
    };
    state.sutraGame.scores = state.sutraGame.scores || {};
    state.sutraGame.cardStats = state.sutraGame.cardStats || {};
    return state.sutraGame;
  }

  function cardStat(state, sutraId) {
    return ensureGameState(state).cardStats[sutraId] || { right: 0, wrong: 0, streak: 0, due: 0 };
  }

  function updateCardStat(state, sutraId, ok) {
    const g = ensureGameState(state);
    const prev = cardStat(state, sutraId);
    g.cardStats[sutraId] = {
      right: prev.right + (ok ? 1 : 0),
      wrong: prev.wrong + (ok ? 0 : 1),
      streak: ok ? prev.streak + 1 : 0,
      due: ok ? Date.now() + Math.min(14, prev.streak + 1) * 86400000 : Date.now(),
      last: Date.now(),
    };
    return g.cardStats[sutraId];
  }

  function priorityScore(state, sutraId) {
    const s = cardStat(state, sutraId);
    return s.wrong * 3 - s.right + (s.streak === 0 && s.wrong ? 2 : 0) + (s.due <= Date.now() ? 5 : 0);
  }

  function pickSessionSutras(state, pool, count, priority) {
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
    const count = opts.fullChapter ? pool.length : Math.min(pool.length, opts.count || pool.length);
    const deck = pickSessionSutras(state, pool, count, opts.priority || "smart");
    return shuffle(deck);
  }

  function buildMemoryBoard(state, pool, pairCount) {
    const n = Math.min(Math.max(3, pairCount || 6), pool.length, 8);
    const picked = pickSessionSutras(state, pool, n, "smart");
    const cards = [];
    picked.forEach((s, i) => {
      cards.push({
        cardId: `r-${i}`,
        sutraId: s.id,
        kind: "roman",
        text: s.romanLine,
        short: s.id,
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

  function buildOrderQuestion(ordered, targetIdx) {
    const target = ordered[targetIdx];
    const next = ordered[targetIdx + 1];
    if (!next) return null;
    const pool = ordered.filter(s => s.id !== next.id);
    return {
      mode: "order",
      prompt: `After ${target.id}`,
      visual: target,
      sub: "",
      options: shuffle([
        { label: next.romanLine, correct: true, sutra: next },
        ...pickDistractors(pool, next, 3, "roman").map(s => ({ label: s.romanLine, correct: false, sutra: s })),
      ]),
      answer: next.romanLine,
      target: next,
    };
  }

  function buildQuizQuestion(pool, mode, target, ordered) {
    const others = pool.filter(s => s.id !== target.id);
    if (mode === "number") {
      return {
        mode: "number",
        prompt: "Which sútra number?",
        visual: target,
        sub: "",
        options: shuffle([
          { label: target.id, correct: true },
          ...pickDistractors(others, target, 3, "id").map(s => ({ label: s.id, correct: false })),
        ]),
        answer: target.id,
        target,
      };
    }
    if (mode === "devanagari") {
      return {
        mode: "devanagari",
        prompt: "Pick the Devanagari line",
        visual: { ...target, hideDev: true },
        sub: "",
        options: shuffle([
          { label: target.devanagari || "—", correct: true, dev: true },
          ...pickDistractors(others.filter(s => s.devanagari), target, 3, "devanagari")
            .map(s => ({ label: s.devanagari, correct: false, dev: true })),
        ]),
        answer: target.devanagari,
        target,
      };
    }
    if (mode === "translation" && target.translation) {
      const withTrans = others.filter(s => s.translation);
      return {
        mode: "translation",
        prompt: "Pick the English meaning",
        visual: target,
        sub: "",
        options: shuffle([
          { label: target.translation, correct: true },
          ...pickDistractors(withTrans, target, 3, "translation").map(s => ({ label: s.translation, correct: false })),
        ]),
        answer: target.translation,
        target,
      };
    }
    return {
      mode: "roman",
      prompt: "Pick the Roman sútra",
      visual: { ...target, hideRoman: true },
      sub: "",
      options: shuffle([
        { label: target.romanLine, correct: true },
        ...pickDistractors(others, target, 3, "romanLine").map(s => ({ label: s.romanLine, correct: false })),
      ]),
      answer: target.romanLine,
      target,
    };
  }

  function buildQuizSession(state, pool, chapterSutras, opts) {
    const mode = opts.mode || "devanagari";
    const count = opts.fullChapter ? pool.length : Math.min(pool.length, Math.max(5, opts.count || 15));
    const picked = pickSessionSutras(state, pool, count, opts.priority || "smart");
    const ordered = chapterSutras.slice().sort((a, b) => {
      const [ac, an] = a.id.split("-").map(Number);
      const [bc, bn] = b.id.split("-").map(Number);
      return ac - bc || an - bn;
    });
    const questions = [];
    picked.forEach(target => {
      if (mode === "order") {
        const idx = ordered.findIndex(s => s.id === target.id);
        if (idx >= 0 && idx < ordered.length - 1) {
          const q = buildOrderQuestion(ordered, idx);
          if (q) questions.push(q);
        }
        return;
      }
      if (mode === "translation" && !target.translation) return;
      questions.push(buildQuizQuestion(pool, mode, target, ordered));
    });
    return shuffle(questions);
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

  function markMastered(state, chapterId, sutraId, ok) {
    const g = ensureGameState(state);
    const prev = g.scores[chapterId] || { mastered: [] };
    const set = new Set(prev.mastered || []);
    const stat = updateCardStat(state, sutraId, ok);
    if (ok && stat.streak >= 2) set.add(sutraId);
    else if (!ok) set.delete(sutraId);
    g.scores[chapterId] = { ...prev, mastered: [...set] };
  }

  function chapterProgress(state, chapterId, total) {
    const mastered = (ensureGameState(state).scores[chapterId]?.mastered || []).length;
    return { mastered, total, pct: total ? Math.round((mastered / total) * 100) : 0 };
  }

  window.AmpsSutraGame = {
    BOOK_ID,
    SUTRA_CHAPTER_IDS,
    GAME_TYPES,
    QUIZ_MODES,
    MODES: QUIZ_MODES,
    extractSutras,
    chapterMeta,
    buildFlashDeck,
    buildMemoryBoard,
    buildQuizSession,
    ensureGameState,
    recordScore,
    markMastered,
    chapterProgress,
    cardStat,
    shuffle,
  };
})();

/* AMPS Reader — premium feature layer (paths, TTS, export, glossary, sync) */
(function () {
  "use strict";

  const NOTE_TAGS = ["philosophy", "sadhana", "discourse", "teaching", "quotation", "ethics", "devotion"];

  const LEARNING_PATHS = [
    {
      id: "beginner",
      title: "Beginner",
      desc: "Foundational introductions to Ananda Marga philosophy and conduct.",
      match: /guide to human conduct|elementary philosophy|ideology and way of life.*01|ananda sutram/i,
    },
    {
      id: "philosophy",
      title: "Philosophy",
      desc: "Core philosophical texts and systematic ideology.",
      match: /idea and ideology|philosophy in a nutshell|elementary philosophy|tattva|faculty of knowledge/i,
    },
    {
      id: "sadhana",
      title: "Sadhana & Yoga",
      desc: "Spiritual practice, yoga, and inner development.",
      match: /caryacarya|karma yoga|karma sannyasa|yoga psychology|yogic treatment|manasadhyatmika/i,
    },
    {
      id: "devotion",
      title: "Devotion",
      desc: "Bhakti, kiirtan, and devotional literature.",
      match: /namami krsna|namah shivaya|ananda vacanamrtam|babas grace/i,
    },
    {
      id: "neohumanism",
      title: "Neo-Humanism",
      desc: "Liberation of intellect and neo-humanist education.",
      match: /neohumanism|liberation of intellect|universal humanism|one human society/i,
    },
    {
      id: "social",
      title: "Social Philosophy",
      desc: "PROUT, society, economics, and civic thought.",
      match: /prout|human society|problems of the day|to the patriots|prama/i,
    },
    {
      id: "tantra",
      title: "Tantra",
      desc: "Discourses on Tantra and related spiritual science.",
      match: /discourses on tantra|tantra/i,
    },
    {
      id: "teacher",
      title: "Teacher Preparation",
      desc: "Texts for tattvikas, acaryas, and class leaders.",
      match: /general guidebook|tattvika|acarya|caryacarya|few problems solved/i,
    },
  ];

  function booksForPath(catalog, pathId) {
    const path = LEARNING_PATHS.find(p => p.id === pathId);
    if (!path || !catalog?.books) return [];
    return catalog.books.filter(b => path.match.test(b.title) || path.match.test(b.series || ""));
  }

  function categorizeBook(book) {
    const paths = LEARNING_PATHS.filter(p => p.match.test(book.title) || p.match.test(book.series || ""));
    return paths.map(p => p.id);
  }

  function wordCount(text) {
    return String(text || "").split(/\s+/).filter(Boolean).length;
  }

  function readingTimeMinutes(words, wpm) {
    return Math.max(1, Math.ceil(words / (wpm || 200)));
  }

  function bookProgress(book, progress) {
    const chId = progress?.chapterId;
    if (!chId) return { pct: 0, chapterIdx: 0, total: 0 };
    const chapters = (book?.chapters || []).filter(c => c?.id);
    if (chapters.length) {
      const idx = chapters.findIndex(c => c.id === chId);
      const chapterIdx = idx >= 0 ? idx : 0;
      const pct = Math.round((chapterIdx / chapters.length) * 100);
      return { pct, chapterIdx, total: chapters.length };
    }
    const m = String(chId).match(/(\d+)/);
    const chNum = m ? parseInt(m[1], 10) : 0;
    const total = book?.chapterCount || 1;
    const chapterIdx = Math.max(0, chNum - 1);
    const pct = chNum ? Math.min(100, Math.round((chNum / total) * 100)) : 0;
    return { pct, chapterIdx, total };
  }

  function chapterStats(chapter, scrollPct) {
    const words = chapter.paragraphs.reduce((n, p) => n + wordCount(p.text), 0);
    const totalMin = readingTimeMinutes(words);
    const remainMin = readingTimeMinutes(words * (1 - (scrollPct || 0) / 100));
    return { words, totalMin, remainMin };
  }

  function quoteOfTheDay(catalog) {
    const discourses = catalog?.discourses || [];
    if (!discourses.length) return null;
    const day = new Date().toISOString().slice(0, 10);
    let hash = 0;
    for (let i = 0; i < day.length; i++) hash = (hash * 31 + day.charCodeAt(i)) | 0;
    const d = discourses[Math.abs(hash) % discourses.length];
    return d;
  }

  function lookupGlossary(term, book, allBooks) {
    const t = String(term || "").trim().toLowerCase();
    if (!t || t.length < 2) return [];
    const hits = [];
    const scan = (glossary, bookTitle, bookId) => {
      (glossary || []).forEach(g => {
        if (g.term.toLowerCase().includes(t) || t.includes(g.term.toLowerCase().slice(0, 4))) {
          hits.push({ ...g, bookTitle, bookId });
        }
      });
    };
    if (book) scan(book.glossary, book.title, book.id);
    return hits.slice(0, 12);
  }

  function exportLibrary(state, catalog) {
    const lines = ["AMPS Reader Export", new Date().toISOString(), ""];
    lines.push("=== HIGHLIGHTS ===");
    state.highlights.forEach(h => {
      const b = catalog?.books?.find(x => x.id === h.bookId);
      lines.push(`[${h.color}] ${b?.title || h.bookId} / ${h.chapterId}`);
      lines.push(`"${h.text}"`);
      lines.push("");
    });
    lines.push("=== NOTES ===");
    state.notes.forEach(n => {
      const b = catalog?.books?.find(x => x.id === n.bookId);
      lines.push(`${b?.title || n.bookId} · ${n.tags?.join(", ") || "note"}`);
      if (n.quote) lines.push(`> ${n.quote}`);
      lines.push(n.body);
      lines.push("");
    });
    lines.push("=== JOURNAL ===");
    (state.journal || []).forEach(j => {
      lines.push(`${new Date(j.created).toLocaleString()}`);
      lines.push(j.body);
      lines.push("");
    });
    return lines.join("\n");
  }

  function exportJson(state) {
    return JSON.stringify({
      version: 2,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      progress: state.progress,
      highlights: state.highlights,
      notes: state.notes,
      bookmarks: state.bookmarks,
      favorites: state.favorites,
      journal: state.journal,
      vocabulary: state.vocabulary,
      study: { cards: state.study.cards },
    }, null, 2);
  }

  function importJson(state, json) {
    const data = typeof json === "string" ? JSON.parse(json) : json;
    if (data.settings) Object.assign(state.settings, data.settings);
    if (data.progress) state.progress = data.progress;
    if (data.highlights) state.highlights = data.highlights;
    if (data.notes) state.notes = data.notes;
    if (data.bookmarks) state.bookmarks = data.bookmarks;
    if (data.favorites) state.favorites = data.favorites;
    if (data.journal) state.journal = data.journal;
    if (data.vocabulary) state.vocabulary = data.vocabulary;
    if (data.study?.cards) state.study.cards = data.study.cards;
    return true;
  }

  const TTS = {
    synth: window.speechSynthesis,
    utterance: null,
    timer: null,
    paragraphs: [],
    idx: 0,
    playing: false,

    speak(text, opts) {
      this.stop();
      if (!this.synth) return false;
      const u = new SpeechSynthesisUtterance(text);
      u.rate = opts?.rate || 1;
      u.onend = () => { if (opts?.onEnd) opts.onEnd(); };
      this.utterance = u;
      this.synth.speak(u);
      this.playing = true;
      return true;
    },

    speakParagraphs(paras, rate, onParaChange) {
      this.paragraphs = paras;
      this.idx = 0;
      this.rate = rate || 1;
      this.onParaChange = onParaChange;
      this._next();
    },

    _next() {
      if (this.idx >= this.paragraphs.length) {
        this.playing = false;
        return;
      }
      const text = this.paragraphs[this.idx];
      if (this.onParaChange) this.onParaChange(this.idx);
      const u = new SpeechSynthesisUtterance(text);
      u.rate = this.rate;
      u.onend = () => { this.idx += 1; this._next(); };
      this.utterance = u;
      this.synth.speak(u);
      this.playing = true;
    },

    pause() { this.synth?.pause(); },
    resume() { this.synth?.resume(); },
    stop() {
      this.synth?.cancel();
      this.playing = false;
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    },

    sleepTimer(minutes, onDone) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.stop();
        if (onDone) onDone();
      }, minutes * 60 * 1000);
    },
  };

  window.AmpsFeatures = {
    NOTE_TAGS,
    LEARNING_PATHS,
    booksForPath,
    categorizeBook,
    wordCount,
    readingTimeMinutes,
    bookProgress,
    chapterStats,
    quoteOfTheDay,
    lookupGlossary,
    exportLibrary,
    exportJson,
    importJson,
    TTS,
  };
})();

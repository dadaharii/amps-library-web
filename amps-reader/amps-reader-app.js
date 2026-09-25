/* AMPS Reader — premium book library, reader, search, highlights, notes, study */
(function () {
  "use strict";

  const STORAGE = "amps-reader-v3";
  const F = () => window.AmpsFeatures;
  const T = k => window.AmpsI18n?.t(k, state.settings?.lang) || k;
  const presentationBuilderEnabled = () => window.AmpsBuildFlags?.presentationBuilder !== false;
  const HL_COLORS = [
    { id: "yellow", label: "Yellow", bg: "rgba(255, 214, 0, 0.45)" },
    { id: "green", label: "Green", bg: "rgba(72, 199, 116, 0.4)" },
    { id: "blue", label: "Blue", bg: "rgba(96, 165, 250, 0.4)" },
    { id: "pink", label: "Pink", bg: "rgba(244, 114, 182, 0.4)" },
  ];

  const BOOK_SEARCH_ALIASES = {
    "samskrta-shloka": [
      "samskrta shloka", "sanskrit shloka", "sanskrit sloka", "samskrta sloka",
      "sanskrit verses", "sacred verses", "sanskrit mantra",
    ],
  };

  function normSearch(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function bookSearchBlob(book) {
    const parts = [
      book.title, book.series, book.subtitle, book.author, book.id?.replace(/-/g, " "),
      ...(BOOK_SEARCH_ALIASES[book.id] || []),
      ...(book.searchKeywords || []),
    ];
    return normSearch(parts.filter(Boolean).join(" "));
  }

  function textMatchesQuery(text, query) {
    const raw = String(text || "");
    const ql = String(query || "").toLowerCase();
    if (ql && raw.toLowerCase().includes(ql)) return true;
    const hay = normSearch(raw);
    const needle = normSearch(query);
    if (!needle) return false;
    if (hay.includes(needle)) return true;
    return needle.split(" ").filter(w => w.length > 1).every(w => hay.includes(w));
  }

  const COVER_PALETTES = [
    ["#e85d04", "#9a3412"], ["#c9a227", "#7c5e10"], ["#2d6a4f", "#1b4332"],
    ["#1d4e89", "#0d2d54"], ["#6b2d5c", "#3d1835"], ["#b5451b", "#6b280f"],
    ["#4a6741", "#2d3f28"], ["#5c4d7d", "#352a4f"], ["#8b4513", "#4a2508"],
    ["#1a535c", "#0d2f35"], ["#9b2226", "#5c1417"], ["#0077b6", "#004e7a"],
    ["#588157", "#344e41"], ["#bc4749", "#6d2a2b"], ["#7f5539", "#4a3120"],
    ["#3a506b", "#1c2541"], ["#d4a373", "#8b5e34"], ["#6d597a", "#3d3548"],
    ["#e09f3e", "#8a5f1e"], ["#2a9d8f", "#1a6359"], ["#a44a3f", "#5e2a23"],
    ["#5f0f40", "#3a0927"], ["#006d77", "#003d44"], ["#cb997e", "#7a5c4a"],
  ];

  function bookCoverStyle(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const [a, b] = COVER_PALETTES[h % COVER_PALETTES.length];
    return `background:linear-gradient(155deg,${a} 0%,${b} 100%)`;
  }

  function bookCoverImage(b, size) {
    if (b?.id !== "caryacarya-part-3-hindi") return "";
    const file = size === "hero" ? "Caryacarya-cover.webp" : "Caryacarya-cover-thumb.webp";
    return readerAssetUrl(`data/media/caryacarya-part-3-hindi/assets/${file}`);
  }

  function coverShortTitle(title) {
    const t = String(title || "").replace(/\s*\[.*?\]\s*/g, "").trim();
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length <= 5) return t;
    return words.slice(0, 5).join(" ");
  }

  /** "Part 28" / "Volume 2" from title or seriesOrder/volume — never "Vol 28" for Part books. */
  function coverPartLabel(b) {
    const title = String(b.title || "");
    const m = title.match(/\b(Part|Volume|Vol\.?)\s+(\d+)\b/i);
    if (m) {
      const kind = /^vol/i.test(m[1]) ? "Volume" : "Part";
      return `${kind} ${parseInt(m[2], 10)}`;
    }
    if (b.seriesOrder != null && Number(b.seriesOrder) > 0) {
      return `Part ${Number(b.seriesOrder)}`;
    }
    if (b.volume != null && String(b.volume).trim() !== "") {
      const n = parseInt(b.volume, 10);
      if (!Number.isNaN(n) && n > 0) return `Part ${n}`;
    }
    return "";
  }

  function isProutNutshellBook(b) {
    const series = String(b?.series || b?.seriesTitle || "");
    const id = String(b?.id || b?.familyId || "");
    return /prout in a nutshell/i.test(series) || id.startsWith("prout-in-a-nutshell");
  }

  /** Main cover title: series name when book is "Series Part N", else title without Part/Volume suffix. */
  function coverMainTitle(b) {
    if (isProutNutshellBook(b)) return "Prout in a Nutshell";
    const raw = String(b.title || "").replace(/\s*\[.*?\]\s*/g, "").trim();
    const series = String(b.series || "").replace(/\s*\[.*?\]\s*/g, "").trim();
    if (series && /\b(Part|Volume|Vol\.?)\s+\d+\b/i.test(raw)) {
      return series;
    }
    const stripped = raw.replace(/\s*[-–—,]?\s*\b(Part|Volume|Vol\.?)\s+\d+\b.*$/i, "").trim();
    return stripped || series || raw;
  }

  function coverAuthor(b) {
    if (isProutNutshellBook(b)) return "Shrii Prabhat Raiṋjana Sarkar";
    return b.author || "Shrii Shrii Anandamurti";
  }

  function seriesDiffersFromTitle(b) {
    const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const series = norm(b.series);
    const title = norm(coverMainTitle(b));
    if (!series || !title) return false;
    if (series === title) return false;
    if (title.includes(series) || series.includes(title.slice(0, Math.min(20, title.length)))) return false;
    return true;
  }

  function bookCoverHtml(b, size) {
    const part = coverPartLabel(b);
    const mainTitle = coverMainTitle(b);
    const author = coverAuthor(b);
    const coverImage = bookCoverImage(b, size);
    const prout = isProutNutshellBook(b);
    const coverClass = prout ? " book-cover-prout" : "";
    const style = prout ? "" : ` style="${bookCoverStyle(b.id)}"`;
    const mark = prout ? `<span class="book-cover-mark">AMPS</span>` : "";
    const rule = prout ? `<span class="book-cover-rule" aria-hidden="true"></span>` : "";

    if (coverImage && !prout) {
      const hero = size === "hero";
      return `<img class="book-cover book-cover-image ${hero ? "book-cover-hero" : "book-cover-card"}" src="${esc(coverImage)}" alt="${hero ? esc(b.title + " front cover") : ""}" ${hero ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} decoding="async"${hero ? "" : ' aria-hidden="true"'} />`;
    }

    if (size === "hero") {
      return `<div class="book-cover book-cover-hero${coverClass}"${style} role="img" aria-label="${esc(mainTitle + (part ? " " + part : ""))}">
        ${mark}
        <span class="book-cover-title book-cover-title-hero">${esc(mainTitle)}</span>
        ${rule}
        ${part ? `<span class="book-cover-vol">${esc(part)}</span>` : ""}
        <span class="book-cover-author">${esc(author)}</span>
      </div>`;
    }

    return `<div class="book-cover book-cover-card${coverClass}"${style} aria-hidden="true">
      ${mark}
      <span class="book-cover-title">${esc(coverShortTitle(mainTitle))}</span>
      ${rule}
      ${part ? `<span class="book-cover-vol">${esc(part)}</span>` : ""}
      <span class="book-cover-author book-cover-author-card">${esc(author)}</span>
    </div>`;
  }

  function visibleBookChapters(book) {
    return (book?.chapters || []).filter(ch => !ch?.tocHidden);
  }

  // Pause values shipped as defaults by earlier versions, kept so saved
  // settings that were never touched by the user get re-baselined.
  const PAUSE_DEFAULT_HISTORY = {
    comma: [0, undefined, null, 160, 220],
    sentence: [280, 450, 550],
    paragraph: [600, 750, 1000],
  };

  const state = {
    catalog: null,
    bookCache: {},
    route: "library",
    params: {},
    settings: {
      theme: "sepia",
      fontSize: 18,
      lineHeight: 1.75,
      fontFamily: "serif",
      readerWidth: "normal",
      scrollMode: "scroll",
      focusLine: false,
      immersive: false,
      brightness: 100,
      ttsRate: 1,
      ttsVoice: "best-english",
      ttsPronunciation: "amps-hi-samskrta",
      sanskritPronunciation: "amps-enhanced",
      sanskritSpeechRate: 0.9,
      ttsReadingStyle: "human",
      ttsReadingStyleUpgraded: false,
      pravachanRate: 0.75,
      marginH: 1,
      lang: "en",
      bookLanguage: "",
      bookLanguageDisplayMode: "",
      showCommentary: true,
      presentAuto: false,
      presentTheme: "light",
      autoBackup: true,
      syncEndpoint: "",
      typoPreset: "default",
      onboarded: false,
      userGoal: "read",
      favSeries: "",
      textAlign: "justify",
      shlokaScripts: { roman: true, dev: true, bng: true, oriya: true, punjabi: true, kannada: true, telugu: true, meaning: true },
      shlokaScriptMode: "all",
      shlokaStudyMode: "off",
      shlokaRepeatCount: 3,
      shlokaChandaRead: true,
      shlokaBundledAudio: true,
      shlokaCardView: true,
      shlokaPreferHumanAudio: true,
      shlokaRecorderSpeaker: "",
      /** Live / Play-mine background bed 0–1 (Studio slider). Balanced default. */
      shlokaBedVolume: 0.32,
      discoursePdfAllowed: true,
      adminPin: "",
      apiBaseUrl: "",
      ttsProvider: "device",
      ttsApiUrl: "",
      ttsApiKey: "",
      ownVoiceTtsUrl: "",
      ownVoiceTtsKey: "",
      ownVoiceId: "my-voice",
      ttsCommaPause: 180,
      ttsSentencePause: 420,
      ttsParagraphPause: 850,
      ttsVersePause: 1300,
      ttsSkipFootnotes: false,
      continuousContentScope: "full_text",
      continuousStopAfterCurrent: false,
    },
    license: {
      email: "",
      licenseKey: "",
      valid: false,
      isActive: false,
      activatedAt: null,
      lastChecked: null,
      deviceRegistered: false,
      maxDevices: 1,
    },
    readingPlan: { enabled: false, dailyDiscourses: 1, notify: false, completed: {} },
    stats: null,
    collections: [],
    importedBooks: {},
    progress: {},
    highlights: [],
    notes: [],
    bookmarks: [],
    favorites: { books: [], quotes: [] },
    journal: [],
    vocabulary: [],
    recent: [],
    audioProgress: {},
    audioQueue: [],
    dailyTools: { minutes: 12, path: "beginner", includeAudio: true, includeFlashcards: true },
    study: { cards: {}, session: null, setup: { mode: "due", sectionId: "", limit: 25 } },
    productivity: { studyPanelOpen: false, studyPanelTab: "summary", chapterSearch: "", chapterSearchIdx: 0, skipFootnotesTts: false, autoSync: false, tabletSplit: true, sleepMinutes: 0, sleepEnd: 0, missionDay: "" },
    userStudyCards: {},
    userStudySession: null,
    readingSessions: [],
    ui: { loading: true, searchBusy: false, selection: null, drawer: null, pageIndex: 0, readScrollPct: 0, shlokaVerseQuery: "", adminUnlockedUntil: 0, activeParaId: null },
    readingReturn: null,
    shlokaSourceIndex: null,
    shlokaBySourceKey: null,
    sutraGame: { scores: {}, cardStats: {}, session: null, lastChapter: "ch2", lastGameType: "flashcards", lastQuizMode: "devanagari", lastSpeed: true, lastPriority: "smart", flashFront: "number" },
    shlokaGame: { scores: {}, cardStats: {}, session: null, lastChapter: "b1", lastGameType: "flashcards", lastQuizMode: "devanagari", lastSpeed: true, lastPriority: "smart", flashFront: "number" },
  };
  const languagePackCache = {};
  let languageRegistryCache = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (!raw) return;
      const saved = JSON.parse(raw);
      Object.assign(state.settings, saved.settings || {});
      // Re-baseline pauses saved under earlier defaults onto the conventional
      // comma / full-stop / paragraph rhythm.
      if (PAUSE_DEFAULT_HISTORY.comma.includes(state.settings.ttsCommaPause)) state.settings.ttsCommaPause = 180;
      if (PAUSE_DEFAULT_HISTORY.sentence.includes(state.settings.ttsSentencePause)) state.settings.ttsSentencePause = 420;
      if (PAUSE_DEFAULT_HISTORY.paragraph.includes(state.settings.ttsParagraphPause)) state.settings.ttsParagraphPause = 850;
      if (saved.settings?.ttsVoice) {
        const norm = window.AmpsAudio?.normalizePreset;
        state.settings.ttsVoice = norm ? norm(saved.settings.ttsVoice) : saved.settings.ttsVoice;
      }
      state.settings.shlokaScripts = {
        roman: true,
        dev: true,
        bng: true,
        oriya: true,
        punjabi: true,
        kannada: true,
        telugu: true,
        meaning: true,
        ...(saved.settings?.shlokaScripts || {}),
      };
      if (saved.settings?.shlokaScriptMode && SHLOKA_SCRIPT_PRESETS[saved.settings.shlokaScriptMode]) {
        const preset = SHLOKA_SCRIPT_PRESETS[saved.settings.shlokaScriptMode];
        state.settings.shlokaScripts = scriptFlagsFromPreset(preset);
      } else if (!saved.settings?.shlokaScriptMode) {
        state.settings.shlokaScriptMode = detectShlokaScriptMode(state.settings.shlokaScripts);
      }
      state.progress = saved.progress || {};
      state.highlights = saved.highlights || [];
      state.notes = saved.notes || [];
      state.bookmarks = saved.bookmarks || [];
      state.favorites = saved.favorites || { books: [], quotes: [] };
      state.journal = saved.journal || [];
      state.vocabulary = saved.vocabulary || [];
      state.recent = saved.recent || [];
      state.audioProgress = saved.audioProgress || {};
      state.audioQueue = saved.audioQueue || [];
      state.dailyTools = { ...state.dailyTools, ...(saved.dailyTools || {}) };
      state.stats = saved.stats || window.AmpsStats?.ensure() || {};
      state.readingPlan = saved.readingPlan || state.readingPlan;
      state.collections = saved.collections || [];
      state.importedBooks = saved.importedBooks || {};
      state.study = saved.study || { cards: {}, session: null, setup: { mode: "due", sectionId: "", limit: 25 } };
      if (!state.study.setup) state.study.setup = { mode: "due", sectionId: "", limit: 25 };
      state.productivity = { ...state.productivity, ...(saved.productivity || {}) };
      state.productivity.studyPanelOpen = false;
      state.userStudyCards = saved.userStudyCards || {};
      state.userStudySession = saved.userStudySession || null;
      state.readingSessions = saved.readingSessions || [];
      // One-time promotion to the recommended human discourse style. Repeating it
      // on every load would make an explicit Normal Reading choice unselectable.
      if (!saved.settings?.ttsReadingStyle
        || (saved.settings.ttsReadingStyle === "normal" && !saved.settings.ttsReadingStyleUpgraded)) {
        state.settings.ttsReadingStyle = "human";
      }
      state.settings.ttsReadingStyleUpgraded = true;
      if (state.productivity.skipFootnotesTts && !state.settings.ttsSkipFootnotes) {
        state.settings.ttsSkipFootnotes = true;
      }
      state.readingReturn = saved.readingReturn || null;
      if (saved.sutraGame) {
        state.sutraGame = {
          ...state.sutraGame,
          ...saved.sutraGame,
          session: null,
          scores: saved.sutraGame.scores || state.sutraGame.scores,
          cardStats: saved.sutraGame.cardStats || state.sutraGame.cardStats || {},
        };
      }
      if (saved.shlokaGame) {
        state.shlokaGame = {
          ...state.shlokaGame,
          ...saved.shlokaGame,
          session: null,
          scores: saved.shlokaGame.scores || state.shlokaGame.scores,
          cardStats: saved.shlokaGame.cardStats || state.shlokaGame.cardStats || {},
        };
      }
      if (saved.presentationBuilder) {
        window.AmpsPresentationStore?.hydrate(state, saved.presentationBuilder);
      }
      if (saved.license) {
        state.license = { ...state.license, ...saved.license };
      }
      if (!saved.settings?.sanskritPronunciation) {
        const legacy = saved.settings?.ttsPronunciation;
        state.settings.sanskritPronunciation = (legacy === "normal" || !legacy) ? "off" : "amps-enhanced";
      }
      // Saṁskrta rate is now a factor on the reading-speed slider, so the old
      // absolute 0.9 default would silently slow every session down.
      if (!Number(state.settings.sanskritSpeechRate) || Number(state.settings.sanskritSpeechRate) === 0.9) {
        state.settings.sanskritSpeechRate = 1;
      }
      state.settings.ttsPronunciation = state.settings.sanskritPronunciation === "off" ? "normal" : "amps-hi-samskrta";
      if (saved.settings?.lang) window.AmpsI18n?.setLang(saved.settings.lang);
      const v1 = localStorage.getItem("amps-reader-v1");
      if (v1 && !saved.migrated) {
        const old = JSON.parse(v1);
        state.progress = old.progress || state.progress;
        state.highlights = old.highlights || state.highlights;
        state.notes = old.notes || state.notes;
        if (old.study?.cards) state.study.cards = old.study.cards;
      }
    } catch (_) { /* ignore */ }
  }

  function saveState() {
    localStorage.setItem(STORAGE, JSON.stringify({
      migrated: true,
      settings: state.settings,
      progress: state.progress,
      highlights: state.highlights,
      notes: state.notes,
      bookmarks: state.bookmarks,
      favorites: state.favorites,
      journal: state.journal,
      vocabulary: state.vocabulary,
      recent: state.recent,
      audioProgress: state.audioProgress,
      audioQueue: state.audioQueue,
      dailyTools: state.dailyTools,
      stats: state.stats,
      readingPlan: state.readingPlan,
      collections: state.collections,
      importedBooks: state.importedBooks,
      study: { cards: state.study.cards, session: state.study.session, setup: state.study.setup },
      productivity: state.productivity,
      userStudyCards: state.userStudyCards,
      userStudySession: state.userStudySession,
      readingSessions: state.readingSessions,
      readingReturn: state.readingReturn,
      sutraGame: { scores: state.sutraGame?.scores || {}, cardStats: state.sutraGame?.cardStats || {}, lastChapter: state.sutraGame?.lastChapter, lastGameType: state.sutraGame?.lastGameType, lastQuizMode: state.sutraGame?.lastQuizMode, lastSpeed: state.sutraGame?.lastSpeed, lastPriority: state.sutraGame?.lastPriority, flashFront: state.sutraGame?.flashFront },
      shlokaGame: { scores: state.shlokaGame?.scores || {}, cardStats: state.shlokaGame?.cardStats || {}, lastChapter: state.shlokaGame?.lastChapter, lastGameType: state.shlokaGame?.lastGameType, lastQuizMode: state.shlokaGame?.lastQuizMode, lastSpeed: state.shlokaGame?.lastSpeed, lastPriority: state.shlokaGame?.lastPriority, flashFront: state.shlokaGame?.flashFront },
      presentationBuilder: window.AmpsPresentationStore?.serialize(state),
      license: state.license,
    }));
  }

  function isDiscoursePdfAllowed() {
    if (window.AmpsLicense?.isEnforced?.() && !window.AmpsLicense?.isLicensed?.()) return false;
    return state.settings.discoursePdfAllowed !== false;
  }

  function isAdminUnlocked() {
    return !!(state.ui.adminUnlockedUntil && Date.now() < state.ui.adminUnlockedUntil);
  }

  function tryUnlockAdmin(pin) {
    const entered = String(pin || "").trim();
    const setPin = String(state.settings.adminPin || "");
    if (!setPin) {
      if (entered.length < 4) return { ok: false, msg: "Choose an admin PIN with at least 4 characters." };
      state.settings.adminPin = entered;
      state.ui.adminUnlockedUntil = Date.now() + 30 * 60 * 1000;
      saveState();
      return { ok: true, created: true };
    }
    if (entered !== setPin) return { ok: false, msg: "Incorrect admin PIN." };
    state.ui.adminUnlockedUntil = Date.now() + 30 * 60 * 1000;
    return { ok: true };
  }

  function downloadDiscoursePdf(book, chapter) {
    const Pdf = window.AmpsPresentationPdf;
    if (!Pdf?.exportDiscourseChapter) {
      alert("PDF export is not available in this build.");
      return;
    }
    const blob = Pdf.exportDiscourseChapter(book, chapter);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const safe = s => String(s || "discourse").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").slice(0, 80);
    a.download = safe(book?.title) + "-" + safe(chapter?.title) + ".pdf";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function trackRecent(bookId) {
    state.recent = [bookId, ...state.recent.filter(id => id !== bookId)].slice(0, 20);
  }

  function isFavoriteBook(bookId) {
    return state.favorites.books.includes(bookId);
  }

  function toggleFavoriteBook(bookId) {
    if (isFavoriteBook(bookId)) {
      state.favorites.books = state.favorites.books.filter(id => id !== bookId);
    } else state.favorites.books.push(bookId);
    saveState();
  }

  function isBookmarked(bookId, chapterId, paraId) {
    return state.bookmarks.some(b => b.bookId === bookId && b.chapterId === chapterId && b.paraId === paraId);
  }

  /** U+0092 and curly quotes → ASCII apostrophe (sun's, didn't, Publisher's). */
  function normalizeApostrophe(s) {
    return String(s ?? "").replace(/[\u0092\u2018\u2019'`]/g, "'");
  }

  function esc(s) {
    return normalizeApostrophe(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Strip EE discourse list numbers like "(1) " / "( 12 )" at paragraph start. */
  function stripDiscourseListNumber(text) {
    return String(text || "").replace(/^\(\s*\d+\s*\)\s+/, "");
  }

  /** EE9 cross-publication / compilation notes (shown muted at article end). */
  function isSourceBlurbPara(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t || t.length > 420) return false;
    if (/\[a compilation\]|\[unpublished|printed edition\b.+\bdivided into\b|this discourse belongs to part\b/i.test(t)) {
      return true;
    }
    return /^(Discourses on|A Few Problems Solved|Prout in a Nutshell|Ánanda Vacanámrtam Part|Ananda Vacanamrtam Part|Ánanda Vacanámrtam Part|The Flow of Devotion)\b/i.test(t);
  }

  function shlokaSourcesList(p) {
    const editorial = (Array.isArray(p.sources) ? p.sources : []).filter((s) => !s.canonical_binding_provenance);
    const indexed = window.AmpsCanonicalOccurrencesIndex?.sourcesFromOccurrenceIndex
      ? window.AmpsCanonicalOccurrencesIndex.sourcesFromOccurrenceIndex(p.id, state.canonicalOccurrencesIndex)
      : (state.canonicalOccurrencesIndex?.byCanonicalId?.[p.id] || []).map((o) => ({
        bookId: o.bookId,
        bookTitle: o.bookTitle,
        chapterId: o.chapterId,
        chapterTitle: o.chapterTitle,
        paraId: o.paragraphId,
        language: o.language,
        fromCanonicalOccurrencesIndex: true,
        relationship: o.relationship,
        approval: o.approval,
      }));
    const merged = editorial.slice();
    const seen = new Set(merged.map((s) => `${s.bookId}|${s.chapterId}|${s.paraId || ""}`));
    indexed.forEach((s) => {
      const key = `${s.bookId}|${s.chapterId}|${s.paraId || ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(s);
    });
    if (merged.length) return merged;
    if (p.sourceBookId && p.sourceChapterId) {
      return [{
        bookId: p.sourceBookId,
        bookTitle: p.sourceBookTitle,
        chapterId: p.sourceChapterId,
        chapterTitle: p.sourceChapterTitle,
        paraId: p.sourceParaId || null,
      }];
    }
    return [];
  }

  const SHLOKA_SCRIPT_FLAGS = ["roman", "dev", "bng", "oriya", "punjabi", "kannada", "telugu", "meaning"];

  function scriptFlagsFromPreset(preset) {
    const out = {};
    SHLOKA_SCRIPT_FLAGS.forEach(k => { out[k] = !!preset[k]; });
    return out;
  }

  function scriptPrefsMatch(a, b) {
    return SHLOKA_SCRIPT_FLAGS.every(k => !!a[k] === !!b[k]);
  }

  const SHLOKA_SCRIPT_PRESETS = {
    all: { roman: true, dev: true, bng: true, oriya: true, punjabi: true, kannada: true, telugu: true, meaning: true, label: "All — Roman, Indic scripts & meaning" },
    scripts: { roman: true, dev: true, bng: true, oriya: true, punjabi: true, kannada: true, telugu: true, meaning: false, label: "Roman & all Indic scripts" },
    "indic-all": { roman: false, dev: true, bng: true, oriya: true, punjabi: true, kannada: true, telugu: true, meaning: false, label: "All Indic scripts" },
    roman: { roman: true, dev: false, bng: false, oriya: false, punjabi: false, kannada: false, telugu: false, meaning: false, label: "Roman only" },
    dev: { roman: false, dev: true, bng: false, oriya: false, punjabi: false, kannada: false, telugu: false, meaning: false, label: "Hindi (Devanagari) only" },
    bng: { roman: false, dev: false, bng: true, oriya: false, punjabi: false, kannada: false, telugu: false, meaning: false, label: "Bangla only" },
    oriya: { roman: false, dev: false, bng: false, oriya: true, punjabi: false, kannada: false, telugu: false, meaning: false, label: "Oriya only" },
    punjabi: { roman: false, dev: false, bng: false, oriya: false, punjabi: true, kannada: false, telugu: false, meaning: false, label: "Punjabi (Gurmukhi) only" },
    kannada: { roman: false, dev: false, bng: false, oriya: false, punjabi: false, kannada: true, telugu: false, meaning: false, label: "Kannada only" },
    telugu: { roman: false, dev: false, bng: false, oriya: false, punjabi: false, kannada: false, telugu: true, meaning: false, label: "Telugu only" },
    "roman-dev": { roman: true, dev: true, bng: false, oriya: false, punjabi: false, kannada: false, telugu: false, meaning: false, label: "Roman & Hindi" },
    "roman-bng": { roman: true, dev: false, bng: true, oriya: false, punjabi: false, kannada: false, telugu: false, meaning: false, label: "Roman & Bangla" },
    "roman-telugu": { roman: true, dev: false, bng: false, oriya: false, punjabi: false, kannada: false, telugu: true, meaning: false, label: "Roman & Telugu" },
    "dev-bng": { roman: false, dev: true, bng: true, oriya: false, punjabi: false, kannada: false, telugu: false, meaning: false, label: "Hindi & Bangla" },
    "roman-meaning": { roman: true, dev: false, bng: false, oriya: false, punjabi: false, kannada: false, telugu: false, meaning: true, label: "Roman & English meaning" },
    "dev-meaning": { roman: false, dev: true, bng: false, oriya: false, punjabi: false, kannada: false, telugu: false, meaning: true, label: "Hindi & Meaning" },
    meaning: { roman: false, dev: false, bng: false, oriya: false, punjabi: false, kannada: false, telugu: false, meaning: true, label: "Word meaning only" },
  };

  function detectShlokaScriptMode(scripts) {
    const s = scripts || state.settings.shlokaScripts || {};
    for (const [mode, preset] of Object.entries(SHLOKA_SCRIPT_PRESETS)) {
      if (scriptPrefsMatch(scriptFlagsFromPreset(preset), s)) return mode;
    }
    return "all";
  }

  function getShlokaScriptPrefs() {
    const mode = getShlokaScriptMode();
    const preset = SHLOKA_SCRIPT_PRESETS[mode];
    if (preset) return scriptFlagsFromPreset(preset);
    const s = state.settings.shlokaScripts || {};
    const out = {};
    SHLOKA_SCRIPT_FLAGS.forEach(k => { out[k] = !!s[k]; });
    return out;
  }

  function getShlokaScriptMode() {
    const mode = state.settings.shlokaScriptMode;
    if (mode && SHLOKA_SCRIPT_PRESETS[mode]) return mode;
    return detectShlokaScriptMode();
  }

  function chapterHasShlokas(ch, bookId) {
    return (ch?.paragraphs || []).some(p => {
      if (p.kind === "shloka" || p.renderType === "shloka" || p.sanskritRoman) return true;
      if (!bookId || !state.shlokaSourceIndex) return false;
      return !!state.shlokaSourceIndex[shlokaSourceLookupKey(bookId, ch.id, p.id)];
    });
  }

  function getShlokaEntryForPara(bookId, chapterId, para) {
    // Only native shloka records (Samskrta Shloka book / embedded fields).
    // Source-index hits must NOT swap discourse quotation text for a canonical card.
    if (para.kind === "shloka" || para.sanskritRoman) return para;
    return null;
  }

  function isShlokaParagraph(bookId, chapterId, para) {
    return !!(para.kind === "shloka" || para.renderType === "shloka" || para.sanskritRoman);
  }

  function shlokaCrossLinkHit(bookId, chapterId, paraId) {
    const raw = state.shlokaSourceIndex?.[shlokaSourceLookupKey(bookId, chapterId, paraId)];
    return window.AmpsShlokaDeepNav?.normalizeSourceIndexEntry?.(raw) ||
      (typeof raw === "string" ? { paraId: raw, label: "" } : raw);
  }

  function hasSamskrtaSemanticBlock(blocks) {
    return Array.isArray(blocks) && blocks.some(block => {
      const type = String(block?.type || "");
      return type === "samskrta_unit" || type === "embedded_samskrta_unit";
    });
  }

  function isDiscourseRomanShlokaPara(para, prevPara, nextPara) {
    return !!window.AmpsShlokaFormat?.isRomanShloka?.(para?.text, prevPara?.text, nextPara?.text);
  }

  function paragraphUsesChanda(bookId, chapterId, para, prevPara, nextPara) {
    if (state.settings.shlokaChandaRead === false) return false;
    if (isShlokaParagraph(bookId, chapterId, para)) return true;
    return isDiscourseRomanShlokaPara(para, prevPara, nextPara);
  }

  function resolveParagraphSpeakText(bookId, chapterId, para, prevPara, nextPara) {
    const plain = stripDiscourseListNumber(para?.text);
    if (!paragraphUsesChanda(bookId, chapterId, para, prevPara, nextPara)) {
      return plain;
    }
    const entry = getShlokaEntryForPara(bookId, chapterId, para) || para;
    return window.AmpsShlokaTts?.resolveSpeakText?.(para, getShlokaScriptPrefs(), {
      getEntry: () => entry,
      isRomanShloka: () => isDiscourseRomanShlokaPara(para, prevPara, nextPara),
    }) || entry.sanskritRoman || entry.text || plain;
  }

  function buildParagraphSpeakPlan(bookId, ch) {
    const speakTexts = [];
    const paragraphChanda = [];
    (ch?.paragraphs || []).forEach((p, i) => {
      const prev = ch.paragraphs[i - 1];
      const next = ch.paragraphs[i + 1];
      paragraphChanda.push(paragraphUsesChanda(bookId, ch.id, p, prev, next));
      speakTexts.push(resolveParagraphSpeakText(bookId, ch.id, p, prev, next));
    });
    return { speakTexts, paragraphChanda };
  }

  function isAnandaSutramBook(bookId) {
    return bookId === "ananda-sutram";
  }

  function isAnandaSutramRomanLine(p, prevP) {
    const t = String(p?.text || "").trim();
    if (/^\d+-\d+\.\s+/.test(t)) return true;
    if (p?.sutraRoman) return true;
    return !!window.AmpsShlokaFormat?.isRomanShloka?.(t, prevP?.text);
  }

  function renderAnandaSutramPara(p, ch) {
    const prefs = getShlokaScriptPrefs();
    const fmt = window.AmpsShlokaFormat;
    const romanSource = p.sutraRoman || fmt?.stripSutraPrefix?.(p.text)?.body || p.text;
    let body = "";
    if (prefs.roman) {
      const m = String(p.text || "").trim().match(/^(\d+-\d+\.\s+)([\s\S]*)$/);
      const romanLine = m
        ? m[1] + (fmt?.formatRomanDisplay?.(m[2]) || m[2])
        : (fmt?.formatRomanDisplay?.(romanSource) || romanSource);
      body += `<div class="sutra-roman shloka-line shloka-roman">${linkParaFootnotes(romanLine, ch)}</div>`;
    }
    if (prefs.dev && p.devanagari) {
      const devText = fmt?.formatIndicDisplay?.(p.devanagari) || p.devanagari;
      String(devText).split("\n").filter(Boolean).forEach(line => {
        body += `<div class="sutra-dev shloka-line shloka-dev">${esc(line)}</div>`;
      });
    }
    if (prefs.bng && p.bangla) {
      const bngText = fmt?.formatIndicDisplay?.(p.bangla) || p.bangla;
      String(bngText).split("\n").filter(Boolean).forEach(line => {
        body += `<div class="sutra-bng shloka-line shloka-bng">${esc(line)}</div>`;
      });
    }
    if (prefs.oriya && p.oriya) {
      const orText = fmt?.formatIndicDisplay?.(p.oriya) || p.oriya;
      String(orText).split("\n").filter(Boolean).forEach(line => {
        body += `<div class="sutra-or shloka-line shloka-or">${esc(line)}</div>`;
      });
    }
    if (prefs.punjabi && p.punjabi) {
      const paText = fmt?.formatIndicDisplay?.(p.punjabi) || p.punjabi;
      String(paText).split("\n").filter(Boolean).forEach(line => {
        body += `<div class="sutra-pa shloka-line shloka-pa">${esc(line)}</div>`;
      });
    }
    if (prefs.kannada && p.kannada) {
      const knText = fmt?.formatIndicDisplay?.(p.kannada) || p.kannada;
      String(knText).split("\n").filter(Boolean).forEach(line => {
        body += `<div class="sutra-kn shloka-line shloka-kn">${esc(line)}</div>`;
      });
    }
    if (prefs.telugu && p.telugu) {
      const teText = fmt?.formatIndicDisplay?.(p.telugu) || p.telugu;
      String(teText).split("\n").filter(Boolean).forEach(line => {
        body += `<div class="sutra-te shloka-line shloka-te">${esc(line)}</div>`;
      });
    }
    if (!body) {
      body = `<div class="sutra-roman shloka-line shloka-roman">${linkParaFootnotes(p.text, ch)}</div>`;
    }
    return `<span class="ananda-sutra-block">${body}</span>`;
  }

  function setShlokaScriptMode(mode) {
    const preset = SHLOKA_SCRIPT_PRESETS[mode];
    if (!preset) return;
    state.settings.shlokaScriptMode = mode;
    state.settings.shlokaScripts = scriptFlagsFromPreset(preset);
    saveState();
    renderFromState();
  }

  function renderShlokaScriptSelect(selectId) {
    const mode = getShlokaScriptMode();
    const options = Object.entries(SHLOKA_SCRIPT_PRESETS).map(([id, preset]) =>
      `<option value="${id}"${id === mode ? " selected" : ""}>${esc(preset.label)}</option>`
    ).join("");
    return `<label class="shloka-script-select-label">Show
      <select id="${esc(selectId)}" class="shloka-script-select" aria-label="Shloka script display">${options}</select>
    </label>`;
  }

  function renderShlokaScriptBar() {
    return `<div class="shloka-script-bar" id="shlokaScriptBar">${renderShlokaScriptSelect("shlokaScriptMode")}</div>`;
  }

  function initShlokaScriptDelegation() {
    document.addEventListener("change", e => {
      const sel = e.target?.closest?.(".shloka-script-select");
      if (!sel?.value) return;
      setShlokaScriptMode(sel.value);
    });
  }

  function shlokaSourceLookupKey(bookId, chapterId, paraId) {
    return `${bookId}|${chapterId}|${paraId}`;
  }

  function normalizeLoadedShlokaSourceIndex(idx) {
    const Deep = window.AmpsShlokaDeepNav;
    if (Deep?.normalizeSourceIndex) return Deep.normalizeSourceIndex(idx);
    const out = {};
    Object.entries(idx || {}).forEach(([k, v]) => {
      if (typeof v === "string") out[k] = { paraId: v, label: "" };
      else if (v?.paraId) out[k] = { paraId: v.paraId, label: v.label || "" };
    });
    return out;
  }

  function sourceOccurrenceId(shlokaId, chapterId, paraId) {
    return window.AmpsShlokaDeepNav?.occurrenceId?.(shlokaId, chapterId, paraId) || "";
  }

  function currentCanonicalShlokaId(explicit) {
    const candidates = [
      explicit,
      state.params.parts[3],
      state.ui.activeParaId,
      state._explicitReaderTarget?.paraId,
    ];
    for (const raw of candidates) {
      const id = String(raw || "").trim();
      if (/^ch-verses-p\d+/i.test(id)) return id;
    }
    const vis = String(visibleReaderParaId() || "").trim();
    if (/^ch-verses-p\d+/i.test(vis)) return vis;
    return null;
  }

  function replaceReaderHash(full) {
    if (location.hash === full) return;
    try {
      history.replaceState(null, "", full);
    } catch (_) {
      try { location.replace(full); } catch (__) { location.hash = full; }
    }
  }

  function pinSamskrtaShlokaInHistory(shlokaId) {
    const id = String(shlokaId || "").trim();
    if (!id) return;
    const params = {
      bookId: "samskrta-shloka",
      chapterId: "ch-verses",
      paraId: id,
    };
    applyRoute("read", params);
    replaceReaderHash(routeHash("read", params));
    state.ui.activeParaId = id;
  }

  function goToSourceOccurrence(bookId, chapterId, paraId, opts = {}) {
    const shlokaId = currentCanonicalShlokaId(opts.shlokaId);
    const target =
      window.AmpsShlokaDeepNav?.buildSourceNavTarget?.({
        bookId,
        chapterId,
        paraId,
        shlokaId,
        occurrenceId: opts.occurrenceId || null,
      }) || { bookId, chapterId, paraId, occurrenceId: opts.occurrenceId || null };
    const occurrence =
      target.occurrenceId ||
      sourceOccurrenceId(shlokaId, chapterId, paraId);
    const leavingShlokaBook = state.params.parts[1] === "samskrta-shloka" || !!shlokaId;
    state._explicitReaderTarget = { bookId, chapterId, paraId };
    if (leavingShlokaBook && shlokaId) {
      pinSamskrtaShlokaInHistory(shlokaId);
      const ret =
        window.AmpsShlokaDeepNav?.samskrtaReturnTarget?.(shlokaId) || {
          bookId: "samskrta-shloka",
          chapterId: "ch-verses",
          paraId: shlokaId,
          label: "Samskrta Shloka",
        };
      ret.scrollY = 0;
      ret.occurrenceId = null;
      state.readingReturn = ret;
      saveState();
      window.AmpsShlokaDeepNav?.saveNavSession?.({
        kind: "pending_occurrence_focus",
        return_to: ret,
        focus: {
          occurrenceId: occurrence || null,
          paraId: paraId || null,
          quoteText: opts.quoteText || "",
          bookId,
          chapterId,
          shlokaId,
        },
      });
    } else {
      window.AmpsShlokaDeepNav?.saveNavSession?.({
        kind: "pending_occurrence_focus",
        focus: {
          occurrenceId: occurrence || null,
          paraId: paraId || null,
          quoteText: opts.quoteText || "",
          bookId,
          chapterId,
        },
      });
    }
    state._pendingOccurrenceFocus = {
      occurrenceId: occurrence || null,
      paraId: paraId || null,
      quoteText: opts.quoteText || "",
      bookId,
      chapterId,
    };
    const navParams = { bookId, chapterId, paraId, occurrence };
    if (shlokaId) {
      navParams.fromBook = "samskrta-shloka";
      navParams.fromChapter = "ch-verses";
      navParams.fromPara = shlokaId;
      if (occurrence) navParams.fromOccurrence = occurrence;
    }
    navigate("read", navParams);
  }

  function readerChromeOffset() {
    try {
      const topbar = document.querySelector(".topbar");
      const toolbar = document.querySelector(".reader-toolbar-wrap");
      const ret = document.querySelector(".reading-return-bar");
      const shlokaSearch = document.querySelector(".shloka-verse-search-wrap");
      return (topbar?.getBoundingClientRect?.().height || 52) +
        (toolbar?.getBoundingClientRect?.().height || 0) +
        (ret?.getBoundingClientRect?.().height || 0) +
        (shlokaSearch?.getBoundingClientRect?.().height || 0) + 12;
    } catch (_) {
      return 96;
    }
  }

  function findExactReaderTarget(paraId, occurrenceId) {
    const article = document.getElementById("readerArticle");
    const Deep = window.AmpsShlokaDeepNav;
    const pending = state._pendingOccurrenceFocus || Deep?.loadNavSession?.()?.focus || null;
    const bookId = state.params.parts[1];
    const chapterId = state.params.parts[2];
    const onShlokaVerses = bookId === "samskrta-shloka" && chapterId === "ch-verses";
    const useOcc = onShlokaVerses ? null : occurrenceId;
    const esc = (CSS?.escape ? CSS.escape : (s) => String(s || "").replace(/"/g, '\\"'));

    function isHiddenAlias(el) {
      if (!el) return true;
      if (el.hidden || el.getAttribute("aria-hidden") === "true") return true;
      if (el.classList?.contains("samskrta-id-alias") || el.classList?.contains("quote-id-alias")) return true;
      return false;
    }

    function preferVisibleTarget(el) {
      if (!el || isHiddenAlias(el)) return null;
      const para = el.classList?.contains("reader-para") ? el : el.closest?.(".reader-para");
      if (para && !isHiddenAlias(para)) return para;
      return el;
    }

    if (Deep?.resolveOccurrenceInArticle && article) {
      const resolved = Deep.resolveOccurrenceInArticle(article, {
        occurrenceId: useOcc,
        paraId,
        quoteText: onShlokaVerses ? "" : (pending?.quoteText || ""),
      });
      if (resolved?.ok && resolved.element) {
        return preferVisibleTarget(resolved.element.closest?.(".reader-para") || resolved.element);
      }
    }
    if (useOcc) {
      const byOcc = document.getElementById(useOcc) ||
        document.querySelector(`[data-occurrence-id="${esc(useOcc)}"]`);
      const hit = preferVisibleTarget(byOcc);
      if (hit) return hit;
    }
    if (paraId) {
      const candidates = [];
      const byId = document.getElementById(paraId);
      if (byId) candidates.push(byId);
      document.querySelectorAll(`[data-para="${esc(paraId)}"]`).forEach(el => candidates.push(el));
      for (const el of candidates) {
        const hit = preferVisibleTarget(el);
        if (hit) return hit;
      }
    }
    return null;
  }

  /** Scroll + highlight a paragraph; works even if AmpsShlokaDeepNav failed to load. */
  function scrollReaderToExactElement(el, opts = {}) {
    if (!el) return false;
    try {
      el.classList?.remove?.("shloka-verse-hidden");
      let node = el;
      while (node && node !== document.body) {
        if (node.style) node.style.contentVisibility = "visible";
        node = node.parentElement;
      }
    } catch (_) {}

    // Prefer the same reliable path as alpha-jump (window.scrollTo after forced layout).
    // Deep.focusOccurrenceElement can miss sticky shloka-search chrome height.
    try {
      if (!el.hasAttribute?.("tabindex")) el.setAttribute("tabindex", "-1");
      void el.offsetHeight;
      void el.offsetTop;
      const offset = readerChromeOffset();
      const centerPad = Math.max(16, Math.min(120, (window.innerHeight || 600) * 0.12));
      const rect = el.getBoundingClientRect();
      const y = window.scrollY + rect.top - offset - centerPad;
      window.scrollTo({ top: Math.max(0, y), behavior: "auto" });
      el.classList?.add?.("source-occurrence-selected", "source-occurrence-flash");
      try { el.focus?.({ preventScroll: true }); } catch (_) {}
      if (opts.ariaLabel) {
        try { el.setAttribute("aria-label", opts.ariaLabel); } catch (_) {}
      }
      window.setTimeout(() => el.classList?.remove?.("source-occurrence-flash"), 5000);
      return true;
    } catch (_) {
      try {
        el.scrollIntoView({ behavior: "auto", block: "center" });
        return true;
      } catch (_) {
        return false;
      }
    }
  }

  function scheduleOccurrenceFocus(attemptsLeft = 24) {
    const run = () => {
      const pending = state._pendingOccurrenceFocus ||
        window.AmpsShlokaDeepNav?.loadNavSession?.()?.focus ||
        null;
      const onShlokaVerses =
        state.params.parts[1] === "samskrta-shloka" && state.params.parts[2] === "ch-verses";
      const paraId = state.params.parts[3] || pending?.paraId || null;
      const occurrenceId = onShlokaVerses
        ? null
        : (pending?.occurrenceId || state.params.occurrence || null);
      if (!occurrenceId && !paraId) return;

      if (!state._pendingOccurrenceFocus) {
        state._pendingOccurrenceFocus = {
          occurrenceId,
          paraId,
          quoteText: onShlokaVerses ? "" : (pending?.quoteText || ""),
        };
      }

      const el = findExactReaderTarget(paraId, occurrenceId);
        if (el) {
        // Unhide if a verse filter had collapsed the target.
        el.classList?.remove?.("shloka-verse-hidden");
        scrollReaderToExactElement(el);
        state._pendingOccurrenceFocus = null;
        if (state._explicitReaderTarget?.paraId === paraId) {
          state._explicitReaderTarget = null;
        }
        // Re-assert after layout/fonts/return-bar settle.
        window.setTimeout(() => {
          const again = findExactReaderTarget(paraId, occurrenceId);
          if (again) scrollReaderToExactElement(again);
        }, 80);
        window.setTimeout(() => {
          const again = findExactReaderTarget(paraId, occurrenceId);
          if (!again) return;
          const rect = again.getBoundingClientRect();
          const inView = rect.top >= 40 && rect.top < (window.innerHeight || 800) * 0.75;
          if (!inView) scrollReaderToExactElement(again);
        }, 280);
        window.setTimeout(() => {
          const again = findExactReaderTarget(paraId, occurrenceId);
          if (!again) return;
          const rect = again.getBoundingClientRect();
          const inView = rect.top >= 40 && rect.top < (window.innerHeight || 800) * 0.75;
          if (!inView) scrollReaderToExactElement(again);
        }, 700);
        return;
      }

      if (attemptsLeft > 0) {
        window.setTimeout(() => scheduleOccurrenceFocus(attemptsLeft - 1), 60);
      } else {
        // Exact paragraph genuinely missing → chapter-level fallback + visible warning.
        const Deep = window.AmpsShlokaDeepNav;
        const bookId = state.params.parts[1];
        const chapterId = state.params.parts[2];
        const missingPara = paraId;
        if (!onShlokaVerses && bookId && chapterId && missingPara && Deep?.paragraphMissingFallback) {
          const fb = Deep.paragraphMissingFallback({ bookId, chapterId, paraId: missingPara });
          state._pendingOccurrenceFocus = null;
          try {
            Deep.saveNavSession?.({
              ...(Deep.loadNavSession?.() || {}),
              focus: null,
              paragraph_missing_fallback: fb,
            });
          } catch (_) {}
          if (state.params.parts[3]) {
            navigate("read", { bookId, chapterId, paraId: null });
          }
          showReaderToast(fb.warning);
        } else {
          applyPendingOccurrenceFocus();
          if (missingPara) {
            showReaderToast(
              `Exact paragraph “${missingPara}” was not found.`
            );
          }
        }
      }
    };
    run();
    requestAnimationFrame(() => requestAnimationFrame(run));
  }

  function applyPendingOccurrenceFocus() {
    const sessionFocus = window.AmpsShlokaDeepNav?.loadNavSession?.()?.focus || null;
    const pending = state._pendingOccurrenceFocus || sessionFocus || null;
    const occParam = state.params.occurrence || null;
    const onShlokaVerses =
      state.params.parts[1] === "samskrta-shloka" && state.params.parts[2] === "ch-verses";
    // Route paraId wins over stale session focus (especially when opening a shloka record).
    const paraId = (state.params.parts[3] || pending?.paraId || "").trim() || null;
    const occurrenceId = onShlokaVerses
      ? null
      : ((pending?.occurrenceId || occParam || "").trim() || null);
    if (!occurrenceId && !paraId) {
      state._pendingOccurrenceFocus = null;
      return;
    }

    const el = findExactReaderTarget(paraId, occurrenceId);
    if (!el) {
      // Keep pending so later retries / scheduleOccurrenceFocus can still consume it.
      return;
    }

    state._pendingOccurrenceFocus = null;
    scrollReaderToExactElement(el, {
      ariaLabel: onShlokaVerses
        ? "Exact Samskrta Shloka verse"
        : "Exact source occurrence for shloka",
    });
    if (state._explicitReaderTarget?.paraId === paraId) {
      state._explicitReaderTarget = null;
    }

    const Deep = window.AmpsShlokaDeepNav;
    if (occurrenceId && Deep?.readerHash && location.hash && !String(location.hash).includes("occurrence=")) {
      try {
        const next = Deep.readerHash(state.params.parts[1], state.params.parts[2], paraId, occurrenceId);
        if (next && location.hash !== next) {
          programmaticNav = true;
          location.hash = next;
          setTimeout(() => { programmaticNav = false; }, 0);
        }
      } catch (_) {}
    }

    try {
      const sess = Deep?.loadNavSession?.();
      if (sess?.focus) {
        Deep.saveNavSession?.({ ...sess, focus: null });
      }
    } catch (_) {}
  }

  function goToShlokaFromSource(shlokaId, opts = {}) {
    if (!shlokaId) return;
    const Nav = window.AmpsCanonicalNav;
    const finish = (canonicalId) => {
      const fromBook = state.params.parts[1];
      const fromCh = state.params.parts[2];
      const fromPara = opts.paraId || state.params.parts[3] || visibleReaderParaId() || null;
      const occurrence =
        opts.occurrenceId || sourceOccurrenceId(canonicalId, fromCh, fromPara);
      state.ui.shlokaVerseQuery = "";
      state._explicitReaderTarget = {
        bookId: Nav?.SHLOKA_BOOK || "samskrta-shloka",
        chapterId: Nav?.SHLOKA_CHAPTER || "ch-verses",
        paraId: canonicalId,
      };
      state._pendingOccurrenceFocus = {
        occurrenceId: null,
        paraId: canonicalId,
        quoteText: "",
        bookId: Nav?.SHLOKA_BOOK || "samskrta-shloka",
        chapterId: Nav?.SHLOKA_CHAPTER || "ch-verses",
      };
      const canonicalTarget = Nav?.buildCanonicalSamskrtaTarget?.(canonicalId, {
        bookId: fromBook,
        chapterId: fromCh,
        paragraphId: fromPara,
        occurrenceId: occurrence,
      }) || {
        type: "canonical_samskrta",
        bookId: "samskrta-shloka",
        chapterId: "ch-verses",
        paragraphId: canonicalId,
      };
      const routeParams = Nav?.readerRouteParams?.(canonicalTarget) || {
        bookId: "samskrta-shloka",
        chapterId: "ch-verses",
        paraId: canonicalId,
        fromBook,
        fromChapter: fromCh,
        fromOccurrence: occurrence,
        fromPara,
      };
      if (fromBook && fromBook !== "samskrta-shloka") {
        const ret = {
          bookId: fromBook,
          chapterId: fromCh,
          paraId: fromPara,
          scrollY: window.scrollY,
          label: bookById(fromBook)?.title?.slice(0, 48) || "Source",
          occurrenceId: occurrence,
        };
        state.readingReturn = ret;
        state._shlokaNavCapture = true;
        window.AmpsShlokaDeepNav?.saveNavSession?.({
          kind: "source_to_shloka",
          return_to: ret,
          target_shloka_id: canonicalId,
          focus: state._pendingOccurrenceFocus,
        });
        saveState();
        navigate("read", routeParams);
        state._shlokaNavCapture = false;
        return;
      }
      goToChapter(routeParams.bookId, routeParams.chapterId, routeParams.paraId, { keepReturn: true });
    };

    const resolved = (window.AmpsCanonicalNav?.resolveStableShlokaId || resolveShlokaStableId)(shlokaId, state.shlokaIdAliases);
    if (resolved.ok && resolved.stableId) {
      finish(resolved.stableId);
      return;
    }
    loadShlokaIdAliases().then(() => {
      const again = (window.AmpsCanonicalNav?.resolveStableShlokaId || resolveShlokaStableId)(shlokaId, state.shlokaIdAliases);
      finish(again.ok && again.stableId ? again.stableId : shlokaId);
    }).catch(() => finish(shlokaId));
  }

  function sourceOpenShlokaChrome(bookId, chapterId, paraId, hit, opts = {}) {
    if (!hit?.paraId || bookId === "samskrta-shloka") return "";
    const occ = sourceOccurrenceId(hit.paraId, chapterId, paraId);
    const centered = opts.centered ? " source-shloka-actions-centered" : "";
    return `<div class="source-shloka-actions${centered}">
      <button type="button" class="shloka-open-from-source amps-samskrta-open-link"
        data-shloka-para="${esc(hit.paraId)}"
        data-occurrence="${esc(occ)}"
        data-from-book="${esc(bookId)}"
        data-from-ch="${esc(chapterId)}"
        data-from-para="${esc(paraId)}"
        title="Open this verse in Samskrta Shloka">Saḿskrta Shloka में देखें →</button>
    </div>`;
  }

  function sourceOpenShlokaChromeMulti(bookId, chapterId, paraId, hits, opts = {}) {
    const list = (Array.isArray(hits) ? hits : []).filter(h => h?.paraId);
    if (!list.length || bookId === "samskrta-shloka") return "";
    if (list.length === 1) return sourceOpenShlokaChrome(bookId, chapterId, paraId, list[0], opts);
    const centered = opts.centered ? " source-shloka-actions-centered" : "";
    const buttons = list.map((hit, idx) => {
      const occ = sourceOccurrenceId(hit.paraId, chapterId, paraId);
      const label = hit.label || `Source ${idx + 1}`;
      return `<button type="button" class="shloka-open-from-source amps-samskrta-open-link amps-samskrta-composite-target"
        data-shloka-para="${esc(hit.paraId)}"
        data-occurrence="${esc(occ)}"
        data-from-book="${esc(bookId)}"
        data-from-ch="${esc(chapterId)}"
        data-from-para="${esc(paraId)}"
        title="Open ${esc(label)} in Samskrta Shloka">${esc(label)} →</button>`;
    }).join("");
    return `<div class="source-shloka-actions amps-samskrta-composite-actions${centered}">
      <span class="amps-samskrta-composite-label">Saḿskrta Shloka स्रोत →</span>
      <div class="amps-samskrta-composite-targets">${buttons}</div>
    </div>`;
  }

  function sourceHitMatchesParagraph(hit, paraText) {
    if (!hit?.paraId) return false;
    const label = String(hit.label || "").trim();
    if (!label) return true; // allow chrome; deep-nav still works
    const compact = (s) => String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    const needle = compact(label).slice(0, 18);
    const hay = compact(paraText);
    return needle.length >= 10 && hay.includes(needle);
  }

  function rebuildShlokaSourceIndexesFromBook(book) {
    if (!book || book.id !== "samskrta-shloka") return;
    const index = {};
    const bySource = {};
    const ch = book.chapters?.find(c => c.id === "ch-verses");
    (ch?.paragraphs || []).forEach(p => {
      const label = String(p.sanskritRoman || p.summary?.[0] || "").split("\n")[0].slice(0, 72);
      (p.sources || []).forEach(s => {
        if (!s.bookId || !s.chapterId || !s.paraId) return;
        const key = shlokaSourceLookupKey(s.bookId, s.chapterId, s.paraId);
        if (index[key]) return;
        index[key] = { paraId: p.id, label };
        bySource[key] = p;
      });
    });
    state.shlokaSourceIndex = index;
    state.shlokaBySourceKey = bySource;
  }

  let shlokaIndexPromise = null;
  let shlokaEntriesPromise = null;
  let shlokaAliasPromise = null;
  let canonicalBindingsPromise = null;
  let canonicalOccurrencesIndexPromise = null;

  async function loadCanonicalOccurrencesIndex() {
    if (state.canonicalOccurrencesIndex) return state.canonicalOccurrencesIndex;
    if (!canonicalOccurrencesIndexPromise) {
      canonicalOccurrencesIndexPromise = fetch("data/indexes/canonical-shloka-occurrences.json?v=" + Date.now(), { cache: "no-store" })
        .then(res => (res.ok ? res.json() : { byCanonicalId: {} }))
        .catch(() => ({ byCanonicalId: {} }))
        .then(data => {
          state.canonicalOccurrencesIndex = data || { byCanonicalId: {} };
          return state.canonicalOccurrencesIndex;
        })
        .finally(() => { canonicalOccurrencesIndexPromise = null; });
    }
    return canonicalOccurrencesIndexPromise;
  }

  async function loadCanonicalBindings() {
    if (state.canonicalBindings) return state.canonicalBindings;
    if (!canonicalBindingsPromise) {
      canonicalBindingsPromise = fetch("data/canonical-bindings.json?v=" + Date.now(), { cache: "no-store" })
        .then(res => (res.ok ? res.json() : { bindings: [] }))
        .catch(() => ({ bindings: [] }))
        .then(data => {
          state.canonicalBindings = data || { bindings: [] };
          return state.canonicalBindings;
        })
        .finally(() => { canonicalBindingsPromise = null; });
    }
    return canonicalBindingsPromise;
  }

  function samskrtaUnitFromBlocks(blocks) {
    if (!Array.isArray(blocks)) return null;
    return blocks.find(b => {
      const t = String(b?.type || "");
      return t === "samskrta_unit" || t === "embedded_samskrta_unit";
    }) || null;
  }

  /** Authoritative canonical ID for navigation — source-index never overrides. */
  function resolveParagraphAuthoritativeCanonical(bookId, chapterId, para) {
    const bindingApi = window.AmpsCanonicalBinding;
    if (!bindingApi?.resolveAuthoritativeCanonicalId || !para) return null;
    const unit = samskrtaUnitFromBlocks(para.semanticBlocks);
    const linkStatus = unit?.canonicalLinkStatus || para.semanticBlocks?.[0]?.canonicalLinkStatus || "";
    const resolverId = String(unit?.canonicalShlokaId || "").trim();
    const blockedResolver = linkStatus === "ambiguous" || linkStatus === "unresolved";
    return bindingApi.resolveAuthoritativeCanonicalId({
      bookId,
      chapterId,
      paragraphId: para.id,
      semanticBlocks: para.semanticBlocks,
      registry: state.canonicalBindings,
      resolverStatus: blockedResolver ? "" : linkStatus,
      resolverCanonicalId: blockedResolver ? "" : resolverId,
    });
  }

  async function loadShlokaIdAliases() {
    if (state.shlokaIdAliases) return state.shlokaIdAliases;
    if (!shlokaAliasPromise) {
      shlokaAliasPromise = fetch("data/shloka-id-aliases.json?v=" + Date.now(), { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : { aliases: {} }))
        .catch(() => ({ aliases: {} }))
        .then((doc) => {
          state.shlokaIdAliases = doc?.aliases || doc || {};
          return state.shlokaIdAliases;
        })
        .finally(() => {
          shlokaAliasPromise = null;
        });
    }
    return shlokaAliasPromise;
  }

  function resolveShlokaStableId(shlokaId) {
    const Deep = window.AmpsShlokaDeepNav;
    if (!Deep?.resolveCanonicalShlokaId) {
      return { ok: true, stableId: String(shlokaId || "").trim(), redirected: false };
    }
    return Deep.resolveCanonicalShlokaId(shlokaId, state.shlokaIdAliases || {});
  }

  async function loadShlokaSourceIndex() {
    if (state.shlokaSourceIndex) return state.shlokaSourceIndex;
    if (!shlokaIndexPromise) {
      shlokaIndexPromise = fetch("data/shloka-source-index.json?v=" + Date.now(), { cache: "no-store" })
        .then(res => (res.ok ? res.json() : {}))
        .catch(() => ({}))
        .then(idx => {
          state.shlokaSourceIndex = normalizeLoadedShlokaSourceIndex(idx || {});
          return state.shlokaSourceIndex;
        })
        .finally(() => { shlokaIndexPromise = null; });
    }
    return shlokaIndexPromise;
  }

  async function loadShlokaEntriesMap() {
    await loadShlokaSourceIndex();
    if (state.shlokaBySourceKey) return state.shlokaBySourceKey;
    if (!shlokaEntriesPromise) {
      shlokaEntriesPromise = loadBook("samskrta-shloka")
        .then(book => {
          const bySource = {};
          const byCanonicalId = {};
          const ch = book.chapters?.find(c => c.id === "ch-verses");
          (ch?.paragraphs || []).forEach(p => {
            byCanonicalId[p.id] = p;
            (p.sources || []).forEach(s => {
              if (!s.bookId || !s.chapterId || !s.paraId) return;
              bySource[shlokaSourceLookupKey(s.bookId, s.chapterId, s.paraId)] = p;
            });
          });
          state.shlokaBySourceKey = bySource;
          state.shlokaByCanonicalId = byCanonicalId;
          return bySource;
        })
        .catch(() => {
          state.shlokaBySourceKey = {};
          return state.shlokaBySourceKey;
        })
        .finally(() => { shlokaEntriesPromise = null; });
    }
    return shlokaEntriesPromise;
  }

  function canonicalShlokaRecord(paraId) {
    const id = String(paraId || "").trim();
    if (!id) return null;
    return state.shlokaByCanonicalId?.[id] || null;
  }

  function captureReadingReturn(label) {
    const bookId = state.params.parts[1];
    const chapterId = state.params.parts[2];
    const paraId = state.params.parts[3] || null;
    if (!bookId || !chapterId) return;
    state.readingReturn = {
      bookId,
      chapterId,
      paraId,
      scrollY: window.scrollY,
      label: label || bookById(bookId)?.title?.slice(0, 48) || "Reading",
    };
    saveState();
  }

  function pendingShlokaReturn() {
    const ret = state.readingReturn;
    if (ret?.bookId === "samskrta-shloka" && /^ch-verses-p\d+/i.test(String(ret.paraId || ""))) {
      return ret;
    }
    const fromPara = String(state.params.fromPara || "").trim();
    if (state.params.fromBook === "samskrta-shloka" && /^ch-verses-p\d+/i.test(fromPara)) {
      return {
        bookId: "samskrta-shloka",
        chapterId: state.params.fromChapter || "ch-verses",
        paraId: fromPara,
        label: "Samskrta Shloka",
        scrollY: 0,
        occurrenceId: null,
      };
    }
    const sess = window.AmpsShlokaDeepNav?.loadNavSession?.();
    const home = sess?.return_to;
    if (home?.bookId === "samskrta-shloka" && /^ch-verses-p\d+/i.test(String(home.paraId || ""))) {
      return home;
    }
    return null;
  }

  function returnToExactShloka(ret) {
    const target = ret || pendingShlokaReturn();
    const paraId = String(target?.paraId || "").trim();
    if (!target?.bookId || !target.chapterId || !/^ch-verses-p\d+/i.test(paraId)) return false;
    state.readingReturn = null;
    saveState();
    state._shlokaNavCapture = true;
    state._explicitReaderTarget = {
      bookId: "samskrta-shloka",
      chapterId: "ch-verses",
      paraId,
    };
    state._pendingOccurrenceFocus = {
      occurrenceId: null,
      paraId,
      quoteText: "",
      bookId: "samskrta-shloka",
      chapterId: "ch-verses",
    };
    window.AmpsShlokaDeepNav?.clearNavSession?.();
    navigate("read", {
      bookId: "samskrta-shloka",
      chapterId: "ch-verses",
      paraId,
    });
    return true;
  }

  function returnFromReading() {
    const shlokaHome = pendingShlokaReturn();
    if (state.params.parts[1] !== "samskrta-shloka" && shlokaHome) {
      returnToExactShloka(shlokaHome);
      return;
    }
    const ret = state.readingReturn || shlokaHome;
    if (!ret?.bookId || !ret.chapterId) return;
    state.readingReturn = null;
    saveState();
    if (ret.occurrenceId || ret.paraId) {
      state._explicitReaderTarget = {
        bookId: ret.bookId,
        chapterId: ret.chapterId,
        paraId: ret.paraId || null,
      };
      state._pendingOccurrenceFocus = {
        occurrenceId: ret.occurrenceId || null,
        paraId: ret.paraId || null,
      };
      navigate("read", {
        bookId: ret.bookId,
        chapterId: ret.chapterId,
        paraId: ret.paraId,
        occurrence: ret.occurrenceId || undefined,
      });
      return;
    }
    navigate("read", { bookId: ret.bookId, chapterId: ret.chapterId, paraId: ret.paraId });
    if (ret.scrollY > 0) {
      setTimeout(() => window.scrollTo(0, ret.scrollY), 150);
    }
  }

  function visibleReaderParaId() {
    const paras = document.querySelectorAll("#readerArticle .reader-para[id]");
    if (!paras.length) return null;
    const topBar = 96;
    const mid = window.innerHeight * 0.38;
    let best = null;
    let bestScore = -Infinity;
    for (const el of paras) {
      const r = el.getBoundingClientRect();
      if (r.bottom <= topBar || r.top >= window.innerHeight - 48) continue;
      const center = (r.top + r.bottom) / 2;
      const score = -Math.abs(center - mid) + Math.min(r.height, window.innerHeight) * 0.001;
      if (score > bestScore) {
        bestScore = score;
        best = el.id;
      }
    }
    return best;
  }

  function showReaderToast(msg) {
    let el = document.getElementById("readerToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "readerToast";
      el.className = "reader-toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  function saveReadingProgress(bookId, chapterId, partial) {
    if (!bookId || !chapterId) return;
    const cur = state.progress[bookId] || {};
    state.progress[bookId] = {
      ...cur,
      chapterId,
      ...partial,
      updated: Date.now(),
    };
  }

  function readingResumeParams(bookId) {
    const p = state.progress[bookId];
    if (!p?.chapterId) return null;
    return {
      bookId,
      chapterId: p.chapterId,
      paraId: p.paraId || undefined,
      pageIndex: p.pageIndex,
    };
  }

  function navigateToReading(bookId, book) {
    const resume = readingResumeParams(bookId);
    if (resume) {
      navigate("read", resume);
      return;
    }
    const first = book?.chapters?.[0]?.id;
    if (!first) return alert("This book has no chapters yet.");
    navigate("read", { bookId, chapterId: first });
  }

  function goToChapterWithReturn(bookId, chapterId, paraId, opts = {}) {
    goToSourceOccurrence(bookId, chapterId, paraId, {
      shlokaId: opts.shlokaId || state.params.parts[3],
      occurrenceId: opts.occurrenceId,
      quoteText: opts.quoteText,
    });
  }

  function goToShlokaPara(paraId) {
    goToShlokaFromSource(paraId, {
      paraId: state.params.parts[3] || null,
      occurrenceId: state.params.occurrence || null,
    });
  }

  function renderReadingReturnBar() {
    const ret = pendingShlokaReturn() || state.readingReturn;
    if (!ret?.bookId || !ret.chapterId) return "";
    const curBook = state.params.parts[1];
    const showToDiscourse = curBook === "samskrta-shloka" && ret.bookId !== "samskrta-shloka";
    const showToShloka = curBook !== "samskrta-shloka" && ret.bookId === "samskrta-shloka";
    if (!showToDiscourse && !showToShloka) return "";
    const label = showToShloka
      ? "Samskrta Shloka"
      : (ret.occurrenceId ? "source occurrence" : ret.label);
    const btnLabel = showToShloka
      ? "← Back to same shloka"
      : (showToDiscourse && ret.occurrenceId ? "← Back to Book" : `← Back to ${label}`);
    return `<div class="reading-return-bar"><button type="button" class="btn btn-ghost btn-sm" id="btnReadingReturn">${esc(btnLabel)}</button></div>`;
  }

  function sourceLanguageLabel(lang) {
    const code = String(lang || "").toLowerCase();
    if (code === "hi") return "Hindi";
    if (code === "en") return "English";
    return code ? code.toUpperCase() : "";
  }

  function shlokaNavParams(targetId) {
    const params = {
      bookId: "samskrta-shloka",
      chapterId: "ch-verses",
      paraId: targetId,
    };
    if (state.params.fromBook) params.fromBook = state.params.fromBook;
    if (state.params.fromChapter) params.fromChapter = state.params.fromChapter;
    if (state.params.fromOccurrence) params.fromOccurrence = state.params.fromOccurrence;
    if (state.params.fromPara) params.fromPara = state.params.fromPara;
    return params;
  }

  function goToCanonicalShloka(targetId) {
    if (!targetId) return;
    goToShlokaFromSource(targetId, {
      paraId: state.params.fromPara || state.params.parts[3] || null,
      occurrenceId: state.params.fromOccurrence || state.params.occurrence || null,
    });
  }

  function renderCanonicalShlokaNav(rows, index) {
    const current = rows?.[index];
    if (!current?.id) return "";
    const nav = window.AmpsShlokaDeepNav?.activeNeighbors?.(rows, current.id);
    if (!nav?.ok) return "";
    const prevId = nav.prev?.id || "";
    const nextId = nav.next?.id || "";
    return `<nav class="canonical-shloka-nav" aria-label="Canonical shloka navigation">
      <button type="button" class="canonical-shloka-nav-btn" data-shloka-nav="${esc(prevId)}" ${prevId ? "" : "disabled"} aria-label="Previous verse">‹ Prev verse</button>
      <span class="canonical-shloka-nav-count">Shloka ${nav.visibleNumber} / ${rows.length}</span>
      <button type="button" class="canonical-shloka-nav-btn" data-shloka-nav="${esc(nextId)}" ${nextId ? "" : "disabled"} aria-label="Next verse">Next verse ›</button>
    </nav>`;
  }

  function shlokaMeaningSections(p) {
    const sections = [];
    if (p?.verseMeaning) sections.push({ label: "Meaning", text: p.verseMeaning, hindi: false });
    if (p?.hindiMeaning) sections.push({ label: "Hindi meaning", text: p.hindiMeaning, hindi: true });
    if (p?.wordMeaning) {
      const glossaryLabel = (p.verseMeaning || p.hindiMeaning) ? "Glossary" : "Word meaning";
      sections.push({ label: glossaryLabel, text: p.wordMeaning, hindi: false });
    }
    if (p?.englishMeaning) {
      sections.push({ label: "Discourse meaning", text: p.englishMeaning, hindi: false });
    }
    return sections;
  }

  function shlokaMeaningText(p) {
    return shlokaMeaningSections(p).map(s => s.text).filter(Boolean).join("\n\n");
  }

  function shlokaVerseSearchBlob(p) {
    const sources = shlokaSourcesList(p).map(s => `${s.bookTitle} ${s.chapterTitle}`).join(" ");
    return [
      p.sanskritRoman,
      p.devanagari,
      p.bangla,
      p.englishMeaning,
      p.verseMeaning,
      p.hindiMeaning,
      p.wordMeaning,
      sources,
    ].filter(Boolean).join("\n").toLowerCase();
  }

  /** First A–Z index letter from Roman (accents folded); empty if none. */
  function shlokaRomanAlpha(roman, fallbackDev) {
    const raw = String(roman || "").trim() || String(fallbackDev || "").trim();
    if (!raw) return "";
    const cleaned = raw
      .normalize("NFC")
      .replace(/^[\s'"“”‘’`]+/, "")
      .replace(/[\u0300-\u036f]/g, "");
    const ch = cleaned.charAt(0);
    if (!ch) return "";
    const upper = ch.toUpperCase();
    // Fold common Latin/Sanskrit letters with built-in diacritics into A–Z.
    const folded = upper
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const letter = folded.charAt(0);
    return /^[A-Z]$/.test(letter) ? letter : "";
  }

  function shlokaAlphaPresentSet(paras) {
    const set = new Set();
    (paras || []).forEach(p => {
      const L = shlokaRomanAlpha(p.sanskritRoman, p.devanagari);
      if (L) set.add(L);
    });
    return set;
  }

  /** First A–Z letter from any title (accents / leading quotes folded). */
  function titleAlphaLetter(text) {
    return shlokaRomanAlpha(text);
  }

  function renderAlphaNav(presentLetters, opts = {}) {
    const present = presentLetters instanceof Set ? presentLetters : new Set(presentLetters || []);
    const id = opts.id || "shlokaAlphaNav";
    const mode = opts.mode || "shloka";
    const aria = opts.ariaLabel || "Jump by first letter";
    const itemLabel = opts.itemLabel || "items";
    const letters = [];
    for (let i = 0; i < 26; i += 1) {
      const L = String.fromCharCode(65 + i);
      const enabled = present.has(L);
      letters.push(
        `<button type="button" class="shloka-alpha-letter${enabled ? "" : " is-disabled"}" data-alpha-jump="${L}" ${enabled ? "" : "disabled "}aria-label="Jump to ${itemLabel} starting with ${L}"${enabled ? "" : ' aria-disabled="true"'}>${L}</button>`
      );
    }
    return `<nav class="shloka-alpha-nav list-alpha-nav" id="${esc(id)}" data-alpha-mode="${esc(mode)}" aria-label="${esc(aria)}">${letters.join("")}</nav>`;
  }

  function renderShlokaAlphaNav(presentLetters) {
    return renderAlphaNav(presentLetters, {
      id: "shlokaAlphaNav",
      mode: "shloka",
      ariaLabel: "Jump by first letter",
      itemLabel: "verses",
    });
  }

  function refreshAlphaNavButtons(nav, presentLetters) {
    if (!nav) return;
    const present = presentLetters instanceof Set ? presentLetters : new Set(presentLetters || []);
    nav.querySelectorAll("[data-alpha-jump]").forEach(btn => {
      const L = btn.getAttribute("data-alpha-jump");
      const enabled = present.has(L);
      btn.disabled = !enabled;
      btn.classList.toggle("is-disabled", !enabled);
      btn.setAttribute("aria-disabled", enabled ? "false" : "true");
    });
  }

  function getShlokaVersesChapterParagraphs() {
    const bookId = state.params.parts[1];
    const chapterId = state.params.parts[2];
    if (bookId !== "samskrta-shloka" || chapterId !== "ch-verses") return [];
    const book = state.bookCache?.[bookId];
    const ch = book?.chapters?.find(c => c.id === chapterId);
    return ch?.paragraphs || [];
  }

  function shlokaAlphaPresentSetForQuery(query) {
    const rows = getShlokaVersesChapterParagraphs();
    const q = String(query || "").trim().toLowerCase();
    if (!rows.length) return new Set();
    if (!q) return shlokaAlphaPresentSet(rows);
    const set = new Set();
    rows.forEach(p => {
      if (!shlokaVerseSearchBlob(p).toLowerCase().includes(q)) return;
      const L = shlokaRomanAlpha(p.sanskritRoman, p.devanagari);
      if (L) set.add(L);
    });
    return set;
  }

  function refreshShlokaAlphaNav() {
    const nav = document.getElementById("shlokaAlphaNav");
    if (!nav) return;
    const fullRows = getShlokaVersesChapterParagraphs();
    if (fullRows.length) {
      refreshAlphaNavButtons(nav, shlokaAlphaPresentSetForQuery(state.ui.shlokaVerseQuery || ""));
      return;
    }
    const visible = new Set();
    document.querySelectorAll("#readerArticle .shloka-verse-entry:not(.shloka-verse-hidden)").forEach(el => {
      const L = String(el.dataset.alpha || "").toUpperCase();
      if (/^[A-Z]$/.test(L)) visible.add(L);
    });
    refreshAlphaNavButtons(nav, visible);
  }

  function scrollToAlphaTarget(target, opts = {}) {
    if (!target) return false;
    const flashClass = opts.flashClass || "shloka-alpha-flash";
    document.querySelectorAll(`.${flashClass}`).forEach(el => {
      el.classList.remove(flashClass);
    });

    // content-visibility:auto can make scrollIntoView a no-op for off-screen cards.
    const prevVisibility = target.style.contentVisibility;
    target.style.contentVisibility = "visible";
    target.classList.add(flashClass);

    const sticky = document.querySelector(".list-alpha-wrap, .shloka-verse-search-wrap");
    const topbar = document.querySelector(".topbar");
    const stickyH = sticky ? sticky.getBoundingClientRect().height : 0;
    const topbarH = topbar ? topbar.getBoundingClientRect().height : 0;
    void target.offsetTop;
    const y = window.scrollY + target.getBoundingClientRect().top - topbarH - stickyH - 8;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });

    window.setTimeout(() => {
      target.classList.remove(flashClass);
      target.style.contentVisibility = prevVisibility;
    }, 1400);
    return true;
  }

  function jumpToShlokaAlpha(letter) {
    const L = String(letter || "").toUpperCase();
    if (!/^[A-Z]$/.test(L)) return false;
    let target = document.querySelector(
      `#readerArticle .shloka-verse-entry[data-alpha="${L}"]:not(.shloka-verse-hidden)`
    );
    if (!target && state._shlokaLazyRender) {
      const ch = state.bookCache?.["samskrta-shloka"]?.chapters?.find(c => c.id === "ch-verses");
      const rows = ch?.paragraphs || [];
      const hit = rows.find(p => shlokaRomanAlpha(p.sanskritRoman, p.devanagari) === L);
      if (hit?.id) {
        navigate("read", { bookId: "samskrta-shloka", chapterId: "ch-verses", paraId: hit.id });
        return true;
      }
    }
    if (!target) return false;
    const ok = scrollToAlphaTarget(target, { flashClass: "shloka-alpha-flash" });
    if (ok) state.ui.activeParaId = target.dataset.para || target.id || null;
    return ok;
  }

  function jumpToDiscoursesAlpha(letter) {
    const L = String(letter || "").toUpperCase();
    if (!/^[A-Z]$/.test(L)) return false;
    const target =
      document.querySelector(`#discList .disc-alpha-head[data-alpha-head="${L}"]`) ||
      document.querySelector(`#discList .disc-item[data-alpha="${L}"]`);
    return scrollToAlphaTarget(target, { flashClass: "list-alpha-flash" });
  }

  function libraryAlphaPresentSet(qRaw) {
    const q = String(qRaw || "").toLowerCase();
    const set = new Set();
    (state.catalog.series || []).forEach(s => {
      if (!s?.id) return;
      const books = (s.books || [])
        .map(b => (b?.id ? bookById(b.id) || b : null))
        .filter(b => b?.id && (!bookEditionFamily(b.id) || b.id === bookEditionFamily(b.id).en))
        .filter(b => b?.id && (!q || textMatchesQuery(bookSearchBlob(b), q) || textMatchesQuery(s.title, q)));
      if (!books.length) return;
      const seriesL = titleAlphaLetter(s.title);
      if (seriesL) set.add(seriesL);
      books.forEach(b => {
        const bookL = titleAlphaLetter(b.title);
        if (bookL) set.add(bookL);
      });
    });
    return set;
  }

  function jumpToLibraryAlpha(letter) {
    const L = String(letter || "").toUpperCase();
    if (!/^[A-Z]$/.test(L)) return false;

    let target =
      document.querySelector(`#libBrowse .series-section[data-alpha="${L}"]`) ||
      document.querySelector(`#libBrowse .book-card[data-alpha="${L}"]`);

    if (!target) {
      // Book may sit in a collapsed series — expand the first match, then jump.
      const q = String(state.params.q || "").toLowerCase();
      const series = state.catalog.series || [];
      for (let i = 0; i < series.length; i += 1) {
        const s = series[i];
        if (!s?.id) continue;
        const books = (s.books || [])
          .map(b => (b?.id ? bookById(b.id) || b : null))
          .filter(b => b?.id && (!q || textMatchesQuery(bookSearchBlob(b), q) || textMatchesQuery(s.title, q)));
        const matchBook = books.find(b => titleAlphaLetter(b.title) === L);
        const matchSeries = titleAlphaLetter(s.title) === L;
        if (!matchBook && !matchSeries) continue;
        try {
          const collapsed = JSON.parse(localStorage.getItem("amps-series-collapsed") || "{}");
          if (collapsed[s.id]) {
            window.AmpsEnhance?.toggleSeries?.(s.id);
            updateLibraryBrowse();
          }
        } catch (_) { /* ignore */ }
        target =
          document.querySelector(`#libBrowse .series-section[data-series="${String(s.id).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`) ||
          document.querySelector(`#libBrowse .book-card[data-alpha="${L}"]`);
        if (matchBook) {
          const bookSel = String(matchBook.id).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
          target =
            document.querySelector(`#libBrowse .book-card[data-book="${bookSel}"]`) ||
            target;
        }
        break;
      }
    }

    return scrollToAlphaTarget(target, { flashClass: "list-alpha-flash" });
  }

  function jumpAlphaFromButton(btn) {
    const letter = btn?.getAttribute?.("data-alpha-jump");
    const mode = btn?.closest?.("nav")?.dataset?.alphaMode || "shloka";
    if (mode === "discourses") return jumpToDiscoursesAlpha(letter);
    if (mode === "library") return jumpToLibraryAlpha(letter);
    return jumpToShlokaAlpha(letter);
  }

  function bindShlokaAlphaNav() {
    const nav = document.getElementById("shlokaAlphaNav");
    if (!nav) return;
    // Re-bind on every chapter render (DOM is replaced).
    if (nav.dataset.bound === "1") return;
    nav.dataset.bound = "1";
    nav.addEventListener("click", e => {
      const btn = e.target.closest?.("[data-alpha-jump]");
      if (!btn || btn.disabled || btn.classList.contains("is-disabled")) return;
      e.preventDefault();
      e.stopPropagation();
      jumpAlphaFromButton(btn);
    });
  }

  function ensureShlokaVersesDisplay() {
    const mode = state.settings.shlokaScriptMode;
    if (!mode || mode === "all") {
      const preset = SHLOKA_SCRIPT_PRESETS.dev;
      state.settings.shlokaScriptMode = "dev";
      state.settings.shlokaScripts = scriptFlagsFromPreset(preset);
      saveState();
    }
  }

  function filterShlokaVerses(query) {
    const q = String(query || "").trim().toLowerCase();
    const paras = document.querySelectorAll("#readerArticle .shloka-verse-entry");
    const totalAll = getShlokaVersesChapterParagraphs().length || paras.length;
    let shown = 0;
    paras.forEach(el => {
      const hay = el.dataset.search || "";
      const ok = !q || hay.includes(q);
      el.classList.toggle("shloka-verse-hidden", !ok);
      if (ok) shown += 1;
    });
    const countEl = document.getElementById("shlokaVerseCount");
    if (countEl) {
      countEl.textContent = q
        ? `${shown} of ${totalAll} verses`
        : `${totalAll} verses · tap a letter to jump`;
    }
    refreshShlokaAlphaNav();
  }
  function renderWordMeaning(text) {
    const charted = window.AmpsShlokaFormat?.scholarlyRomanToAmpsChart?.(text) || text;
    const raw = String(charted || "").trim();
    if (!raw) return "";
    const glossaryHtml = renderGlossaryFriendly(raw);
    if (glossaryHtml) return glossaryHtml;
    const parts = raw.split(/(\[\[[^\]]+\]\])/g);
    let out = "";
    for (const part of parts) {
      const m = part.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
      if (m) {
        const paraId = m[1].trim();
        const label = (m[2] || m[1]).trim();
        out += `<button type="button" class="shloka-ref-link" data-shloka-para="${esc(paraId)}">${esc(label)}</button>`;
      } else {
        out += esc(part);
      }
    }
    return out.replace(/\n/g, "<br>");
  }

  /** Parse "देवनागरी (roman) = english / hindi" lines into a readable glossary. */
  function parseGlossaryLines(text) {
    const lines = String(text || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return null;
    const items = [];
    for (const line of lines) {
      const m = line.match(
        /^(.+?)\s*\(([^)]+)\)\s*=\s*(.+)$/
      );
      if (!m) return null;
      const gloss = m[3].trim();
      let english = gloss;
      let hindi = "";
      const slash = gloss.match(/^(.*?)\s*\/\s*(.+)$/);
      if (slash) {
        english = slash[1].trim();
        hindi = slash[2].trim();
      }
      items.push({
        head: m[1].trim(),
        roman: window.AmpsShlokaFormat?.scholarlyRomanToAmpsChart?.(m[2].trim()) || m[2].trim(),
        english,
        hindi,
      });
    }
    return items.length ? items : null;
  }

  function renderGlossaryFriendly(text) {
    const items = parseGlossaryLines(text);
    if (!items) return "";
    const rows = items.map((it) => {
      const meaningBits = [
        it.english ? `<span class="shloka-gloss-en">${esc(it.english)}</span>` : "",
        it.hindi ? `<span class="shloka-gloss-hi">${esc(it.hindi)}</span>` : "",
      ].filter(Boolean).join("");
      return `<div class="shloka-gloss-row">
        <div class="shloka-gloss-term">
          <span class="shloka-gloss-dev">${esc(it.head)}</span>
          <span class="shloka-gloss-roman">${esc(it.roman)}</span>
        </div>
        <div class="shloka-gloss-meanings">${meaningBits}</div>
      </div>`;
    }).join("");
    return `<div class="shloka-glossary">${rows}</div>`;
  }

  function renderShlokaReferences(refs) {
    if (!Array.isArray(refs) || !refs.length) return "";
    const items = refs.map(r => {
      const paraId = r.paraId || r.id;
      const label = r.label || paraId;
      return `<button type="button" class="shloka-ref-link" data-shloka-para="${esc(paraId)}">${esc(label)}</button>`;
    }).join("");
    return `<div class="shloka-refs"><span class="shloka-sources-label">See also</span><div class="shloka-sources-list">${items}</div></div>`;
  }

  function renderShlokaCrossLink(bookId, chapterId, paraId) {
    const hit = state.shlokaSourceIndex?.[shlokaSourceLookupKey(bookId, chapterId, paraId)];
    const norm = window.AmpsShlokaDeepNav?.normalizeSourceIndexEntry?.(hit) || hit;
    if (!norm?.paraId) return "";
    return sourceOpenShlokaChrome(bookId, chapterId, paraId, norm);
  }

  function renderShlokaOriginalSource(p) {
    const raw = p?.original_source;
    if (!raw || typeof raw !== "object") return "";
    const loc = raw.source_locator || {};
    const has =
      String(raw.source_title || "").trim() ||
      String(raw.source_category || "").trim() ||
      String(raw.source_reference || "").trim() ||
      String(raw.source_author_or_tradition || "").trim() ||
      String(raw.source_text_verified || "").trim() ||
      Object.values(loc).some((v) => String(v || "").trim());
    if (!has) return "";

    const rows = [];
    const push = (label, value) => {
      const v = String(value || "").trim();
      if (!v) return;
      rows.push(
        `<div class="shloka-original-source-row"><span class="shloka-original-source-key">${esc(label)}</span>` +
          `<span class="shloka-original-source-val">${esc(v)}</span></div>`
      );
    };

    if (raw.source_title) push("Original source", raw.source_title);
    else if (raw.source_category) push("Original source", raw.source_category);
    push("Category", raw.source_category);
    // Prefer the common reader-facing locator fields first.
    push("Chapter", loc.chapter);
    push("Section", loc.section);
    push("Verse", loc.verse);
    push("Part", loc.part);
    push("Maṇḍala", loc.mandala);
    push("Sūkta", loc.sukta);
    push("Mantra", loc.mantra);
    push("Adhyāya", loc.adhyaya);
    push("Vallī", loc.valli);
    push("Khaṇḍa", loc.khanda);
    push("Parvan", loc.parvan);
    push("Kāṇḍa", loc.kanda);
    push("Sarga", loc.sarga);
    push("Skandha", loc.skandha);
    push("Vagga", loc.vagga);
    push("Canto", loc.canto);
    if (loc.additional) push("Additional", loc.additional);
    push("Reference", raw.source_reference);
    push("Tradition", raw.source_author_or_tradition);
    push("Verification", raw.source_text_verified);
    if (raw.quotation_type) push("Quotation type", String(raw.quotation_type).replace(/_/g, " "));

    if (!rows.length) return "";
    return `<div class="shloka-original-source">
      <span class="shloka-sources-label">Original source</span>
      <div class="shloka-original-source-list">${rows.join("")}</div>
    </div>`;
  }

  function renderShlokaSources(p) {
    const sources = shlokaSourcesList(p);
    const originalHtml = renderShlokaOriginalSource(p);
    if (!sources.length) return originalHtml;
    const counts = {};
    sources.forEach(s => {
      const k = `${s.bookId}|${s.chapterId}`;
      counts[k] = (counts[k] || 0) + 1;
    });
    const seen = {};
    const items = sources.map(s => {
      const bookCh = `${s.bookId}|${s.chapterId}`;
      seen[bookCh] = (seen[bookCh] || 0) + 1;
      const multi = counts[bookCh] > 1;
      const occ = sourceOccurrenceId(p.id, s.chapterId, s.paraId);
      const bits = [s.bookTitle, s.chapterTitle].filter(Boolean);
      const language = sourceLanguageLabel(s.language);
      if (language) bits.push(language);
      if (s.paraId) bits.push(s.paraId);
      if (multi) bits.push(`occurrence ${seen[bookCh]}`);
      const label = bits.join(" · ");
      return `<button type="button" class="shloka-source-link"
        data-book="${esc(s.bookId)}"
        data-ch="${esc(s.chapterId)}"
        ${s.paraId ? `data-para="${esc(s.paraId)}"` : ""}
        ${occ ? `data-occurrence="${esc(occ)}"` : ""}
        data-shloka-id="${esc(p.id)}"
        title="Open exact source occurrence">${esc(label)}</button>`;
    }).join("");
    const label = sources.length === 1 ? "AMPS source" : `AMPS sources (${sources.length})`;
    return `${originalHtml}<details class="shloka-sources shloka-sources-collapsible shloka-collapsible-panel">
      <summary class="shloka-sources-label shloka-collapsible-label">${esc(label)}</summary>
      <div class="shloka-sources-list shloka-collapsible-body">${items}</div>
    </details>`;
  }

  function renderShlokaBlockLines(blocks, inline) {
    const body = blocks.map(bl => {
      if (bl.kind === "meaning") {
        const label = bl.label || (bl.english ? "English meaning" : "Word meaning");
        const hindiCls = bl.hindi ? " shloka-meaning-hindi" : "";
        return `<div class="shloka-line shloka-meaning${hindiCls}"><span class="shloka-meaning-label">${esc(label)}</span>${renderWordMeaning(bl.text)}</div>`;
      }
      const fmt = window.AmpsShlokaFormat;
      const raw = String(bl.text);
      let formatted = raw;
      if (bl.kind === "roman") formatted = fmt?.formatRomanDisplay?.(raw) || raw;
      else if (["dev", "bng", "or", "pa", "kn", "te"].includes(bl.kind)) {
        formatted = fmt?.formatIndicDisplay?.(raw) || raw;
      }
      return String(formatted).split("\n").filter(row => row.length > 0).map(row =>
        `<span class="shloka-line shloka-${bl.kind}">${esc(row)}</span>`
      ).join("");
    }).join("");
    if (inline) return `<div class="shloka-verse-block">${body}</div>`;
    return body;
  }

  function buildShlokaBlocks(p, prefs) {
    const blocks = [];
    if (p.sanskritRoman && prefs.roman) blocks.push({ kind: "roman", text: p.sanskritRoman });
    if (p.devanagari && prefs.dev) blocks.push({ kind: "dev", text: p.devanagari });
    if (p.bangla && prefs.bng) blocks.push({ kind: "bng", text: p.bangla });
    if (p.oriya && prefs.oriya) blocks.push({ kind: "or", text: p.oriya });
    if (p.punjabi && prefs.punjabi) blocks.push({ kind: "pa", text: p.punjabi });
    if (p.kannada && prefs.kannada) blocks.push({ kind: "kn", text: p.kannada });
    if (p.telugu && prefs.telugu) blocks.push({ kind: "te", text: p.telugu });
    const meaningSections = prefs.meaning ? shlokaMeaningSections(p) : [];
    meaningSections.forEach(section => {
      blocks.push({
        kind: "meaning",
        text: section.text,
        label: section.label,
        hindi: section.hindi,
        english: section.label === "Discourse meaning" || section.label === "Meaning",
      });
    });
    if (!blocks.length && p.text) {
      if (prefs.roman && p.sanskritRoman) blocks.push({ kind: "roman", text: p.sanskritRoman });
      else if (prefs.dev && p.devanagari) blocks.push({ kind: "dev", text: p.devanagari });
      else if (prefs.bng && p.bangla) blocks.push({ kind: "bng", text: p.bangla });
      else if (prefs.oriya && p.oriya) blocks.push({ kind: "or", text: p.oriya });
      else if (prefs.punjabi && p.punjabi) blocks.push({ kind: "pa", text: p.punjabi });
      else if (prefs.kannada && p.kannada) blocks.push({ kind: "kn", text: p.kannada });
      else if (prefs.telugu && p.telugu) blocks.push({ kind: "te", text: p.telugu });
      else if (prefs.meaning && meaningSections.length) {
        meaningSections.forEach(section => {
          blocks.push({
            kind: "meaning",
            text: section.text,
            label: section.label,
            hindi: section.hindi,
            english: section.label === "Discourse meaning" || section.label === "Meaning",
          });
        });
      }
    }
    return blocks;
  }

  function renderShlokaScriptsOnly(p) {
    const prefs = { ...getShlokaScriptPrefs(), meaning: false };
    const blocks = buildShlokaBlocks(p, prefs).filter(bl => bl.kind !== "meaning");
    if (!blocks.length) return `<span class="muted">No text for this script mode.</span>`;
    return renderShlokaBlockLines(blocks, true);
  }

  function renderShlokaMeaningOnly(p) {
    const sections = shlokaMeaningSections(p);
    if (!sections.length) return "";
    return sections.map(section => {
      const hindiCls = section.hindi ? " shloka-meaning-hindi" : "";
      return `<div class="shloka-meaning-section${hindiCls}">
        <h4 class="shloka-meaning-sublabel">${esc(section.label)}</h4>
        <div class="shloka-meaning-section-body">${renderWordMeaning(section.text)}</div>
      </div>`;
    }).join("");
  }

  function renderShlokaBody(p, opts) {
    const inline = !!(opts && opts.inline);
    const prefs = getShlokaScriptPrefs();
    const blocks = buildShlokaBlocks(p, prefs);
    if (!blocks.length && p.text && !p.sanskritRoman && !p.devanagari) {
      return esc(p.text).replace(/\n/g, "<br>");
    }
    if (!blocks.length) {
      return `<span class="muted">No text for this display mode.</span>${renderShlokaSources(p)}`;
    }
    const body = renderShlokaBlockLines(blocks, false);
    if (inline) {
      const scriptBlocks = blocks.filter(bl => bl.kind !== "meaning");
      if (!scriptBlocks.length) return `<span class="muted">No text for this display mode.</span>`;
      return renderShlokaBlockLines(scriptBlocks, true);
    }
    return body + renderShlokaReferences(p.references) + renderShlokaSources(p);
  }

  function renderDiscourseRomanShloka(text, ch) {
    const fmt = window.AmpsShlokaFormat;
    // Drop leading "(3)" discourse numbers so the verse centers cleanly
    const cleaned = String(text || "").replace(/^\(\s*\d+\s*\)\s*/, "").trim();
    // Multi-line verse (merged consecutive EE lines): format as one block
    const parts = cleaned.split(/\n+/).map(s => s.trim()).filter(Boolean);
    let display;
    if (parts.length > 1 && fmt?.formatRomanDisplay) {
      display = parts.map((ln, i) => {
        const body = String(fmt.formatRomanDisplay(ln) || ln)
          .replace(/^\[+/, "")
          .replace(/\]+\.?\s*$/, "")
          .replace(/[|।॥]+\s*$/g, "")
          .trim();
        const mark = i % 2 === 0 ? (fmt.PADA_PIPE || "|") : "||";
        return body + mark;
      }).join("\n");
    } else {
      display = fmt?.formatRomanDisplay?.(cleaned) || cleaned;
      display = String(display).replace(/^\[+/, "").replace(/\]+\.?\s*$/, "");
    }
    const lines = String(display).split("\n").filter(Boolean);
    const body = lines.map(ln =>
      `<span class="shloka-line shloka-roman discourse-shloka">${linkParaFootnotes(ln, ch)}</span>`
    ).join("");
    return `<span class="shloka-verse-block">${body}</span>`;
  }

  function isDiscourseDevanagariVersePara(p) {
    if (!p) return false;
    if (p.contentType === "verse" || p.renderType === "shloka") return true;
    const IT = window.AmpsIndicText;
    if (IT?.looksLikeVerse?.(p.text)) return true;
    return isRoleShlokaVerseLine(p);
  }

  /** Short Devanagari lines the source tagged as shloka (songs, dohas without dandas). */
  function isRoleShlokaVerseLine(p) {
    if (String(p?.displayRole || "").toLowerCase() !== "shloka") return false;
    const text = String(p.text || "").trim();
    if (!text || text.length > 120 || !/[\u0900-\u097f]/.test(text)) return false;
    return !window.AmpsIndicText?.looksLikeProse?.(text);
  }

  /** Source tagged the paragraph as shloka but it reads as ordinary Hindi prose. */
  function isMisTaggedShlokaProse(p) {
    if (String(p?.displayRole || "").toLowerCase() !== "shloka") return false;
    return !!window.AmpsIndicText?.looksLikeProse?.(p.text);
  }

  function renderDiscourseDevanagariVerse(text, ch) {
    const parts = String(text || "").split(/\n+/).map(s => s.trim()).filter(Boolean);
    const body = parts.map(ln =>
      `<span class="shloka-line shloka-dev discourse-shloka" lang="sa-Deva">${linkParaFootnotes(ln, ch)}</span>`
    ).join("");
    return `<span class="shloka-verse-block discourse-dev-verse">${body}</span>`;
  }

  /** Dev + Roman discourse verse as one centered Samskrta unit. */
  function renderDiscourseSamskrtaUnit(devText, romanText, ch) {
    const devHtml = renderDiscourseDevanagariVerse(devText, ch);
    const romanHtml = romanText ? renderDiscourseRomanShloka(romanText, ch) : "";
    return `<div class="amps-samskrta-unit amps-discourse-shloka-unit">${devHtml}${romanHtml}</div>`;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  let renderGen = 0;
  let programmaticNav = false;

  function nextRenderGen() {
    return ++renderGen;
  }

  function renderStale(gen) {
    return gen != null && gen !== renderGen;
  }

  function routeSnapshot() {
    return {
      route: state.route,
      parts: state.params.parts?.slice() || [],
    };
  }

  function routeChanged(snap) {
    const parts = state.params.parts || [];
    return state.route !== snap.route || parts.join("/") !== snap.parts.join("/");
  }

  let catalogPromise = null;
  const READER_ASSET_BASE = (() => {
    try {
      const scriptUrl = document.currentScript?.src || "amps-reader-app.js";
      return new URL(".", new URL(scriptUrl, location.href));
    } catch (_) {
      return new URL("./", location.href);
    }
  })();

  function readerAssetUrl(path) {
    return new URL(String(path || "").replace(/^\.\//, ""), READER_ASSET_BASE).toString();
  }

  async function loadCatalog(force) {
    if (state.catalog && !force) return state.catalog;
    if (force) {
      state.catalog = null;
      catalogPromise = null;
    }
    if (!catalogPromise) {
      const catalogUrl = new URL(readerAssetUrl("data/catalog.json"));
      catalogUrl.searchParams.set("v", Date.now().toString());
      catalogPromise = fetch(catalogUrl.toString(), { cache: "no-store" })
        .then(res => {
          if (!res.ok) throw new Error("Library catalog not found (" + res.status + ")");
          return res.json();
        })
        .then(async c => {
          if (!c?.books?.some(b => b.id === "samskrta-shloka")) {
            try {
              const res = await fetch(readerAssetUrl("data/books/samskrta-shloka.json"), { cache: "no-store" });
              if (res.ok) patchSamskrtaShlokaCatalog(c, await res.json());
            } catch (_) { /* catalog patch optional */ }
          }
          state.catalog = c;
          return c;
        })
        .finally(() => { catalogPromise = null; });
    }
    return catalogPromise;
  }

  async function ensureSearchCatalog() {
    await loadCatalog();
    const expected = state.catalog?.generatedAt;
    const stamp = sessionStorage.getItem("amps-catalog-stamp");
    const missingShloka = !state.catalog?.books?.some(b => b.id === "samskrta-shloka");
    if (missingShloka || (expected && stamp && stamp !== expected)) {
      await loadCatalog(true);
    }
    if (state.catalog?.generatedAt) {
      sessionStorage.setItem("amps-catalog-stamp", state.catalog.generatedAt);
    }
    return state.catalog;
  }

  async function resolveMissingBookPack(bookId) {
    try {
      const covUrl = readerAssetUrl("data/offline-coverage.json");
      const covRes = await fetch(covUrl, { cache: "no-store" });
      if (covRes.ok) {
        const cov = await covRes.json();
        const hit = (cov.bundledBooks || []).find((b) => b.bookId === bookId);
        if (hit) return null;
      }
      const exclUrl = readerAssetUrl("data/excluded-content-inventory.json");
      const exclRes = await fetch(exclUrl, { cache: "no-store" });
      if (exclRes.ok) {
        const excl = await exclRes.json();
        const row = (excl.books || []).find((b) => b.bookId === bookId);
        if (row?.requiredPack) return row.requiredPack;
      }
      if (window.AmpsPackManager?.listAvailable) {
        const packs = await window.AmpsPackManager.listAvailable();
        for (const p of packs) {
          if (String(p.status || "").startsWith("BLOCKED") || !p.manifestPath) continue;
          try {
            const man = await fetch(
              readerAssetUrl(
                p.manifestPath.startsWith("packs/") ? `data/${p.manifestPath}` : p.manifestPath
              ),
              { cache: "no-store" }
            ).then((r) => (r.ok ? r.json() : null));
            if (man?.files?.some((f) => f.path === `books/${bookId}.json`)) {
              return {
                packId: p.packId,
                title: p.title || p.packId,
                sizeBytes: p.sizeBytes || 0,
                archiveFileName: p.archiveFileName || null,
              };
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
    return null;
  }

  async function loadBook(bookId) {
    if (state.bookCache[bookId]) return state.bookCache[bookId];
    if (state.importedBooks[bookId]) {
      state.bookCache[bookId] = state.importedBooks[bookId];
      return state.importedBooks[bookId];
    }
    const url = readerAssetUrl("data/books/" + bookId + ".json");
    // Book JSON is editable local content; never reuse a stale HTTP response after an import.
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const pack = await resolveMissingBookPack(bookId);
      const err = new Error("Book file not found: " + bookId);
      err.code = "NOT_DOWNLOADED";
      err.requiredPack = pack;
      throw err;
    }
    const book = await res.json();
    if (!book?.chapters?.length) throw new Error("Book has no chapters: " + bookId);
    window.AmpsIndicText?.normalizeBook?.(book);
    if (bookId === "samskrta-shloka") {
      window.AmpsShlokaBookEditor?.applyOverride?.(book);
      if (book?.id === "samskrta-shloka" && !book._romanFieldsNormalized) {
        const chVerses = book.chapters?.find(c => c.id === "ch-verses");
        const normalize = () => {
          chVerses?.paragraphs?.forEach(para => window.AmpsShlokaFormat?.normalizeParaRomanFields?.(para));
          book._romanFieldsNormalized = true;
        };
        if (typeof requestIdleCallback === "function") requestIdleCallback(normalize, { timeout: 1200 });
        else setTimeout(normalize, 0);
      }
    }
    state.bookCache[bookId] = book;
    if (window.AmpsStudy) AmpsStudy.ensureCards(state, book);
    return book;
  }

  function parseRoute() {
    const hash = (location.hash || "#today").slice(1);
    const [path, query] = hash.split("?");
    const parts = path.split("/").filter(Boolean);
    state.route = parts[0] || "library";
    state.params = { parts };
    if (query) {
      new URLSearchParams(query).forEach((v, k) => { state.params[k] = v; });
    }
  }

  function applyRoute(route, params) {
    const p = params || {};
    const parts = [route];
    if (route === "sutra-game" || route === "shloka-game") {
      if (p.chapterId) parts.push(p.chapterId);
    } else if (route === "paths" && p.pathId) parts.push(p.pathId);
    else {
      if (p.bookId) parts.push(p.bookId);
      if (route === "read" && p.bookId && !p.chapterId) {
        const prog = state.progress[p.bookId];
        if (prog?.chapterId) {
          parts.push(prog.chapterId);
          if (!p.paraId && prog.paraId) parts.push(prog.paraId);
        }
      } else if (p.chapterId) parts.push(p.chapterId);
      if (p.paraId && parts[parts.length - 1] !== p.paraId) parts.push(p.paraId);
    }
    state.route = route;
    state.params = { parts };
    if (p.query) state.params.q = p.query;
    if (p.occurrence) state.params.occurrence = p.occurrence;
    if (p.fromBook) state.params.fromBook = p.fromBook;
    if (p.fromChapter) state.params.fromChapter = p.fromChapter;
    if (p.fromOccurrence) state.params.fromOccurrence = p.fromOccurrence;
    if (p.fromPara) state.params.fromPara = p.fromPara;
    state.ui.drawer = null;
    if (p.chapterId || (route === "read" && p.bookId && state.progress[p.bookId]?.chapterId)) {
      const chapterId = p.chapterId || state.progress[p.bookId]?.chapterId;
      const prog = p.bookId ? state.progress[p.bookId] : null;
      if (p.pageIndex != null) state.ui.pageIndex = p.pageIndex;
      else if (prog?.chapterId === chapterId && prog.pageIndex != null && !p.paraId) {
        state.ui.pageIndex = prog.pageIndex;
      } else if (!p.paraId) {
        state.ui.pageIndex = 0;
      }
    }
  }

  function routeHash(route, params) {
    const p = params || {};
    let hash = "#" + route;
    if (route === "paths" && p.pathId) hash += "/" + p.pathId;
    else {
      if (p.bookId) hash += "/" + p.bookId;
      if (p.chapterId) hash += "/" + p.chapterId;
      if (p.paraId) hash += "/" + p.paraId;
    }
    const q = [];
    if (p.query) q.push("q=" + encodeURIComponent(p.query));
    if (p.occurrence) q.push("occurrence=" + encodeURIComponent(p.occurrence));
    if (p.fromBook) q.push("fromBook=" + encodeURIComponent(p.fromBook));
    if (p.fromChapter) q.push("fromChapter=" + encodeURIComponent(p.fromChapter));
    if (p.fromOccurrence) q.push("fromOccurrence=" + encodeURIComponent(p.fromOccurrence));
    if (p.fromPara) q.push("fromPara=" + encodeURIComponent(p.fromPara));
    if (q.length) hash += "?" + q.join("&");
    return hash;
  }

  function syncHash(full) {
    if (location.hash === full) return;
    try { location.hash = full; } catch (_) { /* ignore */ }
  }

  function navigate(route, params) {
    const p = params || {};
    const prevChapter = state.route === "read" ? state.params.parts[2] : null;
    const prevBook = state.route === "read" ? state.params.parts[1] : null;
    applyRoute(route, p);
    programmaticNav = true;
    state._navLockUntil = Date.now() + 500;
    syncHash(routeHash(route, p));
    renderFromState();
    const prog = p.bookId ? state.progress[p.bookId] : null;
    const resumingChapter = route === "read" && prog?.chapterId === p.chapterId && !p.paraId;
    const hasExactTarget = !!(p.paraId || p.occurrence);
    // Never reset to chapter top when opening an exact paragraph/occurrence.
    if (!hasExactTarget) {
      if (route === "read" && p.chapterId && p.chapterId !== prevChapter && !resumingChapter) {
        window.scrollTo(0, 0);
      } else if (route === "read" && p.bookId !== prevBook) {
        window.scrollTo(0, 0);
      }
    }
    setTimeout(() => { programmaticNav = false; }, 500);
  }

  function goToChapter(bookId, chapterId, paraId, opts = {}) {
    if (!bookId || !chapterId) return;
    if (bookId === "samskrta-shloka" && !state._shlokaNavCapture) {
      // Keep return when arriving from source via Open Shloka
      if (!opts.keepReturn) {
        state.readingReturn = null;
        saveState();
      }
    }
    state._shlokaNavCapture = false;
    navigate("read", {
      bookId,
      chapterId,
      paraId,
      occurrence: opts.occurrence,
      fromBook: opts.fromBook,
      fromChapter: opts.fromChapter,
      fromOccurrence: opts.fromOccurrence,
      fromPara: opts.fromPara,
    });
  }

  function syncReaderDrawers() {
    const d = state.ui.drawer;
    document.getElementById("readerDrawer")?.classList.toggle("open", d === "toc");
    document.getElementById("settingsDrawer")?.classList.toggle("open", d === "settings");
    document.getElementById("glossaryDrawer")?.classList.toggle("open", d === "glossary");
  }

  function toggleReaderDrawer(which) {
    state.ui.drawer = state.ui.drawer === which ? null : which;
    syncReaderDrawers();
  }

  function toggleImmersiveMode() {
    state.settings.immersive = !state.settings.immersive;
    document.body.classList.toggle("immersive", !!state.settings.immersive);
    saveState();
    refreshReaderSheet();
  }

  function applyReaderSettingsLive() {
    const s = state.settings;
    document.documentElement.dataset.theme = s.theme;
    document.documentElement.style.setProperty("--reader-size", s.fontSize + "px");
    document.documentElement.style.setProperty("--reader-lh", s.lineHeight);
    document.documentElement.style.setProperty("--reader-brightness", (s.brightness || 100) + "%");
    document.documentElement.style.setProperty("--reader-margin", (s.marginH || 1) + "rem");
    document.documentElement.dataset.width = s.readerWidth;
    const fontMap = { serif: "serif", sans: "dm", dyslexia: "dyslexia" };
    document.documentElement.dataset.font = fontMap[s.fontFamily] || s.fontFamily || "serif";
    document.documentElement.dataset.focus = s.focusLine ? "on" : "off";
    document.documentElement.dataset.textAlign = s.textAlign || "justify";
    const fv = document.getElementById("fontVal");
    if (fv) fv.textContent = s.fontSize;
  }

  async function handleReaderToolbar(action) {
    const bookId = state.params.parts[1];
    const chapterId = state.params.parts[2];
    if (!bookId || state.route !== "read") return;
    switch (action) {
      case "toc":
        toggleReaderDrawer("toc");
        return;
      case "settings":
        toggleReaderDrawer("settings");
        return;
      case "glossary":
        toggleReaderDrawer("glossary");
        return;
      case "study": {
        if (state.productivity?.studyPanelOpen) {
          window.AmpsProductivity?.toggleStudyPanel?.(false);
          return;
        }
        const book = await loadBook(bookId);
        const ch = book.chapters.find(c => c.id === chapterId) || book.chapters[0];
        window.AmpsProductivity?.toggleStudyPanel?.(true, { bookId, chapterId, book, ch });
        return;
      }
      case "immersive":
        toggleImmersiveMode();
        return;
      case "present":
        navigate("present", { bookId, chapterId });
        return;
      case "summary": {
        const book = await loadBook(bookId);
        showChapterSummary(book, chapterId);
        return;
      }
      case "share": {
        const book = await loadBook(bookId);
        const ch = book.chapters.find(c => c.id === chapterId) || book.chapters[0];
        const t = (ch?.paragraphs || []).map(p => p.text).join("\n\n").slice(0, 800);
        window.AmpsEnhance?.sharePassage(book, ch, t);
        return;
      }
      case "bookmark": {
        const book = await loadBook(bookId);
        const ch = book.chapters.find(c => c.id === chapterId) || book.chapters[0];
        const paraId = activeReaderParaId(ch?.paragraphs?.[0]?.id);
        const para = ch?.paragraphs?.find(p => p.id === paraId);
        if (!para) {
          alert("Scroll to a paragraph first, then tap ☆ to bookmark it.");
          return;
        }
        const marked = isBookmarked(bookId, ch.id, para.id);
        if (marked) {
          state.bookmarks = state.bookmarks.filter(b =>
            !(b.bookId === bookId && b.chapterId === ch.id && b.paraId === para.id)
          );
        } else {
          state.bookmarks.push({
            id: uid(), bookId, chapterId: ch.id, paraId: para.id, created: Date.now(),
          });
        }
        saveState();
        state.ui.activeParaId = para.id;
        document.querySelectorAll(".reader-para.bookmarked").forEach(el => el.classList.remove("bookmarked"));
        const paraEl = document.getElementById(para.id);
        if (isBookmarked(bookId, ch.id, para.id)) {
          paraEl?.classList.add("bookmarked");
        }
        window.AmpsReaderUI?.updateBookmarkButton?.(isBookmarked(bookId, ch.id, para.id));
        return;
      }
      case "menu":
        window.AmpsReaderUI?.openSheet?.(readerSheetOpts());
        return;
      case "listen": {
        if (document.body.classList.contains("tts-reading")) {
          pauseReaderAudio();
          refreshReaderSheet();
          return;
        }
        if (document.body.classList.contains("tts-paused") || state.ui.audioPaused) {
          await resumeReaderAudio();
          refreshReaderSheet();
          return;
        }
        await startReaderAudio(state.settings.ttsReadingStyle, false);
        return;
      }
      case "pravachan":
        await startReaderAudio("pravachan", true);
        return;
      case "tts-pause":
        pauseReaderAudio();
        return;
      case "tts-resume":
        await resumeReaderAudio();
        return;
      case "tts-prev":
      case "tts-next": {
        const cont = window.ContinuousReadingController?.getState?.();
        if (cont && cont.queueLength > 0 && cont.status !== "idle" && cont.status !== "stopped" && cont.status !== "completed") {
          if (action === "tts-prev") await window.ContinuousReadingController.previous();
          else await window.ContinuousReadingController.next();
          return;
        }
        const book = await loadBook(bookId);
        const ch = book.chapters.find(c => c.id === chapterId) || book.chapters[0];
        if (!ch?.paragraphs?.length) return;
        const key = audioProgressKey(bookId, ch.id);
        const cur = Number(state.audioProgress[key]?.idx ?? state.ui.pageIndex ?? 0);
        const next = action === "tts-prev" ? Math.max(0, cur - 1) : Math.min(ch.paragraphs.length - 1, cur + 1);
        const para = ch.paragraphs[next];
        if (!para) return;
        stopTtsPlayback();
        await startReaderAudio(state.settings.ttsReadingStyle, false, para.id, 0);
        return;
      }
      case "tts-stop":
        stopTtsPlayback();
        return;
    }
  }

  async function dispatchReaderSheetAction(act) {
    if (!act || state.route !== "read") return;
    const bookId = state.params.parts[1];
    const chapterId = state.params.parts[2];
    switch (act) {
      case "toc":
        toggleReaderDrawer("toc");
        break;
      case "present":
        window.AmpsReaderUI?.closeSheet?.();
        await handleReaderToolbar("present");
        break;
      case "glossary":
        toggleReaderDrawer("glossary");
        break;
      case "study": {
        window.AmpsReaderUI?.closeSheet?.();
        if (state.productivity?.studyPanelOpen) {
          window.AmpsProductivity?.toggleStudyPanel?.(false);
          break;
        }
        const book = await loadBook(bookId);
        const ch = book.chapters.find(c => c.id === chapterId) || book.chapters[0];
        window.AmpsProductivity?.toggleStudyPanel?.(true, { bookId, chapterId, book, ch });
        break;
      }
      case "immersive":
        toggleImmersiveMode();
        break;
      case "summary":
        window.AmpsReaderUI?.closeSheet?.();
        await handleReaderToolbar("summary");
        break;
      case "share":
        window.AmpsReaderUI?.closeSheet?.();
        await handleReaderToolbar("share");
        break;
      case "tts-human":
        window.AmpsReaderUI?.closeSheet?.();
        state.settings.ttsReadingStyle = "human";
        saveState();
        await startReaderAudio("human", false);
        break;
      case "tts-normal":
        window.AmpsReaderUI?.closeSheet?.();
        await startReaderAudio("normal", false);
        break;
      case "tts-pravachan":
        window.AmpsReaderUI?.closeSheet?.();
        await startReaderAudio("pravachan", false);
        break;
      case "tts-continue":
        window.AmpsReaderUI?.closeSheet?.();
        await startReaderAudio(state.settings.ttsReadingStyle, true);
        break;
      case "tts-generate-chapter":
        window.AmpsReaderUI?.closeSheet?.();
        await generateCurrentChapterAudio();
        break;
      case "tts-download-chapter":
        window.AmpsReaderUI?.closeSheet?.();
        await downloadCurrentChapterAudio();
        break;
      case "tts-pause":
        pauseReaderAudio();
        refreshReaderSheet();
        break;
      case "tts-resume":
        await resumeReaderAudio();
        refreshReaderSheet();
        break;
      case "tts-stop":
        stopTtsPlayback();
        break;
      case "read-this-sutra":
        window.AmpsReaderUI?.closeSheet?.();
        await startContinuousReading("current_sutra");
        break;
      case "read-continue-from-here":
        window.AmpsReaderUI?.closeSheet?.();
        await startContinuousReading("continue_from_current");
        break;
      case "read-all-sutras":
        window.AmpsReaderUI?.closeSheet?.();
        await startContinuousReading("all_sutras");
        break;
      case "read-current-chapter":
        window.AmpsReaderUI?.closeSheet?.();
        await startContinuousReading("current_chapter");
        break;
      case "read-repeat-sutra":
        window.AmpsReaderUI?.closeSheet?.();
        await startContinuousReading("repeat_current_sutra");
        break;
      case "content-samskrta-only":
        state.settings.continuousContentScope = "samskrta_only";
        saveState();
        refreshReaderSheet();
        break;
      case "content-samskrta-translation":
        state.settings.continuousContentScope = "samskrta_translation";
        saveState();
        refreshReaderSheet();
        break;
      case "content-full-text":
        state.settings.continuousContentScope = "full_text";
        saveState();
        refreshReaderSheet();
        break;
      case "toggle-stop-after-current":
        state.settings.continuousStopAfterCurrent = !state.settings.continuousStopAfterCurrent;
        saveState();
        refreshReaderSheet();
        break;
      case "source-qa":
        window.AmpsReaderUI?.closeSheet?.();
        navigate("source-qa", { bookId, chapterId });
        break;
      case "pronunciation":
        navigate("pronunciation");
        break;
      case "presentation":
        if (presentationBuilderEnabled()) navigate("presentation-builder");
        break;
      default:
        break;
    }
  }

  function chapterAudioPauseSettings() {
    const comma = Number(state.settings.ttsCommaPause);
    return {
      comma: Number.isFinite(comma) && comma > 0 ? comma : 180,
      sentence: state.settings.ttsSentencePause ?? 420,
      paragraph: state.settings.ttsParagraphPause ?? 850,
      verseShort: state.settings.ttsVersePause ?? 1300,
      verseLong: (state.settings.ttsVersePause ?? 1300) + 900,
      beforeVerse: 1100,
      rate: effectiveSpeechRate(),
    };
  }

  const myVoiceChapterJobs = new Set();

  async function cacheMyVoiceParagraphAudio(para, apiTts, style, rate) {
    const segments = await window.AmpsAudio.prepareApiSegments(para.text, normalizeTtsVoice(state.settings.ttsVoice), {
      pronunciationMode: sanskritPronunciationMode(),
      readingStyle: style,
      pauseSettings: chapterAudioPauseSettings(),
    });
    for (const seg of segments) {
      await window.AmpsApiTts.getAudioBlob(apiTts.apiUrl, apiTts.apiKey, seg.text, {
        voice: apiTts.voice,
        rate,
        style,
        provider: "my-voice",
      });
    }
  }

  async function autoPrepareMyVoiceChapter(bookId, chapterId, paragraphs, startIdx, apiTts, style, rate) {
    if (!apiTts || apiTts.provider !== "my-voice") return;
    if (!window.AmpsApiTts?.getAudioBlob || !window.AmpsAudio?.prepareApiSegments) return;
    const jobKey = `${bookId}|${chapterId}|${style}|${rate}|${apiTts.voice || ""}`;
    if (myVoiceChapterJobs.has(jobKey)) return;
    myVoiceChapterJobs.add(jobKey);
    try {
      const first = Math.max(0, Number(startIdx) || 0);
      for (let i = first; i < paragraphs.length; i++) {
        if (state.route !== "read" || state.params.parts[1] !== bookId || state.params.parts[2] !== chapterId) break;
        const para = paragraphs[i];
        if (!String(para?.text || "").trim()) continue;
        try {
          await cacheMyVoiceParagraphAudio(para, apiTts, style, rate);
        } catch (err) {
          console.warn("Auto My Voice cache failed:", para?.id, err);
          break;
        }
        if (i === first || (i + 1) % 5 === 0) {
          showReaderToast(`My Voice preparing: ${i + 1} / ${paragraphs.length}`);
        }
        await new Promise(resolve => setTimeout(resolve, 80));
      }
    } finally {
      myVoiceChapterJobs.delete(jobKey);
    }
  }

  function safeDownloadName(s) {
    return String(s || "chapter").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").slice(0, 80);
  }

  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Could not read audio file."));
      reader.readAsDataURL(blob);
    });
  }

  async function downloadBlobFile(blob, filename, mimeType) {
    if (!blob?.size) throw new Error("Audio file is empty.");
    const nativeSaver = window.Capacitor?.Plugins?.AmpsFiles;
    if (nativeSaver?.saveFile) {
      const result = await nativeSaver.saveFile({
        data: await blobToDataUrl(blob),
        filename,
        mimeType: mimeType || blob.type || "application/octet-stream",
        relativePath: "Download/AMPS Library",
      });
      return result?.location || "Downloads/AMPS Library";
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return "Downloads";
  }

  function apiTtsVoice(apiTts, voicePreset) {
    if (apiTts?.voice) return apiTts.voice;
    const p = window.AmpsAudio?.normalizePreset?.(voicePreset) || voicePreset || "in-en-female";
    if (p === "in-en-male" || p === "en-male" || p === "hi-male") return "onyx";
    return "nova";
  }

  async function buildChapterAudioParts(paragraphs, style, rate) {
    const voicePreset = window.AmpsAudio?.effectiveVoicePreset?.(
      normalizeTtsVoice(state.settings.ttsVoice),
      style
    ) || normalizeTtsVoice(state.settings.ttsVoice);
    const pauseSettings = chapterAudioPauseSettings();
    const parts = [];
    const list = (paragraphs || []).filter(p => String(p?.text || "").trim());
    for (let i = 0; i < list.length; i++) {
      const segments = await window.AmpsAudio.prepareApiSegments(list[i].text, voicePreset, {
        pronunciationMode: sanskritPronunciationMode(),
        readingStyle: style,
        pauseSettings,
      });
      segments.forEach(seg => {
        parts.push({
          text: seg.text,
          rate: rate * (Number(seg.rateMultiplier) || 1),
          pauseBefore: seg.pauseBefore || 0,
          pauseAfter: seg.pauseAfter || 0,
        });
      });
      if (i < list.length - 1) parts.push({ silenceMs: pauseSettings.paragraph });
    }
    return parts;
  }

  let chapterAudioDownloadBusy = false;

  async function downloadCurrentChapterAudio() {
    if (chapterAudioDownloadBusy) {
      showReaderToast("Chapter audio download already in progress.");
      return;
    }
    const bookId = state.params.parts[1];
    const chapterId = state.params.parts[2];
    if (!bookId || state.route !== "read") return;
    const apiTts = activeApiTtsConfig();
    if (!apiTts) {
      alert("Chapter download needs API TTS or My Voice. Open Settings or Own Voice Lab and configure a TTS server URL.");
      if (normalizeTtsProvider(state.settings.ttsProvider) === "my-voice") navigate("voice-lab");
      else navigate("settings");
      return;
    }
    if (!window.AmpsApiTts?.buildChapterAudioBlob || !window.AmpsAudio?.prepareApiSegments) {
      alert("Audio download is not ready. Reopen the app and try again.");
      return;
    }
    const book = await loadBook(bookId);
    const ch = book.chapters.find(c => c.id === chapterId) || book.chapters[0];
    const paragraphs = (ch?.paragraphs || []).filter(p => String(p?.text || "").trim());
    if (!paragraphs.length) return;

    const style = normalizeTtsReadingStyle(state.settings.ttsReadingStyle);
    if (style === "pravachan") enableSanskritPronunciationIfOff();
    const rate = effectiveSpeechRate(style, apiTts);

    chapterAudioDownloadBusy = true;
    try {
      showReaderToast("Preparing chapter audio...");
      const parts = await buildChapterAudioParts(paragraphs, style, rate);
      const blob = await window.AmpsApiTts.buildChapterAudioBlob({
        apiUrl: apiTts.apiUrl,
        apiKey: apiTts.apiKey,
        voice: apiTtsVoice(apiTts, state.settings.ttsVoice),
        rate,
        style,
        provider: apiTts.provider,
      }, parts, {
        onProgress: (done, total) => {
          showReaderToast(`Downloading voice: ${done} / ${total}`);
        },
        onMerge: () => {
          showReaderToast("Encoding MP3...");
        },
      });
      if (!blob?.size) throw new Error("Could not build chapter audio.");
      showReaderToast("Saving chapter audio...");
      const filename = `${safeDownloadName(book.title)}-${safeDownloadName(ch.title)}.mp3`;
      const location = await downloadBlobFile(blob, filename, "audio/mpeg");
      showReaderToast(`Saved to ${location}`);
    } catch (err) {
      console.warn("Chapter audio download failed:", err);
      alert(`Could not download chapter audio.\n\n${err?.message || err}`);
    } finally {
      chapterAudioDownloadBusy = false;
    }
  }

  async function generateCurrentChapterAudio() {
    const bookId = state.params.parts[1];
    const chapterId = state.params.parts[2];
    if (!bookId || state.route !== "read") return;
    const apiTts = activeApiTtsConfig();
    if (!apiTts || apiTts.provider !== "my-voice") {
      alert("Select My Voice first, then add your local server URL and tap Check server.");
      navigate("voice-lab");
      return;
    }
    if (!window.AmpsApiTts?.getAudioBlob || !window.AmpsAudio?.prepareApiSegments) {
      alert("Audio generation is not ready. Reopen the app and try again.");
      return;
    }
    const book = await loadBook(bookId);
    const ch = book.chapters.find(c => c.id === chapterId) || book.chapters[0];
    const paragraphs = (ch?.paragraphs || []).filter(p => String(p?.text || "").trim());
    if (!paragraphs.length) return;
    const style = "pravachan";
    state.settings.ttsReadingStyle = style;
    const rate = 1;
    if (style === "pravachan") enableSanskritPronunciationIfOff();
    showReaderToast(`Generating chapter audio: 0 / ${paragraphs.length}`);
    let generated = 0;
    let failed = 0;
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i];
      try {
        await cacheMyVoiceParagraphAudio(para, apiTts, style, rate);
        generated += 1;
      } catch (err) {
        console.warn("Chapter audio generation failed:", para.id, err);
        failed += 1;
      }
      if (i === 0 || (i + 1) % 3 === 0 || i === paragraphs.length - 1) {
        showReaderToast(`Generating chapter audio: ${i + 1} / ${paragraphs.length}`);
      }
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    showReaderToast(failed
      ? `Generated ${generated} paragraphs. ${failed} failed.`
      : `Chapter audio generated: ${generated} paragraphs.`);
  }

  async function startReaderAudio(readingStyle, continueLast, startParaId, startOffset) {
    const bookId = state.params.parts[1];
    const chapterId = state.params.parts[2];
    if (!bookId || state.route !== "read") return;
    if (normalizeTtsProvider(state.settings.ttsProvider) === "my-voice" && !activeApiTtsConfig()) {
      alert(myVoiceSetupMissingMessage());
      navigate("voice-lab");
      return;
    }
    ensureMyVoicePronunciationMode();
    if (!window.AmpsAudio?.isSupported?.()) {
      alert("Text-to-speech is not available on this device.");
      return;
    }
    window.AmpsAudio.prime?.();
    const book = await loadBook(bookId);
    const ch = book.chapters.find(c => c.id === chapterId) || book.chapters[0];
    if (!ch?.paragraphs?.length) return;
    const style = normalizeTtsReadingStyle(readingStyle || state.settings.ttsReadingStyle);
    state.settings.ttsReadingStyle = style;
    if (style === "pravachan") enableSanskritPronunciationIfOff();
    const apiTts = activeApiTtsConfig();
    const voicePreset = window.AmpsAudio?.effectiveVoicePreset?.(
      normalizeTtsVoice(state.settings.ttsVoice),
      style
    ) || normalizeTtsVoice(state.settings.ttsVoice);
    const requestedIdx = startParaId ? ch.paragraphs.findIndex(p => p.id === startParaId) : -1;
    const visibleIdx = ch.paragraphs.findIndex(p => p.id === visibleReaderParaId());
    const rec = state.audioProgress[audioProgressKey(bookId, ch.id)];
    const startIdx = requestedIdx >= 0
      ? requestedIdx
      : continueLast
      ? savedAudioIndex(bookId, ch.id, ch)
      : (visibleIdx >= 0 ? visibleIdx : (state.ui.pageIndex || 0));
    const resumeOffset = requestedIdx >= 0
      ? Math.max(0, Number(startOffset) || 0)
      : continueLast
        ? Math.max(0, Number(rec?.charOffset) || 0)
        : 0;
    const rate = effectiveSpeechRate(style, apiTts);
    const pauseSettings = chapterAudioPauseSettings();
    const { speakTexts, paragraphChanda } = buildParagraphSpeakPlan(bookId, ch);
    state.ui.audioPaused = false;
    saveState();
    setTtsToolbarState(true, style);
    if (apiTts?.provider === "my-voice" && window.AmpsApiTts?.getAudioBlob && window.AmpsAudio?.prepareApiSegments) {
      showReaderToast("Starting My Voice reading...");
      setTimeout(() => {
        autoPrepareMyVoiceChapter(bookId, ch.id, ch.paragraphs, startIdx + 1, apiTts, style, rate);
      }, 500);
    } else if (apiTts) {
      const { speakTexts } = buildParagraphSpeakPlan(bookId, ch);
      const upcoming = speakTexts.slice(startIdx + 1, startIdx + 4);
      window.AmpsApiTts.prefetchNext?.(
        apiTts.apiUrl,
        apiTts.apiKey,
        upcoming,
        { style, rate, voice: apiTts.voice, provider: apiTts.provider },
        3
      );
    }
    const pageModeReading = state.settings.scrollMode === "page" && bookId !== "samskrta-shloka";
    let pageFlipToken = 0;
    const applyTtsParaDom = (idx, pid, spoken) => {
      const para = ch.paragraphs[idx];
      const targetId = pid || para?.id;
      document.querySelectorAll(".reader-para").forEach(el => {
        el.classList.remove("tts-active", "is-audio-active", "is-study-playing", "is-study-paused");
        el.removeAttribute("aria-current");
      });
      const el = document.getElementById(targetId);
      el?.classList.add("tts-active", "is-audio-active");
      if (el) el.setAttribute("aria-current", "true");
      const readText = speakTexts[idx] || para?.text || spoken || "";
      ensureParaWordSpans(el, readText);
      // Focus the playing sútra once when this paragraph begins (not on every word tick).
      if (window.AmpsStudyListen?.focusPlayingSutra) {
        window.AmpsStudyListen.focusPlayingSutra(targetId, { focus: false });
      } else {
        const firstWord = el?.querySelector(".tts-word");
        if (firstWord) window.AmpsAudio?.smoothScrollWordIntoView?.(firstWord);
        else el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      updateListeningChrome(book, ch, idx);
    };
    const highlightHandler = (idx, pid, spoken) => {
      if (idx < 0) {
        if (state.ui.audioPaused) return;
        setTtsToolbarState(false);
        document.querySelectorAll(".reader-para").forEach(el => el.classList.remove("tts-active"));
        clearReaderWordHighlights();
        updateListeningChrome(book, ch, -1);
        return;
      }
      const para = ch.paragraphs[idx];
      const targetId = pid || para?.id;
      state.ui.pageIndex = idx;
      state.audioProgress[audioProgressKey(bookId, ch.id)] = {
        idx,
        paraId: targetId,
        charOffset: idx === startIdx ? resumeOffset : 0,
        updated: Date.now(),
        style,
      };
      saveReadingProgress(bookId, ch.id, { paraId: targetId, pageIndex: idx });
      saveState();
      const missingInDom = pageModeReading && targetId && !document.getElementById(targetId);
      if (missingInDom) {
        const token = ++pageFlipToken;
        Promise.resolve(renderFromState()).then(() => {
          if (token !== pageFlipToken || !document.body.classList.contains("tts-reading")) return;
          applyTtsParaDom(idx, targetId, spoken);
        });
        return;
      }
      applyTtsParaDom(idx, targetId, spoken);
    };
    const wordHandler = (charStart, pi, wordIndex) => {
      const pid = ch.paragraphs[pi]?.id;
      const el = document.getElementById(pid);
      const progressKey = audioProgressKey(bookId, ch.id);
      state.audioProgress[progressKey] = {
        ...(state.audioProgress[progressKey] || {}),
        idx: pi,
        paraId: pid,
        charOffset: Math.max(0, Number(charStart) || 0),
        updated: Date.now(),
        style,
      };
      state.ui.pageIndex = pi;
      const readText = speakTexts[pi] || ch.paragraphs[pi]?.text || window.AmpsAudio?.getSpokenText?.() || "";
      if (el) highlightReaderWord(el, readText, charStart, wordIndex);
    };
    const useBundledShlokaAudio = state.settings.shlokaBundledAudio !== false && window.AmpsShlokaAudio;
    const preferHumanShloka = state.settings.shlokaPreferHumanAudio !== false;
    if (useBundledShlokaAudio) {
      await window.AmpsShlokaAudio.loadManifest?.(bookId === "samskrta-shloka");
      const bundled = await window.AmpsShlokaAudio.speakChapter({
        bookId,
        chapterId,
        ch,
        speakTexts,
        paragraphChanda,
        paraIds: ch.paragraphs.map(p => p.id),
        startIdx,
        onHighlight: highlightHandler,
        enabled: true,
        paragraphPauseMs: pauseSettings.paragraph,
        preferHuman: bookId === "samskrta-shloka" ? preferHumanShloka : undefined,
        getShlokaEntry: (b, c, p) => getShlokaEntryForPara(b, c, p),
        fallbackParagraph: async (i, pid, text) => {
          // speakParagraphs is given a 1-item list (local index 0). Remap
          // highlight/word callbacks to the real chapter paragraph index.
          const ok = await window.AmpsAudio.speakParagraphs(
            [text],
            [pid],
            rate,
            (hi) => {
              if (hi < 0) return;
              highlightHandler(i, pid, text);
            },
            voicePreset,
            0,
            (charStart, _localPi, wordIndex) => wordHandler(charStart, i, wordIndex),
            sanskritPronunciationMode(),
            {
              readingStyle: style,
              pauseSettings,
              paragraphChanda: [paragraphChanda[i]],
              apiTts,
            }
          );
          return ok !== false;
        },
      });
      if (bundled) return;
    }
    const ok = await window.AmpsAudio.speakParagraphs(
      speakTexts,
      ch.paragraphs.map(p => p.id),
      rate,
      highlightHandler,
      voicePreset,
      startIdx,
      wordHandler,
      sanskritPronunciationMode(),
      {
        readingStyle: style,
        startOffset: resumeOffset,
        pauseSettings,
        paragraphChanda,
        apiTts,
      }
    );
    if (ok === false) {
      setTtsToolbarState(false);
      if (normalizeTtsProvider(state.settings.ttsProvider) === "my-voice") {
        alert("My Voice reading failed. Open Own Voice Lab, tap Check server, and confirm the phone can reach your computer at port 3001.");
        navigate("voice-lab");
      } else {
        alert("Could not start text-to-speech. Open Settings → Accessibility → Text-to-speech, choose Google as the engine, and download voice data.");
      }
    }
  }

  function currentReaderAudioProgress() {
    const bookId = state.params.parts[1];
    const chapterId = state.params.parts[2];
    if (!bookId || !chapterId || state.route !== "read") return null;
    const key = audioProgressKey(bookId, chapterId);
    return state.audioProgress[key] || {
      idx: Math.max(0, state.ui.pageIndex || 0),
      paraId: visibleReaderParaId() || null,
      style: normalizeTtsReadingStyle(state.settings.ttsReadingStyle),
    };
  }

  function pauseReaderAudio() {
    if (window.ContinuousReadingController?.getState?.()?.status === "speaking"
      || window.ContinuousReadingController?.getState?.()?.status === "loading"
      || window.ContinuousReadingController?.getState?.()?.status === "retrying") {
      window.ContinuousReadingController.pause();
      state.ui.audioPaused = true;
      setTtsToolbarState(false);
      saveState();
      refreshReaderSheet();
      return;
    }
    const bookId = state.params.parts[1];
    const chapterId = state.params.parts[2];
    const prog = currentReaderAudioProgress();
    if (bookId && chapterId && prog) {
      state.audioProgress[audioProgressKey(bookId, chapterId)] = {
        ...prog,
        paused: true,
        updated: Date.now(),
      };
    }
    state.ui.audioPaused = true;
    const paused = window.AmpsShlokaAudio?.pause?.() || window.AmpsAudio?.pause?.();
    if (!paused && (window.AmpsShlokaAudio?.playing || window.AmpsAudio?.playing)) {
      window.AmpsShlokaAudio?.stop?.();
      window.AmpsAudio?.stop?.();
    }
    setTtsToolbarState(false);
    saveState();
    refreshReaderSheet();
  }

  async function resumeReaderAudio() {
    if (window.ContinuousReadingController?.getState?.()?.status === "paused") {
      window.ContinuousReadingController.resume();
      state.ui.audioPaused = false;
      setTtsToolbarState(true, state.settings.ttsReadingStyle);
      saveState();
      refreshReaderSheet();
      return;
    }
    const prog = currentReaderAudioProgress();
    const style = normalizeTtsReadingStyle(prog?.style || state.settings.ttsReadingStyle);
    state.ui.audioPaused = false;
    if (window.AmpsShlokaAudio?.paused && window.AmpsShlokaAudio.resume?.()) {
      setTtsToolbarState(true, style);
      saveState();
      refreshReaderSheet();
      return;
    }
    if (window.AmpsAudio?.playing) {
      window.AmpsAudio.resume?.();
      setTtsToolbarState(true, style);
      saveState();
      refreshReaderSheet();
      return;
    }
    await startReaderAudio(style, true);
  }

  function setTtsToolbarState(active, style) {
    const paused = !!state.ui.audioPaused && !active;
    window.AmpsReaderUI?.updateListenButton?.(!!active, paused);
    document.body.classList.toggle("tts-reading", !!active);
    document.body.classList.toggle("tts-paused", paused);
    refreshReaderSheet();
    refreshReaderToolbarAudio(active, paused);
    if (!active && !paused) clearMediaSession();
  }

  function updateListeningChrome(book, ch, paraIdx) {
    const total = ch?.paragraphs?.length || 0;
    const idx = Number(paraIdx);
    const para = Number.isFinite(idx) && idx >= 0 ? ch?.paragraphs?.[idx] : null;
    const pct = total > 0 && Number.isFinite(idx) && idx >= 0 ? Math.round(((idx + 1) / total) * 100) : 0;
    const title = (book?.title || "AMPS Library").slice(0, 48);
    const sub = para
      ? `¶ ${idx + 1}/${total} · ${(para.text || "").replace(/\s+/g, " ").slice(0, 56)}`
      : (ch?.title || "");
    window.AmpsReaderUI?.updateAudioMiniPlayer?.({ title, sub, pct });
    setupMediaSession(title, sub, !!document.body.classList.contains("tts-reading"));
  }

  function clearMediaSession() {
    try {
      if (!("mediaSession" in navigator)) return;
      navigator.mediaSession.playbackState = "none";
      navigator.mediaSession.metadata = null;
    } catch (_) { /* */ }
  }

  function setupMediaSession(title, sub, playing) {
    try {
      if (!("mediaSession" in navigator)) return;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || "Listening",
        artist: "AMPS Library",
        album: sub || "Sacred Library",
      });
      navigator.mediaSession.playbackState = playing ? "playing" : (state.ui.audioPaused ? "paused" : "none");
      const bind = (action, fn) => {
        try { navigator.mediaSession.setActionHandler(action, fn); } catch (_) { /* */ }
      };
      bind("play", () => { resumeReaderAudio(); });
      bind("pause", () => { pauseReaderAudio(); });
      bind("stop", () => { stopTtsPlayback(); });
      bind("previoustrack", () => { handleReaderToolbar("tts-prev"); });
      bind("nexttrack", () => { handleReaderToolbar("tts-next"); });
    } catch (_) { /* */ }
  }

  function refreshReaderToolbarAudio(active, paused) {
    const wrap = document.querySelector(".reader-toolbar-actions");
    if (!wrap) return;
    let stopBtn = document.getElementById("btnListenStop");
    if (active || paused) {
      if (!stopBtn) {
        stopBtn = document.createElement("button");
        stopBtn.type = "button";
        stopBtn.id = "btnListenStop";
        stopBtn.className = "icon-btn reader-toolbar-btn reader-toolbar-stop";
        stopBtn.dataset.readerAct = "tts-stop";
        stopBtn.title = "Stop audio";
        stopBtn.setAttribute("aria-label", "Stop audio");
        stopBtn.textContent = "⏹";
        const textBtn = document.getElementById("btnReaderSettings");
        wrap.insertBefore(stopBtn, textBtn);
        stopBtn.addEventListener("click", e => {
          e.preventDefault();
          e.stopPropagation();
          handleReaderToolbar("tts-stop");
        });
      }
      stopBtn.classList.remove("hidden");
    } else if (stopBtn) {
      stopBtn.classList.add("hidden");
    }
  }

  let readerToolbarUiReady = false;
  function initReaderToolbarUi() {
    if (readerToolbarUiReady) return;
    readerToolbarUiReady = true;
    document.addEventListener("click", e => {
      const wordEl = e.target.closest?.(".tts-word");
      if (wordEl && state.route === "read" && !e.target.closest?.("[data-reader-act], .hl-bar, a, button")) {
        const paraEl = wordEl.closest(".reader-para");
        const paraId = paraEl?.dataset?.para || paraEl?.id;
        if (paraId && wordEl.dataset.wi != null) {
          e.preventDefault();
          e.stopPropagation();
          const plain = paraEl.querySelector(".para-text")?.dataset?.ttsPlain
            || paraEl.dataset?.ttsPlain
            || paraEl.querySelector(".para-text")?.textContent
            || "";
          const wi = Number(wordEl.dataset.wi);
          const offset = window.AmpsAudio?.wordIndexToCharIndex?.(plain, wi) ?? 0;
          startReaderAudio(state.settings.ttsReadingStyle, false, paraId, offset);
          return;
        }
      }
      const btn = e.target.closest?.("[data-reader-act]");
      if (!btn || state.route !== "read") return;
      e.preventDefault();
      e.stopPropagation();
      handleReaderToolbar(btn.dataset.readerAct);
    }, true);
  }

  function bindReaderToolbarButtons() {
    /* direct bind kept for redundancy; delegation in initReaderToolbarUi is primary */
    document.querySelectorAll(".reader-toolbar-wrap [data-reader-act]").forEach(btn => {
      if (btn.dataset.readerBound) return;
      btn.dataset.readerBound = "1";
      btn.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        handleReaderToolbar(btn.dataset.readerAct);
      });
    });
  }

  function stopTtsPlayback() {
    window.ContinuousReadingController?.stop?.({ reason: "user_stop", clearQueue: true });
    window.AmpsStudyListen?.stop?.({ announceDone: false });
    window.AmpsShlokaAudio?.stop?.();
    window.TtsOrchestrator?.stop?.({ reason: "user_stop", clearQueue: true });
    window.AmpsAudio?.stop?.("user_stop");
    state.ui.audioPaused = false;
    document.querySelectorAll(".reader-para").forEach(el => {
      el.classList.remove("tts-active", "is-audio-active", "is-study-playing", "is-study-paused", "is-tts-paragraph-active");
      el.removeAttribute("aria-current");
    });
    clearReaderWordHighlights();
    try { window.TtsHighlightController?.clearAll?.(); } catch (_) { /* */ }
    setTtsToolbarState(false);
    document.body.classList.remove("tts-reading");
    document.body.classList.remove("tts-paused");
    document.body.classList.remove("has-study-listen-mini");
    announceContinuous("Reading stopped");
  }

  function ensureParaWordSpans(paraEl, text) {
    const textEl = paraEl?.querySelector(".para-text") || paraEl;
    if (!textEl) return textEl;
    if (
      paraEl?.classList?.contains("shloka-entry")
      || paraEl?.classList?.contains("ananda-sutra-entry")
      || textEl.querySelector(".shloka-verse-block, .shloka-line, .ananda-sutra-block, .sutra-roman, .sutra-dev, .sutra-bng")
    ) {
      return textEl;
    }
    const plain = String(text || "");
    if (textEl.querySelector(".tts-word") && textEl.dataset.ttsPlain === plain) return textEl;
    textEl.dataset.ttsPlain = plain;
    textEl.innerHTML = window.AmpsAudio?.wordSpanHtml?.(plain, esc) || esc(plain);
    return textEl;
  }

  function highlightReaderWord(paraEl, text, charStart, wordIndex) {
    const block = ensureParaWordSpans(paraEl, text);
    const wi = Number.isFinite(wordIndex)
      ? wordIndex
      : (window.AmpsAudio?.charIndexToWordIndex?.(text, charStart) ?? -1);
    window.AmpsAudio?.highlightWordIn?.(block, wi);
  }

  function clearReaderWordHighlights() {
    document.querySelectorAll(".tts-word").forEach(el => el.classList.remove("tts-word-active"));
  }

  function normalizeTtsVoice(v) {
    return window.AmpsAudio?.normalizePreset?.(v) || v || "best-english";
  }

  function normalizeTtsPronunciation(v) {
    return sanskritPronunciationMode(v);
  }

  function sanskritPronunciationMode(v) {
    const raw = v !== undefined
      ? v
      : (state.settings.sanskritPronunciation ?? state.settings.ttsPronunciation);
    return window.AmpsAudio?.normalizePronunciationMode?.(raw)
      || window.AmpsSanskritTts?.normalizeMode?.(raw)
      || "amps-enhanced";
  }

  function syncLegacyTtsPronunciation() {
    const sk = sanskritPronunciationMode();
    state.settings.sanskritPronunciation = sk;
    state.settings.ttsPronunciation = sk === "off" ? "normal" : "amps-hi-samskrta";
  }

  function enableSanskritPronunciationIfOff() {
    if (sanskritPronunciationMode() !== "off") return false;
    state.settings.sanskritPronunciation = "amps-enhanced";
    syncLegacyTtsPronunciation();
    saveState();
    return true;
  }

  function positiveRate(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  // The reading-speed slider is the master control. Pravachan and Saṁskrta
  // rates act as relative factors so the slider always has an effect.
  function effectiveSpeechRate(readingStyle, apiTts) {
    const base = positiveRate(state.settings.ttsRate, 1);
    const style = normalizeTtsReadingStyle(readingStyle || state.settings.ttsReadingStyle);
    let factor = 1;
    if (style === "pravachan") {
      factor = apiTts?.provider === "my-voice" ? 1 : positiveRate(state.settings.pravachanRate, 0.85);
    } else if (sanskritPronunciationMode() !== "off") {
      factor = positiveRate(state.settings.sanskritSpeechRate, 1);
    }
    return Math.max(0.5, Math.min(2, base * factor));
  }

  function sanskritSpeechRateSelectHtml(selectId) {
    const cur = String(state.settings.sanskritSpeechRate ?? 1);
    const opts = ["0.85", "0.9", "0.95", "1.0"];
    return `<select id="${selectId}">${opts.map(v =>
      `<option value="${v}" ${cur === v ? "selected" : ""}>${v}×</option>`
    ).join("")}</select>`;
  }

  function bindSanskritSpeechRateSelect(selectId) {
    document.getElementById(selectId)?.addEventListener("change", e => {
      const r = Number(e.target.value);
      if (!Number.isFinite(r)) return;
      state.settings.sanskritSpeechRate = r;
      saveState();
    });
  }

  function normalizeTtsProvider(v) {
    return ["device", "api", "my-voice"].includes(v) ? v : "device";
  }

  function ensureMyVoicePronunciationMode() {
    if (normalizeTtsProvider(state.settings.ttsProvider) !== "my-voice") return false;
    if (sanskritPronunciationMode() !== "off") return false;
    state.settings.sanskritPronunciation = "amps-enhanced";
    syncLegacyTtsPronunciation();
    saveState();
    return true;
  }

  function myVoiceSetupMissingMessage() {
    return "My Voice is selected but the TTS server URL is missing.\n\n"
      + "1. On your computer, run: cd Amps-Library/server && ./start-own-voice-xtts.sh\n"
      + "2. Put phone and computer on the same Wi-Fi.\n"
      + "3. In Own Voice Lab, enter http://YOUR-COMPUTER-IP:3001\n"
      + "4. Tap Check server, Test, then Use My Voice for reading.";
  }

  async function myVoicePreviewSampleText() {
    ensureMyVoicePronunciationMode();
    const sample = "This is my trained voice. The doer-I is ahamtattva, and the existential I-feeling is mahattattva.";
    if (!window.AmpsAudio?.prepareApiText) return sample;
    return window.AmpsAudio.prepareApiText(sample, normalizeTtsVoice(state.settings.ttsVoice), {
      pronunciationMode: sanskritPronunciationMode(),
      readingStyle: "normal",
    });
  }

  function normalizeTtsApiUrl(url) {
    let s = String(url || "").trim();
    if (s && !/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "http://" + s;
    return s.replace(/\/+$/, "");
  }

  function activeApiTtsConfig() {
    const provider = normalizeTtsProvider(state.settings.ttsProvider);
    if (provider === "device") return null;
    if (provider === "my-voice") {
      const apiUrl = normalizeTtsApiUrl(state.settings.ownVoiceTtsUrl);
      if (!window.AmpsApiTts?.isConfigured?.(apiUrl)) return null;
      return {
        provider: "my-voice",
        apiUrl,
        apiKey: state.settings.ownVoiceTtsKey || "",
        voice: state.settings.ownVoiceId || "my-voice",
      };
    }
    const apiUrl = normalizeTtsApiUrl(state.settings.ttsApiUrl);
    if (!window.AmpsApiTts?.isConfigured?.(apiUrl)) return null;
    return {
      provider: "api",
      apiUrl,
      apiKey: state.settings.ttsApiKey || "",
    };
  }

  function pronunciationOverrides() {
    return window.AmpsPronunciation?.list?.() || [];
  }

  function savePronunciationOverrides(rows) {
    window.AmpsPronunciation?.save?.(rows);
  }

  function readerSheetOpts() {
    return {
      audioActive: document.body.classList.contains("tts-reading"),
      audioPaused: document.body.classList.contains("tts-paused") || !!state.ui.audioPaused,
      immersive: !!state.settings.immersive,
      ttsRate: state.settings.ttsRate || 1,
      ttsCommaPause: state.settings.ttsCommaPause || 180,
      ttsSentencePause: state.settings.ttsSentencePause ?? 420,
      canDownloadChapterAudio: !!activeApiTtsConfig(),
      canGenerateChapterAudio: activeApiTtsConfig()?.provider === "my-voice",
      contentScope: state.settings.continuousContentScope || "full_text",
      stopAfterCurrent: !!state.settings.continuousStopAfterCurrent,
    };
  }

  function continuousLiveRegion() {
    let el = document.getElementById("continuousReadingLive");
    if (!el) {
      el = document.createElement("div");
      el.id = "continuousReadingLive";
      el.className = "sr-only";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.setAttribute("aria-atomic", "true");
      document.body.appendChild(el);
    }
    return el;
  }

  function announceContinuous(msg) {
    if (!msg) return;
    const el = continuousLiveRegion();
    el.textContent = "";
    setTimeout(() => { el.textContent = msg; }, 20);
  }

  function bindContinuousReadingChrome() {
    if (window.__ampsContinuousChromeBound) return;
    window.__ampsContinuousChromeBound = true;
    window.ContinuousReadingController?.subscribe?.((evt) => {
      const st = window.ContinuousReadingController.getState();
      if (evt?.type === "announce" || evt?.message) announceContinuous(evt.message || st.lastAnnounce);
      if (st.status === "speaking" || st.status === "loading" || st.status === "preparing" || st.status === "retrying") {
        state.ui.audioPaused = false;
        setTtsToolbarState(true, state.settings.ttsReadingStyle);
      } else if (st.status === "paused") {
        state.ui.audioPaused = true;
        setTtsToolbarState(false);
      } else if (st.status === "stopped" || st.status === "completed" || st.status === "idle" || st.status === "error") {
        if (st.status === "completed") announceContinuous("Reading completed");
        if (st.status !== "paused") {
          state.ui.audioPaused = false;
          if (st.status === "stopped" || st.status === "completed" || st.status === "idle") {
            setTtsToolbarState(false);
          }
        }
      }
      const item = st.activeItem;
      if (item) {
        const bookTitle = (document.querySelector(".reader-toolbar-meta .reader-chapter")?.textContent || "AMPS Library").slice(0, 48);
        const pct = st.queueLength ? Math.round(((st.activeIndex + 1) / st.queueLength) * 100) : 0;
        const modeLabel = String(st.readingMode || "").replace(/_/g, " ");
        window.AmpsReaderUI?.updateAudioMiniPlayer?.({
          title: bookTitle,
          sub: `${st.progressLabel}${modeLabel ? ` · ${modeLabel}` : ""}`,
          pct,
        });
        const el = document.getElementById(item.paragraphId)
          || document.getElementById(item.stableId)
          || document.getElementById(item.sourceParaId);
        if (el && (evt?.type === "item_start" || evt?.type === "started" || evt?.type === "paragraph_highlight")) {
          document.querySelectorAll(".reader-para").forEach(node => {
            node.classList.remove("tts-active", "is-audio-active", "is-tts-paragraph-active");
          });
          el.classList.add("tts-active", "is-audio-active", "is-tts-paragraph-active");
          if (window.AmpsStudyListen?.focusPlayingSutra) {
            window.AmpsStudyListen.focusPlayingSutra(el.id, { focus: false });
          } else {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      }
      refreshReaderSheet();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && (document.body.classList.contains("tts-reading") || document.body.classList.contains("tts-paused"))) {
        e.preventDefault();
        stopTtsPlayback();
        return;
      }
      if (e.code === "Space" || e.key === " ") {
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        const inControls = t?.closest?.(".reader-audio-dock, .reader-audio-mini, .reader-audio-top-controls, #studyListenMini");
        if (!inControls) return;
        if (!(document.body.classList.contains("tts-reading") || document.body.classList.contains("tts-paused"))) return;
        e.preventDefault();
        if (document.body.classList.contains("tts-paused") || state.ui.audioPaused) resumeReaderAudio();
        else pauseReaderAudio();
      }
    });
  }

  async function startContinuousReading(mode) {
    bindContinuousReadingChrome();
    const CRC = window.ContinuousReadingController;
    if (!CRC?.start) {
      showReaderToast("Continuous reading is unavailable.");
      return;
    }
    const bookId = state.params.parts[1];
    const chapterId = state.params.parts[2];
    if (!bookId || state.route !== "read") return;
    if (!window.AmpsAudio?.isSupported?.()) {
      alert("Text-to-speech is not available on this device.");
      return;
    }
    window.AmpsAudio.prime?.();
    ensureMyVoicePronunciationMode();
    enableSanskritPronunciationIfOff();
    const book = await loadBook(bookId);
    const startParagraphId = state.ui.activeParaId
      || visibleReaderParaId()
      || state.audioProgress[audioProgressKey(bookId, chapterId)]?.paraId
      || null;
    const contentScope = mode === "all_sutras"
      ? (state.settings.continuousContentScope === "full_text"
        ? "samskrta_only"
        : (state.settings.continuousContentScope || "samskrta_only"))
      : (state.settings.continuousContentScope || "full_text");
    const rate = effectiveSpeechRate(state.settings.ttsReadingStyle, activeApiTtsConfig());
    const voicePreset = window.AmpsAudio?.effectiveVoicePreset?.(
      normalizeTtsVoice(state.settings.ttsVoice),
      state.settings.ttsReadingStyle
    ) || normalizeTtsVoice(state.settings.ttsVoice);

    state.ui.audioPaused = false;
    setTtsToolbarState(true, state.settings.ttsReadingStyle);
    document.body.classList.add("tts-reading");

    await CRC.start({
      book,
      bookId,
      chapterId: mode === "all_sutras" ? "ch-all-sutras" : chapterId,
      readingMode: mode,
      contentScope,
      startParagraphId,
      stopAfterCurrent: !!state.settings.continuousStopAfterCurrent,
      repeatTarget: state.settings.shlokaRepeatCount || 3,
      rate,
      voicePreset,
      pronunciationMode: sanskritPronunciationMode(),
      sutrasOnly: bookId === "ananda-sutram",
    });
  }

  function applyTtsPauseSetting(kind, value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    if (kind === "comma") state.settings.ttsCommaPause = Math.max(80, Math.min(900, n));
    if (kind === "sentence") state.settings.ttsSentencePause = Math.max(180, Math.min(1200, n));
    if (kind === "paragraph") state.settings.ttsParagraphPause = Math.max(500, Math.min(2200, n));
    if (kind === "verse") state.settings.ttsVersePause = Math.max(700, Math.min(2800, n));
    saveState();
    document.querySelectorAll(`[data-tts-pause-label="${kind}"]`).forEach(el => {
      const v = kind === "comma" ? state.settings.ttsCommaPause
        : kind === "sentence" ? state.settings.ttsSentencePause
          : kind === "paragraph" ? state.settings.ttsParagraphPause
            : state.settings.ttsVersePause;
      el.textContent = `${Math.round(v)} ms`;
    });
    document.querySelectorAll(`[data-tts-pause="${kind}"]`).forEach(el => {
      const v = kind === "comma" ? state.settings.ttsCommaPause
        : kind === "sentence" ? state.settings.ttsSentencePause
          : kind === "paragraph" ? state.settings.ttsParagraphPause
            : state.settings.ttsVersePause;
      el.value = String(v);
    });
  }

  let ttsPauseUiReady = false;
  function initTtsPauseControls() {
    if (ttsPauseUiReady) return;
    ttsPauseUiReady = true;
    document.addEventListener("input", e => {
      const kind = e.target?.dataset?.ttsPause;
      if (!kind || e.target.type !== "range") return;
      applyTtsPauseSetting(kind, e.target.value);
    }, true);
  }

  function refreshReaderSheet() {
    window.AmpsReaderUI?.refreshSheet?.(readerSheetOpts());
  }

  async function startShlokaStudyListen() {
    const bookId = state.params.parts[1];
    const chapterId = state.params.parts[2];
    if (!bookId || state.route !== "read") return;

    // Toggle pause/resume when a study-listen session is already active.
    if (window.AmpsStudyListen?.isActive?.()) {
      window.AmpsStudyListen.togglePause?.();
      const paused = window.AmpsStudyListen.getControllerState?.()?.status === "paused";
      state.ui.audioPaused = !!paused;
      setTtsToolbarState(true, "pravachan");
      return;
    }

    const book = await loadBook(bookId);
    const ch = book.chapters.find(c => c.id === chapterId) || book.chapters[0];
    if (!ch?.paragraphs?.length) return;

    const resumeId =
      state.audioProgress[audioProgressKey(bookId, ch.id)]?.paraId ||
      state.progress[bookId]?.paraId ||
      null;

    const sutra = window.AmpsStudyListen?.getCurrentStudySutra?.({
      bookId,
      chapter: ch,
      selectedId: state.ui.activeParaId || null,
      resumeId,
    });

    if (!sutra?.paragraphId) {
      showReaderToast("No sútra found to study.");
      return;
    }

    state.ui.activeParaId = sutra.paragraphId;
    state.ui.audioPaused = false;
    setTtsToolbarState(true, "pravachan");

    const prefs = getShlokaScriptPrefs();
    const scriptPrefs = { roman: !!prefs.roman, dev: !!prefs.dev, bng: !!prefs.bng };
    if (prefs.dev && !prefs.roman) {
      scriptPrefs.roman = false;
      scriptPrefs.dev = true;
    }

    const result = await window.AmpsStudyListen.startStudyListen({
      sutra,
      bookId,
      chapter: ch,
      settings: state.settings,
      studyMode: window.AmpsShlokaStudy?.getMode?.(state.settings) || "off",
      repeatCount: window.AmpsShlokaStudy?.getRepeatCount?.(state.settings) || 3,
      scriptPrefs,
      origin: "study_listen",
      rate: window.AmpsShlokaStudy?.studyRate?.(state.settings, state.settings.pravachanRate || 0.75) || 0.65,
      voice: normalizeTtsVoice(state.settings.ttsVoice),
      pronunciationMode: sanskritPronunciationMode(),
      pauseSettings: chapterAudioPauseSettings(),
      apiTts: activeApiTtsConfig(),
      allowTtsFallback: true,
    });

    if (!result?.ok) {
      setTtsToolbarState(false);
      if (result?.reason === "play_failed") {
        showReaderToast("Could not start shloka study audio.");
      }
      return;
    }
    setTtsToolbarState(false);
  }

  function exportNotebookMarkdown() {
    const lines = [
      "# AMPS Library Notebook",
      "",
      `Exported: ${new Date().toLocaleString()}`,
      "",
      "Author/source attribution: Shrii Shrii Anandamurti ji",
      "",
    ];
    if (state.highlights.length) {
      lines.push("## Highlights", "");
      state.highlights.forEach(h => {
        const meta = bookById(h.bookId);
        lines.push(`> ${h.text || ""}`, "");
        lines.push(`Source: ${meta?.title || h.bookId} / ${h.chapterId}`, "");
      });
    }
    if (state.notes.length) {
      lines.push("## Notes", "");
      state.notes.forEach(n => {
        const meta = bookById(n.bookId);
        if (n.quote) lines.push(`> ${n.quote}`, "");
        lines.push(n.body || "", "");
        lines.push(`Source: ${meta?.title || n.bookId} / ${n.chapterId}`, "");
      });
    }
    if (state.bookmarks.length) {
      lines.push("## Bookmarks", "");
      state.bookmarks.forEach(b => {
        const meta = bookById(b.bookId);
        lines.push(`- ${meta?.title || b.bookId} / ${b.chapterId} / ${b.paraId || ""}`);
      });
    }
    return lines.join("\n");
  }

  function downloadTextFile(filename, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  function normalizeTtsReadingStyle(v) {
    return window.AmpsAudio?.normalizeReadingStyle?.(v) || "normal";
  }

  function audioProgressKey(bookId, chapterId) {
    return `${bookId}|${chapterId}`;
  }

  function savedAudioIndex(bookId, chapterId, ch) {
    const rec = state.audioProgress[audioProgressKey(bookId, chapterId)];
    const idx = Number.isFinite(rec?.idx) ? rec.idx : -1;
    if (idx >= 0 && idx < (ch?.paragraphs?.length || 0)) return idx;
    const pid = rec?.paraId || state.progress[bookId]?.paraId;
    const byPara = ch?.paragraphs?.findIndex(p => p.id === pid) ?? -1;
    return byPara >= 0 ? byPara : 0;
  }

  function ttsVoiceSelectHtml(selectId) {
    const sel = normalizeTtsVoice(state.settings.ttsVoice);
    const presets = window.AmpsAudio?.getPresetOptions?.() || [
      { value: "best-english", label: "Best available English voice" },
      { value: "in-en-female", label: "Indian English preferred (female)" },
      { value: "in-en-male", label: "Indian English preferred (male)" },
      { value: "en-female", label: "British English preferred (female)" },
      { value: "en-male", label: "British English preferred (male)" },
      { value: "default", label: "System default" },
    ];
    let h = `<select id="${selectId}">`;
    presets.forEach(p => {
      h += `<option value="${esc(p.value)}"${sel === p.value ? " selected" : ""}>${esc(p.label)}</option>`;
    });
    h += `</select>`;
    return h;
  }

  function applyTtsVoiceSelection(value) {
    const voice = normalizeTtsVoice(value);
    state.settings.ttsVoice = voice;
    saveState();
    ["setTtsVoice", "settingsTtsVoice", "audTtsVoice", "presentVoice"].forEach(id => {
      const el = document.getElementById(id);
      if (el && [...el.options].some(o => o.value === voice)) el.value = voice;
      const hint = document.getElementById(id + "Hint");
      if (hint) hint.textContent = ttsHintText(voice);
    });
  }

  const ttsVoicePopulatePending = new Map();

  function ttsVoiceOptionsKey(allOptions) {
    return allOptions.map(o => `${o.group}:${o.value}`).join("|");
  }

  function syncTtsVoiceSelectValue(selectId) {
    const el = document.getElementById(selectId);
    if (!el || !el.options.length) return;
    const wanted = normalizeTtsVoice(state.settings.ttsVoice);
    if ([...el.options].some(o => o.value === wanted)) {
      el.value = wanted;
      return;
    }
    el.value = el.options[0].value;
    applyTtsVoiceSelection(el.value);
  }

  function populateTtsVoiceSelect(selectId, force) {
    const el = document.getElementById(selectId);
    if (!el || !window.AmpsAudio) return;
    if (!force && document.activeElement === el) {
      ttsVoicePopulatePending.set(selectId, true);
      return;
    }
    Promise.resolve(window.AmpsAudio.getVoiceSelectOptions()).then(allOptions => {
      const target = document.getElementById(selectId);
      if (!target) return;
      if (!force && document.activeElement === target) {
        ttsVoicePopulatePending.set(selectId, true);
        return;
      }
      const key = ttsVoiceOptionsKey(allOptions);
      if (!force && target.dataset.voiceOptionsKey === key) {
        syncTtsVoiceSelectValue(selectId);
        return;
      }
      const presets = allOptions.filter(o => o.group === "preset");
      const device = allOptions.filter(o => o.group === "device" || o.group === "hindi");
      target.innerHTML = "";
      presets.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.value;
        opt.textContent = p.label;
        target.appendChild(opt);
      });
      if (device.length) {
        const og = document.createElement("optgroup");
        og.label = "Voices on this device";
        device.forEach(o => {
          const opt = document.createElement("option");
          opt.value = o.value;
          opt.textContent = o.label;
          og.appendChild(opt);
        });
        target.appendChild(og);
      }
      target.dataset.voiceOptionsKey = key;
      syncTtsVoiceSelectValue(selectId);
    });
  }

  function syncTtsRateLabels(rate) {
    const label = window.AmpsReaderUI?.formatTtsRate?.(rate) || `${(+rate || 1).toFixed(1)}×`;
    document.querySelectorAll("[data-reader-tts-rate-label]").forEach(el => { el.textContent = label; });
    document.querySelectorAll("[data-reader-tts-rate]").forEach(el => {
      el.value = String(Math.min(1.6, Math.max(0.6, +rate || 1)));
    });
    const setEl = document.getElementById("setTtsRate");
    const setVal = document.getElementById("setTtsRateVal");
    if (setEl) setEl.value = String(rate);
    if (setVal) setVal.textContent = label;
    const presentEl = document.getElementById("presentTtsRate");
    if (presentEl) presentEl.value = String(rate);
    const presentVal = document.getElementById("presentTtsRateVal");
    if (presentVal) presentVal.textContent = label;
    const settingsEl = document.getElementById("settingsTtsRate");
    if (settingsEl) settingsEl.value = String(rate);
    const settingsVal = document.getElementById("settingsTtsRateVal");
    if (settingsVal) settingsVal.textContent = label;
    const audEl = document.getElementById("audRate");
    if (audEl) audEl.value = String(rate);
  }

  function applyTtsPlaybackRate(rate) {
    const r = Math.round(Math.min(1.6, Math.max(0.6, +rate || 1)) * 10) / 10;
    state.settings.ttsRate = r;
    if (window.AmpsAudio) window.AmpsAudio.rate = r;
    saveState();
    syncTtsRateLabels(r);
    return r;
  }

  let ttsRateUiReady = false;
  function initTtsRateControls() {
    if (ttsRateUiReady) return;
    ttsRateUiReady = true;
    document.addEventListener("input", e => {
      if (!e.target?.matches?.("[data-reader-tts-rate]")) return;
      applyTtsPlaybackRate(e.target.value);
    }, true);
    document.addEventListener("click", e => {
      const step = e.target?.closest?.("[data-reader-tts-rate-step]");
      if (!step) return;
      const wrap = step.closest(".reader-audio-speed");
      const slider = wrap?.querySelector("[data-reader-tts-rate]");
      if (!slider) return;
      e.preventDefault();
      e.stopPropagation();
      const delta = parseFloat(step.dataset.readerTtsRateStep || "0");
      applyTtsPlaybackRate(+slider.value + delta);
    }, true);
  }

  function ttsHintText(voicePreset) {
    const voiceHint = window.AmpsAudio?.presetHint?.(voicePreset) || "";
    const sources = window.TtsOrchestrator?.publicPronunciationSources?.()?.join(" · ")
      || "Approved human audio · Approved Samskrta rules · English system pronunciation";
    const sk = sanskritPronunciationMode();
    let modeHint = `Reading language follows content. Pronunciation sources: ${sources}.`;
    if (sk === "amps-enhanced") {
      modeHint += " Samskrta segments use AMPS Enhanced rules (speech only).";
    } else if (sk === "basic") {
      modeHint += " Samskrta segments use basic diacritic rules (speech only).";
    }
    return voiceHint ? `${modeHint} ${voiceHint}` : modeHint;
  }

  function ttsPronunciationSelectHtml(selectId) {
    const sel = sanskritPronunciationMode();
    return `<select id="${selectId}">
      <option value="off" ${sel === "off" ? "selected" : ""}>Off</option>
      <option value="basic" ${sel === "basic" ? "selected" : ""}>Basic</option>
      <option value="amps-enhanced" ${sel === "amps-enhanced" ? "selected" : ""}>AMPS Enhanced</option>
    </select>`;
  }

  function bindTtsPronunciationSelect(selectId, hintId, voiceSelectId) {
    document.getElementById(selectId)?.addEventListener("change", e => {
      state.settings.sanskritPronunciation = sanskritPronunciationMode(e.target.value);
      syncLegacyTtsPronunciation();
      saveState();
      const hint = document.getElementById(hintId);
      const voice = document.getElementById(voiceSelectId)?.value || state.settings.ttsVoice;
      if (hint) hint.textContent = ttsHintText(voice);
    });
  }

  function bindTtsVoiceSelect(selectId, previewId) {
    populateTtsVoiceSelect(selectId);
    syncTtsVoiceSelectValue(selectId);
    window.AmpsAudio?.onVoicesReady?.(() => {
      populateTtsVoiceSelect(selectId);
      syncTtsVoiceSelectValue(selectId);
    });
  }

  let ttsVoiceUiReady = false;
  function initTtsVoiceUi() {
    if (ttsVoiceUiReady) return;
    ttsVoiceUiReady = true;

    const voiceSelectIds = new Set(["setTtsVoice", "settingsTtsVoice", "audTtsVoice", "presentVoice"]);
    const previewBtnIds = new Set(["btnTtsPreview", "btnSettingsTtsPreview", "btnAudTtsPreview", "btnPresentTtsPreview"]);

    const onVoiceSelect = e => {
      const el = e.target;
      if (!voiceSelectIds.has(el.id)) return;
      applyTtsVoiceSelection(el.value);
    };

    const onVoiceSelectBlur = e => {
      const el = e.target;
      if (!voiceSelectIds.has(el.id)) return;
      applyTtsVoiceSelection(el.value);
      if (ttsVoicePopulatePending.get(el.id)) {
        ttsVoicePopulatePending.delete(el.id);
        populateTtsVoiceSelect(el.id, true);
      }
    };

    document.addEventListener("change", onVoiceSelect, true);
    document.addEventListener("input", onVoiceSelect, true);
    document.addEventListener("blur", onVoiceSelectBlur, true);

    document.addEventListener("click", e => {
      const btn = e.target.closest?.("button");
      if (!btn || !previewBtnIds.has(btn.id)) return;
      e.preventDefault();
      e.stopPropagation();
      const row = btn.closest(".tts-voice-row");
      const sel = row?.querySelector("select") || document.getElementById("setTtsVoice") || document.getElementById("settingsTtsVoice");
      const voice = sel?.value || state.settings.ttsVoice;
      applyTtsVoiceSelection(voice);
      window.AmpsAudio?.preview?.(voice, effectiveSpeechRate("normal"), sanskritPronunciationMode());
    }, true);
  }

  function initShlokaCollapsibleClickGuard() {
    document.getElementById("app")?.addEventListener("click", e => {
      const summary = e.target.closest?.(
        ".shloka-sources-collapsible summary, .shloka-collapsible-panel summary, " +
        "summary.shloka-sources-label, summary.shloka-collapsible-label"
      );
      if (!summary) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, true);
  }

  function initClickDelegation() {
    document.getElementById("app")?.addEventListener("click", e => {
      if (e.target.closest?.(
        ".shloka-sources-collapsible summary, .shloka-collapsible-panel summary, " +
        "summary.shloka-sources-label, summary.shloka-collapsible-label"
      )) {
        e.stopPropagation();
        return;
      }
      if (!e.target.closest?.(".source-shloka-occurrence, .shloka-source-link, .shloka-open-from-source")) {
        window.AmpsShlokaDeepNav?.clearOccurrenceHighlight?.(document.getElementById("readerArticle"));
      }
      const alphaBtn = e.target.closest?.("[data-alpha-jump]");
      if (alphaBtn && !alphaBtn.disabled && !alphaBtn.classList.contains("is-disabled")) {
        e.preventDefault();
        e.stopPropagation();
        jumpAlphaFromButton(alphaBtn);
        return;
      }
      const seriesToggle = e.target.closest("[data-toggle-series]");
      if (seriesToggle) {
        e.preventDefault();
        window.AmpsEnhance?.toggleSeries(seriesToggle.dataset.toggleSeries);
        renderLibrary();
        return;
      }
      const shlokaRefBtn = e.target.closest(".shloka-ref-link, .shloka-open-from-source");
      if (shlokaRefBtn?.dataset.shlokaPara) {
        e.preventDefault();
        e.stopPropagation();
        goToShlokaFromSource(shlokaRefBtn.dataset.shlokaPara, {
          paraId: shlokaRefBtn.dataset.fromPara || null,
          occurrenceId: shlokaRefBtn.dataset.occurrence || null,
        });
        return;
      }
      const shlokaSourceBtn = e.target.closest(".shloka-source-link");
      if (shlokaSourceBtn?.dataset.book && shlokaSourceBtn.dataset.ch) {
        e.preventDefault();
        e.stopPropagation();
        goToSourceOccurrence(
          shlokaSourceBtn.dataset.book,
          shlokaSourceBtn.dataset.ch,
          shlokaSourceBtn.dataset.para,
          {
            shlokaId: shlokaSourceBtn.dataset.shlokaId,
            occurrenceId: shlokaSourceBtn.dataset.occurrence,
          }
        );
        return;
      }
      const shlokaNavBtn = e.target.closest(".canonical-shloka-nav-btn");
      if (shlokaNavBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (!shlokaNavBtn.disabled && shlokaNavBtn.dataset.shlokaNav) {
          goToCanonicalShloka(shlokaNavBtn.dataset.shlokaNav);
        }
        return;
      }
      const returnBtn = e.target.closest("#btnReadingReturn");
      if (returnBtn) {
        e.preventDefault();
        returnFromReading();
        return;
      }
      const fnBack = e.target.closest(".fn-back");
      if (fnBack?.dataset.fnBack) {
        e.preventDefault();
        e.stopPropagation();
        window.AmpsFootnotes?.scrollToFootnoteRef?.(fnBack.dataset.fnBack);
        return;
      }
      const fnBtn = e.target.closest(".fn-ref, .fn-sup");
      if (fnBtn?.dataset.fn != null) {
        e.preventDefault();
        e.stopPropagation();
        window.AmpsFootnotes?.scrollToFootnote?.(+fnBtn.dataset.fn);
        return;
      }
      const chBtn = e.target.closest("[data-ch]");
      if (chBtn && !e.target.closest(
        ".sel-toolbar, #modalRoot .summary-row, .shloka-sources, .shloka-refs, " +
        ".shloka-sources-collapsible, .shloka-collapsible-panel, .canonical-shloka-nav, " +
        ".shloka-supplementary-meanings, .shloka-verse-entry summary"
      )) {
        if (chBtn.classList.contains("shloka-source-link")) return;
        const bookId = chBtn.dataset.book || state.params.parts[1];
        const chapterId = chBtn.dataset.ch;
        if (bookId && chapterId) {
          e.preventDefault();
          e.stopPropagation();
          goToChapter(bookId, chapterId, chBtn.dataset.para);
        }
        return;
      }
      const glossBtn = e.target.closest(".gloss-inline, .gloss-entry-term");
      if (glossBtn) {
        e.preventDefault();
        const term = glossBtn.dataset.term;
        const bookId = state.params.parts[1];
        loadBook(bookId).then(book => {
          const local = (F()?.lookupGlossary(term, book) || []).slice(0, 8);
          if (local.length) {
            showGlossaryModal(local, term, book);
            return;
          }
          window.AmpsAdUI?.loadGlossaryIndex?.().then(() => {
            const hits = window.AmpsAdUI?.globalGlossaryLookup(term) || [];
            showGlossaryModal(hits, term, book);
          });
        }).catch(() => {
          window.AmpsAdUI?.loadGlossaryIndex?.().then(() => {
            const hits = window.AmpsAdUI?.globalGlossaryLookup(term) || [];
            showGlossaryModal(hits, term, null);
          });
        });
        return;
      }
      const hashLink = e.target.closest("a.more-item[href^='#'], a.nav-item[href^='#']");
      if (hashLink) {
        const href = hashLink.getAttribute("href") || "";
        if (href.startsWith("#") && href.length > 1) {
          e.preventDefault();
          const seg = href.slice(1).split("/").filter(Boolean);
          const route = seg[0];
          const chapterId = (route === "sutra-game" || route === "shloka-game") ? seg[1] : undefined;
          navigate(route, chapterId ? { chapterId } : {});
          return;
        }
      }
      const xrefBtn = e.target.closest(".xref-inline");
      if (xrefBtn?.dataset.xbook) {
        e.preventDefault();
        navigate("book", { bookId: xrefBtn.dataset.xbook });
      }
    });
  }

  function bookById(id) {
    return state.catalog?.books?.find(b => b.id === id);
  }

  /** Phase 5: when license server URL is set, block books outside plan entitlements. Offline = always allowed. */
  function guardOpenBook(bookId, bookHint) {
    if (!window.AmpsLicense?.isEnforced?.()) return true;
    const meta = bookHint || bookById(bookId) || { id: bookId, title: bookId };
    if (typeof window.AmpsLicense.requireBookAccess === "function") {
      return window.AmpsLicense.requireBookAccess(meta);
    }
    return window.AmpsLicense.isLicensed?.() !== false;
  }

  function bookAccessLocked(bookMeta) {
    if (!window.AmpsLicense?.isEnforced?.()) return false;
    if (!window.AmpsLicense?.isLicensed?.()) return true;
    if (typeof window.AmpsLicense.canAccessBook !== "function") return false;
    return !window.AmpsLicense.canAccessBook(bookMeta || {});
  }

  function catalogBookEntryFromShloka(book) {
    if (!book?.id) return null;
    const sk = String(book.series || "Samskrta Shloka").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "samskrta-shloka";
    return {
      id: book.id,
      title: book.title,
      subtitle: book.subtitle,
      series: book.series,
      seriesKey: sk,
      seriesOrder: book.seriesOrder ?? 0,
      volume: book.volume,
      chapterCount: (book.chapters || []).length,
      pointCount: (book.points || []).length,
      glossaryCount: (book.glossary || []).length,
      searchKeywords: book.searchKeywords || ["Sanskrit Shloka", "Samskrta Shloka", "Samskrta", "Sloka", "verses", "mantra"],
    };
  }

  function patchSamskrtaShlokaCatalog(catalog, book) {
    if (!catalog?.books || catalog.books.some(b => b.id === "samskrta-shloka") || !book?.id) return;
    const entry = catalogBookEntryFromShloka(book);
    if (!entry) return;
    catalog.books.push(entry);
    catalog.books.sort((a, b) => a.title.localeCompare(b.title));
    catalog.bookCount = catalog.books.length;

    const sk = entry.seriesKey;
    catalog.series = catalog.series || [];
    let series = catalog.series.find(s => s.id === sk);
    if (!series) {
      series = { id: sk, title: book.series || "Samskrta Shloka", books: [] };
      catalog.series.push(series);
      catalog.series.sort((a, b) => a.title.localeCompare(b.title));
    }
    if (!series.books.some(b => b.id === book.id)) {
      series.books.push({
        id: book.id,
        title: book.title,
        volume: book.volume,
        seriesOrder: book.seriesOrder ?? 0,
      });
    }

    catalog.discourses = catalog.discourses || [];
    (book.chapters || []).forEach(ch => {
      const discourseId = `${book.id}:${ch.id}`;
      if (catalog.discourses.some(d => d.id === discourseId)) return;
      catalog.discourses.push({
        id: discourseId,
        bookId: book.id,
        chapterId: ch.id,
        title: ch.title,
        chapterNum: ch.chapterNum,
        bookTitle: book.title,
        series: book.series,
        author: book.subtitle || book.author,
        datePlace: ch.datePlace || null,
        paraCount: (ch.paragraphs || []).length,
      });
    });
    catalog.discourseCount = catalog.discourses.length;
  }

  function getHighlights(bookId, chapterId, paraId) {
    return state.highlights.filter(h =>
      h.bookId === bookId && h.chapterId === chapterId && h.paraId === paraId
    );
  }

  function getNotes(bookId, chapterId, paraId) {
    return state.notes.filter(n =>
      n.bookId === bookId && (!chapterId || n.chapterId === chapterId) && (!paraId || n.paraId === paraId)
    );
  }

  function applyHighlights(text, highlights) {
    if (!highlights.length) return esc(text);
    const sorted = [...highlights].sort((a, b) => a.start - b.start);
    let out = "";
    let pos = 0;
    sorted.forEach(h => {
      const s = Math.max(0, h.start);
      const e = Math.min(text.length, h.end);
      if (s < pos) return;
      out += esc(text.slice(pos, s));
      const color = HL_COLORS.find(c => c.id === h.color)?.bg || HL_COLORS[0].bg;
      out += `<mark class="hl-mark" data-hl="${esc(h.id)}" style="background:${color}">${esc(text.slice(s, e))}</mark>`;
      pos = e;
    });
    out += esc(text.slice(pos));
    return out;
  }

  function renderShell(content, opts) {
    const active = opts?.tab || state.route;
    document.body.classList.toggle("today-screen", state.route === "today");
    document.getElementById("app").innerHTML = `
      <header class="topbar">
        <button type="button" class="icon-btn" id="btnBack" aria-label="${state.route === "library" ? "Menu" : "Back"}">${state.route === "library" && active === "library" ? "☰" : "←"}</button>
        <div class="topbar-title">${opts?.title || "AMPS Reader"}</div>
        <button type="button" class="icon-btn" id="btnSearch" aria-label="Search">⌕</button>
      </header>
      <main class="main ${opts?.className || ""}">${content}</main>
      <nav class="bottomnav" aria-label="Main">
        <a href="#library" class="nav-item ${active === "library" ? "active" : ""}"><span>📚</span>${T("library")}</a>
        <a href="#paths" class="nav-item ${active === "paths" ? "active" : ""}"><span>🛤</span>${T("paths")}</a>
        <a href="#discourses" class="nav-item ${active === "discourses" ? "active" : ""}"><span>📜</span>${T("discourses")}</a>
        <a href="#notebook" class="nav-item ${["notebook","highlights","notes"].includes(active) ? "active" : ""}"><span>📓</span>${T("notebook")}</a>
        <a href="#more" class="nav-item ${["more","study","sutra-game","shloka-game","journal","settings","stats","glossary","collections","import","presentation-builder","today","companion","ask","smart-search","audio","voice-lab","shloka-recorder","tools","quote-maker","teacher","backup","qa-bank","exam","daily-challenge","socratic-guide","achievements","history","validation-report","about","privacy-data","privacy"].includes(active) ? "active" : ""}"><span>⋯</span>${T("more")}</a>
      </nav>
      <div id="selToolbar" class="sel-toolbar hidden"></div>
      <div id="modalRoot"></div>`;

    document.getElementById("btnBack")?.addEventListener("click", () => {
      if (state.route === "read" && state.params.parts[1] !== "samskrta-shloka" && pendingShlokaReturn()) {
        returnToExactShloka();
        return;
      }
      if (state.route === "read" && state.readingReturn) {
        returnFromReading();
        return;
      }
      if (state.route === "today" || state.route === "library") {
        showMainMenu();
        return;
      }
      if (state.route === "read") navigate("book", { bookId: state.params.parts[1] });
      else if (state.route === "presentation-builder") window.AmpsPresentation?.goBack?.();
      else if (state.route === "sutra-game") navigate("more");
      else if (["book", "search", "settings", "study", "today", "companion", "smart-search", "audio", "voice-lab", "shloka-recorder", "tools", "quote-maker", "teacher", "backup","qa-bank","exam","daily-challenge","socratic-guide","achievements","history","validation-report","about","privacy-data","privacy","concepts","ask","source-qa","pronunciation"].includes(state.route)) navigate("library");
      else state.ui.drawer = state.ui.drawer ? null : "menu";
    });
    document.getElementById("btnSearch")?.addEventListener("click", () => navigate("search"));
    opts?.bind?.();
  }

  function showMainMenu() {
    const root = document.getElementById("modalRoot");
    if (!root) return;
    root.innerHTML = `<div class="modal-backdrop main-menu-backdrop" id="mainMenuBd">
      <div class="modal main-menu-modal">
        <h3>AMPS Library</h3>
        <div class="more-grid main-menu-grid">
          <a href="#today" class="more-item"><span>3m</span><strong>Today</strong></a>
          <a href="#library" class="more-item"><span>📚</span><strong>Library</strong></a>
          <a href="#search" class="more-item"><span>⌕</span><strong>Search</strong></a>
          <a href="#daily-challenge" class="more-item"><span>D</span><strong>Daily Challenge</strong></a>
          <a href="#sutra-game" class="more-item"><span>📿</span><strong>Sútra Game</strong></a>
          <a href="#shloka-game" class="more-item"><span>ॐ</span><strong>Shloka Game</strong></a>
          <a href="#qa-bank" class="more-item"><span>Q</span><strong>Q&A Bank</strong></a>
          <a href="#quote-maker" class="more-item"><span>Q</span><strong>Quote Card</strong></a>
          <a href="#backup" class="more-item"><span>B</span><strong>Backup</strong></a>
          <a href="#settings" class="more-item"><span>⚙</span><strong>Settings</strong></a>
        </div>
        <button type="button" class="btn btn-ghost" id="mainMenuClose">Close</button>
      </div>
    </div>`;
    document.getElementById("mainMenuClose")?.addEventListener("click", () => { root.innerHTML = ""; });
    document.getElementById("mainMenuBd")?.addEventListener("click", e => {
      if (e.target.id === "mainMenuBd") root.innerHTML = "";
    });
    root.querySelectorAll("a[href^='#']").forEach(a => {
      a.addEventListener("click", () => { root.innerHTML = ""; });
    });
  }

  // AMPS_AV9_BILINGUAL_V1
  // One visible library family, separate language-edition files.
  const BOOK_EDITION_FAMILIES = Object.freeze({
    // आनन्द मार्ग — प्रारम्भिक दर्शन ↔ Ananda Marga: Elementary Philosophy (IDML 2018)
    "ananda-marga-elementary-philosophy": Object.freeze({
      familyId: "ananda-marga-elementary-philosophy",
      en: "ananda-marga-elementary-philosophy",
      hi: "ananda-marga-elementary-philosophy-hi",
    }),
    // HOLD (no switch): AV01-hi wrong source; AV02-hi misbind/absent.
    "ananda-vacanamrtam-04": Object.freeze({
      familyId: "ananda-vacanamrtam-04",
      en: "ananda-vacanamrtam-04",
      hi: "ananda-vacanamrtam-04-hi",
    }),
    "ananda-vacanamrtam-05": Object.freeze({
      familyId: "ananda-vacanamrtam-05",
      en: "ananda-vacanamrtam-05",
      hi: "ananda-vacanamrtam-05-hi",
    }),
    "ananda-vacanamrtam-06": Object.freeze({
      familyId: "ananda-vacanamrtam-06",
      en: "ananda-vacanamrtam-06",
      hi: "ananda-vacanamrtam-06-hi",
    }),
    "ananda-vacanamrtam-07": Object.freeze({
      familyId: "ananda-vacanamrtam-07",
      en: "ananda-vacanamrtam-07",
      hi: "ananda-vacanamrtam-07-hi",
    }),
    "ananda-vacanamrtam-08": Object.freeze({
      familyId: "ananda-vacanamrtam-08",
      en: "ananda-vacanamrtam-08",
      hi: "ananda-vacanamrtam-08-hi",
    }),
    "ananda-vacanamrtam-09": Object.freeze({
      familyId: "ananda-vacanamrtam-09",
      en: "ananda-vacanamrtam-09",
      hi: "ananda-vacanamrtam-09-hi",
    }),
    "ananda-vacanamrtam-10": Object.freeze({
      familyId: "ananda-vacanamrtam-10",
      en: "ananda-vacanamrtam-10",
      hi: "ananda-vacanamrtam-10-hi",
    }),
    "ananda-vacanamrtam-12": Object.freeze({
      familyId: "ananda-vacanamrtam-12",
      en: "ananda-vacanamrtam-12",
      hi: "ananda-vacanamrtam-12-hi",
    }),
    "ananda-vacanamrtam-16": Object.freeze({
      familyId: "ananda-vacanamrtam-16",
      en: "ananda-vacanamrtam-16",
      hi: "ananda-vacanamrtam-16-hi",
    }),
    "ananda-vacanamrtam-18": Object.freeze({
      familyId: "ananda-vacanamrtam-18",
      en: "ananda-vacanamrtam-18",
      hi: "ananda-vacanamrtam-18-hi",
    }),
    "ananda-vacanamrtam-22": Object.freeze({
      familyId: "ananda-vacanamrtam-22",
      en: "ananda-vacanamrtam-22",
      hi: "ananda-vacanamrtam-22-hi",
    }),
    "ananda-vacanamrtam-23": Object.freeze({
      familyId: "ananda-vacanamrtam-23",
      en: "ananda-vacanamrtam-23",
      hi: "ananda-vacanamrtam-23-hi",
    }),
    "ananda-vacanamrtam-24": Object.freeze({
      familyId: "ananda-vacanamrtam-24",
      en: "ananda-vacanamrtam-24",
      hi: "ananda-vacanamrtam-24-hi",
    }),
    "ananda-vacanamrtam-25": Object.freeze({
      familyId: "ananda-vacanamrtam-25",
      en: "ananda-vacanamrtam-25",
      hi: "ananda-vacanamrtam-25-hi",
    }),
    "ananda-vacanamrtam-26": Object.freeze({
      familyId: "ananda-vacanamrtam-26",
      en: "ananda-vacanamrtam-26",
      hi: "ananda-vacanamrtam-26-hi",
    }),
    "ananda-vacanamrtam-27": Object.freeze({
      familyId: "ananda-vacanamrtam-27",
      en: "ananda-vacanamrtam-27",
      hi: "ananda-vacanamrtam-27-hi",
    }),
    "ananda-vacanamrtam-28": Object.freeze({
      familyId: "ananda-vacanamrtam-28",
      en: "ananda-vacanamrtam-28",
      hi: "ananda-vacanamrtam-28-hi",
    }),
    "ananda-vacanamrtam-29": Object.freeze({
      familyId: "ananda-vacanamrtam-29",
      en: "ananda-vacanamrtam-29",
      hi: "ananda-vacanamrtam-29-hi",
    }),
    "ananda-vacanamrtam-31": Object.freeze({
      familyId: "ananda-vacanamrtam-31",
      en: "ananda-vacanamrtam-31",
      hi: "ananda-vacanamrtam-31-hi",
    }),
    "subhasita-samgraha-01": Object.freeze({
      familyId: "subhasita-samgraha-01",
      en: "subhasita-samgraha-01",
      hi: "subhasita-samgraha-01-hi",
    }),
    "subhasita-samgraha-02": Object.freeze({
      familyId: "subhasita-samgraha-02",
      en: "subhasita-samgraha-02",
      hi: "subhasita-samgraha-02-hi",
    }),
    "subhasita-samgraha-03": Object.freeze({
      familyId: "subhasita-samgraha-03",
      en: "subhasita-samgraha-03",
      hi: "subhasita-samgraha-03-hi",
    }),
    "subhasita-samgraha-04": Object.freeze({
      familyId: "subhasita-samgraha-04",
      en: "subhasita-samgraha-04",
      hi: "subhasita-samgraha-04-hi",
    }),
    "subhasita-samgraha-05": Object.freeze({
      familyId: "subhasita-samgraha-05",
      en: "subhasita-samgraha-05",
      hi: "subhasita-samgraha-05-hi",
    }),
    "subhasita-samgraha-06": Object.freeze({
      familyId: "subhasita-samgraha-06",
      en: "subhasita-samgraha-06",
      hi: "subhasita-samgraha-06-hi",
    }),
    "subhasita-samgraha-07": Object.freeze({
      familyId: "subhasita-samgraha-07",
      en: "subhasita-samgraha-07",
      hi: "subhasita-samgraha-07-hi",
    }),
    "subhasita-samgraha-08": Object.freeze({
      familyId: "subhasita-samgraha-08",
      en: "subhasita-samgraha-08",
      hi: "subhasita-samgraha-08-hi",
    }),
    "subhasita-samgraha-09": Object.freeze({
      familyId: "subhasita-samgraha-09",
      en: "subhasita-samgraha-09",
      hi: "subhasita-samgraha-09-hi",
    }),
    "subhasita-samgraha-10": Object.freeze({
      familyId: "subhasita-samgraha-10",
      en: "subhasita-samgraha-10",
      hi: "subhasita-samgraha-10-hi",
    }),
    "subhasita-samgraha-11": Object.freeze({
      familyId: "subhasita-samgraha-11",
      en: "subhasita-samgraha-11",
      hi: "subhasita-samgraha-11-hi",
    }),
    "subhasita-samgraha-12": Object.freeze({
      familyId: "subhasita-samgraha-12",
      en: "subhasita-samgraha-12",
      hi: "subhasita-samgraha-12-hi",
    }),
    "subhasita-samgraha-13": Object.freeze({
      familyId: "subhasita-samgraha-13",
      en: "subhasita-samgraha-13",
      hi: "subhasita-samgraha-13-hi",
    }),
    "subhasita-samgraha-14": Object.freeze({
      familyId: "subhasita-samgraha-14",
      en: "subhasita-samgraha-14",
      hi: "subhasita-samgraha-14-hi",
    }),
    "subhasita-samgraha-15": Object.freeze({
      familyId: "subhasita-samgraha-15",
      en: "subhasita-samgraha-15",
      hi: "subhasita-samgraha-15-hi",
    }),
    "prout-in-a-nutshell-01": Object.freeze({
      familyId: "prout-in-a-nutshell-01",
      en: "prout-in-a-nutshell-01",
      hi: "prout-in-a-nutshell-01-hi",
    }),
    "prout-in-a-nutshell-02": Object.freeze({
      familyId: "prout-in-a-nutshell-02",
      en: "prout-in-a-nutshell-02",
      hi: "prout-in-a-nutshell-02-hi",
    }),
    "prout-in-a-nutshell-03": Object.freeze({
      familyId: "prout-in-a-nutshell-03",
      en: "prout-in-a-nutshell-03",
      hi: "prout-in-a-nutshell-03-hi",
    }),
    "prout-in-a-nutshell-04": Object.freeze({
      familyId: "prout-in-a-nutshell-04",
      en: "prout-in-a-nutshell-04",
      hi: "prout-in-a-nutshell-04-hi",
    }),
    "prout-in-a-nutshell-05": Object.freeze({
      familyId: "prout-in-a-nutshell-05",
      en: "prout-in-a-nutshell-05",
      hi: "prout-in-a-nutshell-05-hi",
    }),
    "prout-in-a-nutshell-06": Object.freeze({
      familyId: "prout-in-a-nutshell-06",
      en: "prout-in-a-nutshell-06",
      hi: "prout-in-a-nutshell-06-hi",
    }),
    "prout-in-a-nutshell-07": Object.freeze({
      familyId: "prout-in-a-nutshell-07",
      en: "prout-in-a-nutshell-07",
      hi: "prout-in-a-nutshell-07-hi",
    }),
    "prout-in-a-nutshell-08": Object.freeze({
      familyId: "prout-in-a-nutshell-08",
      en: "prout-in-a-nutshell-08",
      hi: "prout-in-a-nutshell-08-hi",
    }),
    "prout-in-a-nutshell-09": Object.freeze({
      familyId: "prout-in-a-nutshell-09",
      en: "prout-in-a-nutshell-09",
      hi: "prout-in-a-nutshell-09-hi",
    }),
    "prout-in-a-nutshell-10": Object.freeze({
      familyId: "prout-in-a-nutshell-10",
      en: "prout-in-a-nutshell-10",
      hi: "prout-in-a-nutshell-10-hi",
    }),
    "guide-to-human-conduct-a": Object.freeze({
      familyId: "guide-to-human-conduct-a",
      en: "guide-to-human-conduct-a",
      hi: "guide-to-human-conduct-a-hi",
    }),
    "liberation-of-intellect-neohumanism": Object.freeze({
      familyId: "liberation-of-intellect-neohumanism",
      en: "liberation-of-intellect-neohumanism",
      hi: "buddhi-ki-mukti",
    }),
    "namah-shivaya-shantaya": Object.freeze({
      familyId: "namah-shivaya-shantaya",
      en: "namah-shivaya-shantaya",
      hi: "namah-shivaya-shantaya-hi",
    }),
    "caryacarya-3": Object.freeze({
      familyId: "caryacarya-3",
      en: "caryacarya-3",
      hi: "caryacarya-3-hindi",
    }),
  });

  function bookEditionFamily(bookId) {
    const id = String(bookId || "");

    for (const family of Object.values(BOOK_EDITION_FAMILIES)) {
      if (id === family.en || id === family.hi) return family;
    }

    return null;
  }

  function catalogVisibleBookId(bookId) {
    return bookEditionFamily(bookId)?.familyId || bookId;
  }

  // AMPS_LANGUAGE_SELECTOR_STATIC_LABEL_V1
  function languageSelectorLabelHtml() {
    return '<span class="reader-edition-status">Select language</span>';
  }

  function bookEditionSwitchHtml(bookId, chapterId) {
    const family = bookEditionFamily(bookId);

    if (!family) return "";

    const activeHindi = bookId === family.hi;
    const ch = String(chapterId || "").trim();
    const enHref = ch ? `#read/${family.en}/${encodeURIComponent(ch)}` : `#book/${family.en}`;
    const hiHref = ch ? `#read/${family.hi}/${encodeURIComponent(ch)}` : `#book/${family.hi}`;

    return `<section class="reader-edition-bar book-edition-switch"
      aria-label="Book language">
      ${languageSelectorLabelHtml()}
      <a class="btn ${activeHindi ? "btn-ghost" : "btn-gold"}"
         href="${enHref}"
         data-book-language="en"
         aria-current="${activeHindi ? "false" : "page"}"
         aria-pressed="${activeHindi ? "false" : "true"}">English</a>
      <a class="btn ${activeHindi ? "btn-gold" : "btn-ghost"}"
         href="${hiHref}"
         data-book-language="hi"
         aria-current="${activeHindi ? "page" : "false"}"
         aria-pressed="${activeHindi ? "true" : "false"}">हिन्दी</a>
    </section>`;
  }

  function libraryBrowseHtml(qRaw) {
    const q = String(qRaw || "").toLowerCase();
    const series = state.catalog.series || [];
    const recent = Object.entries(state.progress)
      .sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0))
      .slice(0, 5)
      .map(([bookId]) => bookById(bookId))
      .filter(Boolean);
    let html = "";

    const qotd = F()?.quoteOfTheDay(state.catalog);
    if (qotd && !q) {
      html += `<section class="quote-card">
        <p class="hero-eyebrow">Passage of the day</p>
        <h3>${esc(qotd.title)}</h3>
        <p class="muted">${esc(qotd.bookTitle)}</p>
        <button type="button" class="btn btn-gold btn-sm" data-book="${esc(qotd.bookId)}" data-ch="${esc(qotd.chapterId)}">Read now</button>
      </section>`;
    }

    // Newly catalogued books (addedAt) — front of library so they are easy to find.
    const recentlyAdded = [...(state.catalog.books || [])]
      .filter(b => b?.id && b.addedAt && (!bookEditionFamily(b.id) || b.id === bookEditionFamily(b.id).en))
      .sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)))
      .slice(0, 8)
      .map(b => bookById(b.id) || b)
      .filter(Boolean);
    if (recentlyAdded.length && !q) {
      html += `<section class="section"><h2 class="section-head">${T("recentlyAdded") || "Recently added"}</h2><div class="book-grid">`;
      recentlyAdded.forEach(b => { html += bookCard(b, state.progress[b.id]); });
      html += `</div></section>`;
    }

    const favBooks = (state.favorites.books || []).map(bookById).filter(Boolean);
    if (favBooks.length && !q) {
      html += `<section class="section"><h2 class="section-head">Favorites</h2><div class="book-grid">`;
      favBooks.forEach(b => { html += bookCard(b, state.progress[b.id]); });
      html += `</div></section>`;
    }

    if (recent.length && !q) {
      html += `<section class="section"><h2 class="section-head">Continue reading</h2><div class="book-grid">`;
      recent.forEach(b => {
        html += bookCard(b, state.progress[b.id]);
      });
      html += `</div></section>`;
    }

    const recentIds = state.recent.map(bookById).filter(Boolean).slice(0, 8);
    if (recentIds.length && !q) {
      html += `<section class="section"><h2 class="section-head">Recently opened</h2><div class="chip-row">`;
      recentIds.forEach(b => {
        html += `<button type="button" class="chip" data-book="${esc(b.id)}">${esc(b.title.slice(0, 28))}</button>`;
      });
      html += `</div></section>`;
    }

    const favSeries = state.settings.favSeries;
    const sortedSeries = [...series].sort((a, b) => {
      if (a.id === favSeries) return -1;
      if (b.id === favSeries) return 1;
      return a.title.localeCompare(b.title);
    });
    sortedSeries.forEach(s => {
      if (!s?.id) return;
      const books = (s.books || [])
        .map(b => (b?.id ? bookById(b.id) || b : null))
        .filter(b => b?.id && (!bookEditionFamily(b.id) || b.id === bookEditionFamily(b.id).en))
        .filter(b => b?.id && (!q || textMatchesQuery(bookSearchBlob(b), q) || textMatchesQuery(s.title, q)))
        .sort((a, b) => {
          // Phase2C: numeric volume ascending within series (ignore addedAt / title alpha).
          const aVol = Number(a.volumeNumber ?? a.seriesOrder ?? 0) || 0;
          const bVol = Number(b.volumeNumber ?? b.seriesOrder ?? 0) || 0;
          if (aVol !== bVol) return aVol - bVol;
          return String(a.id || "").localeCompare(String(b.id || ""));
        });
      if (!books.length) return;
      const seriesAlpha = titleAlphaLetter(s.title);
      if (window.AmpsEnhance?.seriesSectionHtml) {
        html += window.AmpsEnhance.seriesSectionHtml(s, books, b => bookCard(b, state.progress[b.id]), seriesAlpha);
      } else {
        html += `<section class="section series-section"${seriesAlpha ? ` data-alpha="${seriesAlpha}"` : ""} data-series="${esc(s.id)}"><h2 class="section-head">${esc(s.title)} <span class="badge">${books.length}</span></h2><div class="book-grid">`;
        books.forEach(b => { html += bookCard(b, state.progress[b.id]); });
        html += `</div></section>`;
      }
    });
    return html;
  }

  function bindLibraryBrowse(root) {
    const scope = root || document.getElementById("libBrowse");
    if (!scope) return;
    scope.querySelectorAll("[data-book]").forEach(el => {
      if (el.dataset.ch) return;
      el.addEventListener("click", () => {
        if (!guardOpenBook(el.dataset.book)) return;
        navigate("book", { bookId: el.dataset.book });
      });
    });
    scope.querySelectorAll("[data-resume-book]").forEach(el => {
      el.addEventListener("click", e => {
        e.stopPropagation();
        if (!guardOpenBook(el.dataset.resumeBook)) return;
        const resume = readingResumeParams(el.dataset.resumeBook);
        if (resume) navigate("read", resume);
        });
    });
    document.addEventListener("keydown", e => {
      if (state.route !== "read" || state.params.parts[1] !== "samskrta-shloka" || state.params.parts[2] !== "ch-verses") return;
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const target = e.target;
      if (target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      const currentId = state.params.parts[3];
      const rows = state.bookCache["samskrta-shloka"]?.chapters?.find(ch => ch.id === "ch-verses")?.paragraphs || [];
      const nav = window.AmpsShlokaDeepNav?.activeNeighbors?.(rows, currentId);
      if (!nav?.ok) return;
      const next = e.key === "ArrowLeft" ? nav.prev : nav.next;
      if (!next?.id) return;
      e.preventDefault();
      goToCanonicalShloka(next.id);
    });
  }

  function updateLibraryBrowse() {
    const browse = document.getElementById("libBrowse");
    if (!browse) return;
    browse.innerHTML = libraryBrowseHtml(state.params.q || "");
    bindLibraryBrowse(browse);
    const host = document.getElementById("libAlphaNavHost");
    if (host) {
      host.innerHTML = renderAlphaNav(libraryAlphaPresentSet(state.params.q || ""), {
        id: "libAlphaNav",
        mode: "library",
        ariaLabel: "Jump to series or books by first letter",
        itemLabel: "series or books",
      });
    }
  }

  async function renderLibrary() {
    if (bookLanguage() !== "en") {
      try {
        const registry = await loadLanguageRegistry();
        const packs = registry?.books || {};
        await Promise.all(Object.keys(packs)
          .filter(bookId => packs[bookId]?.packs?.[bookLanguage()])
          .map(bookId => loadReaderLanguagePack(bookId, bookLanguage())));
      } catch (err) {
        console.warn("AMPS language registry unavailable:", err);
      }
    }
    const todayMin = window.AmpsStats?.todayMinutes(state.stats) || 0;
    const streak = window.AmpsStats?.streak(state.stats) || 0;
    const q = state.params.q || "";
    let body = `
      <section class="hero">
        <p class="hero-eyebrow">Ananda Marga Pracaraka Samgha</p>
        <h1>Sacred Library</h1>
        <p class="hero-sub">${state.catalog.bookCount} books · ${state.catalog.discourseCount} discourses · ${state.catalog.glossaryTermCount || "?"} glossary terms</p>
        <div class="stats-inline"><span>${todayMin} min ${T("todayGoal")}</span> · <span>${streak} ${T("streak")}</span>
          <a href="#stats" class="link">${T("stats")}</a></div>
        <div class="hero-actions">
          <a href="#today" class="btn btn-gold">Open Today</a>
          <a href="#smart-search" class="btn btn-ghost">Smart Search</a>
        </div>
      </section>
      <section class="premium-actions" aria-label="Quick actions">
        <a href="#audio" class="premium-action"><strong>Listen Queue</strong><span>Pravachan</span></a>
        <a href="#ask" class="premium-action"><strong>Ask Question</strong><span>Free · Offline</span></a>
        <a href="#pronunciation" class="premium-action"><strong>Pronunciation</strong><span>AMPS rules</span></a>
        <a href="#quote-maker" class="premium-action"><strong>Quote Studio</strong><span>PNG cards</span></a>
      </section>
      <div class="list-alpha-wrap" id="libAlphaWrap">
        <div class="search-bar">
          <input type="text" inputmode="search" autocomplete="off" id="libSearch" placeholder="Search books & discourses…" value="${esc(q)}" />
        </div>
        <div id="libAlphaNavHost">${renderAlphaNav(libraryAlphaPresentSet(q), {
          id: "libAlphaNav",
          mode: "library",
          ariaLabel: "Jump to series or books by first letter",
          itemLabel: "series or books",
        })}</div>
        <p class="muted list-alpha-hint">Tap a letter to jump</p>
      </div>
      <div id="libBrowse">${libraryBrowseHtml(q)}</div>`;

    renderShell(body, {
      title: "Library",
      tab: "library",
      bind: () => {
        document.getElementById("libSearch")?.addEventListener("input", e => {
          state.params.q = e.target.value;
          updateLibraryBrowse();
        });
        bindLibraryBrowse();
      },
    });
  }

  function bookCard(b, prog) {
    if (!b?.id) return "";
    const pct = prog && F() ? F().bookProgress({ chapters: Array(b.chapterCount || 1) }, prog).pct : 0;
    const displayTitle = localizedBookCardTitle(b);
    const hasEdition = displayTitle !== (b.title || "");
    const alpha = titleAlphaLetter(displayTitle || b.title);
    const locked = bookAccessLocked(b);
    return `<button type="button" class="book-card${locked ? " book-card-locked" : ""}" data-book="${esc(b.id)}"${alpha ? ` data-alpha="${alpha}"` : ""}${locked ? ' aria-label="Locked by subscription"' : ""}>
      ${bookCoverHtml(hasEdition ? { ...b, title: displayTitle } : b, "card")}
      <div class="book-card-body">
        <h3>${esc(displayTitle || b.title)} ${isFavoriteBook(b.id) ? "★" : ""}</h3>
        <p>${b.chapterCount || "?"} chapters · ${b.pointCount || "?"} study points</p>
        ${hasEdition ? `<span class="pill edition-pill">हिन्दी · Official translation</span>` : ""}
        ${locked ? `<span class="pill pill-locked">Locked</span>` : ""}
        ${pct ? `<div class="mini-progress"><div class="mini-progress-fill" style="width:${pct}%"></div></div>` : ""}
        ${prog?.chapterId && !locked ? `<span class="pill pill-resume" data-resume-book="${esc(b.id)}">Continue reading</span>` : ""}
      </div>
    </button>`;
  }

  async function renderBook(gen) {
    const snap = routeSnapshot();
    const bookId = snap.parts[1];
    if (!bookId || snap.route !== "book") return;
    if (!guardOpenBook(bookId)) {
      if (renderStale(gen) || routeChanged(snap)) return;
      renderShell(`<div class="pad">
        <h2>Subscription required</h2>
        <p class="muted">This book is not included in your current plan. Activate a license or upgrade your subscription.</p>
        <button type="button" class="btn btn-gold" id="btnBackLibLocked">Library</button>
        <button type="button" class="btn btn-ghost" id="btnOpenLicenseSettings">License settings</button>
      </div>`, {
        title: "Locked",
        tab: "library",
        bind: () => {
          document.getElementById("btnBackLibLocked")?.addEventListener("click", () => navigate("library"));
          document.getElementById("btnOpenLicenseSettings")?.addEventListener("click", () => navigate("settings"));
        },
      });
      return;
    }
    let book;
    try {
      book = await loadBook(bookId);
    } catch (err) {
      if (renderStale(gen) || routeChanged(snap)) return;
      const pack = err.requiredPack;
      const size = pack?.sizeBytes
        ? pack.sizeBytes < 1024 * 1024
          ? `${(pack.sizeBytes / 1024).toFixed(1)} KB`
          : `${(pack.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
        : "—";
      const packBlock = pack
        ? `<p><strong>Not downloaded</strong></p>
           <p class="muted">Required pack: ${esc(pack.title || pack.packId)} (${esc(size)})</p>
           <p class="muted">Import a verified <code>.ampspack</code> from Offline &amp; Downloads, or use a development pack source. Notes and bookmarks for this book are preserved.</p>
           <a class="btn btn-gold" href="#offline">Open Offline &amp; Downloads</a>`
        : `<p class="muted">${esc(err.message)}</p>`;
      renderShell(`<div class="pad"><h2>Not downloaded</h2>${packBlock}
        <button type="button" class="btn btn-ghost" id="btnBackLib" style="margin-top:12px">Library</button></div>`, {
        title: "Not downloaded", tab: "library",
        bind: () => document.getElementById("btnBackLib")?.addEventListener("click", () => navigate("library")),
      });
      return;
    }
    if (renderStale(gen) || routeChanged(snap)) return;
    let activeLanguage = { lang: "en", mode: "english_only", registry: null, entry: null, pack: null };
    try {
      activeLanguage = await activeBookEdition(bookId);
      if (activeLanguage?.pack) book = translatedReaderBook(book, activeLanguage);
    } catch (err) {
      console.warn("AMPS language pack unavailable:", err);
    }
    const meta = bookById(bookId);
    const prog = state.progress[bookId];
    const visibleChapters = visibleBookChapters(book);
    const first = visibleChapters[0]?.id || book.chapters[0]?.id;
    const resume = readingResumeParams(bookId);
    const metaLine = `${visibleChapters.length} chapters · ${book.points?.length || meta?.pointCount || 0} study points`;
    let body = `
      <section class="hero hero-book-detail">
        <div class="hero-cover-wrap">${bookCoverHtml(meta || book, "hero")}</div>
        ${bookEditionSwitchHtml(bookId)}
        <h1>${esc(titleWithHindiPart(book))}</h1>
        ${activeLanguage?.entry ? `<p class="hero-book-meta muted">${esc(activeLanguage.pack?.nativeName || activeLanguage.entry.nativeName || activeLanguage.lang)} · ${esc(editionStatusText(activeLanguage))}</p>` : ""}
        <p class="hero-book-meta muted">${esc(metaLine)}</p>
        ${readerEditionBarHtml(bookId, activeLanguage)}
        <div class="hero-actions">
          <button type="button" class="btn btn-ghost" id="btnBackLib">← Library</button>
          ${resume ? `<button type="button" class="btn btn-gold" id="btnContinue">Continue reading</button>` : ""}
          <button type="button" class="btn ${resume ? "btn-ghost" : "btn-gold"}" id="btnRead">${resume ? "Start from beginning" : "Start reading"}</button>
          <button type="button" class="btn btn-ghost" id="btnPresent">Discourse mode</button>
          <button type="button" class="btn btn-ghost" id="btnSummarize">Summarize</button>
          <button type="button" class="btn btn-ghost" id="btnStudyBook">Memorize / Study</button>
          ${bookId === "ananda-sutram" ? `<button type="button" class="btn btn-ghost" id="btnSutraGame">Sútra memory game</button>` : ""}
          ${bookId === "samskrta-shloka" ? `<button type="button" class="btn btn-ghost" id="btnShlokaGame">Shloka memory game</button>` : ""}
          ${bookId === "samskrta-shloka" ? `<button type="button" class="btn btn-ghost" id="btnShlokaRecorder">🎙 Record shlokas</button>` : ""}
          <button type="button" class="btn btn-ghost" id="btnFav">${isFavoriteBook(bookId) ? "★ Favorited" : "☆ Favorite"}</button>
        </div>
      </section>
      <section class="section">
        <h2 class="section-head">Table of contents <span class="badge">${visibleChapters.length}</span></h2>
        <div class="toc-list">`;
    let lastPart = null;
    visibleChapters.forEach((ch, i) => {
      const level = Number(ch.tocLevel) || 0;
      const part = String(ch.partTitle || "").trim();
      if (part && part !== lastPart) {
        body += `<div class="toc-part">${esc(part)}</div>`;
        lastPart = part;
      } else if (!part) {
        lastPart = "";
      }
      const num = ch.chapterNum || "";
      const label = ch.title;
      body += `<button type="button" class="toc-item${level ? " toc-sub" : ""}" data-book="${bookId}" data-ch="${ch.id}">
        <span class="toc-num">${esc(num)}</span>
        <span class="toc-label">${esc(label)}${ch.datePlace ? `<span class="toc-date muted"> · ${esc(ch.datePlace)}</span>` : ""}</span>
        <span class="toc-meta">${ch.paragraphs.length} ¶</span>
      </button>`;
    });
    body += `</div></section>`;
    if (book.glossary?.length) {
      body += `<section class="section"><h2 class="section-head">Glossary</h2><div class="glossary-list">`;
      book.glossary.slice(0, 20).forEach(g => {
        const n = (g.locations || []).length;
        const glossCh = g.glossaryChapterId || "";
        const glossPara = g.glossaryParaId || "";
        body += `<button type="button" class="gloss-item gloss-jump" data-term="${esc(g.term)}" data-book="${esc(bookId)}" data-ch="${esc(glossCh)}" data-para="${esc(glossPara)}">
          <strong>${esc(g.term)}</strong>
          <span class="muted">${esc(g.def)}</span>
          ${n ? `<small class="muted">${n} in book</small>` : ""}
        </button>`;
      });
      if (book.glossary.length > 20) {
        const gch = book.glossary[0]?.glossaryChapterId || "";
        body += `<p class="muted">+ ${book.glossary.length - 20} more terms${gch ? ` — <button type="button" class="linkish" data-book="${esc(bookId)}" data-ch="${esc(gch)}">Open Glossary</button>` : ""}</p>`;
      }
      body += `</div></section>`;
    }

    renderShell(body, {
      title: (() => { const t = titleWithHindiPart(book); return t.slice(0, 36) + (t.length > 36 ? "…" : ""); })(),
      tab: "library",
      bind: () => {
        trackRecent(bookId);
        saveState();
        document.getElementById("btnBackLib")?.addEventListener("click", () => navigate("library"));
        document.getElementById("btnContinue")?.addEventListener("click", () => {
          if (resume) navigate("read", resume);
        });
        document.getElementById("btnRead")?.addEventListener("click", () => {
          if (!first) return alert("This book has no chapters yet.");
          navigate("read", { bookId, chapterId: first, pageIndex: 0 });
        });
        document.getElementById("btnPresent")?.addEventListener("click", () => {
          navigate("present", { bookId, chapterId: resume?.chapterId || first });
        });
        document.getElementById("btnSummarize")?.addEventListener("click", () => showBookSummary(book));
        document.getElementById("btnStudyBook")?.addEventListener("click", () => navigate("study", { bookId }));
        document.getElementById("btnSutraGame")?.addEventListener("click", () => navigate("sutra-game"));
        document.getElementById("btnShlokaGame")?.addEventListener("click", () => navigate("shloka-game"));
        document.getElementById("btnShlokaRecorder")?.addEventListener("click", () => navigate("shloka-recorder"));
        document.getElementById("btnFav")?.addEventListener("click", () => { toggleFavoriteBook(bookId); renderFromState(); });
        document.querySelectorAll(".toc-item[data-ch]").forEach(el => {
          el.addEventListener("click", e => {
            e.preventDefault();
            goToChapter(el.dataset.book || bookId, el.dataset.ch);
          });
        });
        document.querySelectorAll(".gloss-jump").forEach(el => {
          el.addEventListener("click", () => {
            const term = el.dataset.term;
            const hits = (F()?.lookupGlossary(term, book) || []).slice(0, 8);
            if (hits.length) showGlossaryModal(hits, term, book);
            else if (el.dataset.ch) goToChapter(el.dataset.book || bookId, el.dataset.ch, el.dataset.para);
          });
        });
        document.querySelectorAll(".linkish[data-ch]").forEach(el => {
          el.addEventListener("click", () => goToChapter(el.dataset.book || bookId, el.dataset.ch));
        });
        bindBookLanguageControls();
      },
    });
  }

  function bookLanguage() {
    return state.settings.bookLanguage || "en";
  }

  function bookLanguageDisplayMode(lang) {
    const mode = state.settings.bookLanguageDisplayMode;
    const activeLang = lang || bookLanguage();
    // Don't keep a stale "English only" view while Language is Hindi (or vice versa).
    if (activeLang !== "en" && mode === "english_only") return "translation_only";
    if (activeLang === "en" && mode === "translation_only") return "english_only";
    if (["translation_only", "english_only", "side_by_side", "translation_below"].includes(mode)) return mode;
    return activeLang && activeLang !== "en" ? "translation_only" : "english_only";
  }

  function segmentSourceHash(text) {
    return window.AmpsReaderLanguagePacks?.sourceHashForText?.(text) || String(text || "");
  }

  async function loadReaderLanguagePack(bookId, lang) {
    if (!lang || lang === "en" || !window.AmpsReaderLanguagePacks) return null;
    const key = `${bookId}:${lang}`;
    if (languagePackCache[key]) return languagePackCache[key];
    const api = window.AmpsReaderLanguagePacks;
    const registry = await loadLanguageRegistry();
    const entry = registry.books?.[bookId]?.packs?.[lang];
    if (!entry) {
      languagePackCache[key] = { registry, entry: null, pack: null };
      return languagePackCache[key];
    }
    const pack = await api.loadPack(readerAssetUrl(""), bookId, lang, entry.relativePath);
    languagePackCache[key] = { registry, entry, pack };
    return languagePackCache[key];
  }

  async function loadLanguageRegistry() {
    if (languageRegistryCache) return languageRegistryCache;
    if (!window.AmpsReaderLanguagePacks) return null;
    languageRegistryCache = await window.AmpsReaderLanguagePacks.loadRegistry(readerAssetUrl(""));
    return languageRegistryCache;
  }

  async function activeBookEdition(bookId) {
    const lang = bookLanguage();
    const registry = await loadLanguageRegistry().catch(() => null);
    const entry = registry?.books?.[bookId]?.packs?.[lang] || null;
    if (lang === "en" || !entry) return { lang: "en", mode: "english_only", registry, entry: null, pack: null };
    const loaded = await loadReaderLanguagePack(bookId, lang);
    return {
      ...loaded,
      lang,
      mode: bookLanguageDisplayMode(lang),
    };
  }

  function packTranslation(pack, id, sourceText) {
    const result = packSegment(pack, id, sourceText);
    return result?.text || null;
  }

  function packSegment(pack, id, sourceText) {
    const api = window.AmpsReaderLanguagePacks;
    if (!api || !pack) return null;
    return api.segmentTranslation(pack, id, segmentSourceHash(sourceText));
  }

  function bilingualText(sourceText, translation, mode) {
    if (!translation || mode === "english_only") return sourceText;
    if (mode === "translation_only") return translation;
    if (mode === "side_by_side") return `${sourceText}\n\n${translation}`;
    return `${sourceText}\n\n${translation}`;
  }

  function getSamskrtaCanonicalLookupSync() {
    const api = window.AmpsSamskrtaPresentation;
    if (!api?.buildCanonicalLookup) return null;
    if (state._samskrtaCanonicalLookup) return state._samskrtaCanonicalLookup;
    const cached =
      state.bookCache?.["samskrta-shloka"] ||
      state.books?.["samskrta-shloka"] ||
      state._samskrtaShlokaBook ||
      null;
    if (!cached) return null;
    state._samskrtaCanonicalLookup = api.buildCanonicalLookup(cached);
    return state._samskrtaCanonicalLookup;
  }

  function applyUniversalSamskrtaPresentation(readerBook, { lang } = {}) {
    const api = window.AmpsSamskrtaPresentation;
    if (!api?.applyToReaderBook || !readerBook) return readerBook;
    return api.applyToReaderBook(readerBook, {
      bookId: readerBook.id,
      language: lang || readerBook.languagePack?.lang || "",
      canonicalLookup: getSamskrtaCanonicalLookupSync(),
    });
  }

  function applyUniversalClassicQuotation(readerBook, { lang } = {}) {
    const api = window.AmpsClassicQuotation;
    if (!api?.applyToReaderBook || !readerBook) return readerBook;
    return api.applyToReaderBook(readerBook, {
      bookId: readerBook.id,
      language: lang || readerBook.languagePack?.lang || "",
    });
  }

  function applyUniversalReaderPresentation(readerBook, { lang } = {}) {
    return applyUniversalClassicQuotation(
      applyUniversalSamskrtaPresentation(readerBook, { lang }),
      { lang }
    );
  }

  /** Pack-edition Hindi explanatory prose — never quotation / shloka card styling. */
  function isHindiPackProseParagraph(para, book, edition) {
    if (!para || !book) return false;
    if (para.samskrtaPresentationAbsorbedBy || para.quotePresentationAbsorbedBy) return false;
    if (Array.isArray(para.semanticBlocks) && para.semanticBlocks.length) return false;
    const lang = para.lang || edition?.lang || book.languagePack?.lang || "";
    if (lang !== "hi") return false;
    const role = String(para.role || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (role === "sanskrit_devanagari" || role === "sanskrit_roman" || role === "sanskrit_meaning") return false;
    if (/^(quote|quotation|classic_quotation|publication_quote|blockquote)/.test(role)) return false;
    if (role && role !== "prose" && role !== "paragraph" && role !== "body" && role !== "text" && role !== "blank_source_paragraph") {
      return false;
    }
    return !!(book.languagePack?.packDefinedEdition || edition?.pack?.editionChapters?.length);
  }

  function packDefinedEditionBook(book, active) {
    const editionChapters = active?.pack?.editionChapters;
    if (!Array.isArray(editionChapters) || !editionChapters.length) return null;

    const lang = active.lang;
    const title =
      active.pack.metadata?.title ||
      active.pack.publisherRelease?.runningBookTitle ||
      active.pack.runningBookTitle ||
      book.title;

    const mapped = {
      ...book,
      title,
      languagePack: { lang, mode: "translation_only", packDefinedEdition: true },
      chapters: editionChapters.map((rawCh, index) => {
        const chId = rawCh.id || `ch${index + 1}`;
        const paragraphs = Array.isArray(rawCh.paragraphs) ? rawCh.paragraphs : [];
        return {
          ...rawCh,
          id: chId,
          title: rawCh.title || chId,
          chapterNum: rawCh.chapterNum || `Chapter ${index + 1}`,
          footnotes: Array.isArray(rawCh.footnotes) ? rawCh.footnotes.map(fn => ({ ...fn })) : [],
          editorialNotes: Array.isArray(rawCh.editorialNotes) ? rawCh.editorialNotes.slice() : [],
          chapterEndMetadata: active.pack.chapterEndMetadata?.[chId] || null,
          languagePack: { lang, mode: "translation_only", packDefinedEdition: true },
          paragraphs: paragraphs.map((p, pIndex) => ({
            ...p,
            id: p.id || `${chId}-p${pIndex + 1}`,
            text: String(p.text || ""),
            sourceText: "",
            translatedText: String(p.text || ""),
            lang,
            languagePack: { lang, mode: "translation_only", packDefinedEdition: true },
            // Preserve explicit structural roles for AMPS_SAMSKRTA_PRESENTATION_V1
            role: p.role || null,
          })),
        };
      }),
    };
    // Priority B/C: role-based Sanskrit + classic quotation (Priority A blocks left untouched)
    return applyUniversalReaderPresentation(mapped, { lang });
  }

  function translatedReaderBook(book, active) {
    if (!active?.pack) return book;
    const lang = active.lang;
    const mode = active.mode;

    if (mode === "translation_only") {
      const packEdition = packDefinedEditionBook(book, active);
      if (packEdition) return packEdition;
    }
    const out = {
      ...book,
      chapters: (book.chapters || []).map(ch => {
        const titleTranslation = packTranslation(active.pack, `${ch.id}-title`, ch.title);
        return {
          ...ch,
          title: bilingualText(ch.title, titleTranslation, mode),
          languagePack: { lang, mode },
          chapterEndMetadata: mode !== "english_only" ? active.pack.chapterEndMetadata?.[ch.id] || null : null,
          paragraphs: (ch.paragraphs || []).map(p => {
            const translatedSegment = packSegment(active.pack, p.id, p.text);
            const tr = translatedSegment?.text || null;
            const semanticBlocks = tr && mode !== "english_only" ? translatedSegment?.blocks || null : null;
            return {
              ...p,
              text: bilingualText(p.text, tr, mode),
              sourceText: p.text,
              translatedText: tr || "",
              semanticBlocks,
              lang: tr && mode !== "english_only" ? lang : "en",
            };
          }),
          footnotes: (ch.footnotes || []).map(fn => {
            const id = `${ch.id}-fn${fn.num}`;
            const tr = packTranslation(active.pack, id, fn.text);
            return {
              ...fn,
              text: bilingualText(fn.text, tr, mode),
              sourceText: fn.text,
              translatedText: tr || "",
              lang: tr && mode !== "english_only" ? lang : "en",
            };
          }),
        };
      }),
    };
    if (mode === "translation_only") {
      const title = active.pack.metadata?.title || active.pack.publisherRelease?.runningBookTitle || active.pack.runningBookTitle;
      if (title) out.title = title;
    }
    // Universal Sanskrit + classic quotation for any remaining role-tagged lines
    // (AMKS Priority-A semanticBlocks already attached above are preserved)
    return applyUniversalReaderPresentation(out, { lang });
  }

  function renderMultilineText(text) {
    return esc(text).replace(/\n/g, "<br />");
  }

  function formatPublicationDevanagariDisplay(text) {
    let dev = String(text || "").trim();
    if (!dev) return "";
    if (window.AmpsSanskritTypography?.formatPublicationDevanagari) {
      dev = window.AmpsSanskritTypography.formatPublicationDevanagari(dev);
    }
    const fmt = window.AmpsShlokaFormat;
    return fmt?.formatIndicDisplay?.(dev) || dev;
  }

  function renderCollapsibleShlokaPanel(label, innerHtml, className = "") {
    const body = String(innerHtml || "").trim();
    if (!body) return "";
    return `<details class="shloka-collapsible-panel ${className}">
      <summary class="shloka-collapsible-label">${esc(label)}</summary>
      <div class="shloka-collapsible-body">${body}</div>
    </details>`;
  }

  function renderSamskrtaShlokaPublicationUnit(p, helpers) {
    const prefs = getShlokaScriptPrefs();
    const fmt = window.AmpsShlokaFormat;
    const presApi = window.AmpsSamskrtaPresentation;
    const meaningApi = window.AmpsSamskrtaMeaning;
    const escFn = helpers?.esc || esc;

    const dev = prefs.dev && p.devanagari ? formatPublicationDevanagariDisplay(p.devanagari) : "";

    let roman = "";
    if (prefs.roman) {
      roman = String(p.sanskritRoman || "").trim();
      if (roman && fmt?.formatRomanDisplay) roman = fmt.formatRomanDisplay(roman) || roman;
      if (!roman && dev && presApi?.deriveOccurrenceRomanFromDevanagari) {
        roman = presApi.deriveOccurrenceRomanFromDevanagari(dev);
      }
    }

    let meaningText = "";
    const showPublicationMeanings = helpers?.canonicalBook !== false;
    if (p.hindiMeaning && (showPublicationMeanings || prefs.meaning)) {
      const raw = String(p.hindiMeaning || "").trim();
      meaningText = meaningApi?.formatMeaningForDisplay
        ? meaningApi.formatMeaningForDisplay(raw)
        : raw.replace(/^\[\s*|\s*\]$/gu, "").trim();
    }

    const paraId = p?.id || "";
    let audioHtml = "";
    if (paraId) {
      const sync = window.AmpsShlokaAudio?.syncSrcFor?.(paraId) || {};
      const srcAttr = sync.src ? ` src="${escFn(sync.src)}"` : "";
      const fallbackAttr = sync.fallback ? ` data-audio-fallback="${escFn(sync.fallback)}"` : "";
      const humanAttr = sync.live && !sync.fallback ? ` data-human-only="1"` : "";
      const hydratedAttr = sync.src ? ` data-hydrated="1"` : "";
      audioHtml = `<audio class="shloka-verse-audio" controls preload="metadata" data-shloka-audio-id="${escFn(paraId)}"${srcAttr}${fallbackAttr}${humanAttr}${hydratedAttr}></audio>`;
    }

    const unitHtml = `<div class="amps-samskrta-unit amps-canonical-shloka-unit">
      ${dev ? `<div class="amps-samskrta-devanagari" lang="sa-Deva">${renderMultilineText(dev)}</div>` : ""}
      ${roman ? `<div class="amps-samskrta-roman" lang="sa-Latn">${renderMultilineText(roman)}</div>` : ""}
      ${meaningText ? `<div class="amps-samskrta-meaning" lang="hi">[${renderMultilineText(meaningText)}]</div>` : ""}
    </div>`;

    const extraScripts = buildShlokaBlocks(p, { ...prefs, meaning: false })
      .filter(bl => !["dev", "roman"].includes(bl.kind));

    let meaningsHtml = "";
    if (showPublicationMeanings || prefs.meaning) {
      const discourseText = String(p.verseMeaning || p.englishMeaning || "").trim();
      const wordText = String(p.wordMeaning || "").trim();
      if (discourseText) {
        meaningsHtml += renderCollapsibleShlokaPanel(
          p.verseMeaning ? "Meaning" : "Meaning",
          `<div class="shloka-meaning-section-body">${renderWordMeaning(discourseText)}</div>`,
          "shloka-discourse-meaning-panel"
        );
      }
      if (wordText) {
        meaningsHtml += renderCollapsibleShlokaPanel(
          (p.verseMeaning || p.hindiMeaning || p.englishMeaning) ? "Word meaning" : "Word meaning",
          `<div class="shloka-meaning-section-body">${renderWordMeaning(wordText)}</div>`,
          "shloka-word-meaning-panel"
        );
      }
    }

    let suppHtml = "";
    if (extraScripts.length) {
      suppHtml += `<div class="shloka-supplementary-scripts">${renderShlokaBlockLines(extraScripts, false)}</div>`;
    }
    if (meaningsHtml) {
      suppHtml += `<div class="shloka-supplementary-meanings">${meaningsHtml}</div>`;
    }

    const editRow = window.AmpsShlokaBookEditor?.isEnabled?.()
      ? `<div class="shloka-verse-edit-row">
          <button type="button" class="btn btn-gold btn-sm shloka-verse-edit-btn" data-verse-edit="${escFn(paraId)}">Edit this verse</button>
        </div>`
      : "";
    const navHtml = helpers?.beforeSourcesHtml || "";
    const sourcesHtml = helpers?.renderShlokaSources?.(p) || "";

    return `${audioHtml}${unitHtml}${suppHtml}${editRow}${sourcesHtml}${navHtml}`;
  }

  const SHLOKA_VERSE_EST_HEIGHT = 168;
  const SHLOKA_INITIAL_RENDER = 36;
  const SHLOKA_LAZY_BATCH = 48;

  function buildShlokaVerseEntryHtml(p, vi, ctx) {
    const bookmarked = isBookmarked(ctx.bookId, ctx.chapterId, p.id);
    const notes = getNotes(ctx.bookId, ctx.chapterId, p.id);
    const searchBlob = ctx.includeSearchBlob ? esc(shlokaVerseSearchBlob(p)) : "";
    const alphaLetter = shlokaRomanAlpha(p.sanskritRoman, p.devanagari);
    const includeNav = ctx.includeNav && (
      (ctx.targetParaId && p.id === ctx.targetParaId) ||
      (!ctx.targetParaId && vi === ctx.navIndex)
    );
    const paraBody = renderSamskrtaShlokaPublicationUnit(p, {
      esc,
      preferHuman: ctx.preferHuman,
      renderShlokaSources,
      canonicalBook: true,
      beforeSourcesHtml: includeNav ? renderCanonicalShlokaNav(ctx.allParagraphs, vi) : "",
    });
    const notesHtml = notes.length
      ? `<div class="para-notes">${notes.map(n => `<div class="note-inline" data-note="${esc(n.id)}">📝 ${n.tags?.length ? `<span class="tag">${esc(n.tags[0])}</span> ` : ""}${esc(n.body)}</div>`).join("")}</div>`
      : "";
    return `<div class="reader-para shloka-verse-entry${bookmarked ? " bookmarked" : ""}" id="${esc(p.id)}" data-para="${esc(p.id)}" data-stable-segment-id="${esc(p.id)}" tabindex="-1"${searchBlob ? ` data-search="${searchBlob}" data-verse="${vi + 1}"` : ` data-verse="${vi + 1}"`}${alphaLetter ? ` data-alpha="${alphaLetter}"` : ""}>${paraBody}${notesHtml}</div>`;
  }

  function patchShlokaVerseSearchBlobs(paragraphs, startIdx, endIdx) {
    for (let vi = startIdx; vi < endIdx; vi += 1) {
      const p = paragraphs[vi];
      const el = document.getElementById(p.id);
      if (!el || el.dataset.searchReady === "1") continue;
      el.dataset.search = shlokaVerseSearchBlob(p).toLowerCase();
      el.dataset.searchReady = "1";
    }
  }

  function scheduleShlokaVerseLazyAppend(ctx) {
    let next = ctx.startIdx;
    const run = () => {
      if (renderStale(ctx.gen) || routeChanged(ctx.snap) || next >= ctx.total) return;
      const batchEnd = Math.min(ctx.total, next + SHLOKA_LAZY_BATCH);
      const parts = [];
      for (let vi = next; vi < batchEnd; vi += 1) {
        parts.push(buildShlokaVerseEntryHtml(ctx.allParagraphs[vi], vi, {
          bookId: ctx.bookId,
          chapterId: ctx.chapterId,
          allParagraphs: ctx.allParagraphs,
          preferHuman: ctx.preferHuman,
          includeSearchBlob: false,
          includeNav: false,
          targetParaId: ctx.targetParaId,
          navIndex: ctx.navIndex,
        }));
      }
      const bottomSpacer = document.getElementById("shlokaVerseBottomSpacer");
      if (bottomSpacer) {
        bottomSpacer.insertAdjacentHTML("beforebegin", parts.join(""));
        bottomSpacer.style.height = `${Math.max(0, ctx.total - batchEnd) * SHLOKA_VERSE_EST_HEIGHT}px`;
      }
      patchShlokaVerseSearchBlobs(ctx.allParagraphs, next, batchEnd);
      window.AmpsShlokaCard?.scheduleHydrate?.(
        document.getElementById("readerArticle"),
        ctx.preferHuman
      );
      next = batchEnd;
      if (next < ctx.total) {
        (window.requestIdleCallback || ((cb) => setTimeout(cb, 16)))(run);
      }
    };
    (window.requestIdleCallback || ((cb) => setTimeout(cb, 16)))(run);
  }

  function renderReaderSemanticBlocks(blocks, context = {}) {
    if (!Array.isArray(blocks) || !blocks.length) return "";
    const bindingApi = window.AmpsCanonicalBinding;
    return blocks.map(block => {
      const type = String(block?.type || "paragraph");
      if (type === "samskrta_unit" || type === "embedded_samskrta_unit") {
        let dev = String(block.devanagari || "").trim();
        if (dev) dev = formatPublicationDevanagariDisplay(dev);
        let roman = String(block.roman || "").trim();
        let meaning = String(block.meaning || "").replace(/^\[\s*|\s*\]$/gu, "").trim();
        const source = block.source || context.source || {};
        const authoritativeCanon = context.authoritativeCanon || null;
        const canonicalShlokaId = block.canonicalShlokaId
          || context.canonicalShlokaId
          || authoritativeCanon?.canonicalShlokaId
          || "";
        const canon = canonicalShlokaId ? canonicalShlokaRecord(canonicalShlokaId) : null;
        let enrichment = null;
        if (canonicalShlokaId && bindingApi?.resolveCanonicalEnrichment) {
          enrichment = bindingApi.resolveCanonicalEnrichment({
            relationship: authoritativeCanon?.relationship
              || authoritativeCanon?.binding?.relationship
              || bindingApi.RELATIONSHIP?.EXACT
              || "EXACT",
            occurrenceDevanagari: dev,
            canonicalRecord: canon,
            binding: authoritativeCanon?.binding || null,
            allowNavigation: !!authoritativeCanon?.canonicalShlokaId,
            occurrenceRoman: roman,
          });
        }
        const meaningApi = window.AmpsSamskrtaMeaning;
        const meaningResolution = meaningApi?.resolveDisplayMeaning
          ? meaningApi.resolveDisplayMeaning({
            block,
            devanagari: dev,
            canonicalShlokaId,
            canonicalRecord: canon,
            binding: authoritativeCanon?.binding || null,
            relationship: authoritativeCanon?.relationship
              || authoritativeCanon?.binding?.relationship
              || "",
            authoritativeCanon,
            bookId: source.bookId || context.bookId,
            chapterId: source.chapterId || context.chapterId,
            sourceParagraphId: source.paragraphId || context.paragraphId,
            approvedMeaningsRegistry: context.approvedMeaningsRegistry || null,
          })
          : null;
        meaning = meaningResolution?.text
          ? (meaningApi.formatMeaningForDisplay
            ? meaningApi.formatMeaningForDisplay(meaningResolution.text)
            : meaningResolution.text.replace(/^\[\s*|\s*\]$/gu, "").trim())
          : "";
        const presApi = window.AmpsSamskrtaPresentation;
        if (presApi?.resolveDisplayRoman) {
          roman = presApi.resolveDisplayRoman({
            devanagari: dev,
            roman,
            enrichment,
            canonicalRecord: canon,
          });
        } else if (!roman && dev && presApi?.deriveOccurrenceRomanFromDevanagari) {
          roman = presApi.deriveOccurrenceRomanFromDevanagari(dev);
        }
        const sourceBookId = source.bookId || context.bookId;
        const sourceChapterId = source.chapterId || context.chapterId;
        const sourceParagraphId = source.paragraphId || context.paragraphId;
        const compositeIds = Array.isArray(authoritativeCanon?.canonicalShlokaIds)
          ? authoritativeCanon.canonicalShlokaIds.filter(Boolean)
          : [];
        const link = canonicalShlokaId && sourceBookId && sourceChapterId && sourceParagraphId
          ? (authoritativeCanon?.relationship === "COMPOSITE" && compositeIds.length > 1
            ? sourceOpenShlokaChromeMulti(
              sourceBookId,
              sourceChapterId,
              sourceParagraphId,
              compositeIds.map((id) => ({ paraId: id, label: id.replace("ch-verses-", "p") })),
              { centered: true }
            )
            : sourceOpenShlokaChrome(sourceBookId, sourceChapterId, sourceParagraphId, {
              paraId: canonicalShlokaId,
              label: context.label || "",
            }, { centered: true }))
          : "";
        return `<div class="amps-samskrta-unit${type === "embedded_samskrta_unit" ? " amps-embedded-samskrta-unit" : ""}"${authoritativeCanon?.relationship ? ` data-canonical-relationship="${esc(authoritativeCanon.relationship)}"` : ""}>
          ${dev ? `<div class="amps-samskrta-devanagari" lang="sa-Deva">${renderMultilineText(dev)}</div>` : ""}
          ${roman ? `<div class="amps-samskrta-roman" lang="sa-Latn">${renderMultilineText(roman)}</div>` : ""}
          ${meaning ? `<div class="amps-samskrta-meaning" lang="hi">[${renderMultilineText(meaning)}]</div>` : ""}
          ${link}
        </div>`;
      }
      if (
        type === "quote" ||
        type === "quotation" ||
        type === "classic_quotation" ||
        type === "publication_quote" ||
        type === "blockquote"
      ) {
        const quoteLang = context.language || context.source?.language || "hi";
        const quoteText = String(block.text || "").trim();
        const attribution = String(block.attribution || "").trim();
        const attrHtml = attribution
          ? `<footer class="amps-publication-quote-attribution" lang="${esc(quoteLang)}">${renderMultilineText(attribution)}</footer>`
          : "";
        return `<blockquote class="amps-publication-quote" lang="${esc(quoteLang)}">${renderMultilineText(quoteText)}${attrHtml}</blockquote>`;
      }
      return `<p class="amps-hindi-prose" lang="hi">${renderMultilineText(block.text || "")}</p>`;
    }).join("");
  }

  function localizedBookTitle(book, edition) {
    if (!book) return "";
    if (edition?.lang && edition.lang !== "en" && edition.pack?.metadata?.title) return edition.pack.metadata.title;
    return book.title || "";
  }

  function hindiKhandSubtitle(book) {
    const sub = String(book?.subtitle || "").trim();
    return /खण्ड/.test(sub) ? sub : "";
  }

  function titleWithHindiPart(book) {
    const title = String(book?.title || "").trim();
    const vol = hindiKhandSubtitle(book);
    if (title && vol && !title.includes(vol)) return `${title} · ${vol}`;
    return title;
  }

  function localizedBookCardTitle(book) {
    const lang = bookLanguage();
    if (!book?.id || lang === "en") {
      // Phase2C: one visible family card — prefer Hindi series/volume title when present.
      const fam = bookEditionFamily(book?.id);
      if (fam && book.id === fam.en) {
        const hi = bookById(fam.hi);
        if (hi && /[\u0900-\u097F]/.test(String(hi.title || ""))) return titleWithHindiPart(hi);
      }
      if (/[\u0900-\u097F]/.test(String(book.title || ""))) return titleWithHindiPart(book);
      return book?.title || "";
    }
    const cached = languagePackCache[`${book.id}:${lang}`];
    const packed = cached?.pack?.metadata?.title;
    if (packed) {
      const vol = hindiKhandSubtitle(book);
      return vol && !String(packed).includes(vol) ? `${packed} · ${vol}` : packed;
    }
    return titleWithHindiPart(book) || book.title || "";
  }

  function registryLanguageOptions(registry, currentBookId) {
    const languages = registry?.languages || [
      { code: "en", nativeName: "English", name: "English" },
      { code: "hi", nativeName: "हिन्दी", name: "Hindi" },
    ];
    const active = bookLanguage();
    return languages
      .filter(l => l.code === "en" || registry?.books?.[currentBookId]?.packs?.[l.code])
      .map(l => `<option value="${esc(l.code)}" ${active === l.code ? "selected" : ""}>${esc(l.nativeName || l.name || l.code)}</option>`)
      .join("");
  }

  function editionStatusText(edition) {
    if (!edition?.entry || edition.lang === "en") return "Original English";
    if (edition.entry.status === "official_approved") return "Official translation";
    return edition.entry.status || "Translation";
  }

  function languageEditionBarHtml(bookId, edition) {
    // File-based EN/HI editions use bookEditionSwitchHtml (BOOK_EDITION_FAMILIES).
    if (bookEditionFamily(bookId)) return "";
    const hasHindi = !!edition?.registry?.books?.[bookId]?.packs?.hi;
    if (!hasHindi) return "";
    const active = (edition?.lang || bookLanguage()) === "hi";
    return `<section class="reader-edition-bar" aria-label="Book language">
      ${languageSelectorLabelHtml()}
      <button type="button" class="btn ${active ? "btn-ghost" : "btn-gold"}" data-book-language="en" aria-pressed="${active ? "false" : "true"}">English</button>
      <button type="button" class="btn ${active ? "btn-gold" : "btn-ghost"}" data-book-language="hi" aria-pressed="${active ? "true" : "false"}">हिन्दी</button>
    </section>`;
  }

  /** @deprecated Prefer languageEditionBarHtml bilingual buttons. */
  function readerEditionBarHtml(bookId, edition) {
    return languageEditionBarHtml(bookId, edition);
  }

  /** Universal chapter prev/next — uses book.chapters[] order (not ID sorting). */
  function renderChapterNavHtml({ bookId, chIdx, chapterTotal, prev, next, placement = "top" }) {
    if (!chapterTotal) return "";
    const posLong = `Chapter ${chIdx + 1} of ${chapterTotal}`;
    const posShort = `${chIdx + 1} / ${chapterTotal}`;
    const placementClass = placement === "top" ? "reader-chapter-nav-top" : "reader-chapter-nav-bottom";
    return `<nav class="reader-chapter-nav ${placementClass}" aria-label="Chapter navigation">
      ${prev
        ? `<button type="button" class="btn btn-ghost reader-ch-nav reader-ch-nav-prev" data-ch-nav="prev" data-book="${esc(bookId)}" data-ch="${esc(prev.id)}"><span class="reader-ch-nav-label-long">← Previous Chapter</span><span class="reader-ch-nav-label-short">‹ Previous</span></button>`
        : `<span class="reader-ch-nav-spacer" aria-hidden="true"></span>`}
      <span class="reader-chapter-nav-pos"><span class="reader-ch-nav-label-long">${esc(posLong)}</span><span class="reader-ch-nav-label-short">${esc(posShort)}</span></span>
      ${next
        ? `<button type="button" class="btn btn-gold reader-ch-nav reader-ch-nav-next" data-ch-nav="next" data-book="${esc(bookId)}" data-ch="${esc(next.id)}"><span class="reader-ch-nav-label-long">Next Chapter →</span><span class="reader-ch-nav-label-short">Next ›</span></button>`
        : `<span class="reader-ch-nav-spacer" aria-hidden="true"></span>`}
    </nav>`;
  }

  function bindChapterNavigation(bookId, prev, next) {
    const goPrev = () => {
      if (!prev) return;
      state.ui.pageIndex = 0;
      navigate("read", { bookId, chapterId: prev.id });
    };
    const goNext = () => {
      if (!next) return;
      state.ui.pageIndex = 0;
      navigate("read", { bookId, chapterId: next.id });
    };
    document.querySelectorAll('[data-ch-nav="prev"]').forEach(el => {
      el.onclick = goPrev;
      if (!prev) el.setAttribute("disabled", "");
      else el.removeAttribute("disabled");
    });
    document.querySelectorAll('[data-ch-nav="next"]').forEach(el => {
      el.onclick = goNext;
      if (!next) el.setAttribute("disabled", "");
      else el.removeAttribute("disabled");
    });
  }

  function bindLanguageEditionControls() {
    document.querySelectorAll("[data-book-language]").forEach(button => {
      button.addEventListener("click", () => {
        const lang = button.dataset.bookLanguage || "en";
        state.settings.bookLanguage = lang;
        state.settings.bookLanguageDisplayMode = lang === "en" ? "english_only" : "translation_only";
        state.ui.pageIndex = 0;
        saveState();
        renderFromState();
      });
    });
  }

  function bindBookLanguageControls() {
    bindLanguageEditionControls();
    const langSel = document.getElementById("setBookLanguage");
    const modeSel = document.getElementById("setBookLanguageDisplay");
    if (langSel && !langSel.dataset.bound) {
      langSel.dataset.bound = "1";
      langSel.addEventListener("change", e => {
        state.settings.bookLanguage = e.target.value;
        state.settings.bookLanguageDisplayMode = e.target.value === "en" ? "english_only" : "translation_only";
        saveState();
        renderFromState();
      });
    }
    if (modeSel && !modeSel.dataset.bound) {
      modeSel.dataset.bound = "1";
      modeSel.addEventListener("change", e => {
        state.settings.bookLanguageDisplayMode = e.target.value;
        saveState();
        renderFromState();
      });
    }
  }

  async function renderRead(gen) {
    const snap = routeSnapshot();
    const bookId = snap.parts[1];
    const chapterId = snap.parts[2];
    if (!bookId || snap.route !== "read") return;
    if (!guardOpenBook(bookId)) {
      if (renderStale(gen) || routeChanged(snap)) return;
      renderShell(`<div class="pad">
        <h2>Subscription required</h2>
        <p class="muted">This book is not included in your current plan.</p>
        <button type="button" class="btn btn-gold" id="btnBackLibLockedRead">Library</button>
      </div>`, {
        title: "Locked",
        tab: "library",
        bind: () => document.getElementById("btnBackLibLockedRead")?.addEventListener("click", () => navigate("library")),
      });
      return;
    }
    let book;
    try {
      book = await loadBook(bookId);
    } catch (err) {
      if (renderStale(gen) || routeChanged(snap)) return;
      renderShell(`<div class="pad"><h2>Could not open book</h2>
        <p class="muted">${esc(err.message)}</p>
        <p>Install the full APK (~39 MB) with all 162 books embedded. A smaller or older file from Google Drive may be incomplete.</p>
        <button type="button" class="btn btn-gold" id="btnBackLib">Back to library</button></div>`, {
        title: "Error",
        tab: "library",
        bind: () => document.getElementById("btnBackLib")?.addEventListener("click", () => navigate("library")),
      });
      return;
    }
    if (renderStale(gen) || routeChanged(snap)) return;
    const sourceBook = book;
    const sourceCh = sourceBook.chapters.find(c => c.id === chapterId) || sourceBook.chapters[0];
    if (bookId !== "samskrta-shloka") {
      await Promise.all([
        loadShlokaSourceIndex().catch(() => null),
        loadCanonicalBindings().catch(() => null),
        loadCanonicalOccurrencesIndex().catch(() => null),
      ]);
    }
    let activeLanguage = { lang: "en", mode: "english_only", registry: null, entry: null, pack: null };
    try {
      activeLanguage = await activeBookEdition(bookId);
      if (activeLanguage?.pack) book = translatedReaderBook(sourceBook, activeLanguage);
    } catch (err) {
      console.warn("AMPS language pack unavailable:", err);
    }
    const ch = book.chapters.find(c => c.id === chapterId) || book.chapters.find(c => c.id === sourceCh?.id) || book.chapters[0];
    if (!ch) {
      navigate("book", { bookId });
      return;
    }

    document.getElementById("app").innerHTML =
      `<div class="loading"><div class="spinner"></div><p>Opening chapter…</p></div>`;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (renderStale(gen) || routeChanged(snap)) return;

    const label = ch.chapterNum
      ? (/[.]$/.test(String(ch.chapterNum).trim()) ? `${ch.chapterNum} ${ch.title}` : `${ch.chapterNum}. ${ch.title}`)
      : ch.title;
    const chIdx = book.chapters.findIndex(c => c.id === ch.id);
    const prev = book.chapters[chIdx - 1];
    const next = book.chapters[chIdx + 1];

    document.body.classList.toggle("immersive", !!state.settings.immersive);
    document.documentElement.dataset.theme = state.settings.theme;
    document.documentElement.style.setProperty("--reader-size", state.settings.fontSize + "px");
    document.documentElement.style.setProperty("--reader-lh", state.settings.lineHeight);
    document.documentElement.style.setProperty("--reader-brightness", (state.settings.brightness || 100) + "%");
    document.documentElement.style.setProperty("--reader-margin", (state.settings.marginH || 1) + "rem");
    document.documentElement.dataset.width = state.settings.readerWidth;
    const fontMap = { serif: "serif", sans: "dm", dyslexia: "dyslexia" };
    document.documentElement.dataset.font = fontMap[state.settings.fontFamily] || state.settings.fontFamily || "serif";
    document.documentElement.dataset.focus = state.settings.focusLine ? "on" : "off";
    document.documentElement.dataset.textAlign = state.settings.textAlign || "justify";

    const pageMode = state.settings.scrollMode === "page";
    const savedProg = state.progress[bookId];
    const targetParaId = snap.parts[3] || savedProg?.paraId || null;
    state.ui.activeParaId = targetParaId || null;
    if (pageMode && targetParaId) {
      const pi = ch.paragraphs.findIndex(p => p.id === targetParaId);
      if (pi >= 0) state.ui.pageIndex = pi;
    } else if (pageMode && savedProg?.chapterId === ch.id && savedProg.pageIndex != null && !snap.parts[3]) {
      state.ui.pageIndex = savedProg.pageIndex;
    }

    const isShlokaVerses = bookId === "samskrta-shloka" && ch.id === "ch-verses";
    const shlokaCardView = isShlokaVerses && state.settings.shlokaCardView !== false;
    if (isShlokaVerses) ensureShlokaVersesDisplay();
    const deepLinkTarget = !!(
      state.params.occurrence ||
      state.params.parts[3] ||
      state._pendingOccurrenceFocus ||
      window.AmpsShlokaDeepNav?.loadNavSession?.()?.focus
    );
    // Restore return target from deep-link query (refresh / shared links).
    if (isShlokaVerses && state.params.fromBook && state.params.fromChapter) {
      state.readingReturn = {
        bookId: state.params.fromBook,
        chapterId: state.params.fromChapter,
        paraId: state.params.fromPara || null,
        occurrenceId: state.params.fromOccurrence || null,
        scrollY: 0,
        label: bookById(state.params.fromBook)?.title?.slice(0, 48) || "Source",
      };
    }
    if (!isShlokaVerses && state.params.fromBook === "samskrta-shloka" && state.params.fromPara) {
      state.readingReturn = {
        bookId: "samskrta-shloka",
        chapterId: state.params.fromChapter || "ch-verses",
        paraId: state.params.fromPara,
        occurrenceId: null,
        scrollY: 0,
        label: "Samskrta Shloka",
      };
    }

    const prog = F()?.bookProgress(book, state.progress[bookId]) || { pct: 0, chapterIdx: chIdx };
    const stats = F()?.chapterStats(ch, state.ui.readScrollPct) || { remainMin: 5, totalMin: 10 };
    const totalVerses = isShlokaVerses ? ch.paragraphs.length : 0;
    const shlokaUseLazy = isShlokaVerses
      && totalVerses > SHLOKA_INITIAL_RENDER
      && !String(state.ui.shlokaVerseQuery || "").trim();
    let shlokaRenderStart = 0;
    let shlokaRenderEnd = totalVerses;
    if (shlokaUseLazy) {
      const targetIdx = targetParaId ? ch.paragraphs.findIndex(p => p.id === targetParaId) : 0;
      const center = Math.max(0, targetIdx);
      shlokaRenderStart = Math.max(0, center - Math.floor(SHLOKA_INITIAL_RENDER / 2));
      shlokaRenderEnd = Math.min(totalVerses, shlokaRenderStart + SHLOKA_INITIAL_RENDER);
      if (shlokaRenderEnd - shlokaRenderStart < SHLOKA_INITIAL_RENDER) {
        shlokaRenderStart = Math.max(0, shlokaRenderEnd - SHLOKA_INITIAL_RENDER);
      }
    }
    const paras = isShlokaVerses
      ? ch.paragraphs
      : (pageMode
        ? [ch.paragraphs[Math.min(state.ui.pageIndex, ch.paragraphs.length - 1)]].filter(Boolean)
        : ch.paragraphs);

    const isGlossaryChapter = /glossary/i.test(ch.title || "");
    const useEnrich = (isGlossaryChapter || paras.length <= 40) && typeof enrichParagraph === "function";
    if (!isShlokaVerses) await loadShlokaEntriesMap();
    const preferHumanShloka = state.settings.shlokaPreferHumanAudio !== false;
    const showShlokaScriptBar = bookId === "samskrta-shloka" || isAnandaSutramBook(bookId) || chapterHasShlokas(ch, bookId);
    const bookmarkParaId = activeReaderParaId(targetParaId || ch.paragraphs[state.ui.pageIndex]?.id || ch.paragraphs[0]?.id);
    const toolbarBookmarked = bookmarkParaId && isBookmarked(bookId, ch.id, bookmarkParaId);
    const toolbarOpts = {
      label,
      remainMin: stats.remainMin,
      bookmarked: toolbarBookmarked,
      audioActive: document.body.classList.contains("tts-reading"),
      audioPaused: document.body.classList.contains("tts-paused") || !!state.ui.audioPaused,
      ttsRate: state.settings.ttsRate || 1,
    };
    const chunks = [`
      <div class="reader-progress"><div class="reader-progress-fill" style="width:${prog.pct}%"></div></div>
      ${bookEditionSwitchHtml(bookId, ch.id)}
      ${renderReadingReturnBar()}
      ${window.AmpsReaderUI?.toolbarHtml?.(toolbarOpts) || ""}
      ${readerEditionBarHtml(bookId, activeLanguage)}
      ${renderChapterNavHtml({ bookId, chIdx, chapterTotal: book.chapters.length, prev, next, placement: "top" })}
      ${window.AmpsProductivity?.readerExtrasHtml?.(bookId, ch, book) || ""}
      ${showShlokaScriptBar ? renderShlokaScriptBar() : ""}
      ${showShlokaScriptBar ? (window.AmpsShlokaStudy?.studyBarHtml?.(state.settings) || "") : ""}
      ${isShlokaVerses ? `<div class="shloka-verse-search-wrap">
        <input type="search" id="shlokaVerseSearch" class="shloka-verse-search" placeholder="Search Roman, Devanagari, English meaning, source…" value="${esc(state.ui.shlokaVerseQuery || "")}" />
        ${renderShlokaAlphaNav(shlokaAlphaPresentSet(paras))}
        <p class="muted shloka-verse-count" id="shlokaVerseCount">${ch.paragraphs.length} verses · tap a letter to jump</p>
      </div>
      ${window.AmpsShlokaBookEditor?.renderReaderBarHtml?.() || ""}` : ""}
      ${state.settings.focusLine ? '<div class="focus-line" aria-hidden="true"></div>' : ""}
      <article class="reader-article${book.languagePack?.packDefinedEdition ? " amps-print-reader-house-style-v1" : ""}${ch.frontMatter || ch.readerRole === "title" ? " reader-title-page" : ""}${isShlokaVerses ? " amps-sanskrit-typography-v1 reader-virtualized" : ""} ${book.layoutProfile ? `book-layout-${esc(book.layoutProfile)}` : ""} ${pageMode && !isShlokaVerses ? "page-mode" : ""}${!isShlokaVerses && !deepLinkTarget && window.AmpsVirtualScroll?.shouldVirtualize?.(ch.paragraphs.length, pageMode) ? " reader-virtualized" : ""}" id="readerArticle">
        ${ch.suppressReaderHeading || ch.hideReaderHead ? "" : `<header class="reader-head">
          <p class="reader-book">${esc(book.title)}</p>
          ${book.subtitle || book.author ? `<p class="reader-author">${esc(book.subtitle || book.author)}</p>` : ""}
          <h1 data-stable-segment-id="${esc(ch.id)}-title">${esc(ch.title)}</h1>
        </header>`}`];

    if (isShlokaVerses && shlokaUseLazy) {
      if (shlokaRenderStart > 0) {
        chunks.push(`<div class="reader-vspacer shloka-verse-spacer" id="shlokaVerseTopSpacer" style="height:${shlokaRenderStart * SHLOKA_VERSE_EST_HEIGHT}px" aria-hidden="true"></div>`);
      }
      const shlokaLazyCtx = {
        bookId,
        chapterId: ch.id,
        allParagraphs: ch.paragraphs,
        preferHuman: preferHumanShloka,
        includeSearchBlob: false,
        includeNav: true,
        targetParaId: targetParaId || null,
        navIndex: shlokaRenderStart,
      };
      for (let vi = shlokaRenderStart; vi < shlokaRenderEnd; vi += 1) {
        chunks.push(buildShlokaVerseEntryHtml(ch.paragraphs[vi], vi, shlokaLazyCtx));
      }
      if (shlokaRenderEnd < totalVerses) {
        chunks.push(`<div class="reader-vspacer shloka-verse-spacer" id="shlokaVerseBottomSpacer" style="height:${(totalVerses - shlokaRenderEnd) * SHLOKA_VERSE_EST_HEIGHT}px" aria-hidden="true"></div>`);
      }
      state._shlokaLazyRender = {
        bookId,
        chapterId: ch.id,
        startIdx: shlokaRenderEnd,
        total: totalVerses,
        gen,
        snap,
        targetParaId: targetParaId || null,
        navIndex: shlokaRenderStart,
        preferHuman: preferHumanShloka,
        patchStart: shlokaRenderStart,
        patchEnd: shlokaRenderEnd,
      };
    } else for (let vi = 0; vi < paras.length; vi += 1) {
      const p = paras[vi];
      const hls = getHighlights(bookId, ch.id, p.id);
      const notes = getNotes(bookId, ch.id, p.id);
      const bookmarked = isBookmarked(bookId, ch.id, p.id);
      const shlokaEntry = getShlokaEntryForPara(bookId, ch.id, p);
      const isShloka = isShlokaParagraph(bookId, ch.id, p);
      const inlineShloka = isShloka && bookId !== "samskrta-shloka";
      const verseNum = isShlokaVerses ? vi + 1 : 0;
      const searchBlob = isShlokaVerses && !shlokaUseLazy ? esc(shlokaVerseSearchBlob(shlokaEntry || p)) : "";
      const alphaLetter = isShlokaVerses
        ? shlokaRomanAlpha((shlokaEntry || p).sanskritRoman, (shlokaEntry || p).devanagari)
        : "";
      const prevInChapter = ch.paragraphs[(pageMode && !isShlokaVerses ? ch.paragraphs.findIndex(x => x.id === p.id) : vi) - 1];
      const nextInChapter = ch.paragraphs[(pageMode && !isShlokaVerses ? ch.paragraphs.findIndex(x => x.id === p.id) : vi) + 1];
      const reviewedShlokaGroupClass = p.renderType === "shloka" && (prevInChapter?.renderType === "shloka" || nextInChapter?.renderType === "shloka")
        ? ` reviewed-shloka-group${prevInChapter?.renderType !== "shloka" ? " reviewed-shloka-group-start" : ""}${nextInChapter?.renderType !== "shloka" ? " reviewed-shloka-group-end" : ""}`
        : "";
      let discourseRomanShloka = !isShloka
        && !isAnandaSutramBook(bookId)
        && window.AmpsShlokaFormat?.isRomanShloka?.(p.text, prevInChapter?.text, nextInChapter?.text);
      let discourseDevVerse = !isShloka
        && !discourseRomanShloka
        && !isAnandaSutramBook(bookId)
        && isDiscourseDevanagariVersePara(p);
      // Merge consecutive discourse verse lines into one centered block
      let discourseShlokaMergedText = null;
      let discourseShlokaMergedRoman = null;
      let discourseShlokaSkip = false;
      let discourseVerseIsDev = false;
      let discourseCombinedUnit = false;
      if ((discourseRomanShloka || discourseDevVerse) && !isShlokaVerses) {
        const prevIsDiscourse = prevInChapter
          && !isShlokaParagraph(bookId, ch.id, prevInChapter)
          && (
            discourseRomanShloka
              ? window.AmpsShlokaFormat?.isRomanShloka?.(
                prevInChapter.text,
                ch.paragraphs[ch.paragraphs.findIndex(x => x.id === prevInChapter.id) - 1]?.text,
                p.text
              )
              : isDiscourseDevanagariVersePara(prevInChapter)
          );
        // Also skip Roman lines absorbed into a preceding Dev+Roman unit
        const prevIsDevVerse = prevInChapter
          && !isShlokaParagraph(bookId, ch.id, prevInChapter)
          && isDiscourseDevanagariVersePara(prevInChapter);
        if (prevIsDiscourse || (discourseRomanShloka && prevIsDevVerse)) {
          discourseShlokaSkip = true;
          discourseRomanShloka = false;
          discourseDevVerse = false;
        } else {
          const merged = [String(p.text || "").replace(/^\(\s*\d+\s*\)\s*/, "").trim()];
          let j = vi + 1;
          while (j < paras.length) {
            const cand = paras[j];
            const candPrev = paras[j - 1];
            const candNext = paras[j + 1];
            if (isShlokaParagraph(bookId, ch.id, cand)) break;
            const ok = discourseRomanShloka
              ? window.AmpsShlokaFormat?.isRomanShloka?.(cand.text, candPrev?.text, candNext?.text)
              : isDiscourseDevanagariVersePara(cand);
            if (!ok) break;
            merged.push(String(cand.text || "").replace(/^\(\s*\d+\s*\)\s*/, "").trim());
            j += 1;
          }
          // After Dev lines, pull immediately-following Roman verse lines into the same unit
          if (discourseDevVerse) {
            const romanMerged = [];
            while (j < paras.length) {
              const cand = paras[j];
              const candPrev = paras[j - 1];
              const candNext = paras[j + 1];
              if (isShlokaParagraph(bookId, ch.id, cand)) break;
              if (isDiscourseDevanagariVersePara(cand)) break;
              if (!window.AmpsShlokaFormat?.isRomanShloka?.(cand.text, candPrev?.text, candNext?.text)) break;
              romanMerged.push(String(cand.text || "").replace(/^\(\s*\d+\s*\)\s*/, "").trim());
              j += 1;
            }
            if (romanMerged.length) {
              discourseShlokaMergedRoman = romanMerged.join("\n");
              discourseCombinedUnit = true;
            }
          }
          if (merged.length > 1) {
            discourseShlokaMergedText = merged.join("\n");
            discourseVerseIsDev = !!discourseDevVerse;
          } else if (discourseDevVerse) {
            discourseVerseIsDev = true;
          }
        }
      }
      if (discourseShlokaSkip) continue;
      // Absorbed into a preceding visual Sanskrit unit — emit ID alias only
      if (p.samskrtaPresentationAbsorbedBy) {
        chunks.push(
          `<span class="samskrta-id-alias" id="${esc(p.id)}" data-para="${esc(p.id)}" data-stable-segment-id="${esc(p.id)}" data-absorbed-by="${esc(p.samskrtaPresentationAbsorbedBy)}" hidden aria-hidden="true"></span>`
        );
        continue;
      }
      // Absorbed into a preceding visual classic quotation — emit ID alias only
      if (p.quotePresentationAbsorbedBy) {
        chunks.push(
          `<span class="quote-id-alias" id="${esc(p.id)}" data-para="${esc(p.id)}" data-stable-segment-id="${esc(p.id)}" data-absorbed-by="${esc(p.quotePresentationAbsorbedBy)}" hidden aria-hidden="true"></span>`
        );
        continue;
      }
      const authoritativeCanon = resolveParagraphAuthoritativeCanonical(bookId, ch.id, p);
      const semanticSourceHit = authoritativeCanon?.canonicalShlokaId
        ? {
          paraId: authoritativeCanon.canonicalShlokaId,
          label: "",
          authority: authoritativeCanon.authority,
          status: authoritativeCanon.status,
        }
        : null;
      let paraBody;
      let semanticBlockBody = false;
      try {
        if (Array.isArray(p.semanticBlocks) && p.semanticBlocks.length) {
        const effectiveCanonical = authoritativeCanon?.canonicalShlokaId || "";
        paraBody = renderReaderSemanticBlocks(p.semanticBlocks, {
          bookId,
          chapterId: ch.id,
          paragraphId: p.id,
          language: p.lang || activeLanguage?.lang || "",
          canonicalShlokaId: effectiveCanonical,
          authoritativeCanon,
          label: "",
          source: {
            bookId,
            chapterId: ch.id,
            paragraphId: p.id,
            language: p.lang || activeLanguage?.lang || "",
          },
        });
          semanticBlockBody = true;
          const hasQuoteBlock = p.semanticBlocks.some(b =>
            ["quote", "quotation", "classic_quotation", "publication_quote", "blockquote"].includes(String(b?.type || ""))
          );
          if (hasQuoteBlock) {
            // marker for CSS — classic quotation must remain visually distinct
            p._hasClassicQuotation = true;
          }
        } else if (isShlokaVerses) {
          const showCanonNav = (targetParaId && p.id === targetParaId) || (!targetParaId && vi === 0);
          paraBody = renderSamskrtaShlokaPublicationUnit(shlokaEntry || p, {
            esc,
            preferHuman: state.settings.shlokaPreferHumanAudio !== false,
            renderShlokaSources,
            canonicalBook: true,
            beforeSourcesHtml: showCanonNav ? renderCanonicalShlokaNav(ch.paragraphs, vi) : "",
          });
        } else if (isShloka) {
          paraBody = renderShlokaBody(shlokaEntry || p, { inline: inlineShloka });
        } else if (isAnandaSutramBook(bookId) && isAnandaSutramRomanLine(p, prevInChapter)) {
          paraBody = renderAnandaSutramPara(p, ch);
        } else if (discourseCombinedUnit && discourseDevVerse) {
          paraBody = renderDiscourseSamskrtaUnit(
            discourseShlokaMergedText || p.text,
            discourseShlokaMergedRoman,
            ch
          );
        } else if (discourseRomanShloka) {
          paraBody = renderDiscourseRomanShloka(discourseShlokaMergedText || p.text, ch);
        } else if (discourseDevVerse) {
          paraBody = renderDiscourseDevanagariVerse(discourseShlokaMergedText || p.text, ch);
        } else if (hls.length) {
          paraBody = applyHighlights(stripDiscourseListNumber(p.text), hls);
          if (fnApi()?.linkFootnoteRefsHtml) paraBody = fnApi().linkFootnoteRefsHtml(paraBody, ch);
        } else if (useEnrich && enrichParagraph) {
          paraBody = enrichParagraph(stripDiscourseListNumber(p.text), book, ch);
          if (!paraBody.includes("fn-ref") && fnApi()?.linkFootnoteRefsHtml) {
            paraBody = fnApi().linkFootnoteRefsHtml(paraBody, ch);
          }
        } else {
          paraBody = linkParaFootnotes(stripDiscourseListNumber(p.text), ch);
        }
      } catch (_) {
        paraBody = isShlokaVerses
          ? renderSamskrtaShlokaPublicationUnit(shlokaEntry || p, {
            esc,
            preferHuman: state.settings.shlokaPreferHumanAudio !== false,
            renderShlokaSources,
            canonicalBook: true,
            beforeSourcesHtml: ((targetParaId && p.id === targetParaId) || (!targetParaId && vi === 0))
              ? renderCanonicalShlokaNav(ch.paragraphs, vi)
              : "",
          })
          : isShloka
            ? renderShlokaBody(shlokaEntry || p, { inline: inlineShloka })
            : linkParaFootnotes(stripDiscourseListNumber(p.text), ch);
      }
      if (!isShlokaVerses && fnApi()?.appendStructuredRefs) {
        paraBody = fnApi().appendStructuredRefs(paraBody, p, ch, esc);
      }
      const hindiPackProse = isHindiPackProseParagraph(p, book, activeLanguage);
      if (hindiPackProse && !semanticBlockBody) {
        paraBody = `<p class="amps-hindi-prose" lang="${esc(p.lang || activeLanguage?.lang || "hi")}">${paraBody}</p>`;
      }
      const isAnandaSutra = isAnandaSutramBook(bookId) && isAnandaSutramRomanLine(p, prevInChapter);
      const discourseShlokaClass = (discourseRomanShloka || discourseDevVerse) ? " discourse-shloka-entry" : "";
      const sourceBlurbClass = !discourseRomanShloka && !discourseDevVerse && !isShloka && !hindiPackProse && isSourceBlurbPara(p.text) ? " source-blurb" : "";
      const hasSamskrtaPresentation = (semanticBlockBody && hasSamskrtaSemanticBlock(p.semanticBlocks)) || discourseCombinedUnit;
      const shlokaClass = (isShloka || isAnandaSutra) && !hindiPackProse && !hasSamskrtaPresentation ? " shloka-entry" : "";
      const samskrtaUnitClass = hasSamskrtaPresentation ? " has-samskrta-unit" : "";
      const verseClass = isShlokaVerses ? " shloka-verse-entry" : "";
      const sutraClass = isAnandaSutra ? " ananda-sutra-entry" : "";
      const contentTypeClass = p.contentType ? ` content-${String(p.contentType).replace(/[^a-z0-9_-]+/gi, "-")}` : "";
      const paragraphTag = p.renderType === "heading2" ? "h2" : "p";
      const bodyTag = semanticBlockBody || hindiPackProse || discourseDevVerse || discourseCombinedUnit ? "div" : paragraphTag;
      const bodyClass = semanticBlockBody || hindiPackProse || discourseDevVerse || discourseCombinedUnit ? "para-text rich-language-blocks" : "para-text";
      const misTaggedShlokaProse = isMisTaggedShlokaProse(p);
      const paragraphRole = misTaggedShlokaProse ? "prose" : String(p.displayRole || p.role || "").toLowerCase();
      const isTitlePageRole = ["title", "volume", "author", "publisher"].includes(paragraphRole);
      const paragraphIsHeading = (
        !isTitlePageRole && (
        paragraphRole === "heading"
        || paragraphRole === "subtitle"
        || p.renderType === "heading2"
        || p.contentType === "subheading"
        || p.contentType === "chapter_title"
        )
      );
      const paragraphCentered = !paragraphIsHeading && (
        (!misTaggedShlokaProse && (p.alignment === "center" || p.align === "center"))
        || paragraphRole === "shloka"
        || paragraphRole === "author"
        || isTitlePageRole
      );
      const paragraphStartAligned = (
        paragraphIsHeading
        || p.alignment === "left"
        || p.align === "start"
        || p.align === "left"
        || paragraphRole === "prose"
      );
      const paragraphIsShloka = paragraphRole === "shloka";
      const paragraphStyle = [
        paragraphCentered ? "text-align:center!important" : "",
        paragraphCentered ? "text-align-last:center!important" : "",
        paragraphStartAligned && !paragraphCentered ? "text-align:start!important" : "",
        paragraphStartAligned && !paragraphCentered ? "text-align-last:start!important" : "",
        paragraphCentered || paragraphIsHeading ? "width:100%" : "",
        paragraphCentered || paragraphIsHeading || paragraphStartAligned ? "text-indent:0!important" : "",
        paragraphIsShloka ? "white-space:pre-line" : "",
        paragraphIsShloka ? "line-height:1.35" : "",
        paragraphIsShloka ? "margin:1.1em auto" : "",
        paragraphIsHeading ? "font-size:1.25em" : "",
        paragraphIsHeading ? "font-weight:700!important" : "",
        paragraphIsHeading ? "margin-top:1.75em" : "",
        paragraphIsHeading ? "margin-bottom:0.85em" : "",
        paragraphIsHeading ? "line-height:1.35" : "",
        !paragraphIsHeading && p.fontWeight === "bold" ? "font-weight:700!important" : "",
        paragraphRole === "title" ? "font-size:1.85em" : "",
        paragraphRole === "title" ? "font-weight:700!important" : "",
        paragraphRole === "title" ? "letter-spacing:0.04em" : "",
        paragraphRole === "title" ? "margin:2.8em auto 0.45em" : "",
        paragraphRole === "title" ? "line-height:1.35" : "",
        paragraphRole === "volume" ? "font-size:1.12em" : "",
        paragraphRole === "volume" ? "font-weight:600!important" : "",
        paragraphRole === "volume" ? "letter-spacing:0.08em" : "",
        paragraphRole === "volume" ? "margin:0.35em auto 1.8em" : "",
        paragraphRole === "author" ? "font-size:1.12em" : "",
        paragraphRole === "author" ? "font-weight:600!important" : "",
        paragraphRole === "author" ? "margin:1.6em auto 0.4em" : "",
        paragraphRole === "publisher" ? "font-size:0.92em" : "",
        paragraphRole === "publisher" ? "font-weight:600!important" : "",
        paragraphRole === "publisher" ? "margin:3.4em auto 2em" : "",
        paragraphRole === "publisher" ? "letter-spacing:0.04em" : "",
      ].filter(Boolean).join(";");
      const paragraphStyleAttr = paragraphStyle ? ` style="${paragraphStyle}"` : "";
      const sourceFigures = Array.isArray(p.images) && p.images.length
        ? `<div class="source-figure-grid">${p.images.map((image) => `<figure class="source-figure"><img src="${esc(image.src)}" alt="${esc(image.alt || "Source illustration")}" loading="lazy" />${image.caption ? `<figcaption>${esc(image.caption)}</figcaption>` : ""}</figure>`).join("")}</div>`
        : "";
      // Prefer reviewed canonical bindings; fall back to shloka-source-index for
      // plain discourse verses (Roman / Devanagari) so SS↔Samskrta nav works both ways.
      const indexHitRaw = !semanticSourceHit && !isShlokaVerses && bookId !== "samskrta-shloka"
        ? state.shlokaSourceIndex?.[shlokaSourceLookupKey(bookId, ch.id, p.id)]
        : null;
      const indexHitCand = window.AmpsShlokaDeepNav?.normalizeSourceIndexEntry?.(indexHitRaw) ||
        (typeof indexHitRaw === "string" ? { paraId: indexHitRaw, label: "" } : indexHitRaw);
      const indexHitOk = indexHitCand && (
        discourseRomanShloka || discourseDevVerse || isShloka
        || sourceHitMatchesParagraph(indexHitCand, discourseShlokaMergedText || p.text)
      );
      const sourceHit = semanticSourceHit || (indexHitOk ? indexHitCand : null);
      const occId = sourceHit?.paraId ? sourceOccurrenceId(sourceHit.paraId, ch.id, p.id) : "";
      const shlokaCrossLink = sourceHit?.paraId
        ? (semanticBlockBody ? "" : sourceOpenShlokaChrome(bookId, ch.id, p.id, sourceHit, {
          centered: !!discourseRomanShloka || !!discourseDevVerse || !!isShloka,
        }))
        : "";
      const occData = occId
        ? ` data-occurrence-id="${esc(occId)}" data-shloka-id="${esc(sourceHit.paraId)}" data-source-book-id="${esc(bookId)}" data-source-chapter-id="${esc(ch.id)}" data-source-paragraph-id="${esc(p.id)}" data-occurrence-start="${esc(p.id)}" data-occurrence-end="${esc((p.samskrtaPresentationMemberIds || [p.id]).slice(-1)[0])}" aria-label="Shloka occurrence ${esc(sourceHit.paraId)}"`
        : "";
      chunks.push(`<div class="reader-para${samskrtaUnitClass}${contentTypeClass}${shlokaClass}${verseClass}${sutraClass}${discourseShlokaClass}${sourceBlurbClass}${reviewedShlokaGroupClass}${p._hasClassicQuotation ? " has-classic-quotation" : ""}${occId ? " source-shloka-occurrence" : ""} ${bookmarked ? "bookmarked" : ""}" id="${esc(p.id)}" data-para="${esc(p.id)}" data-stable-segment-id="${esc(p.id)}" tabindex="${occId ? "-1" : "-1"}"${occData}${searchBlob ? ` data-search="${searchBlob}" data-verse="${verseNum}"` : ""}${alphaLetter ? ` data-alpha="${alphaLetter}"` : ""}>
        ${occId ? `<span class="source-occurrence-anchor" id="${esc(occId)}" hidden aria-hidden="true"></span>` : ""}
        ${isShlokaVerses ? "" : ""}
        ${sourceFigures}${isShlokaVerses ? paraBody : `<${bodyTag} class="${bodyClass}"${paragraphStyleAttr}>${paraBody}</${bodyTag}>`}${isShlokaVerses ? "" : shlokaCrossLink}
        ${notes.length ? `<div class="para-notes">${notes.map(n => `<div class="note-inline" data-note="${esc(n.id)}">📝 ${n.tags?.length ? `<span class="tag">${esc(n.tags[0])}</span> ` : ""}${esc(n.body)}</div>`).join("")}</div>` : ""}
      </div>`);
    }

    if (state.settings.showCommentary && window.AmpsAdUI?.renderCommentaryBlock) {
      chunks.push(window.AmpsAdUI.renderCommentaryBlock(ch, true));
    }
    chunks.push(renderChapterFootnotes(ch));

    if (renderStale(gen) || routeChanged(snap)) return;

    if (ch.chapterEndMetadata) {
      const place = ch.chapterEndMetadata.place ? `<div class="chapter-end-place">${esc(ch.chapterEndMetadata.place)}</div>` : "";
      const date = ch.chapterEndMetadata.date ? `<div class="chapter-end-date">${esc(ch.chapterEndMetadata.date)}</div>` : "";
      chunks.push(`<aside class="chapter-end-meta" aria-label="प्रवचन स्थान और तिथि">${place}${date}</aside>`);
    } else if (ch.datePlace) {
      chunks.push(`<footer class="discourse-meta"><p class="discourse-meta-label">Date &amp; place</p><p>${esc(ch.datePlace)}</p></footer>`);
    }

    chunks.push(`</article>
      <footer class="chapter-actions-wrap" id="chapterActionsWrap">
        <p class="chapter-actions-hint" id="chapterActionsHint">Tap a paragraph while reading, then use:</p>
        <div class="chapter-actions" aria-label="Chapter passage actions">
          <button type="button" class="para-action chapter-action-btn" data-ch-act="read">Read</button>
          <button type="button" class="para-action chapter-action-btn" data-ch-act="copy">Copy</button>
          <button type="button" class="para-action chapter-action-btn" data-ch-act="quote">Quote</button>
          <button type="button" class="para-action chapter-action-btn" data-ch-act="note">Note</button>
          <button type="button" class="para-action chapter-action-btn" data-ch-act="source">Source</button>
          ${isShlokaVerses && window.AmpsShlokaBookEditor?.isEnabled?.() ? `<button type="button" class="para-action chapter-action-btn" data-ch-act="correct">Correct</button>` : ""}
        </div>
      </footer>
      <div class="reader-nav">
        ${pageMode ? `<button type="button" class="btn btn-ghost" id="btnPagePrev" ${state.ui.pageIndex <= 0 ? "disabled" : ""}>← Page</button>
          <span class="muted">¶ ${state.ui.pageIndex + 1} / ${ch.paragraphs.length}</span>
          <button type="button" class="btn btn-gold" id="btnPageNext" ${state.ui.pageIndex >= ch.paragraphs.length - 1 ? "disabled" : ""}>Page →</button>` :
        `${prev ? `<button type="button" class="btn btn-ghost reader-ch-nav" id="btnPrev" data-ch-nav="prev" data-book="${bookId}" data-ch="${prev.id}">← ${esc(prev.title.slice(0, 24))}</button>` : "<span></span>"}
        ${next ? `<button type="button" class="btn btn-gold reader-ch-nav" id="btnNext" data-ch-nav="next" data-book="${bookId}" data-ch="${next.id}">${esc(next.title.slice(0, 24))} →</button>` : "<span></span>"}`}
      </div>
      ${window.AmpsProductivity?.readerSplitCloseHtml?.(bookId, ch, book) || ""}
      <aside id="readerDrawer" class="reader-drawer ${state.ui.drawer === "toc" ? "open" : ""}">
        <h3>Contents</h3>
        <div class="drawer-toc">${(() => {
          let lastPart = null;
          return visibleBookChapters(book).map(c => {
            const level = Number(c.tocLevel) || 0;
            const part = String(c.partTitle || "").trim();
            let head = "";
            if (part && part !== lastPart) {
              head = `<div class="drawer-toc-part">${esc(part)}</div>`;
              lastPart = part;
            } else if (!part) {
              lastPart = "";
            }
            const lb = c.chapterNum ? c.chapterNum + " " + c.title : c.title;
            return `${head}<button type="button" class="drawer-toc-item${level ? " toc-sub" : ""}${c.id === ch.id ? " active" : ""}" data-book="${bookId}" data-ch="${c.id}">${esc(lb)}</button>`;
          }).join("");
        })()}</div>
      </aside>
      <aside id="settingsDrawer" class="reader-drawer ${state.ui.drawer === "settings" ? "open" : ""}">
        <h3>Reading settings</h3>
        <label>Typography preset
          <select id="setTypoPreset">${Object.keys(window.AmpsEnhance?.TYPO_PRESETS || { default: 1 }).map(k =>
            `<option value="${k}" ${state.settings.typoPreset === k ? "selected" : ""}>${k}</option>`).join("")}
          </select>
        </label>
        <label>Theme
          <select id="setTheme">${["light", "sepia", "navy", "dark", "contrast"].map(t =>
            `<option value="${t}" ${state.settings.theme === t ? "selected" : ""}>${t}</option>`).join("")}
          </select>
        </label>
        <label>Font size <span id="fontVal">${state.settings.fontSize}</span>
          <input type="range" id="setFont" min="14" max="26" value="${state.settings.fontSize}" />
        </label>
        <label>Line height
          <input type="range" id="setLh" min="1.4" max="2.2" step="0.05" value="${state.settings.lineHeight}" />
        </label>
        <label>Width
          <select id="setWidth">${["narrow", "normal", "wide"].map(w =>
            `<option value="${w}" ${state.settings.readerWidth === w ? "selected" : ""}>${w}</option>`).join("")}
          </select>
        </label>
        <label>Reading mode
          <select id="setScrollMode">
            <option value="scroll" ${state.settings.scrollMode === "scroll" ? "selected" : ""}>Continuous scroll</option>
            <option value="page" ${state.settings.scrollMode === "page" ? "selected" : ""}>Paginated (paragraph)</option>
          </select>
        </label>
        <label>Text alignment
          <select id="setTextAlign">
            <option value="justify" ${(state.settings.textAlign || "justify") === "justify" ? "selected" : ""}>Justified</option>
            <option value="start" ${state.settings.textAlign === "start" ? "selected" : ""}>Left aligned</option>
            <option value="center" ${state.settings.textAlign === "center" ? "selected" : ""}>Center aligned</option>
          </select>
        </label>
        <label class="check-row"><input type="checkbox" id="setTabletSplit" ${state.productivity?.tabletSplit !== false ? "checked" : ""} /> Tablet split: study panel beside text</label>
        <label>Horizontal margin
          <input type="range" id="setMargin" min="0.5" max="3" step="0.25" value="${state.settings.marginH || 1}" />
        </label>
        <label>Brightness
          <input type="range" id="setBright" min="70" max="130" value="${state.settings.brightness || 100}" />
        </label>
        <label class="check-row"><input type="checkbox" id="setFocus" ${state.settings.focusLine ? "checked" : ""} /> Focus line (reading ruler)</label>
        <label class="check-row"><input type="checkbox" id="setCommentary" ${state.settings.showCommentary ? "checked" : ""} /> ${T("commentary")} / ${T("footnotes")}</label>
        ${showShlokaScriptBar ? renderShlokaScriptSelect("setShlokaScriptMode") : ""}
        <label>${T("lang")}<select id="setLang"><option value="en" ${state.settings.lang === "en" ? "selected" : ""}>${T("english")}</option><option value="hi" ${state.settings.lang === "hi" ? "selected" : ""}>${T("hindi")}</option></select></label>
        <label>Book language
          <select id="setBookLanguage">
            ${registryLanguageOptions(activeLanguage?.registry, bookId)}
          </select>
        </label>
        <label>Show original
          <select id="setBookLanguageDisplay">
            <option value="translation_only" ${bookLanguageDisplayMode(bookLanguage()) === "translation_only" ? "selected" : ""}>Translation only</option>
            <option value="english_only" ${bookLanguageDisplayMode(bookLanguage()) === "english_only" ? "selected" : ""}>English only</option>
            <option value="side_by_side" ${bookLanguageDisplayMode(bookLanguage()) === "side_by_side" ? "selected" : ""}>Side by side</option>
            <option value="translation_below" ${bookLanguageDisplayMode(bookLanguage()) === "translation_below" ? "selected" : ""}>Translation below</option>
          </select>
        </label>
        <label>TTS speed <span id="setTtsRateVal">${(state.settings.ttsRate || 1).toFixed(1)}×</span>
          <input type="range" id="setTtsRate" data-reader-tts-rate min="0.6" max="1.6" step="0.1" value="${state.settings.ttsRate || 1}" />
        </label>
        <label>Voice
          <span class="tts-voice-row">${ttsVoiceSelectHtml("setTtsVoice")}
          <button type="button" class="btn btn-ghost btn-sm" id="btnTtsPreview">Preview</button></span>
        </label>
        <p class="muted">Accent is a preference after pronunciation certification. “Indian Female” is used only when a certified Indian-English female voice exists on this device; otherwise the best certified English voice is selected and announced. Review voices: <a href="admin/english-voice-review.html">English voice qualification</a>.</p>
        <p class="muted">Reading language: automatic from content. Pronunciation: approved human audio, approved Samskrta rules, or English system pronunciation. Experimental audio is not available publicly. Voice accent is separate from language.</p>
        <label>Samskrta pronunciation (for Samskrta text only)
          ${ttsPronunciationSelectHtml("setTtsPronunciation")}
        </label>
        <label>Sanskrit reading speed
          ${sanskritSpeechRateSelectHtml("setSanskritSpeechRate")}
        </label>
        <p class="muted">Samskrta pronunciation rules apply only to Samskrta segments — ordinary English uses the English engine. Chapter text on screen is never changed.</p>
        <div class="pravachan-panel">
          <a href="#pronunciation" class="btn btn-ghost btn-sm">Manage pronunciation corrections (${pronunciationOverrides().length})</a>
          <label>Pronunciation correction
            <input type="text" id="pronRoman" placeholder="Roman word, e.g. Citta" />
          </label>
          <label>Read as Devanagari
            <input type="text" id="pronDev" placeholder="चित्त" />
          </label>
          <button type="button" class="btn btn-ghost btn-sm" id="btnAddPron">Add correction</button>
          <p class="muted">${pronunciationOverrides().length} local corrections. Select text while reading and tap 🗣 to report pronunciation.</p>
        </div>
        <div class="pravachan-panel">
          <label>TTS provider
            <select id="setTtsProvider">
              <option value="device" ${normalizeTtsProvider(state.settings.ttsProvider) === "device" ? "selected" : ""}>Device voice</option>
              <option value="api" ${normalizeTtsProvider(state.settings.ttsProvider) === "api" ? "selected" : ""}>High-quality API voice</option>
              <option value="my-voice" ${normalizeTtsProvider(state.settings.ttsProvider) === "my-voice" ? "selected" : ""}>My trained voice</option>
            </select>
          </label>
          <p class="muted">Device voice works offline. My trained voice requires a consented voice model/API trained from your own recordings.</p>
        </div>
        <div class="pravachan-panel">
          <label>Optional high-quality TTS API URL
            <input type="url" id="setTtsApiUrl" value="${esc(state.settings.ttsApiUrl || "")}" placeholder="https://..." />
          </label>
          <label>Optional TTS API key
            <input type="password" id="setTtsApiKey" value="${esc(state.settings.ttsApiKey || "")}" autocomplete="off" />
          </label>
          <p class="muted">Use this for a general high-quality TTS server (<code>/api/tts/synthesize</code>). Server needs its provider key.</p>
        </div>
        <div class="pravachan-panel">
          <label>My Voice TTS URL
            <input type="url" id="setOwnVoiceTtsUrl" value="${esc(state.settings.ownVoiceTtsUrl || "")}" placeholder="https://your-voice-server.example.com" />
          </label>
          <label>My Voice API key
            <input type="password" id="setOwnVoiceTtsKey" value="${esc(state.settings.ownVoiceTtsKey || "")}" autocomplete="off" />
          </label>
          <label>My Voice ID
            <input type="text" id="setOwnVoiceId" value="${esc(state.settings.ownVoiceId || "my-voice")}" placeholder="my-voice" />
          </label>
          <button type="button" class="btn btn-ghost btn-sm" id="btnOwnVoicePreview">Test My Voice</button>
          <p class="muted">Use only your own consenting trained voice. Do not train, clone, imitate, or label any voice as Baba/Shrii Shrii Anandamurti. My Voice uses AMPS Hindi-Saṁskṛta pronunciation automatically.</p>
          <a href="#voice-lab" class="btn btn-ghost btn-sm">Open Own Voice Lab</a>
        </div>
        <p class="muted tts-voice-hint" id="setTtsVoiceHint"></p>
        <div class="pravachan-panel">
          <label>Reader audio mode
            <select id="setTtsReadingStyle">
              <option value="human" ${normalizeTtsReadingStyle(state.settings.ttsReadingStyle) === "human" ? "selected" : ""}>Human discourse (recommended)</option>
              <option value="normal" ${normalizeTtsReadingStyle(state.settings.ttsReadingStyle) === "normal" ? "selected" : ""}>Normal Reading</option>
              <option value="pravachan" ${normalizeTtsReadingStyle(state.settings.ttsReadingStyle) === "pravachan" ? "selected" : ""}>Pravachan-style Reading</option>
            </select>
          </label>
          <label class="check-row"><input type="checkbox" id="setPravachanStyle" ${normalizeTtsReadingStyle(state.settings.ttsReadingStyle) === "pravachan" ? "checked" : ""} /> 🎙 Pravachan Style</label>
          <label>Single speaker
            <select id="setPravachanSpeaker">
              <option value="in-en-male" ${!["in-en-female", "en-female", "hi-female", "hi", "female"].includes(normalizeTtsVoice(state.settings.ttsVoice)) ? "selected" : ""}>Male only</option>
              <option value="in-en-female" ${["in-en-female", "en-female", "hi-female", "hi", "female"].includes(normalizeTtsVoice(state.settings.ttsVoice)) ? "selected" : ""}>Female only</option>
            </select>
          </label>
          <p class="muted">Single calm Indian-English discourse voice with natural pauses. Recognized Saṁskrta terms are spoken through phonetic Roman forms, so the speaker does not change and English words remain English.</p>
          <div class="pravachan-controls">
            <button type="button" class="btn btn-gold btn-sm" id="btnPravachanPlay">Play</button>
            <button type="button" class="btn btn-ghost btn-sm" id="btnPravachanPause">Pause</button>
            <button type="button" class="btn btn-ghost btn-sm" id="btnPravachanResume">Resume</button>
            <button type="button" class="btn btn-ghost btn-sm" id="btnPravachanStop">Stop</button>
          </div>
          <label>Pravachan speed
            <select id="setPravachanRate">
              <option value="0.75" ${(state.settings.pravachanRate || 0.75) === 0.75 ? "selected" : ""}>Deep calm 0.75x</option>
              <option value="0.85" ${(state.settings.pravachanRate || 0.75) === 0.85 ? "selected" : ""}>Calm 0.85x</option>
              <option value="1" ${(state.settings.pravachanRate || 0.75) === 1 ? "selected" : ""}>1x</option>
              <option value="1.25" ${(state.settings.pravachanRate || 0.75) === 1.25 ? "selected" : ""}>1.25x</option>
            </select>
          </label>
          <button type="button" class="btn btn-ghost btn-sm" id="btnPravachanContinue">Continue from last paragraph</button>
          <p class="reader-sheet-section" style="margin-top:0.75rem">Punctuation pauses (all listening modes)</p>
          <label>Pause after comma / clause <span id="setTtsCommaPauseVal">${Math.max(80, state.settings.ttsCommaPause || 180)} ms</span>
            <input type="range" id="setTtsCommaPause" data-tts-pause="comma" min="80" max="900" step="10" value="${Math.max(80, state.settings.ttsCommaPause || 180)}" />
          </label>
          <label>Pause after sentence <span id="setTtsSentencePauseVal">${state.settings.ttsSentencePause ?? 420} ms</span>
            <input type="range" id="setTtsSentencePause" data-tts-pause="sentence" min="180" max="1200" step="25" value="${state.settings.ttsSentencePause ?? 420}" />
          </label>
          <label>Pause between paragraphs <span id="setTtsParagraphPauseVal">${state.settings.ttsParagraphPause ?? 850} ms</span>
            <input type="range" id="setTtsParagraphPause" data-tts-pause="paragraph" min="400" max="2200" step="50" value="${state.settings.ttsParagraphPause ?? 850}" />
          </label>
          <label>Pause around shloka / mantra <span id="setTtsVersePauseVal">${state.settings.ttsVersePause ?? 1300} ms</span>
            <input type="range" id="setTtsVersePause" data-tts-pause="verse" min="700" max="2800" step="50" value="${state.settings.ttsVersePause ?? 1300}" />
          </label>
          <label class="check-row"><input type="checkbox" id="setShlokaChandaRead" ${state.settings.shlokaChandaRead !== false ? "checked" : ""} /> Read shlokas in chanda (meter) rhythm</label>
          <label class="check-row"><input type="checkbox" id="setShlokaBundledAudio" ${state.settings.shlokaBundledAudio !== false ? "checked" : ""} /> Use bundled shloka audio when available</label>
          <label class="check-row"><input type="checkbox" id="setShlokaPreferHuman" ${state.settings.shlokaPreferHumanAudio !== false ? "checked" : ""} /> Prefer my human recordings over machine audio</label>
          <p class="muted">Record pundit-style readings in <a href="#shloka-recorder">Shloka Recording Studio</a>. Your recordings play first; generated audio is used when no recording exists.</p>
        </div>
        <label>Sleep timer (minutes, 0=off)
          <input type="number" id="setSleep" min="0" max="120" value="0" />
        </label>
        <button type="button" class="btn btn-ghost btn-sm" id="btnGlossaryDrawer">Glossary lookup</button>
      </aside>
      <aside id="glossaryDrawer" class="reader-drawer ${state.ui.drawer === "glossary" ? "open" : ""}">
        <h3>Glossary</h3>
        <input type="search" id="glossSearch" placeholder="Sanskrit / Bengali term…" />
        <div id="glossResults" class="gloss-results"></div>
      </aside>`);
    const body = chunks.join("");

    renderShell(body, {
      title: (book.title || ch.title).slice(0, 28),
      className: "main-reader",
      bind: () => {
        // Scroll to exact para/occurrence FIRST — before other binders that may throw.
        const scrollKey = state.params.parts[3] || targetParaId || null;
        const needsOccurrenceFocus = !!(
          state._pendingOccurrenceFocus ||
          state.params.occurrence ||
          window.AmpsShlokaDeepNav?.loadNavSession?.()?.focus ||
          scrollKey
        );
        if (needsOccurrenceFocus) {
          scheduleOccurrenceFocus(24);
        }

        try {
        bindBookLanguageControls();
        bindReaderToolbarButtons();
        window.AmpsReaderUI?.updateBookmarkButton?.(toolbarBookmarked);
        refreshReaderToolbarAudio(toolbarOpts.audioActive, toolbarOpts.audioPaused);
        trackRecent(bookId);
        const explicitParaTarget = snap.parts[3] || targetParaId || null;
        saveReadingProgress(bookId, ch.id, {
          scrollY: explicitParaTarget ? 0 : (savedProg?.chapterId === ch.id ? (savedProg.scrollY || 0) : 0),
          paraId: explicitParaTarget,
          pageIndex: state.ui.pageIndex,
        });
        window.AmpsAdUI?.startReadTimer?.(bookId, ch.id);
        window.AmpsEnhance?.markPlanDone?.();
        saveState();

        let progTimer;
        const persistReadingPosition = () => {
          if (state._explicitReaderTarget || state._pendingOccurrenceFocus) return;
          clearTimeout(progTimer);
          progTimer = setTimeout(() => {
            if (state._explicitReaderTarget || state._pendingOccurrenceFocus) return;
            saveReadingProgress(bookId, ch.id, {
              scrollY: window.scrollY,
              paraId: visibleReaderParaId() || targetParaId,
              pageIndex: state.ui.pageIndex,
            });
            saveState();
          }, 450);
        };

        const onScroll = () => {
          const el = document.getElementById("readerArticle");
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const scrolled = Math.max(0, -rect.top);
          const max = el.offsetHeight - window.innerHeight;
          state.ui.readScrollPct = max > 0 ? Math.min(100, (scrolled / max) * 100) : 0;
          persistReadingPosition();
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();

        syncReaderDrawers();
        if (isShlokaVerses) {
          window.AmpsShlokaAudio?.loadManifest?.(true).catch(() => {});
          const searchEl = document.getElementById("shlokaVerseSearch");
          bindShlokaAlphaNav();
          if (state._shlokaLazyRender?.gen === gen && state._shlokaLazyRender?.chapterId === ch.id) {
            const lr = state._shlokaLazyRender;
            patchShlokaVerseSearchBlobs(ch.paragraphs, lr.patchStart ?? 0, lr.patchEnd ?? lr.startIdx);
            scheduleShlokaVerseLazyAppend({
              bookId: lr.bookId,
              chapterId: lr.chapterId,
              startIdx: lr.startIdx,
              total: lr.total,
              gen: lr.gen,
              snap: lr.snap,
              targetParaId: lr.targetParaId,
              navIndex: lr.navIndex,
              preferHuman: lr.preferHuman,
              allParagraphs: ch.paragraphs,
            });
          }
          // Deep-link to a verse: clear filter so the card remains visible/scrollable.
          if (scrollKey || needsOccurrenceFocus) {
            state.ui.shlokaVerseQuery = "";
            if (searchEl) searchEl.value = "";
          }
          filterShlokaVerses(searchEl?.value || "");
          searchEl?.addEventListener("input", e => {
            const q = e.target.value;
            if (state._shlokaLazyRender && String(q || "").trim()) {
              delete state._shlokaLazyRender;
              state.ui.shlokaVerseQuery = q;
              saveState();
              renderFromState();
              return;
            }
            state.ui.shlokaVerseQuery = q;
            filterShlokaVerses(q);
            saveState();
          });
          window.AmpsShlokaCard?.scheduleHydrate?.(
            document.getElementById("readerArticle"),
            state.settings.shlokaPreferHumanAudio !== false
          );
          _shlokaReaderCorrections = window.AmpsShlokaBookEditor?.bindReaderCorrections?.({
            book,
            getActiveParaId: () => state.ui.activeParaId,
            onParaSelect: paraId => {
              state.ui.activeParaId = paraId;
            },
            navigateToStudio: verseIdx => {
              state.params.shlokaRecIdx = Math.max(0, verseIdx);
              saveState();
              navigate("shloka-recorder");
            },
            patchReaderCard: (para, verseNum) => {
              const el = document.getElementById(para.id);
              if (!el) return;
              el.innerHTML = renderSamskrtaShlokaPublicationUnit(para, {
                esc,
                preferHuman: state.settings.shlokaPreferHumanAudio !== false,
                renderShlokaSources,
                canonicalBook: true,
                beforeSourcesHtml: renderCanonicalShlokaNav(ch.paragraphs, ch.paragraphs.findIndex(x => x.id === para.id)),
              });
              const blob = shlokaVerseSearchBlob(para);
              if (blob) el.setAttribute("data-search", blob);
              window.AmpsShlokaCard?.scheduleHydrate?.(
                el,
                state.settings.shlokaPreferHumanAudio !== false
              );
            },
          });
        }
        if (showShlokaScriptBar) {
          window.AmpsShlokaStudy?.bindStudyBar?.(state.settings, {
            onModeChange: mode => {
              state.settings.shlokaStudyMode = mode;
              saveState();
              window.AmpsShlokaStudy?.applyDomMode?.(mode);
              renderFromState();
            },
            onRepeatChange: count => {
              state.settings.shlokaRepeatCount =
                window.AmpsStudyListen?.clampRepeat?.(count) ||
                window.AmpsShlokaStudy?.getRepeatCount?.({ shlokaRepeatCount: count }) ||
                count;
              saveState();
            },
            onStudyListen: () => startShlokaStudyListen(),
          });
        }
        const readerArticle = document.getElementById("readerArticle");
        const paraTextById = pid => ch.paragraphs.find(p => p.id === pid)?.text || "";
        window.AmpsLineRead?.decorateArticle?.(readerArticle, paraTextById);
        window.AmpsLineRead?.bindReaderLines?.(readerArticle, ({ paraId, charOffset }) => {
          startReaderAudio(state.settings.ttsReadingStyle, false, paraId, charOffset);
        });
        document.getElementById("btnPagePrev")?.addEventListener("click", () => {
          state.ui.pageIndex = Math.max(0, state.ui.pageIndex - 1);
          saveReadingProgress(bookId, ch.id, { pageIndex: state.ui.pageIndex, paraId: ch.paragraphs[state.ui.pageIndex]?.id });
          saveState();
          renderFromState();
        });
        document.getElementById("btnPageNext")?.addEventListener("click", () => {
          state.ui.pageIndex = Math.min(ch.paragraphs.length - 1, state.ui.pageIndex + 1);
          saveReadingProgress(bookId, ch.id, { pageIndex: state.ui.pageIndex, paraId: ch.paragraphs[state.ui.pageIndex]?.id });
          saveState();
          renderFromState();
        });
        bindChapterNavigation(bookId, prev, next);
        document.getElementById("btnGlossaryDrawer")?.addEventListener("click", () => toggleReaderDrawer("glossary"));
        document.getElementById("glossSearch")?.addEventListener("input", e => {
          const hits = F()?.lookupGlossary(e.target.value, book) || [];
          const el = document.getElementById("glossResults");
          el.innerHTML = hits.length ? hits.map(h =>
            `<div class="gloss-hit"><strong>${esc(h.term)}</strong><p>${esc(h.def)}</p></div>`
          ).join("") : `<p class="muted">No terms found</p>`;
        });
        document.getElementById("setSleep")?.addEventListener("change", e => {
          const m = +e.target.value;
          if (m > 0) F()?.TTS?.sleepTimer?.(m, () => alert("Sleep timer — playback stopped"));
        });
        document.querySelectorAll(".drawer-toc-item[data-ch]").forEach(el => {
          el.addEventListener("click", e => {
            e.preventDefault();
            state.ui.drawer = null;
            goToChapter(el.dataset.book || bookId, el.dataset.ch);
          });
        });
        const article = document.getElementById("readerArticle");
        window.AmpsEnhance?.bindPageTaps(article, state, () => {
          if (pageMode && state.ui.pageIndex > 0) { state.ui.pageIndex--; renderFromState(); }
          else if (prev) navigate("read", { bookId, chapterId: prev.id });
        }, () => {
          if (pageMode && state.ui.pageIndex < ch.paragraphs.length - 1) { state.ui.pageIndex++; renderFromState(); }
          else if (next) navigate("read", { bookId, chapterId: next.id });
        });
        bindReaderSettings();
        bindSelectionToolbar(bookId, ch.id);
        window.AmpsProductivity?.bindReader?.(bookId, ch.id, book, ch);
        refreshChapterActionsUi(book, bookId, ch);
        } catch (bindErr) {
          console.error("AMPS reader bind error:", bindErr);
        }

        // Re-assert deep-link focus after binders (search highlight / layout) settle.
        if (needsOccurrenceFocus) {
          scheduleOccurrenceFocus(8);
        } else if (scrollKey) {
          requestAnimationFrame(() => {
            const el = findExactReaderTarget(scrollKey, null);
            if (el) scrollReaderToExactElement(el);
          });
        } else if (savedProg?.chapterId === ch.id && savedProg.scrollY > 0 && !pageMode && !snap.parts[3]) {
          requestAnimationFrame(() => window.scrollTo(0, savedProg.scrollY));
        }
      },
    });
  }

  function bindReaderSettings() {
    document.getElementById("setTypoPreset")?.addEventListener("change", e => {
      window.AmpsEnhance?.applyTypoPreset(e.target.value);
      saveState();
      applyReaderSettingsLive();
    });
    document.getElementById("setTheme")?.addEventListener("change", e => {
      state.settings.theme = e.target.value;
      saveState();
      applyReaderSettingsLive();
    });
    document.getElementById("setFont")?.addEventListener("input", e => {
      state.settings.fontSize = +e.target.value;
      document.getElementById("fontVal").textContent = e.target.value;
      document.documentElement.style.setProperty("--reader-size", e.target.value + "px");
      saveState();
    });
    document.getElementById("setLh")?.addEventListener("input", e => {
      state.settings.lineHeight = +e.target.value;
      document.documentElement.style.setProperty("--reader-lh", e.target.value);
      saveState();
    });
    document.getElementById("setWidth")?.addEventListener("change", e => {
      state.settings.readerWidth = e.target.value;
      saveState();
      applyReaderSettingsLive();
    });
    document.getElementById("setScrollMode")?.addEventListener("change", e => {
      state.settings.scrollMode = e.target.value;
      const prog = state.progress[state.params.parts[1]];
      state.ui.pageIndex = prog?.pageIndex || 0;
      saveState();
      renderFromState();
    });
    document.getElementById("setTextAlign")?.addEventListener("change", e => {
      state.settings.textAlign = e.target.value;
      saveState();
      applyReaderSettingsLive();
    });
    document.getElementById("setTabletSplit")?.addEventListener("change", e => {
      if (!state.productivity) state.productivity = {};
      state.productivity.tabletSplit = !!e.target.checked;
      saveState();
      const open = !!state.productivity.studyPanelOpen;
      document.body.classList.toggle(
        "reader-tablet-split",
        !!e.target.checked && open && window.innerWidth >= 900
      );
    });
    document.getElementById("setMargin")?.addEventListener("input", e => {
      state.settings.marginH = +e.target.value;
      document.documentElement.style.setProperty("--reader-margin", e.target.value + "rem");
      saveState();
    });
    document.getElementById("setBright")?.addEventListener("input", e => {
      state.settings.brightness = +e.target.value;
      document.documentElement.style.setProperty("--reader-brightness", e.target.value + "%");
      saveState();
    });
    document.getElementById("setFocus")?.addEventListener("change", e => {
      state.settings.focusLine = e.target.checked;
      saveState();
      applyReaderSettingsLive();
      let fl = document.querySelector(".focus-line");
      if (e.target.checked && !fl) {
        const el = document.createElement("div");
        el.className = "focus-line";
        el.setAttribute("aria-hidden", "true");
        document.getElementById("readerArticle")?.before(el);
      } else if (!e.target.checked) {
        fl?.remove();
      }
    });
    document.getElementById("setTtsRate")?.addEventListener("input", e => {
      applyTtsPlaybackRate(e.target.value);
    });
    bindTtsVoiceSelect("setTtsVoice", "btnTtsPreview");
    bindTtsPronunciationSelect("setTtsPronunciation", "setTtsVoiceHint", "setTtsVoice");
    bindSanskritSpeechRateSelect("setSanskritSpeechRate");
    document.getElementById("setTtsProvider")?.addEventListener("change", e => {
      state.settings.ttsProvider = normalizeTtsProvider(e.target.value);
      if (state.settings.ttsProvider === "my-voice") {
        ensureMyVoicePronunciationMode();
        if (!activeApiTtsConfig()) {
          alert(myVoiceSetupMissingMessage());
        }
      }
      saveState();
      renderFromState();
    });
    document.getElementById("btnAddPron")?.addEventListener("click", () => {
      const roman = document.getElementById("pronRoman")?.value?.trim();
      const devanagari = document.getElementById("pronDev")?.value?.trim();
      const res = window.AmpsPronunciation?.upsert?.(roman, devanagari);
      if (!res?.ok) return alert(res?.error || "Could not save correction.");
      alert("Pronunciation correction saved.");
      renderFromState();
    });
    document.getElementById("setTtsApiUrl")?.addEventListener("change", e => {
      state.settings.ttsApiUrl = normalizeTtsApiUrl(e.target.value);
      e.target.value = state.settings.ttsApiUrl;
      saveState();
    });
    document.getElementById("setTtsApiKey")?.addEventListener("change", e => {
      state.settings.ttsApiKey = e.target.value;
      saveState();
    });
    document.getElementById("setOwnVoiceTtsUrl")?.addEventListener("change", e => {
      state.settings.ownVoiceTtsUrl = normalizeTtsApiUrl(e.target.value);
      e.target.value = state.settings.ownVoiceTtsUrl;
      saveState();
    });
    document.getElementById("setOwnVoiceTtsKey")?.addEventListener("change", e => {
      state.settings.ownVoiceTtsKey = e.target.value;
      saveState();
    });
    document.getElementById("setOwnVoiceId")?.addEventListener("change", e => {
      state.settings.ownVoiceId = e.target.value.trim() || "my-voice";
      saveState();
    });
    document.getElementById("btnOwnVoicePreview")?.addEventListener("click", async () => {
      const apiUrl = normalizeTtsApiUrl(document.getElementById("setOwnVoiceTtsUrl")?.value || state.settings.ownVoiceTtsUrl || "");
      const apiKey = document.getElementById("setOwnVoiceTtsKey")?.value || state.settings.ownVoiceTtsKey || "";
      const voice = String(document.getElementById("setOwnVoiceId")?.value || state.settings.ownVoiceId || "my-voice").trim();
      state.settings.ownVoiceTtsUrl = apiUrl;
      state.settings.ownVoiceTtsKey = apiKey;
      state.settings.ownVoiceId = voice || "my-voice";
      state.settings.ttsProvider = "my-voice";
      ensureMyVoicePronunciationMode();
      saveState();
      if (!window.AmpsApiTts?.isConfigured?.(apiUrl)) {
        alert(myVoiceSetupMissingMessage());
        navigate("voice-lab");
        return;
      }
      const spoken = await myVoicePreviewSampleText();
      const ok = await window.AmpsApiTts.speak(
        spoken,
        { apiUrl, apiKey, voice: state.settings.ownVoiceId, provider: "my-voice", rate: state.settings.ttsRate || 1, style: "normal" },
        { isCancelled: () => false }
      );
      if (!ok) alert("My Voice preview failed. Check the URL, API key, and trained voice server.");
    });
    const syncPravachanToggles = () => {
      const style = normalizeTtsReadingStyle(state.settings.ttsReadingStyle);
      const cb = document.getElementById("setPravachanStyle");
      const sel = document.getElementById("setTtsReadingStyle");
      if (cb) cb.checked = style === "pravachan";
      if (sel) sel.value = style;
    };
    const setReadingStyle = value => {
      state.settings.ttsReadingStyle = normalizeTtsReadingStyle(value);
      if (state.settings.ttsReadingStyle === "pravachan") {
        enableSanskritPronunciationIfOff();
        const sel = document.getElementById("setTtsPronunciation");
        if (sel) sel.value = sanskritPronunciationMode();
      }
      syncPravachanToggles();
      saveState();
    };
    document.getElementById("setTtsReadingStyle")?.addEventListener("change", e => {
      setReadingStyle(e.target.value);
      if (normalizeTtsReadingStyle(e.target.value) === "pravachan") startReaderAudio("pravachan", false);
    });
    document.getElementById("setPravachanStyle")?.addEventListener("change", e => {
      setReadingStyle(e.target.checked ? "pravachan" : "normal");
      if (e.target.checked) startReaderAudio("pravachan", false);
    });
    document.getElementById("setPravachanSpeaker")?.addEventListener("change", e => {
      applyTtsVoiceSelection(e.target.value);
      saveState();
    });
    document.getElementById("setPravachanRate")?.addEventListener("change", e => {
      state.settings.pravachanRate = +e.target.value;
      saveState();
    });
    document.getElementById("setTtsCommaPause")?.addEventListener("input", e => {
      applyTtsPauseSetting("comma", e.target.value);
      const el = document.getElementById("setTtsCommaPauseVal");
      if (el) el.textContent = `${Math.round(state.settings.ttsCommaPause)} ms`;
    });
    document.getElementById("setTtsSentencePause")?.addEventListener("input", e => {
      applyTtsPauseSetting("sentence", e.target.value);
      const el = document.getElementById("setTtsSentencePauseVal");
      if (el) el.textContent = `${Math.round(state.settings.ttsSentencePause)} ms`;
    });
    document.getElementById("setTtsParagraphPause")?.addEventListener("input", e => {
      applyTtsPauseSetting("paragraph", e.target.value);
      const el = document.getElementById("setTtsParagraphPauseVal");
      if (el) el.textContent = `${Math.round(state.settings.ttsParagraphPause)} ms`;
    });
    document.getElementById("setTtsVersePause")?.addEventListener("input", e => {
      applyTtsPauseSetting("verse", e.target.value);
      const el = document.getElementById("setTtsVersePauseVal");
      if (el) el.textContent = `${Math.round(state.settings.ttsVersePause)} ms`;
    });
    document.getElementById("setShlokaChandaRead")?.addEventListener("change", e => {
      state.settings.shlokaChandaRead = !!e.target.checked;
      saveState();
    });
    document.getElementById("setShlokaBundledAudio")?.addEventListener("change", e => {
      state.settings.shlokaBundledAudio = !!e.target.checked;
      saveState();
    });
    document.getElementById("setShlokaPreferHuman")?.addEventListener("change", e => {
      state.settings.shlokaPreferHumanAudio = !!e.target.checked;
      saveState();
    });
    document.getElementById("btnPravachanPlay")?.addEventListener("click", () => startReaderAudio("pravachan", false));
    document.getElementById("btnPravachanContinue")?.addEventListener("click", () => startReaderAudio("pravachan", true));
    document.getElementById("btnPravachanPause")?.addEventListener("click", () => handleReaderToolbar("tts-pause"));
    document.getElementById("btnPravachanResume")?.addEventListener("click", () => handleReaderToolbar("tts-resume"));
    document.getElementById("btnPravachanStop")?.addEventListener("click", () => handleReaderToolbar("tts-stop"));
    document.getElementById("setCommentary")?.addEventListener("change", e => {
      state.settings.showCommentary = e.target.checked;
      saveState();
      renderFromState();
    });
    document.getElementById("setLang")?.addEventListener("change", e => {
      state.settings.lang = e.target.value;
      window.AmpsI18n?.setLang(e.target.value);
      saveState();
      renderFromState();
    });
    document.getElementById("setBookLanguage")?.addEventListener("change", e => {
      const previousLanguage = state.settings.bookLanguage || "en";
      state.settings.bookLanguage = e.target.value;
      if (e.target.value !== "en" && (previousLanguage === "en" || !state.settings.bookLanguageDisplayMode)) {
        state.settings.bookLanguageDisplayMode = "translation_only";
      }
      if (e.target.value === "en" && state.settings.bookLanguageDisplayMode === "translation_only") {
        state.settings.bookLanguageDisplayMode = "english_only";
      }
      saveState();
      renderFromState();
    });
    document.getElementById("setBookLanguageDisplay")?.addEventListener("change", e => {
      state.settings.bookLanguageDisplayMode = e.target.value;
      saveState();
      renderFromState();
    });
  }

  function activeReaderParaId(fallbackId) {
    return state.ui.activeParaId || visibleReaderParaId() || fallbackId || null;
  }

  function updateChapterActionsHint(ch, pid) {
    const hint = document.getElementById("chapterActionsHint");
    if (!hint || !ch) return;
    const paraId = pid || activeReaderParaId(ch.paragraphs[0]?.id);
    const para = ch.paragraphs.find(p => p.id === paraId);
    if (!para) {
      hint.textContent = "Tap a paragraph while reading, then use:";
      return;
    }
    const plain = String(para.text || "").replace(/\s+/g, " ").trim();
    const snippet = plain.slice(0, 72);
    hint.textContent = snippet
      ? `Selected: “${snippet}${plain.length > 72 ? "…" : ""}”`
      : "Tap a paragraph while reading, then use:";
  }

  function refreshChapterActionsUi(book, bookId, ch) {
    if (!ch) return;
    const pid = activeReaderParaId(ch.paragraphs[0]?.id);
    document.querySelectorAll(".reader-para.reader-para-active").forEach(el => el.classList.remove("reader-para-active"));
    if (pid) document.getElementById(pid)?.classList.add("reader-para-active");
    updateChapterActionsHint(ch, pid);
    document.getElementById("chapterActionsWrap")?.classList.toggle("has-selection", !!pid);
    if (bookId && ch.id && pid) {
      window.AmpsReaderUI?.updateBookmarkButton?.(isBookmarked(bookId, ch.id, pid));
    }
  }

  async function handleChapterAction(act) {
    const bookId = state.params.parts[1];
    const chapterId = state.params.parts[2];
    if (!bookId || !chapterId || state.route !== "read") return;
    try {
      const book = await loadBook(bookId);
      const ch = book.chapters.find(c => c.id === chapterId) || book.chapters[0];
      if (!ch) return;
      const pid = activeReaderParaId(ch.paragraphs[0]?.id);
      const para = ch.paragraphs.find(p => p.id === pid);
      if (!para) {
        showReaderToast("Tap a paragraph to select it first.");
        return;
      }
      if (act === "read") {
        state.audioProgress[audioProgressKey(bookId, ch.id)] = {
          idx: ch.paragraphs.findIndex(p => p.id === pid),
          paraId: pid,
          charOffset: 0,
          updated: Date.now(),
          style: normalizeTtsReadingStyle(state.settings.ttsReadingStyle),
        };
        saveReadingProgress(bookId, ch.id, { paraId: pid, pageIndex: ch.paragraphs.findIndex(p => p.id === pid) });
        saveState();
        await startReaderAudio(state.settings.ttsReadingStyle, false, pid, 0);
        showReaderToast("Reading selected passage…");
      } else if (act === "copy") {
        const text = `${para.text}\n\n${book.title} - ${ch.title}\nShrii Shrii Anandamurti ji`;
        try {
          await navigator.clipboard.writeText(text);
          showReaderToast("Paragraph copied.");
        } catch (_) {
          alert(text);
        }
      } else if (act === "quote") {
        state.highlights.push({
          id: uid(), bookId, chapterId: ch.id, paraId: para.id,
          start: 0, end: String(para.text).length, color: "yellow",
          text: para.text, created: Date.now(), chapterTitle: ch.title,
        });
        saveState();
        showReaderToast("Saved to Quote maker.");
        navigate("quote-maker");
      } else if (act === "note") {
        showNoteModal({ bookId, chapterId: ch.id, paraId: para.id, quote: para.text });
      } else if (act === "source") {
        showReaderToast(`${book.title} · ${ch.title}`);
        alert(`${book.title}\n${ch.title}\nParagraph: ${para.id}\nAuthor: Shrii Shrii Anandamurti ji`);
      } else if (act === "correct" && window.AmpsShlokaBookEditor?.isEnabled?.()) {
        _shlokaReaderCorrections?.openForParaId?.(pid);
      }
    } catch (err) {
      console.error("Chapter action failed", act, err);
      showReaderToast("That action could not run. Try again.");
    }
  }

  let chapterActionsUiReady = false;
  let _shlokaReaderCorrections = null;
  function initChapterActionsUi() {
    if (chapterActionsUiReady) return;
    chapterActionsUiReady = true;
    const app = document.getElementById("app");
    if (!app) return;

    app.addEventListener("click", e => {
      const btn = e.target.closest?.("[data-ch-act]");
      if (btn && state.route === "read") {
        e.preventDefault();
        e.stopPropagation();
        handleChapterAction(btn.dataset.chAct);
        return;
      }
      const para = e.target.closest?.("#readerArticle .reader-para[data-para]");
      if (!para || state.route !== "read") return;
      if (e.target.closest?.(
        "a, button, summary, details, .shloka-ref-link, .shloka-source-link, .reader-line, mark, " +
        ".shloka-sources, .shloka-sources-collapsible, .shloka-collapsible-panel, .canonical-shloka-nav, " +
        ".shloka-supplementary-meanings"
      )) return;
      state.ui.activeParaId = para.dataset.para;
      const bookId = state.params.parts[1];
      const chapterId = state.params.parts[2];
      if (bookId === "samskrta-shloka" && chapterId === "ch-verses" && para.dataset.para) {
        pinSamskrtaShlokaInHistory(para.dataset.para);
      }
      loadBook(bookId).then(book => {
        const ch = book.chapters.find(c => c.id === chapterId);
        refreshChapterActionsUi(book, bookId, ch);
      });
    }, true);

    let scrollTimer;
    window.addEventListener("scroll", () => {
      if (state.route !== "read" || state.ui.activeParaId) return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(async () => {
        if (state.route !== "read" || state.ui.activeParaId) return;
        const bookId = state.params.parts[1];
        const chapterId = state.params.parts[2];
        if (!bookId || !chapterId) return;
        const book = await loadBook(bookId);
        const ch = book.chapters.find(c => c.id === chapterId);
        refreshChapterActionsUi(book, bookId, ch);
      }, 100);
    }, { passive: true });
  }

  function bindSelectionToolbar(bookId, chapterId) {
    const article = document.getElementById("readerArticle");
    const toolbar = document.getElementById("selToolbar");
    if (!article || !toolbar) return;

    function hideToolbar() {
      toolbar.classList.add("hidden");
      state.ui.selection = null;
    }

    function getSelInPara(paraEl) {
      const sel = window.getSelection();
      if (!sel?.rangeCount || sel.isCollapsed) return null;
      const range = sel.getRangeAt(0);
      if (!paraEl.contains(range.commonAncestorContainer)) return null;
      const pre = range.cloneRange();
      pre.selectNodeContents(paraEl.querySelector(".para-text") || paraEl);
      pre.setEnd(range.startContainer, range.startOffset);
      const start = pre.toString().length;
      const text = range.toString().trim();
      if (!text) return null;
      return { start, end: start + text.length, text };
    }

    article.addEventListener("mouseup", () => {
      setTimeout(() => {
        const paraEl = window.getSelection()?.anchorNode?.parentElement?.closest?.("[data-para]");
        if (!paraEl) return hideToolbar();
        const info = getSelInPara(paraEl);
        if (!info) return hideToolbar();
        state.ui.selection = { bookId, chapterId, paraId: paraEl.dataset.para, ...info };
        const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
        toolbar.innerHTML = HL_COLORS.map(c =>
          `<button type="button" class="hl-btn" data-color="${c.id}" style="background:${c.bg}" title="${c.label}"></button>`
        ).join("") + `<button type="button" class="hl-btn note" id="btnReadSel" title="Read from here">▶</button>
          <button type="button" class="hl-btn note" id="btnReportPron" title="Report pronunciation">🗣</button>
          ${presentationBuilderEnabled() ? `<button type="button" class="hl-btn note" id="btnAddPresentation" title="Add to presentation">📽</button>` : ""}
          ${window.AmpsProductivity?.selectionToolbarExtra?.() || ""}
          <button type="button" class="hl-btn note" id="btnAddNote" title="Note">📝</button>
          <button type="button" class="hl-btn note" id="btnCrossRef" title="Find related">🔗</button>
          <button type="button" class="hl-btn note" id="btnGlossSel" title="Glossary">अ</button>
          <button type="button" class="hl-btn note" id="btnAddCol" title="Collection">📁</button>
          <button type="button" class="hl-btn note" id="btnShareSel" title="Share">⎘</button>`;
        toolbar.style.left = Math.min(window.innerWidth - 200, Math.max(8, rect.left)) + "px";
        toolbar.style.top = Math.max(8, rect.top - 48) + "px";
        toolbar.classList.remove("hidden");
        toolbar.querySelectorAll("[data-color]").forEach(btn => {
          btn.addEventListener("click", () => {
            state.highlights.push({
              id: uid(),
              bookId,
              chapterId,
              paraId: state.ui.selection.paraId,
              start: state.ui.selection.start,
              end: state.ui.selection.end,
              color: btn.dataset.color,
              text: state.ui.selection.text,
              created: Date.now(),
            });
            window.AmpsProductivity?.trackHighlight?.();
            saveState();
            window.getSelection()?.removeAllRanges();
            hideToolbar();
            renderFromState();
          });
        });
        document.getElementById("btnReadSel")?.addEventListener("click", async () => {
          const sel = state.ui.selection;
          if (!sel?.paraId) return;
          const book = await loadBook(bookId);
          const chObj = book.chapters.find(c => c.id === chapterId) || book.chapters[0];
          state.audioProgress[audioProgressKey(bookId, chapterId)] = {
            idx: Math.max(0, chObj?.paragraphs?.findIndex(p => p.id === sel.paraId) ?? 0),
            paraId: sel.paraId,
            charOffset: Math.max(0, sel.start || 0),
            updated: Date.now(),
            style: normalizeTtsReadingStyle(state.settings.ttsReadingStyle),
          };
          saveState();
          window.getSelection()?.removeAllRanges();
          hideToolbar();
          await startReaderAudio(state.settings.ttsReadingStyle, false, sel.paraId, sel.start || 0);
        });
        document.getElementById("btnReportPron")?.addEventListener("click", () => {
          const sel = state.ui.selection;
          if (!sel?.text) return;
          window.AmpsPronunciation?.showReportModal?.({
            roman: window.AmpsPronunciation.guessRomanFromSelection(sel.text),
            source: sel.text,
            onSaved: () => alert("Pronunciation correction saved."),
          });
          hideToolbar();
        });
        document.getElementById("btnAddPresentation")?.addEventListener("click", async () => {
          const sel = state.ui.selection;
          if (!sel?.text) return;
          const book = await loadBook(bookId);
          const chObj = book.chapters.find(c => c.id === chapterId) || book.chapters[0];
          const pb = window.AmpsPresentationStore;
          if (!pb) return alert("Presentation Builder is not available.");
          pb.ensure(state);
          let col = state.presentationBuilder.collections[0];
          if (!col) col = pb.createCollection(state, "Reader selections", []);
          col.items.push(pb.normalizeItem({
            bookId,
            bookTitle: book.title,
            author: book.author || book.subtitle || "",
            chapterId,
            chapterTitle: chObj?.title || chapterId,
            paraId: sel.paraId,
            text: sel.text,
          }, col.items.length));
          col.updatedAt = Date.now();
          saveState();
          hideToolbar();
          if (confirm("Added to Presentation Builder. Open builder now?")) {
            navigate("presentation-builder");
          }
        });
        document.getElementById("btnAddNote")?.addEventListener("click", () => {
          showNoteModal({
            bookId,
            chapterId,
            paraId: state.ui.selection.paraId,
            quote: state.ui.selection.text,
          });
          hideToolbar();
        });
        document.getElementById("btnCrossRef")?.addEventListener("click", () => {
          navigate("search", { query: state.ui.selection.text.slice(0, 40) });
          hideToolbar();
        });
        document.getElementById("btnGlossSel")?.addEventListener("click", async () => {
          await window.AmpsAdUI?.loadGlossaryIndex?.();
          const book = await loadBook(bookId);
          const local = F()?.lookupGlossary(state.ui.selection.text, book) || [];
          const global = window.AmpsAdUI?.globalGlossaryLookup(state.ui.selection.text) || [];
          const seen = new Set();
          const hits = [];
          for (const h of [...local, ...global]) {
            const k = String(h.term || "").toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            hits.push(h);
          }
          showGlossaryModal(hits.slice(0, 15), state.ui.selection.text, book);
          hideToolbar();
        });
        document.getElementById("btnAddCol")?.addEventListener("click", async () => {
          const book = await loadBook(bookId);
          const chObj = book.chapters.find(c => c.id === chapterId);
          if (!state.collections.length) state.collections.push(window.AmpsSync.createCollection("My class"));
          state.collections[0].items.push({
            bookId, chapterId, paraId: state.ui.selection.paraId,
            bookTitle: book.title, chapterTitle: chObj?.title || chapterId,
            quote: state.ui.selection.text,
          });
          saveState();
          hideToolbar();
        });
        document.getElementById("btnShareSel")?.addEventListener("click", async () => {
          const book = await loadBook(bookId);
          const chObj = book.chapters.find(c => c.id === chapterId);
          window.AmpsEnhance?.sharePassage(book, chObj || { title: chapterId }, state.ui.selection.text);
          hideToolbar();
        });
        window.AmpsProductivity?.bindSelectionStudyDeck?.(bookId, chapterId, hideToolbar);
      }, 10);
    });
  }

  function showGlossaryModal(hits, term, book) {
    const root = document.getElementById("modalRoot");
    const bookId = book?.id || state.params.parts[1] || "";
    const hitHtml = hits.length
      ? hits.map(h => {
          const locs = h.locations || [];
          const locHtml = locs.length
            ? `<div class="gloss-locs"><p class="muted">In this book (${locs.length})</p>${locs.slice(0, 12).map(loc =>
                `<button type="button" class="toc-item gloss-loc" data-book="${esc(bookId)}" data-ch="${esc(loc.chapterId)}" data-para="${esc(loc.paraId)}">
                  <span class="toc-label">${esc(loc.chapterTitle || loc.chapterId)}</span>
                </button>`
              ).join("")}${locs.length > 12 ? `<p class="muted">+ ${locs.length - 12} more</p>` : ""}</div>`
            : "";
          const glossJump = h.glossaryChapterId && h.glossaryParaId
            ? `<button type="button" class="btn btn-ghost gloss-open-entry" data-book="${esc(bookId)}" data-ch="${esc(h.glossaryChapterId)}" data-para="${esc(h.glossaryParaId)}">Open glossary entry</button>`
            : "";
          return `<div class="gloss-hit"><strong>${esc(h.term)}</strong><p>${esc(h.def)}</p>${glossJump}${locHtml}</div>`;
        }).join("")
      : `<p class="muted">No glossary entry. Save to vocabulary?</p><button type="button" class="btn btn-gold" id="btnSaveVocab">Save term</button>`;
    root.innerHTML = `<div class="modal-backdrop" id="modalBd"><div class="modal modal-lg">
      <h3>Glossary — ${esc(term)}</h3>
      ${hitHtml}
      <button type="button" class="btn btn-ghost" id="modalClose">Close</button>
    </div></div>`;
    document.getElementById("modalClose")?.addEventListener("click", () => { root.innerHTML = ""; });
    document.getElementById("btnSaveVocab")?.addEventListener("click", () => {
      state.vocabulary.push({ term, added: Date.now() });
      saveState();
      root.innerHTML = "";
    });
    root.querySelectorAll(".gloss-loc, .gloss-open-entry").forEach(btn => {
      btn.addEventListener("click", () => {
        root.innerHTML = "";
        goToChapter(btn.dataset.book, btn.dataset.ch, btn.dataset.para);
      });
    });
  }

  function showNoteModal(opts) {
    const root = document.getElementById("modalRoot");
    root.innerHTML = `<div class="modal-backdrop" id="modalBd">
      <div class="modal">
        <h3>Add note</h3>
        ${opts.quote ? `<blockquote>${esc(opts.quote)}</blockquote>` : ""}
        <label>Tags
          <select id="noteTags" multiple size="3">${(F()?.NOTE_TAGS || []).map(t =>
            `<option value="${t}">${t}</option>`).join("")}</select>
        </label>
        <textarea id="noteBody" rows="4" placeholder="Your note…"></textarea>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="modalCancel">Cancel</button>
          <button type="button" class="btn btn-gold" id="modalSave">Save</button>
        </div>
      </div>
    </div>`;
    document.getElementById("modalCancel")?.addEventListener("click", () => { root.innerHTML = ""; });
    document.getElementById("modalBd")?.addEventListener("click", e => { if (e.target.id === "modalBd") root.innerHTML = ""; });
    document.getElementById("modalSave")?.addEventListener("click", () => {
      const body = document.getElementById("noteBody")?.value?.trim();
      if (!body) return;
      const tagEl = document.getElementById("noteTags");
      const tags = tagEl ? [...tagEl.selectedOptions].map(o => o.value) : [];
      state.notes.push({
        id: uid(),
        bookId: opts.bookId,
        chapterId: opts.chapterId,
        paraId: opts.paraId || null,
        quote: opts.quote || "",
        body,
        tags,
        created: Date.now(),
      });
      saveState();
      root.innerHTML = "";
      renderFromState();
    });
  }

  function summaryListHtml(bullets) {
    return `<ul class="summary-list">${bullets.map(b => `<li>${esc(b)}</li>`).join("")}</ul>`;
  }

  async function showChapterSummary(book, chapterId) {
    const sum = AmpsStudy.summarizeChapter(book, chapterId);
    if (!sum) return;
    const root = document.getElementById("modalRoot");
    const lang = state.settings.lang || "en";
    let bullets = sum.bullets;

    root.innerHTML = `<div class="modal-backdrop" id="modalBd">
      <div class="modal modal-lg">
        <h3>${T("summaryChapter")} — ${esc(sum.title)}</h3>
        <p class="muted">${sum.paragraphCount} ${T("paragraphCount")}</p>
        <div id="summaryBody">${summaryListHtml(bullets)}</div>
        <p class="muted hidden" id="summaryTranslating">${T("translating")}</p>
        <button type="button" class="btn btn-gold" id="modalClose">${T("close")}</button>
      </div>
    </div>`;
    document.getElementById("modalClose")?.addEventListener("click", () => { root.innerHTML = ""; });
    document.getElementById("modalBd")?.addEventListener("click", e => { if (e.target.id === "modalBd") root.innerHTML = ""; });

    if (lang === "hi" && bullets.length && window.AmpsTranslate) {
      const tr = document.getElementById("summaryTranslating");
      tr?.classList.remove("hidden");
      try {
        bullets = await window.AmpsTranslate.localizeSummaries(bullets, "hi");
        const body = document.getElementById("summaryBody");
        if (body) body.innerHTML = summaryListHtml(bullets);
      } catch (_) { /* keep English */ }
      tr?.classList.add("hidden");
    }
  }

  async function showBookSummary(book) {
    const chapters = AmpsStudy.summarizeBook(book);
    const root = document.getElementById("modalRoot");
    const lang = state.settings.lang || "en";
    let rows = chapters.map(c => ({
      ...c,
      preview: c.preview,
    }));

    root.innerHTML = `<div class="modal-backdrop" id="modalBd">
      <div class="modal modal-lg">
        <h3>${T("bookSummary")} — ${esc(book.title)}</h3>
        <p class="muted hidden" id="summaryTranslating">${T("translating")}</p>
        <div class="summary-toc" id="summaryToc">${rows.map(c =>
          `<button type="button" class="summary-row" data-ch="${esc(c.id)}">
            <strong>${esc(c.chapterNum ? c.chapterNum + " — " + c.title : c.title)}</strong>
            <span>${esc(c.preview)}…</span>
          </button>`).join("")}
        </div>
        <button type="button" class="btn btn-gold" id="modalClose">${T("close")}</button>
      </div>
    </div>`;
    document.getElementById("modalClose")?.addEventListener("click", () => { root.innerHTML = ""; });
    document.querySelectorAll(".summary-row").forEach(el => {
      el.addEventListener("click", () => {
        root.innerHTML = "";
        showChapterSummary(book, el.dataset.ch);
      });
    });

    if (lang === "hi" && rows.length && window.AmpsTranslate) {
      const tr = document.getElementById("summaryTranslating");
      tr?.classList.remove("hidden");
      try {
        const previews = await window.AmpsTranslate.localizeSummaries(rows.map(r => r.preview), "hi");
        previews.forEach((p, i) => { rows[i].preview = p; });
        const toc = document.getElementById("summaryToc");
        if (toc) {
          toc.innerHTML = rows.map(c =>
            `<button type="button" class="summary-row" data-ch="${esc(c.id)}">
              <strong>${esc(c.chapterNum ? c.chapterNum + " — " + c.title : c.title)}</strong>
              <span>${esc(c.preview)}…</span>
            </button>`).join("");
          toc.querySelectorAll(".summary-row").forEach(el => {
            el.addEventListener("click", () => {
              root.innerHTML = "";
              showChapterSummary(book, el.dataset.ch);
            });
          });
        }
      } catch (_) { /* keep English previews */ }
      tr?.classList.add("hidden");
    }
  }

  function discourseSortKey(d) {
    return String(d.title || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function discourseAlphaPresentSet(list) {
    const set = new Set();
    (list || []).forEach(d => {
      const L = titleAlphaLetter(d.title);
      if (L) set.add(L);
    });
    return set;
  }

  function renderDiscourses() {
    const q = (state.params.q || "").toLowerCase();
    let list = [...(state.catalog.discourses || [])];
    if (q) {
      list = list.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.bookTitle.toLowerCase().includes(q) ||
        (d.series || "").toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const byTitle = discourseSortKey(a).localeCompare(discourseSortKey(b));
      if (byTitle) return byTitle;
      return (a.bookTitle || "").localeCompare(b.bookTitle || "");
    });

    const bookCount = new Set(list.map(d => d.bookId)).size;
    const present = discourseAlphaPresentSet(list);

    let body = `
      <section class="hero hero-compact"><h1>Discourse Index</h1>
        <p class="hero-sub">${list.length} discourses across ${bookCount} books · A–Z</p>
      </section>
      <div class="list-alpha-wrap" id="discAlphaWrap">
        <div class="search-bar"><input type="search" id="discSearch" placeholder="Filter discourses…" value="${esc(state.params.q || "")}" /></div>
        ${renderAlphaNav(present, {
          id: "discAlphaNav",
          mode: "discourses",
          ariaLabel: "Jump to discourses by first letter",
          itemLabel: "discourses",
        })}
        <p class="muted list-alpha-hint">Tap a letter to jump</p>
      </div>
      <section class="section"><div class="disc-list" id="discList">`;

    let lastLetter = "";
    list.forEach(d => {
      const L = titleAlphaLetter(d.title);
      if (L && L !== lastLetter) {
        body += `<div class="disc-alpha-head" id="disc-alpha-${L}" data-alpha-head="${L}" aria-hidden="true">${L}</div>`;
        lastLetter = L;
      }
      body += `<button type="button" class="disc-item" data-book="${esc(d.bookId)}" data-ch="${esc(d.chapterId)}"${L ? ` data-alpha="${L}"` : ""}>
        <span class="disc-label">${esc(d.title)}</span>
        <small>${esc(d.bookTitle)} · ${d.paraCount} ¶</small>
      </button>`;
    });
    body += `</div></section>`;

    renderShell(body, {
      title: "Discourses",
      tab: "discourses",
      bind: () => {
        document.getElementById("discSearch")?.addEventListener("input", e => {
          state.params.q = e.target.value;
          renderDiscourses();
        });
        document.querySelectorAll(".disc-item").forEach(el => {
          el.addEventListener("click", () => navigate("read", { bookId: el.dataset.book, chapterId: el.dataset.ch }));
        });
      },
    });
  }

  async function renderSearch() {
    const q = (state.params.q || state.params.parts?.[1] || "").trim();
    let body = `
      <section class="hero hero-compact"><h1>Search</h1></section>
      <div class="search-bar"><input type="search" id="mainSearch" placeholder="Search titles, discourses, full text…" value="${esc(q)}" autofocus />
        <button type="button" class="btn btn-gold" id="btnDoSearch">Search</button>
      </div>
      <div id="searchResults"></div>`;

    renderShell(body, {
      title: "Search",
      tab: "library",
      bind: () => {
        const run = () => {
          state.params.q = document.getElementById("mainSearch")?.value || "";
          doSearch(state.params.q);
        };
        document.getElementById("btnDoSearch")?.addEventListener("click", run);
        document.getElementById("mainSearch")?.addEventListener("keydown", e => { if (e.key === "Enter") run(); });
        if (q) doSearch(q);
      },
    });
  }

  async function doSearch(q) {
    const el = document.getElementById("searchResults");
    if (!el || !q || q.length < 2) {
      if (el) el.innerHTML = `<p class="muted pad">Type at least 2 characters</p>`;
      return;
    }
    el.innerHTML = `<p class="muted pad">Searching…</p>`;
    await ensureSearchCatalog();
    const titleHits = (state.catalog.discourses || []).filter(d =>
      textMatchesQuery(d.title, q) || textMatchesQuery(d.bookTitle, q) || textMatchesQuery(d.series, q)
    ).slice(0, 40);

    const bookHits = (state.catalog.books || []).filter(b => textMatchesQuery(bookSearchBlob(b), q));

    let textHits = [];
    let semanticHits = [];
    if (window.AmpsAdUI?.fastSearch) {
      textHits = await window.AmpsAdUI.fastSearch(state.catalog, q, 60);
      const bookMeta = id => state.catalog.books.find(b => b.id === id);
      textHits = textHits.map(h => ({
        ...h,
        chapterTitle: h.chapterTitle || h.chapterId,
        bookTitle: h.bookTitle || bookMeta(h.bookId)?.title,
        series: bookMeta(h.bookId)?.series,
      }));
      if (window.AmpsEnhance?.rankSearchHits) {
        textHits = window.AmpsEnhance.rankSearchHits(textHits, q, state.catalog);
      }
      if (window.AmpsProductivity?.rankSearchHits) {
        textHits = window.AmpsProductivity.rankSearchHits(textHits, q);
      }
    }
    if (window.AmpsProductivity?.semanticLibrarySearch) {
      semanticHits = await window.AmpsProductivity.semanticLibrarySearch(state.catalog, q, 25);
    }

    let html = "";
    if (bookHits.length) {
      html += `<section class="section"><h2 class="section-head">Books (${bookHits.length})</h2>`;
      bookHits.slice(0, 15).forEach(b => {
        html += `<button type="button" class="search-hit" data-book="${esc(b.id)}"><strong>${esc(b.title)}</strong><span>${esc(b.series || "")}</span></button>`;
      });
      html += `</section>`;
    }
    if (titleHits.length) {
      html += `<section class="section"><h2 class="section-head">Discourses (${titleHits.length})</h2>`;
      titleHits.forEach(d => {
        html += `<button type="button" class="search-hit" data-book="${esc(d.bookId)}" data-ch="${esc(d.chapterId)}"><strong>${esc(d.title)}</strong><span>${esc(d.bookTitle)}</span></button>`;
      });
      html += `</section>`;
    }
    if (semanticHits.length) {
      html += `<section class="section"><h2 class="section-head">Semantic matches (${semanticHits.length})</h2>`;
      semanticHits.slice(0, 20).forEach(h => {
        html += `<button type="button" class="search-hit text-hit" data-book="${esc(h.bookId)}" data-ch="${esc(h.chapterId)}" data-para="${esc(h.paraId || "")}">
          <strong>${esc(h.chapterTitle || h.chapterId)}</strong><span>${esc(h.bookTitle)}</span>
          <em>…${esc(snippetHighlight(h.snippet || h.text || "", q))}…</em>
        </button>`;
      });
      html += `</section>`;
    }
    if (textHits.length) {
      html += `<section class="section"><h2 class="section-head">In text (${textHits.length})</h2>`;
      textHits.slice(0, 30).forEach(h => {
        html += `<button type="button" class="search-hit text-hit" data-book="${esc(h.bookId)}" data-ch="${esc(h.chapterId)}" data-para="${esc(h.paraId)}">
          <strong>${esc(h.chapterTitle)}</strong><span>${esc(h.bookTitle)}${h.series ? " · " + esc(h.series) : ""}</span>
          <em>…${esc(snippetHighlight(h.snippet, q))}…</em>
        </button>`;
      });
      html += `</section>`;
    }
    if (!html) html = `<p class="muted pad">No results for "${esc(q)}"</p>`;
    el.innerHTML = html;
    el.querySelectorAll(".search-hit").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!guardOpenBook(btn.dataset.book)) return;
        if (btn.dataset.ch) {
          navigate("read", {
            bookId: btn.dataset.book,
            chapterId: btn.dataset.ch,
            paraId: btn.dataset.para || undefined,
          });
        } else navigate("book", { bookId: btn.dataset.book });
      });
    });
  }

  function snippetHighlight(snippet, q) {
    const re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    return esc(snippet).replace(re, "<mark>$1</mark>");
  }

  function renderHighlights() {
    const items = [...state.highlights].sort((a, b) => b.created - a.created);
    let body = `<section class="hero hero-compact"><h1>Highlights</h1><p class="hero-sub">${items.length} saved</p></section>`;
    if (!items.length) body += `<p class="muted pad">Select text while reading to highlight.</p>`;
    else {
      body += `<div class="hl-list">`;
      items.forEach(h => {
        const meta = bookById(h.bookId);
        body += `<div class="hl-card">
          <div class="hl-color" style="background:${HL_COLORS.find(c => c.id === h.color)?.bg || HL_COLORS[0].bg}"></div>
          <blockquote>${esc(h.text)}</blockquote>
          <p class="muted">${esc(meta?.title || h.bookId)} · ${esc(h.chapterId)}</p>
          <button type="button" class="btn btn-ghost btn-sm" data-goto-hl="${esc(h.id)}">Open</button>
          <button type="button" class="btn btn-ghost btn-sm danger" data-del-hl="${esc(h.id)}">Remove</button>
        </div>`;
      });
      body += `</div>`;
    }
    renderShell(body, {
      title: "Highlights",
      tab: "highlights",
      bind: () => {
        document.querySelectorAll("[data-goto-hl]").forEach(el => {
          const h = state.highlights.find(x => x.id === el.dataset.gotoHl);
          if (h) el.addEventListener("click", () => navigate("read", { bookId: h.bookId, chapterId: h.chapterId }));
        });
        document.querySelectorAll("[data-del-hl]").forEach(el => {
          el.addEventListener("click", () => {
            state.highlights = state.highlights.filter(x => x.id !== el.dataset.delHl);
            saveState();
            renderHighlights();
          });
        });
      },
    });
  }

  function renderNotes() {
    const items = [...state.notes].sort((a, b) => b.created - a.created);
    let body = `<section class="hero hero-compact"><h1>Notes</h1><p class="hero-sub">${items.length} notes</p></section>`;
    if (!items.length) body += `<p class="muted pad">Add notes from the reader selection toolbar.</p>`;
    else {
      body += `<div class="note-list">`;
      items.forEach(n => {
        const meta = bookById(n.bookId);
        body += `<div class="note-card">
          ${n.quote ? `<blockquote>${esc(n.quote)}</blockquote>` : ""}
          <p>${esc(n.body)}</p>
          <p class="muted">${esc(meta?.title || n.bookId)} · ${new Date(n.created).toLocaleDateString()}</p>
          <button type="button" class="btn btn-ghost btn-sm" data-goto-note="${esc(n.id)}">Open</button>
          <button type="button" class="btn btn-ghost btn-sm danger" data-del-note="${esc(n.id)}">Delete</button>
        </div>`;
      });
      body += `</div>`;
    }
    renderShell(body, {
      title: "Notes",
      tab: "notes",
      bind: () => {
        document.querySelectorAll("[data-goto-note]").forEach(el => {
          const n = state.notes.find(x => x.id === el.dataset.gotoNote);
          if (n) el.addEventListener("click", () => navigate("read", { bookId: n.bookId, chapterId: n.chapterId }));
        });
        document.querySelectorAll("[data-del-note]").forEach(el => {
          el.addEventListener("click", () => {
            state.notes = state.notes.filter(x => x.id !== el.dataset.delNote);
            saveState();
            renderNotes();
          });
        });
      },
    });
  }

  function renderNotebook() {
    const filter = state.params.q || "all";
    let body = `<section class="hero hero-compact"><h1>Notebook</h1>
      <p class="hero-sub">${state.highlights.length} highlights · ${state.notes.length} notes · ${state.bookmarks.length} bookmarks</p>
      <button type="button" class="btn btn-ghost btn-sm" id="btnExport">Export all</button>
      <button type="button" class="btn btn-ghost btn-sm" id="btnExportMd">Export Markdown</button>
    </section>
    <div class="chip-row">
      ${["all", "highlights", "notes", "bookmarks", "quotes"].map(f =>
        `<button type="button" class="chip ${filter === f ? "active" : ""}" data-filter="${f}">${f}</button>`).join("")}
    </div>`;

    if (filter === "all" || filter === "highlights") {
      state.highlights.slice(0, 50).forEach(h => {
        const meta = bookById(h.bookId);
        body += `<div class="hl-card"><blockquote>${esc(h.text)}</blockquote>
          <p class="muted">${esc(meta?.title)} · <button type="button" class="link" data-book="${esc(h.bookId)}" data-ch="${esc(h.chapterId)}">Open</button></p></div>`;
      });
    }
    if (filter === "all" || filter === "notes") {
      state.notes.forEach(n => {
        body += `<div class="note-card">${n.quote ? `<blockquote>${esc(n.quote)}</blockquote>` : ""}
          <p>${n.tags?.map(t => `<span class="tag">${esc(t)}</span>`).join("") || ""} ${esc(n.body)}</p></div>`;
      });
    }
    if (filter === "all" || filter === "bookmarks") {
      state.bookmarks.forEach(b => {
        const meta = bookById(b.bookId);
        body += `<div class="note-card">🔖 ${esc(meta?.title)} · ${esc(b.chapterId)}
          <button type="button" class="link" data-book="${esc(b.bookId)}" data-ch="${esc(b.chapterId)}" data-para="${esc(b.paraId)}">Open</button></div>`;
      });
    }
    if (filter === "all") {
      const history = Object.entries(state.progress || {})
        .map(([bookId, p]) => ({ bookId, p, book: bookById(bookId) }))
        .filter(x => x.book && x.p?.updated)
        .sort((a, b) => (b.p.updated || 0) - (a.p.updated || 0))
        .slice(0, 12);
      if (history.length) {
        body += `<section class="section"><h2 class="section-head">Reading history</h2>`;
        history.forEach(h => {
          body += `<div class="note-card">📖 ${esc(h.book.title)} · ${esc(h.p.chapterId || "")}
            <button type="button" class="link" data-book="${esc(h.bookId)}" data-ch="${esc(h.p.chapterId || "")}" data-para="${esc(h.p.paraId || "")}">Open</button></div>`;
        });
        body += `</section>`;
      }
    }
    if (filter === "quotes") {
      (state.favorites.quotes || []).forEach(q => {
        body += `<div class="hl-card"><blockquote>${esc(q.text)}</blockquote></div>`;
      });
    }

    renderShell(body, {
      title: "Notebook",
      tab: "notebook",
      bind: () => {
        document.querySelectorAll("[data-filter]").forEach(el => {
          el.addEventListener("click", () => { state.params.q = el.dataset.filter; renderNotebook(); });
        });
        document.getElementById("btnExport")?.addEventListener("click", () => {
          const text = F()?.exportLibrary(state, state.catalog) || "";
          downloadTextFile("amps-reader-export.txt", text, "text/plain");
        });
        document.getElementById("btnExportMd")?.addEventListener("click", () => {
          downloadTextFile("amps-notebook.md", exportNotebookMarkdown(), "text/markdown");
        });
      },
    });
  }

  function renderPaths() {
    const pathId = state.params.parts[1];
    if (!pathId) {
      let body = `<section class="hero hero-compact"><h1>Learning Paths</h1>
        <p class="hero-sub">Curated study curricula for sadhana, philosophy, and teaching</p></section>`;
      (F()?.LEARNING_PATHS || []).forEach(p => {
        const count = F()?.booksForPath(state.catalog, p.id)?.length || 0;
        body += `<button type="button" class="path-card" data-path="${esc(p.id)}">
          <h3>${esc(p.title)}</h3><p>${esc(p.desc)}</p><span class="badge">${count} books</span>
        </button>`;
      });
      renderShell(body, {
        title: "Paths",
        tab: "paths",
        bind: () => {
          document.querySelectorAll("[data-path]").forEach(el => {
            el.addEventListener("click", () => navigate("paths", { pathId: el.dataset.path }));
          });
        },
      });
      return;
    }
    const path = F()?.LEARNING_PATHS.find(p => p.id === pathId);
    const books = F()?.booksForPath(state.catalog, pathId) || [];
    const pathKeys = state.stats?.pathChapters?.[pathId] || [];
    const pathPct = books.length ? Math.round((pathKeys.length / books.length) * 100) : 0;
    let body = `<section class="hero hero-compact"><h1>${esc(path?.title)}</h1><p class="hero-sub">${esc(path?.desc)}</p>
      <div class="mini-progress"><div class="mini-progress-fill" style="width:${pathPct}%"></div></div>
      <p class="muted">${pathKeys.length} / ${books.length} books opened · ${pathPct}%</p></section><div class="book-grid">`;
    books.forEach(b => { body += bookCard(b, state.progress[b.id]); });
    body += `</div>`;
    renderShell(body, { title: path?.title, tab: "paths", bind: () => {
      document.querySelectorAll("[data-book]").forEach(el => {
        el.addEventListener("click", () => navigate("book", { bookId: el.dataset.book }));
      });
    }});
  }

  function renderMore() {
    let body = `<section class="hero hero-compact"><h1>${T("more")}</h1></section>
      <p class="section-label">Games</p>
      <div class="more-grid">
        <a href="#sutra-game" class="more-item" data-route="sutra-game"><span>📿</span><strong>Ánanda Sútram</strong><small>85 sútras · flash, match, quiz, typing, boss rush</small></a>
        <a href="#shloka-game" class="more-item" data-route="shloka-game"><span>🕉</span><strong>Samskrta Shloka</strong><small>494 verses · flash, match, quiz, typing, boss rush</small></a>
      </div>
      <p class="section-label">Tools</p>
      <div class="more-grid">
        <a href="#today" class="more-item"><span>3m</span><strong>Today</strong><small>3 minute wisdom, streak, daily discourse</small></a>
        <a href="#tools" class="more-item"><span>20</span><strong>Study Tools</strong><small>All new reading, audio, study and export features</small></a>
        <a href="#daily-challenge" class="more-item"><span>D</span><strong>Daily Challenge</strong><small>Read, play, reflect</small></a>
        <a href="#socratic-guide" class="more-item"><span>S</span><strong>Socratic Guide</strong><small>Ask Me, 5 Whys, reflection and Dharma Cakra prompts</small></a>
        <a href="#companion" class="more-item"><span>AI</span><strong>Study Companion</strong><small>Summaries and questions</small></a>
        <a href="#qa-bank" class="more-item"><span>Q</span><strong>Q&A Bank</strong><small>Source-backed chapter questions</small></a>
        <a href="#exam" class="more-item"><span>E</span><strong>Practice Exam</strong><small>Closed questions with review</small></a>
        <a href="#smart-search" class="more-item"><span>⌕</span><strong>Smart Search</strong><small>Find passages by topic</small></a>
        <a href="#audio" class="more-item"><span>▶</span><strong>Audio Mode</strong><small>Walking and listening dashboard</small></a>
        <a href="#concepts" class="more-item"><span>🕸</span><strong>Concept map</strong><small>Brahma, Citta, Puruśa…</small></a>
        <a href="#ask" class="more-item"><span>?</span><strong>Ask Question</strong><small>Free offline answers with citations</small></a>
        <a href="#pronunciation" class="more-item"><span>🗣</span><strong>Pronunciation</strong><small>Review and edit local TTS corrections</small></a>
        <a href="#voice-lab" class="more-item"${window.AmpsBuildFlags?.shlokaRecorder === true ? "" : " hidden"} aria-hidden="${window.AmpsBuildFlags?.shlokaRecorder === true ? "false" : "true"}"><span>🎙</span><strong>Own Voice Lab</strong><small>Record and export your consented voice dataset</small></a>
        <a href="#shloka-recorder" class="more-item"${window.AmpsBuildFlags?.shlokaRecorder === true ? "" : " hidden"} aria-hidden="${window.AmpsBuildFlags?.shlokaRecorder === true ? "false" : "true"}"><span>📿</span><strong>Shloka Recording Studio</strong><small>Record pundit-style verse readings</small></a>
        <a href="#study" class="more-item"><span>🧠</span><strong>${T("memorization")}</strong><small>SRS</small></a>
        <a href="#achievements" class="more-item"><span>✓</span><strong>Achievements</strong><small>Badges and mastery</small></a>
        <a href="#history" class="more-item"><span>H</span><strong>Reading History</strong><small>Recent progress timeline</small></a>
        <a href="#stats" class="more-item"><span>📊</span><strong>${T("stats")}</strong></a>
        <a href="#glossary" class="more-item"><span>अ</span><strong>${T("glossary")}</strong></a>
        <a href="#journal" class="more-item"><span>📔</span><strong>${T("journal")}</strong></a>
        <a href="#quote-maker" class="more-item"><span>Q</span><strong>Quote Card</strong><small>Shareable passage image</small></a>
        <a href="#teacher" class="more-item"><span>T</span><strong>Class Mode</strong><small>Teaching outlines</small></a>
        <a href="#collections" class="more-item"><span>📁</span><strong>${T("collections")}</strong></a>
        ${presentationBuilderEnabled() ? `<a href="#presentation-builder" class="more-item"><span>📽</span><strong>Presentation Builder</strong><small>Hand-pick passages · limited PDF export</small></a>` : ""}
        <a href="#import" class="more-item"><span>📥</span><strong>${T("importBook")}</strong></a>
        <a href="#plan" class="more-item"><span>📅</span><strong>Reading plan</strong></a>
        <a href="#compare" class="more-item"><span>⚖</span><strong>Compare</strong></a>
        <a href="#backup" class="more-item"><span>B</span><strong>Backup</strong><small>Export, restore, cloud endpoint</small></a>
        <a href="#validation-report" class="more-item"><span>V</span><strong>Content Report</strong><small>Library validation summary</small></a>
        <a href="#offline" class="more-item"><span>✓</span><strong>Offline &amp; Downloads</strong><small>Shell status, packs, storage</small></a>
        <a href="#about" class="more-item"><span>i</span><strong>About & Privacy</strong><small>Publisher, policy, attribution</small></a>
        <a href="#privacy-data" class="more-item"><span>⚿</span><strong>Privacy &amp; local data</strong><small>Export or delete on-device data</small></a>
        <a href="legal/support.html" class="more-item"><span>?</span><strong>Support</strong><small>Contact and help links</small></a>
        <a href="#settings" class="more-item"><span>⚙</span><strong>${T("settings")}</strong></a>
        <a href="#search" class="more-item"><span>⌕</span><strong>${T("search")}</strong></a>
        <button type="button" class="more-item" id="btnExportJson"><span>⇩</span><strong>${T("syncExport")}</strong></button>
      </div>`;
    renderShell(body, {
      title: "More",
      tab: "more",
      bind: () => {
        document.getElementById("btnExportJson")?.addEventListener("click", () => {
          const json = JSON.stringify(window.AmpsSync?.snapshot(state) || {}, null, 2);
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
          a.download = "amps-reader-backup.json";
          a.click();
        });
      },
    });
  }

  function renderOfflineStatus() {
    const catalog = state.catalog || {};
    const sw = window.AmpsServiceWorker?.getState?.() || {};
    const online = typeof navigator !== "undefined" ? navigator.onLine : true;
    const release =
      state.releaseManifest?.releaseId ||
      window.AmpsServiceWorker?.getState?.()?.releaseId ||
      "—";
    const rows = [
      ["Network", online ? "Online" : "Offline"],
      ["Release", release],
      ["Service worker", sw.state || "unknown"],
      ["Books packaged", catalog.bookCount || catalog.books?.length || 0],
      ["Capacitor", window.AmpsServiceWorker?.isCapacitorNative?.() ? "Native (bundled assets)" : "Browser"],
    ];
    const body = `<section class="hero hero-compact"><h1>Offline &amp; Downloads</h1>
      <p class="hero-sub">Application shell opens offline after the first successful load. Content packs download only when you choose Download — nothing starts silently.</p></section>
      <div class="stats-grid">${rows.map(([k, v]) => `<div class="stat-card"><span class="stat-val">${esc(v)}</span><span class="stat-lbl">${esc(k)}</span></div>`).join("")}</div>
      <section class="modern-card" id="offlineStoragePanel">
        <h3>Storage</h3>
        <p id="offlineQuotaText" class="muted" role="status">Estimating storage…</p>
        <button type="button" class="btn btn-ghost btn-sm" id="btnClearObsoleteCaches">Clear obsolete caches</button>
        <button type="button" class="btn btn-ghost btn-sm" id="btnExportPackDiag">Export pack diagnostics</button>
      </section>
      <section class="modern-card" id="offlinePackPanel">
        <h3>Content packs</h3>
        <p class="muted">Bundled books remain available without downloading. Optional packs verify hashes before they become active. Portable <code>.ampspack</code> archives can be imported locally — nothing downloads silently.</p>
        <label class="btn btn-ghost btn-sm">Import .ampspack<input type="file" id="ampspackImport" accept=".ampspack,application/zip" hidden /></label>
        <div id="ampspackPreview" class="muted" role="status" hidden></div>
        <div id="offlinePackList" role="list" aria-live="polite"><p class="muted">Loading packs…</p></div>
        <p id="offlinePackStatus" class="muted" role="status"></p>
        <div class="progress-wrap" hidden id="offlinePackProgressWrap">
          <label for="offlinePackProgress">Download progress</label>
          <progress id="offlinePackProgress" max="100" value="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></progress>
          <span id="offlinePackProgressText" class="muted"></span>
        </div>
      </section>
      <section class="modern-card"><h3>What stays local</h3>
      <p>Highlights, notes, bookmarks, journal, and reading progress stay on this device when packs are updated or removed.</p></section>`;
    renderShell(body, {
      title: "Offline & Downloads",
      tab: "more",
      bind: () => {
        void bindOfflinePackUi(release);
      },
    });
  }

  async function bindOfflinePackUi(releaseId) {
    const listEl = document.getElementById("offlinePackList");
    const statusEl = document.getElementById("offlinePackStatus");
    const quotaEl = document.getElementById("offlineQuotaText");
    const progressWrap = document.getElementById("offlinePackProgressWrap");
    const progressEl = document.getElementById("offlinePackProgress");
    const progressText = document.getElementById("offlinePackProgressText");
    const pm = window.AmpsPackManager;
    if (!pm) {
      if (listEl) listEl.innerHTML = `<p class="muted">Pack manager unavailable in this build.</p>`;
      return;
    }

    const fmtBytes = (n) => {
      if (n == null || Number.isNaN(n)) return "—";
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    };

    async function refresh() {
      const [available, installed, quota] = await Promise.all([
        pm.listAvailable(),
        pm.listInstalled(),
        pm.estimateQuota(),
      ]);
      if (quotaEl) {
        quotaEl.textContent =
          quota.quota != null
            ? `Used ${fmtBytes(quota.usage)} of ~${fmtBytes(quota.quota)} estimated`
            : "Storage estimate unavailable in this browser";
      }
      const installedMap = new Map((installed || []).map((p) => [p.packId, p]));
      if (!listEl) return;
      if (!available.length) {
        listEl.innerHTML = `<p class="muted">No pack catalog yet. Run <code>npm run packs:build</code> then rebuild the public runtime.</p>`;
        return;
      }
      listEl.innerHTML = available
        .map((p) => {
          const inst = installedMap.get(p.packId);
          const blocked = String(p.status || "").startsWith("BLOCKED");
          const size = fmtBytes(p.sizeBytes || 0);
          const langs = (p.languages || []).join(", ") || "—";
          const compat = (p.compatibleReleaseIds || []).includes(releaseId)
            ? "compatible"
            : p.compatibleReleaseIds?.length
              ? "check release"
              : "compatible";
          const statusLine = blocked
            ? esc(p.status)
            : inst
              ? `Installed · verified ${esc(inst.lastVerifiedAt || "—")}`
              : "Not downloaded";
          const actions = blocked
            ? `<span class="muted">Blocked</span>`
            : inst
              ? `<button type="button" class="btn btn-ghost btn-sm" data-pack-act="verify" data-pack-id="${esc(p.packId)}">Verify</button>
                 <button type="button" class="btn btn-ghost btn-sm" data-pack-act="repair" data-pack-id="${esc(p.packId)}">Repair</button>
                 <button type="button" class="btn btn-ghost btn-sm" data-pack-act="update" data-pack-id="${esc(p.packId)}">Update</button>
                 <button type="button" class="btn btn-ghost btn-sm" data-pack-act="remove" data-pack-id="${esc(p.packId)}">Remove</button>`
              : `<button type="button" class="btn btn-gold btn-sm" data-pack-act="download" data-pack-id="${esc(p.packId)}">Download</button>`;
          return `<article class="pack-row" role="listitem" data-pack-id="${esc(p.packId)}">
            <header><strong>${esc(p.title || p.packId)}</strong>
              <span class="muted">${esc(p.type || "")} · ${esc(langs)} · ${esc(size)} · ${esc(compat)}</span></header>
            <p class="muted">${esc(p.description || "")}</p>
            <p role="status">${statusLine}${inst?.lastError ? ` · last error: ${esc(inst.lastError)}` : ""}</p>
            <div class="pack-actions">${actions}
              ${inst ? `<button type="button" class="btn btn-ghost btn-sm" data-pack-act="cancel" data-pack-id="${esc(p.packId)}">Cancel</button>` : ""}
            </div>
          </article>`;
        })
        .join("");
    }

    async function runAct(act, packId) {
      if (statusEl) statusEl.textContent = `${act} ${packId}…`;
      if (progressWrap) progressWrap.hidden = false;
      const onProgress = (p) => {
        const pct = p.total ? Math.round((100 * p.done) / p.total) : 0;
        if (progressEl) {
          progressEl.value = pct;
          progressEl.setAttribute("aria-valuenow", String(pct));
        }
        if (progressText) progressText.textContent = `${p.done} / ${p.total} files (${pct}%)`;
      };
      let result;
      try {
        if (act === "download" || act === "update" || act === "repair") {
          result = await pm[act === "download" ? "install" : act](packId, {
            releaseId,
            onProgress,
          });
        } else if (act === "verify") result = await pm.verify(packId);
        else if (act === "remove") result = await pm.remove(packId);
        else if (act === "cancel") result = pm.cancel(packId);
        else result = { ok: false, error: "unknown_action" };
      } catch (err) {
        result = { ok: false, error: String(err && err.message ? err.message : err) };
      }
      if (statusEl) {
        statusEl.textContent = result?.ok
          ? `${act} succeeded for ${packId}`
          : `${act} failed: ${result?.error || "unknown"}`;
      }
      if (progressWrap && act !== "cancel") progressWrap.hidden = true;
      await refresh();
    }

    listEl?.addEventListener("click", (ev) => {
      const btn = ev.target?.closest?.("[data-pack-act]");
      if (!btn) return;
      const act = btn.getAttribute("data-pack-act");
      const packId = btn.getAttribute("data-pack-id");
      if (!act || !packId) return;
      void runAct(act, packId);
    });

    document.getElementById("btnClearObsoleteCaches")?.addEventListener("click", async () => {
      const r = await pm.clearObsoleteCaches(releaseId);
      if (statusEl) statusEl.textContent = `Cleared ${r.removed?.length || 0} obsolete cache(s)`;
    });

    document.getElementById("btnExportPackDiag")?.addEventListener("click", async () => {
      const diag = await pm.exportDiagnostics();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(diag, null, 2)], { type: "application/json" }));
      a.download = "amps-pack-diagnostics.json";
      a.click();
    });

    let pendingImport = null;
    document.getElementById("ampspackImport")?.addEventListener("change", async (ev) => {
      const file = ev.target.files?.[0];
      const previewEl = document.getElementById("ampspackPreview");
      if (!file || !pm.importArchiveFile) return;
      try {
        const r = await pm.importArchiveFile(file, { confirm: false });
        pendingImport = { file, preview: r.preview };
        if (previewEl) {
          const p = r.preview || {};
          previewEl.hidden = false;
          previewEl.innerHTML = `<p><strong>${esc(p.title || p.packId)}</strong> · ${esc(p.type || "")} · v${esc(p.version || "")}</p>
            <p>Size ${esc(String(p.sizeBytes || r.preview?.archiveBytes || "—"))} · trust ${esc(p.trustState || "—")} · ${esc(String(p.fileCount || 0))} files</p>
            <p class="muted">Dependencies: ${esc((p.dependencies || []).join(", ") || "none")}</p>
            <button type="button" class="btn btn-gold btn-sm" id="btnConfirmAmpspack">Install verified pack</button>
            <button type="button" class="btn btn-ghost btn-sm" id="btnCancelAmpspack">Cancel</button>`;
          document.getElementById("btnConfirmAmpspack")?.addEventListener("click", async () => {
            if (!pendingImport) return;
            if (statusEl) statusEl.textContent = `Installing ${pendingImport.preview.packId}…`;
            const inst = await pm.importArchiveFile(pendingImport.file, {
              confirm: true,
              releaseId,
              onProgress: (p) => {
                if (progressWrap) progressWrap.hidden = false;
                const pct = p.total ? Math.round((100 * p.done) / p.total) : 0;
                if (progressEl) {
                  progressEl.value = pct;
                  progressEl.setAttribute("aria-valuenow", String(pct));
                }
                if (progressText) progressText.textContent = `${p.done} / ${p.total}`;
              },
            });
            if (statusEl) {
              statusEl.textContent = inst.ok
                ? `Installed ${inst.pack?.packId}`
                : `Import failed: ${inst.error}`;
            }
            if (progressWrap) progressWrap.hidden = true;
            pendingImport = null;
            if (previewEl) previewEl.hidden = true;
            await refresh();
          });
          document.getElementById("btnCancelAmpspack")?.addEventListener("click", () => {
            pendingImport = null;
            if (previewEl) previewEl.hidden = true;
          });
        }
      } catch (err) {
        if (statusEl) statusEl.textContent = `Import preview failed: ${err.message || err}`;
      }
      ev.target.value = "";
    });

    await refresh();
  }

  function renderJournal() {
    let body = `<section class="hero hero-compact"><h1>Reflection Journal</h1></section>
      <textarea id="journalEntry" class="journal-input" rows="4" placeholder="Write your reflection…"></textarea>
      <button type="button" class="btn btn-gold" id="btnSaveJournal">Save entry</button>`;
    (state.journal || []).slice().reverse().forEach(j => {
      body += `<div class="note-card"><p>${esc(j.body)}</p><p class="muted">${new Date(j.created).toLocaleString()}</p></div>`;
    });
    renderShell(body, {
      title: "Journal",
      tab: "journal",
      bind: () => {
        document.getElementById("btnSaveJournal")?.addEventListener("click", () => {
          const body = document.getElementById("journalEntry")?.value?.trim();
          if (!body) return;
          state.journal.push({ id: uid(), body, created: Date.now() });
          saveState();
          renderJournal();
        });
      },
    });
  }

  function renderSettings() {
    let body = `<section class="hero hero-compact"><h1>Settings & Sync</h1>
      <p class="hero-sub">Local backup plus cloud sync when license server URL is configured</p></section>
      <div class="settings-panel">
        <h2 class="settings-section-title">Audio & Pronunciation</h2>
        <label>Voice
          <span class="tts-voice-row">${ttsVoiceSelectHtml("settingsTtsVoice")}
          <button type="button" class="btn btn-ghost btn-sm" id="btnSettingsTtsPreview">Preview</button></span>
        </label>
        <p class="muted">Accent preference never outranks pronunciation certification. If no certified Indian female English voice exists, the app uses the best certified English voice and says so. <a href="admin/english-voice-review.html">Open voice qualification workbench</a>.</p>
        <p class="muted">Reading language: automatic from content. Pronunciation: approved human audio, approved Samskrta rules, or English system pronunciation. Experimental audio is unavailable publicly.</p>
        <label>Samskrta pronunciation (Samskrta text only)
          ${ttsPronunciationSelectHtml("settingsTtsPronunciation")}
        </label>
        <label>Sanskrit reading speed
          ${sanskritSpeechRateSelectHtml("settingsSanskritSpeechRate")}
        </label>
        <p class="muted">Ordinary English uses the English engine. Samskrta rules apply only to Samskrta segments. Visible chapter text is unchanged.</p>
        <label>Reading speed <span id="settingsTtsRateVal">${(state.settings.ttsRate || 1).toFixed(1)}×</span>
          <input type="range" id="settingsTtsRate" data-reader-tts-rate min="0.6" max="1.6" step="0.1" value="${state.settings.ttsRate || 1}" />
        </label>
        <p class="muted tts-voice-hint" id="settingsTtsVoiceHint"></p>
        <hr class="settings-divider" />
        <h2 class="settings-section-title">Backup & Sync</h2>
        <button type="button" class="btn btn-gold" id="btnExportJson">${T("syncExport")}</button>
        <label class="btn btn-ghost import-label">${T("syncImport")}<input type="file" id="importFile" accept=".json" hidden /></label>
        <label class="check-row"><input type="checkbox" id="autoBackup" ${state.settings.autoBackup !== false ? "checked" : ""} /> ${T("autoSync")}</label>
        <label>Cloud sync URL (optional self-hosted)<input type="url" id="syncUrl" placeholder="https://…" value="${esc(state.settings.syncEndpoint || "")}" /></label>
        <button type="button" class="btn btn-ghost btn-sm" id="btnCloudPush">Upload to cloud URL</button>
        <button type="button" class="btn btn-ghost btn-sm" id="btnCloudPull">Download from cloud URL</button>
        <button type="button" class="btn btn-gold btn-sm" id="btnLicenseSyncPush">Sync to license server</button>
        <button type="button" class="btn btn-ghost btn-sm" id="btnLicenseSyncPull">Restore from license server</button>
        <p class="muted">License sync uses Settings → License server URL + your activated email/key.</p>
        <p class="muted">Library: ${state.catalog?.bookCount || "?"} books · ${state.catalog?.discourseCount || "?"} discourses (all offline in APK)</p>
        <p class="muted">Data version: ${esc(window.AmpsEnhance?.libraryVersion?.() || "?")} · APK should be ~39 MB</p>
        <p class="muted">Regenerate: <code>node scripts/generate-amps-reader-data.js</code> then rebuild APK.</p>
        ${window.AmpsLicense?.settingsSectionHtml?.() || ""}
        ${window.AmpsTtsDiag?.panelHtml?.() || ""}
        <hr class="settings-divider" />
        <h2 class="settings-section-title">Admin</h2>
        <p class="muted">Restrict PDF downloads in Discourse mode${presentationBuilderEnabled() ? " and Presentation Builder" : ""}. Unlock with your admin PIN to change policy.</p>
        <label>Admin PIN
          <input type="password" id="adminPinInput" autocomplete="off" placeholder="${state.settings.adminPin ? "Enter PIN to unlock" : "Set new PIN (4+ characters)"}" />
        </label>
        <button type="button" class="btn btn-ghost btn-sm" id="btnAdminUnlock">${isAdminUnlocked() ? "Admin unlocked (30 min)" : "Unlock admin"}</button>
        <div id="adminControls" class="admin-controls"${isAdminUnlocked() ? "" : " hidden"}>
          <label class="check-row"><input type="checkbox" id="discoursePdfAllowed" ${isDiscoursePdfAllowed() ? "checked" : ""} /> Allow PDF download (Discourse${presentationBuilderEnabled() ? " &amp; presentations" : " mode"})</label>
          <button type="button" class="btn btn-ghost btn-sm" id="btnChangeAdminPin">Change admin PIN</button>
        </div>
      </div>`;
    renderShell(body, {
      title: "Settings",
      tab: "settings",
      bind: () => {
        bindTtsVoiceSelect("settingsTtsVoice", "btnSettingsTtsPreview");
        bindTtsPronunciationSelect("settingsTtsPronunciation", "settingsTtsVoiceHint", "settingsTtsVoice");
        bindSanskritSpeechRateSelect("settingsSanskritSpeechRate");
        document.getElementById("settingsTtsRate")?.addEventListener("input", e => {
          applyTtsPlaybackRate(e.target.value);
        });
        document.getElementById("btnExportJson")?.addEventListener("click", () => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([JSON.stringify(window.AmpsSync?.snapshot(state) || {}, null, 2)], { type: "application/json" }));
          a.download = "amps-reader-backup.json";
          a.click();
        });
        document.getElementById("importFile")?.addEventListener("change", e => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            try {
              window.AmpsSync?.applySnapshot(state, JSON.parse(reader.result));
              saveState();
              alert("Backup restored successfully");
              renderFromState();
            } catch { alert("Invalid backup file"); }
          };
          reader.readAsText(file);
        });
        document.getElementById("autoBackup")?.addEventListener("change", e => {
          state.settings.autoBackup = e.target.checked;
          saveState();
        });
        document.getElementById("syncUrl")?.addEventListener("change", e => {
          state.settings.syncEndpoint = e.target.value.trim();
          saveState();
        });
        document.getElementById("btnCloudPush")?.addEventListener("click", async () => {
          if (!window.AmpsLicense?.requirePremium?.("Cloud sync")) return;
          const url = state.settings.syncEndpoint;
          if (!url) return alert("Set sync URL first");
          try {
            await window.AmpsSync.pushToEndpoint(url, state);
            alert("Uploaded");
          } catch { alert("Upload failed"); }
        });
        document.getElementById("btnCloudPull")?.addEventListener("click", async () => {
          if (!window.AmpsLicense?.requirePremium?.("Cloud sync")) return;
          const url = state.settings.syncEndpoint;
          if (!url) return alert("Set sync URL first");
          try {
            const data = await window.AmpsSync.pullFromEndpoint(url);
            window.AmpsSync.applySnapshot(state, data);
            saveState();
            alert("Downloaded — local data replaced with cloud snapshot");
            renderFromState();
          } catch { alert("Download failed"); }
        });
        document.getElementById("btnLicenseSyncPush")?.addEventListener("click", async () => {
          if (!window.AmpsLicense?.requirePremium?.("Cloud sync")) return;
          const lic = state.license || {};
          if (!state.settings.apiBaseUrl || !lic.email || !lic.licenseKey) {
            return alert("Set license server URL and activate your license first.");
          }
          try {
            const result = await window.AmpsSync.syncAccountLww(state, {
              apiBaseUrl: state.settings.apiBaseUrl,
              email: lic.email,
              licenseKey: lic.licenseKey,
            });
            saveState();
            if (result.action === "pulled") {
              alert("Account had a newer snapshot — local data replaced");
              renderFromState();
            } else {
              alert("Synced to license server (account snapshot)");
            }
          } catch (e) { alert(e.message || "Sync failed"); }
        });
        document.getElementById("btnLicenseSyncPull")?.addEventListener("click", async () => {
          if (!window.AmpsLicense?.requirePremium?.("Cloud sync")) return;
          const lic = state.license || {};
          if (!state.settings.apiBaseUrl || !lic.email || !lic.licenseKey) {
            return alert("Set license server URL and activate your license first.");
          }
          try {
            const data = await window.AmpsSync.pullFromLicenseServer({
              apiBaseUrl: state.settings.apiBaseUrl,
              email: lic.email,
              licenseKey: lic.licenseKey,
            });
            window.AmpsSync.applySnapshot(state, data);
            saveState();
            alert("Downloaded — local data replaced with account snapshot");
            renderFromState();
          } catch (e) { alert(e.message || "Restore failed"); }
        });
        window.AmpsTtsDiag?.bindPanel?.(state);
        function refreshAdminControls() {
          const panel = document.getElementById("adminControls");
          const btn = document.getElementById("btnAdminUnlock");
          if (panel) panel.classList.toggle("hidden", !isAdminUnlocked());
          if (btn) btn.textContent = isAdminUnlocked() ? "Admin unlocked (30 min)" : "Unlock admin";
        }
        document.getElementById("btnAdminUnlock")?.addEventListener("click", () => {
          const pin = document.getElementById("adminPinInput")?.value;
          const res = tryUnlockAdmin(pin);
          if (!res.ok) return alert(res.msg);
          if (res.created) alert("Admin PIN saved. You can now control PDF downloads.");
          refreshAdminControls();
        });
        document.getElementById("discoursePdfAllowed")?.addEventListener("change", e => {
          if (!isAdminUnlocked()) {
            e.target.checked = isDiscoursePdfAllowed();
            return alert("Unlock admin first to change PDF policy.");
          }
          state.settings.discoursePdfAllowed = e.target.checked;
          saveState();
        });
        document.getElementById("btnChangeAdminPin")?.addEventListener("click", () => {
          if (!isAdminUnlocked()) return alert("Unlock admin first.");
          const next = prompt("New admin PIN (at least 4 characters):");
          if (!next || next.trim().length < 4) return alert("PIN must be at least 4 characters.");
          state.settings.adminPin = next.trim();
          saveState();
          alert("Admin PIN updated.");
        });
        window.AmpsLicense?.bindSettingsSection?.();
      },
    });
  }

  async function renderPresent() {
    const gen = nextRenderGen();
    const bookId = state.params.parts[1];
    const chapterId = state.params.parts[2];
    if (!bookId) { navigate("library"); return; }

    document.body.classList.add("present-mode");
    document.getElementById("app").innerHTML = `<div class="loading"><div class="spinner"></div><p>Opening discourse…</p></div>`;

    let book, ch;
    try {
      book = await loadBook(bookId);
      if (renderStale(gen) || state.route !== "present") return;
      ch = book.chapters.find(c => c.id === chapterId) || book.chapters[0];
      if (!ch) throw new Error("no chapter");
    } catch {
      if (renderStale(gen)) return;
      document.getElementById("app").innerHTML = `<div class="pad"><h2>Cannot open discourse</h2><button type="button" class="btn" id="btnPresentBack">Back to library</button></div>`;
      document.getElementById("btnPresentBack")?.addEventListener("click", () => navigate("library"));
      return;
    }

    const paras = ch.paragraphs || [];
    let idx = 0;
    const theme = state.settings.presentTheme || "light";
    const pdfAllowed = isDiscoursePdfAllowed();

    function applyTheme(t) {
      const stage = document.getElementById("presentStage");
      if (!stage) return;
      stage.className = "present-stage present-enhanced present-" + t;
    }

    function showPara(keepWordHighlight, readText) {
      const stage = document.getElementById("presentStage");
      if (!stage) return;
      const p = paras[idx];
      const body = readText || p?.text || "";
      stage.innerHTML = `
        <header class="present-head">
          <p class="present-book-label">${esc(book.title)}</p>
          <h1 class="present-title">${esc(ch.title)}</h1>
          <p class="present-counter">${idx + 1} / ${paras.length}</p>
        </header>
        <div class="present-read-block" id="presentReadBlock">
          <p class="present-para">${window.AmpsAudio?.wordSpanHtml?.(body, esc) || esc(body)}</p>
        </div>
        ${ch.datePlace ? `<footer class="discourse-meta present-discourse-meta"><p class="discourse-meta-label">Date &amp; place</p><p>${esc(ch.datePlace)}</p></footer>` : ""}`;
      if (!keepWordHighlight) {
        window.AmpsAudio?.highlightWordIn?.(document.getElementById("presentReadBlock"), -1);
      }
    }

    function onPresentWord(charStart) {
      const readText = window.AmpsAudio?.getSpokenText?.() || paras[idx]?.text || "";
      const wi = window.AmpsAudio?.charIndexToWordIndex?.(readText, charStart) ?? -1;
      window.AmpsAudio?.highlightWordIn?.(document.getElementById("presentReadBlock"), wi);
    }

    function speakFrom(i) {
      document.body.classList.add("tts-reading");
      window.AmpsAudio?.speakParagraphs(
        paras.map(p => p.text),
        paras.map(p => p.id),
        effectiveSpeechRate("normal"),
        (pi, _pid, spoken) => {
          if (pi >= 0) {
            idx = pi;
            showPara(true, spoken);
            const first = document.querySelector("#presentReadBlock .tts-word");
            if (first) window.AmpsAudio?.smoothScrollWordIntoView?.(first);
          } else {
            window.AmpsAudio?.highlightWordIn?.(document.getElementById("presentReadBlock"), -1);
            document.body.classList.remove("tts-reading");
          }
        },
        normalizeTtsVoice(state.settings.ttsVoice),
        i,
        (charStart) => onPresentWord(charStart),
        sanskritPronunciationMode()
      );
    }

    document.getElementById("app").innerHTML = `
      <div class="present-shell">
        <header class="present-bar">
          <div class="present-bar-main">
            <button type="button" class="present-btn" id="btnExitPresent">← Exit</button>
            <span class="present-bar-title">${esc(ch.title)}</span>
            <div class="present-bar-actions">
              <button type="button" class="present-btn present-btn-icon" id="btnPresentPrev" title="Previous paragraph">‹</button>
              <button type="button" class="present-btn present-btn-icon present-btn-play" id="btnPresentTts" title="Read aloud">🔊</button>
              <button type="button" class="present-btn present-btn-icon" id="btnPresentTtsStop" title="Stop">⏹</button>
              <button type="button" class="present-btn present-btn-icon" id="btnPresentNext" title="Next paragraph">›</button>
              ${pdfAllowed ? `<button type="button" class="present-btn present-btn-icon" id="btnPresentPdf" title="Download discourse as PDF">📄</button>` : ""}
              <button type="button" class="present-btn present-btn-icon" id="btnPresentOpts" title="Reading options" aria-expanded="false">⚙</button>
            </div>
          </div>
          <div class="present-bar-extra" id="presentBarExtra" hidden>
            <label class="present-opt">
              <span>Theme</span>
              <select id="presentTheme">
                <option value="light" ${theme === "light" ? "selected" : ""}>Light</option>
                <option value="dark" ${theme === "dark" ? "selected" : ""}>Dark</option>
                <option value="projector" ${theme === "projector" ? "selected" : ""}>Projector</option>
              </select>
            </label>
            <label class="present-check"><input type="checkbox" id="presentAuto" ${state.settings.presentAuto ? "checked" : ""} /> Auto read</label>
            <label class="present-opt">
              <span>Speed <span id="presentTtsRateVal">${(state.settings.ttsRate || 1).toFixed(1)}×</span></span>
              <input type="range" id="presentTtsRate" data-reader-tts-rate min="0.6" max="1.6" step="0.1" value="${state.settings.ttsRate || 1}" />
            </label>
            <label class="present-opt present-opt-voice">
              <span>Voice</span>
              ${ttsVoiceSelectHtml("presentVoice")}
            </label>
            <button type="button" class="present-btn present-btn-sm" id="btnPresentTtsPreview">Preview voice</button>
            ${pdfAllowed ? `<button type="button" class="present-btn present-btn-sm" id="btnPresentPdfExtra">Download PDF</button>` : ""}
          </div>
        </header>
        <div class="present-stage-wrap">
          <div class="present-stage" id="presentStage"></div>
        </div>
      </div>`;

    applyTheme(theme);
    showPara();

    document.getElementById("btnExitPresent")?.addEventListener("click", () => {
      stopTtsPlayback();
      navigate("read", { bookId, chapterId: ch.id });
    });
    document.getElementById("btnPresentPrev")?.addEventListener("click", () => {
      if (idx > 0) { idx -= 1; showPara(); }
    });
    document.getElementById("btnPresentNext")?.addEventListener("click", () => {
      if (idx < paras.length - 1) { idx += 1; showPara(); }
    });
    document.getElementById("btnPresentTts")?.addEventListener("click", () => speakFrom(idx));
    document.getElementById("btnPresentTtsStop")?.addEventListener("click", () => stopTtsPlayback());
    const onPresentPdf = () => {
      if (!window.AmpsLicense?.requirePremium?.("PDF download")) return;
      downloadDiscoursePdf(book, ch);
    };
    document.getElementById("btnPresentPdf")?.addEventListener("click", onPresentPdf);
    document.getElementById("btnPresentPdfExtra")?.addEventListener("click", onPresentPdf);
    document.getElementById("btnPresentOpts")?.addEventListener("click", () => {
      const extra = document.getElementById("presentBarExtra");
      const btn = document.getElementById("btnPresentOpts");
      if (!extra || !btn) return;
      const open = extra.hidden;
      extra.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.getElementById("presentAuto")?.addEventListener("change", e => {
      state.settings.presentAuto = e.target.checked;
      saveState();
      if (e.target.checked) speakFrom(idx);
      else stopTtsPlayback();
    });
    bindTtsVoiceSelect("presentVoice", "btnPresentTtsPreview");
    document.getElementById("presentTheme")?.addEventListener("change", e => {
      state.settings.presentTheme = e.target.value;
      saveState();
      applyTheme(e.target.value);
    });
    document.getElementById("presentTtsRate")?.addEventListener("input", e => {
      applyTtsPlaybackRate(e.target.value);
    });

    if (state.settings.presentAuto) speakFrom(idx);
  }

  async function renderCompare() {
    let body = `<section class="hero hero-compact"><h1>Compare Passages</h1>
      <p class="hero-sub">Side-by-side discourses with synced scroll</p></section>
      <div class="compare-pickers">
        <select id="cmpBook1"><option value="">Book A…</option>${(state.catalog.books || []).map(b =>
          `<option value="${esc(b.id)}">${esc(b.title)}</option>`).join("")}</select>
        <select id="cmpCh1" disabled><option>Chapter…</option></select>
        <select id="cmpBook2"><option value="">Book B…</option>${(state.catalog.books || []).map(b =>
          `<option value="${esc(b.id)}">${esc(b.title)}</option>`).join("")}</select>
        <select id="cmpCh2" disabled><option>Chapter…</option></select>
        <button type="button" class="btn btn-gold" id="btnCompare">Compare</button>
      </div>
      <div id="compareOut" class="compare-grid"></div>`;
    renderShell(body, {
      title: "Compare",
      tab: "more",
      bind: () => {
        async function fillChapters(bookSel, chSel) {
          const id = document.getElementById(bookSel)?.value;
          const sel = document.getElementById(chSel);
          if (!id || !sel) return;
          const book = await loadBook(id);
          sel.disabled = false;
          sel.innerHTML = book.chapters.map(c =>
            `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join("");
        }
        document.getElementById("cmpBook1")?.addEventListener("change", () => fillChapters("cmpBook1", "cmpCh1"));
        document.getElementById("cmpBook2")?.addEventListener("change", () => fillChapters("cmpBook2", "cmpCh2"));
        document.getElementById("btnCompare")?.addEventListener("click", async () => {
          const id1 = document.getElementById("cmpBook1")?.value;
          const id2 = document.getElementById("cmpBook2")?.value;
          const ch1 = document.getElementById("cmpCh1")?.value;
          const ch2 = document.getElementById("cmpCh2")?.value;
          if (!id1 || !id2) return;
          const [b1, b2] = await Promise.all([loadBook(id1), loadBook(id2)]);
          const c1 = b1.chapters.find(c => c.id === ch1) || b1.chapters[0];
          const c2 = b2.chapters.find(c => c.id === ch2) || b2.chapters[0];
          const out = document.getElementById("compareOut");
          out.innerHTML = window.AmpsEnhance?.compareHtml(b1, c1, b2, c2, esc) || "";
          window.AmpsEnhance?.bindCompareSync(out);
        });
      },
    });
  }

  function renderSutraVisualCard(s, opts) {
    if (!s) return "";
    const hideRoman = opts?.hideRoman;
    const hideDev = opts?.hideDev;
    const showId = opts?.showId !== false;
    return `<div class="sutra-visual-card">
      ${showId ? `<p class="sutra-visual-id">${esc(s.displayNum || s.id)}</p>` : ""}
      ${hideRoman ? "" : `<p class="sutra-visual-roman">${esc(s.romanLine || `${s.id}. ${s.roman}`)}</p>`}
      ${hideDev ? `<p class="sutra-visual-mask">?</p>` : (s.devanagari ? `<p class="sutra-visual-dev">${esc(s.devanagari)}</p>` : "")}
    </div>`;
  }

  function normalizeGameAnswer(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function typingMatchScore(answer, target) {
    const a = normalizeGameAnswer(answer);
    const t = normalizeGameAnswer(target);
    if (!a || !t) return 0;
    if (a === t) return 100;
    const aw = a.split(" ");
    const tw = t.split(" ");
    let same = 0;
    const n = Math.min(aw.length, tw.length);
    for (let i = 0; i < n; i += 1) {
      if (aw[i] === tw[i]) same += 1;
      else break;
    }
    const prefix = t.startsWith(a) ? 20 : 0;
    return Math.min(99, Math.round((same / Math.max(1, tw.length)) * 100) + prefix);
  }

  function buildBossQuestions(SG, stateObj, pool, chapterItems, opts) {
    const modes = Object.keys(SG.QUIZ_MODES || {}).filter(mode => {
      if (mode === "translation") return pool.some(x => x.translation);
      if (mode === "order") return chapterItems.length > 1;
      return true;
    });
    const count = opts.fullChapter ? Math.min(pool.length, 40) : Math.min(pool.length, Math.max(8, opts.count || 20));
    const questions = [];
    let guard = 0;
    while (questions.length < count && guard < count * 4) {
      const mode = modes[guard % modes.length] || "devanagari";
      const built = SG.buildQuizSession(stateObj, pool, chapterItems, {
        mode,
        count: 1,
        priority: opts.priority || "smart",
      }).filter(Boolean);
      if (built[0]) questions.push({ ...built[0], bossMode: mode });
      guard += 1;
    }
    return SG.shuffle ? SG.shuffle(questions).slice(0, count) : questions.slice(0, count);
  }

  async function renderMemGame(cfg) {
    const sk = cfg.stateKey;
    const SG = cfg.getApi();
    if (!SG) {
      renderShell(`<div class="pad"><h2>${esc(cfg.unavailableTitle)}</h2><p class="muted">Game module failed to load. Reinstall the latest APK.</p>
        <button type="button" class="btn btn-gold" id="btnBackMore">Back</button></div>`, {
        title: cfg.pageTitle, tab: "more",
        bind: () => document.getElementById("btnBackMore")?.addEventListener("click", () => navigate("more")),
      });
      return;
    }
    SG.ensureGameState(state);
    const chapterId = state.params.parts[1] || state[sk].lastChapter || cfg.defaultChapter;
    const book = await loadBook(SG.BOOK_ID);
    const chapters = SG.chapterMeta(book);
    const allItems = cfg.extractItems(SG, book);
    const isAllChapters = chapterId === "all";
    const chapterItems = cfg.filterPool(allItems, chapterId, chapters);
    const session = state[sk].session;
    const g = state[sk];

    function poolForChapter(ch) {
      return cfg.filterPool(allItems, ch, chapters);
    }

    function startGame(opts) {
      const ch = opts.chapterId || chapterId;
      const allCh = opts.allChapters || ch === "all";
      const pool = poolForChapter(allCh ? "all" : ch);
      if (!pool.length) return alert(cfg.emptyPoolMsg || "No items in this selection.");
      const gameType = opts.gameType || g.lastGameType || "flashcards";
      state[sk].lastChapter = allCh ? "all" : ch;
      state[sk].lastGameType = gameType;
      state[sk].lastPriority = opts.priority || g.lastPriority || "smart";
      if (gameType === "flashcards") {
        const flashFront = opts.flashFront || g.flashFront || "number";
        state[sk].flashFront = flashFront;
        const deck = SG.buildFlashDeck(state, pool, opts);
        state[sk].session = {
          phase: "flash",
          gameType,
          chapterId: allCh ? "all" : ch,
          deck,
          idx: 0,
          flipped: false,
          known: 0,
          learning: 0,
          flashFront,
        };
      } else if (gameType === "memory") {
        const pairCount = Math.min(8, Math.max(3, opts.pairCount || 6), pool.length);
        state[sk].session = {
          phase: "memory",
          gameType,
          chapterId: allCh ? "all" : ch,
          cards: SG.buildMemoryBoard(state, pool, pairCount),
          picks: [],
          moves: 0,
          pairs: 0,
          pairTotal: pairCount,
        };
      } else if (gameType === "typing") {
        const deck = SG.buildFlashDeck(state, pool, {
          count: opts.fullChapter ? pool.length : Math.min(pool.length, opts.count || 15),
          priority: opts.priority || "smart",
          fullChapter: opts.fullChapter,
        });
        state[sk].session = {
          phase: "typing",
          gameType,
          chapterId: allCh ? "all" : ch,
          deck,
          idx: 0,
          correct: 0,
          streak: 0,
          bestStreak: 0,
        };
      } else if (gameType === "boss") {
        const questions = buildBossQuestions(SG, state, pool, chapterItems, {
          count: opts.count || 20,
          priority: opts.priority || "smart",
          fullChapter: opts.fullChapter,
        });
        if (!questions.length) return alert("No boss rush questions for this selection.");
        state[sk].lastSpeed = true;
        state[sk].session = {
          phase: "play",
          gameType: "boss",
          chapterId: allCh ? "all" : ch,
          mode: "boss",
          questions,
          idx: 0,
          correct: 0,
          streak: 0,
          bestStreak: 0,
          speed: true,
        };
      } else {
        const questions = SG.buildQuizSession(state, pool, chapterItems, {
          mode: opts.quizMode || g.lastQuizMode || "devanagari",
          count: opts.fullChapter ? pool.length : opts.count || 15,
          priority: opts.priority || "smart",
          fullChapter: opts.fullChapter,
        });
        if (!questions.length) return alert("No quiz questions for this selection.");
        state[sk].lastQuizMode = opts.quizMode || g.lastQuizMode || "devanagari";
        state[sk].lastSpeed = !!opts.speed;
        state[sk].session = {
          phase: "play",
          gameType: "quiz",
          chapterId: allCh ? "all" : ch,
          mode: state[sk].lastQuizMode,
          questions,
          idx: 0,
          correct: 0,
          streak: 0,
          bestStreak: 0,
          speed: !!opts.speed,
        };
      }
      saveState();
      renderMemGame(cfg);
    }

    if (session?.phase === "flash") {
      const s = session.deck[session.idx];
      if (!s) {
        session.phase = "result";
        session.resultLabel = `Reviewed ${session.known + session.learning} cards · ${session.known} known`;
        saveState();
        return renderMemGame(cfg);
      }
      const front = session.flashFront || "number";
      const idLabel = s.displayNum || s.id;
      const frontHtml = front === "devanagari"
        ? `<p class="sutra-visual-dev sutra-flash-big">${esc(s.devanagari || "?")}</p>`
        : front === "roman"
          ? `<p class="sutra-visual-roman sutra-flash-big">${esc(s.romanLine)}</p>`
          : `<p class="sutra-flash-num">${esc(idLabel)}</p><p class="muted sutra-flash-hint">${esc(cfg.flashHint || "Tap to reveal")}</p>`;
      const backHtml = renderSutraVisualCard(s);
      let body = `<section class="sutra-game-play">
        <p class="sutra-game-meta">Card ${session.idx + 1} / ${session.deck.length} · ✓ ${session.known} · ↻ ${session.learning}</p>
        <div class="reader-progress"><div class="reader-progress-fill" style="width:${Math.round((session.idx / session.deck.length) * 100)}%"></div></div>
        <div class="sutra-flash-wrap">
          <button type="button" class="sutra-flash-card${session.flipped ? " flipped" : ""}" id="btnFlipSutra">
            <div class="sutra-flash-face sutra-flash-front">${frontHtml}</div>
            <div class="sutra-flash-face sutra-flash-back">${backHtml}</div>
          </button>
        </div>
        <div class="sutra-flash-actions ${session.flipped ? "" : "hidden"}" id="flashActions">
          <button type="button" class="btn btn-ghost" id="btnFlashLearning">Still learning</button>
          <button type="button" class="btn btn-gold" id="btnFlashKnown">Know it</button>
        </div>
        <div class="sutra-game-play-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="btnSutraSpeak">🔊</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnQuitSutraGame">Quit</button>
        </div>
      </section>`;
      renderShell(body, {
        title: "Flash cards",
        tab: "more",
        bind: () => {
          document.getElementById("btnFlipSutra")?.addEventListener("click", () => {
            session.flipped = !session.flipped;
            document.getElementById("btnFlipSutra")?.classList.toggle("flipped", session.flipped);
            document.getElementById("flashActions")?.classList.toggle("hidden", !session.flipped);
          });
          const advance = ok => {
            SG.markMastered(state, session.chapterId, s.id, ok);
            if (ok) session.known += 1;
            else session.learning += 1;
            session.idx += 1;
            session.flipped = false;
            saveState();
            renderMemGame(cfg);
          };
          document.getElementById("btnFlashKnown")?.addEventListener("click", () => advance(true));
          document.getElementById("btnFlashLearning")?.addEventListener("click", () => advance(false));
          document.getElementById("btnQuitSutraGame")?.addEventListener("click", () => {
            state[sk].session = null;
            saveState();
            renderMemGame(cfg);
          });
          document.getElementById("btnSutraSpeak")?.addEventListener("click", async () => {
            if (!window.AmpsAudio?.isSupported?.()) return;
            window.AmpsAudio.prime?.();
            await window.AmpsAudio.speakParagraphs([cfg.speakText(s)], ["s"], effectiveSpeechRate("normal"), () => {}, normalizeTtsVoice(state.settings.ttsVoice), 0, null, sanskritPronunciationMode());
          });
        },
      });
      return;
    }

    if (session?.phase === "typing") {
      const s = session.deck[session.idx];
      if (!s) {
        session.phase = "result";
        const pct = session.deck.length ? Math.round((session.correct / session.deck.length) * 100) : 0;
        SG.recordScore(state, session.chapterId, session.correct, session.deck.length, session.bestStreak);
        session.resultLabel = `${session.correct} / ${session.deck.length} typed correctly · Best streak ${session.bestStreak || 0}`;
        session.correctPct = pct;
        saveState();
        return renderMemGame(cfg);
      }
      const pct = Math.round((session.idx / session.deck.length) * 100);
      let body = `<section class="sutra-game-play">
        <p class="sutra-game-meta">Typing ${session.idx + 1} / ${session.deck.length} · Score ${session.correct}${session.streak > 1 ? ` · Streak ${session.streak}` : ""}</p>
        <div class="reader-progress"><div class="reader-progress-fill" style="width:${pct}%"></div></div>
        <p class="sutra-quiz-prompt">Type the Roman line from memory</p>
        ${renderSutraVisualCard({ ...s, hideRoman: true })}
        <textarea id="sutraTypingAnswer" class="sutra-typing-input" rows="3" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Type Roman transliteration..."></textarea>
        <div id="sutraTypingFeedback" class="sutra-game-feedback hidden"></div>
        <div class="sutra-game-play-actions">
          <button type="button" class="btn btn-gold" id="btnTypingCheck">Check</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnTypingShow">Show</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnQuitSutraGame">Quit</button>
        </div>
      </section>`;
      renderShell(body, {
        title: "Typing challenge",
        tab: "more",
        bind: () => {
          const input = document.getElementById("sutraTypingAnswer");
          input?.focus();
          const advance = ok => {
            SG.markMastered(state, session.chapterId, s.id, ok);
            if (ok) {
              session.correct += 1;
              session.streak += 1;
              session.bestStreak = Math.max(session.bestStreak || 0, session.streak);
            } else {
              session.streak = 0;
            }
            setTimeout(() => {
              session.idx += 1;
              session.locked = false;
              saveState();
              renderMemGame(cfg);
            }, ok ? 750 : 1600);
          };
          document.getElementById("btnTypingCheck")?.addEventListener("click", () => {
            if (session.locked) return;
            session.locked = true;
            const score = typingMatchScore(input?.value || "", s.roman || s.romanLine);
            const ok = score >= 82;
            const fb = document.getElementById("sutraTypingFeedback");
            if (fb) {
              fb.classList.remove("hidden");
              fb.innerHTML = `${ok ? `<p class="ok">Correct enough · ${score}%</p>` : `<p class="bad">Needs review · ${score}%</p>`}
                <div class="sutra-answer-reveal">${renderSutraVisualCard(s)}</div>`;
            }
            advance(ok);
          });
          document.getElementById("btnTypingShow")?.addEventListener("click", () => {
            const fb = document.getElementById("sutraTypingFeedback");
            if (fb) {
              fb.classList.remove("hidden");
              fb.innerHTML = `<p class="bad">Review this one:</p><div class="sutra-answer-reveal">${renderSutraVisualCard(s)}</div>`;
            }
          });
          document.getElementById("btnQuitSutraGame")?.addEventListener("click", () => {
            state[sk].session = null;
            saveState();
            renderMemGame(cfg);
          });
        },
      });
      return;
    }

    if (session?.phase === "memory") {
      const done = session.pairs >= session.pairTotal;
      if (done) {
        session.phase = "result";
        session.resultLabel = `Matched all ${session.pairTotal} pairs in ${session.moves} moves`;
        saveState();
        return renderMemGame(cfg);
      }
      let body = `<section class="sutra-game-play">
        <p class="sutra-game-meta">Pairs ${session.pairs} / ${session.pairTotal} · Moves ${session.moves}</p>
        <div class="sutra-memory-grid">
          ${session.cards.map(c => `
            <button type="button" class="sutra-memory-card${c.open || c.matched ? " open" : ""}${c.matched ? " matched" : ""}${c.kind === "devanagari" && (c.open || c.matched) ? " dev-face" : ""}" data-card="${esc(c.cardId)}" ${c.matched ? "disabled" : ""}>
              ${c.open || c.matched
                ? (c.kind === "devanagari"
                  ? `<span class="sutra-memory-dev">${esc(c.text)}</span>`
                  : `<span class="sutra-memory-roman">${esc(c.text)}</span>`)
                : `<span class="sutra-memory-back">${esc(c.short)}</span>`}
            </button>`).join("")}
        </div>
        <button type="button" class="btn btn-ghost btn-sm" id="btnQuitSutraGame">Quit</button>
      </section>`;
      renderShell(body, {
        title: "Memory match",
        tab: "more",
        bind: () => {
          document.getElementById("btnQuitSutraGame")?.addEventListener("click", () => {
            state[sk].session = null;
            saveState();
            renderMemGame(cfg);
          });
          document.querySelectorAll(".sutra-memory-card:not([disabled])").forEach(btn => {
            btn.addEventListener("click", () => {
              if (session.picks.length >= 2) return;
              const card = session.cards.find(c => c.cardId === btn.dataset.card);
              if (!card || card.matched || card.open) return;
              card.open = true;
              session.picks.push(card.cardId);
              if (session.picks.length === 2) {
                session.moves += 1;
                const [a, b] = session.picks.map(id => session.cards.find(c => c.cardId === id));
                if (a.sutraId === b.sutraId && a.kind !== b.kind) {
                  a.matched = b.matched = true;
                  session.pairs += 1;
                  SG.markMastered(state, session.chapterId, a.sutraId, true);
                  session.picks = [];
                  setTimeout(() => renderMemGame(cfg), 500);
                } else {
                  setTimeout(() => {
                    a.open = b.open = false;
                    session.picks = [];
                    SG.markMastered(state, session.chapterId, a.sutraId, false);
                    renderMemGame(cfg);
                  }, 900);
                }
                saveState();
                if (a.matched) renderMemGame(cfg);
              } else {
                saveState();
                renderMemGame(cfg);
              }
            });
          });
        },
      });
      return;
    }

    if (session?.phase === "play") {
      const q = session.questions[session.idx];
      if (!q) {
        session.phase = "result";
        SG.recordScore(state, session.chapterId, session.correct, session.questions.length, session.bestStreak);
        saveState();
        return renderMemGame(cfg);
      }
      const pct = Math.round((session.idx / session.questions.length) * 100);
      let body = `<section class="sutra-game-play">
        <p class="sutra-game-meta">${session.idx + 1} / ${session.questions.length} · ${esc(session.gameType === "boss" ? "Boss rush" : (SG.QUIZ_MODES[session.mode]?.label || session.mode))}
          · Score ${session.correct}${session.streak > 1 ? ` · 🔥 ${session.streak}` : ""}</p>
        <div class="reader-progress"><div class="reader-progress-fill" style="width:${pct}%"></div></div>
        <p class="sutra-quiz-prompt">${esc(q.prompt)}</p>
        ${renderSutraVisualCard(q.visual || q.target, { hideRoman: q.visual?.hideRoman, hideDev: q.visual?.hideDev })}
        <div class="sutra-game-options" id="sutraGameOptions">
          ${q.options.map((o, i) =>
            `<button type="button" class="sutra-game-opt${o.dev ? " sutra-opt-dev" : ""}" data-i="${i}">${esc(o.label)}</button>`
          ).join("")}
        </div>
        <div id="sutraGameFeedback" class="sutra-game-feedback hidden"></div>
        <div class="sutra-game-play-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="btnSutraSpeak">🔊</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnQuitSutraGame">Quit</button>
        </div>
      </section>`;
      renderShell(body, {
        title: session.gameType === "boss" ? "Boss rush" : cfg.pageTitle,
        tab: "more",
        bind: () => {
          document.getElementById("btnQuitSutraGame")?.addEventListener("click", () => {
            state[sk].session = null;
            saveState();
            renderMemGame(cfg);
          });
          document.getElementById("btnSutraSpeak")?.addEventListener("click", async () => {
            if (!window.AmpsAudio?.isSupported?.()) return;
            window.AmpsAudio.prime?.();
            await window.AmpsAudio.speakParagraphs(
              [cfg.speakText(q.target)],
              ["mem-speak"],
              effectiveSpeechRate("normal"),
              () => {},
              normalizeTtsVoice(state.settings.ttsVoice),
              0,
              null,
              sanskritPronunciationMode()
            );
          });
          document.querySelectorAll(".sutra-game-opt").forEach(btn => {
            btn.addEventListener("click", () => {
              if (session.locked) return;
              session.locked = true;
              const pick = q.options[+btn.dataset.i];
              const ok = !!pick.correct;
              if (ok) {
                session.correct += 1;
                session.streak += 1;
                session.bestStreak = Math.max(session.bestStreak || 0, session.streak);
              } else {
                session.streak = 0;
              }
              SG.markMastered(state, session.chapterId, q.target.id, ok);
              document.querySelectorAll(".sutra-game-opt").forEach(el => {
                el.disabled = true;
                const opt = q.options[+el.dataset.i];
                el.classList.toggle("correct", !!opt.correct);
                el.classList.toggle("wrong", el === btn && !ok);
              });
              const fb = document.getElementById("sutraGameFeedback");
              if (fb && !session.speed) {
                fb.classList.remove("hidden");
                fb.innerHTML = ok
                  ? `<p class="ok">✓</p>${renderSutraVisualCard(q.target)}`
                  : `<p class="bad">Correct:</p>${renderSutraVisualCard(q.target)}
                     <button type="button" class="btn btn-ghost btn-sm" id="btnReadSutra">Read in book</button>`;
                document.getElementById("btnReadSutra")?.addEventListener("click", () => cfg.readNav(q.target));
              }
              const delay = session.speed ? (ok ? 450 : 900) : (ok ? 650 : 1500);
              setTimeout(() => {
                session.idx += 1;
                session.locked = false;
                saveState();
                renderMemGame(cfg);
              }, delay);
            });
          });
        },
      });
      return;
    }

    if (session?.phase === "result") {
      const resCh = session.chapterId || chapterId;
      const resIsAll = resCh === "all";
      const resItems = cfg.filterPool(allItems, resCh, chapters);
      const prog = resIsAll
        ? { mastered: chapters.reduce((n, c) => n + (g.scores[c.id]?.mastered?.length || 0), 0), total: allItems.length, pct: allItems.length ? Math.round((chapters.reduce((n, c) => n + (g.scores[c.id]?.mastered?.length || 0), 0) / allItems.length) * 100) : 0 }
        : SG.chapterProgress(state, resCh, resItems.length);
      const pct = session.correctPct != null
        ? session.correctPct
        : session.questions?.length ? Math.round((session.correct / session.questions.length) * 100)
        : null;
      let body = `<section class="hero hero-compact sutra-game-result">
        <h1>Well done!</h1>
        ${pct != null ? `<p class="result-pct">${pct}%</p>` : ""}
        <p class="hero-sub">${session.resultLabel || `${session.correct || 0} / ${session.questions?.length || 0} correct`} · Mastery ${prog.pct}% (${prog.mastered}/${prog.total})</p>
        <button type="button" class="btn btn-gold" id="btnSutraAgain">Play again</button>
        <button type="button" class="btn btn-ghost" id="btnSutraHome">Choose game</button>
      </section>`;
      renderShell(body, {
        title: cfg.pageTitle,
        tab: "more",
        bind: () => {
          document.getElementById("btnSutraAgain")?.addEventListener("click", () => {
            state[sk].session = null;
            saveState();
            startGame({
              chapterId: session.chapterId,
              allChapters: session.chapterId === "all",
              gameType: session.gameType,
              quizMode: session.mode,
              fullChapter: session.gameType === "flashcards",
              pairCount: session.pairTotal,
              flashFront: session.flashFront,
            });
          });
          document.getElementById("btnSutraHome")?.addEventListener("click", () => {
            state[sk].session = null;
            saveState();
            renderMemGame(cfg);
          });
        },
      });
      return;
    }

    const gameType = g.lastGameType || "flashcards";
    const quizMode = g.lastQuizMode || "devanagari";
    const totalMastered = chapters.reduce((n, c) => n + (g.scores[c.id]?.mastered?.length || 0), 0);
    const prog = isAllChapters
      ? { mastered: totalMastered, total: allItems.length, pct: allItems.length ? Math.round((totalMastered / allItems.length) * 100) : 0 }
      : SG.chapterProgress(state, chapterId, chapterItems.length);
    const sample = cfg.sampleItem(allItems);
    let body = `<section class="hero hero-compact">
      <h1>${esc(cfg.heroTitle)}</h1>
      <p class="hero-sub">${esc(cfg.heroSub(allItems.length))}</p>
      <p class="muted sutra-sample">${esc(sample?.romanLine || "")}<br><span class="sutra-sample-dev">${esc(sample?.devanagari || "")}</span></p>
    </section>
    <div class="sutra-game-setup card-like">
      <p class="sutra-game-label">Choose game</p>
      <div class="sutra-game-types">
        ${Object.values(SG.GAME_TYPES).map(t =>
          `<button type="button" class="sutra-type-card${gameType === t.id ? " active" : ""}" data-gtype="${t.id}">
            <span class="sutra-type-icon">${t.icon}</span>
            <strong>${esc(t.label)}</strong>
            <small>${esc(t.hint)}</small>
          </button>`
        ).join("")}
      </div>
      <label class="sutra-game-label">${esc(cfg.rangeLabel || "Chapter")}
        <select id="sutraGameChapter">
          ${chapters.map(c => `<option value="${esc(c.id)}"${c.id === chapterId ? " selected" : ""}>${esc(c.title)} (${c.count})</option>`).join("")}
        </select>
      </label>
      <p class="muted sutra-game-ch-meta">Mastery ${prog.pct}% (${prog.mastered}/${prog.total}) · ${totalMastered} mastered overall</p>
      <div id="sutraGameOptionsPanel">
        ${gameType === "flashcards" ? `
          <label class="sutra-game-label">Card front
            <select id="sutraFlashFront">
              <option value="number"${g.flashFront === "number" ? " selected" : ""}>${esc(cfg.numberLabel || "Number only")}</option>
              <option value="roman"${g.flashFront === "roman" ? " selected" : ""}>Roman line</option>
              <option value="devanagari"${g.flashFront === "devanagari" ? " selected" : ""}>Devanagari line</option>
            </select>
          </label>` : ""}
        ${gameType === "memory" ? `
          <label class="sutra-game-label">Pairs
            <input type="number" id="sutraPairCount" min="3" max="8" value="6" />
          </label>` : ""}
        ${gameType === "quiz" ? `
          <div class="sutra-game-modes">
            ${Object.values(SG.QUIZ_MODES).map(m =>
              `<button type="button" class="btn btn-sm btn-ghost sutra-quiz-mode${quizMode === m.id ? " active" : ""}" data-qmode="${m.id}">${esc(m.label)}</button>`
            ).join("")}
          </div>
          <label class="check-row"><input type="checkbox" id="sutraGameSpeed" ${g.lastSpeed !== false ? "checked" : ""} /> Speed mode</label>` : ""}
        ${gameType === "typing" ? `
          <p class="muted">You must type the Roman line from memory. Minor diacritic differences are accepted.</p>` : ""}
        ${gameType === "boss" ? `
          <p class="muted">Boss rush mixes all available quiz modes and runs in speed mode. Great for final mastery checks.</p>` : ""}
      </div>
      <div class="sutra-game-start-row">
        <button type="button" class="btn btn-gold" id="btnStartSutraGame">Start</button>
        <button type="button" class="btn btn-ghost" id="btnFullChapter">${esc(cfg.fullBtnLabel(gameType))}</button>
      </div>
    </div>`;

    renderShell(body, {
      title: cfg.pageTitle,
      tab: "more",
      bind: () => {
        const getSetup = () => {
          const ch = document.getElementById("sutraGameChapter")?.value || chapterId;
          const chPool = poolForChapter(ch === "all" ? "all" : ch);
          return {
            chapterId: ch,
            allChapters: ch === "all",
            gameType: state[sk].lastGameType || "flashcards",
            quizMode: state[sk].lastQuizMode || "devanagari",
            flashFront: document.getElementById("sutraFlashFront")?.value || "number",
            pairCount: +(document.getElementById("sutraPairCount")?.value || 6),
            count: chPool.length,
            priority: "smart",
            speed: !!document.getElementById("sutraGameSpeed")?.checked,
          };
        };
        document.querySelectorAll(".sutra-type-card").forEach(btn => {
          btn.addEventListener("click", () => {
            state[sk].lastGameType = btn.dataset.gtype;
            saveState();
            renderMemGame(cfg);
          });
        });
        document.getElementById("sutraGameChapter")?.addEventListener("change", e => {
          state[sk].lastChapter = e.target.value;
          state.params.parts[1] = e.target.value;
          saveState();
          renderMemGame(cfg);
        });
        document.querySelectorAll(".sutra-quiz-mode").forEach(btn => {
          btn.addEventListener("click", () => {
            state[sk].lastQuizMode = btn.dataset.qmode;
            saveState();
            renderMemGame(cfg);
          });
        });
        document.getElementById("btnStartSutraGame")?.addEventListener("click", () => startGame(getSetup()));
        document.getElementById("btnFullChapter")?.addEventListener("click", () => {
          const setup = getSetup();
          if (setup.gameType === "memory") {
            startGame({ ...setup, pairCount: Math.min(8, poolForChapter(setup.allChapters ? "all" : setup.chapterId).length) });
          } else {
            startGame({ ...setup, fullChapter: true, count: poolForChapter(setup.allChapters ? "all" : setup.chapterId).length });
          }
        });
      },
    });
  }

  function renderSutraGame() {
    return renderMemGame({
      stateKey: "sutraGame",
      getApi: () => window.AmpsSutraGame,
      defaultChapter: "ch2",
      unavailableTitle: "Sútra game unavailable",
      pageTitle: "Sútra game",
      heroTitle: "Ánanda Sútram",
      heroSub: n => `Memorize all ${n} Samskrta sútras · Roman + Devanagari`,
      rangeLabel: "Chapter",
      numberLabel: "Sútra number only",
      flashHint: "Tap to reveal sútra",
      fullBtnLabel: gt => (gt === "memory" ? "8 pairs" : "All sútras"),
      extractItems: (SG, book) => SG.extractSutras(book),
      filterPool(all, chId) {
        if (chId === "all") return all;
        return all.filter(s => s.chapterId === chId);
      },
      sampleItem: all => all[0],
      speakText: s => s.roman,
      readNav: t => navigate("read", { bookId: "ananda-sutram", chapterId: t.chapterId, paraId: t.paraId }),
    });
  }

  function renderShlokaGame() {
    return renderMemGame({
      stateKey: "shlokaGame",
      getApi: () => window.AmpsShlokaGame,
      defaultChapter: "b1",
      unavailableTitle: "Shloka game unavailable",
      pageTitle: "Shloka game",
      heroTitle: "Samskrta Shloka",
      heroSub: n => `${n} sacred verses · Roman + Devanagari`,
      rangeLabel: "Verse range",
      numberLabel: "Verse number only",
      flashHint: "Tap to reveal verse",
      fullBtnLabel: gt => (gt === "memory" ? "8 pairs" : "Full range"),
      extractItems: (SG, book) => SG.extractShlokas(book),
      filterPool: (all, chId, chapters) => window.AmpsShlokaGame.filterPool(all, chId, chapters),
      sampleItem: all => all[0],
      speakText: s => s.romanFull || s.roman,
      readNav: t => navigate("read", { bookId: "samskrta-shloka", chapterId: t.chapterId, paraId: t.paraId }),
    });
  }

  function customStudyCardsSection() {
    return window.AmpsProductivity?.customStudyCardsSectionHtml?.() || "";
  }

  async function renderUserStudyReview() {
    return window.AmpsProductivity?.renderUserStudyReview?.();
  }

  async function renderStudy() {
    if (state.userStudySession) {
      await renderUserStudyReview();
      return;
    }
    const bookId = state.params.parts[1];
    if (!bookId) {
      const books = (state.catalog.books || []).filter(b => b.pointCount > 0).slice(0, 50);
      let body = `<section class="hero hero-compact"><h1>Text Study</h1>
        <p class="hero-sub">Spaced repetition recall — choose a book</p></section><div class="book-grid">`;
      books.forEach(b => {
        body += bookCard(b, null);
      });
      body += `</div>`;
      renderShell(body, {
        title: "Study",
        tab: "study",
        bind: () => {
          document.querySelectorAll("[data-book]").forEach(el => {
            if (el.dataset.ch) return;
            el.addEventListener("click", () => navigate("study", { bookId: el.dataset.book }));
          });
        },
      });
      return;
    }

    const book = await loadBook(bookId);
    AmpsStudy.ensureCards(state, book);
    state._studyBookPoints = state._studyBookPoints || {};
    state._studyBookPoints[bookId] = AmpsStudy.indexBookPoints(book);
    const stats = AmpsStudy.studyStats(state, bookId, book);
    const session = state.study.session;
    const setup = session?.bookId === bookId ? null : (state.study.setup || { mode: "due", sectionId: "", limit: 25 });

    if (!session || session.bookId !== bookId) {
      const dueCount = AmpsStudy.dueCards(state, bookId, setup?.sectionId || null).length;
      const newCount = AmpsStudy.newCards(state, bookId, setup?.sectionId || null).length;
      const sectionOpts = (book.sections || []).map(sec =>
        `<option value="${esc(sec.id)}"${setup?.sectionId === sec.id ? " selected" : ""}>${esc(sec.title)}</option>`
      ).join("");
      let body = `<section class="hero hero-compact"><h1>${esc(book.title)}</h1>
        <p class="hero-sub">Spaced repetition — ${stats.total} study points</p>
        <div class="study-stats">
          <div class="study-stat"><strong>${stats.due}</strong><span>Due now</span></div>
          <div class="study-stat"><strong>${stats.new}</strong><span>New</span></div>
          <div class="study-stat"><strong>${stats.learning}</strong><span>Learning</span></div>
          <div class="study-stat"><strong>${stats.mature}</strong><span>Mature</span></div>
        </div>
        <div class="study-setup">
          <label>Chapter / section
            <select id="studySection">
              <option value="">All sections</option>
              ${sectionOpts}
            </select>
          </label>
          <div class="study-mode-row">
            <button type="button" class="btn btn-sm btn-ghost study-mode${setup?.mode === "due" ? " active" : ""}" data-mode="due">Due (${dueCount})</button>
            <button type="button" class="btn btn-sm btn-ghost study-mode${setup?.mode === "new" ? " active" : ""}" data-mode="new">New (${newCount})</button>
            <button type="button" class="btn btn-sm btn-ghost study-mode${setup?.mode === "cram" ? " active" : ""}" data-mode="cram">Review all</button>
          </div>
          <label>Cards per session
            <input type="number" id="studyLimit" min="5" max="50" value="${setup?.limit || 25}" />
          </label>
          <button type="button" class="btn btn-gold" id="btnStartStudy">Start session</button>
        </div>
        ${customStudyCardsSection()}
        </section>`;
      renderShell(body, {
        title: "Study",
        tab: "study",
        bind: () => {
          const getSetup = () => ({
            mode: state.study.setup?.mode || "due",
            sectionId: document.getElementById("studySection")?.value || "",
            limit: Math.min(50, Math.max(5, +(document.getElementById("studyLimit")?.value || 25))),
          });
          document.querySelectorAll(".study-mode").forEach(btn => {
            btn.addEventListener("click", () => {
              state.study.setup = { ...getSetup(), mode: btn.dataset.mode };
              renderStudy();
            });
          });
          document.getElementById("studySection")?.addEventListener("change", () => {
            state.study.setup = getSetup();
            renderStudy();
          });
          document.getElementById("btnStartStudy")?.addEventListener("click", () => {
            const cfg = getSetup();
            state.study.setup = cfg;
            const queue = AmpsStudy.buildStudyQueue(state, bookId, book, cfg);
            if (!queue.length) return alert("No cards available for this mode and section.");
            state.study.session = { bookId, queue, idx: 0, revealed: false, mode: cfg.mode, sectionId: cfg.sectionId || null };
            saveState();
            renderStudy();
          });
          window.AmpsProductivity?.bindCustomStudyButtons?.();
        },
      });
      return;
    }

    const key = session.queue[session.idx];
    const pointN = +key.split("|p|")[1];
    const point = book.points.find(p => p.n === pointN);
    if (!point) {
      state.study.session = null;
      saveState();
      return renderStudy();
    }

    const summaryCacheKey = bookId + "|" + pointN;
    const summaryLines = (state.settings.lang === "hi" && session.summaryHiKey === summaryCacheKey && session.summaryHi)
      ? session.summaryHi
      : (point.summary || []);
    const sectionTitle = book.sections?.find(s => s.id === point.section)?.title || point.section;

    let body = `<div class="study-card">
      <p class="study-meta">${session.idx + 1} / ${session.queue.length} · ${esc(sectionTitle)}</p>
      <h2 class="study-prompt">${esc(point.prompt)}</h2>
      <div class="study-answer ${session.revealed ? "show" : ""}">
        <h3>${esc(point.title)}</h3>
        <ul id="studySummaryList">${summaryLines.map(s => `<li>${esc(s)}</li>`).join("")}</ul>
        <p class="study-body">${esc(point.body)}</p>
        <button type="button" class="btn btn-ghost btn-sm" id="btnStudyReadContext">Read in context</button>
      </div>
      ${!session.revealed
        ? `<button type="button" class="btn btn-gold" id="btnReveal">Reveal answer</button>`
        : `<div class="study-ratings">
            <button type="button" class="rate again" data-rate="again">Again</button>
            <button type="button" class="rate hard" data-rate="hard">Hard</button>
            <button type="button" class="rate good" data-rate="good">Good</button>
            <button type="button" class="rate easy" data-rate="easy">Easy</button>
          </div>`}
      <button type="button" class="btn btn-ghost btn-sm" id="btnEndStudy" style="margin-top:1rem">End session</button>
    </div>`;

    renderShell(body, {
      title: "Study",
      tab: "study",
      bind: () => {
        document.getElementById("btnReveal")?.addEventListener("click", () => {
          session.revealed = true;
          saveState();
          renderStudy();
        });
        document.getElementById("btnEndStudy")?.addEventListener("click", () => {
          state.study.session = null;
          saveState();
          renderStudy();
        });
        document.getElementById("btnStudyReadContext")?.addEventListener("click", () => {
          const target = AmpsStudy.pointReadTarget(book, point);
          if (!target) return alert("Could not locate this passage in the book.");
          navigate("read", target);
        });
        if (session.revealed && state.settings.lang === "hi" && window.AmpsTranslate
            && session.summaryHiKey !== summaryCacheKey) {
          window.AmpsTranslate.localizeSummaries(point.summary || []).then(hi => {
            session.summaryHi = hi;
            session.summaryHiKey = summaryCacheKey;
            saveState();
            const ul = document.getElementById("studySummaryList");
            if (ul) ul.innerHTML = hi.map(s => `<li>${esc(s)}</li>`).join("");
          }).catch(() => { /* keep English */ });
        }
        document.querySelectorAll("[data-rate]").forEach(btn => {
          btn.addEventListener("click", () => {
            const card = state.study.cards[key];
            AmpsStudy.rateCard(card, btn.dataset.rate);
            session.idx += 1;
            session.revealed = false;
            session.summaryHi = null;
            session.summaryHiKey = null;
            if (session.idx >= session.queue.length) state.study.session = null;
            saveState();
            renderStudy();
          });
        });
      },
    });
  }

  let enrichParagraph = null;

  function fnApi() {
    return window.AmpsFootnotes;
  }

  function linkParaFootnotes(text, ch) {
    const api = fnApi();
    if (!api || !ch?.footnotes?.length) return esc(text);
    return api.linkFootnoteRefs(text, ch, esc);
  }

  function renderChapterFootnotes(ch) {
    const api = fnApi();
    if (!api) return "";
    api.attachFootnoteRefParaIds(ch);
    return api.renderFootnotePanel(ch, esc, state.settings.showCommentary);
  }

  async function renderFromState() {
    const gen = nextRenderGen();
    try {
      if (!state.catalog) {
        document.getElementById("app").innerHTML = `<div class="loading"><div class="spinner"></div><p>Loading library…</p></div>`;
        await loadCatalog();
      }
      if (renderStale(gen)) return;
      document.documentElement.dataset.theme = state.settings.theme;

      if (window.AmpsLicense?.shouldGateRoute?.(state.route)) {
        return window.AmpsLicense.renderGatePage();
      }

      if (state.route !== "present") document.body.classList.remove("present-mode");
      if (state.route !== "read") window.AmpsReaderUI?.closeSheet?.();
      if (state.route === "presentation-builder") {
        if (!presentationBuilderEnabled()) {
          state.route = "library";
          state.params = {};
          history.replaceState(null, "", "#library");
          return renderLibrary();
        }
        return window.AmpsPresentation?.render?.();
      }
      switch (state.route) {
        case "book": return renderBook(gen);
        case "read": return renderRead(gen);
        case "present": return renderPresent();
        case "discourses": return renderDiscourses();
        case "search": return renderSearch();
        case "today": return window.AmpsModern?.renderToday?.();
        case "companion": return window.AmpsModern?.renderCompanion?.();
        case "smart-search": return window.AmpsModern?.renderSmartSearch?.();
        case "audio": return window.AmpsModern?.renderAudio?.();
        case "shloka-recorder":
          if (window.AmpsBuildFlags?.shlokaRecorder !== true) {
            alert("Shloka recording is not included in this build profile.");
            return navigate("more");
          }
          return window.AmpsShlokaRecorder?.renderStudio?.();
        case "voice-lab":
          if (window.AmpsBuildFlags?.shlokaRecorder !== true) {
            alert("Voice Lab microphone tools are not included in this build profile.");
            return navigate("more");
          }
          return window.AmpsModern?.renderVoiceLab?.();
        case "tools": return window.AmpsModern?.renderToolsDashboard?.();
        case "quote-maker": return window.AmpsModern?.renderQuoteMaker?.();
        case "teacher": return window.AmpsModern?.renderTeacher?.();
        case "backup": return window.AmpsModern?.renderBackup?.();
        case "qa-bank": return window.AmpsModern?.renderQaBank?.();
        case "exam": return window.AmpsModern?.renderExam?.();
        case "daily-challenge": return window.AmpsModern?.renderDailyChallenge?.();
        case "socratic-guide":
          if (window.AmpsSocratic?.renderGuide) return window.AmpsSocratic.renderGuide();
          return renderShell(`<section class="hero hero-compact"><h1>Socratic Guide</h1><p>The Socratic Guide module did not load. Please reinstall the latest APK.</p></section>`, { title: "Socratic Guide", tab: "more" });
        case "achievements": return window.AmpsModern?.renderAchievements?.();
        case "history": return window.AmpsModern?.renderHistory?.();
        case "validation-report": return window.AmpsModern?.renderValidationReport?.();
        case "offline-status":
        case "offline":
        case "downloads":
          return renderOfflineStatus();
        case "pronunciation": return window.AmpsPronunciation?.renderPage?.();
        case "concepts":
          if (state.params.parts[1]) return window.AmpsConcepts?.renderConceptPage?.(state.params.parts[1]);
          return window.AmpsConcepts?.renderIndexPage?.();
        case "ask":
        case "source-qa":
          return window.AmpsSourceQa?.renderPage?.({
            bookId: state.params.parts[1] || state.params.qBook || "",
            chapterId: state.params.parts[2] || "",
          });
        case "about": return window.AmpsModern?.renderAbout?.();
        case "privacy-data":
        case "privacy":
          return window.AmpsModern?.renderPrivacyData?.();
        case "paths": return renderPaths();
        case "notebook": return renderNotebook();
        case "highlights": return renderNotebook();
        case "notes": return renderNotebook();
        case "more": return renderMore();
        case "journal": return renderJournal();
        case "settings": return renderSettings();
        case "compare": return renderCompare();
        case "study": return renderStudy();
        case "sutra-game": return renderSutraGame();
        case "shloka-game": return renderShlokaGame();
        case "stats": return window.AmpsAdUI?.renderStats?.();
        case "glossary": return window.AmpsAdUI?.renderGlossary?.();
        case "collections": return window.AmpsAdUI?.renderCollections?.();
        case "import": return window.AmpsAdUI?.renderImport?.();
        case "plan": return window.AmpsEnhance?.renderReadingPlan?.();
        default: return renderLibrary();
      }
    } catch (err) {
      if (renderStale(gen)) return;
      window.__lastErr = err.stack || err.message;
      console.error("AMPS Reader load error:", err);
      document.getElementById("app").innerHTML = `<div class="pad">
        <h2>Could not load library</h2>
        <p class="muted">${esc(err.message || String(err))}</p>
        <p class="muted">Try a hard refresh (Cmd+Shift+R) or clear site data for localhost.</p>
        <button type="button" class="btn btn-gold" id="btnReloadApp">Reload</button>
        <button type="button" class="btn btn-ghost" id="btnClearApp">Clear saved data</button>
      </div>`;
      document.getElementById("btnReloadApp")?.addEventListener("click", () => location.reload());
      document.getElementById("btnClearApp")?.addEventListener("click", () => {
        localStorage.removeItem(STORAGE);
        localStorage.removeItem("amps-reader-v1");
        location.reload();
      });
    }
  }

  async function render() {
    parseRoute();
    return renderFromState();
  }

  loadState();
  applyReaderSettingsLive();
  window.AmpsLicense?.init?.({
    state, saveState, esc, renderFromState, navigate, renderShell,
  });
  window.AmpsReaderUI?.install?.({ esc, renderFromState, navigate, dispatchSheet: dispatchReaderSheetAction });
  bindContinuousReadingChrome();
  window.AmpsPronunciation?.install?.({ esc, renderShell, renderFromState, navigate });
  window.AmpsShlokaStudy?.install?.({ esc, renderFromState, saveState, state });
  window.AmpsSourceQa?.install?.({ esc, renderShell, renderFromState, navigate, loadBook, readerAssetUrl, state });
  window.AmpsConcepts?.install?.({ esc, renderShell, navigate, readerAssetUrl });
  window.AmpsTtsDiag?.install?.({ esc, state });
  const enhanceApi = {
    state, saveState, navigate, loadBook, loadCatalog, render, renderFromState, esc, uid, bookById, renderShell, HL_COLORS,
    ttsVoiceSelectHtml, ttsPronunciationSelectHtml, bindTtsVoiceSelect, bindTtsPronunciationSelect,
    sanskritPronunciationMode, effectiveSpeechRate, sanskritSpeechRateSelectHtml, bindSanskritSpeechRateSelect,
    enableSanskritPronunciationIfOff,
    applyTtsPlaybackRate,
  };
  window.AmpsEnhance?.install(enhanceApi);
  window.AmpsModern?.install(enhanceApi);
  window.AmpsProductivity?.install?.({
    ...enhanceApi,
    startReaderAudio,
    pauseReaderAudio,
    resumeReaderAudio,
    stopTtsPlayback,
    dispatchSheet: dispatchReaderSheetAction,
  });
  window.AmpsSocratic?.install(enhanceApi);
  enrichParagraph = enhanceApi.enrichParagraph || null;
  window.AmpsAdUI?.install({
    state, saveState, loadState, navigate, loadBook, loadCatalog, render, renderFromState, esc, uid, bookById, renderShell, HL_COLORS,
  });
  window.AmpsPresentation?.install({
    state, saveState, navigate, loadBook, loadCatalog, esc, renderShell, bookById,
    discoursePdfAllowed: isDiscoursePdfAllowed,
    premiumLicensed: () => window.AmpsLicense?.isLicensed?.() !== false,
  });
  initShlokaCollapsibleClickGuard();
  initClickDelegation();
  initReaderToolbarUi();
  initTtsVoiceUi();
  initTtsRateControls();
  initTtsPauseControls();
  initChapterActionsUi();
  initShlokaScriptDelegation();
  window.AmpsShlokaBookEditor?.install?.({
    clearBookCache: () => {
      delete state.bookCache["samskrta-shloka"];
      state.shlokaBySourceKey = null;
      state.shlokaSourceIndex = null;
      shlokaEntriesPromise = null;
      shlokaIndexPromise = null;
    },
    rebuildSourceIndexes: rebuildShlokaSourceIndexesFromBook,
  });
  window.AmpsShlokaRecorder?.install?.({
    esc, renderShell, loadBook, state, saveState, navigate,
    renderShlokaBody: p => renderShlokaBody(p, { inline: true }),
    renderShlokaScriptsOnly,
    renderShlokaMeaningOnly,
    renderShlokaSources,
    renderShlokaScriptSelect: () => renderShlokaScriptSelect("shlokaRecScriptMode"),
    getShlokaScriptMode,
    getShlokaScriptPrefs,
  });
  window.AmpsShlokaAudio?.loadManifest?.();
  window.addEventListener("hashchange", () => {
    if (programmaticNav || Date.now() < (state._navLockUntil || 0)) return;
    parseRoute();
    state.ui.drawer = null;
    const onShlokaChapter = state.route === "read"
      && state.params.parts[1] === "samskrta-shloka"
      && state.params.parts[2] === "ch-verses";
    const verseId = state.params.parts[3];
    if (onShlokaChapter && !verseId) {
      const home = pendingShlokaReturn();
      if (home?.paraId) {
        returnToExactShloka(home);
        return;
      }
    }
    renderFromState();
  });
  // Android's hardware Back must navigate inside the single-page app. Native
  // MainActivity calls this hook so the first press never terminates the app.
  window.AmpsHandleHardwareBack = function AmpsHandleHardwareBack() {
    if (state.ui.drawer) {
      state.ui.drawer = null;
      renderFromState();
      return true;
    }
    if (state.route === "read" && state.params.parts[1] !== "samskrta-shloka" && pendingShlokaReturn()) {
      returnToExactShloka();
      return true;
    }
    if (state.route === "read" && state.readingReturn) {
      returnFromReading();
      return true;
    }
    if (!["library", "today"].includes(state.route)) {
      if (history.length > 1) history.back();
      else navigate("library");
      return true;
    }
    if (state.route === "today") {
      navigate("library");
      return true;
    }
    showMainMenu();
    return true;
  };
  render().then(() => {
    if (!window.AmpsEnhance?.renderOnboarding?.()) {
      window.AmpsEnhance?.checkReadingReminder?.();
    }
  }).catch(err => console.error("AMPS Reader render error:", err));

})();

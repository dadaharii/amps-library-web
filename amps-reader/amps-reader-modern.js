/* AMPS Reader - modern workflows for fast daily use */
(function () {
  "use strict";

  let api;
  let voiceLabRecorder = null;
  let voiceLabStream = null;
  let voiceLabChunks = [];
  let voiceLabClips = [];

  const VOICE_LAB_SAMPLES = [
    "The human mind moves toward truth through knowledge, practice, and service.",
    "Read calmly, pause at the comma, and breathe naturally at the full stop.",
    "This paragraph should sound warm, steady, and thoughtful, as if giving a quiet spiritual discourse.",
    "The word the should remain English, not Hindi, and it should be read naturally in this sentence.",
    "Some words are English, some words are Saṁskrta, and the reader must keep both streams clear.",
    "Base, take, same, some, then, there, thought, and already are English words and must remain English.",
    "Citta is pronounced चित्त. Puruśa is pronounced पुरुष. Prakrti is pronounced प्रकृति.",
    "Bhava is pronounced भव. Brahma is pronounced ब्रह्म. Brahmá is pronounced ब्रह्मा.",
    "Caetanya is pronounced चैतन्य. Citishakti is pronounced चितिशक्ति. Paramátmá is pronounced परमात्मा.",
    "Bhúmácaetanya means भूमाचैतन्य, the Cosmic Consciousness.",
    "Sádhaná, dharma, mantra, tantra, bhakti, shakti, samádhi, and mokśa.",
    "Saḿskáras, sádhakas, shúdras, guńás, sarvaḿ, and ahaḿtattva.",
    "Diikśá, puńya, kurukśetra, dharmakśetra, svadharma, and práńáyáma.",
    "Avidyámaya should be read as अविद्यमया. Avidyámáyá should be read as अविद्यामाया.",
    "Máyá is माया. Máyáváda is मायावाद. Máyádhiina is मायाधीन. Máyáya is मायाय.",
    "Remember the ya rule: at the beginning of a word, ya may sound like ja; in the middle or end, ya remains ya.",
    "Yoga begins with ja sound, but máyá, váyu, náráyańa, and rámáyańa keep the ya sound.",
    "Jiṋa is ज्ञ. Jiṋá is ज्ञा. Jiṋánis should be read carefully and not hurried.",
    "Ghaiṋ should be pronounced as घञ्, with a compact nasal ending.",
    "Rśi is ऋषि. Rśis is ऋषिस्. Mokśa is मोक्ष. Kśetra should be read as क्षेत्र.",
    "Yudhiśt́hira, yudhiśt́hir, and yudhiśt́hiira should all sound like जुधिष्ठिर.",
    "Vṛddhaḥ should be read as वृद्धा:, softly and clearly.",
    "Púrvávasthápráptirphalabhogah should be read slowly: पूर्वावस्थाप्राप्तिर्फलभोगः.",
    "Vrtvá'tyatiśt́haddasháuṋgulam should be read as वृताऽत्यतिष्ठद्दशाङ्गुलम्.",
    "माता कस्य पिता कस्य कस्य भ्राता सहोदरा। कायप्राणे न सम्बन्दः वृथा का परिवेदना॥",
    "धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः। मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय॥",
    "यदा यदा हि धर्मस्य ग्लानिर्भवति भारत। अभ्युत्थानमधर्मस्य तदात्मानं सृजाम्यहम्॥",
    "Ananda Marga philosophy speaks of Brahma, Puruśa, Prakrti, Jiivátmá, and Paramátmá.",
    "Ánanda Sútram presents spiritual philosophy in concise aphorisms.",
    "Shrii Shrii Anandamurti ji is the author named in this library.",
    "When reading a shloka, slow down, pause before it, read each word clearly, and pause after it.",
    "When reading English explanation after a shloka, return to a natural English rhythm.",
    "The aspirant moves through sádhaná, service, self-discipline, devotion, and realization.",
    "A calm pravachan voice should not rush; it should carry meaning, warmth, and clarity.",
    "Now I will read one long sentence with commas, pauses, and a quiet ending, so the model learns my natural rhythm.",
  ];

  const TOPICS = {
    sadhana: ["sadhana", "meditation", "spiritual practice", "intuition", "mind", "mantra"],
    devotion: ["devotion", "bhakti", "love", "paroma purusa", "baba", "grace"],
    prout: ["prout", "economy", "cooperative", "society", "social", "exploitation"],
    neohumanism: ["neohumanism", "humanism", "intellect", "education", "universalism"],
    conduct: ["conduct", "discipline", "morality", "ethics", "character", "dharma"],
    service: ["service", "seva", "humanity", "welfare", "society", "duty"],
    fear: ["fear", "courage", "struggle", "optimism", "strength"],
    food: ["food", "diet", "health", "yogic", "treatment", "farming"],
  };

  function dayIndex(len, salt) {
    if (!len) return 0;
    const day = new Date().toISOString().slice(0, 10) + (salt || "");
    let h = 0;
    for (let i = 0; i < day.length; i++) h = ((h * 33) + day.charCodeAt(i)) | 0;
    return Math.abs(h) % len;
  }

  function words(text) {
    return String(text || "").split(/\s+/).filter(Boolean);
  }

  function sentenceSplit(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.trim().length > 30);
  }

  function summarizeParagraphs(paragraphs, max) {
    const text = (paragraphs || []).map(p => p.text || "").join(" ");
    const sentences = sentenceSplit(text);
    const picked = [];
    const seen = new Set();
    const signals = ["should", "must", "human", "spiritual", "mind", "society", "progress", "duty", "love", "service"];
    sentences
      .map(s => ({ s, score: signals.reduce((n, k) => n + (s.toLowerCase().includes(k) ? 1 : 0), 0) + Math.min(2, words(s).length / 28) }))
      .sort((a, b) => b.score - a.score)
      .forEach(x => {
        const key = x.s.slice(0, 42).toLowerCase();
        if (picked.length >= (max || 5) || seen.has(key)) return;
        seen.add(key);
        picked.push(x.s);
      });
    return picked.length ? picked : sentences.slice(0, max || 5);
  }

  function questionFromAnswer(answer, index) {
    const text = String(answer || "").replace(/\s+/g, " ").trim();
    const lower = text.toLowerCase();
    if (lower.includes("why")) return "What reason is given in this passage?";
    if (lower.includes("should") || lower.includes("must")) return "What instruction or duty is given here?";
    if (lower.includes("human") || lower.includes("humanity")) return "What does this passage say about human life or humanity?";
    if (lower.includes("mind") || lower.includes("psychic")) return "What does this passage teach about the mind?";
    if (lower.includes("spiritual") || lower.includes("sadhana")) return "What spiritual teaching is explained in this passage?";
    if (lower.includes("society") || lower.includes("social")) return "What social idea is explained in this passage?";
    if (lower.includes("love") || lower.includes("devotion")) return "What does this passage teach about love or devotion?";
    const stems = [
      "What is the main teaching in this passage?",
      "Which key idea should be remembered from this passage?",
      "How does the author explain this topic?",
      "What practical lesson is given here?",
      "What conclusion does this passage lead to?",
    ];
    return stems[index % stems.length];
  }

  function sourceQuestions(paragraphs, max) {
    const candidates = (paragraphs || [])
      .map((p, i) => ({
        paraId: p.id,
        answer: String(p.text || "").replace(/\s+/g, " ").trim(),
        index: i,
      }))
      .filter(p => p.answer.length > 90)
      .map(p => {
        const lower = p.answer.toLowerCase();
        const score = ["should", "must", "human", "spiritual", "mind", "society", "service", "love", "duty", "progress"]
          .reduce((n, k) => n + (lower.includes(k) ? 1 : 0), 0);
        return { ...p, score };
      })
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, max || 5);
    return candidates.map((p, i) => ({
      question: questionFromAnswer(p.answer, i),
      answer: p.answer,
      paraId: p.paraId,
    }));
  }

  function continueItems() {
    return Object.entries(api.state.progress || {})
      .sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0))
      .map(([bookId, p]) => ({ book: api.bookById(bookId), progress: p }))
      .filter(x => x.book)
      .slice(0, 4);
  }

  function dueStudyCount() {
    const now = Date.now();
    return Object.values(api.state.study?.cards || {}).filter(c => c?.due && c.due <= now).length;
  }

  function todayDiscourse() {
    const ds = api.state.catalog?.discourses || [];
    return ds[dayIndex(ds.length, "discourse")];
  }

  function todayQuote() {
    return window.AmpsFeatures?.quoteOfTheDay(api.state.catalog) || todayDiscourse();
  }

  function downloadText(filename, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function renderToday() {
    const q = todayQuote();
    const d = todayDiscourse();
    const recent = continueItems();
    const todayMin = window.AmpsStats?.todayMinutes(api.state.stats) || 0;
    const streak = window.AmpsStats?.streak(api.state.stats) || 0;
    const due = dueStudyCount();
    let body = `<section class="hero modern-hero">
      <p class="hero-eyebrow">Today</p>
      <h1>3 Minute Wisdom</h1>
      <p class="hero-sub">Read, listen, reflect, and carry one idea into the day.</p>
      <div class="stats-inline"><span>${todayMin} min today</span> · <span>${streak} day streak</span> · <span>${due} study due</span></div>
      <div class="hero-actions">
        ${d ? `<button type="button" class="btn btn-gold" data-read-daily="${api.esc(d.bookId)}" data-ch="${api.esc(d.chapterId)}">Start today's discourse</button>` : ""}
        <a class="btn btn-ghost" href="#audio">Audio mode</a>
      </div>
    </section>`;

    if (q) {
      body += `<section class="quote-card modern-card">
        <p class="hero-eyebrow">Passage of the day</p>
        <h3>${api.esc(q.title)}</h3>
        <p class="muted">${api.esc(q.bookTitle)}</p>
        <div class="quick-grid">
          <button type="button" class="btn btn-gold btn-sm" data-book="${api.esc(q.bookId)}" data-ch="${api.esc(q.chapterId)}">Read</button>
          <a class="btn btn-ghost btn-sm" href="#quote-maker">Create quote card</a>
          <a class="btn btn-ghost btn-sm" href="#companion/${api.esc(q.bookId)}/${api.esc(q.chapterId)}">Explain</a>
        </div>
      </section>`;
    }

    body += `<section class="section"><h2 class="section-head">Continue</h2><div class="today-grid">`;
    if (recent.length) {
      recent.forEach(x => {
        body += `<button type="button" class="today-tile" data-book="${api.esc(x.book.id)}" data-ch="${api.esc(x.progress.chapterId || "")}">
          <strong>${api.esc(x.book.title)}</strong><span>${api.esc(x.progress.chapterId || "Resume")}</span>
        </button>`;
      });
    } else {
      body += `<a class="today-tile" href="#paths"><strong>Choose a path</strong><span>Begin with a guided curriculum</span></a>`;
    }
    body += `</div></section>
      ${window.AmpsProductivity?.todayExtrasHtml?.() || ""}
      <section class="section"><h2 class="section-head">Fast tools</h2><div class="more-grid">
        <a href="#smart-search" class="more-item"><span>⌕</span><strong>Smart Search</strong><small>Find by meaning and topic</small></a>
        <a href="#companion" class="more-item"><span>AI</span><strong>Study Companion</strong><small>Summaries and questions</small></a>
        <a href="#journal" class="more-item"><span>J</span><strong>Sadhana Journal</strong><small>Reflect after reading</small></a>
        <a href="#teacher" class="more-item"><span>T</span><strong>Class Mode</strong><small>Build a teaching outline</small></a>
      </div></section>`;

    api.renderShell(body, {
      title: "Today",
      tab: "library",
      className: "today-main",
      bind: () => {
        document.querySelectorAll("[data-read-daily],[data-book]").forEach(btn => {
          btn.addEventListener("click", () => {
            const bookId = btn.dataset.book || btn.dataset.readDaily;
            api.navigate("read", { bookId, chapterId: btn.dataset.ch });
          });
        });
      },
    });
  }

  async function renderCompanion() {
    const parts = api.state.params.parts || [];
    const selectedBookId = parts[1] || api.state.params.companionBook || continueItems()[0]?.book?.id || api.state.catalog?.books?.[0]?.id;
    let book = selectedBookId ? await api.loadBook(selectedBookId) : null;
    let chapterId = parts[2] || api.state.params.companionChapter || book?.chapters?.[0]?.id;
    let ch = book?.chapters?.find(c => c.id === chapterId) || book?.chapters?.[0];
    const summary = ch ? summarizeParagraphs(ch.paragraphs, 5) : [];
    const questions = ch ? sourceQuestions(ch.paragraphs, 5) : [];
    let body = `<section class="hero hero-compact"><h1>Study Companion</h1>
      <p class="hero-sub">Offline summaries, key points, and study questions for any chapter.</p></section>
      <div class="settings-panel">
        <label>Book<select id="cmpBook">${(api.state.catalog?.books || []).map(b => `<option value="${api.esc(b.id)}" ${b.id === selectedBookId ? "selected" : ""}>${api.esc(b.title)}</option>`).join("")}</select></label>
        <label>Chapter<select id="cmpChapter">${(book?.chapters || []).map(c => `<option value="${api.esc(c.id)}" ${c.id === ch?.id ? "selected" : ""}>${api.esc(c.title)}</option>`).join("")}</select></label>
      </div>`;
    if (ch) {
      body += `<section class="modern-card"><p class="hero-eyebrow">${api.esc(book.title)}</p><h3>${api.esc(ch.title)}</h3>
        <h4>Key points from this chapter</h4><ol>${summary.map(s => `<li>${api.esc(s)}</li>`).join("")}</ol>
        <h4>Questions with answers from the book</h4>
        <div class="qa-list">${questions.map((qa, i) => `<details class="qa-item">
          <summary><span>${i + 1}. ${api.esc(qa.question)}</span><strong>Answer</strong></summary>
          <blockquote>${api.esc(qa.answer)}</blockquote>
          <button type="button" class="btn btn-ghost btn-sm" data-answer-para="${api.esc(qa.paraId || "")}">Open in chapter</button>
        </details>`).join("")}</div>
        <div class="quick-grid">
          <button type="button" class="btn btn-gold btn-sm" id="btnCmpRead">Open chapter</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnCmpExport">Export notes</button>
        </div></section>`;
    }
    api.renderShell(body, {
      title: "Companion",
      tab: "more",
      bind: () => {
        document.getElementById("cmpBook")?.addEventListener("change", e => {
          api.state.params.companionBook = e.target.value;
          api.state.params.companionChapter = "";
          api.navigate("companion", { bookId: e.target.value });
        });
        document.getElementById("cmpChapter")?.addEventListener("change", e => {
          api.state.params.companionChapter = e.target.value;
          api.navigate("companion", { bookId: selectedBookId, chapterId: e.target.value });
        });
        document.getElementById("btnCmpRead")?.addEventListener("click", () => api.navigate("read", { bookId: selectedBookId, chapterId: ch.id }));
        document.getElementById("btnCmpExport")?.addEventListener("click", () => {
          const qaLines = questions.flatMap((qa, i) => [`Q${i + 1}. ${qa.question}`, `A${i + 1}. ${qa.answer}`, ""]);
          downloadText("study-companion.txt", [book.title, ch.title, "", "Key points:", ...summary.map(s => "- " + s), "", "Questions and source answers:", ...qaLines].join("\n"));
        });
        document.querySelectorAll("[data-answer-para]").forEach(btn => {
          btn.addEventListener("click", () => api.navigate("read", {
            bookId: selectedBookId,
            chapterId: ch.id,
            paraId: btn.dataset.answerPara || undefined,
          }));
        });
      },
    });
  }

  async function loadShard(bookId) {
    try {
      const res = await fetch(`data/search/${bookId}.json`);
      return res.ok ? await res.json() : [];
    } catch {
      return [];
    }
  }

  async function renderSmartSearch() {
    const query = api.state.params.smartSearch || "";
    const topicTerms = TOPICS[query.toLowerCase()] || words(query);
    let hits = [];
    if (query.trim()) {
      const books = (api.state.catalog?.searchManifest || api.state.catalog?.books || []).slice(0, 60);
      const shards = await Promise.all(books.map(b => loadShard(b.id)));
      const terms = topicTerms.map(t => String(t).toLowerCase()).filter(Boolean);
      hits = shards.flat().filter(h => {
        const hay = [h.t, h.chapterTitle, h.bookTitle].filter(Boolean).join(" ").toLowerCase();
        return terms.some(t => hay.includes(t));
      }).slice(0, 60);
    }
    let body = `<section class="hero hero-compact"><h1>Smart Search</h1>
      <p class="hero-sub">Search by idea, not only exact wording.</p></section>
      <div class="search-bar"><input type="search" id="smartSearchBox" placeholder="Try fear, service, food, PROUT..." value="${api.esc(query)}" />
      <button type="button" class="btn btn-gold" id="btnSmartSearch">Search</button></div>
      <div class="chip-row">${Object.keys(TOPICS).map(t => `<button type="button" class="chip" data-topic="${t}">${t}</button>`).join("")}</div>`;
    if (query.trim()) {
      body += `<section class="section"><h2 class="section-head">Results <span class="badge">${hits.length}</span></h2>`;
      if (!hits.length) body += `<p class="muted pad">No topic matches yet. Try a broader word or exact Search.</p>`;
      hits.forEach(h => {
        body += `<button type="button" class="search-hit text-hit" data-book="${api.esc(h.bookId)}" data-ch="${api.esc(h.c || h.chapterId)}" data-para="${api.esc(h.p || h.paraId || "")}">
          <strong>${api.esc(h.chapterTitle || h.bookTitle || "Passage")}</strong>
          <span>${api.esc(h.bookTitle || h.bookId || "")}</span>
          <em>${api.esc((h.t || "").slice(0, 220))}</em>
        </button>`;
      });
      body += `</section>`;
    }
    api.renderShell(body, {
      title: "Smart Search",
      tab: "more",
      bind: () => {
        const run = (v) => { api.state.params.smartSearch = v.trim(); renderSmartSearch(); };
        document.getElementById("btnSmartSearch")?.addEventListener("click", () => run(document.getElementById("smartSearchBox")?.value || ""));
        document.getElementById("smartSearchBox")?.addEventListener("keydown", e => { if (e.key === "Enter") run(e.target.value); });
        document.querySelectorAll("[data-topic]").forEach(b => b.addEventListener("click", () => run(b.dataset.topic)));
        document.querySelectorAll(".search-hit").forEach(b => b.addEventListener("click", () => api.navigate("read", {
          bookId: b.dataset.book, chapterId: b.dataset.ch, paraId: b.dataset.para || undefined,
        })));
      },
    });
  }

  function renderAudio() {
    const d = todayDiscourse();
    const recent = continueItems();
    const queue = api.state.audioQueue || [];
    let body = `<section class="hero hero-compact"><h1>Audio Mode</h1>
      <p class="hero-sub">A simplified listening dashboard for walking, travel, and rest.</p></section>
      <div class="settings-panel">
        <label>Playback speed <span data-reader-tts-rate-label>${(api.state.settings.ttsRate || 1).toFixed(1)}×</span><input type="range" id="audRate" data-reader-tts-rate min="0.6" max="1.6" step="0.1" value="${api.state.settings.ttsRate || 1}" /></label>
        <label>TTS voice
          <span class="tts-voice-row">${api.ttsVoiceSelectHtml?.("audTtsVoice") || ""}
          <button type="button" class="btn btn-ghost btn-sm" id="btnAudTtsPreview">Preview</button></span>
        </label>
        <label>TTS pronunciation
          ${api.ttsPronunciationSelectHtml?.("audTtsPronunciation") || ""}
        </label>
        <p class="muted tts-voice-hint" id="audTtsVoiceHint"></p>
        <p class="muted">Open a chapter and press the speaker button in the reader toolbar to start listening.</p>
      </div>
      <section class="modern-card"><h3>Read-aloud queue</h3>
        ${queue.length ? `<div class="queue-list">${queue.map((item, i) => {
          const label = queueLabel(item);
          return `<div class="queue-row">
            <span><strong>${api.esc(label.title)}</strong><small>${api.esc(label.subtitle)}</small></span>
            <span class="quick-grid">
              <button type="button" class="btn btn-gold btn-sm" data-queue-play="${i}">Play</button>
              <button type="button" class="btn btn-ghost btn-sm" data-queue-remove="${i}">Remove</button>
            </span>
          </div>`;
        }).join("")}</div>` : `<p class="muted">No chapters in queue yet. Add today's discourse or recent chapters below.</p>`}
        <div class="quick-grid">
          ${queue.length ? `<button type="button" class="btn btn-ghost btn-sm" id="btnQueueClear">Clear queue</button>` : ""}
          ${d ? `<button type="button" class="btn btn-ghost btn-sm" id="btnQueueToday">Add today's discourse</button>` : ""}
          ${recent.slice(0, 5).map((x, i) => `<button type="button" class="btn btn-ghost btn-sm" data-queue-recent="${i}">Add ${api.esc(x.book.title).slice(0, 18)}</button>`).join("")}
        </div>
      </section>
      <section class="section"><h2 class="section-head">Start listening</h2><div class="today-grid">`;
    if (d) body += `<button type="button" class="today-tile" data-book="${api.esc(d.bookId)}" data-ch="${api.esc(d.chapterId)}" data-title="${api.esc(d.bookTitle || "")}" data-ch-title="${api.esc(d.title)}"><strong>Today's discourse</strong><span>${api.esc(d.title)}</span><small>Add to queue or open</small></button>`;
    recent.forEach(x => body += `<button type="button" class="today-tile" data-book="${api.esc(x.book.id)}" data-ch="${api.esc(x.progress.chapterId || "")}" data-title="${api.esc(x.book.title)}"><strong>${api.esc(x.book.title)}</strong><span>Continue audio</span><small>Add to queue or open</small></button>`);
    body += `</div></section>`;
    api.renderShell(body, {
      title: "Audio",
      tab: "more",
      bind: () => {
        document.getElementById("audRate")?.addEventListener("input", e => {
          api.applyTtsPlaybackRate?.(e.target.value);
        });
        api.bindTtsVoiceSelect?.("audTtsVoice", "btnAudTtsPreview");
        api.bindTtsPronunciationSelect?.("audTtsPronunciation", "audTtsVoiceHint", "audTtsVoice");
        document.querySelectorAll("[data-book][data-ch]").forEach(b => b.addEventListener("click", e => {
          if (e.altKey || e.metaKey || e.ctrlKey) {
            addToAudioQueue({ bookId: b.dataset.book, chapterId: b.dataset.ch, bookTitle: b.dataset.title || "", chapterTitle: b.dataset.chTitle || "" });
            renderAudio();
            return;
          }
          api.navigate("read", { bookId: b.dataset.book, chapterId: b.dataset.ch });
        }));
        document.getElementById("btnQueueToday")?.addEventListener("click", () => {
          addToAudioQueue({ bookId: d.bookId, chapterId: d.chapterId, bookTitle: d.bookTitle, chapterTitle: d.title });
          renderAudio();
        });
        document.querySelectorAll("[data-queue-recent]").forEach(btn => btn.addEventListener("click", () => {
          const x = recent[+btn.dataset.queueRecent];
          if (!x?.book?.id || !x.progress?.chapterId) return;
          addToAudioQueue({ bookId: x.book.id, chapterId: x.progress.chapterId, paraId: x.progress.paraId, bookTitle: x.book.title, chapterTitle: x.progress.chapterId });
          renderAudio();
        }));
        document.getElementById("btnQueueClear")?.addEventListener("click", () => {
          api.state.audioQueue = [];
          api.saveState();
          renderAudio();
        });
        document.querySelectorAll("[data-queue-play]").forEach(btn => btn.addEventListener("click", () => {
          const item = api.state.audioQueue?.[+btn.dataset.queuePlay];
          if (item) api.navigate("read", { bookId: item.bookId, chapterId: item.chapterId });
        }));
        document.querySelectorAll("[data-queue-remove]").forEach(btn => btn.addEventListener("click", () => {
          api.state.audioQueue = (api.state.audioQueue || []).filter((_, i) => i !== +btn.dataset.queueRemove);
          api.saveState();
          renderAudio();
        }));
      },
    });
  }

  function renderJournalPrompt() {
    const prompts = [
      "What truth from today's reading can I practice immediately?",
      "Where did this passage challenge my habits?",
      "What service-minded action can I take today?",
      "Which sentence should I remember before sleep?",
    ];
    const prompt = prompts[dayIndex(prompts.length, "journal")];
    let body = `<section class="hero hero-compact"><h1>Sadhana Journal</h1>
      <p class="hero-sub">${api.esc(prompt)}</p></section>
      <textarea id="modernJournal" class="journal-input" rows="6" placeholder="Write your reflection..."></textarea>
      <button type="button" class="btn btn-gold" id="btnModernJournal">Save reflection</button>`;
    (api.state.journal || []).slice(-8).reverse().forEach(j => {
      body += `<div class="note-card"><p>${api.esc(j.body)}</p><p class="muted">${new Date(j.created).toLocaleString()}</p></div>`;
    });
    api.renderShell(body, {
      title: "Journal",
      tab: "more",
      bind: () => {
        document.getElementById("btnModernJournal")?.addEventListener("click", () => {
          const val = document.getElementById("modernJournal")?.value?.trim();
          if (!val) return;
          api.state.journal.push({ id: api.uid(), body: val, prompt, created: Date.now() });
          api.saveState();
          renderJournalPrompt();
        });
      },
    });
  }

  const QUOTE_FORMATS = {
    mobile: { width: 1080, height: 1920, label: "Mobile story (9:16)" },
    social: { width: 1080, height: 1350, label: "Social post (4:5)" },
    square: { width: 1080, height: 1080, label: "Square post (1:1)" },
    landscape: { width: 1600, height: 900, label: "Landscape (16:9)" },
  };

  const QUOTE_THEMES = {
    gold: { label: "Temple Gold", bg: "#2c2416", accent: "#c9a227", fg: "#faf6ec" },
    navy: { label: "Deep Navy", bg: "#071426", accent: "#e0b84f", fg: "#edf4fb" },
    night: { label: "Midnight", bg: "#0f1419", accent: "#8f7cb8", fg: "#e8ecf4" },
    clean: { label: "Modern White", bg: "#f8f9fc", accent: "#e85d04", fg: "#1a1f2e" },
    saffron: { label: "Saffron", bg: "#fff7ed", accent: "#e85d04", fg: "#2c2416" },
    forest: { label: "Forest", bg: "#12372a", accent: "#e2c36b", fg: "#f3f7f2" },
    lotus: { label: "Lotus", bg: "#4c2341", accent: "#efb7d1", fg: "#fff5fa" },
    sunrise: { label: "Sunrise", bg: "#fff0dc", accent: "#c94f36", fg: "#41231e" },
    indigo: { label: "Indigo", bg: "#24224c", accent: "#d2b7ff", fg: "#f5f1ff" },
    teal: { label: "Teal", bg: "#073b3a", accent: "#7dd8c7", fg: "#effcf9" },
    crimson: { label: "Crimson", bg: "#4a1118", accent: "#f1c36b", fg: "#fff4f3" },
    charcoal: { label: "Charcoal", bg: "#232323", accent: "#f2cf66", fg: "#f6f6f2" },
  };

  const QUOTE_FONTS = {
    classic: { label: "Classic Serif", family: "Georgia" },
    elegant: { label: "Elegant", family: "Palatino" },
    modern: { label: "Modern Sans", family: "Arial" },
    humanist: { label: "Humanist", family: "Trebuchet MS" },
    devotional: { label: "Devotional / Indic", family: "Noto Sans Devanagari" },
  };

  function cleanQuoteText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/^\s*["'“”]+|["'“”]+\s*$/g, "")
      .trim();
  }

  function quoteSourceLine(item) {
    const parts = [item.bookTitle, item.chapterTitle].filter(Boolean);
    return parts.join(" - ") || "AMPS Reader";
  }

  function chooseQuoteParagraph(ch, salt) {
    const paras = (ch?.paragraphs || [])
      .map(p => ({ ...p, quoteText: cleanQuoteText(p.text || p.englishMeaning || p.sanskritRoman) }))
      .filter(p => p.quoteText.length >= 70 && p.quoteText.length <= 420);
    if (!paras.length) return null;
    const scored = paras.map((p, i) => {
      const l = p.quoteText.toLowerCase();
      const score = ["human", "spiritual", "mind", "love", "service", "duty", "progress", "society", "truth", "life"]
        .reduce((n, k) => n + (l.includes(k) ? 1 : 0), 0);
      return { p, score, i };
    }).sort((a, b) => b.score - a.score || Math.abs(dayIndex(99, salt) - a.i) - Math.abs(dayIndex(99, salt) - b.i));
    return scored[0]?.p || paras[0];
  }

  async function quoteSuggestions() {
    const out = [];
    (api.state.highlights || []).slice(-8).reverse().forEach(h => {
      const book = api.bookById(h.bookId);
      out.push({
        text: cleanQuoteText(h.text),
        bookId: h.bookId,
        chapterId: h.chapterId,
        paraId: h.paraId,
        bookTitle: book?.title || h.bookId,
        chapterTitle: h.chapterTitle || h.chapterId,
      });
    });

    const discourses = api.state.catalog?.discourses || [];
    const seeds = [
      todayDiscourse(),
      ...continueItems().map(x => ({ bookId: x.book.id, chapterId: x.progress.chapterId })),
      discourses[dayIndex(discourses.length, "quote-a")],
      discourses[dayIndex(discourses.length, "quote-b")],
      discourses[dayIndex(discourses.length, "quote-c")],
    ].filter(Boolean);

    for (const seed of seeds) {
      if (out.length >= 10 || !seed.bookId) continue;
      try {
        const book = await api.loadBook(seed.bookId);
        const ch = book.chapters?.find(c => c.id === seed.chapterId) || book.chapters?.[dayIndex(book.chapters?.length || 1, seed.bookId)];
        const p = chooseQuoteParagraph(ch, seed.bookId + seed.chapterId);
        if (!p) continue;
        out.push({
          text: p.quoteText,
          bookId: book.id,
          chapterId: ch.id,
          paraId: p.id,
          bookTitle: book.title,
          chapterTitle: ch.title,
        });
      } catch (_) { /* ignore unavailable suggestion */ }
    }

    const seen = new Set();
    return out.filter(item => {
      const key = item.text.slice(0, 80);
      if (!item.text || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
  }

  async function renderQuoteMaker() {
    const suggestions = await quoteSuggestions();
    const first = suggestions[0] || { text: "Ananda Marga", bookTitle: "AMPS Reader", chapterTitle: "" };
    let body = `<section class="hero hero-compact"><h1>Quote Card</h1>
      <p class="hero-sub">Create a shareable image from real AMPS Library passages.</p></section>
      <div class="settings-panel">
        <label>Suggested quotation
          <select id="quoteSuggestion">${suggestions.map((s, i) => `<option value="${i}">${api.esc(quoteSourceLine(s)).slice(0, 96)}</option>`).join("")}</select>
        </label>
        <label>Text<textarea id="quoteText" rows="6">${api.esc(first.text)}</textarea></label>
        <label>Reference<input id="quoteSource" value="${api.esc(quoteSourceLine(first))}" /></label>
        <label>Author<input id="quoteAuthor" value="Shrii Shrii Anandamurti ji" /></label>
        <label>Format<select id="quoteFormat">${Object.entries(QUOTE_FORMATS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select></label>
        <label>Color theme<select id="quoteStyle">${Object.entries(QUOTE_THEMES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select></label>
        <div class="quote-color-grid">
          <label>Background<input type="color" id="quoteBgColor" value="${QUOTE_THEMES.gold.bg}" /></label>
          <label>Text<input type="color" id="quoteFontColor" value="${QUOTE_THEMES.gold.fg}" /></label>
          <label>Accent<input type="color" id="quoteAccentColor" value="${QUOTE_THEMES.gold.accent}" /></label>
        </div>
        <label>Font style<select id="quoteFontStyle">${Object.entries(QUOTE_FONTS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select></label>
        <div class="quote-theme-swatches">${Object.entries(QUOTE_THEMES).map(([k, v]) => `<button type="button" class="quote-swatch" data-quote-theme="${k}" title="${v.label}" aria-label="${v.label}" style="--swatch-bg:${v.bg};--swatch-accent:${v.accent};--swatch-fg:${v.fg}"></button>`).join("")}</div>
        <button type="button" class="btn btn-gold" id="btnQuotePng">Save PNG</button>
        <button type="button" class="btn btn-ghost" id="btnQuoteShare">Share PNG</button>
        <button type="button" class="btn btn-ghost" id="btnQuoteOpen">Open image</button>
        <p class="muted" id="quoteDownloadStatus"></p>
      </div>
      <div class="chip-row">${suggestions.map((s, i) => `<button type="button" class="chip" data-quote-pick="${i}">Suggestion ${i + 1}</button>`).join("")}</div>
      <canvas id="quoteCanvas" width="1080" height="1920" class="quote-canvas" aria-label="Quote preview"></canvas>`;
    api.renderShell(body, {
      title: "Quote Card",
      tab: "more",
      bind: () => {
        const draw = () => drawQuoteCanvas();
        const applySuggestion = (idx) => {
          const s = suggestions[idx];
          if (!s) return;
          document.getElementById("quoteText").value = s.text;
          document.getElementById("quoteSource").value = quoteSourceLine(s);
          const select = document.getElementById("quoteSuggestion");
          if (select) select.value = String(idx);
          draw();
        };
        ["quoteText", "quoteSource", "quoteAuthor", "quoteFormat", "quoteBgColor", "quoteFontColor", "quoteAccentColor", "quoteFontStyle"].forEach(id => document.getElementById(id)?.addEventListener("input", draw));
        const applyTheme = key => {
          const theme = QUOTE_THEMES[key] || QUOTE_THEMES.gold;
          document.getElementById("quoteStyle").value = key;
          document.getElementById("quoteBgColor").value = theme.bg;
          document.getElementById("quoteFontColor").value = theme.fg;
          document.getElementById("quoteAccentColor").value = theme.accent;
          draw();
        };
        document.getElementById("quoteStyle")?.addEventListener("change", e => applyTheme(e.target.value));
        document.querySelectorAll("[data-quote-theme]").forEach(btn => btn.addEventListener("click", () => applyTheme(btn.dataset.quoteTheme)));
        document.getElementById("quoteFormat")?.addEventListener("change", draw);
        if (window.matchMedia?.("(max-width: 640px)")?.matches) {
          const fmt = document.getElementById("quoteFormat");
          if (fmt) fmt.value = "mobile";
        }
        document.getElementById("quoteSuggestion")?.addEventListener("change", e => applySuggestion(+e.target.value));
        document.querySelectorAll("[data-quote-pick]").forEach(btn => btn.addEventListener("click", () => applySuggestion(+btn.dataset.quotePick)));
        document.getElementById("btnQuotePng")?.addEventListener("click", downloadQuotePng);
        document.getElementById("btnQuoteShare")?.addEventListener("click", shareQuotePng);
        document.getElementById("btnQuoteOpen")?.addEventListener("click", openQuoteImage);
        requestAnimationFrame(draw);
      },
    });
  }

  function measureCanvasLines(ctx, text, maxWidth) {
    const ws = words(text);
    const lines = [];
    let line = "";
    ws.forEach(w => {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function fitQuoteLayout(ctx, fmt, quoteText, authorText, sourceText, fontFamily) {
    const padX = 96;
    const padTop = 72;
    const padBottom = 72;
    const barH = 18;
    const maxWidth = fmt.width - padX * 2;
    const gapQuoteAuthor = 44;
    const gapAuthorSource = 28;
    const gapSourceBrand = 24;
    const brandSize = 24;
    const authorSize = 34;
    const sourceSize = 26;
    const authorLineHeight = Math.round(authorSize * 1.28);
    const sourceLineHeight = Math.round(sourceSize * 1.3);
    const quoteSizes = [54, 48, 42, 38, 34, 30, 26, 22];
    const usableHeight = fmt.height - padTop - padBottom - barH * 2;

    ctx.font = `700 ${authorSize}px "${fontFamily}"`;
    const authorLines = measureCanvasLines(ctx, authorText, maxWidth);
    ctx.font = `500 ${sourceSize}px "${fontFamily}"`;
    const sourceLines = measureCanvasLines(ctx, sourceText, maxWidth);
    const authorBlock = authorLines.length * authorLineHeight;
    const sourceBlock = sourceLines.length * sourceLineHeight;
    const brandBlock = brandSize + 12;
    const reservedBelowQuote = gapQuoteAuthor + authorBlock + gapAuthorSource + sourceBlock + gapSourceBrand + brandBlock;

    for (const quoteSize of quoteSizes) {
      const quoteLineHeight = Math.round(quoteSize * 1.28);
      ctx.font = `700 ${quoteSize}px "${fontFamily}"`;
      let quoteLines = measureCanvasLines(ctx, quoteText, maxWidth);
      let quoteBlock = quoteLines.length * quoteLineHeight;
      let total = quoteBlock + reservedBelowQuote;
      if (total <= usableHeight) {
        return {
          padX, padTop, padBottom, barH, maxWidth, quoteSize, quoteLineHeight, quoteLines,
          authorSize, authorLineHeight, authorLines, sourceSize, sourceLineHeight, sourceLines, brandSize,
        };
      }
      const maxQuoteLines = Math.max(1, Math.floor((usableHeight - reservedBelowQuote) / quoteLineHeight));
      if (maxQuoteLines < quoteLines.length) {
        quoteLines = quoteLines.slice(0, maxQuoteLines);
        const last = quoteLines.length - 1;
        if (last >= 0) {
          let trimmed = quoteLines[last];
          while (trimmed.length > 12 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
            trimmed = trimmed.replace(/\s+\S+\s*$/, "");
          }
          quoteLines[last] = `${trimmed}…`;
        }
        quoteBlock = quoteLines.length * quoteLineHeight;
        total = quoteBlock + reservedBelowQuote;
        if (total <= usableHeight) {
          return {
            padX, padTop, padBottom, barH, maxWidth, quoteSize, quoteLineHeight, quoteLines,
            authorSize, authorLineHeight, authorLines, sourceSize, sourceLineHeight, sourceLines, brandSize,
          };
        }
      }
    }

    const quoteSize = quoteSizes[quoteSizes.length - 1];
    const quoteLineHeight = Math.round(quoteSize * 1.28);
    ctx.font = `700 ${quoteSize}px "${fontFamily}"`;
    const maxQuoteLines = Math.max(1, Math.floor((usableHeight - reservedBelowQuote) / quoteLineHeight));
    let quoteLines = measureCanvasLines(ctx, quoteText, maxWidth).slice(0, maxQuoteLines);
    const last = quoteLines.length - 1;
    if (last >= 0) quoteLines[last] = `${quoteLines[last].replace(/\s+\S+\s*$/, "")}…`;
    return {
      padX, padTop, padBottom, barH, maxWidth, quoteSize, quoteLineHeight, quoteLines,
      authorSize, authorLineHeight, authorLines, sourceSize, sourceLineHeight, sourceLines, brandSize,
    };
  }

  function drawCanvasLines(ctx, lines, x, y, lineHeight, fillStyle) {
    ctx.fillStyle = fillStyle;
    lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
    return y + lines.length * lineHeight;
  }

  function drawQuoteCanvas() {
    const canvas = document.getElementById("quoteCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const formatKey = document.getElementById("quoteFormat")?.value || "mobile";
    const fmt = QUOTE_FORMATS[formatKey] || QUOTE_FORMATS.mobile;
    const text = document.getElementById("quoteText")?.value || "";
    const source = document.getElementById("quoteSource")?.value || "AMPS Reader";
    const author = document.getElementById("quoteAuthor")?.value || "Shrii Shrii Anandamurti ji";
    canvas.width = fmt.width;
    canvas.height = fmt.height;
    canvas.dataset.aspect = `${fmt.width}/${fmt.height}`;

    const bg = document.getElementById("quoteBgColor")?.value || QUOTE_THEMES.gold.bg;
    const accent = document.getElementById("quoteAccentColor")?.value || QUOTE_THEMES.gold.accent;
    const fg = document.getElementById("quoteFontColor")?.value || QUOTE_THEMES.gold.fg;
    const fontKey = document.getElementById("quoteFontStyle")?.value || "classic";
    const fontFamily = QUOTE_FONTS[fontKey]?.family || QUOTE_FONTS.classic.family;
    const quoteText = `“${cleanQuoteText(text)}”`;
    const authorText = `- ${author}`;
    const layout = fitQuoteLayout(ctx, fmt, quoteText, authorText, source, fontFamily);

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, canvas.width, layout.barH);
    ctx.fillRect(0, canvas.height - layout.barH, canvas.width, layout.barH);

    let y = layout.padTop + layout.barH + 24;
    ctx.font = `700 ${layout.quoteSize}px "${fontFamily}"`;
    y = drawCanvasLines(ctx, layout.quoteLines, layout.padX, y, layout.quoteLineHeight, fg) + 44;

    ctx.font = `700 ${layout.authorSize}px "${fontFamily}"`;
    y = drawCanvasLines(ctx, layout.authorLines, layout.padX, y, layout.authorLineHeight, accent) + 28;

    ctx.font = `500 ${layout.sourceSize}px "${fontFamily}"`;
    y = drawCanvasLines(ctx, layout.sourceLines, layout.padX, y, layout.sourceLineHeight, fg) + 24;

    ctx.font = `600 ${layout.brandSize}px sans-serif`;
    ctx.fillStyle = accent;
    ctx.fillText("AMPS Reader", layout.padX, y + layout.brandSize);
  }

  function quoteBlob() {
    drawQuoteCanvas();
    const canvas = document.getElementById("quoteCanvas");
    return new Promise(resolve => canvas.toBlob(resolve, "image/png", 0.95));
  }

  async function downloadQuotePng() {
    const status = document.getElementById("quoteDownloadStatus");
    try {
      drawQuoteCanvas();
      const canvas = document.getElementById("quoteCanvas");
      const formatKey = document.getElementById("quoteFormat")?.value || "mobile";
      const filename = `amps-quote-${formatKey}-${Date.now()}.png`;
      const nativeSaver = window.Capacitor?.Plugins?.AmpsFiles;
      if (nativeSaver?.savePng && canvas) {
        const result = await nativeSaver.savePng({ data: canvas.toDataURL("image/png", 0.95), filename });
        if (status) status.textContent = `Saved to ${result.location || "Pictures/AMPS Library"}.`;
        return;
      }
      const blob = await quoteBlob();
      if (!blob) throw new Error("Could not create PNG.");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      if (status) status.textContent = "PNG saved/downloaded.";
    } catch (err) {
      if (status) status.textContent = "Save failed: " + (err.message || err);
      console.error(err);
    }
  }

  async function shareQuotePng() {
    const status = document.getElementById("quoteDownloadStatus");
    try {
      const blob = await quoteBlob();
      if (!blob) throw new Error("Could not create PNG.");
      const formatKey = document.getElementById("quoteFormat")?.value || "mobile";
      const file = new File([blob], `amps-quote-${formatKey}.png`, { type: "image/png" });
      if (!navigator.canShare?.({ files: [file] })) throw new Error("Image sharing is not supported on this device.");
      await navigator.share({ files: [file], title: "AMPS Quote Card" });
      if (status) status.textContent = "Image shared.";
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (status) status.textContent = "Share failed: " + (err.message || err);
    }
  }

  async function openQuoteImage() {
    const status = document.getElementById("quoteDownloadStatus");
    const blob = await quoteBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank");
    if (status) status.textContent = opened ? "Image opened." : "Popup blocked. Try Download PNG.";
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  async function renderTeacher() {
    const pathId = api.state.params.teacherPath || "beginner";
    const bookId = api.state.params.teacherBook || api.state.params.parts?.[1] || "";
    const chapterId = api.state.params.teacherChapter || api.state.params.parts?.[2] || "";
    const paths = window.AmpsFeatures?.LEARNING_PATHS || [];
    const books = window.AmpsFeatures?.booksForPath(api.state.catalog, pathId) || [];
    const selectedBookId = bookId || books[0]?.id || api.state.catalog?.books?.[0]?.id;
    const book = selectedBookId ? await api.loadBook(selectedBookId) : null;
    const ch = book?.chapters?.find(c => c.id === chapterId) || book?.chapters?.[0];
    const outline = (book?.chapters || []).slice(0, 8).map(chap => {
      const words = (chap.paragraphs || []).reduce((a, p) => a + String(p.text || "").split(/\s+/).length, 0);
      return {
        id: chap.id,
        title: chap.title,
        points: summarizeParagraphs(chap.paragraphs, 2),
        minutes: Math.max(3, Math.round(words / 180)),
      };
    });
    const focusOutline = ch ? [{
      title: ch.title,
      points: summarizeParagraphs(ch.paragraphs, 4),
      minutes: Math.max(5, Math.round((ch.paragraphs || []).reduce((a, p) => a + String(p.text || "").split(/\s+/).length, 0) / 180)),
    }] : outline.slice(0, 3);
    const qaSeed = ch ? (await window.AmpsSourceQa?.answerFromSource?.({
      bookId: selectedBookId,
      chapterId: ch.id,
      question: "spiritual practice sadhana consciousness",
      limit: 3,
    }))?.citations || [] : [];
    let body = `<section class="hero hero-compact"><h1>Class Mode 2.0</h1>
      <p class="hero-sub">Teaching outline with timings, source citations, and listen mode.</p></section>
      <div class="settings-panel">
        <label>Path<select id="teacherPath">${paths.map(p => `<option value="${api.esc(p.id)}" ${p.id === pathId ? "selected" : ""}>${api.esc(p.title)}</option>`).join("")}</select></label>
        <label>Book<select id="teacherBook">${(api.state.catalog?.books || []).slice(0, 80).map(b => `<option value="${api.esc(b.id)}" ${b.id === selectedBookId ? "selected" : ""}>${api.esc(b.title)}</option>`).join("")}</select></label>
        <label>Focus chapter<select id="teacherChapter">${(book?.chapters || []).map(c => `<option value="${api.esc(c.id)}" ${c.id === ch?.id ? "selected" : ""}>${api.esc(c.title)}</option>`).join("")}</select></label>
        <div class="quick-grid">
          <button type="button" class="btn btn-gold btn-sm" id="btnTeacherListen">Listen (human discourse)</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnTeacherRead">Open chapter</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnTeacherExport">Export outline</button>
        </div>
      </div>
      <section class="modern-card"><h3>${api.esc(ch?.title || paths.find(p => p.id === pathId)?.title || "Class outline")}</h3>
      <p class="muted">Estimated class time: ${focusOutline.reduce((a, o) => a + o.minutes, 0)} min</p>
      <ol>${focusOutline.map(o => `<li><strong>${api.esc(o.title)}</strong> <span class="muted">(~${o.minutes} min)</span><ul>${o.points.map(p => `<li>${api.esc(p)}</li>`).join("")}</ul></li>`).join("")}</ol>
      <h4>Discussion prompts</h4><ol><li>What is the central principle in this chapter?</li><li>How can this be practiced today?</li><li>What question might a new reader ask?</li></ol>
      ${qaSeed.length ? `<h4>Source-grounded discussion</h4><ol>${qaSeed.map(c => `<li>${api.esc(c.excerpt.slice(0, 140))}… <button type="button" class="btn btn-ghost btn-sm teacher-cite" data-book="${api.esc(c.bookId)}" data-ch="${api.esc(c.chapterId)}" data-para="${api.esc(c.paraId)}">Open</button></li>`).join("")}</ol>` : ""}
      </section>`;
    api.renderShell(body, {
      title: "Class Mode",
      tab: "more",
      bind: () => {
        const reload = () => {
          api.state.params.teacherPath = document.getElementById("teacherPath")?.value;
          api.state.params.teacherBook = document.getElementById("teacherBook")?.value;
          api.state.params.teacherChapter = document.getElementById("teacherChapter")?.value;
          renderTeacher();
        };
        document.getElementById("teacherPath")?.addEventListener("change", reload);
        document.getElementById("teacherBook")?.addEventListener("change", reload);
        document.getElementById("teacherChapter")?.addEventListener("change", reload);
        document.getElementById("btnTeacherRead")?.addEventListener("click", () => {
          if (selectedBookId && ch?.id) api.navigate("read", { bookId: selectedBookId, chapterId: ch.id });
        });
        document.getElementById("btnTeacherListen")?.addEventListener("click", () => {
          api.state.settings.ttsReadingStyle = "human";
          api.saveState();
          if (selectedBookId && ch?.id) api.navigate("read", { bookId: selectedBookId, chapterId: ch.id });
        });
        document.getElementById("btnTeacherExport")?.addEventListener("click", () => {
          const txt = focusOutline.map((o, i) => `${i + 1}. ${o.title} (~${o.minutes} min)\n${o.points.map(p => " - " + p).join("\n")}`).join("\n\n");
          downloadText("amps-class-outline.txt", txt, "text/plain");
        });
        document.querySelectorAll(".teacher-cite").forEach(btn => {
          btn.addEventListener("click", () => {
            api.navigate("read", { bookId: btn.dataset.book, chapterId: btn.dataset.ch, paraId: btn.dataset.para });
          });
        });
      },
    });
  }

  function renderBackup() {
    const snap = window.AmpsSync?.snapshot(api.state) || {};
    const size = JSON.stringify(snap).length;
    let body = `<section class="hero hero-compact"><h1>Backup</h1>
      <p class="hero-sub">Protect highlights, notes, progress, journal, study cards, and settings.</p></section>
      <div class="settings-panel">
        <p class="muted">Current backup size: ${Math.round(size / 1024)} KB</p>
        <button type="button" class="btn btn-gold" id="btnModernExport">Download backup</button>
        <label class="btn btn-ghost import-label">Restore backup<input type="file" id="modernImport" accept=".json" hidden /></label>
        <label>Cloud sync URL<input type="url" id="modernSyncUrl" placeholder="https://..." value="${api.esc(api.state.settings.syncEndpoint || "")}" /></label>
        <div class="quick-grid"><button type="button" class="btn btn-ghost btn-sm" id="btnModernPush">Push</button><button type="button" class="btn btn-ghost btn-sm" id="btnModernPull">Pull</button></div>
      </div>`;
    api.renderShell(body, {
      title: "Backup",
      tab: "more",
      bind: () => {
        document.getElementById("btnModernExport")?.addEventListener("click", () => downloadText("amps-library-backup.json", JSON.stringify(window.AmpsSync?.snapshot(api.state) || {}, null, 2), "application/json"));
        document.getElementById("modernSyncUrl")?.addEventListener("change", e => {
          api.state.settings.syncEndpoint = e.target.value.trim();
          api.saveState();
        });
        document.getElementById("modernImport")?.addEventListener("change", e => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            if (!confirm("Restore this backup? This will replace local progress, notes, highlights, journal, and settings.")) return;
            window.AmpsSync?.applySnapshot(api.state, JSON.parse(reader.result));
            api.saveState();
            api.renderFromState();
          };
          reader.readAsText(file);
        });
        document.getElementById("btnModernPush")?.addEventListener("click", async () => {
          if (!api.state.settings.syncEndpoint) return alert("Add a Cloud sync URL first.");
          await window.AmpsSync?.pushToEndpoint(api.state.settings.syncEndpoint, api.state);
          alert("Backup pushed.");
        });
        document.getElementById("btnModernPull")?.addEventListener("click", async () => {
          if (!api.state.settings.syncEndpoint) return alert("Add a Cloud sync URL first.");
          const data = await window.AmpsSync?.pullFromEndpoint(api.state.settings.syncEndpoint);
          window.AmpsSync?.applySnapshot(api.state, data);
          api.saveState();
          api.renderFromState();
        });
      },
    });
  }

  function bookOptions(selected) {
    return (api.state.catalog?.books || [])
      .map(b => `<option value="${api.esc(b.id)}" ${b.id === selected ? "selected" : ""}>${api.esc(b.title)}</option>`)
      .join("");
  }

  function queueLabel(item) {
    const book = api.bookById(item.bookId);
    return {
      title: book?.title || item.bookTitle || item.bookId,
      subtitle: item.chapterTitle || item.chapterId || "Chapter",
    };
  }

  function addToAudioQueue(item) {
    if (!item?.bookId || !item?.chapterId) return;
    api.state.audioQueue = api.state.audioQueue || [];
    const key = item.bookId + "|" + item.chapterId;
    api.state.audioQueue = [
      { ...item, added: Date.now() },
      ...api.state.audioQueue.filter(x => x.bookId + "|" + x.chapterId !== key),
    ].slice(0, 30);
    api.saveState();
  }

  function loadVoiceLabZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "../vendor/jszip.min.js";
      script.onload = () => window.JSZip ? resolve(window.JSZip) : reject(new Error("ZIP library unavailable"));
      script.onerror = () => reject(new Error("Could not load ZIP library"));
      document.head.appendChild(script);
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Could not read file data"));
      reader.readAsDataURL(blob);
    });
  }

  function normalizeLocalUrl(url) {
    let s = String(url || "").trim();
    if (s && !/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "http://" + s;
    return s.replace(/\/+$/, "");
  }

  async function exportVoiceLabDataset() {
    if (!voiceLabClips.length) return alert("Record at least one sample first.");
    const status = document.getElementById("voiceLabExportStatus");
    if (status) status.textContent = "Preparing ZIP dataset...";
    const JSZip = await loadVoiceLabZip();
    const zip = new JSZip();
    const manifest = {
      format: "amps-own-voice-dataset-v1",
      createdAt: new Date().toISOString(),
      consent: "The recordings are of the app user's own voice and may only be used with their permission.",
      prohibitedUse: "Do not use this dataset to clone, imitate, or label a voice as Shrii Shrii Anandamurti/Baba.",
      samples: [],
    };
    voiceLabClips.forEach((clip, i) => {
      const ext = clip.type.includes("ogg") ? "ogg" : clip.type.includes("mp4") ? "m4a" : "webm";
      const filename = `sample-${String(i + 1).padStart(3, "0")}.${ext}`;
      zip.file(filename, clip.blob);
      manifest.samples.push({ filename, prompt: clip.prompt, mimeType: clip.type, recordedAt: clip.recordedAt });
    });
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    zip.file("README.txt", [
      "AMPS Own Voice Dataset",
      "",
      "Use only recordings of your own consenting voice.",
      "This dataset is not Baba's voice and must never be labelled or presented as Baba's voice.",
      "",
      "Practical local workflow:",
      "1. Train a custom TTS voice from these samples on your own computer or private server.",
      "2. Run a TTS server that exposes /api/tts/synthesize and /api/tts/status.",
      "3. Put the phone and computer on the same Wi-Fi.",
      "4. In AMPS Library > Own Voice Lab, enter the computer LAN URL, for example http://192.168.1.23:3001.",
      "5. Tap Check, Test, then Use My Voice for reading.",
      "",
    ].join("\n"));
    const filename = "amps-own-voice-training-dataset.zip";
    const blob = await zip.generateAsync({ type: "blob" });
    if (!blob?.size) throw new Error("Could not create ZIP dataset.");
    const nativeSaver = window.Capacitor?.Plugins?.AmpsFiles;
    if (nativeSaver?.saveFile) {
      const result = await nativeSaver.saveFile({
        data: await blobToDataUrl(blob),
        filename,
        mimeType: "application/zip",
        relativePath: "Download/AMPS Library",
      });
      if (status) status.textContent = `Saved to ${result.location || "Downloads/AMPS Library"}.`;
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    if (status) status.textContent = "ZIP saved/downloaded.";
  }

  function renderVoiceLab() {
    const selected = Math.max(0, Math.min(VOICE_LAB_SAMPLES.length - 1, +(api.state.params.voiceLabSample || 0)));
    const recording = voiceLabRecorder?.state === "recording";
    let body = `<section class="hero hero-compact"><h1>Own Voice Lab</h1>
      <p class="hero-sub">Record your own voice, export a training dataset, then connect your trained voice model for book reading.</p></section>
      <section class="modern-card">
        <h3>Voice safety</h3>
        <p>Record only your own voice, or a speaker who has given explicit permission.</p>
        <p class="muted">A wired earphone or headset microphone is okay if it sounds clean. Avoid Bluetooth if possible; it often compresses speech. Use the same microphone and distance for every sample.</p>
        <p class="muted">Do not record Baba's pravachan audio. Do not clone, imitate, train on, or label any generated voice as Shrii Shrii Anandamurti/Baba.</p>
      </section>
      <section class="modern-card">
        <h3>Use My Voice in reader</h3>
        <div class="queue-list">
          <div class="queue-row"><span><strong>1. Record locally</strong><small>Capture your own consented samples on this phone.</small></span></div>
          <div class="queue-row"><span><strong>2. Train privately</strong><small>Use your computer/private server for the heavy model training.</small></span></div>
          <div class="queue-row"><span><strong>3. Connect by Wi-Fi</strong><small>Paste the local server URL here, then the APK can read with that voice.</small></span></div>
        </div>
        <label>My Voice TTS URL
          <input type="url" id="voiceLabTtsUrl" value="${api.esc(api.state.settings.ownVoiceTtsUrl || "")}" placeholder="http://192.168.1.23:3001" />
        </label>
        <label>API key
          <input type="password" id="voiceLabTtsKey" value="${api.esc(api.state.settings.ownVoiceTtsKey || "")}" autocomplete="off" />
        </label>
        <label>Voice ID
          <input type="text" id="voiceLabVoiceId" value="${api.esc(api.state.settings.ownVoiceId || "my-voice")}" placeholder="my-voice" />
        </label>
        <div class="quick-grid">
          <button type="button" class="btn btn-ghost btn-sm" id="btnVoiceCheckServer">Check server</button>
          <button type="button" class="btn btn-gold btn-sm" id="btnVoiceUseReader">Use My Voice for reading</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnVoiceTestReader">Test</button>
        </div>
        <p class="muted" id="voiceLabServerStatus">Your trained voice server should expose <code>/api/tts/synthesize</code> and <code>/api/tts/status</code>. If it fails, the reader falls back to device TTS.</p>
      </section>
      <section class="modern-card"><h3>Recording prompt ${selected + 1} of ${VOICE_LAB_SAMPLES.length}</h3>
        <blockquote>${api.esc(VOICE_LAB_SAMPLES[selected])}</blockquote>
        <div class="quick-grid">
          <button type="button" class="btn btn-ghost btn-sm" id="btnVoicePrev" ${selected <= 0 ? "disabled" : ""}>Previous</button>
          <button type="button" class="btn ${recording ? "btn-ghost" : "btn-gold"}" id="btnVoiceRecord">${recording ? "Recording..." : "Record"}</button>
          <button type="button" class="btn btn-ghost" id="btnVoiceStop" ${recording ? "" : "disabled"}>Stop</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnVoiceNext" ${selected >= VOICE_LAB_SAMPLES.length - 1 ? "disabled" : ""}>Next</button>
        </div>
        <p class="muted" id="voiceLabStatus">Speak naturally in a quiet room, about 15-20 cm from the microphone. Use one mic consistently; wired earphones are okay, Bluetooth is less ideal.</p>
      </section>
      <section class="modern-card"><h3>Recorded samples (${voiceLabClips.length})</h3>
        ${voiceLabClips.length ? `<div class="queue-list">${voiceLabClips.map((clip, i) => `<div class="queue-row"><span><strong>Sample ${i + 1}</strong><small>${api.esc(clip.prompt)}</small></span><span class="quick-grid"><audio controls src="${clip.url}"></audio><button type="button" class="btn btn-ghost btn-sm" data-voice-delete="${i}">Delete</button></span></div>`).join("")}</div>` : `<p class="muted">No samples recorded in this session.</p>`}
        <button type="button" class="btn btn-gold" id="btnVoiceExport" ${voiceLabClips.length ? "" : "disabled"}>Export training dataset</button>
        <p class="muted" id="voiceLabExportStatus"></p>
      </section>`;
    api.renderShell(body, {
      title: "Own Voice Lab",
      tab: "more",
      bind: () => {
        const go = n => { api.state.params.voiceLabSample = n; renderVoiceLab(); };
        document.getElementById("btnVoicePrev")?.addEventListener("click", () => go(selected - 1));
        document.getElementById("btnVoiceNext")?.addEventListener("click", () => go(selected + 1));
        document.getElementById("btnVoiceRecord")?.addEventListener("click", async () => {
          if (voiceLabRecorder?.state === "recording") return;
          try {
            voiceLabStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
            voiceLabChunks = [];
            voiceLabRecorder = new MediaRecorder(voiceLabStream);
            voiceLabRecorder.ondataavailable = e => { if (e.data?.size) voiceLabChunks.push(e.data); };
            voiceLabRecorder.onstop = () => {
              const type = voiceLabRecorder.mimeType || "audio/webm";
              const blob = new Blob(voiceLabChunks, { type });
              voiceLabClips.push({ blob, type, url: URL.createObjectURL(blob), prompt: VOICE_LAB_SAMPLES[selected], recordedAt: new Date().toISOString() });
              voiceLabStream?.getTracks().forEach(t => t.stop());
              voiceLabStream = null;
              voiceLabRecorder = null;
              renderVoiceLab();
            };
            voiceLabRecorder.start();
            renderVoiceLab();
          } catch (err) {
            const status = document.getElementById("voiceLabStatus");
            if (status) status.textContent = "Microphone permission is required: " + (err.message || err);
          }
        });
        document.getElementById("btnVoiceStop")?.addEventListener("click", () => voiceLabRecorder?.state === "recording" && voiceLabRecorder.stop());
        const saveVoiceConnection = () => {
          api.state.settings.ownVoiceTtsUrl = normalizeLocalUrl(document.getElementById("voiceLabTtsUrl")?.value || "");
          api.state.settings.ownVoiceTtsKey = document.getElementById("voiceLabTtsKey")?.value || "";
          api.state.settings.ownVoiceId = document.getElementById("voiceLabVoiceId")?.value?.trim() || "my-voice";
          api.state.settings.ttsProvider = "my-voice";
          const urlEl = document.getElementById("voiceLabTtsUrl");
          if (urlEl) urlEl.value = api.state.settings.ownVoiceTtsUrl;
          api.saveState();
        };
        document.getElementById("btnVoiceUseReader")?.addEventListener("click", () => {
          saveVoiceConnection();
          api.enableSanskritPronunciationIfOff?.();
          api.saveState();
          alert("My Voice reading is selected with AMPS Enhanced Sanskrit pronunciation. Open any chapter and press the speaker button.");
        });
        document.getElementById("btnVoiceCheckServer")?.addEventListener("click", async () => {
          saveVoiceConnection();
          const status = document.getElementById("voiceLabServerStatus");
          if (status) status.textContent = "Checking My Voice server...";
          if (!window.AmpsApiTts?.isConfigured?.(api.state.settings.ownVoiceTtsUrl)) {
            if (status) status.textContent = "Add your local server URL first, for example http://192.168.1.23:3001.";
            return;
          }
          const res = await window.AmpsApiTts.getStatus?.(api.state.settings.ownVoiceTtsUrl, api.state.settings.ownVoiceTtsKey);
          if (status) {
            status.textContent = res?.ok
              ? `Connected. Provider: ${res.provider || "tts"}${res.ownVoiceConfigured ? " (own voice configured)" : ""}.`
              : `Could not connect: ${res?.error || "server did not return ok"}`;
          }
        });
        document.getElementById("btnVoiceTestReader")?.addEventListener("click", async () => {
          saveVoiceConnection();
          if (!window.AmpsApiTts?.isConfigured?.(api.state.settings.ownVoiceTtsUrl)) {
            alert("Add your My Voice TTS URL first.");
            return;
          }
          api.enableSanskritPronunciationIfOff?.();
          api.saveState();
          const sample = "This is my trained voice. The doer-I is ahamtattva, and the existential I-feeling is mahattattva.";
          const spoken = window.AmpsAudio?.prepareApiText
            ? await window.AmpsAudio.prepareApiText(sample, api.state.settings.ttsVoice || "in-en-male", {
              pronunciationMode: api.sanskritPronunciationMode?.() || "amps-enhanced",
              readingStyle: "normal",
            })
            : sample;
          const ok = await window.AmpsApiTts.speak(
            spoken,
            {
              apiUrl: api.state.settings.ownVoiceTtsUrl,
              apiKey: api.state.settings.ownVoiceTtsKey,
              voice: api.state.settings.ownVoiceId,
              provider: "my-voice",
              rate: api.state.settings.ttsRate || 1,
              style: "normal",
              noCache: true,
            },
            { isCancelled: () => false }
          );
          if (!ok) alert("My Voice test failed. Check the trained voice server URL and API key.");
        });
        document.querySelectorAll("[data-voice-delete]").forEach(btn => btn.addEventListener("click", () => {
          const i = +btn.dataset.voiceDelete;
          if (voiceLabClips[i]?.url) URL.revokeObjectURL(voiceLabClips[i].url);
          voiceLabClips.splice(i, 1);
          renderVoiceLab();
        }));
        document.getElementById("btnVoiceExport")?.addEventListener("click", () => exportVoiceLabDataset().catch(err => alert(err.message || err)));
      },
    });
  }

  async function renderToolsDashboard() {
    const recent = continueItems();
    const firstRecent = recent[0];
    const queueCount = api.state.audioQueue?.length || 0;
    const vocabCount = api.state.vocabulary?.length || 0;
    const notesCount = api.state.notes?.length || 0;
    const highlightsCount = api.state.highlights?.length || 0;
    const toolItems = [
      ["Smart read-aloud queue", "Audio playlist for chapters", "#audio"],
      ["Manual pronunciation trainer", "Tap wrong words and save corrections", "#pronunciation"],
      ["Saṁskrta word popups", "Select word, tap glossary", "#glossary"],
      ["Parallel shloka view", "Roman, Devanagari, meaning", "#compare"],
      ["Book-grounded Q&A", "Answers from chapter text", "#source-qa"],
      ["Daily study path", "Short daily reading flow", "#today"],
      ["Offline search upgrade", "Topic and full text search", "#smart-search"],
      ["Audio bookmark", "Resume last paragraph/word", "#audio"],
      ["Word-by-word shloka mode", "Study shlokas slowly", "#shloka-game"],
      ["Pravachan rhythm editor", "Pause controls in reader settings", "#settings"],
      ["Reader themes", "Sepia, navy, night, contrast", "#settings"],
      ["Quote Studio", "Suggestions and PNG export", "#quote-maker"],
      ["Notebook references", "Notes keep source links", "#notebook"],
      ["Revision flashcards", "SRS review mode", "#study"],
      ["Ananda Sutram study", "Sutra game and review", "#sutra-game"],
      ["Glossary dictionary", `${vocabCount} saved vocabulary terms`, "#glossary"],
      ["Reading analytics", "Streaks, time, achievements", "#stats"],
      ["Mobile audio controls", "Top pause/stop while reading", "#audio"],
      ["Personal collections", "Save passages into sets", "#collections"],
      ["Export study notes", `${notesCount} notes, ${highlightsCount} highlights`, "#notebook"],
    ];
    const nextFeatures = [
      ["Teacher Mode 2.0", "Lesson plans with timed readings, Q&A, discussion prompts, and exportable class handouts."],
      ["Semantic Concept Graph", "Connect terms like Brahma, Citta, Puruśa, Prakrti, Dharma, and related passages."],
      ["Offline AI Index", "A compact local passage index for faster source-grounded answers without internet."],
      ["Voice Lab", "Record your own consented voice and export a custom TTS training dataset."],
      ["Study Missions", "7-day guided programs for Sadhana, PROUT, Neohumanism, Ananda Sutram, and Shloka memorization."],
      ["Reading Groups", "Share collections, notes, and class playlists by exported file or sync endpoint."],
      ["Release Dashboard", "Content health, missing references, pronunciation errors, and user correction review."],
      ["Premium Tablet Layout", "Two-pane library/reader, floating glossary, and side-by-side source Q&A."],
    ];
    let body = `<section class="hero hero-compact"><h1>Study Tools</h1>
      <p class="hero-sub">All 20 reading, listening, study, quote, and export features in one place.</p>
      <div class="hero-actions">
        ${firstRecent ? `<button type="button" class="btn btn-gold" id="btnToolsResume">Resume reading</button>` : `<a class="btn btn-gold" href="#library">Open library</a>`}
        <a class="btn btn-ghost" href="#audio">Audio queue (${queueCount})</a>
      </div></section>
      <section class="modern-card"><h3>Daily setup</h3>
        <div class="quick-grid">
          <label>Minutes<input type="number" id="toolsDailyMinutes" min="3" max="90" value="${api.state.dailyTools?.minutes || 12}" /></label>
          <label>Path<select id="toolsDailyPath">${(window.AmpsFeatures?.LEARNING_PATHS || []).map(p => `<option value="${api.esc(p.id)}" ${api.state.dailyTools?.path === p.id ? "selected" : ""}>${api.esc(p.title)}</option>`).join("")}</select></label>
        </div>
        <label class="check-row"><input type="checkbox" id="toolsDailyAudio" ${api.state.dailyTools?.includeAudio !== false ? "checked" : ""} /> Include audio listening</label>
        <label class="check-row"><input type="checkbox" id="toolsDailyCards" ${api.state.dailyTools?.includeFlashcards !== false ? "checked" : ""} /> Include flashcards</label>
      </section>
      <section class="modern-card"><h3>Feature checklist</h3><div class="feature-checklist">
        ${toolItems.map((it, i) => `<a class="feature-check" href="${it[2]}"><strong>${i + 1}. ${api.esc(it[0])}</strong><small>${api.esc(it[1])}</small></a>`).join("")}
      </div></section>
      <section class="modern-card"><h3>Next features to add</h3><div class="feature-checklist">
        ${nextFeatures.map((it, i) => `<div class="feature-check"><strong>${i + 1}. ${api.esc(it[0])}</strong><small>${api.esc(it[1])}</small></div>`).join("")}
      </div></section>`;
    api.renderShell(body, {
      title: "Study Tools",
      tab: "more",
      bind: () => {
        document.getElementById("btnToolsResume")?.addEventListener("click", () => {
          api.navigate("read", { bookId: firstRecent.book.id, chapterId: firstRecent.progress.chapterId || undefined, paraId: firstRecent.progress.paraId || undefined });
        });
        const saveDaily = () => {
          api.state.dailyTools = {
            minutes: Math.max(3, Math.min(90, +(document.getElementById("toolsDailyMinutes")?.value || 12))),
            path: document.getElementById("toolsDailyPath")?.value || "beginner",
            includeAudio: !!document.getElementById("toolsDailyAudio")?.checked,
            includeFlashcards: !!document.getElementById("toolsDailyCards")?.checked,
          };
          api.saveState();
        };
        ["toolsDailyMinutes", "toolsDailyPath", "toolsDailyAudio", "toolsDailyCards"].forEach(id => {
          document.getElementById(id)?.addEventListener("change", saveDaily);
        });
      },
    });
  }

  async function renderQaBank() {
    const parts = api.state.params.parts || [];
    const bookId = parts[1] || api.state.params.qaBook || continueItems()[0]?.book?.id || api.state.catalog?.books?.[0]?.id;
    const book = bookId ? await api.loadBook(bookId) : null;
    const chapterId = parts[2] || api.state.params.qaChapter || book?.chapters?.[0]?.id;
    const ch = book?.chapters?.find(c => c.id === chapterId) || book?.chapters?.[0];
    const questions = ch ? sourceQuestions(ch.paragraphs, 12) : [];
    let body = `<section class="hero hero-compact"><h1>Q&A Bank</h1>
      <p class="hero-sub">Questions and answers extracted from the selected chapter itself.</p></section>
      <div class="settings-panel">
        <label>Book<select id="qaBook">${bookOptions(bookId)}</select></label>
        <label>Chapter<select id="qaChapter">${(book?.chapters || []).map(c => `<option value="${api.esc(c.id)}" ${c.id === ch?.id ? "selected" : ""}>${api.esc(c.title)}</option>`).join("")}</select></label>
      </div>
      <section class="modern-card"><p class="hero-eyebrow">${api.esc(book?.title || "")}</p><h3>${api.esc(ch?.title || "")}</h3>
        <div class="qa-list">${questions.map((qa, i) => `<details class="qa-item">
          <summary><span>${i + 1}. ${api.esc(qa.question)}</span><strong>Answer</strong></summary>
          <blockquote>${api.esc(qa.answer)}</blockquote>
          <button type="button" class="btn btn-ghost btn-sm" data-answer-para="${api.esc(qa.paraId || "")}">Open source</button>
        </details>`).join("")}</div>
      </section>`;
    api.renderShell(body, {
      title: "Q&A Bank",
      tab: "more",
      bind: () => {
        document.getElementById("qaBook")?.addEventListener("change", e => api.navigate("qa-bank", { bookId: e.target.value }));
        document.getElementById("qaChapter")?.addEventListener("change", e => api.navigate("qa-bank", { bookId, chapterId: e.target.value }));
        document.querySelectorAll("[data-answer-para]").forEach(btn => btn.addEventListener("click", () => api.navigate("read", {
          bookId,
          chapterId: ch.id,
          paraId: btn.dataset.answerPara || undefined,
        })));
      },
    });
  }

  async function renderExam() {
    const bookId = api.state.params.parts?.[1] || continueItems()[0]?.book?.id || "ananda-sutram";
    const book = await api.loadBook(bookId);
    const ch = book.chapters?.find(c => c.id === api.state.params.parts?.[2]) || book.chapters?.[0];
    const questions = sourceQuestions(ch?.paragraphs || [], 8);
    let body = `<section class="hero hero-compact"><h1>Practice Exam</h1>
      <p class="hero-sub">Timed self-test with source-backed answers and review.</p></section>
      <div class="settings-panel">
        <label>Book<select id="examBook">${bookOptions(bookId)}</select></label>
        <label>Chapter<select id="examChapter">${book.chapters.map(c => `<option value="${api.esc(c.id)}" ${c.id === ch.id ? "selected" : ""}>${api.esc(c.title)}</option>`).join("")}</select></label>
      </div>
      <section class="modern-card"><p class="hero-eyebrow">Source: ${api.esc(book.title)} - ${api.esc(ch.title)}</p>
        ${questions.map((qa, i) => `<details class="qa-item"><summary><span>${i + 1}. ${api.esc(qa.question)}</span><strong>Review</strong></summary>
        <blockquote>${api.esc(qa.answer)}</blockquote></details>`).join("")}
        <p class="muted">Use the closed questions as the exam. Open each answer only during review.</p>
      </section>`;
    api.renderShell(body, {
      title: "Practice Exam",
      tab: "more",
      bind: () => {
        document.getElementById("examBook")?.addEventListener("change", e => api.navigate("exam", { bookId: e.target.value }));
        document.getElementById("examChapter")?.addEventListener("change", e => api.navigate("exam", { bookId, chapterId: e.target.value }));
      },
    });
  }

  function renderDailyChallenge() {
    const d = todayDiscourse();
    let body = `<section class="hero hero-compact"><h1>Daily Challenge</h1>
      <p class="hero-sub">One discourse, one sútra, one shloka, one reflection.</p></section>
      <div class="today-grid">
        ${d ? `<button class="today-tile" data-book="${api.esc(d.bookId)}" data-ch="${api.esc(d.chapterId)}"><strong>Read</strong><span>${api.esc(d.title)} - ${api.esc(d.bookTitle)}</span></button>` : ""}
        <a class="today-tile" href="#sutra-game/all"><strong>Sútra Game</strong><span>Boss rush or typing challenge</span></a>
        <a class="today-tile" href="#shloka-game/b1"><strong>Shloka Game</strong><span>Review a verse batch</span></a>
        <a class="today-tile" href="#journal"><strong>Reflect</strong><span>Write one practical application</span></a>
      </div>`;
    api.renderShell(body, {
      title: "Daily Challenge",
      tab: "more",
      bind: () => document.querySelectorAll("[data-book][data-ch]").forEach(btn => btn.addEventListener("click", () => api.navigate("read", { bookId: btn.dataset.book, chapterId: btn.dataset.ch }))),
    });
  }

  function renderAchievements() {
    const streak = window.AmpsStats?.streak(api.state.stats) || 0;
    const readCount = Object.keys(api.state.progress || {}).length;
    const notes = api.state.notes?.length || 0;
    const highlights = api.state.highlights?.length || 0;
    const sutraMastered = Object.values(api.state.sutraGame?.scores || {}).reduce((n, s) => n + (s.mastered?.length || 0), 0);
    const shlokaMastered = Object.values(api.state.shlokaGame?.scores || {}).reduce((n, s) => n + (s.mastered?.length || 0), 0);
    const badges = [
      ["Daily fire", streak >= 7, `${streak} day streak`],
      ["Library explorer", readCount >= 10, `${readCount} books opened`],
      ["Notebook builder", notes >= 10, `${notes} notes`],
      ["Quote collector", highlights >= 20, `${highlights} highlights`],
      ["Sútra practitioner", sutraMastered >= 25, `${sutraMastered} sútras mastered`],
      ["Shloka practitioner", shlokaMastered >= 25, `${shlokaMastered} shlokas mastered`],
    ];
    let body = `<section class="hero hero-compact"><h1>Achievements</h1><p class="hero-sub">Local progress and mastery badges.</p></section>
      <div class="today-grid">${badges.map(([name, ok, sub]) => `<div class="today-tile ${ok ? "done-card" : ""}"><strong>${ok ? "✓ " : ""}${api.esc(name)}</strong><span>${api.esc(sub)}</span></div>`).join("")}</div>`;
    api.renderShell(body, { title: "Achievements", tab: "more" });
  }

  function renderHistory() {
    const rows = Object.entries(api.state.progress || {})
      .map(([bookId, p]) => ({ book: api.bookById(bookId), p }))
      .filter(x => x.book)
      .sort((a, b) => (b.p.updated || 0) - (a.p.updated || 0));
    let body = `<section class="hero hero-compact"><h1>Reading History</h1><p class="hero-sub">${rows.length} books with saved progress.</p></section>`;
    rows.forEach(x => {
      body += `<button type="button" class="search-hit" data-book="${api.esc(x.book.id)}" data-ch="${api.esc(x.p.chapterId || "")}">
        <strong>${api.esc(x.book.title)}</strong><span>${api.esc(x.p.chapterId || "No chapter")} - ${x.p.updated ? new Date(x.p.updated).toLocaleString() : ""}</span>
      </button>`;
    });
    api.renderShell(body, {
      title: "History",
      tab: "more",
      bind: () => document.querySelectorAll("[data-book]").forEach(btn => btn.addEventListener("click", () => api.navigate("read", { bookId: btn.dataset.book, chapterId: btn.dataset.ch || undefined }))),
    });
  }

  async function renderValidationReport() {
    const catalog = api.state.catalog;
    const issues = [];
    const checks = [
      ["Books", catalog.bookCount >= 160, `${catalog.bookCount} books`],
      ["Discourses", catalog.discourseCount >= 1900, `${catalog.discourseCount} chapters/discourses`],
      ["Glossary", catalog.glossaryTermCount >= 500, `${catalog.glossaryTermCount} terms`],
    ];
    const ananda = await api.loadBook("ananda-sutram").catch(() => null);
    const allSutras = ananda?.chapters?.find(ch => ch.id === "ch-all-sutras");
    checks.push(["All Sútras chapter", allSutras?.paragraphs?.length === 85, `${allSutras?.paragraphs?.length || 0} sútras`]);
    (catalog.books || []).forEach(b => {
      if (!b.title || !b.id) issues.push("Missing title/id: " + JSON.stringify(b));
      if (!b.chapterCount) issues.push("No chapters: " + b.title);
    });
    let body = `<section class="hero hero-compact"><h1>Content Report</h1><p class="hero-sub">Generated validation summary for the offline library.</p></section>
      <div class="today-grid">${checks.map(([name, ok, sub]) => `<div class="today-tile"><strong>${ok ? "✓" : "!"} ${api.esc(name)}</strong><span>${api.esc(sub)}</span></div>`).join("")}</div>
      <section class="modern-card"><h3>Issues</h3>${issues.length ? `<ul>${issues.slice(0, 100).map(i => `<li>${api.esc(i)}</li>`).join("")}</ul>` : `<p class="muted">No catalog issues found in quick validation.</p>`}</section>`;
    api.renderShell(body, { title: "Content Report", tab: "more" });
  }

  function renderAbout() {
    const recOn = window.AmpsLocalData?.recorderEnabled?.() !== false && window.AmpsBuildFlags?.shlokaRecorder === true;
    const slim = !!(window.AmpsBuildFlags?.slimCore || window.AmpsBuildFlags?.profileId === "slim-core");
    let body = `<section class="hero hero-compact" aria-labelledby="about-title"><h1 id="about-title">AMPS Library</h1>
      <p class="hero-sub">Offline Ananda Marga library for reading, study, glossary, notes, and packs.</p></section>
      <section class="modern-card" aria-label="About">
        <h2>Publisher</h2>
        <p>Ananda Marga Pracaraka Samgha. Copyright © Ananda Marga Pracaraka Samgha. App IDs: <code>com.amps.reader</code>. Free.</p>
        <h2>Privacy</h2>
        <p>Notes, bookmarks, reading position, packs, and settings stay on this device unless you export a backup or configure optional sync. Analytics are disabled. Diagnostics are off by default.</p>
        <p><a class="btn btn-ghost btn-sm" href="legal/privacy.html">Privacy Policy</a>
           <a class="btn btn-ghost btn-sm" href="legal/support.html">Support</a>
           <a class="btn btn-ghost btn-sm" href="#privacy-data">Local data controls</a></p>
        <p class="muted">Hosted policy: <a href="https://ampspublication.com/privacy" rel="noopener">ampspublication.com/privacy</a> · Support: <a href="mailto:dadaharii@gmail.com">dadaharii@gmail.com</a></p>
        <h2>Attribution</h2>
        <p>Texts under AMPS authority. Approved human shloka audio credited to Acharya Hariishananda Avadhuta.
           <a href="legal/attribution.html">Full attribution</a> · <a href="legal/licences.html">Open-source notices</a></p>
        <h2>This build</h2>
        <p>Profile: ${api.esc(window.AmpsBuildFlags?.profileId || (slim ? "slim-core" : "default"))}.
           Recorder/microphone: ${recOn ? "available in this build" : "excluded from this store/slim profile"}.
           Presentation Builder: ${window.AmpsBuildFlags?.presentationBuilder === false ? "excluded" : "limited public builder may be available"}.</p>
        <p>Version / data: ${api.esc(window.AmpsEnhance?.libraryVersion?.() || "unknown")}</p>
        <h2>Distribution</h2>
        <p>${slim ? "Slim-core closed-beta candidate: core books bundled; install packs for more." : "Full or default build may include a larger offline library for institutional use."}
           Store uploads and production signing are not authorised in this candidate.</p>
      </section>`;
    api.renderShell(body, { title: "About", tab: "more" });
  }

  function renderPrivacyData() {
    const recOn = window.AmpsLocalData?.recorderEnabled?.() === true;
    let body = `<section class="hero hero-compact" aria-labelledby="privacy-data-title"><h1 id="privacy-data-title">Privacy &amp; local data</h1>
      <p class="hero-sub">Export or delete app-managed data on this device. Pack removal never deletes notes or bookmarks.</p></section>
      <div class="settings-panel" role="region" aria-label="Local data controls">
        <h2 class="settings-section-title">Export</h2>
        <button type="button" class="btn btn-gold" id="btnLdExportFull">Export full backup</button>
        <button type="button" class="btn btn-ghost" id="btnLdExportNotes">Export notes</button>
        <button type="button" class="btn btn-ghost" id="btnLdExportBookmarks">Export bookmarks</button>
        <button type="button" class="btn btn-ghost" id="btnLdExportReading">Export reading state</button>
        <hr class="settings-divider" />
        <h2 class="settings-section-title">Delete (with confirmation)</h2>
        <button type="button" class="btn btn-ghost" id="btnLdClearNotes">Clear notes</button>
        <button type="button" class="btn btn-ghost" id="btnLdClearBookmarks">Clear bookmarks</button>
        <button type="button" class="btn btn-ghost" id="btnLdClearReading">Clear reading history</button>
        <button type="button" class="btn btn-ghost" id="btnLdClearPacks">Clear downloaded packs</button>
        <button type="button" class="btn btn-ghost" id="btnLdClearCaches">Clear obsolete caches</button>
        ${recOn ? `<button type="button" class="btn btn-ghost" id="btnLdClearRecordings">Delete local recordings</button>` : `<p class="muted">Local recordings controls are omitted because the recorder is excluded from this build.</p>`}
        <button type="button" class="btn btn-ghost" id="btnLdResetAll">Reset all local app data</button>
        <p class="muted" id="ldResult" role="status" aria-live="polite"></p>
        <p><a href="legal/data-controls.html">Help: export &amp; deletion</a> · <a href="legal/offline-data.html">Offline storage</a> · <a href="legal/packs-security.html">Pack security</a></p>
      </div>`;
    function say(msg) {
      const el = document.getElementById("ldResult");
      if (el) el.textContent = msg;
    }
    async function confirmAct(message, fn) {
      if (!confirm(message)) {
        say("Cancelled.");
        return;
      }
      try {
        const r = await fn();
        if (r?.ok === false) say(`Error: ${r.error || "failed"}`);
        else say(`Done: ${r?.what || "completed"}.`);
        if (r?.reload) location.reload();
      } catch (e) {
        say(`Error: ${e && e.message || e}`);
      }
    }
    api.renderShell(body, {
      title: "Privacy & local data",
      tab: "more",
      bind: () => {
        const st = api.state;
        const save = () => api.saveState();
        document.getElementById("btnLdExportFull")?.addEventListener("click", () => say(`Exported: ${window.AmpsLocalData.exportFullBackup(st).what}`));
        document.getElementById("btnLdExportNotes")?.addEventListener("click", () => say(`Exported: ${window.AmpsLocalData.exportNotes(st).what}`));
        document.getElementById("btnLdExportBookmarks")?.addEventListener("click", () => say(`Exported: ${window.AmpsLocalData.exportBookmarks(st).what}`));
        document.getElementById("btnLdExportReading")?.addEventListener("click", () => say(`Exported: ${window.AmpsLocalData.exportReadingState(st).what}`));
        document.getElementById("btnLdClearNotes")?.addEventListener("click", () => confirmAct("Delete ALL notes on this device? This cannot be undone.", () => window.AmpsLocalData.clearNotes(st, save)));
        document.getElementById("btnLdClearBookmarks")?.addEventListener("click", () => confirmAct("Delete ALL bookmarks on this device?", () => window.AmpsLocalData.clearBookmarks(st, save)));
        document.getElementById("btnLdClearReading")?.addEventListener("click", () => confirmAct("Clear reading history and resume positions? Notes and bookmarks are kept.", () => window.AmpsLocalData.clearReadingHistory(st, save)));
        document.getElementById("btnLdClearPacks")?.addEventListener("click", () => confirmAct("Remove all downloaded packs? Notes and bookmarks are NOT deleted.", () => window.AmpsLocalData.clearDownloadedPacks()));
        document.getElementById("btnLdClearCaches")?.addEventListener("click", () => confirmAct("Clear obsolete shell/pack-temp caches?", () => window.AmpsLocalData.clearCaches()));
        document.getElementById("btnLdClearRecordings")?.addEventListener("click", () => confirmAct("Delete local shloka recordings stored in this app?", () => window.AmpsLocalData.clearLocalRecordingsIfPresent()));
        document.getElementById("btnLdResetAll")?.addEventListener("click", () => confirmAct("Reset ALL local app data (notes, bookmarks, progress, settings)? The page will reload.", () => {
          const r = window.AmpsLocalData.resetAllLocalAppData();
          r.reload = true;
          return r;
        }));
      },
    });
  }

  function install(app) {
    api = app;
    api.renderToday = renderToday;
    api.renderCompanion = renderCompanion;
    api.renderSmartSearch = renderSmartSearch;
    api.renderAudio = renderAudio;
    api.renderVoiceLab = renderVoiceLab;
    api.renderToolsDashboard = renderToolsDashboard;
    api.renderJournalPrompt = renderJournalPrompt;
    api.renderQuoteMaker = renderQuoteMaker;
    api.renderTeacher = renderTeacher;
    api.renderBackup = renderBackup;
    api.renderQaBank = renderQaBank;
    api.renderExam = renderExam;
    api.renderDailyChallenge = renderDailyChallenge;
    api.renderAchievements = renderAchievements;
    api.renderHistory = renderHistory;
    api.renderValidationReport = renderValidationReport;
    api.renderAbout = renderAbout;
    api.renderPrivacyData = renderPrivacyData;
  }

  window.AmpsModern = {
    install,
    renderToday: () => api?.renderToday(),
    renderCompanion: () => api?.renderCompanion(),
    renderSmartSearch: () => api?.renderSmartSearch(),
    renderAudio: () => api?.renderAudio(),
    renderVoiceLab: () => api?.renderVoiceLab(),
    renderToolsDashboard: () => api?.renderToolsDashboard(),
    renderJournalPrompt: () => api?.renderJournalPrompt(),
    renderQuoteMaker: () => api?.renderQuoteMaker(),
    renderTeacher: () => api?.renderTeacher(),
    renderBackup: () => api?.renderBackup(),
    renderQaBank: () => api?.renderQaBank(),
    renderExam: () => api?.renderExam(),
    renderDailyChallenge: () => api?.renderDailyChallenge(),
    renderAchievements: () => api?.renderAchievements(),
    renderHistory: () => api?.renderHistory(),
    renderValidationReport: () => api?.renderValidationReport(),
    renderAbout: () => api?.renderAbout(),
    renderPrivacyData: () => api?.renderPrivacyData(),
  };
})();

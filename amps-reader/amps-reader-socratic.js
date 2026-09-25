"use strict";

(function () {
  let api = null;

  const MODE_CARDS = [
    ["ask", "Ask Me", "Question-based reading from the selected chapter."],
    ["why", "5 Whys", "Go deeper into one idea step by step."],
    ["doubt", "Doubt Clearing", "Clarify what is confusing before looking for an answer."],
    ["circle", "Dharma Cakra Circle", "Opening reflection, group questions, and closing thought."],
    ["new", "Teach Me Like New", "Gentle beginner questions for difficult philosophy."],
    ["journal", "Self-Reflection", "Save what touched you and what you will practise."],
  ];

  const TOPIC_HINTS = [
    ["sadhana", ["sadhana", "sádhaná", "meditation", "spiritual practice", "practice"]],
    ["service", ["service", "seva", "sevá", "serve", "society", "welfare"]],
    ["devotion", ["devotion", "bhakti", "love", "guru", "parama puruśa", "parabrahma"]],
    ["mind", ["mind", "citta", "aham", "mahattattva", "consciousness", "thought"]],
    ["conduct", ["yama", "niyama", "morality", "dharma", "character", "discipline"]],
  ];

  function esc(value) {
    return api?.esc ? api.esc(value) : String(value || "").replace(/[&<"]/g, ch => ({ "&": "&amp;", "<": "&lt;", '"': "&quot;" }[ch]));
  }

  function clean(value) {
    return String(value || "")
      .replace(/\u0000/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function paraText(paragraph) {
    if (!paragraph) return "";
    if (typeof paragraph === "string") return clean(paragraph);
    return clean(paragraph.text || paragraph.html || paragraph.content || "");
  }

  function chapterParagraphs(chapter) {
    const paragraphs = Array.isArray(chapter?.paragraphs) ? chapter.paragraphs : [];
    return paragraphs.map(paraText).filter(text => text.length > 70);
  }

  function titleOf(item, fallback) {
    return clean(item?.title || item?.name || fallback || "");
  }

  function firstProgressBookId() {
    const progress = api?.state?.progress || {};
    let best = null;
    Object.entries(progress).forEach(([bookId, entry]) => {
      const stamp = Number(entry?.lastReadAt || entry?.updatedAt || entry?.time || 0);
      if (!best || stamp > best.stamp) best = { bookId, stamp };
    });
    return best?.bookId || "";
  }

  async function selectedContext() {
    await api.loadCatalog?.();
    const routeParts = api.state?.params?.parts || [];
    const catalogBookId = api.state?.catalog?.books?.[0]?.id || "";
    const bookId = routeParts[1] || api.state?.params?.bookId || firstProgressBookId() || catalogBookId;
    const book = await api.loadBook(bookId);
    const progressChapterId = api.state?.progress?.[bookId]?.chapterId || "";
    const chapterId = routeParts[2] || api.state?.params?.chapterId || progressChapterId || book?.chapters?.[0]?.id || "";
    const chapter = (book?.chapters || []).find(ch => ch.id === chapterId) || book?.chapters?.[0] || null;
    return { book, chapter, paragraphs: chapterParagraphs(chapter) };
  }

  function topicFor(text) {
    const lower = clean(text).toLowerCase();
    const match = TOPIC_HINTS.find(([, words]) => words.some(word => lower.includes(word)));
    return match?.[0] || "teaching";
  }

  function sentenceSeed(text) {
    const sentences = clean(text).split(/(?<=[.!?।॥])\s+/).filter(s => s.length > 30);
    return sentences[0] || clean(text).slice(0, 180);
  }

  function askQuestions(paragraphs) {
    const seeds = paragraphs.slice(0, 6);
    if (!seeds.length) {
      return ["What is the central idea of this chapter?", "Which word or concept needs more study?", "How can this teaching become practice today?"];
    }
    return seeds.map((text, index) => {
      const topic = topicFor(text);
      const stem = sentenceSeed(text);
      const templates = {
        sadhana: "How does this passage guide your daily sádhaná?",
        service: "What kind of service does this passage invite in practical life?",
        devotion: "What does this passage reveal about devotion or surrender?",
        mind: "What does this passage ask you to observe about the mind?",
        conduct: "Which conduct or discipline is being strengthened here?",
        teaching: "What is the main idea of this paragraph?",
      };
      return `${index + 1}. ${templates[topic]}\n“${stem}”`;
    });
  }

  function whyChain(paragraphs) {
    const seed = sentenceSeed(paragraphs[0] || "");
    const topic = topicFor(seed);
    const base = {
      sadhana: "daily spiritual practice",
      service: "selfless service",
      devotion: "devotion",
      mind: "understanding the mind",
      conduct: "right conduct",
      teaching: "this teaching",
    }[topic];
    return [
      `Why is ${base} important here?`,
      `Why might the mind resist this lesson?`,
      `Why does regular practice matter more than only occasional inspiration?`,
      `Why would this teaching change behaviour, not only thinking?`,
      `Why is this connected with inner realisation?`,
    ];
  }

  function beginnerDialogue(paragraphs) {
    const topic = topicFor(paragraphs.join(" ").slice(0, 1000));
    const concept = {
      sadhana: "sádhaná",
      service: "service",
      devotion: "devotion",
      mind: "mind",
      conduct: "dharma",
      teaching: "this idea",
    }[topic];
    return [
      `Beginner: I am new. Why should I study ${concept}?`,
      "Guide: Before answering, what do you already notice in your own life?",
      `Beginner: How can ${concept} become practical, not only theory?`,
      "Guide: Which one small action can you try today and observe sincerely?",
      "Beginner: What should I read again if I still do not understand?",
      "Guide: Return to the paragraph that felt difficult and ask: what is it asking me to become?",
    ];
  }

  function circlePlan(paragraphs) {
    const asks = askQuestions(paragraphs).slice(0, 5).map(q => q.replace(/^\d+\.\s*/, "").split("\n")[0]);
    return [
      "Opening reflection: Read one selected paragraph slowly and sit silently for one minute.",
      ...asks,
      "Group activity: Each person shares one sentence they can practise this week.",
      "Closing thought: Knowledge becomes living wisdom when it changes conduct.",
    ];
  }

  function weakAreaQuiz() {
    return [
      ["daily_reading", "Do I read at least a little every day?"],
      ["understanding", "Can I explain the main idea in my own words?"],
      ["sadhana", "Did this reading support my sádhaná or inner practice?"],
      ["service", "Did I find one practical service idea?"],
      ["question", "Did I note one honest question for later study?"],
    ];
  }

  function selectedMode() {
    return api?.state?.ui?.socraticMode || "ask";
  }

  function setMode(mode) {
    api.state.ui = api.state.ui || {};
    api.state.ui.socraticMode = mode;
    api.saveState?.();
    api.renderFromState?.();
  }

  function saveReflection(ctx) {
    const value = clean(document.getElementById("socraticReflection")?.value || "");
    if (!value) return;
    api.state.journal = Array.isArray(api.state.journal) ? api.state.journal : [];
    api.state.journal.unshift({
      id: api.uid?.() || `soc-${Date.now()}`,
      type: "socratic",
      text: value,
      bookId: ctx.book?.id || "",
      chapterId: ctx.chapter?.id || "",
      title: `${titleOf(ctx.book, "Book")} · ${titleOf(ctx.chapter, "Chapter")}`,
      createdAt: new Date().toISOString(),
    });
    api.saveState?.();
    api.renderFromState?.();
  }

  function listHtml(items) {
    return `<ol class="settings-list">${items.map(item => `<li>${esc(item)}</li>`).join("")}</ol>`;
  }

  function modeBody(mode, ctx) {
    if (mode === "why") return listHtml(whyChain(ctx.paragraphs));
    if (mode === "doubt") {
      return listHtml([
        "What exactly feels unclear: a word, a sentence, or the whole idea?",
        "Which passage created the doubt?",
        "What do you currently think it means?",
        "What would change in practice if this became clear?",
        "Which chapter paragraph should you reread before asking someone?",
      ]);
    }
    if (mode === "circle") return listHtml(circlePlan(ctx.paragraphs));
    if (mode === "new") return listHtml(beginnerDialogue(ctx.paragraphs));
    if (mode === "journal") {
      return `<div class="settings-panel">
        <label class="field-label" for="socraticReflection">My reflection</label>
        <textarea id="socraticReflection" rows="8" placeholder="What touched me? What did I not understand? What will I practise today?"></textarea>
        <button type="button" class="btn btn-gold" id="btnSaveSocraticReflection">Save to Spiritual Journal</button>
      </div>`;
    }
    return listHtml(askQuestions(ctx.paragraphs));
  }

  function quizHtml() {
    return `<div class="settings-panel">
      <h3>Find My Weak Area</h3>
      <div class="check-list">
        ${weakAreaQuiz().map(([id, label]) => `<label><input type="checkbox" data-weak="${esc(id)}"> ${esc(label)}</label>`).join("")}
      </div>
      <p class="muted" id="weakAreaResult">Tick what is already strong. The guide will suggest the next focus.</p>
      <button type="button" class="btn btn-ghost" id="btnWeakArea">Show focus</button>
    </div>`;
  }

  function bind(ctx) {
    document.querySelectorAll("[data-socratic-mode]").forEach(btn => {
      btn.addEventListener("click", () => setMode(btn.dataset.socraticMode));
    });
    document.getElementById("btnSaveSocraticReflection")?.addEventListener("click", () => saveReflection(ctx));
    document.getElementById("btnWeakArea")?.addEventListener("click", () => {
      const checked = new Set(Array.from(document.querySelectorAll("[data-weak]:checked")).map(el => el.dataset.weak));
      const result = document.getElementById("weakAreaResult");
      if (!result) return;
      if (!checked.has("daily_reading")) result.textContent = "Current focus: daily reading. Start with one paragraph and one question each day.";
      else if (!checked.has("understanding")) result.textContent = "Current focus: understanding. Use Ask Me mode and explain each paragraph in your own words.";
      else if (!checked.has("sadhana")) result.textContent = "Current focus: sádhaná connection. After reading, write one way the teaching supports practice.";
      else if (!checked.has("service")) result.textContent = "Current focus: service. Use Dharma Cakra Circle mode and choose one practical action.";
      else if (!checked.has("question")) result.textContent = "Current focus: deeper inquiry. Save one honest question in your journal after each chapter.";
      else result.textContent = "Strong foundation. Continue with 5 Whys or Dharma Cakra Circle for deeper study.";
    });
  }

  async function renderGuide() {
    const ctx = await selectedContext();
    const mode = selectedMode();
    const modeCards = MODE_CARDS.map(([id, title, desc]) => `
      <button type="button" class="more-item ${mode === id ? "active" : ""}" data-socratic-mode="${esc(id)}">
        <span>${id === "why" ? "5" : title.charAt(0)}</span><strong>${esc(title)}</strong><small>${esc(desc)}</small>
      </button>`).join("");
    const body = `<section class="hero hero-compact">
        <h1>Socratic Guide</h1>
        <p>Question-based study from the selected chapter. Offline, gentle, and saved locally.</p>
      </section>
      <section class="settings-panel">
        <p class="section-label">Selected source</p>
        <h2>${esc(titleOf(ctx.book, "Book"))}</h2>
        <p class="muted">${esc(titleOf(ctx.chapter, "Chapter"))}</p>
        <div class="row gap">
          <a href="#read/${encodeURIComponent(ctx.book?.id || "")}/${encodeURIComponent(ctx.chapter?.id || "")}" class="btn btn-ghost">Open chapter</a>
          <a href="#journal" class="btn btn-ghost">Open journal</a>
        </div>
      </section>
      <p class="section-label">Learning modes</p>
      <div class="more-grid">${modeCards}</div>
      <section class="settings-panel">
        <h3>${esc(MODE_CARDS.find(card => card[0] === mode)?.[1] || "Ask Me")}</h3>
        ${modeBody(mode, ctx)}
      </section>
      ${quizHtml()}`;
    api.renderShell(body, { title: "Socratic Guide", tab: "more", bind: () => bind(ctx) });
  }

  window.AmpsSocratic = {
    install(nextApi) {
      api = nextApi;
    },
    renderGuide,
  };
})();

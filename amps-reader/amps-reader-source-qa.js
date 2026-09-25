/* AMPS Reader — Ask Question (free, offline, library-cited; no LLM / no cloud cost) */
(function () {
  "use strict";

  let api = null;
  const STOP = new Set("a an the and or but in on at to for of is are was were be been being with from by as it its this that these those not what how why when where which who does do did can could would should about into onto over under kya hai ke ki se mein me".split(" "));

  const TOPIC_EXPAND = {
    yoga: ["yoga", "yogic", "asana", "asanas", "meditation", "sadhana", "health", "body", "mind", "spirit", "union", "samyogo", "योग", "साधना", "आसन"],
    sadhana: ["sadhana", "meditation", "spiritual practice", "intuition", "mind", "mantra", "sádhaná", "साधना"],
    devotion: ["devotion", "bhakti", "love", "paroma purusa", "baba", "grace", "ideation", "भक्ति"],
    prout: ["prout", "economy", "cooperative", "society", "social", "exploitation", "economic", "प्रउट"],
    neohumanism: ["neohumanism", "humanism", "intellect", "education", "universalism", "नवमानवतावाद"],
    conduct: ["conduct", "discipline", "morality", "ethics", "character", "dharma", "yama", "niyama", "आचार", "यम", "नियम"],
    service: ["service", "seva", "humanity", "welfare", "society", "duty", "सेवा"],
    fear: ["fear", "courage", "struggle", "optimism", "strength"],
    food: ["food", "diet", "health", "yogic", "treatment", "farming", "आहार"],
    health: ["health", "body", "disease", "treatment", "yoga", "food", "mind", "स्वास्थ्य"],
    society: ["society", "social", "community", "family", "duty", "cooperation", "समाज"],
    economics: ["economics", "economy", "prout", "poverty", "unemployment", "money", "work", "अर्थव्यवस्था"],
    ecology: ["ecology", "environment", "plants", "animals", "nature", "earth", "पर्यावरण"],
    citta: ["citta", "mind", "psychic", "mental", "vrtti", "samskara"],
    prapatti: ["prapatti", "surrender", "devotion", "grace", "ideation"],
    mantra: ["mantra", "ishta", "ideation", "japa", "kiirtan"],
  };

  const EXAMPLE_QUESTIONS = [
    "Why is Yoga beneficial?",
    "What is the benefit of Yama and Niyama?",
    "What does PROUT say about economic exploitation?",
    "How should we live in society?",
    "What is Neohumanism?",
    "योग के क्या लाभ हैं?",
  ];

  const FOOTNOTE_RE = /\b(the foregoing|elsewhere,? the author|originally published|english re-editing|tape\.|second english publication|readers will be benefited if they read)\b/i;
  const INSTRUCTION_RE = /\b(ásanas must not be practiced|dos and don'ts|massaging shavásana|must not be practiced without)\b/i;
  const DEFINITION_RE = /\b(means|is called|yoga means|fundamental goal|unification|union of|definition|defined|keeps the body healthy|cures many|helps? a|purpose of|good both for)\b/i;
  const BENEFIT_RE = /\b(benefit|benefits|healthy|health|cures|helps|concentrate|balance|welfare|progress|useful|good for|mind|body|spirit|union|unification)\b/i;

  function install(appApi) {
    api = appApi;
  }

  function esc(s) {
    return api?.esc ? api.esc(s) : String(s ?? "");
  }

  async function getCatalogBooks() {
    const fromState = api?.state?.catalog?.books;
    if (Array.isArray(fromState) && fromState.length) return fromState;
    try {
      const url = api?.readerAssetUrl?.("data/catalog.json") || "data/catalog.json";
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) return [];
      const cat = await res.json();
      const books = cat?.books || [];
      if (api?.state) {
        if (!api.state.catalog) api.state.catalog = cat;
        else if (!api.state.catalog.books) api.state.catalog.books = books;
      }
      return books;
    } catch (_) {
      return [];
    }
  }

  function baseTokens(q) {
    return String(q || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s\u0900-\u097F]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP.has(w));
  }

  function detectIntent(question) {
    const q = String(question || "").toLowerCase();
    return {
      benefit: /\b(benefit|benefits|fayda|लाभ|advantage|helpful|useful|why|kyun|क्यों)\b/i.test(q),
      whatIs: /\b(what is|what are|define|meaning|kya hai|क्या है|क्या हैं)\b/i.test(q),
      how: /\b(how|kaise|कैसे)\b/i.test(q),
      yoga: /\byoga|yogic|asana|योग|आसन\b/i.test(q),
      yama: /\byama|niyama|यम|नियम\b/i.test(q),
      prout: /\bprout|econom|exploit|प्रउट\b/i.test(q),
      neo: /\bneohuman|नवमानव\b/i.test(q),
      society: /\bsociety|social|समाज\b/i.test(q),
    };
  }

  function expandQueryTokens(question) {
    const base = baseTokens(question);
    const expanded = new Set(base);
    const lower = String(question || "").toLowerCase();
    const intent = detectIntent(question);

    Object.keys(TOPIC_EXPAND).forEach(topic => {
      if (lower.includes(topic) || base.includes(topic)) {
        TOPIC_EXPAND[topic].forEach(t => expanded.add(String(t).toLowerCase()));
      }
    });

    if (intent.benefit) {
      ["benefit", "benefits", "helps", "useful", "foundation", "लाभ"].forEach(t => expanded.add(t));
      if (intent.yoga) {
        ["health", "healthy", "mind", "body", "cures", "concentrate", "union", "स्वास्थ्य"].forEach(t => expanded.add(t));
      }
      if (intent.yama) {
        ["society", "moral", "morality", "character", "foundation", "cooperative"].forEach(t => expanded.add(t));
      }
    }
    if (intent.yoga && !intent.yama) {
      ["yoga", "asana", "asanas", "sadhana", "sádhaná", "samyogo", "unification", "union", "meditation", "yogic"].forEach(t => expanded.add(t));
    }
    if (intent.yama) {
      ["yama", "niyama", "morality", "conduct", "brahmacarya", "dharma", "society", "foundation"].forEach(t => expanded.add(t));
    }

    base.forEach(tok => {
      Object.keys(TOPIC_EXPAND).forEach(topic => {
        if (TOPIC_EXPAND[topic].some(t => t === tok || String(t).includes(tok) || tok.includes(String(t)))) {
          TOPIC_EXPAND[topic].forEach(t => expanded.add(String(t).toLowerCase()));
        }
      });
    });

    try {
      const modernTopics = window.AmpsModern?.TOPICS;
      if (modernTopics) {
        Object.keys(modernTopics).forEach(topic => {
          if (lower.includes(topic) || base.includes(topic)) {
            (modernTopics[topic] || []).forEach(t => expanded.add(String(t).toLowerCase()));
          }
        });
      }
    } catch (_) { /* */ }

    return [...expanded];
  }

  async function loadSearchShard(bookId) {
    try {
      const url = api?.readerAssetUrl?.(`data/search/${bookId}.json`) || `data/search/${bookId}.json`;
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) return [];
      return res.json();
    } catch (_) {
      return [];
    }
  }

  function scorePassage(text, queryTokens, idf) {
    if (!queryTokens.length) return 0;
    const hay = String(text || "").toLowerCase();
    if (!hay) return 0;
    const words = hay.split(/\s+/).filter(Boolean);
    const tf = Object.create(null);
    words.forEach(w => { tf[w] = (tf[w] || 0) + 1; });
    let score = 0;
    let matched = 0;
    queryTokens.forEach(t => {
      const weight = idf?.[t] || (t.length > 5 ? 2.4 : 1.6);
      if (hay.includes(t)) {
        matched += 1;
        const exact = tf[t] || 0;
        score += weight * (1 + Math.log(1 + exact));
        if (exact) score += 0.35;
      }
    });
    if (!matched) return 0;
    score *= 1 + (matched / queryTokens.length);
    score /= Math.sqrt(1 + words.length / 80);
    return score;
  }

  function qualityScore(text) {
    const t = String(text || "");
    const low = t.toLowerCase();
    let q = 1;
    if (FOOTNOTE_RE.test(t)) q *= 0.15;
    if (INSTRUCTION_RE.test(t)) q *= 0.25;
    if (/^\s*\(?\d+\)/.test(t) && t.length < 220) q *= 0.7;
    if (DEFINITION_RE.test(t)) q *= 1.8;
    if (BENEFIT_RE.test(low)) q *= 1.35;
    if (t.length >= 140 && t.length <= 520) q *= 1.25;
    if (t.length < 70) q *= 0.5;
    if (t.length > 900) q *= 0.7;
    // Prefer complete teaching sentences over numbered asana catalogs
    if (/\bsarváungásana\b|\bsvásthyásanas\b|\bdhyánásanas\b/i.test(t) && !/keeps the body healthy/i.test(t)) {
      q *= 0.55;
    }
    return q;
  }

  function intentBoost(question, row, baseScore) {
    if (!baseScore) return 0;
    let score = baseScore * qualityScore(row.t);
    const intent = detectIntent(question);
    const hay = String(row.t || "").toLowerCase();
    const bid = String(row.bookId || "");

    if (intent.yoga) {
      if (/yoga-sadhana|yoga-psychology|karma-yoga|caryacarya|guide-to-human/.test(bid)) score *= 1.45;
      if (/samyogo|unification of|fundamental goal of yoga|keeps the body healthy|cures many diseases|concentrate the mind|finite with the infinite/.test(hay)) {
        score *= 2.1;
      }
    }
    if (intent.benefit) {
      if (/keeps the body healthy|cures many|helps a sádhaka|balance the body|concentrate the mind|good both for the society|physical and psychic/.test(hay)) {
        score *= 1.9;
      }
      if (/but what is the benefit\?|káyákalpa|legs up and head down/.test(hay)) score *= 0.3;
    }
    if (intent.whatIs && /means|is called|definition|yoga means|neohumanism is|prout/.test(hay)) {
      score *= 1.6;
    }
    if (intent.yama) {
      if (/guide-to-human-conduct/.test(bid)) score *= 2.4;
      if (/ideal society depends|cooperative behaviour depends on the practice of the principles of yama|principles of yama and niyama/i.test(hay)) {
        score *= 3.0;
      }
      if (/statement regarding how far the principles of yama|date of the previous report/i.test(hay)) {
        score *= 0.2;
      }
      if (/yama|niyama|moral/.test(hay) && /guide-to-human|caryacarya|yoga-sadhana/.test(bid)) {
        score *= 1.5;
      }
    }
    if (intent.prout && /prout|exploit|economy/.test(hay)) score *= 1.4;
    if (intent.neo && /neohuman/.test(hay)) score *= 1.4;
    return score;
  }

  function buildIdf(rows, queryTokens) {
    const N = Math.max(1, rows.length);
    const df = Object.create(null);
    queryTokens.forEach(t => { df[t] = 0; });
    rows.forEach(row => {
      const hay = String(row.t || "").toLowerCase();
      queryTokens.forEach(t => {
        if (hay.includes(t)) df[t] += 1;
      });
    });
    const idf = Object.create(null);
    queryTokens.forEach(t => {
      idf[t] = Math.log(1 + N / (1 + (df[t] || 0)));
    });
    return idf;
  }

  function pickBooksForQuestion(question, catalogBooks, limit) {
    const tokens = expandQueryTokens(question);
    const lower = String(question || "").toLowerCase();
    const intent = detectIntent(question);
    const priorityIds = [];
    if (intent.yoga) {
      priorityIds.push("yoga-sadhana", "yoga-psychology", "ananda-marga-karma-yoga-in-a-nutshell", "caryacarya-3", "guide-to-human-conduct-a");
    }
    if (intent.yama || intent.conduct || /conduct|आचार/.test(lower)) {
      priorityIds.push("guide-to-human-conduct-a", "guide-to-human-conduct-a-hi", "caryacarya-1", "caryacarya-2");
    }
    if (intent.prout) priorityIds.push("prout-in-a-nutshell-1", "proutist-economics", "human-society-1");
    if (intent.neo) priorityIds.push("neohumanism-in-a-nutshell", "liberation-of-intellect");

    const scored = (catalogBooks || []).map(b => {
      const hay = `${b.title || ""} ${b.series || ""} ${b.seriesTitle || ""} ${(b.searchKeywords || []).join(" ")}`.toLowerCase();
      let s = 0;
      tokens.forEach(t => {
        if (hay.includes(t)) s += 3;
      });
      if (priorityIds.includes(b.id)) s += 20;
      if (intent.yoga && /yoga|carya|sadhana|psycholog|karma yoga|conduct/.test(hay)) s += 8;
      if (intent.prout && /prout|society|neohuman|economic|renaissance|liberation/.test(hay)) s += 8;
      if ((intent.yama || /conduct|moral/.test(lower)) && /conduct|carya|guide|jiivan|jivan|moral/.test(hay)) s += 10;
      return { b, s };
    }).sort((a, b) => b.s - a.s || String(a.b.title || "").localeCompare(String(b.b.title || "")));

    const out = [];
    const seen = new Set();
    // Always put priority books first when present
    priorityIds.forEach(id => {
      const found = (catalogBooks || []).find(b => b.id === id);
      if (found && !seen.has(id)) {
        seen.add(id);
        out.push(found);
      }
    });
    scored.filter(x => x.s > 0).forEach(x => {
      if (out.length >= limit) return;
      if (seen.has(x.b.id)) return;
      seen.add(x.b.id);
      out.push(x.b);
    });
    for (const b of catalogBooks || []) {
      if (out.length >= limit) break;
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      out.push(b);
    }
    return out;
  }

  function splitSentences(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .split(/(?<=[.!?।])\s+/)
      .map(s => s.trim())
      .filter(s => s.length >= 40);
  }

  function bestSentencesFromPassage(passage, question, limit) {
    const intent = detectIntent(question);
    const qTokens = expandQueryTokens(question);
    const scored = splitSentences(passage).map(s => {
      const low = s.toLowerCase();
      let score = 0;
      qTokens.forEach(t => { if (low.includes(t)) score += 2; });
      if (DEFINITION_RE.test(s)) score += 4;
      if (intent.benefit && BENEFIT_RE.test(low)) score += 5;
      if (FOOTNOTE_RE.test(s) || INSTRUCTION_RE.test(s)) score -= 8;
      if (/samyogo|keeps the body healthy|fundamental goal|unification of|finite with the infinite/i.test(s)) score += 8;
      if (/ideal society depends|sound foundation of an ideal society|cooperative behaviour depends on the practice of the principles of yama/i.test(s)) score += 12;
      score += Math.min(3, s.length / 120);
      return { s, score };
    }).filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);

    const out = [];
    const seen = new Set();
    for (const item of scored) {
      const key = item.s.slice(0, 60).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item.s);
      if (out.length >= limit) break;
    }
    return out;
  }

  function diversifyHits(hits, limit) {
    const out = [];
    const bookCount = Object.create(null);
    const themeUsed = new Set();

    function themeKey(t) {
      const low = String(t || "").toLowerCase();
      if (/samyogo|unification|fundamental goal|finite with the infinite/.test(low)) return "definition";
      if (/keeps the body healthy|cures many|glands|hormones|asanas help/.test(low)) return "physical";
      if (/society|service|welfare|contact with the lord/.test(low)) return "social";
      if (/yama|niyama|moral|conduct/.test(low)) return "conduct";
      if (/mind|psychic|concentrate|meditation|sádhaná|sadhana/.test(low)) return "mind";
      return "other";
    }

    // Prefer high quality + diverse themes/books
    const ranked = [...hits].sort((a, b) => b.score - a.score);
    for (const h of ranked) {
      if (out.length >= limit) break;
      const theme = themeKey(h.t);
      const bc = bookCount[h.bookId] || 0;
      if (bc >= 2 && out.length >= Math.ceil(limit / 2)) continue;
      // Soft diversity: prefer new themes early, but never drop top teaching hits forever
      if (themeUsed.has(theme) && theme !== "other" && out.length < Math.min(3, limit - 1)) {
        continue;
      }
      themeUsed.add(theme);
      bookCount[h.bookId] = bc + 1;
      out.push(h);
    }
    // Fill remaining
    for (const h of ranked) {
      if (out.length >= limit) break;
      if (out.includes(h)) continue;
      out.push(h);
    }
    return out;
  }

  function synthesizeAnswer(question, citations, scopeLabel) {
    if (!citations.length) {
      return "No matching passages found in this scope.\n\nTips:\n• Use key words (Yoga, Yama, PROUT, society, sadhana)\n• Try English or Hindi terms from the books\n• Keep “Search whole library” checked\n\nThis free tool answers only from the AMPS Library (offline). No paid AI.";
    }

    const intent = detectIntent(question);
    const points = [];
    const used = new Set();

    citations.forEach(c => {
      const sentences = bestSentencesFromPassage(c.fullText || c.excerpt, question, 2);
      sentences.forEach(s => {
        const key = s.slice(0, 70).toLowerCase();
        if (used.has(key)) return;
        used.add(key);
        points.push({ n: c.n, text: s.replace(/\s+/g, " ").trim() });
      });
    });

    // Fallback: use excerpts if sentence split failed
    if (!points.length) {
      citations.slice(0, 3).forEach(c => {
        points.push({ n: c.n, text: c.excerpt.replace(/\s+/g, " ").trim() });
      });
    }

    const uniquePoints = [];
    const seenPoint = new Set();
    for (const p of points) {
      const k = p.text.slice(0, 80).toLowerCase();
      if (seenPoint.has(k)) continue;
      seenPoint.add(k);
      uniquePoints.push(p);
      if (uniquePoints.length >= 4) break;
    }

    let intro = "From the AMPS Library (free, offline):";
    if (intent.yoga && (intent.benefit || intent.whatIs || intent.how)) {
      intro = "Yoga, as taught in the AMPS Library:";
    } else if (intent.benefit) {
      intro = "Key points from the AMPS Library:";
    } else if (intent.whatIs) {
      intro = "According to the AMPS Library:";
    }

    const lines = uniquePoints.map((p, i) => `${i + 1}. ${p.text} [${p.n}]`);
    return `${intro}\n\n${lines.join("\n\n")}\n\nTap a citation below to open the exact paragraph.`;
  }

  async function answerFromSource({ bookId, chapterId, question, limit, libraryWide }) {
    const qTokens = expandQueryTokens(question);
    if (!qTokens.length) {
      return { answer: "", citations: [], note: "Ask a specific question using key terms from the text." };
    }

    let rows = [];
    let bookMeta = null;
    let chapterMeta = null;

    if (libraryWide || !bookId) {
      const catalogBooks = await getCatalogBooks();
      const books = pickBooksForQuestion(question, catalogBooks, 48);
      const batch = 8;
      for (let i = 0; i < books.length; i += batch) {
        const slice = books.slice(i, i + batch);
        await Promise.all(slice.map(async b => {
          const shard = await loadSearchShard(b.id);
          shard.forEach(row => {
            rows.push({ ...row, bookId: b.id, bookTitle: b.title });
          });
        }));
      }
    } else {
      bookMeta = await api?.loadBook?.(bookId);
      chapterMeta = bookMeta?.chapters?.find(c => c.id === chapterId);
      const shard = await loadSearchShard(bookId);
      rows = shard
        .filter(row => !chapterId || row.c === chapterId)
        .map(row => ({ ...row, bookId, bookTitle: bookMeta?.title || bookId }));
    }

    const idf = buildIdf(rows, qTokens);
    const scored = rows
      .map(row => {
        const score = intentBoost(question, row, scorePassage(row.t, qTokens, idf));
        return score ? { ...row, score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    const hits = diversifyHits(scored.slice(0, 40), limit || 6);

    const citations = hits.map((h, i) => {
      const fullText = String(h.t || "").replace(/\s+/g, " ").trim();
      const excerpt = fullText.slice(0, 320);
      return {
        n: i + 1,
        bookId: h.bookId,
        bookTitle: h.bookTitle || h.bookId,
        chapterId: h.c,
        chapterTitle: h.chapterTitle || chapterMeta?.title || h.c,
        paraId: h.p,
        excerpt,
        fullText,
        score: h.score,
      };
    });

    const scopeLabel = libraryWide || !bookId
      ? "the library"
      : (chapterMeta?.title || bookMeta?.title || "this book");

    return {
      answer: synthesizeAnswer(question, citations, scopeLabel),
      citations,
      tokens: qTokens,
      freeOffline: true,
    };
  }

  function renderResultHtml(res) {
    if (!res) return "";
    if (res.note && !res.answer) {
      return `<p class="muted">${esc(res.note)}</p>`;
    }
    return `
      <div class="source-qa-answer-card">
        <h3 class="source-qa-answer-head">Answer from library sources <span class="badge">Free · Offline</span></h3>
        <div class="source-qa-answer">${esc(res.answer).replace(/\n/g, "<br>")}</div>
      </div>
      ${res.citations?.length ? `
        <h4 class="source-qa-cites-head">Citations</h4>
        <ol class="source-qa-cites">${res.citations.map(c => `
          <li>
            <button type="button" class="source-qa-cite" data-book="${esc(c.bookId)}" data-ch="${esc(c.chapterId)}" data-para="${esc(c.paraId)}">
              <strong>[${c.n}] ${esc(c.bookTitle || "")}</strong>
              <span class="muted">${esc(c.chapterTitle || "")}</span>
              <span>${esc(c.excerpt.slice(0, 180))}${c.excerpt.length > 180 ? "…" : ""}</span>
            </button>
          </li>`).join("")}
        </ol>` : ""}`;
  }

  function bindResultClicks(root) {
    root?.querySelectorAll(".source-qa-cite").forEach(btn => {
      btn.addEventListener("click", () => {
        api.navigate("read", { bookId: btn.dataset.book, chapterId: btn.dataset.ch, paraId: btn.dataset.para });
      });
    });
  }

  function renderPage(scope) {
    const bookId = scope?.bookId || "";
    const chapterId = scope?.chapterId || "";
    const body = `
      <section class="hero hero-compact">
        <h1>Ask Question</h1>
        <p class="hero-sub">Free · Offline · Clear answers from AMPS Library passages, with citations. No paid AI.</p>
      </section>
      <div class="source-qa-panel modern-card">
        <label>Your question
          <textarea id="sourceQaInput" rows="3" placeholder="e.g. Why is Yoga beneficial? / योग के क्या लाभ हैं?"></textarea>
        </label>
        <label class="check-row"><input type="checkbox" id="sourceQaLibraryWide" checked /> Search whole library</label>
        <div class="chip-row source-qa-topics" aria-label="Example questions">
          ${EXAMPLE_QUESTIONS.map(q =>
            `<button type="button" class="chip" data-qa-example="${esc(q)}">${esc(q)}</button>`
          ).join("")}
        </div>
        <div class="chip-row source-qa-topics">
          ${Object.keys(TOPIC_EXPAND).slice(0, 10).map(t =>
            `<button type="button" class="chip" data-qa-topic="${esc(t)}">${esc(t)}</button>`
          ).join("")}
        </div>
        <button type="button" class="btn btn-gold" id="btnSourceQaAsk">Ask (free)</button>
        <p class="muted pad" style="margin-top:0.75rem">Answers are assembled from library paragraphs (not live news / not paid AI).</p>
        <div id="sourceQaResult" class="source-qa-result"></div>
      </div>`;
    api.renderShell(body, {
      title: "Ask Question",
      tab: "more",
      bind: () => {
        document.querySelectorAll("[data-qa-example]").forEach(btn => {
          btn.addEventListener("click", () => {
            const input = document.getElementById("sourceQaInput");
            if (input) input.value = btn.dataset.qaExample || "";
          });
        });
        document.querySelectorAll("[data-qa-topic]").forEach(btn => {
          btn.addEventListener("click", () => {
            const input = document.getElementById("sourceQaInput");
            if (input) input.value = `What does the library teach about ${btn.dataset.qaTopic}?`;
          });
        });
        const runAsk = async () => {
          const q = document.getElementById("sourceQaInput")?.value?.trim();
          const el = document.getElementById("sourceQaResult");
          const libraryWide = !bookId || !!document.getElementById("sourceQaLibraryWide")?.checked;
          if (!q) {
            if (el) el.innerHTML = `<p class="muted">Type a question first.</p>`;
            return;
          }
          if (el) el.innerHTML = `<p class="muted">Searching library sources (free, offline)…</p>`;
          const res = await answerFromSource({ bookId, chapterId, question: q, libraryWide });
          if (!el) return;
          el.innerHTML = renderResultHtml(res);
          bindResultClicks(el);
        };
        document.getElementById("btnSourceQaAsk")?.addEventListener("click", runAsk);
        document.getElementById("sourceQaInput")?.addEventListener("keydown", e => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runAsk();
        });
      },
    });
  }

  window.AmpsSourceQa = {
    install,
    answerFromSource,
    renderPage,
    loadSearchShard,
    expandQueryTokens,
    renderResultHtml,
    bindResultClicks,
    TOPIC_EXPAND,
    EXAMPLE_QUESTIONS,
  };
})();

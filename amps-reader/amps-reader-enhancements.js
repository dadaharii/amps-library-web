/* AMPS Reader — premium enhancements (series UI, search rank, reading plan, share, etc.) */
(function () {
  "use strict";

  let api;

  const TYPO_PRESETS = {
    default: { theme: "sepia", fontSize: 18, lineHeight: 1.75, readerWidth: "normal", fontFamily: "serif", brightness: 100 },
    study: { theme: "light", fontSize: 17, lineHeight: 1.85, readerWidth: "narrow", fontFamily: "serif", brightness: 100 },
    night: { theme: "dark", fontSize: 19, lineHeight: 1.8, readerWidth: "normal", fontFamily: "serif", brightness: 90 },
    projector: { theme: "contrast", fontSize: 22, lineHeight: 1.9, readerWidth: "wide", fontFamily: "sans", brightness: 110 },
    large: { theme: "sepia", fontSize: 24, lineHeight: 2, readerWidth: "wide", fontFamily: "serif", brightness: 105 },
    dyslexia: { theme: "light", fontSize: 20, lineHeight: 2, readerWidth: "normal", fontFamily: "dyslexia", brightness: 100 },
  };

  const SERIES_ICONS = {
    "ananda-vacanamrtam": "📿", prout: "🌍", "subhasita-samgraha": "✨",
    "idea-and-ideology": "💡", caryacarya: "🧘", "ananda-sutram": "📖",
    default: "",
  };

  function seriesIcon(seriesKey) {
    if (!seriesKey) return "";
    const k = String(seriesKey).toLowerCase();
    for (const [key, icon] of Object.entries(SERIES_ICONS)) {
      if (key === "default") continue;
      if (k.includes(key)) return icon;
    }
    return "";
  }

  function applyTypoPreset(state, name) {
    const p = TYPO_PRESETS[name];
    if (!p) return;
    Object.assign(state.settings, p);
    state.settings.typoPreset = name;
  }

  function rankSearchHits(hits, q, catalog) {
    const ql = q.toLowerCase();
    return hits.map(h => {
      let score = 0;
      if ((h.bookTitle || "").toLowerCase().includes(ql)) score += 50;
      if ((h.chapterTitle || "").toLowerCase().includes(ql)) score += 40;
      if ((h.snippet || "").toLowerCase().indexOf(ql) >= 0) score += 20 - Math.min(15, (h.snippet || "").toLowerCase().indexOf(ql) / 10);
      const book = catalog.books.find(b => b.id === h.bookId);
      if (book?.title?.toLowerCase().includes(ql)) score += 30;
      return { ...h, _score: score };
    }).sort((a, b) => b._score - a._score);
  }

  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /** Inline markers like ( 1 ) → link to chapter footnote list. */
  function linkFootnoteRefs(html, ch) {
    if (!ch?.footnotes?.length) return html;
    const max = ch.footnotes.length;
    return String(html).replace(/\(\s*(\d+)\s*\)/g, (match, num, offset, whole) => {
      const n = parseInt(num, 10);
      if (n < 1 || n > max) return match;
      const before = whole.slice(Math.max(0, offset - 8), offset);
      if (/<[^>]*$/.test(before)) return match;
      return `<button type="button" class="fn-ref" data-fn="${n - 1}" aria-label="Footnote ${n}">${match}</button>`;
    });
  }

  function scrollToFootnote(index) {
    const panel = document.getElementById("footnotePanel");
    if (panel) panel.classList.remove("hidden");
    const li = document.getElementById(`fn-item-${index}`) || panel?.querySelectorAll("li")[index];
    if (!li) return;
    li.classList.add("footnote-highlight");
    li.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => li.classList.remove("footnote-highlight"), 2500);
  }

  function enrichParagraph(text, book, ch, catalog, esc) {
    const isGlossChapter = /glossary/i.test(ch?.title || "");
    // Glossary chapter: term → modal with book locations; leave definition plain.
    if (isGlossChapter) {
      const raw = String(text || "");
      const colon = raw.indexOf(":");
      if (colon > 0) {
        const termPart = raw.slice(0, colon).trim();
        const defPart = raw.slice(colon + 1).trim();
        return `<button type="button" class="gloss-entry-term" data-term="${esc(termPart)}">${esc(termPart)}</button>: ${esc(defPart)}`;
      }
    }
    let html = esc(text);
    const terms = [...(book.glossary || [])];
    if (window._glossaryIndex) {
      terms.push(...window._glossaryIndex.filter(g => g.bookId === book.id).slice(0, 30));
    }
    const seenForms = new Set();
    const formEntries = [];
    terms.forEach(g => {
      if (!g.term) return;
      const forms = glossaryPrimaryForms(g.term);
      forms.forEach(form => {
        const key = form.toLowerCase();
        if (form.length < 3 || seenForms.has(key)) return;
        seenForms.add(key);
        formEntries.push({ form, term: g.term, def: g.def || "" });
      });
    });
    formEntries.sort((a, b) => b.form.length - a.form.length);
    formEntries.slice(0, 120).forEach(g => {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapeRe(g.form)})(?=[^\\p{L}\\p{N}_]|$)`, "giu");
      html = html.replace(re, (m, pre, word) =>
        `${pre}<button type="button" class="gloss-inline" data-term="${esc(g.term)}" title="${esc(g.def || "")}">${word}</button>`
      );
    });
    (catalog?.books || []).forEach(b => {
      if (b.id === book.id || b.title.length < 8) return;
      const re = new RegExp(`\\b(${escapeRe(b.title)})\\b`, "gi");
      html = html.replace(re, (m) => `<button type="button" class="xref-inline" data-xbook="${esc(b.id)}">${m}</button>`);
    });
    return html;
  }

  function glossaryPrimaryForms(term) {
    const forms = [];
    String(term || "")
      .split(/\s+or\s+/i)
      .forEach(part => {
        let p = part.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\b[mf]\.\s*$/i, "").trim();
        p.split(",").forEach(alt => {
          const a = alt.trim().replace(/\bADJ\.?\s*$/i, "").trim();
          if (a && !forms.includes(a)) forms.push(a);
        });
      });
    return forms;
  }

  function renderFootnotesInline(ch, esc) {
    if (!ch.footnotes?.length) return "";
    let html = `<div class="fn-inline-list">`;
    ch.footnotes.forEach((f, i) => {
      html += `<button type="button" class="fn-sup" data-fn="${i}" title="Footnote ${i + 1}">${i + 1}</button>`;
    });
    html += `</div>`;
    return html;
  }

  function footnoteBlock(ch, esc, visible) {
    if (!ch.footnotes?.length) return "";
    const hidden = visible ? "" : " hidden";
    let html = `<aside class="footnote-panel${hidden}" id="footnotePanel"><h4>Footnotes</h4><ol>`;
    ch.footnotes.forEach((f, i) => {
      html += `<li id="fn-item-${i}" class="footnote-item">${esc(String(f.text || "").replace(/^\(\s*\d+\s*\)\s*/, "").trim())}</li>`;
    });
    html += `</ol></aside>`;
    return html;
  }

  async function sharePassage(book, ch, text) {
    const quote = `"${text.slice(0, 500)}${text.length > 500 ? "…" : ""}"\n\n— ${book.title}, ${ch.title}\nShrii Shrii Anandamurti ji`;
    if (navigator.share) {
      try {
        await navigator.share({ title: book.title, text: quote });
        return;
      } catch (_) { /* fall through */ }
    }
    await navigator.clipboard?.writeText(quote);
    alert("Passage copied to clipboard");
  }

  function exportCollectionHtml(col) {
    const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    let html = `<!doctype html><html><head><meta charset=utf-8><title>${esc(col.title)}</title>
      <style>body{font-family:Georgia,serif;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.7}
      blockquote{border-left:4px solid #c9a227;margin:1.5rem 0;padding-left:1rem;color:#444}
      h1{color:#9a3412}h2{font-size:1rem;color:#666}</style></head><body>
      <h1>${esc(col.title)}</h1><p>${esc(col.description || "")}</p>`;
    col.items.forEach((it, i) => {
      html += `<h2>${i + 1}. ${esc(it.bookTitle)} — ${esc(it.chapterTitle)}</h2>
        <blockquote>${esc(it.quote || "")}</blockquote>${it.note ? `<p><em>${esc(it.note)}</em></p>` : ""}`;
    });
    html += `</body></html>`;
    return html;
  }

  function ensureReadingPlan(state) {
    if (!state.readingPlan) {
      state.readingPlan = { enabled: false, dailyDiscourses: 1, notify: false, completed: {} };
    }
    return state.readingPlan;
  }

  function todayDiscourse(catalog, plan) {
    const day = new Date().toISOString().slice(0, 10);
    if (plan.completed[day]) return null;
    const discourses = catalog.discourses || [];
    if (!discourses.length) return null;
    const idx = Math.abs(day.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % discourses.length;
    return discourses[idx];
  }

  function checkReadingReminder(state, catalog) {
    const plan = ensureReadingPlan(state);
    if (!plan.enabled || !plan.notify) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const day = new Date().toISOString().slice(0, 10);
    if (plan.completed[day] || sessionStorage.getItem("amps-notified-" + day)) return;
    const d = todayDiscourse(catalog, plan);
    if (!d) return;
    sessionStorage.setItem("amps-notified-" + day);
    new Notification("AMPS Reader — daily discourse", {
      body: d.title + " · " + d.bookTitle,
      tag: "amps-daily",
    });
  }

  function renderReadingPlan(state, catalog) {
    const plan = ensureReadingPlan(state);
    const day = new Date().toISOString().slice(0, 10);
    const today = todayDiscourse(catalog, plan);
    const done = !!plan.completed[day];
    let body = `<section class="hero hero-compact"><h1>Reading plan</h1>
      <p class="hero-sub">One discourse a day builds steady sadhana</p></section>
      <label class="check-row"><input type="checkbox" id="planEnabled" ${plan.enabled ? "checked" : ""} /> Enable daily reading plan</label>
      <label>Discourses per day<input type="number" id="planCount" min="1" max="5" value="${plan.dailyDiscourses || 1}" /></label>
      <label class="check-row"><input type="checkbox" id="planNotify" ${plan.notify ? "checked" : ""} /> Browser notifications</label>
      <button type="button" class="btn btn-ghost btn-sm" id="planPerm">Allow notifications</button>`;
    if (plan.enabled && today) {
      body += `<div class="quote-card ${done ? "done-card" : ""}">
        <p class="hero-eyebrow">Today's discourse</p>
        <h3>${api.esc(today.title)}</h3>
        <p class="muted">${api.esc(today.bookTitle)}</p>
        ${done ? `<p class="pill">✓ Completed today</p>` :
          `<button type="button" class="btn btn-gold btn-sm" data-book="${api.esc(today.bookId)}" data-ch="${api.esc(today.chapterId)}">Read now</button>`}
      </div>`;
    }
    api.renderShell(body, {
      title: "Reading plan",
      tab: "more",
      bind: () => {
        document.getElementById("planEnabled")?.addEventListener("change", e => {
          plan.enabled = e.target.checked;
          api.saveState();
          renderReadingPlan(state, catalog);
        });
        document.getElementById("planCount")?.addEventListener("change", e => {
          plan.dailyDiscourses = +e.target.value || 1;
          api.saveState();
        });
        document.getElementById("planNotify")?.addEventListener("change", e => {
          plan.notify = e.target.checked;
          api.saveState();
        });
        document.getElementById("planPerm")?.addEventListener("click", async () => {
          if ("Notification" in window) await Notification.requestPermission();
        });
      },
    });
  }

  function renderOnboarding(state) {
    if (state.settings.onboarded) return false;
    const root = document.getElementById("modalRoot");
    if (!root) return false;
    root.innerHTML = `<div class="modal-backdrop" id="onboardBd">
      <div class="modal modal-lg onboard-modal">
        <h3>Welcome to AMPS Reader</h3>
        <p>Sacred library of ${state.catalog?.bookCount || 162} books by Shrii P. R. Sarkar — offline on your device.</p>
        <label>Your goal
          <select id="obGoal">
            <option value="read">Daily reading</option>
            <option value="study">Memorization / study</option>
            <option value="teach">Teaching / classes</option>
          </select>
        </label>
        <label>Language
          <select id="obLang">
            <option value="en">English UI</option>
            <option value="hi">हिन्दी UI</option>
          </select>
        </label>
        <label>Favorite series (optional)
          <select id="obSeries"><option value="">—</option>
            ${(state.catalog?.series || []).filter(s => s?.id).slice(0, 20).map(s => `<option value="${api.esc(s.id)}">${api.esc(s.title)}</option>`).join("")}
          </select>
        </label>
        <div class="modal-actions">
          <button type="button" class="btn btn-gold" id="obStart">Begin</button>
        </div>
      </div>
    </div>`;
    document.getElementById("obStart")?.addEventListener("click", () => {
      state.settings.onboarded = true;
      state.settings.userGoal = document.getElementById("obGoal")?.value || "read";
      state.settings.lang = document.getElementById("obLang")?.value || "en";
      state.settings.favSeries = document.getElementById("obSeries")?.value || "";
      window.AmpsI18n?.setLang(state.settings.lang);
      api.saveState();
      root.innerHTML = "";
      api.renderFromState?.() || api.render();
    });
    return true;
  }

  function compareHtml(b1, c1, b2, c2, esc) {
    const col = (book, ch) => `<div class="compare-col sync-col"><h3>${esc(book.title)}</h3>
      <select class="cmp-ch-pick" data-book="${esc(book.id)}">
        ${book.chapters.map(c => `<option value="${esc(c.id)}" ${c.id === ch.id ? "selected" : ""}>${esc(c.title)}</option>`).join("")}
      </select>
      <div class="cmp-body">${(ch.paragraphs || []).map(p => `<p data-para>${esc(p.text)}</p>`).join("")}</div></div>`;
    return col(b1, c1) + col(b2, c2);
  }

  function bindCompareSync(container) {
    const cols = container?.querySelectorAll(".sync-col");
    if (!cols || cols.length < 2) return;
    cols.forEach(col => {
      col.addEventListener("scroll", () => {
        const pct = col.scrollTop / Math.max(1, col.scrollHeight - col.clientHeight);
        cols.forEach(other => {
          if (other === col) return;
          other.scrollTop = pct * (other.scrollHeight - other.clientHeight);
        });
      }, { passive: true });
    });
  }

  function bindPageTaps(article, state, onPrev, onNext) {
    if (!article) return;
    article.addEventListener("click", e => {
      if (e.target.closest("button, a, mark, .gloss-inline, .xref-inline")) return;
      const r = article.getBoundingClientRect();
      const x = e.clientX - r.left;
      if (x < r.width * 0.2) onPrev();
      else if (x > r.width * 0.8) onNext();
    });
  }

  function collapsedSeries() {
    try { return JSON.parse(localStorage.getItem("amps-series-collapsed") || "{}"); }
    catch { return {}; }
  }

  function toggleSeries(id) {
    const c = collapsedSeries();
    c[id] = !c[id];
    localStorage.setItem("amps-series-collapsed", JSON.stringify(c));
  }

  function seriesSectionHtml(s, books, bookCardFn, esc, q, seriesAlpha) {
    const collapsed = collapsedSeries()[s.id];
    const icon = seriesIcon(s.id);
    const alphaAttr = seriesAlpha ? ` data-alpha="${esc(seriesAlpha)}"` : "";
    let html = `<section class="section series-section"${alphaAttr} data-series="${esc(s.id)}">
      <button type="button" class="section-head series-head" data-toggle-series="${esc(s.id)}">
        ${icon ? `<span class="series-icon">${icon}</span> ` : ""}${esc(s.title)} <span class="badge">${books.length}</span>
        <span class="series-chevron">${collapsed ? "▸" : "▾"}</span>
      </button>`;
    if (!collapsed) {
      html += `<div class="book-grid">`;
      books.forEach(b => { html += bookCardFn(b); });
      html += `</div>`;
    }
    html += `</section>`;
    return html;
  }

  function libraryVersion(catalog) {
    if (!catalog?.generatedAt) return "Unknown";
    return new Date(catalog.generatedAt).toLocaleDateString(undefined, { dateStyle: "medium" });
  }

  function install(app) {
    api = app;
    api.rankSearchHits = rankSearchHits;
    api.enrichParagraph = (text, book, ch) => enrichParagraph(text, book, ch, app.state.catalog, app.esc);
    api.linkFootnoteRefs = (html, ch) => linkFootnoteRefs(html, ch);
    api.footnoteBlock = (ch, visible) => footnoteBlock(ch, app.esc, visible);
    api.scrollToFootnote = scrollToFootnote;
    api.sharePassage = sharePassage;
    api.exportCollectionHtml = exportCollectionHtml;
    api.applyTypoPreset = (name) => applyTypoPreset(app.state, name);
    api.TYPO_PRESETS = TYPO_PRESETS;
    api.seriesIcon = seriesIcon;
    api.seriesSectionHtml = (s, books, fn, seriesAlpha) => seriesSectionHtml(s, books, fn, app.esc, app.state.params.q, seriesAlpha);
    api.toggleSeries = toggleSeries;
    api.renderReadingPlan = () => renderReadingPlan(app.state, app.state.catalog);
    api.renderOnboarding = () => renderOnboarding(app.state);
    api.compareHtml = compareHtml;
    api.bindCompareSync = bindCompareSync;
    api.bindPageTaps = bindPageTaps;
    api.libraryVersion = () => libraryVersion(app.state.catalog);
    api.markPlanDone = () => {
      const plan = ensureReadingPlan(app.state);
      plan.completed[new Date().toISOString().slice(0, 10)] = true;
      app.saveState();
    };
    api.checkReadingReminder = () => checkReadingReminder(app.state, app.state.catalog);
    loadGlossaryIndex();
  }

  async function loadGlossaryIndex() {
    try {
      const res = await fetch("data/glossary-index.json");
      window._glossaryIndex = await res.json();
    } catch { window._glossaryIndex = []; }
  }

  window.AmpsEnhance = {
    install, TYPO_PRESETS, seriesIcon, applyTypoPreset, rankSearchHits,
    sharePassage, exportCollectionHtml, compareHtml, bindCompareSync, bindPageTaps,
  };
})();

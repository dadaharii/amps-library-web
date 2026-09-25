/* AMPS Reader — concept map from glossary index */
(function () {
  "use strict";

  let api = null;
  let indexPromise = null;

  const FEATURED = [
    { slug: "brahma", match: ["BRAHMA", "NIRGUNA BRAHMA", "SAGUNA BRAHMA", "PARAMA BRAHMA"] },
    { slug: "citta", match: ["CITTA", "CITISHAKTI"] },
    { slug: "purusa", match: ["PURUŚA", "PURUSA", "PARAMA PURUŚA", "PURUŚOTTAMA"] },
    { slug: "prakrti", match: ["PRAKRTI", "PARAMÁ PRAKRTI"] },
    { slug: "sadhana", match: ["SÁDHANÁ", "SADHANA"] },
    { slug: "cakra", match: ["CAKRA", "MÚLÁDHÁRA CAKRA"] },
    { slug: "dharma", match: ["DHARMA"] },
    { slug: "karma", match: ["KARMA", "KARMA YOGA"] },
  ];

  function install(appApi) {
    api = appApi;
  }

  function esc(s) {
    return api?.esc ? api.esc(s) : String(s ?? "");
  }

  function norm(s) {
    return String(s || "").toLowerCase().replace(/[^\w\u0900-\u097F]/g, "");
  }

  async function loadIndex() {
    if (indexPromise) return indexPromise;
    indexPromise = fetch(api?.readerAssetUrl?.("data/glossary-index.json") || "data/glossary-index.json")
      .then(r => r.json())
      .catch(() => []);
    return indexPromise;
  }

  function entriesForConcept(index, concept) {
    const keys = (concept.match || []).map(norm);
    return (index || []).filter(row => keys.some(k => norm(row.term).includes(k) || k.includes(norm(row.term))));
  }

  async function getConcept(slug) {
    const concept = FEATURED.find(c => c.slug === slug);
    if (!concept) return null;
    const index = await loadIndex();
    const entries = entriesForConcept(index, concept);
    const related = FEATURED.filter(c => c.slug !== slug).slice(0, 4);
    return { ...concept, title: concept.slug.replace(/-/g, " "), entries, related };
  }

  function renderIndexPage() {
    const cards = FEATURED.map(c =>
      `<a href="#concepts/${c.slug}" class="concept-card"><strong>${esc(c.slug.replace(/-/g, " "))}</strong><small>Cross-book references</small></a>`
    ).join("");
    const body = `
      <section class="hero hero-compact"><h1>Concept map</h1>
        <p class="hero-sub">Linked spiritual terms with definitions and book references from the AMPS glossary.</p>
      </section>
      <div class="concept-grid">${cards}</div>`;
    api.renderShell(body, { title: "Concepts", tab: "more" });
  }

  async function renderConceptPage(slug) {
    const data = await getConcept(slug);
    if (!data) {
      api.renderShell(`<p class="muted pad">Concept not found.</p>`, { title: "Concept", tab: "more" });
      return;
    }
    const defs = data.entries.slice(0, 8).map(e =>
      `<article class="concept-ref-card">
        <h3>${esc(e.term)}</h3>
        <p>${esc(e.def)}</p>
        <button type="button" class="btn btn-ghost btn-sm concept-open-book" data-book="${esc(e.bookId)}">${esc(e.bookTitle || e.bookId)}</button>
      </article>`
    ).join("");
    const related = data.related.map(r =>
      `<a href="#concepts/${r.slug}" class="concept-chip">${esc(r.slug.replace(/-/g, " "))}</a>`
    ).join("");
    const body = `
      <section class="hero hero-compact">
        <p class="muted"><a href="#concepts">← All concepts</a></p>
        <h1>${esc(data.title)}</h1>
        <p class="hero-sub">${data.entries.length} glossary reference${data.entries.length === 1 ? "" : "s"} across the library.</p>
      </section>
      <div class="concept-refs">${defs || "<p class=\"muted\">No glossary entries yet.</p>"}</div>
      <p class="concept-related-label">Related</p>
      <div class="concept-related">${related}</div>`;
    api.renderShell(body, {
      title: data.title,
      tab: "more",
      bind: () => {
        document.querySelectorAll(".concept-open-book").forEach(btn => {
          btn.addEventListener("click", () => api.navigate("book", { bookId: btn.dataset.book }));
        });
      },
    });
  }

  window.AmpsConcepts = {
    install,
    FEATURED,
    renderIndexPage,
    renderConceptPage,
    getConcept,
  };
})();

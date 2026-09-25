/* Presentation Builder — screens, routing, presenter/viewer */
(function () {
  "use strict";

  const Store = () => window.AmpsPresentationStore;
  const Search = () => window.AmpsPresentationSearch;
  const Pdf = () => window.AmpsPresentationPdf;

  let api = null;

  function subRoute() {
    return api?.state?.params?.parts?.[1] || "home";
  }

  function routeId() {
    return api?.state?.params?.parts?.[2] || "";
  }

  function routeToken() {
    return api?.state?.params?.parts?.[3] || "";
  }

  function nav(sub, id, token) {
    const parts = ["presentation-builder", sub];
    if (id) parts.push(id);
    if (token) parts.push(token);
    api.state.route = "presentation-builder";
    api.state.params = { parts };
    const hash = "#" + parts.join("/");
    try { location.hash = hash; } catch (_) { /* */ }
    render();
  }

  function goBack() {
    if (!api) return;
    const sub = subRoute();
    if (sub === "home") {
      api.navigate("more");
      return;
    }
    if (sub === "search") {
        nav("home");
        return;
    }
    if (sub === "edit") {
      nav("home");
      return;
    }
    if (sub === "settings") {
      nav("edit", routeId());
      return;
    }
    if (sub === "present" || sub === "view") {
      document.body.classList.remove("pb-present-mode", "pb-viewer-mode");
      nav("home");
      return;
    }
    api.navigate("more");
  }

  let pbUiReady = false;
  function initPresentationUi() {
    if (pbUiReady || !api) return;
    pbUiReady = true;
    const app = document.getElementById("app");
    if (!app) return;

    app.addEventListener("click", e => {
      if (api.state.route !== "presentation-builder") return;

      const editBtn = e.target.closest?.("[data-edit]");
      if (editBtn && subRoute() === "home") {
        e.preventDefault();
        e.stopPropagation();
        nav("edit", editBtn.dataset.edit);
        return;
      }

      const presentBtn = e.target.closest?.("[data-present]");
      if (presentBtn && subRoute() === "home") {
        e.preventDefault();
        e.stopPropagation();
        nav("present", presentBtn.dataset.present);
        return;
      }

      const delBtn = e.target.closest?.("[data-del]");
      if (delBtn && subRoute() === "home") {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm("Delete this collection?")) return;
        Store().deleteCollection(api.state, delBtn.dataset.del);
        api.saveState();
        render();
        return;
      }

      if (e.target.closest?.("#pbNewSearch") && subRoute() === "home") {
        e.preventDefault();
        e.stopPropagation();
        clearSelection();
        nav("search");
      }
    }, true);
  }

  function trunc(s, n) {
    const t = String(s || "");
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
  }

  function subjectLabel(id) {
    const chip = Search()?.SUBJECT_CHIPS?.find(c => c.id === id);
    return chip?.label || id;
  }

  function selectedCount() {
    const sel = Store().ensure(api.state).ui.selected || {};
    return Object.keys(sel).filter(k => sel[k]).length;
  }

  function pdfAllowed() {
    if (api?.premiumLicensed && !api.premiumLicensed()) return false;
    return api?.discoursePdfAllowed?.() !== false;
  }

  const PUBLIC_SLIDE_CAP = 25;

  function downloadPresentationPdf(slides, pres) {
    if (!pdfAllowed()) {
      alert("PDF download has been disabled by your administrator. Contact them in Settings → Admin.");
      return;
    }
    const limited = (slides || []).slice(0, PUBLIC_SLIDE_CAP);
    if ((slides || []).length > PUBLIC_SLIDE_CAP) {
      alert(`Public Presentation Builder exports at most ${PUBLIC_SLIDE_CAP} slides. Extra slides were omitted.`);
    }
    const blob = Pdf().exportPdf(limited, { ...(pres || {}), maxPages: PUBLIC_SLIDE_CAP });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (pres.title || "presentation").replace(/[^\w.-]+/g, "-") + ".pdf";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function passageDedupeKey(text) {
    return Search()?.passageDedupeKey(text) || String(text || "").trim();
  }

  function dedupeSelectedItems(items) {
    const SearchApi = Search();
    if (!SearchApi?.dedupePassageRows) return items;
    const bookById = id => api.bookById?.(id) || api.state.catalog?.books?.find(b => b.id === id);
    return SearchApi.dedupePassageRows(items, bookById).rows;
  }

  function toggleSelect(key, row) {
    const ui = Store().ensure(api.state).ui;
    ui.selected = ui.selected || {};
    if (ui.selected[key]) {
      delete ui.selected[key];
      return;
    }
    const dk = passageDedupeKey(row.text);
    if (dk.length >= 24) {
      Object.keys(ui.selected).forEach(k => {
        if (passageDedupeKey(ui.selected[k].text) === dk) delete ui.selected[k];
      });
    }
    ui.selected[key] = row;
  }

  function clearSelection() {
    Store().ensure(api.state).ui.selected = {};
  }

  function selectedItems() {
    const sel = Store().ensure(api.state).ui.selected || {};
    return dedupeSelectedItems(Object.values(sel));
  }

  function updateSearchSelectionUi(rows) {
    const sel = Store().ensure(api.state).ui.selected || {};
    const count = selectedCount();
    const countEl = document.getElementById("pbSelCount");
    if (countEl) countEl.textContent = "Selected: " + count;
    const btn = document.getElementById("pbCreateCol");
    if (btn) btn.disabled = !count;
    const visible = rows || [];
    const allChecked = visible.length > 0 && visible.every(r => sel[r.key]);
    const bar = document.getElementById("pbBulkSelect");
    if (bar) bar.classList.toggle("hidden", !visible.length);
    const allBtn = document.getElementById("pbSelectAll");
    const noneBtn = document.getElementById("pbDeselectAll");
    if (allBtn) allBtn.disabled = allChecked;
    if (noneBtn) {
      const anyChecked = visible.some(r => sel[r.key]);
      noneBtn.disabled = !anyChecked;
    }
    document.querySelectorAll("#pbSearchResults input[type=checkbox]").forEach(cb => {
      if (sel[cb.dataset.key]) cb.checked = true;
      else if (visible.some(r => r.key === cb.dataset.key)) cb.checked = false;
    });
  }

  function selectAllSearchRows(rows) {
    const ui = Store().ensure(api.state).ui;
    ui.selected = ui.selected || {};
    rows.forEach(r => { ui.selected[r.key] = r; });
    updateSearchSelectionUi(rows);
  }

  function deselectAllSearchRows(rows) {
    const ui = Store().ensure(api.state).ui;
    ui.selected = ui.selected || {};
    rows.forEach(r => { delete ui.selected[r.key]; });
    updateSearchSelectionUi(rows);
  }

  const TEMPLATES = [
    { id: "clean", label: "Clean Text", desc: "Large font, minimal layout", mvp: true },
    { id: "spiritual", label: "Spiritual Theme", desc: "Warm background, subtle ornament", mvp: false },
    { id: "quote", label: "Quote Style", desc: "Highlighted passage box", mvp: false },
    { id: "discourse", label: "Discourse Mode", desc: "Very large projector text", mvp: false },
  ];

  function slideBodyHtml(slide) {
    const bullets = slide?.contentBullets;
    if (Array.isArray(bullets) && bullets.length) {
      return `<ul class="pb-slide-bullets">${bullets.map(b => `<li>${api.esc(b)}</li>`).join("")}</ul>`;
    }
    return `<div class="pb-slide-body">${api.esc(slide?.contentText || "")}</div>`;
  }

  function slideHtml(slide, pres, idx, total, role) {
    const tpl = pres?.templateStyle || "clean";
    const fs = pres?.fontSize || 28;
    const ref = pres?.includePageRefs !== false
      ? `<footer class="pb-slide-ref">${api.esc(slide.pageReference || "")}</footer>` : "";
    const slideNum = role === "viewer" || role === "presenter"
      ? `<div class="pb-slide-num">${idx + 1} / ${total}</div>` : "";
    return `<div class="pb-slide pb-tpl-${tpl}" style="--pb-fs:${fs}px">
      <header class="pb-slide-head">
        <span class="pb-slide-book">${api.esc(slide.bookTitle || "")}</span>
        ${slide.chapterTitle ? `<span class="pb-slide-ch">${api.esc(slide.chapterTitle)}</span>` : ""}
      </header>
      ${slideBodyHtml(slide)}
      ${ref}
      ${slideNum}
    </div>`;
  }

  function peekHtml(slide, idx, total) {
    const first = slide?.contentBullets?.[0];
    const text = first || String(slide?.contentText || "").replace(/^•\s*/gm, "").trim();
    const snippet = text.length > 140 ? text.slice(0, 140) + "…" : text;
    return `<div class="pb-peek-card">
      <div class="pb-peek-label">Next · ${idx + 1} / ${total}</div>
      <div class="pb-peek-book">${api.esc(slide.bookTitle || "")}</div>
      <div class="pb-peek-body">${api.esc(snippet)}</div>
    </div>`;
  }

  function renderHome() {
    const pb = Store().ensure(api.state);
    let list = "";
    if (!pb.collections.length) {
      list = `<p class="muted">No presentation collections yet. Add passages while reading, or search and hand-pick slides.</p>`;
    } else {
      pb.collections.forEach(c => {
        const pres = pb.presentations.find(p => p.collectionId === c.id);
        list += `<div class="note-card pb-col-card">
          <h3>${api.esc(c.title)}</h3>
          <p class="muted">${c.items.length} passages · edited ${new Date(c.updatedAt).toLocaleDateString()}</p>
          <div class="pb-card-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-edit="${api.esc(c.id)}">Edit</button>
            ${pres ? `<button type="button" class="btn btn-gold btn-sm" data-present="${api.esc(pres.id)}">Present</button>` : ""}
            <button type="button" class="btn btn-ghost btn-sm danger" data-del="${api.esc(c.id)}">Delete</button>
          </div>
        </div>`;
      });
    }

    api.renderShell(`
      <section class="hero hero-compact"><h1>Presentation Builder</h1>
        <p class="muted">Manually select passages, reorder slides, and export a limited PDF. Automated whole-library PowerPoint generation is not available in the public app.</p>
      </section>
      <button type="button" class="btn btn-gold" id="pbNewSearch">+ New manual presentation</button>
      <h2 class="pb-section-title">Your collections</h2>
      ${list}
    `, {
      title: "Presentations",
      tab: "more",
      bind: () => {
        document.getElementById("pbNewSearch")?.addEventListener("click", () => {
          clearSelection();
          nav("search");
        });
        document.querySelectorAll("[data-edit]").forEach(el => {
          el.addEventListener("click", () => nav("edit", el.dataset.edit));
        });
        document.querySelectorAll("[data-present]").forEach(el => {
          el.addEventListener("click", () => nav("present", el.dataset.present));
        });
        document.querySelectorAll("[data-del]").forEach(el => {
          el.addEventListener("click", () => {
            if (!confirm("Delete this collection?")) return;
            Store().deleteCollection(api.state, el.dataset.del);
            api.saveState();
            render();
          });
        });
      },
    });
  }

  function renderSearch() {
    const ui = Store().ensure(api.state).ui;
    const q = ui.searchQ || "";
    const subject = ui.subject || "all";
    const editingId = routeId() || ui.editingId || "";
    const chips = (Search()?.SUBJECT_CHIPS || []).map(c =>
      `<button type="button" class="chip ${subject === c.id ? "active" : ""}" data-sub="${c.id}">${c.label}</button>`
    ).join("");

    api.renderShell(`
      <section class="hero hero-compact">
        <button type="button" class="btn btn-ghost btn-sm" id="pbBackHome">← Back</button>
        <h1>Cross-book search</h1>
      </section>
      <input type="search" id="pbSearchQ" class="search-input" placeholder="Search all books…" value="${api.esc(q)}" />
      <div class="chip-row">${chips}</div>
      <div class="pb-search-toolbar">
        <div id="pbSearchStatus" class="muted"></div>
        <div id="pbBulkSelect" class="pb-bulk-select hidden">
          <button type="button" class="btn btn-ghost btn-sm" id="pbSelectAll">Select all</button>
          <button type="button" class="btn btn-ghost btn-sm" id="pbDeselectAll">Deselect all</button>
        </div>
      </div>
      <div id="pbSearchResults" class="pb-results"></div>
      <div class="pb-bottom-bar">
        <span id="pbSelCount">Selected: ${selectedCount()}</span>
        <button type="button" class="btn btn-gold" id="pbCreateCol" ${selectedCount() ? "" : "disabled"}>Create collection</button>
      </div>
    `, {
      title: "Search",
      tab: "more",
      className: "pb-search-screen",
      bind: () => {
        let lastRows = [];

        const run = async () => {
          const status = document.getElementById("pbSearchStatus");
          const box = document.getElementById("pbSearchResults");
          const query = document.getElementById("pbSearchQ")?.value?.trim();
          ui.searchQ = query || "";
          if (!query) {
            status.textContent = "Type a search term to find passages.";
            box.innerHTML = "";
            lastRows = [];
            ui._searchRows = [];
            updateSearchSelectionUi([]);
            return;
          }
          status.textContent = "Searching…";
          const rows = await Search().searchPassages(api, query, subject, 50);
          lastRows = rows;
          ui._searchRows = rows;
          const dupes = rows._duplicatesSkipped || 0;
          if (!rows.length) {
            status.textContent = "No results — try another term.";
          } else if (dupes > 0) {
            status.textContent = `${rows.length} results · ${dupes} duplicate${dupes === 1 ? "" : "s"} skipped`;
          } else {
            status.textContent = rows.length + " results";
          }
          const sel = ui.selected || {};
          box.innerHTML = rows.map(r => `
            <label class="pb-result-card">
              <input type="checkbox" data-key="${api.esc(r.key)}" ${sel[r.key] ? "checked" : ""} />
              <div>
                <div class="pb-result-meta">
                  <strong>${api.esc(r.bookTitle)}</strong>
                  <span class="chip chip-sm">${api.esc(subjectLabel(r.subject))}</span>
                </div>
                <p class="muted">${api.esc(r.author)} · ${api.esc(r.pageRef)}</p>
                <p class="pb-snippet">${api.esc(r.snippet)}</p>
              </div>
            </label>`).join("");

          box.querySelectorAll("input[type=checkbox]").forEach(cb => {
            cb.addEventListener("change", () => {
              const row = rows.find(x => x.key === cb.dataset.key);
              if (row) toggleSelect(row.key, row);
              updateSearchSelectionUi(rows);
            });
          });
          updateSearchSelectionUi(rows);
        };

        document.getElementById("pbBackHome")?.addEventListener("click", () => nav("home"));
        document.getElementById("pbSearchQ")?.addEventListener("input", () => {
          clearTimeout(ui._deb);
          ui._deb = setTimeout(run, 350);
        });
        document.querySelectorAll("[data-sub]").forEach(el => {
          el.addEventListener("click", () => {
            ui.subject = el.dataset.sub;
            run();
            renderSearch();
          });
        });
        document.getElementById("pbSelectAll")?.addEventListener("click", () => {
          const rows = ui._searchRows || lastRows;
          if (rows.length) selectAllSearchRows(rows);
        });
        document.getElementById("pbDeselectAll")?.addEventListener("click", () => {
          const rows = ui._searchRows || lastRows;
          if (rows.length) deselectAllSearchRows(rows);
        });
        document.getElementById("pbCreateCol")?.addEventListener("click", () => {
          const items = selectedItems();
          if (!items.length) return;
          const title = prompt("Collection title", "Class presentation") || "Class presentation";
          let col;
          if (editingId) {
            col = Store().getCollection(api.state, editingId);
            if (col) {
              const merged = dedupeSelectedItems(col.items.concat(items));
              col.items = merged.map((it, i) => Store().normalizeItem(it, i));
              col.updatedAt = Date.now();
            }
          }
          if (!col) col = Store().createCollection(api.state, title, dedupeSelectedItems(items));
          clearSelection();
          api.saveState();
          nav("edit", col.id);
        });

        if (q) run();
      },
    });
  }

  function renderEditor() {
    const id = routeId();
    const col = Store().getCollection(api.state, id);
    if (!col) {
      api.renderShell(`<p>Collection not found.</p><button type="button" class="btn" id="pbHome">Home</button>`, {
        bind: () => document.getElementById("pbHome")?.addEventListener("click", () => nav("home")),
      });
      return;
    }

    const items = col.items.map((it, i) => {
      const bullets = it.contentBullets?.length ? it.contentBullets : [it.contentText || it.text];
      const bulletPreview = `<ul class="pb-edit-bullets">${bullets.slice(0, 4).map(b =>
        `<li>${api.esc(trunc(b, 120))}</li>`).join("")}</ul>`;
      return `
      <div class="pb-edit-item" data-idx="${i}">
        <div class="pb-edit-head">
          <strong>${api.esc(it.bookTitle)}</strong>
          <span class="muted">${api.esc(it.pageRef)}</span>
        </div>
        <div class="pb-edit-split">
          <div class="pb-edit-slide">
            <span class="pb-edit-label">Slide (audience)</span>
            ${bulletPreview}
          </div>
          <div class="pb-edit-presenter">
            <span class="pb-edit-label">Presenter notes</span>
            <textarea class="pb-note-input" data-note="${api.esc(it.id)}" rows="5">${api.esc(it.presenterNotes || it.text || "")}</textarea>
          </div>
        </div>
        <div class="pb-edit-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-up="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="btn btn-ghost btn-sm" data-down="${i}" ${i === col.items.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" class="btn btn-ghost btn-sm danger" data-rm="${api.esc(it.id)}">Remove</button>
        </div>
      </div>`;
    }).join("");

    api.renderShell(`
      <section class="hero hero-compact">
        <button type="button" class="btn btn-ghost btn-sm" id="pbBackHome">← Collections</button>
        <input type="text" id="pbColTitle" class="pb-title-input" value="${api.esc(col.title)}" />
        <p class="muted">${col.items.length} passages · Last edited ${new Date(col.updatedAt).toLocaleString()}</p>
      </section>
      <div class="pb-edit-list">${items || "<p class='muted'>No passages — add some from search.</p>"}</div>
      <div class="pb-editor-footer">
        <button type="button" class="btn btn-ghost" id="pbAddMore">+ Add more passages</button>
        <button type="button" class="btn btn-gold" id="pbGenSlides" ${col.items.length ? "" : "disabled"}>Generate slides</button>
      </div>
    `, {
      title: "Edit collection",
      tab: "more",
      bind: () => {
        document.getElementById("pbBackHome")?.addEventListener("click", () => nav("home"));
        document.getElementById("pbColTitle")?.addEventListener("change", e => {
          Store().updateCollection(api.state, id, { title: e.target.value.trim() || col.title });
          api.saveState();
        });
        document.getElementById("pbAddMore")?.addEventListener("click", () => {
          Store().ensure(api.state).ui.editingId = id;
          nav("search", id);
        });
        document.getElementById("pbGenSlides")?.addEventListener("click", () => nav("settings", id));
        document.querySelectorAll("[data-up]").forEach(el => {
          el.addEventListener("click", () => {
            Store().moveItem(api.state, id, +el.dataset.up, -1);
            api.saveState();
            renderEditor();
          });
        });
        document.querySelectorAll("[data-down]").forEach(el => {
          el.addEventListener("click", () => {
            Store().moveItem(api.state, id, +el.dataset.down, 1);
            api.saveState();
            renderEditor();
          });
        });
        document.querySelectorAll("[data-rm]").forEach(el => {
          el.addEventListener("click", () => {
            Store().removeItem(api.state, id, el.dataset.rm);
            api.saveState();
            renderEditor();
          });
        });
        document.querySelectorAll(".pb-note-input").forEach(ta => {
          ta.addEventListener("change", () => {
            const it = col.items.find(x => x.id === ta.dataset.note);
            if (it) it.presenterNotes = ta.value;
            col.updatedAt = Date.now();
            api.saveState();
          });
        });
      },
    });
  }

  function renderSettings() {
    const colId = routeId();
    const col = Store().getCollection(api.state, colId);
    if (!col) return nav("home");

    const ui = Store().ensure(api.state).ui;
    const tpl = ui._tpl || "clean";
    const fontSize = ui._fontSize || 28;
    const incRefs = ui._incRefs !== false;
    const incNotes = !!ui._incNotes;

    const cards = TEMPLATES.map(t => `
      <button type="button" class="pb-tpl-card ${tpl === t.id ? "active" : ""} ${t.mvp ? "" : "pb-tpl-premium"}" data-tpl="${t.id}" ${t.mvp ? "" : "title='Premium preview'"}>
        <strong>${t.label}</strong>
        <span class="muted">${t.desc}</span>
      </button>`).join("");

    const previewSlides = col.items.slice(0, 6);
    const fakePres = { templateStyle: tpl, fontSize, includePageRefs: incRefs, includeNotes: incNotes };
    const thumbs = previewSlides.map((it, i) => {
      const s = {
        contentBullets: it.contentBullets,
        contentText: it.contentText || trunc(it.text, 120),
        bookTitle: it.bookTitle,
        chapterTitle: it.chapterTitle,
        pageReference: it.pageRef,
        presenterNotes: it.presenterNotes,
      };
      return `<div class="pb-thumb">${slideHtml(s, fakePres, i, col.items.length, "preview")}</div>`;
    }).join("");

    api.renderShell(`
      <section class="hero hero-compact">
        <button type="button" class="btn btn-ghost btn-sm" id="pbBackEdit">← Editor</button>
        <h1>Slide settings</h1>
        <p class="muted">${api.esc(col.title)}</p>
      </section>
      <div class="pb-tpl-grid">${cards}</div>
      <label>Font size <input type="range" id="pbFont" min="24" max="36" value="${fontSize}" /> <span id="pbFontVal">${fontSize}pt</span></label>
      <label class="check-row"><input type="checkbox" id="pbIncRefs" ${incRefs ? "checked" : ""} /> Include page references</label>
      <label class="check-row"><input type="checkbox" id="pbIncNotes" ${incNotes ? "checked" : ""} /> Include presenter notes (presenter view only)</label>
      <h3>Preview</h3>
      <div class="pb-thumb-strip">${thumbs}</div>
      <button type="button" class="btn btn-gold btn-lg" id="pbGenerate">Generate &amp; present</button>
    `, {
      title: "Slide settings",
      tab: "more",
      bind: () => {
        document.getElementById("pbBackEdit")?.addEventListener("click", () => nav("edit", colId));
        document.querySelectorAll("[data-tpl]").forEach(el => {
          el.addEventListener("click", () => {
            ui._tpl = el.dataset.tpl;
            renderSettings();
          });
        });
        document.getElementById("pbFont")?.addEventListener("input", e => {
          ui._fontSize = +e.target.value;
          document.getElementById("pbFontVal").textContent = ui._fontSize + "pt";
          document.querySelectorAll(".pb-slide").forEach(s => { s.style.setProperty("--pb-fs", ui._fontSize + "px"); });
        });
        document.getElementById("pbIncRefs")?.addEventListener("change", e => { ui._incRefs = e.target.checked; });
        document.getElementById("pbIncNotes")?.addEventListener("change", e => { ui._incNotes = e.target.checked; });
        document.getElementById("pbGenerate")?.addEventListener("click", () => {
          const { presentation } = Store().createPresentation(api.state, colId, {
            title: col.title,
            templateStyle: ui._tpl || "clean",
            fontSize: ui._fontSize || 28,
            includePageRefs: ui._incRefs !== false,
            includeNotes: !!ui._incNotes,
          });
          api.saveState();
          nav("present", presentation.id);
        });
      },
    });
  }

  function renderPresenter() {
    const presId = routeId();
    const pres = Store().getPresentation(api.state, presId);
    if (!pres) return nav("home");
    const slides = Store().getSlides(api.state, presId);
    if (!slides.length) return nav("edit", pres.collectionId);

    let idx = 0;
    let timerStart = null;
    let timerIv = null;
    let showDock = true;
    const { sessionToken } = Store().startPresentation(api.state, presId);
    api.saveState();

    const viewerUrl = location.origin + location.pathname + "#presentation-builder/view/" + presId + "/" + sessionToken;

    function syncSlide() {
      Store().updateSyncState(api.state, presId, sessionToken, idx);
      api.saveState();
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return String(m).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    }

    function paint() {
      const stage = document.getElementById("pbPresentStage");
      const next = document.getElementById("pbNextPeek");
      const dock = document.getElementById("pbPresenterDock");
      if (!stage) return;
      stage.innerHTML = slideHtml(slides[idx], pres, idx, slides.length, "presenter");
      if (next) {
        next.innerHTML = idx < slides.length - 1
          ? peekHtml(slides[idx + 1], idx + 1, slides.length)
          : `<div class="pb-peek-card pb-peek-empty"><div class="pb-peek-label">Next</div><div class="pb-peek-body muted">End of presentation</div></div>`;
      }
      document.getElementById("pbSlideJump")?.setAttribute("value", String(idx + 1));
      document.getElementById("pbSlideJump")?.setAttribute("max", String(slides.length));
      const counter = document.getElementById("pbSlideCounter");
      if (counter) counter.textContent = `${idx + 1} / ${slides.length}`;
      const notes = document.getElementById("pbNotesPanel");
      if (notes) {
        notes.textContent = slides[idx].presenterNotes || "(No notes for this slide)";
      }
      dock?.classList.toggle("hidden", !showDock);
      document.getElementById("pbToggleNotes")?.classList.toggle("active", showDock);
      syncSlide();
    }

    document.body.classList.add("pb-present-mode");
    document.getElementById("app").innerHTML = `
      <div class="pb-present-shell">
        <div class="pb-present-bar">
          <button type="button" id="pbEnd">End</button>
          <span class="pb-present-title">${api.esc(pres.title)}</span>
          <span class="pb-present-slide" id="pbSlideCounter">1 / ${slides.length}</span>
          <button type="button" id="pbToggleNotes" class="active">Presenter panel</button>
          <button type="button" id="pbTimer">⏱ Start</button>
          <span id="pbTimerDisp">00:00</span>
          <input type="number" id="pbSlideJump" min="1" max="${slides.length}" value="1" class="pb-jump" title="Jump to slide" />
          <button type="button" id="pbBookmark" title="Bookmark slide">★</button>
          <button type="button" id="pbShare">Share link</button>
          ${pdfAllowed() ? `<button type="button" id="pbPdf">PDF</button>` : ""}
          <div class="pb-present-nav">
            <button type="button" id="pbPrev" aria-label="Previous">←</button>
            <button type="button" id="pbNext" aria-label="Next">→</button>
          </div>
        </div>
        <div class="pb-present-wrap">
          <div id="pbPresentStage" class="pb-present-stage"></div>
        </div>
        <aside id="pbPresenterDock" class="pb-presenter-dock">
          <div class="pb-dock-notes">
            <div class="pb-dock-label">Presenter notes</div>
            <div id="pbNotesPanel" class="pb-dock-notes-body"></div>
          </div>
          <div id="pbNextPeek" class="pb-dock-next"></div>
        </aside>
      </div>`;

    paint();

    document.getElementById("pbEnd")?.addEventListener("click", () => {
      document.body.classList.remove("pb-present-mode");
      if (timerIv) clearInterval(timerIv);
      nav("home");
    });
    document.getElementById("pbPrev")?.addEventListener("click", () => {
      if (idx > 0) { idx--; paint(); }
    });
    document.getElementById("pbNext")?.addEventListener("click", () => {
      if (idx < slides.length - 1) { idx++; paint(); }
    });
    document.getElementById("pbSlideJump")?.addEventListener("change", e => {
      const n = Math.max(1, Math.min(slides.length, +e.target.value || 1));
      idx = n - 1;
      paint();
    });
    document.getElementById("pbToggleNotes")?.addEventListener("click", () => {
      showDock = !showDock;
      paint();
    });
    document.getElementById("pbTimer")?.addEventListener("click", () => {
      if (timerStart) {
        timerStart = null;
        clearInterval(timerIv);
        document.getElementById("pbTimer").textContent = "⏱ Start";
        return;
      }
      timerStart = Date.now();
      document.getElementById("pbTimer").textContent = "⏱ Stop";
      timerIv = setInterval(() => {
        document.getElementById("pbTimerDisp").textContent = formatTime(Date.now() - timerStart);
      }, 500);
    });
    document.getElementById("pbBookmark")?.addEventListener("click", () => {
      const sess = Store().getSession(api.state, presId, sessionToken);
      if (sess && !sess.bookmarks.includes(idx)) sess.bookmarks.push(idx);
      api.saveState();
    });
    document.getElementById("pbShare")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(viewerUrl);
        alert("Viewer link copied to clipboard.");
      } catch (_) {
        prompt("Copy viewer link:", viewerUrl);
      }
    });
    document.getElementById("pbPdf")?.addEventListener("click", () => {
      downloadPresentationPdf(slides, pres);
    });

    document.addEventListener("keydown", function onKey(e) {
      if (api.state.route !== "presentation-builder") {
        document.removeEventListener("keydown", onKey);
        return;
      }
      if (e.key === "ArrowRight") document.getElementById("pbNext")?.click();
      if (e.key === "ArrowLeft") document.getElementById("pbPrev")?.click();
    });
  }

  function renderViewer() {
    const presId = routeId();
    const token = routeToken();
    const pres = Store().getPresentation(api.state, presId);
  const slides = Store().getSlides(api.state, presId);
    const sess = Store().getSession(api.state, presId, token);
    if (!pres || !sess || !slides.length) {
      api.renderShell(`<p>Invalid or expired viewer link.</p>`, { title: "Viewer" });
      return;
    }

    let idx = sess.currentSlide || 0;
    let autoFollow = true;
    let pollIv = null;
    let bc = null;

    function paint() {
      const stage = document.getElementById("pbViewerStage");
      if (!stage) return;
      stage.innerHTML = slideHtml(slides[idx], { ...pres, includeNotes: false }, idx, slides.length, "viewer");
    }

    document.body.classList.add("pb-viewer-mode");
    document.getElementById("app").innerHTML = `
      <div class="pb-viewer-shell">
        <div class="pb-viewer-bar">
          <span class="pb-present-title">${api.esc(pres.title)}</span>
          <label class="pb-viewer-follow"><input type="checkbox" id="pbAutoFollow" checked /> Auto-follow</label>
          <div class="pb-present-nav">
            <button type="button" id="pbVPrev" aria-label="Previous">←</button>
            <button type="button" id="pbVNext" aria-label="Next">→</button>
          </div>
          ${pdfAllowed() ? `<button type="button" id="pbVPdf">PDF</button>` : ""}
          <button type="button" id="pbVShare">Share</button>
        </div>
        <div class="pb-meeting-card">
          <strong>${api.esc(sess.presenterName || "Presenter")}</strong>
          <span class="muted">Started ${new Date(sess.startedAt).toLocaleString()}</span>
        </div>
        <div class="pb-present-wrap pb-viewer-wrap">
          <div id="pbViewerStage" class="pb-viewer-stage"></div>
        </div>
      </div>`;

    paint();

    function followTick() {
      if (!autoFollow) return;
      const remote = Store().readBroadcastSlide(presId, token);
      if (remote != null && remote !== idx) {
        idx = remote;
        paint();
      }
    }

    try {
      bc = new BroadcastChannel("amps-presentation-" + presId);
      bc.onmessage = ev => {
        if (!autoFollow || ev.data?.sessionToken !== token) return;
        if (typeof ev.data.currentSlide === "number") {
          idx = ev.data.currentSlide;
          paint();
        }
      };
    } catch (_) { /* */ }
    pollIv = setInterval(followTick, 400);

    document.getElementById("pbAutoFollow")?.addEventListener("change", e => {
      autoFollow = e.target.checked;
    });
    document.getElementById("pbVPrev")?.addEventListener("click", () => {
      autoFollow = false;
      document.getElementById("pbAutoFollow").checked = false;
      if (idx > 0) { idx--; paint(); }
    });
    document.getElementById("pbVNext")?.addEventListener("click", () => {
      autoFollow = false;
      document.getElementById("pbAutoFollow").checked = false;
      if (idx < slides.length - 1) { idx++; paint(); }
    });
    document.getElementById("pbVPdf")?.addEventListener("click", () => {
      downloadPresentationPdf(slides, pres);
    });
    document.getElementById("pbVShare")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        alert("Link copied.");
      } catch (_) { /* */ }
    });
  }

  function render() {
    if (!api) return;
    document.body.classList.remove("pb-present-mode", "pb-viewer-mode");
    const sub = subRoute();
    switch (sub) {
      case "quick":
        nav("home");
        return;
      case "search": return renderSearch();
      case "edit": return renderEditor();
      case "settings": return renderSettings();
      case "present": return renderPresenter();
      case "view": return renderViewer();
      default: return renderHome();
    }
  }

  function install(app) {
    api = app;
    if (!api.state.presentationBuilder) {
      const saved = app.loadStatePresentationBuilder?.();
      if (saved) Store().hydrate(app.state, saved);
    }
    initPresentationUi();
  }

  function onSave(state) {
    return Store().serialize(state);
  }

  function onLoad(data) {
    if (api?.state && data) Store().hydrate(api.state, data);
  }

  window.AmpsPresentation = { install, render, nav, goBack, onSave, onLoad };
})();

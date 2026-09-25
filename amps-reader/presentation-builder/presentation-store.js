/* Presentation Builder — local store (collections, presentations, sessions) */
(function () {
  "use strict";

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function ensure(state) {
    if (!state.presentationBuilder) {
      state.presentationBuilder = {
        collections: [],
        presentations: [],
        sessions: {},
        ui: { selected: {}, searchQ: "", subject: "all", editingId: null },
      };
    }
    if (!state.presentationBuilder.ui) state.presentationBuilder.ui = { selected: {} };
    return state.presentationBuilder;
  }

  function dedupeCollectionItems(items) {
    const Search = window.AmpsPresentationSearch;
    if (!Search?.dedupePassageRows) return items || [];
    return Search.dedupePassageRows(items || [], () => null).rows;
  }

  const MAX_PUBLIC_SLIDES = 25;

  function createCollection(state, title, items) {
    const pb = ensure(state);
    const unique = dedupeCollectionItems(items).slice(0, MAX_PUBLIC_SLIDES);
    const col = {
      id: "pbc-" + uid(),
      title: title || "Untitled presentation",
      items: unique.map((it, i) => normalizeItem(it, i)),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    pb.collections.unshift(col);
    return col;
  }

  function normalizeItem(it, order) {
    const prepared = window.AmpsPresentationContent?.preparePassageContent(it) || {};
    const text = it.text || prepared.text || "";
    const custom = String(it.presenterNotes || "").trim();
    let presenterNotes = prepared.presenterNotes || "";
    if (custom && custom !== prepared.contentText && custom !== text) {
      const bulletCopy = (prepared.contentBullets || []).length > 0
        && custom.length < text.length * 0.85
        && (prepared.contentBullets || []).every(b => custom.includes(String(b).replace(/…$/, "").slice(0, 28)));
      if (!bulletCopy) presenterNotes = custom.slice(0, 400);
    }
    return {
      id: it.id || "pbi-" + uid(),
      bookId: it.bookId,
      bookTitle: it.bookTitle || "",
      author: it.author || "",
      chapterId: it.chapterId,
      chapterTitle: it.chapterTitle || "",
      paraId: it.paraId,
      text,
      summary: it.summary || prepared.summary || [],
      contentBullets: prepared.contentBullets || [],
      contentText: prepared.contentText || text,
      presenterNotes,
      pageRef: it.pageRef || "",
      pageNumber: it.pageNumber || 0,
      subject: it.subject || "general",
      order: order ?? 0,
    };
  }

  function getCollection(state, id) {
    return ensure(state).collections.find(c => c.id === id) || null;
  }

  function updateCollection(state, id, patch) {
    const col = getCollection(state, id);
    if (!col) return null;
    Object.assign(col, patch, { updatedAt: Date.now() });
    return col;
  }

  function deleteCollection(state, id) {
    const pb = ensure(state);
    pb.collections = pb.collections.filter(c => c.id !== id);
    pb.presentations = pb.presentations.filter(p => p.collectionId !== id);
  }

  function moveItem(state, colId, index, dir) {
    const col = getCollection(state, colId);
    if (!col) return false;
    const j = index + dir;
    if (j < 0 || j >= col.items.length) return false;
    const tmp = col.items[index];
    col.items[index] = col.items[j];
    col.items[j] = tmp;
    col.updatedAt = Date.now();
    return true;
  }

  function removeItem(state, colId, itemId) {
    const col = getCollection(state, colId);
    if (!col) return false;
    col.items = col.items.filter(it => it.id !== itemId);
    col.updatedAt = Date.now();
    return true;
  }

  function createPresentation(state, collectionId, opts) {
    const pb = ensure(state);
    const col = getCollection(state, collectionId);
    if (!col) throw new Error("Collection not found");
    if (Array.isArray(col.items) && col.items.length > MAX_PUBLIC_SLIDES) {
      col.items = col.items.slice(0, MAX_PUBLIC_SLIDES);
      col.updatedAt = Date.now();
    }
    const o = opts || {};
    const items = (col.items || []).slice(0, MAX_PUBLIC_SLIDES);
    const pres = {
      id: "pbp-" + uid(),
      collectionId,
      title: o.title || col.title,
      templateStyle: o.templateStyle || "clean",
      fontSize: o.fontSize || 28,
      includePageRefs: o.includePageRefs !== false,
      includeNotes: !!o.includeNotes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const slides = items.map((it, i) => {
      const norm = normalizeItem(it, i);
      return {
      id: "pbs-" + uid(),
      presentationId: pres.id,
      passageId: norm.paraId,
      order: i,
      contentBullets: norm.contentBullets || [],
      contentText: norm.contentText || norm.text,
      presenterNotes: norm.presenterNotes || "",
      pageReference: norm.pageRef || "",
      bookTitle: norm.bookTitle,
      chapterTitle: norm.chapterTitle,
      author: norm.author,
    };
    });
    pb.presentations.unshift(pres);
    pres._slides = slides;
    pb._slideIndex = pb._slideIndex || {};
    pb._slideIndex[pres.id] = slides;
    return { presentation: pres, slides };
  }

  function getPresentation(state, id) {
    return ensure(state).presentations.find(p => p.id === id) || null;
  }

  function getSlides(state, presentationId) {
    const pb = ensure(state);
    const pres = getPresentation(state, presentationId);
    if (!pres) return [];
    const col = getCollection(state, pres.collectionId);
    if (!col) return [];
    const items = (col.items || []).slice(0, MAX_PUBLIC_SLIDES);
    const slides = items.map((it, i) => {
      const norm = normalizeItem(it, i);
      return {
        id: "pbs-" + i,
        presentationId,
        order: i,
        contentBullets: norm.contentBullets || [],
        contentText: norm.contentText || norm.text,
        presenterNotes: norm.presenterNotes || "",
        pageReference: norm.pageRef || "",
        bookTitle: norm.bookTitle,
        chapterTitle: norm.chapterTitle,
        author: norm.author,
      };
    });
    pb._slideIndex = pb._slideIndex || {};
    pb._slideIndex[presentationId] = slides;
    return slides;
  }

  function startPresentation(state, presentationId) {
    const pb = ensure(state);
    const pres = getPresentation(state, presentationId);
    if (!pres) throw new Error("Presentation not found");
    const sessionToken = "sess-" + uid();
    pb.sessions[presentationId] = {
      id: "pbv-" + uid(),
      presentationId,
      sessionToken,
      currentSlide: 0,
      autoFollow: true,
      bookmarks: [],
      startedAt: Date.now(),
      presenterName: state.settings?.presenterName || "Presenter",
      lastActiveAt: Date.now(),
    };
    return { sessionToken, session: pb.sessions[presentationId] };
  }

  function getSession(state, presentationId, token) {
    const s = ensure(state).sessions[presentationId];
    if (!s || s.sessionToken !== token) return null;
    return s;
  }

  function getSyncState(state, presentationId, token) {
    const s = getSession(state, presentationId, token);
    if (!s) return null;
    return { currentSlide: s.currentSlide, startedAt: s.startedAt };
  }

  function updateSyncState(state, presentationId, token, slide) {
    const s = getSession(state, presentationId, token);
    if (!s) return false;
    s.currentSlide = Math.max(0, slide | 0);
    s.lastActiveAt = Date.now();
    broadcastSync(presentationId, s);
    return true;
  }

  function broadcastSync(presentationId, session) {
    try {
      const ch = new BroadcastChannel("amps-presentation-" + presentationId);
      ch.postMessage({ currentSlide: session.currentSlide, sessionToken: session.sessionToken });
      ch.close();
    } catch (_) { /* ignore */ }
    try {
      localStorage.setItem(
        "amps-pres-sync-" + presentationId,
        JSON.stringify({ currentSlide: session.currentSlide, t: Date.now(), token: session.sessionToken })
      );
    } catch (_) { /* ignore */ }
  }

  function readBroadcastSlide(presentationId, token) {
    try {
      const raw = localStorage.getItem("amps-pres-sync-" + presentationId);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.token !== token) return null;
      return data.currentSlide;
    } catch (_) {
      return null;
    }
  }

  function serialize(state) {
    const pb = ensure(state);
    return {
      collections: pb.collections,
      presentations: pb.presentations,
      slideIndex: pb._slideIndex || {},
      sessions: pb.sessions || {},
    };
  }

  function hydrate(state, data) {
    if (!data) return;
    const pb = ensure(state);
    if (data.collections) pb.collections = data.collections;
    if (data.presentations) pb.presentations = data.presentations;
    if (data.slideIndex) pb._slideIndex = data.slideIndex;
    if (data.sessions) pb.sessions = data.sessions;
  }

  window.AmpsPresentationStore = {
    ensure,
    normalizeItem,
    createCollection,
    getCollection,
    updateCollection,
    deleteCollection,
    moveItem,
    removeItem,
    createPresentation,
    getPresentation,
    getSlides,
    startPresentation,
    getSession,
    getSyncState,
    updateSyncState,
    readBroadcastSlide,
    broadcastSync,
    serialize,
    hydrate,
    uid,
    MAX_PUBLIC_SLIDES,
  };
})();

/* AMPS Reader — backup, sync, teacher collections */
(function () {
  "use strict";

  function deviceId() {
    let id = localStorage.getItem("amps-device-id");
    if (!id) {
      id = "dev-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem("amps-device-id", id);
    }
    return id;
  }

  function snapshot(state) {
    return {
      version: 3,
      deviceId: deviceId(),
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      progress: state.progress,
      highlights: state.highlights,
      notes: state.notes,
      bookmarks: state.bookmarks,
      favorites: state.favorites,
      journal: state.journal,
      vocabulary: state.vocabulary,
      stats: state.stats,
      pathChapters: state.stats?.pathChapters,
      collections: state.collections,
      importedBooks: state.importedBooks,
      study: { cards: state.study?.cards },
      productivity: state.productivity,
      userStudyCards: state.userStudyCards,
      userStudySession: state.userStudySession,
      readingSessions: state.readingSessions,
    };
  }

  function applySnapshot(state, data) {
    if (!data) return false;
    if (data.settings) Object.assign(state.settings, data.settings);
    if (data.progress) state.progress = data.progress;
    if (data.highlights) state.highlights = data.highlights;
    if (data.notes) state.notes = data.notes;
    if (data.bookmarks) state.bookmarks = data.bookmarks;
    if (data.favorites) state.favorites = data.favorites;
    if (data.journal) state.journal = data.journal;
    if (data.vocabulary) state.vocabulary = data.vocabulary;
    if (data.stats) state.stats = data.stats;
    if (data.collections) state.collections = data.collections;
    if (data.importedBooks) state.importedBooks = data.importedBooks;
    if (data.study?.cards) state.study.cards = data.study.cards;
    if (data.productivity) state.productivity = { ...state.productivity, ...data.productivity };
    if (data.userStudyCards) state.userStudyCards = data.userStudyCards;
    if (data.userStudySession) state.userStudySession = data.userStudySession;
    if (data.readingSessions) state.readingSessions = data.readingSessions;
    state.lastSync = data.exportedAt;
    return true;
  }

  function exportedAtMs(data) {
    const t = Date.parse(data?.exportedAt || "");
    return Number.isFinite(t) ? t : 0;
  }

  /** Pull remote if newer, else push local. Returns { action, data? }. */
  async function syncAccountLww(state, creds) {
    let remote = null;
    try {
      remote = await pullFromLicenseServer(creds);
    } catch (err) {
      if (!/No snapshot/i.test(String(err.message || err))) throw err;
    }
    const localSnap = snapshot(state);
    const remoteT = exportedAtMs(remote);
    const localT = exportedAtMs(localSnap);
    if (remote && remoteT > localT) {
      applySnapshot(state, remote);
      return { action: "pulled", data: remote };
    }
    await pushToLicenseServer(state, creds);
    return { action: remoteT === localT ? "pushed" : "pushed", data: localSnap };
  }

  async function syncEndpointLww(url, state) {
    let remote = null;
    try {
      remote = await pullFromEndpoint(url);
    } catch (_) {
      remote = null;
    }
    const localSnap = snapshot(state);
    if (remote && exportedAtMs(remote) > exportedAtMs(localSnap)) {
      applySnapshot(state, remote);
      return { action: "pulled", data: remote };
    }
    await pushToEndpoint(url, state);
    return { action: "pushed", data: localSnap };
  }

  async function pushToEndpoint(url, state) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot(state)),
    });
    return res.ok;
  }

  async function pullFromEndpoint(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Sync failed");
    return res.json();
  }

  async function pushToLicenseServer(state, creds) {
    const base = String(creds?.apiBaseUrl || "").replace(/\/$/, "");
    if (!base) throw new Error("License server URL not set");
    const res = await fetch(base + "/api/sync/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: creds.email,
        licenseKey: creds.licenseKey,
        deviceId: deviceId(),
        snapshot: snapshot(state),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data;
  }

  async function pullFromLicenseServer(creds) {
    const base = String(creds?.apiBaseUrl || "").replace(/\/$/, "");
    if (!base) throw new Error("License server URL not set");
    const q = new URLSearchParams({
      email: creds.email || "",
      licenseKey: creds.licenseKey || "",
      deviceId: deviceId(),
    });
    const res = await fetch(base + "/api/sync/snapshot?" + q.toString());
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Download failed");
    return data;
  }

  function autoBackup(state) {
    try {
      localStorage.setItem("amps-reader-autobackup", JSON.stringify(snapshot(state)));
    } catch (_) { /* quota */ }
  }

  function restoreAutoBackup(state) {
    try {
      const raw = localStorage.getItem("amps-reader-autobackup");
      if (raw) applySnapshot(state, JSON.parse(raw));
    } catch (_) { /* ignore */ }
  }

  function createCollection(title, desc) {
    return {
      id: "col-" + Date.now().toString(36),
      title,
      description: desc || "",
      items: [],
      created: Date.now(),
    };
  }

  function exportCollection(col) {
    let out = "# " + col.title + "\n" + (col.description || "") + "\n\n";
    col.items.forEach((it, i) => {
      out += (i + 1) + ". " + (it.bookTitle || it.bookId) + " — " + (it.chapterTitle || it.chapterId) + "\n";
      if (it.quote) out += "   > " + it.quote + "\n";
      if (it.note) out += "   " + it.note + "\n";
    });
    return out;
  }

  window.AmpsSync = {
    deviceId, snapshot, applySnapshot, pushToEndpoint, pullFromEndpoint,
    pushToLicenseServer, pullFromLicenseServer,
    syncAccountLww, syncEndpointLww, exportedAtMs,
    autoBackup, restoreAutoBackup, createCollection, exportCollection,
  };
})();

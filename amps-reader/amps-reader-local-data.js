/**
 * Batch 7B — local data export / deletion helpers (app-managed storage only).
 */
(function () {
  "use strict";

  const STATE_KEYS = ["amps-reader-v3", "amps-reader-v1"];
  const EXTRA_KEYS = [
    "amps-reader-autobackup",
    "amps-device-id",
    "amps-series-collapsed",
    "amps-summary-hi-cache",
    "amps-pronunciation-dict-rev-v1",
    "amps-pronunciation-rev-v1",
    "amps-pronunciation-overrides-v1",
  ];

  function flags() {
    return window.AmpsBuildFlags || {};
  }

  function recorderEnabled() {
    if (flags().shlokaRecorder === false) return false;
    if (flags().profileId === "slim-core" || flags().slimCore) return false;
    return true;
  }

  function snapshot(state) {
    return window.AmpsSync?.snapshot?.(state) || {};
  }

  function downloadJson(filename, obj) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function exportFullBackup(state) {
    downloadJson("amps-library-backup.json", snapshot(state));
    return { ok: true, what: "notes, bookmarks, progress, settings, and related local state" };
  }

  function exportNotes(state) {
    downloadJson("amps-library-notes.json", { exportedAt: new Date().toISOString(), notes: state.notes || [] });
    return { ok: true, what: "notes only" };
  }

  function exportBookmarks(state) {
    downloadJson("amps-library-bookmarks.json", { exportedAt: new Date().toISOString(), bookmarks: state.bookmarks || [] });
    return { ok: true, what: "bookmarks only" };
  }

  function exportReadingState(state) {
    downloadJson("amps-library-reading-state.json", {
      exportedAt: new Date().toISOString(),
      progress: state.progress || {},
      recent: state.recent || [],
      readingReturn: state.readingReturn || null,
      settings: state.settings || {},
    });
    return { ok: true, what: "reading progress and settings" };
  }

  function clearNotes(state, saveState) {
    state.notes = [];
    saveState();
    return { ok: true, what: "all notes" };
  }

  function clearBookmarks(state, saveState) {
    state.bookmarks = [];
    saveState();
    return { ok: true, what: "all bookmarks" };
  }

  function clearReadingHistory(state, saveState) {
    state.progress = {};
    state.recent = [];
    state.readingReturn = null;
    state.readingSessions = [];
    state.audioProgress = {};
    saveState();
    return { ok: true, what: "reading history and resume positions" };
  }

  async function clearDownloadedPacks() {
    const pm = window.AmpsPackManager;
    if (!pm?.listInstalled) return { ok: false, error: "Pack manager unavailable" };
    const installed = await pm.listInstalled();
    for (const row of installed || []) {
      if (row?.packId) await pm.remove(row.packId);
    }
    return { ok: true, what: "downloaded packs (notes/bookmarks preserved)" };
  }

  async function clearCaches() {
    if (window.AmpsPackManager?.clearObsoleteCaches) {
      const releaseId = window.AmpsEnhance?.libraryVersion?.() || "";
      await window.AmpsPackManager.clearObsoleteCaches(releaseId);
    }
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      for (const k of keys) {
        if (/^amps-shell-|^amps-runtime-|^amps-metadata-|^amps-pack-temp-/.test(k)) {
          await caches.delete(k);
        }
      }
    }
    return { ok: true, what: "obsolete/shell caches (pack bodies you still need may remain until pack remove)" };
  }

  async function clearLocalRecordingsIfPresent() {
    if (!recorderEnabled()) return { ok: true, skipped: true, what: "recordings (recorder excluded in this build)" };
    try {
      await new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase("amps-shloka-recordings-v1");
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
      });
      return { ok: true, what: "local shloka recordings database" };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  }

  function resetAllLocalAppData() {
    for (const k of STATE_KEYS.concat(EXTRA_KEYS)) {
      try {
        localStorage.removeItem(k);
      } catch (_) {}
    }
    return { ok: true, what: "all local app preferences and reading data keys (reload required)" };
  }

  window.AmpsLocalData = {
    recorderEnabled,
    exportFullBackup,
    exportNotes,
    exportBookmarks,
    exportReadingState,
    clearNotes,
    clearBookmarks,
    clearReadingHistory,
    clearDownloadedPacks,
    clearCaches,
    clearLocalRecordingsIfPresent,
    resetAllLocalAppData,
  };
})();

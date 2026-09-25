/**
 * AMPS Reader — transactional content pack manager (Batch 5B).
 * Cache Storage for immutable files; IndexedDB for pack state.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AmpsPackManager = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DB_NAME = "amps-packs-v1";
  const DB_STORE = "installed";
  const TEMP_PREFIX = "amps-pack-temp-";
  const LIVE_PREFIX = "amps-pack-";

  let catalogCache = null;
  let cancelFlags = new Map();

  function openDb() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE, { keyPath: "packId" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("idb open failed"));
    });
  }

  async function idbGetAll() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(packId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).get(packId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPut(record) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbDelete(packId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(packId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function sha256Response(response) {
    const buf = await response.clone().arrayBuffer();
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const hash = await crypto.subtle.digest("SHA-256", buf);
      return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    // Fallback: cannot verify cryptographically — reject in public installs.
    throw new Error("subtle_crypto_unavailable");
  }

  async function loadCatalog() {
    if (catalogCache) return catalogCache;
    try {
      const res = await fetch("data/packs/pack-catalog.json", { cache: "no-store" });
      if (!res.ok) {
        catalogCache = { packs: [], status: "missing" };
        return catalogCache;
      }
      catalogCache = await res.json();
      return catalogCache;
    } catch (_) {
      catalogCache = { packs: [], status: "unavailable" };
      return catalogCache;
    }
  }

  async function listAvailable() {
    const cat = await loadCatalog();
    return Array.isArray(cat.packs) ? cat.packs : [];
  }

  async function listInstalled() {
    try {
      return await idbGetAll();
    } catch (_) {
      return [];
    }
  }

  async function estimateQuota() {
    if (navigator?.storage?.estimate) {
      const est = await navigator.storage.estimate();
      return { usage: est.usage || 0, quota: est.quota || 0 };
    }
    return { usage: null, quota: null };
  }

  function requiredSpace(pack) {
    return Number(pack?.sizeBytes || 0);
  }

  function liveCacheName(packId, version) {
    return `${LIVE_PREFIX}${packId}-${version}`;
  }

  function tempCacheName(packId, version) {
    return `${TEMP_PREFIX}${packId}-${version}`;
  }

  async function fetchManifest(pack) {
    const url = pack.manifestPath?.startsWith("packs/")
      ? `data/${pack.manifestPath}`
      : pack.manifestPath;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("manifest_fetch_failed");
    return res.json();
  }

  async function fileUrl(packId, relPath) {
    // Prefer pack payload copy; fall back to live data path (still bundled).
    const packUrl = `data/packs/${packId}/files/${relPath}`;
    const direct = `data/${relPath}`;
    try {
      const head = await fetch(packUrl, { method: "HEAD", cache: "no-store" });
      if (head.ok) return packUrl;
    } catch (_) {}
    return direct;
  }

  async function install(packId, opts = {}) {
    cancelFlags.set(packId, false);
    const available = await listAvailable();
    const pack = available.find((p) => p.packId === packId);
    if (!pack) return { ok: false, error: "pack_not_found", packId };
    if (String(pack.status || "").startsWith("BLOCKED")) {
      return { ok: false, error: pack.status, packId };
    }
    if (!pack.manifestPath) return { ok: false, error: "pack_files_not_published", packId };

    const release = opts.releaseId || null;
    if (
      release &&
      Array.isArray(pack.compatibleReleaseIds) &&
      pack.compatibleReleaseIds.length &&
      !pack.compatibleReleaseIds.includes(release)
    ) {
      return { ok: false, error: "incompatible_release", packId };
    }

    const quota = await estimateQuota();
    const need = requiredSpace(pack);
    if (quota.quota && quota.usage != null && need > 0 && quota.usage + need > quota.quota) {
      return { ok: false, error: "insufficient_storage", need, quota };
    }

    let manifest;
    try {
      manifest = await fetchManifest(pack);
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }

    const version = manifest.version || pack.version || "1.0.0";
    const tempName = tempCacheName(packId, version);
    const liveName = liveCacheName(packId, version);
    if (typeof caches === "undefined") {
      return { ok: false, error: "cache_storage_unavailable" };
    }

    // Preserve previous live cache until commit succeeds.
    const previous = await idbGet(packId);
    await caches.delete(tempName);
    const tempCache = await caches.open(tempName);
    const progress = { done: 0, total: (manifest.files || []).length };

    try {
      for (const f of manifest.files || []) {
        if (cancelFlags.get(packId)) throw new Error("cancelled");
        if (/rejected|quarantine|admin\//i.test(f.path)) throw new Error("private_path:" + f.path);
        const url = await fileUrl(packId, f.path);
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error("fetch_failed:" + f.path);
        const hash = await sha256Response(res);
        if (hash !== f.sha256) throw new Error("hash_mismatch:" + f.path);
        await tempCache.put(url, res);
        // Also key by canonical data path for reader fetches
        await tempCache.put(`data/${f.path}`, await fetch(url, { cache: "no-store" }));
        progress.done += 1;
        opts.onProgress?.(progress);
      }

      // Commit: rename temp → live by copying keys
      await caches.delete(liveName);
      const liveCache = await caches.open(liveName);
      const keys = await tempCache.keys();
      for (const req of keys) {
        const res = await tempCache.match(req);
        if (res) await liveCache.put(req, res);
      }
      await caches.delete(tempName);

      const record = {
        packId,
        version,
        type: pack.type,
        sha256: manifest.sha256,
        sizeBytes: manifest.sizeBytes,
        fileCount: manifest.fileCount,
        cacheName: liveName,
        installedAt: new Date().toISOString(),
        status: "installed",
        lastVerifiedAt: new Date().toISOString(),
      };
      await idbPut(record);

      // Remove older version caches for same packId
      if (previous?.cacheName && previous.cacheName !== liveName) {
        await caches.delete(previous.cacheName);
      }

      return { ok: true, pack: record };
    } catch (err) {
      await caches.delete(tempName);
      return {
        ok: false,
        error: String(err && err.message ? err.message : err),
        preservedPrevious: Boolean(previous),
        progress,
      };
    } finally {
      cancelFlags.delete(packId);
    }
  }

  function cancel(packId) {
    cancelFlags.set(packId, true);
    return { ok: true };
  }

  async function verify(packId) {
    const rec = await idbGet(packId);
    if (!rec) return { ok: false, error: "not_installed" };
    const available = await listAvailable();
    const pack = available.find((p) => p.packId === packId);
    if (!pack?.manifestPath) return { ok: false, error: "manifest_missing" };
    const manifest = await fetchManifest(pack);
    const cache = await caches.open(rec.cacheName);
    for (const f of manifest.files || []) {
      const hit = (await cache.match(`data/${f.path}`)) || (await cache.match(await fileUrl(packId, f.path)));
      if (!hit) return { ok: false, error: "missing_file", path: f.path };
      const hash = await sha256Response(hit);
      if (hash !== f.sha256) return { ok: false, error: "hash_mismatch", path: f.path };
    }
    rec.lastVerifiedAt = new Date().toISOString();
    rec.status = "installed";
    await idbPut(rec);
    return { ok: true, pack: rec };
  }

  async function repair(packId) {
    const removed = await remove(packId);
    if (!removed.ok && removed.error !== "not_installed") return removed;
    return install(packId);
  }

  async function update(packId) {
    // Install new version; previous preserved until commit inside install().
    return install(packId);
  }

  async function remove(packId) {
    try {
      const rec = await idbGet(packId);
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (k) =>
              k.indexOf(LIVE_PREFIX + packId) === 0 ||
              k.indexOf(TEMP_PREFIX + packId) === 0 ||
              (rec && k === rec.cacheName)
          )
          .map((k) => caches.delete(k))
      );
      await idbDelete(packId);
      return {
        ok: true,
        preservedUserData: true,
        preserved: [
          "notes",
          "bookmarks",
          "readingHistory",
          "resumePosition",
          "shlokaReviewDecisions",
          "presentationProjects",
        ],
      };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }

  async function clearObsoleteCaches(releaseId) {
    const keys = await caches.keys();
    const removed = [];
    for (const k of keys) {
      if (
        (k.indexOf("amps-shell-") === 0 ||
          k.indexOf("amps-runtime-") === 0 ||
          k.indexOf("amps-metadata-") === 0) &&
        releaseId &&
        k.indexOf(releaseId) === -1
      ) {
        await caches.delete(k);
        removed.push(k);
      }
      if (k.indexOf(TEMP_PREFIX) === 0) {
        await caches.delete(k);
        removed.push(k);
      }
    }
    return { ok: true, removed };
  }

  async function exportDiagnostics() {
    const [installed, available, quota] = await Promise.all([
      listInstalled(),
      listAvailable(),
      estimateQuota(),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      installedCount: installed.length,
      availableCount: available.length,
      quota,
      installed: installed.map((p) => ({
        packId: p.packId,
        version: p.version,
        installedAt: p.installedAt,
        status: p.status,
        lastVerifiedAt: p.lastVerifiedAt,
      })),
    };
  }

  async function installFromParsedArchive(parsed, opts = {}) {
    if (!parsed?.ok || !parsed.manifest) return { ok: false, error: "invalid_archive" };
    const Amps = typeof globalThis !== "undefined" ? globalThis : window;
    const allowUnsignedFlag = Amps.AmpsBuildFlags?.allowUnsignedPacks !== false;
    const allowUnsigned =
      opts.allowUnsigned != null ? opts.allowUnsigned : allowUnsignedFlag;
    if (!allowUnsigned && parsed.trust?.state !== "signed") {
      return { ok: false, error: "unsigned_pack_rejected" };
    }
    const packId = parsed.manifest.packId;
    const version = parsed.manifest.version || "1.0.0";
    const release = opts.releaseId || null;
    if (
      release &&
      Array.isArray(parsed.manifest.compatibleReleaseIds) &&
      parsed.manifest.compatibleReleaseIds.length &&
      !parsed.manifest.compatibleReleaseIds.includes(release)
    ) {
      return { ok: false, error: "incompatible_release", packId };
    }
    if (typeof caches === "undefined") return { ok: false, error: "cache_storage_unavailable" };

    const previous = await idbGet(packId);
    const tempName = tempCacheName(packId, version);
    const liveName = liveCacheName(packId, version);
    await caches.delete(tempName);
    const tempCache = await caches.open(tempName);
    const progress = { done: 0, total: (parsed.files || []).length };
    try {
      for (const f of parsed.files || []) {
        if (cancelFlags.get(packId)) throw new Error("cancelled");
        if (/rejected|quarantine|admin\//i.test(f.path)) throw new Error("private_path:" + f.path);
        const body = new Blob([f.buffer], { type: "application/json" });
        const res = new Response(body, {
          status: 200,
          headers: { "Content-Type": "application/json", "X-Amps-Pack": packId },
        });
        await tempCache.put(`data/${f.path}`, res.clone());
        progress.done += 1;
        opts.onProgress?.(progress);
      }
      await caches.delete(liveName);
      const liveCache = await caches.open(liveName);
      for (const req of await tempCache.keys()) {
        const res = await tempCache.match(req);
        if (res) await liveCache.put(req, res);
      }
      await caches.delete(tempName);
      const record = {
        packId,
        version,
        type: parsed.manifest.type,
        sha256: parsed.manifest.sha256,
        sizeBytes: parsed.manifest.sizeBytes,
        fileCount: parsed.manifest.fileCount,
        cacheName: liveName,
        installedAt: new Date().toISOString(),
        status: "installed",
        lastVerifiedAt: new Date().toISOString(),
        source: "local_archive",
        trustState: parsed.trust?.state || "internal_unsigned",
      };
      await idbPut(record);
      if (previous?.cacheName && previous.cacheName !== liveName) {
        await caches.delete(previous.cacheName);
      }
      return { ok: true, pack: record };
    } catch (err) {
      await caches.delete(tempName);
      return {
        ok: false,
        error: String(err && err.message ? err.message : err),
        preservedPrevious: Boolean(previous),
        progress,
      };
    }
  }

  async function importArchiveFile(file, opts = {}) {
    const Amps = typeof globalThis !== "undefined" ? globalThis : window;
    if (!Amps.AmpsAmpspack?.previewFile) return { ok: false, error: "ampspack_helper_missing" };
    const preview = await Amps.AmpsAmpspack.previewFile(file);
    if (!opts.confirm) {
      return { ok: true, previewOnly: true, preview };
    }
    return installFromParsedArchive(preview._parsed, opts);
  }

  const SOURCES = {
    canonicalReference: "canonical-reference",
    bundledArchive: "bundled-archive",
    localFileImport: "local-file-import",
    developmentHttp: "development-http",
    https: "https-disabled-by-default",
  };

  function listSources() {
    const Amps = typeof globalThis !== "undefined" ? globalThis : window;
    const flags = Amps.AmpsBuildFlags || {};
    return [
      { id: SOURCES.canonicalReference, enabled: true },
      { id: SOURCES.bundledArchive, enabled: true },
      { id: SOURCES.localFileImport, enabled: flags.localPackImport !== false },
      { id: SOURCES.developmentHttp, enabled: true },
      { id: SOURCES.https, enabled: !!flags.httpsPackSource },
    ];
  }

  return {
    DB_NAME,
    SOURCES,
    listSources,
    listAvailable,
    listInstalled,
    estimateQuota,
    requiredSpace,
    install,
    installFromParsedArchive,
    importArchiveFile,
    cancel,
    resume: async (packId) => install(packId),
    verify,
    repair,
    update,
    remove,
    clearObsoleteCaches,
    exportDiagnostics,
    loadCatalog,
  };
});

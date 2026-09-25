/**
 * Browser .ampspack preview/import helpers (Batch 6A).
 * Uses vendored JSZip. Node verification lives in scripts/lib/ampspack.js.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AmpsAmpspack = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BANNED = /(^|\/)(admin\/|\.env|secrets?\/|keystore|rejected\/|quarantine\/)/i;

  function assertSafeRelPath(rel) {
    const p = String(rel || "").replace(/\\/g, "/");
    if (!p || p.startsWith("/") || p.includes("\0") || p.split("/").includes("..")) {
      throw new Error("zip_slip:" + rel);
    }
    if (BANNED.test(p)) throw new Error("banned_path:" + rel);
    return p;
  }

  async function sha256Bytes(buf) {
    if (!crypto?.subtle) throw new Error("subtle_crypto_unavailable");
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function getJSZip() {
    if (typeof JSZip === "undefined") throw new Error("jszip_unavailable");
    return JSZip;
  }

  async function parseArchive(arrayBuffer) {
    const zip = await getJSZip().loadAsync(arrayBuffer);
    const names = Object.keys(zip.files);
    const seen = new Set();
    for (const name of names) {
      const rel = name.replace(/\\/g, "/");
      if (zip.files[name].dir) continue;
      if (seen.has(rel)) throw new Error("duplicate_archive_path:" + rel);
      seen.add(rel);
      assertSafeRelPath(rel);
      if (
        rel !== "pack-manifest.json" &&
        rel !== "trust.json" &&
        !rel.startsWith("files/")
      ) {
        throw new Error("unexpected_archive_entry:" + rel);
      }
    }

    const manEntry = zip.file("pack-manifest.json");
    if (!manEntry) throw new Error("malformed_manifest");
    const manText = await manEntry.async("string");
    let manifest;
    try {
      manifest = JSON.parse(manText);
    } catch (err) {
      throw new Error("malformed_manifest:" + err.message);
    }
    const trustEntry = zip.file("trust.json");
    const trust = trustEntry
      ? JSON.parse(await trustEntry.async("string"))
      : { state: "internal_unsigned" };
    const manifestSha256 = await sha256Bytes(new TextEncoder().encode(manText));
    if (trust.manifestSha256 && trust.manifestSha256 !== manifestSha256) {
      throw new Error("manifest_hash_mismatch");
    }

    const files = [];
    for (const f of manifest.files || []) {
      const rel = assertSafeRelPath(f.path);
      const entry = zip.file("files/" + rel);
      if (!entry) throw new Error("missing_file:" + rel);
      const buf = await entry.async("arraybuffer");
      const hash = await sha256Bytes(buf);
      if (hash !== f.sha256) throw new Error("hash_mismatch:" + rel);
      files.push({ path: rel, bytes: buf.byteLength, sha256: hash, buffer: buf });
    }

    const totalAlt = await sha256Bytes(
      new TextEncoder().encode((manifest.files || []).map((f) => `${f.sha256}  ${f.path}`).join("\n"))
    );
    if (manifest.sha256 && manifest.sha256 !== totalAlt) {
      throw new Error("incorrect_total_hash");
    }

    return {
      ok: true,
      manifest,
      trust: { ...trust, verifiedManifestSha256: manifestSha256 },
      files,
      preview: {
        title: manifest.title || manifest.packId,
        packId: manifest.packId,
        type: manifest.type,
        version: manifest.version,
        sizeBytes: manifest.sizeBytes,
        fileCount: manifest.fileCount || files.length,
        compatibility: manifest.compatibleReleaseIds || [],
        dependencies: manifest.dependencies || [],
        trustState: trust.state || "internal_unsigned",
        files: (manifest.files || []).map((f) => ({
          path: f.path,
          bytes: f.bytes,
          sha256: f.sha256,
        })),
      },
    };
  }

  async function previewFile(file) {
    const buf = await file.arrayBuffer();
    const parsed = await parseArchive(buf);
    return { ...parsed.preview, ok: true, archiveBytes: buf.byteLength, _parsed: parsed };
  }

  return {
    parseArchive,
    previewFile,
    assertSafeRelPath,
  };
});

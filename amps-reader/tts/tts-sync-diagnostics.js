/* AMPS Library — private TTS sync diagnostics (no verbose public logs) */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TtsSyncDiagnostics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const MAX = 400;
  const buffer = [];
  let enabled = false;

  function isEnabled() {
    if (enabled) return true;
    try {
      if (root.AmpsBuildFlags?.diagnosticsDefault === true) return true;
      if (root.AmpsBuildFlags?.internalResearch === true) return true;
      if (root.localStorage?.getItem("ampsTtsSyncDebug") === "1") return true;
    } catch (_) { /* */ }
    return false;
  }

  function setEnabled(v) {
    enabled = !!v;
  }

  function log(evt) {
    if (!isEnabled()) return;
    const row = {
      timestamp: new Date().toISOString(),
      sessionId: evt.sessionId || null,
      paragraphId: evt.paragraphId || null,
      segmentId: evt.segmentId || null,
      chunkId: evt.chunkId || null,
      event: evt.event || "unknown",
      charIndex: evt.charIndex,
      elapsedMs: evt.elapsedMs,
      status: evt.status,
      endReason: evt.endReason,
      platform: evt.platform,
      voice: evt.voice,
      language: evt.language,
    };
    buffer.push(row);
    if (buffer.length > MAX) buffer.shift();
    try {
      if (root.console && root.localStorage?.getItem("ampsTtsSyncDebug") === "1") {
        root.console.debug?.("[tts-sync]", row.event, row.paragraphId, row.chunkId, row.endReason || "");
      }
    } catch (_) { /* */ }
  }

  function snapshot() {
    return buffer.slice();
  }

  function clear() {
    buffer.length = 0;
  }

  return { log, snapshot, clear, setEnabled, isEnabled };
});

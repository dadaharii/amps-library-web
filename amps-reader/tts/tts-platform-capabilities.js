/* AMPS Library — per-platform TTS capability registry */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TtsPlatformCapabilities = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SYNC = Object.freeze({
    TIMESTAMP_ALIGNED: "timestamp_aligned",
    BOUNDARY_ALIGNED: "boundary_aligned",
    CHUNK_ALIGNED: "chunk_aligned",
  });

  /** Conservative defaults — do not assume desktop Chrome on mobile. */
  const PROFILES = Object.freeze([
    {
      id: "desktop-chrome-speechSynthesis",
      platform: "browser-desktop",
      engine: "speechSynthesis",
      wordBoundaryReliable: true,
      phraseBoundaryReliable: true,
      pauseResumeReliable: true,
      maxChunkChars: 240,
      syncMode: SYNC.BOUNDARY_ALIGNED,
      backgroundBehavior: "may-cancel",
      voiceSwitchBehavior: "cancels-active",
    },
    {
      id: "android-webview-speechSynthesis",
      platform: "android-webview",
      engine: "speechSynthesis",
      wordBoundaryReliable: false,
      phraseBoundaryReliable: false,
      pauseResumeReliable: false,
      maxChunkChars: 180,
      syncMode: SYNC.CHUNK_ALIGNED,
      backgroundBehavior: "interrupts",
      voiceSwitchBehavior: "cancels-active",
    },
    {
      id: "android-native-ampsTts",
      platform: "android-native",
      engine: "AmpsTts",
      wordBoundaryReliable: false,
      phraseBoundaryReliable: false,
      pauseResumeReliable: true,
      maxChunkChars: 200,
      syncMode: SYNC.CHUNK_ALIGNED,
      backgroundBehavior: "interrupts",
      voiceSwitchBehavior: "cancels-active",
    },
    {
      id: "ios-webview-speechSynthesis",
      platform: "ios-webview",
      engine: "speechSynthesis",
      wordBoundaryReliable: false,
      phraseBoundaryReliable: false,
      pauseResumeReliable: false,
      maxChunkChars: 220,
      syncMode: SYNC.CHUNK_ALIGNED,
      backgroundBehavior: "interrupts",
      voiceSwitchBehavior: "cancels-active",
    },
    {
      id: "human-audio-timestamped",
      platform: "any",
      engine: "approved-human",
      wordBoundaryReliable: true,
      phraseBoundaryReliable: true,
      pauseResumeReliable: true,
      maxChunkChars: 100000,
      syncMode: SYNC.TIMESTAMP_ALIGNED,
      backgroundBehavior: "pauses",
      voiceSwitchBehavior: "n/a",
    },
  ]);

  function detectPlatform(hints) {
    const h = hints || {};
    if (h.engine === "approved-human" || h.hasTimestamps) return "human-audio-timestamped";
    if (h.engine === "AmpsTts" || h.nativeAndroid) return "android-native-ampsTts";
    const ua = String(h.userAgent || (typeof navigator !== "undefined" ? navigator.userAgent : "") || "");
    const isAndroid = /Android/i.test(ua) || h.platform === "android";
    const isIOS = /iPhone|iPad|iPod/i.test(ua) || h.platform === "ios";
    if (isAndroid) return "android-webview-speechSynthesis";
    if (isIOS) return "ios-webview-speechSynthesis";
    return "desktop-chrome-speechSynthesis";
  }

  function resolve(hints) {
    if (hints && hints.syncMode && hints.maxChunkChars != null && hints.id) {
      return { ...hints };
    }
    const id = detectPlatform(hints);
    const profile = PROFILES.find(p => p.id === id) || PROFILES[0];
    return { ...profile };
  }

  function syncModeFor(hints) {
    return resolve(hints).syncMode;
  }

  function maxChunkChars(hints) {
    return resolve(hints).maxChunkChars;
  }

  function wordHighlightAllowed(hints) {
    const p = resolve(hints);
    return p.syncMode === SYNC.TIMESTAMP_ALIGNED
      || (p.syncMode === SYNC.BOUNDARY_ALIGNED && p.wordBoundaryReliable === true);
  }

  return {
    SYNC,
    PROFILES,
    detectPlatform,
    resolve,
    syncModeFor,
    maxChunkChars,
    wordHighlightAllowed,
  };
});

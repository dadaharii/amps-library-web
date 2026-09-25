/* AMPS Reader — bundled pre-rendered shloka audio playback (offline, $0 runtime) */
(function (root) {
  "use strict";

  const MANIFEST_URL = "data/shloka-audio/manifest.json";
  const MANIFEST_V2_URL = "data/shloka-audio/manifest-v2.json";
  const AUDIO_BASE = "data/shloka-audio/";
  const BED_REL = "voice-assets/shloka-flute-sitar-bed-source.mp3";
  /** Bed alone (intro/tail). Overridable via settings / Studio slider. */
  const DEFAULT_BED_VOLUME = 0.24;
  /** Bed under voice — off by default (dual-recitation policy). Studio slider can raise. */
  const UNDER_VOICE_BED_VOLUME = 0;
  const DEFAULT_BED_LEAD_MS = 10000;
  const DEFAULT_BED_TAIL_MS = 10000;
  /** Card / device-live: no lead delay (old 10s wait felt like silence). */
  const DEVICE_LIVE_BED_LEAD_MS = 0;
  const BED_FADE_IN_MS = 1600;
  const BED_FADE_OUT_MS = 2500;

  const READER_BASE = (() => {
    try {
      const scripts = document.getElementsByTagName("script");
      for (let i = scripts.length - 1; i >= 0; i -= 1) {
        const src = scripts[i].src;
        if (src && /amps-reader-shloka-audio\.js(?:\?|$)/.test(src)) {
          return new URL("./", src);
        }
      }
      const pageDir = location.pathname.replace(/[^/]*$/, "");
      return new URL(pageDir || "./", location.href);
    } catch (_) {
      return null;
    }
  })();

  let manifestPromise = null;
  let manifestCache = null;
  let manifestV2Cache = null;
  let activeAudio = null;
  let bedAudio = null;
  let bedSessionActive = false;
  let playing = false;
  let paused = false;
  let cancelToken = 0;
  let bedFadeRaf = null;
  let bedFadeToken = 0;
  /** Live override 0–1 from Studio slider (null = use defaults). */
  let bedVolumeOverride = null;

  function clamp01(n, fallback) {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(0, Math.min(1, v));
  }

  function readSettingsBedVolume() {
    try {
      const s = window.AmpsReader?.getState?.()?.settings
        || window.AmpsApp?.state?.settings
        || null;
      if (s && s.shlokaBedVolume != null) return clamp01(s.shlokaBedVolume, null);
    } catch (_) { /* ignore */ }
    return null;
  }

  function getBedVolume() {
    const live = bedVolumeOverride != null ? bedVolumeOverride : readSettingsBedVolume();
    if (live != null) return clamp01(live * 0.75, DEFAULT_BED_VOLUME);
    return DEFAULT_BED_VOLUME;
  }

  function getUnderVoiceBedVolume() {
    const live = bedVolumeOverride != null ? bedVolumeOverride : readSettingsBedVolume();
    if (live != null) return clamp01(live, UNDER_VOICE_BED_VOLUME);
    return UNDER_VOICE_BED_VOLUME;
  }

  /** Set live bed level 0–1 (Studio slider). Pass null to clear override. */
  function setBedVolumeLevel(level) {
    if (level == null || level === "") {
      bedVolumeOverride = null;
    } else {
      bedVolumeOverride = clamp01(level, UNDER_VOICE_BED_VOLUME);
    }
    if (bedAudio && bedSessionActive) {
      applyBedVolume(getUnderVoiceBedVolume());
    }
    return bedVolumeOverride != null ? bedVolumeOverride : getUnderVoiceBedVolume();
  }

  function getBedVolumeLevel() {
    return getUnderVoiceBedVolume();
  }

  function applyBedVolume(level) {
    if (!bedAudio) return;
    const v = Math.max(0, Math.min(1, Number(level) || 0));
    try { bedAudio.volume = v; } catch (_) { /* ignore */ }
  }

  function cancelBedFade() {
    if (bedFadeRaf) cancelAnimationFrame(bedFadeRaf);
    bedFadeRaf = null;
    bedFadeToken += 1;
  }

  function fadeBedVolume(from, to, ms) {
    cancelBedFade();
    const token = bedFadeToken;
    const startVol = Math.max(0, Math.min(1, Number(from) || 0));
    const endVol = Math.max(0, Math.min(1, Number(to) || 0));
    const dur = Math.max(40, Number(ms) || 0);
    return new Promise(resolve => {
      if (!bedAudio || dur <= 40) {
        applyBedVolume(endVol);
        resolve();
        return;
      }
      applyBedVolume(startVol);
      const t0 = performance.now();
      const tick = now => {
        if (token !== bedFadeToken || !bedAudio) {
          resolve();
          return;
        }
        const p = Math.min(1, (now - t0) / dur);
        const eased = p * p * (3 - 2 * p);
        applyBedVolume(startVol + (endVol - startVol) * eased);
        if (p < 1) {
          bedFadeRaf = requestAnimationFrame(tick);
        } else {
          bedFadeRaf = null;
          resolve();
        }
      };
      bedFadeRaf = requestAnimationFrame(tick);
    });
  }

  function hardStopBed() {
    cancelBedFade();
    bedSessionActive = false;
    if (!bedAudio) return;
    try {
      bedAudio.pause();
      bedAudio.currentTime = 0;
      bedAudio.src = "";
    } catch (_) { /* ignore */ }
    bedAudio = null;
  }

  async function stopBed(opts = {}) {
    const fade = opts.fade !== false;
    if (!bedAudio) {
      bedSessionActive = false;
      return;
    }
    if (!fade) {
      hardStopBed();
      return;
    }
    const from = Number(bedAudio.volume) || 0;
    bedSessionActive = false;
    await fadeBedVolume(from, 0, opts.fadeMs ?? BED_FADE_OUT_MS);
    if (!bedAudio) return;
    try {
      bedAudio.pause();
      bedAudio.currentTime = 0;
      bedAudio.src = "";
    } catch (_) { /* ignore */ }
    bedAudio = null;
  }

  async function startBed(leadMs, opts = {}) {
    const url = audioUrl(BED_REL);
    if (!url) return;
    const underVoice = opts.underVoice === true;
    const target = underVoice ? getUnderVoiceBedVolume() : getBedVolume();
    const fadeIn = opts.fade !== false;
    if (!bedAudio) {
      bedAudio = new Audio(url);
      bedAudio.loop = true;
    }
    bedSessionActive = true;
    applyBedVolume(fadeIn ? 0 : target);
    try {
      const p = bedAudio.play();
      if (p?.catch) await p.catch(() => {});
    } catch (_) { /* ignore */ }
    if (fadeIn) {
      await fadeBedVolume(0, target, opts.fadeInMs ?? BED_FADE_IN_MS);
    } else {
      applyBedVolume(target);
    }
    if (leadMs > 0) await delay(leadMs);
    // Hold audible under-voice level once voice is expected.
    if ((leadMs > 0 || underVoice) && bedSessionActive && bedAudio) {
      const cur = Number(bedAudio.volume) || 0;
      const want = getUnderVoiceBedVolume();
      if (Math.abs(cur - want) > 0.02) {
        await fadeBedVolume(cur, want, 500);
      } else {
        applyBedVolume(want);
      }
    }
  }

  /** Start bed under voice immediately at audible under-voice level. */
  function startBedUnderVoice(leadMs) {
    const ms = leadMs == null ? DEVICE_LIVE_BED_LEAD_MS : leadMs;
    startBed(ms, { underVoice: true, fade: true }).catch(() => {});
  }

  async function releaseBedAfterTail(tailMs, token) {
    const ms = Math.max(0, Number(tailMs) || DEFAULT_BED_TAIL_MS);
    if (!bedSessionActive) return;
    const fadeMs = Math.min(BED_FADE_OUT_MS, Math.max(800, ms));
    const holdMs = Math.max(0, ms - fadeMs);
    const deadlineHold = Date.now() + holdMs;
    while (Date.now() < deadlineHold) {
      if (token != null && token !== cancelToken) return;
      if (!bedSessionActive) return;
      await waitWhilePaused(token ?? cancelToken);
      if (token != null && token !== cancelToken) return;
      await delay(Math.min(150, Math.max(0, deadlineHold - Date.now())));
    }
    if (token != null && token !== cancelToken) return;
    if (!bedSessionActive) return;
    await stopBed({ fade: true, fadeMs });
  }

  async function syncBedForVoice(leadMs) {
    if (bedSessionActive && bedAudio) {
      resumeBed();
      return;
    }
    await startBed(leadMs ?? DEFAULT_BED_LEAD_MS, { underVoice: true });
  }

  function shlokaAudioNeedsBedPadding(mediaEl) {
    return mediaEl?.dataset?.shlokaDeviceLive === "1";
  }

  async function playCardWithBedPadding(mediaEl) {
    if (!mediaEl) return;
    if (!shlokaAudioNeedsBedPadding(mediaEl)) {
      mediaEl.volume = 1;
      mediaEl.muted = false;
      const p = mediaEl.play();
      if (p?.catch) p.catch(() => {});
      return;
    }
    // Device live: play voice immediately; bed stays audible under the voice.
    mediaEl.volume = 1;
    mediaEl.muted = false;
    await startBed(DEVICE_LIVE_BED_LEAD_MS, { underVoice: true });
    applyBedVolume(getUnderVoiceBedVolume());
    const ended = new Promise(resolve => {
      const done = () => {
        mediaEl.removeEventListener("ended", done);
        mediaEl.removeEventListener("error", done);
        resolve();
      };
      mediaEl.addEventListener("ended", done);
      mediaEl.addEventListener("error", done);
      const p = mediaEl.play();
      if (p?.catch) p.catch(done);
    });
    await ended;
    await releaseBedAfterTail(DEFAULT_BED_TAIL_MS, null);
  }

  function pauseBed() {
    try { bedAudio?.pause?.(); } catch (_) { /* ignore */ }
  }

  function resumeBed() {
    if (!bedSessionActive || !bedAudio) return;
    const want = getUnderVoiceBedVolume();
    const cur = Number(bedAudio.volume) || 0;
    if (cur < want * 0.85) fadeBedVolume(cur, want, 600);
    else applyBedVolume(want);
    try {
      const p = bedAudio.play();
      if (p?.catch) p.catch(() => {});
    } catch (_) { /* ignore */ }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function manifestUrl() {
    try {
      if (READER_BASE) return new URL(MANIFEST_URL, READER_BASE).toString();
    } catch (_) { /* fall through */ }
    return MANIFEST_URL;
  }

  function audioRelPath(relPath) {
    if (!relPath) return "";
    return AUDIO_BASE + String(relPath).replace(/^\//, "");
  }

  function audioUrl(relPath) {
    if (!relPath) return "";
    const raw = String(relPath);
    if (/^(https?:|blob:|data:)/i.test(raw)) return raw;
    const rel = raw.startsWith(AUDIO_BASE) ? raw : audioRelPath(raw);
    if (!rel) return "";
    try {
      if (READER_BASE) return new URL(rel, READER_BASE).toString();
    } catch (_) { /* fall through */ }
    return rel;
  }

  function publicAudioSrc(relPath) {
    return audioUrl(relPath) || "";
  }

  function isLiveHumanEntry(entry) {
    if (!entry?.humanFile) return false;
    if (entry.audioType === "machine_recitation" || entry.provider === "machine") return false;
    if (entry.humanClone) return false;
    if (entry.humanLive === true) return true;
    return !entry.humanClone;
  }

  function isGeneratedEntry(entry) {
    if (!entry) return false;
    if (entry.humanClone && entry.humanFile) return true;
    return !!entry.file;
  }

  function generatedRelPath(entry) {
    if (!entry) return "";
    // Clones are machine drafts — not public generated audio unless approved
    if (entry.humanClone && entry.humanFile) {
      if (entry.reviewStatus === "approved_machine_recitation") return entry.humanFile;
      return "";
    }
    return entry.file || "";
  }

  function syncSrcFor(paraId) {
    const entry = manifestCache?.entries?.[paraId];
    const v2 = manifestV2Cache?.entries?.[paraId];
    if (v2?.audio) {
      const human = v2.audio.human;
      if (human?.file && human.status === "approved") {
        return {
          src: publicAudioSrc(human.file),
          fallback: "",
          humanOnly: true,
          live: true,
        };
      }
      const machine = v2.audio.machine;
      if (machine?.status === "approved_machine_recitation") {
        const selected = machine.selected_engine && machine.candidates?.[machine.selected_engine];
        if (selected?.file && selected.status !== "rejected" && selected.approved === true) {
          return {
            src: publicAudioSrc(selected.file),
            fallback: "",
            humanOnly: false,
            live: false,
          };
        }
      }
      // Manifest-v2 is authoritative: drafts and rejected candidates are never
      // exposed through synchronous public helpers.
      return { src: "", fallback: "", humanOnly: false, live: false };
    }

    if (isLiveHumanEntry(entry) && entry.reviewStatus === "approved") {
      return {
        src: publicAudioSrc(entry.humanFile),
        fallback: "",
        humanOnly: true,
        live: true,
      };
    }
    const approvedMachine = entry?.reviewStatus === "approved_machine_recitation"
      ? generatedRelPath(entry)
      : "";
    return {
      src: approvedMachine ? publicAudioSrc(approvedMachine) : "",
      fallback: "",
      humanOnly: false,
      live: false,
    };
  }

  function hasBundledHuman(entry) {
    return !!(entry?.humanFile);
  }

  async function hasLiveHumanAudio(paraId, entry) {
    if (!paraId) return isLiveHumanEntry(entry);
    try {
      if (await window.AmpsShlokaRecorder?.hasRecording?.(paraId)) return true;
    } catch (_) { /* ignore */ }
    return isLiveHumanEntry(entry);
  }

  async function hasHumanAudio(paraId, entry) {
    if (await hasLiveHumanAudio(paraId, entry)) return true;
    return isGeneratedEntry(entry);
  }

  /** Primary playback path: device live → bundled live → generated clone/TTS. */
  function entryRelPath(entry) {
    if (!entry) return "";
    if (isLiveHumanEntry(entry)) return entry.humanFile;
    return generatedRelPath(entry);
  }

  function humanSrcFor(paraId) {
    const entry = manifestCache?.entries?.[paraId];
    const v2Human = manifestV2Cache?.entries?.[paraId]?.audio?.human;
    if (v2Human?.file) {
      return v2Human.status === "approved" ? publicAudioSrc(v2Human.file) : "";
    }
    if (!isLiveHumanEntry(entry) || entry.reviewStatus !== "approved") return "";
    return entry?.humanFile ? publicAudioSrc(entry.humanFile) : "";
  }

  function bundledSrcFor(paraId) {
    const sync = syncSrcFor(paraId);
    return sync.src || "";
  }

  function bundledFallbackSrcFor(paraId) {
    const sync = syncSrcFor(paraId);
    return sync.fallback || "";
  }

  async function loadManifest(force) {
    if (force) {
      manifestCache = null;
      manifestV2Cache = null;
    }
    if (!force && manifestCache) return manifestCache;
    if (!force && manifestPromise) return manifestPromise;
    const bust = force ? `?v=${Date.now()}` : "";
    const v2Url = (() => {
      try {
        if (READER_BASE) return new URL("data/shloka-audio/manifest-v2.json", READER_BASE).toString() + bust;
      } catch (_) { /* fall through */ }
      return `data/shloka-audio/manifest-v2.json${bust}`;
    })();
    manifestPromise = Promise.all([
      fetch(`${manifestUrl()}${bust}`, { cache: "no-store" })
        .then(res => (res.ok ? res.json() : null))
        .catch(() => null),
      fetch(v2Url, { cache: "no-store" })
        .then(res => (res.ok ? res.json() : null))
        .catch(() => null),
    ])
      .then(([v1, v2]) => {
        manifestCache = v1 && v1.entries ? v1 : null;
        manifestV2Cache = v2 && v2.entries ? v2 : null;
        try { root.AmpsShlokaAudioPlayer?.setManifestV2?.(manifestV2Cache); } catch (_) { /* ignore */ }
        return manifestCache;
      })
      .finally(() => { manifestPromise = null; });
    return manifestPromise;
  }

  function hasManifest() {
    return !!(manifestCache?.entries && Object.keys(manifestCache.entries).length);
  }

  function lookupEntry(manifest, audioKey) {
    if (!manifest?.entries || !audioKey) return null;
    return manifest.entries[audioKey] || null;
  }

  function lookupBySource(manifest, sourceKey) {
    if (!manifest?.bySource || !sourceKey) return null;
    const paraId = manifest.bySource[sourceKey];
    return paraId ? lookupEntry(manifest, paraId) : null;
  }

  function resolveAudioKey(bookId, chapterId, para, getShlokaEntry) {
    if (bookId === "samskrta-shloka" && para?.id) return para.id;
    const entry = typeof getShlokaEntry === "function"
      ? getShlokaEntry(bookId, chapterId, para)
      : null;
    if (entry?.id) return entry.id;
    if (para?.sourceBookId && para?.sourceChapterId && para?.sourceParaId) {
      return manifestCache?.bySource?.[`${para.sourceBookId}|${para.sourceChapterId}|${para.sourceParaId}`]
        ? manifestCache.bySource[`${para.sourceBookId}|${para.sourceChapterId}|${para.sourceParaId}`]
        : null;
    }
    return null;
  }

  function stop() {
    cancelToken += 1;
    playing = false;
    paused = false;
    stopBed({ fade: false });
    if (activeAudio) {
      try {
        activeAudio.pause();
        activeAudio.src = "";
      } catch (_) { /* ignore */ }
      activeAudio = null;
    }
  }

  function pause() {
    if (!playing || paused) return false;
    paused = true;
    activeAudio?.pause?.();
    pauseBed();
    return true;
  }

  function resume() {
    if (!playing || !paused) return false;
    paused = false;
    const p = activeAudio?.play?.();
    if (p?.catch) p.catch(() => {});
    resumeBed();
    return true;
  }

  async function waitWhilePaused(token) {
    while (paused && playing && token === cancelToken) {
      await delay(120);
    }
  }

  function playBlob(blob, token) {
    return new Promise(resolve => {
      if (token !== cancelToken || !blob?.size) return resolve(false);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = 1;
      activeAudio = audio;
      let settled = false;
      const done = ok => {
        if (settled) return;
        settled = true;
        audio.removeEventListener("ended", onEnd);
        audio.removeEventListener("error", onErr);
        if (activeAudio === audio) activeAudio = null;
        URL.revokeObjectURL(url);
        resolve(ok);
      };
      const onEnd = () => done(true);
      const onErr = () => done(false);
      audio.addEventListener("ended", onEnd);
      audio.addEventListener("error", onErr);
      const p = audio.play();
      if (p?.catch) p.catch(() => done(false));
    });
  }

  async function resolvePlayback(entry, audioKey, opts = {}) {
    const bundledOnly = opts.bundledOnly === true;
    const studioReview = opts.studioReview === true;

    // Schema v2 / dual-recitation resolver when available
    if (audioKey && root.AmpsShlokaAudioPlayer?.resolveRecitation) {
      const resolved = await root.AmpsShlokaAudioPlayer.resolveRecitation(audioKey, {
        allowDraft: studioReview,
        allowMachineDraft: studioReview || opts.allowMachineDraft === true,
        prefer: opts.prefer,
      });
      if (resolved?.blob) {
        return { kind: "blob", blob: resolved.blob, needsRuntimeBed: false, meta: resolved };
      }
      if (resolved?.file) {
        const url = publicAudioSrc(resolved.file);
        if (url) return { kind: "url", url, needsRuntimeBed: false, meta: resolved };
      }
      if (!studioReview && resolved?.kind === "none") {
        // Manifest-v2 is authoritative. Never let a legacy draft or rejected
        // machine file bypass the public approval policy.
        return null;
      }
    }

    if (!bundledOnly && audioKey && window.AmpsShlokaRecorder?.getBlob && !isLiveHumanEntry(entry) && !generatedRelPath(entry)) {
      try {
        const blob = await window.AmpsShlokaRecorder.getBlob(audioKey);
        if (blob?.size) return { kind: "blob", blob, needsRuntimeBed: false };
      } catch (_) { /* ignore */ }
    }
    if (isLiveHumanEntry(entry) && (studioReview || entry.reviewStatus === "approved")) {
      const url = publicAudioSrc(entry.humanFile);
      if (url) return { kind: "url", url, needsRuntimeBed: false };
    }
    // Machine drafts are not public unless explicitly allowed
    const rel = generatedRelPath(entry);
    if (rel && (opts.allowMachineDraft || entry.reviewStatus === "approved_machine_recitation")) {
      const url = publicAudioSrc(rel);
      if (url) return { kind: "url", url, needsRuntimeBed: false };
    }
    // Prefer machine say/xtts paths from disk for studio
    if (studioReview && audioKey) {
      for (const eng of ["say", "xtts"]) {
        const guess = publicAudioSrc(`custom/machine/${eng}/${audioKey}.mp3`);
        if (guess) return { kind: "url", url: guess, needsRuntimeBed: false };
      }
    }
    if (!bundledOnly && audioKey && window.AmpsShlokaRecorder?.getBlob) {
      try {
        const blob = await window.AmpsShlokaRecorder.getBlob(audioKey);
        if (blob?.size) return { kind: "blob", blob, needsRuntimeBed: false };
      } catch (_) { /* ignore */ }
    }
    if (audioKey && isLiveHumanEntry(entry) && (studioReview || entry.reviewStatus === "approved")) {
      const guessed = publicAudioSrc(`custom/mp3/${audioKey}.mp3`);
      if (guessed) return { kind: "url", url: guessed };
    }
    return null;
  }

  async function playEntry(entry, audioKey, token, opts = {}) {
    const leadMs = opts.bedLeadMs ?? DEFAULT_BED_LEAD_MS;
    const tailMs = opts.bedTailMs ?? DEFAULT_BED_TAIL_MS;
    const chapterMode = opts.chapterMode === true;
    const chapterFirst = opts.chapterFirst === true;
    const chapterLast = opts.chapterLast === true;

    const src = await resolvePlayback(entry, audioKey, opts);
    if (!src) return false;

    if (src.kind === "blob") {
      const lead = opts.bedLeadMs != null ? opts.bedLeadMs : DEVICE_LIVE_BED_LEAD_MS;
      if (!chapterMode || chapterFirst) await startBed(lead, { underVoice: true });
      else resumeBed();
      applyBedVolume(getUnderVoiceBedVolume());
      await waitWhilePaused(token);
      if (token !== cancelToken) return false;
      const ok = await playBlob(src.blob, token);
      if (!chapterMode || chapterLast) await releaseBedAfterTail(tailMs, token);
      return ok;
    }

    if (src.kind === "url") {
      return playUrl(src.url, token);
    }
    return false;
  }

  function playUrl(url, token) {
    return new Promise(resolve => {
      if (token !== cancelToken) return resolve(false);
      const audio = new Audio(url);
      audio.volume = 1;
      activeAudio = audio;
      let settled = false;
      const done = ok => {
        if (settled) return;
        settled = true;
        audio.removeEventListener("ended", onEnd);
        audio.removeEventListener("error", onErr);
        if (activeAudio === audio) activeAudio = null;
        resolve(ok);
      };
      const onEnd = () => done(true);
      const onErr = () => done(false);
      audio.addEventListener("ended", onEnd);
      audio.addEventListener("error", onErr);
      const p = audio.play();
      if (p?.catch) {
        p.catch(() => done(false));
      }
    });
  }

  async function speakChapter(options) {
    const {
      bookId,
      chapterId,
      ch,
      speakTexts,
      paragraphChanda,
      paraIds,
      startIdx,
      onHighlight,
      enabled,
      getShlokaEntry,
      fallbackParagraph,
      preferHuman,
    } = options || {};

    if (enabled === false) return false;
    const manifest = await loadManifest();
    if (!manifest?.entries) return false;

    const paragraphs = ch?.paragraphs || [];
    if (!paragraphs.length) return false;

    const start = Math.max(0, Number(startIdx) || 0);
    let hasBundledInRange = false;
    for (let i = start; i < paragraphs.length; i++) {
      if (paragraphChanda?.[i] === false) continue;
      const key = resolveAudioKey(bookId, chapterId, paragraphs[i], getShlokaEntry);
      if (!key) continue;
      const entry = lookupEntry(manifest, key);
      if (await hasHumanAudio(key, entry)) {
        hasBundledInRange = true;
        break;
      }
    }
    if (!hasBundledInRange) return false;

    let usedBundled = false;
    const token = ++cancelToken;
    playing = true;
    paused = false;

    async function hasLaterBundledVerse(fromIdx) {
      for (let j = fromIdx + 1; j < paragraphs.length; j += 1) {
        if (paragraphChanda?.[j] === false) continue;
        const laterKey = resolveAudioKey(bookId, chapterId, paragraphs[j], getShlokaEntry);
        const laterEntry = laterKey ? lookupEntry(manifest, laterKey) : null;
        if (laterKey && await hasHumanAudio(laterKey, laterEntry)) return true;
      }
      return false;
    }

    for (let i = start; i < paragraphs.length; i++) {
      if (token !== cancelToken || !playing) break;
      await waitWhilePaused(token);
      if (token !== cancelToken || !playing) break;

      const para = paragraphs[i];
      const pid = paraIds?.[i] || para.id;
      const readText = speakTexts?.[i] || para.text || "";
      const audioKey = resolveAudioKey(bookId, chapterId, para, getShlokaEntry);
      const entry = audioKey ? lookupEntry(manifest, audioKey) : null;
      const audioAvail = audioKey && await hasHumanAudio(audioKey, entry);
      const useBundled = paragraphChanda?.[i] !== false && audioAvail;

      if (onHighlight) onHighlight(i, pid, readText);

      if (useBundled) {
        usedBundled = true;
        const chapterLast = !(await hasLaterBundledVerse(i));
        let ok = await playEntry(entry, audioKey, token, {
          chapterMode: true,
          chapterFirst: i === start,
          chapterLast,
          bedLeadMs: DEVICE_LIVE_BED_LEAD_MS,
          bedTailMs: DEFAULT_BED_TAIL_MS,
        });
        if (!ok && entry?.file && !isLiveHumanEntry(entry)) {
          ok = await playUrl(audioUrl(entry.file), token);
        }
        if (!ok && typeof fallbackParagraph === "function") {
          const fb = await fallbackParagraph(i, pid, readText);
          if (fb === false) break;
        } else if (!ok) {
          break;
        }
      } else if (typeof fallbackParagraph === "function") {
        const fb = await fallbackParagraph(i, pid, readText);
        if (fb === false) break;
      } else {
        break;
      }

      if (i < paragraphs.length - 1) {
        await delay(options?.paragraphPauseMs ?? 600);
      }
    }

    playing = false;
    paused = false;
    activeAudio = null;
    stopBed();
    if (onHighlight) onHighlight(-1);
    return usedBundled || hasBundledInRange;
  }

  async function playVerse(audioKey, opts = {}) {
    const manifest = await loadManifest();
    const entry = lookupEntry(manifest, audioKey);
    if (!entry && !(await hasHumanAudio(audioKey, null))) return false;
    stop();
    const token = cancelToken;
    playing = true;
    const ok = await playEntry(entry, audioKey, token, {
      bedLeadMs: DEVICE_LIVE_BED_LEAD_MS,
      bedTailMs: DEFAULT_BED_TAIL_MS,
      bundledOnly: opts.bundledOnly === true,
    });
    playing = false;
    if (!bedSessionActive) stopBed();
    return ok;
  }

  async function playBySource(sourceKey) {
    const manifest = await loadManifest();
    const entry = lookupBySource(manifest, sourceKey);
    if (!entry) return false;
    return playVerse(entry.paraId);
  }

  const api = {
    loadManifest,
    hasManifest,
    get _manifestV2() { return manifestV2Cache; },
    set _manifestV2(v) { manifestV2Cache = v; },
    hasBundledHuman,
    hasHumanAudio,
    hasLiveHumanAudio,
    isLiveHumanEntry,
    lookupEntry,
    lookupBySource,
    resolveAudioKey,
    speakChapter,
    playVerse,
    playBySource,
    stop,
    pause,
    resume,
    startBed,
    syncBedForVoice,
    playCardWithBedPadding,
    shlokaAudioNeedsBedPadding,
    startBedUnderVoice,
    setBedVolumeLevel,
    getBedVolumeLevel,
    releaseBedAfterTail,
    stopBed,
    pauseBed,
    resumeBed,
    audioUrl,
    audioRelPath,
    publicAudioSrc,
    syncSrcFor,
    humanSrcFor,
    bundledSrcFor,
    bundledFallbackSrcFor,
    entryRelPath,
    get playing() { return playing; },
    get paused() { return paused; },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AmpsShlokaAudio = api;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);

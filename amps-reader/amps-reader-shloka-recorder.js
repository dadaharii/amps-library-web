/* AMPS Reader — record your own pundit-style shloka readings (IndexedDB + export) */
(function (root) {
  "use strict";

  const IDB_NAME = "amps-shloka-recordings-v1";
  const IDB_STORE = "clips";
  const META_KEY = "__meta__";
  const EXPORT_META_KEY = "__export_meta__";
  let _dbPromise = null;
  let _recorder = null;
  let _stream = null;
  let _chunks = [];
  let _api = null;
  let _audioCtx = null;
  let _analyser = null;
  let _meterRaf = null;
  let _meterStream = null;
  let _recordingStartedAt = 0;
  let _timerInterval = null;
  let _focusEl = null;
  let _captureInfo = { sampleRate: 48000, mime: "audio/webm", bitrate: 256000 };

  // Prefer mp4/AAC on Safari/WebKit — Safari cannot play audio/webm Opus.
  const IS_WEBKIT = /\b(Safari|AppleWebKit)\b/i.test(navigator.userAgent || "")
    && !/\b(Chrome|Chromium|CriOS|Edg|OPR|Firefox)\b/i.test(navigator.userAgent || "");
  const RECORDER_MIME_CANDIDATES = IS_WEBKIT
    ? ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  const RECORDER_BITRATE = 256000;
  // Do NOT use timeslice. Safari/WebKit MP4 fragments concatenated via Blob()
  // only play the first segment — recordings sound "cropped" mid-shloka.
  // One blob on stop keeps the full take on Chrome + Safari.
  const RECORDER_TIMESLICE_MS = 0;
  let _previewAudio = null;
  let _previewCtx = null;
  let _recorderError = null;

  function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  async function idbGet(key) {
    try {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (_) {
      return null;
    }
  }

  async function idbPut(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbDelete(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbKeys() {
    try {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).getAllKeys();
        req.onsuccess = () => {
          const keys = (req.result || []).filter(k => k !== META_KEY && String(k).startsWith("ch-verses-"));
          resolve(keys);
        };
        req.onerror = () => reject(req.error);
      });
    } catch (_) {
      return [];
    }
  }

  async function getRecording(paraId) {
    const row = await idbGet(paraId);
    if (!row?.blob) return null;
    return row;
  }

  async function getBlob(paraId) {
    const row = await getRecording(paraId);
    return row?.blob || null;
  }

  async function hasRecording(paraId) {
    const row = await getRecording(paraId);
    return !!(row?.blob?.size);
  }

  async function countRecordings() {
    const keys = await idbKeys();
    return keys.length;
  }

  async function saveRecording(paraId, blob, meta) {
    if (!paraId || !blob?.size) throw new Error("Missing recording data.");
    const peak = meta?.quality_metrics?.peak;
    const reviewStatus = meta?.review_status
      || (peak != null && peak < 0.004 ? "rejected" : "draft");
    await idbPut(paraId, {
      paraId,
      blob,
      mimeType: blob.type || meta?.mimeType || "audio/webm",
      recordedAt: meta?.recordedAt || new Date().toISOString(),
      roman: meta?.roman || "",
      speaker: meta?.speaker || "",
      capture: meta?.capture || null,
      audio_type: "human_recitation",
      review_status: reviewStatus,
      text_hash: meta?.text_hash || "",
      reciter_name: meta?.reciter_name || meta?.speaker || "",
      recitation_style: meta?.recitation_style || "traditional_shloka",
      language: meta?.language || "sa",
      quality_metrics: meta?.quality_metrics || {},
      line_timestamps: meta?.line_timestamps || [],
      word_timestamps: meta?.word_timestamps || [],
      approved_at: meta?.approved_at || null,
      approved_by: meta?.approved_by || null,
    });
    const keys = await idbKeys();
    await idbPut(META_KEY, { count: keys.length, updatedAt: new Date().toISOString() });
    return true;
  }

  async function setRecordingReviewStatus(paraId, status, opts = {}) {
    const row = await getRecording(paraId);
    if (!row?.blob) throw new Error("No recording to update.");
    const next = {
      ...row,
      review_status: status,
      approved_at: status === "approved" ? new Date().toISOString() : null,
      approved_by: status === "approved" ? (opts.approved_by || "studio") : null,
    };
    await idbPut(paraId, next);
    return next;
  }

  async function deleteRecording(paraId) {
    await idbDelete(paraId);
    const keys = await idbKeys();
    await idbPut(META_KEY, { count: keys.length, updatedAt: new Date().toISOString() });
    return true;
  }

  function loadJsZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "../vendor/jszip.min.js";
      script.onload = () => window.JSZip ? resolve(window.JSZip) : reject(new Error("ZIP library unavailable"));
      script.onerror = () => reject(new Error("Could not load ZIP library"));
      document.head.appendChild(script);
    });
  }

  function verseNum(paraId) {
    const m = String(paraId || "").match(/p(\d+)$/i);
    return m ? Number(m[1]) : 0;
  }

  function inVerseRange(paraId, fromVerse, toVerse) {
    const n = verseNum(paraId);
    if (!n) return false;
    if (fromVerse > 0 && n < fromVerse) return false;
    if (toVerse > 0 && n > toVerse) return false;
    return true;
  }

  function extFromMime(mimeType) {
    const mime = String(mimeType || "").toLowerCase();
    if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
    if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
    if (mime.includes("wav")) return "wav";
    if (mime.includes("ogg")) return "ogg";
    return "webm";
  }

  function parseRecordingFilename(name) {
    const m = String(name || "").trim().match(/^(ch-verses-p\d+)\.(webm|mp3|m4a|wav|ogg)$/i);
    if (!m) return null;
    return { paraId: m[1], ext: m[2].toLowerCase() };
  }

  async function listRecordedParaIds(opts = {}) {
    let keys = (await idbKeys()).sort((a, b) => verseNum(a) - verseNum(b));
    const from = Number(opts.fromVerse) || 0;
    const to = Number(opts.toVerse) || 0;
    if (from > 0 || to > 0) {
      keys = keys.filter(k => inVerseRange(k, from || 1, to || 99999));
    }
    return keys;
  }

  async function saveExportMeta(keys) {
    await idbPut(EXPORT_META_KEY, {
      lastExportedAt: new Date().toISOString(),
      paraIds: keys.slice(),
      count: keys.length,
    });
  }

  async function exportZip(speakerName, opts = {}) {
    const keys = await listRecordedParaIds(opts);
    if (!keys.length) {
      throw new Error(opts.fromVerse || opts.toVerse
        ? "No device recordings in that verse range."
        : "No shloka recordings on this device to export.");
    }
    const JSZip = await loadJsZip();
    const zip = new JSZip();
    const fromV = Number(opts.fromVerse) || 0;
    const toV = Number(opts.toVerse) || 0;
    const manifest = {
      version: 2,
      kind: "live-human-recordings",
      exportedAt: new Date().toISOString(),
      speaker: String(speakerName || "").trim(),
      count: keys.length,
      fromVerse: fromV || null,
      toVerse: toV || null,
      entries: [],
    };
    for (const paraId of keys) {
      const row = await getRecording(paraId);
      if (!row?.blob?.size) continue;
      const ext = extFromMime(row.mimeType);
      const filename = `${paraId}.${ext}`;
      zip.file(filename, row.blob);
      manifest.entries.push({
        paraId,
        filename,
        mimeType: row.mimeType,
        recordedAt: row.recordedAt,
        roman: row.roman || "",
      });
    }
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    zip.file("README.txt", [
      "AMPS Shloka live human recordings",
      "",
      "Files are named: ch-verses-p19.webm, ch-verses-p20.webm, …",
      "Only recordings from this device are included — not generated TTS.",
      "",
      "Import on your Mac:",
      "  cd Amps-Library",
      "  npm run import:shloka-recordings -- path/to/folder-or-zip",
      "  npm run import:shloka-recordings -- path/to/folder --from 19 --to 30 --skip-existing",
      "  npm run build:www && npx cap sync android",
      "",
      "Record only voices you have permission to use.",
    ].join("\n"));
    await saveExportMeta(keys);
    return zip.generateAsync({ type: "blob" });
  }

  function entriesFromZipFiles(zip, manifest) {
    if (manifest?.entries?.length) {
      return manifest.entries.filter(e => e?.paraId && e?.filename);
    }
    return Object.keys(zip.files)
      .map(name => parseRecordingFilename(name.split("/").pop()))
      .filter(Boolean)
      .map(row => ({ paraId: row.paraId, filename: `${row.paraId}.${row.ext}` }));
  }

  async function importEntries(entries, manifest, zip, opts = {}) {
    let imported = 0;
    let skipped = 0;
    const conflicts = [];
    for (const entry of entries) {
      if (!entry?.paraId) continue;
      if (await hasRecording(entry.paraId)) conflicts.push(entry.paraId);
    }
    let overwrite = !!opts.overwrite;
    if (conflicts.length && !overwrite) {
      if (opts.promptOverwrite === false) {
        skipped = conflicts.length;
      } else {
        overwrite = confirm(
          `${conflicts.length} verse(s) already recorded on this device (${conflicts.slice(0, 5).join(", ")}${conflicts.length > 5 ? "…" : ""}). Overwrite?`,
        );
        if (!overwrite) skipped = conflicts.length;
      }
    }
    for (const entry of entries) {
      const filename = entry.filename || `${entry.paraId}.webm`;
      const fileObj = zip ? zip.file(filename) : null;
      let blob = null;
      if (fileObj) {
        blob = await fileObj.async("blob");
      } else if (entry.blob) {
        blob = entry.blob;
      }
      if (!blob?.size) continue;
      if (!overwrite && await hasRecording(entry.paraId)) continue;
      await saveRecording(entry.paraId, blob, {
        mimeType: entry.mimeType || blob.type,
        recordedAt: entry.recordedAt,
        roman: entry.roman,
        speaker: manifest?.speaker,
      });
      imported += 1;
    }
    return { imported, skipped };
  }

  async function importZip(file, opts = {}) {
    const JSZip = await loadJsZip();
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const manifestRaw = await zip.file("manifest.json")?.async("string");
    const manifest = manifestRaw ? JSON.parse(manifestRaw) : null;
    const entries = entriesFromZipFiles(zip, manifest);
    return importEntries(entries, manifest, zip, opts);
  }

  async function importAudioFiles(fileList, opts = {}) {
    const files = Array.from(fileList || []);
    const entries = [];
    for (const file of files) {
      const parsed = parseRecordingFilename(file.name);
      if (!parsed) continue;
      entries.push({
        paraId: parsed.paraId,
        filename: file.name,
        blob: file,
        mimeType: file.type,
        recordedAt: file.lastModified ? new Date(file.lastModified).toISOString() : "",
      });
    }
    entries.sort((a, b) => verseNum(a.paraId) - verseNum(b.paraId));
    if (!entries.length) throw new Error("No ch-verses-p*.webm|mp3|m4a|wav files found.");
    return importEntries(entries, null, null, opts);
  }

  function focusVerseHtml(para, verseNum, helpers) {
    const esc = helpers?.esc || (s => String(s || ""));
    const scriptsHtml = helpers?.renderShlokaScriptsOnly?.(para)
      || `<p class="shloka-line shloka-roman">${esc(String(para?.sanskritRoman || para?.text || "").trim())}</p>`;
    return `<div class="shloka-rec-focus-verse-inner">
      <h2 class="shloka-rec-focus-title">Verse ${verseNum}</h2>
      <div class="shloka-rec-focus-text">${scriptsHtml}</div>
    </div>`;
  }

  function formatRomanForPundit(roman) {
    const fmt = window.AmpsShlokaFormat;
    const raw = String(roman || "").trim();
    if (!raw) return "";
    const { prefix, body } = fmt?.stripSutraPrefix?.(raw) || { prefix: "", body: raw };
    const parts = fmt?.splitRomanParts?.(body) || [];
    if (!parts.length) return raw;
    let html = prefix ? `<p class="shloka-rec-prefix">${prefix}</p>` : "";
    parts.forEach((seg, i) => {
      const mark = seg.end === "," ? " ।" : seg.end === ";" || seg.end === "\n" ? " ॥" : "";
      html += `<span class="shloka-rec-pada">${seg.text}${mark}</span>`;
      if (i < parts.length - 1) html += " ";
    });
    return html;
  }

  function stopMic() {
    stopLevelMeter();
    stopRecordingTimer();
    hideFocusOverlay();
    _recorder = null;
    _chunks = [];
    _stream?.getTracks?.().forEach(t => t.stop());
    _stream = null;
  }

  function pickRecorderMime() {
    return RECORDER_MIME_CANDIDATES.find(m => MediaRecorder.isTypeSupported(m)) || "";
  }

  function buildAudioConstraints(deviceId) {
    const audio = {
      echoCancellation: { ideal: false },
      noiseSuppression: { ideal: false },
      // Keep light AGC on — without it many mics record near-silent takes.
      autoGainControl: { ideal: true },
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 },
    };
    if (deviceId) audio.deviceId = { exact: deviceId };
    return { audio };
  }

  function stopPreviewPlayback() {
    try { _previewAudio?.pause?.(); } catch (_) { /* ignore */ }
    _previewAudio = null;
    if (_previewCtx) {
      try { _previewCtx.close?.(); } catch (_) { /* ignore */ }
      _previewCtx = null;
    }
    // Cancel reference playback too: its bed lingers for a 10s tail, and a
    // faded stop leaves 2.5s of music playing over the start of a dry review.
    try { window.AmpsShlokaAudio?.stop?.(); } catch (_) { /* ignore */ }
    try { window.AmpsShlokaAudio?.stopBed?.({ fade: false }); } catch (_) { /* ignore */ }
  }

  function canPlayBlobNatively(blob) {
    const type = String(blob?.type || "").toLowerCase();
    if (!type) return !IS_WEBKIT;
    if (IS_WEBKIT && /webm|opus|ogg/.test(type)) return false;
    return true;
  }

  function measureBufferPeak(decoded) {
    let peak = 0.0001;
    for (let c = 0; c < decoded.numberOfChannels; c += 1) {
      const data = decoded.getChannelData(c);
      for (let i = 0; i < data.length; i += 1) {
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
      }
    }
    return peak;
  }

  async function playBlobAudibly(blob, onStatus, { withBed = false } = {}) {
    stopPreviewPlayback();
    if (!blob?.size) {
      onStatus?.("No recording.");
      return false;
    }
    const status = typeof onStatus === "function" ? onStatus : () => {};
    // Review playback is dry by default: the bed masks a quiet take completely,
    // which reads as "my voice was not recorded".
    if (withBed) window.AmpsShlokaAudio?.startBedUnderVoice?.(0);
    // Web Audio first: it is the only path that can normalise a quiet take.
    if (await playBlobViaWebAudio(blob, status, null, { silentFailure: true, withBed })) return true;
    return playBlobNatively(blob, status, { withBed });
  }

  async function playBlobNatively(blob, status, { withBed = false } = {}) {
    const finishBed = () => {
      if (withBed) window.AmpsShlokaAudio?.stopBed?.();
    };
    if (!canPlayBlobNatively(blob)) {
      finishBed();
      status(
        IS_WEBKIT && /webm|opus/i.test(String(blob?.type || ""))
          ? "Safari cannot play this WebM recording. Re-record this verse (saves as AAC)."
          : "Playback failed."
      );
      return false;
    }
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    _previewAudio = audio;
    audio.volume = 1;
    audio.muted = false;
    audio.preload = "auto";
    const cleanup = () => {
      URL.revokeObjectURL(url);
      if (_previewAudio === audio) _previewAudio = null;
    };
    audio.onended = () => {
      cleanup();
      finishBed();
      status("Playback finished.");
    };
    audio.onerror = () => {
      cleanup();
      finishBed();
      status(
        IS_WEBKIT && /webm|opus/i.test(String(blob?.type || ""))
          ? "Safari cannot play this WebM recording. Re-record this verse (saves as AAC)."
          : "Playback failed."
      );
    };
    try {
      await audio.play();
      status(withBed ? "Playing your recording (with background)…" : "Playing your recording…");
      return true;
    } catch (err) {
      cleanup();
      finishBed();
      status(err?.message || "Playback failed.");
      return false;
    }
  }

  async function playBlobViaWebAudio(blob, status, priorErr, { silentFailure = false, withBed = false } = {}) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      if (silentFailure) return false;
      status(
        IS_WEBKIT && /webm|opus/i.test(String(blob?.type || ""))
          ? "Safari cannot play this WebM recording. Re-record this verse (saves as AAC)."
          : (priorErr?.message || "Playback failed.")
      );
      return false;
    }
    let ctx = null;
    try {
      ctx = new Ctx();
      _previewCtx = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      const buf = await blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      const gain = ctx.createGain();
      // Normalise every take: low mic input gain leaves peaks near -26 dBFS.
      const peak = measureBufferPeak(decoded);
      gain.gain.value = Math.min(24, Math.max(1, 0.9 / peak));
      source.connect(gain);
      gain.connect(ctx.destination);
      source.onended = () => {
        try { ctx.close?.(); } catch (_) { /* ignore */ }
        if (_previewCtx === ctx) _previewCtx = null;
        if (withBed) {
          try { window.AmpsShlokaAudio?.stopBed?.(); } catch (_) { /* ignore */ }
        }
        status("Playback finished.");
      };
      source.start(0);
      if (peak < 0.004) {
        status("This take is silent — the microphone captured no sound. Check the mic input level, then re-record.");
      } else if (peak < 0.08) {
        status(`Playing (quiet take boosted ${gain.gain.value.toFixed(1)}× — raise your mic input level)…`);
      } else {
        status(withBed ? "Playing your recording (with background)…" : "Playing your recording…");
      }
      return true;
    } catch (err) {
      try { ctx?.close?.(); } catch (_) { /* ignore */ }
      if (_previewCtx === ctx) _previewCtx = null;
      if (silentFailure) return false;
      if (withBed) {
        try { window.AmpsShlokaAudio?.stopBed?.(); } catch (_) { /* ignore */ }
      }
      status(
        IS_WEBKIT && /webm|opus/i.test(String(blob?.type || ""))
          ? "Safari cannot play this WebM recording. Re-record this verse (saves as AAC)."
          : (err?.message || priorErr?.message || "Playback failed.")
      );
      return false;
    }
  }

  async function openMicStream(deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia(buildAudioConstraints(deviceId));
    } catch (err) {
      if (!deviceId) throw err;
      return navigator.mediaDevices.getUserMedia(buildAudioConstraints(""));
    }
  }

  function formatDuration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function updateMeterDom(level, clipping) {
    const pct = Math.min(100, Math.round(level * 100));
    document.querySelectorAll(".shloka-rec-meter-bar").forEach(el => {
      el.style.width = `${pct}%`;
    });
    document.querySelectorAll(".shloka-rec-meter-hot").forEach(el => {
      el.classList.toggle("is-hot", clipping);
      el.textContent = clipping ? "Too loud — move back from mic" : "Level OK";
    });
  }

  function startLevelMeter(stream) {
    stopLevelMeter();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx || !stream) return;
    // Only meter a CLONE — connecting Web Audio to the live track mutes MediaRecorder
    // on Safari/iOS and some Chromium builds (silent saved recordings).
    if (typeof stream.clone !== "function") {
      updateMeterDom(0.35, false);
      return;
    }
    _meterStream = stream.clone();
    _audioCtx = new Ctx();
    const source = _audioCtx.createMediaStreamSource(_meterStream);
    _analyser = _audioCtx.createAnalyser();
    _analyser.fftSize = 2048;
    _analyser.smoothingTimeConstant = 0.62;
    source.connect(_analyser);
    const data = new Uint8Array(_analyser.fftSize);
    const tick = () => {
      if (!_analyser) return;
      _analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = Math.abs(data[i] - 128) / 128;
        if (v > peak) peak = v;
      }
      updateMeterDom(peak, peak > 0.92);
      _meterRaf = requestAnimationFrame(tick);
    };
    const run = () => {
      if (_audioCtx?.state === "suspended") {
        _audioCtx.resume().then(tick).catch(tick);
      } else {
        tick();
      }
    };
    run();
  }

  function stopLevelMeter() {
    if (_meterRaf) cancelAnimationFrame(_meterRaf);
    _meterRaf = null;
    _analyser = null;
    if (_meterStream && _meterStream !== _stream) {
      _meterStream.getTracks?.().forEach(t => t.stop());
    }
    _meterStream = null;
    if (_audioCtx) {
      _audioCtx.close?.().catch(() => {});
      _audioCtx = null;
    }
    updateMeterDom(0, false);
  }

  function startRecordingTimer() {
    stopRecordingTimer();
    _recordingStartedAt = Date.now();
    const tick = () => {
      const elapsed = formatDuration(Date.now() - _recordingStartedAt);
      document.querySelectorAll(".shloka-rec-focus-timer").forEach(el => {
        el.textContent = elapsed;
      });
      document.querySelectorAll(".shloka-rec-inline-timer").forEach(el => {
        el.textContent = elapsed;
      });
    };
    tick();
    _timerInterval = setInterval(tick, 250);
  }

  function stopRecordingTimer() {
    if (_timerInterval) clearInterval(_timerInterval);
    _timerInterval = null;
    _recordingStartedAt = 0;
  }

  function ensureFocusOverlay() {
    if (_focusEl) return _focusEl;
    const el = document.createElement("div");
    el.id = "shlokaRecFocus";
    el.className = "shloka-rec-focus";
    el.hidden = true;
    el.innerHTML = `
      <div class="shloka-rec-focus-inner">
        <p class="shloka-rec-focus-badge">48 kHz · local · mono · high bitrate</p>
        <div class="shloka-rec-focus-count" id="shlokaRecFocusCount" hidden></div>
        <div class="shloka-rec-focus-verse" id="shlokaRecFocusVerse"></div>
        <div class="shloka-rec-meter-wrap is-live">
          <div class="shloka-rec-meter-track"><div class="shloka-rec-meter-bar"></div></div>
          <div class="shloka-rec-meter-meta"><span class="muted">Input level</span><span class="shloka-rec-meter-hot">Level OK</span></div>
        </div>
        <p class="shloka-rec-focus-timer">0:00</p>
        <button type="button" class="btn btn-gold" id="btnShlokaRecFocusStop">Stop recording</button>
      </div>`;
    document.body.appendChild(el);
    el.querySelector("#btnShlokaRecFocusStop")?.addEventListener("click", () => {
      document.getElementById("btnShlokaRecStop")?.click();
    });
    _focusEl = el;
    return el;
  }

  function showFocusOverlay(verseHtml) {
    const el = ensureFocusOverlay();
    const verseBox = el.querySelector("#shlokaRecFocusVerse");
    if (verseBox) verseBox.innerHTML = verseHtml || "";
    el.hidden = false;
  }

  function hideFocusOverlay() {
    if (_focusEl) _focusEl.hidden = true;
    const count = _focusEl?.querySelector("#shlokaRecFocusCount");
    if (count) count.hidden = true;
  }

  async function showCountIn(useCountIn) {
    if (!useCountIn) return;
    const el = ensureFocusOverlay();
    const count = el.querySelector("#shlokaRecFocusCount");
    if (!count) return;
    count.hidden = false;
    for (let n = 3; n >= 1; n -= 1) {
      count.textContent = String(n);
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, 650));
    }
    count.hidden = true;
  }

  async function listMicDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === "audioinput");
  }

  async function refreshMicPicker(selectEl, preferredId) {
    if (!selectEl) return;
    const devices = await listMicDevices();
    const current = preferredId || selectEl.value || "";
    selectEl.innerHTML = `<option value="">Default microphone</option>` +
      devices.map(d => {
        const label = d.label || `Microphone ${d.deviceId.slice(0, 8)}`;
        const sel = d.deviceId === current ? " selected" : "";
        return `<option value="${d.deviceId.replace(/"/g, "&quot;")}"${sel}>${label.replace(/</g, "&lt;")}</option>`;
      }).join("");
  }

  function qualityBadgeHtml(info) {
    const rate = info?.sampleRate ? `${Math.round(info.sampleRate / 1000)} kHz` : "48 kHz";
    const codec = String(info?.mime || "").includes("mp4") ? "AAC" : "Opus";
    return `<span class="shloka-rec-quality-badge">${rate} · local · mono · ${codec} · ${Math.round((info?.bitrate || RECORDER_BITRATE) / 1000)} kbps</span>`;
  }

  function isRecording() {
    return _recorder?.state === "recording";
  }

  async function startRecording(opts = {}) {
    if (isRecording()) return false;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone recording is not supported in this browser.");
    }
    const deviceId = opts.deviceId || "";
    _stream = await openMicStream(deviceId);
    const track = _stream.getAudioTracks?.()[0];
    if (!track || track.readyState === "ended") {
      stopMic();
      throw new Error("Microphone track unavailable. Check permission and try again.");
    }
    // Keep the mic track alive for long shlokas (some browsers idle-suspend tracks).
    try { track.enabled = true; } catch (_) { /* ignore */ }
    track.onended = () => {
      _recorderError = "Microphone track ended early — check mic permission / another app using the mic.";
    };
    _chunks = [];
    _recorderError = null;
    const mime = pickRecorderMime();
    const recorderOpts = mime
      ? { mimeType: mime, audioBitsPerSecond: RECORDER_BITRATE }
      : { audioBitsPerSecond: RECORDER_BITRATE };
    _recorder = mime
      ? new MediaRecorder(_stream, recorderOpts)
      : new MediaRecorder(_stream, { audioBitsPerSecond: RECORDER_BITRATE });
    const settings = track.getSettings?.() || {};
    _captureInfo = {
      sampleRate: settings.sampleRate || 48000,
      mime: _recorder.mimeType || mime || "audio/webm",
      bitrate: RECORDER_BITRATE,
    };
    _recorder.ondataavailable = e => {
      if (e.data?.size) _chunks.push(e.data);
    };
    _recorder.onerror = ev => {
      _recorderError = ev?.error?.message || "MediaRecorder error";
    };
    startLevelMeter(_stream);
    // No timeslice — full take in one blob (avoids Safari MP4 mid-shloka crop).
    if (RECORDER_TIMESLICE_MS > 0) _recorder.start(RECORDER_TIMESLICE_MS);
    else _recorder.start();
    startRecordingTimer();
    return true;
  }

  function blobDurationSeconds(blob) {
    return new Promise(resolve => {
      if (!blob?.size) return resolve(0);
      const url = URL.createObjectURL(blob);
      const audio = new Audio();
      audio.preload = "metadata";
      const done = sec => {
        URL.revokeObjectURL(url);
        resolve(sec);
      };
      audio.onloadedmetadata = () => {
        const d = Number(audio.duration);
        done(Number.isFinite(d) && d > 0 ? d : 0);
      };
      audio.onerror = () => done(0);
      audio.src = url;
    });
  }

  /** Peak sample level 0–1 of a saved take, or null when it cannot be decoded. */
  async function blobPeakLevel(blob) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx || !blob?.size) return null;
    let ctx = null;
    try {
      ctx = new Ctx();
      const decoded = await ctx.decodeAudioData((await blob.arrayBuffer()).slice(0));
      return measureBufferPeak(decoded);
    } catch (_) {
      return null;
    } finally {
      try { ctx?.close?.(); } catch (_) { /* ignore */ }
    }
  }

  async function stopRecording() {
    if (!_recorder) return null;
    if (_recorder.state === "inactive") return null;
    const startedAt = _recordingStartedAt || Date.now();
    return new Promise(resolve => {
      const recorder = _recorder;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        const type = recorder.mimeType || _captureInfo?.mime || "audio/webm";
        const blob = new Blob(_chunks.slice(), { type });
        const elapsedMs = Math.max(0, Date.now() - startedAt);
        stopMic();
        if (!blob?.size) {
          resolve(null);
          return;
        }
        blob._ampsElapsedMs = elapsedMs;
        blob._ampsRecorderError = _recorderError || "";
        resolve(blob);
      };
      recorder.onstop = finish;
      try {
        // stop() fires a final dataavailable, then onstop — do not race requestData().
        if (recorder.state === "recording" || recorder.state === "paused") {
          recorder.stop();
        } else {
          finish();
        }
      } catch (_) {
        stopMic();
        resolve(null);
      }
      // Safety: if onstop never fires (rare WebView bug), still assemble chunks.
      setTimeout(() => {
        if (!settled && _chunks.length) finish();
      }, 2500);
    });
  }

  function parseVerseInput(value) {
    const digits = String(value || "").replace(/[^\d]/g, "");
    return digits ? Number(digits) : NaN;
  }

  function verseInputAttrs(min, max, value) {
    return `type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" class="shloka-rec-num-input" min="${min}" max="${max}" data-min="${min}" data-max="${max}" value="${value ?? ""}"`;
  }

  async function renderStudio() {
    if (!_api) return;
    const { esc, renderShell, loadBook, state, saveState } = _api;
    const scriptSelectHtml = _api.renderShlokaScriptSelect?.() || "";
    const scriptMode = _api.getShlokaScriptMode?.() || state.settings.shlokaScriptMode || "roman";
    const idx = Math.max(0, Number(state.params.shlokaRecIdx) || 0);
    const book = await loadBook("samskrta-shloka");
    const ch = book.chapters?.find(c => c.id === "ch-verses") || book.chapters?.[0];
    const verses = ch?.paragraphs || [];
    const para = verses[idx] || verses[0];
    const paraId = para?.id || "";
    const roman = String(para?.sanskritRoman || "").trim();
    const recorded = paraId ? await hasRecording(paraId) : false;
    const totalRec = await countRecordings();
    const recording = isRecording();
    const speaker = state.settings.shlokaRecorderSpeaker || "";
    const recControlsHtml = `<div class="quick-grid shloka-rec-controls">
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaRecReference">Hear reference</button>
          <button type="button" class="btn ${recording ? "btn-ghost" : "btn-gold"} btn-sm" id="btnShlokaRecRecord">${recording ? "Recording…" : (recorded ? "Re-record" : "Record")}</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaRecStop" ${recording ? "" : "disabled"}>Stop</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaRecPlay" ${recorded ? "" : "disabled"}>Play mine</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaRecApprove" ${recorded ? "" : "disabled"}>Approve human</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaRecReject" ${recorded ? "" : "disabled"}>Reject</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaRecDelete" ${recorded ? "" : "disabled"}>Delete</button>
        </div>
        <div class="shloka-rec-modes" aria-label="Recitation modes">
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaModeNormal">Normal</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaModeSlow">Slow 0.85×</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaModeLearning">Learning 0.75×</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaModeRepeatFull">Repeat full verse</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaModeLine">Line by line</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaModeSelectedLine">Repeat selected line</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaModeWord">Word by word</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaModeRepeatAfter">Repeat after teacher</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaModeContinuous">Continuous repetition</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaModeStop">Stop playback</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaModeCompare">Compare mine</button>
          <label class="muted" style="display:flex;align-items:center;gap:0.35rem">Pause
            <select id="shlokaRecLearnerPause">
              <option value="2">2s</option>
              <option value="4" selected>4s</option>
              <option value="6">6s</option>
            </select>
          </label>
        </div>
        <p class="muted" id="shlokaRecAudioBadge"></p>`;
    const cardHelpers = {
      esc,
      preferHuman: true,
      beforeSourcesHtml: recControlsHtml,
      renderShlokaScriptsOnly: _api.renderShlokaScriptsOnly,
      renderShlokaMeaningOnly: _api.renderShlokaMeaningOnly,
      renderShlokaSources: _api.renderShlokaSources,
    };
    await window.AmpsShlokaAudio?.loadManifest?.();
    const meaningFallback = _api.renderShlokaMeaningOnly?.(para) || "";
    const meaningFallbackBlock = meaningFallback
      ? `<div class="shloka-verse-card-meaning"><h3 class="shloka-verse-meaning-label">Meanings</h3><div class="shloka-verse-meaning-body">${meaningFallback}</div></div>`
      : "";
    const sourcesFallback = _api.renderShlokaSources?.(para) || "";
    const cardHtml = window.AmpsShlokaCard?.renderCard?.(para, idx + 1, cardHelpers)
      || `<div class="shloka-rec-verse">${_api.renderShlokaBody?.(para) || esc(roman)}</div>${recControlsHtml}${meaningFallbackBlock}${sourcesFallback}`;

    let body = `<section class="hero hero-compact"><h1>Shloka Recording Studio</h1>
      <p class="hero-sub">Local high-quality capture — distraction-free recording zone, like a pro podcast studio.</p>
      <p><a class="btn btn-ghost btn-sm" href="shloka-machine-pilot-review.html">Review 20-shloka machine pilot</a>
      <a class="btn btn-ghost btn-sm" href="shloka-hariishananda-xtts-review.html">Compare human vs XTTS experiment</a>
      <a class="btn btn-ghost btn-sm" href="shloka-hariishananda-recording-programme.html">Guided Samskrta recording programme</a></p>
      ${qualityBadgeHtml(_captureInfo)}
      </section>
      <section class="modern-card">
        <h3>Studio setup</h3>
        <div class="shloka-rec-pro-row">
          <label>Microphone
            <select id="shlokaRecMic"><option value="">Default microphone</option></select>
          </label>
          <label class="muted" style="display:flex;align-items:center;gap:0.45rem;padding-bottom:0.35rem">
            <input type="checkbox" id="shlokaRecCountIn" ${state.settings.shlokaRecCountIn !== false ? "checked" : ""} />
            3-2-1 count-in before recording
          </label>
        </div>
        <p class="muted">Records locally at 48 kHz mono (light auto-gain on, noise suppression off). Safari saves AAC; Chrome saves Opus. Use a wired mic when possible.</p>
        <h3>Voice &amp; background mix</h3>
        <p class="muted">Set how loud the background bed is under your voice. Drag, then tap <strong>Play mine</strong> or <strong>Hear reference</strong> to preview.</p>
        <div class="shloka-rec-pro-row" style="flex-wrap:wrap;gap:0.75rem;align-items:center">
          <label style="flex:1;min-width:12rem">Background volume
            <input type="range" id="shlokaBedVolume" min="0" max="100" step="1"
              value="${Math.round((Number(state.settings.shlokaBedVolume) >= 0 ? Number(state.settings.shlokaBedVolume) : 0.32) * 100)}" />
            <span class="muted"><strong id="shlokaBedVolumeLabel">${Math.round((Number(state.settings.shlokaBedVolume) >= 0 ? Number(state.settings.shlokaBedVolume) : 0.32) * 100)}%</strong>
              — Soft ~20% · Balanced ~32% · Strong ~45%</span>
          </label>
        </div>
        <div class="quick-grid" style="margin-top:0.5rem;flex-wrap:wrap">
          <button type="button" class="btn btn-ghost btn-sm" data-bed-preset="0.20">Soft</button>
          <button type="button" class="btn btn-ghost btn-sm" data-bed-preset="0.32">Balanced</button>
          <button type="button" class="btn btn-ghost btn-sm" data-bed-preset="0.45">Strong</button>
        </div>
        <p class="muted" id="shlokaBedBakeHint">Live slider affects <strong>Play mine</strong> bed now. Bundled card audio needs a re-bake with the same level (ask me, or run the import command shown after you pick a preset).</p>
        <h3>Pundit reading tips</h3>
        <ul class="muted" style="margin:0;padding-left:1.2rem;line-height:1.6">
          <li>Choose <strong>Script</strong> — Roman AMPS, Hindi (Devanagari), Bangla, Oriya, Punjabi, Kannada, Telugu, or combinations.</li>
          <li>Read the verse below — one <em>pada</em> at a time; pause at <strong>।</strong> and <strong>॥</strong> (Roman view shows pada marks).</li>
          <li>Keep a steady chanda rhythm; slightly slower than conversation.</li>
          <li>Use a quiet room, wired mic if possible, 15–20 cm from mouth.</li>
          <li>Tap <strong>Hear reference</strong> only as a rough guide — replace it with your recording.</li>
        </ul>
        <label>Your name / speaker label (for export)
          <input type="text" id="shlokaRecSpeaker" value="${esc(speaker)}" placeholder="e.g. Acharya Hari" autocomplete="name" />
        </label>
        <p class="muted">Progress: <strong id="shlokaRecProgress">${totalRec}</strong> / ${verses.length} verses recorded on this device</p>
      </section>
      <section class="modern-card shloka-rec-studio-wrap">
        <div class="shloka-rec-script-row">${scriptSelectHtml}</div>
        <div class="quick-grid" style="align-items:center;margin:0.75rem 0;flex-wrap:wrap">
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaRecPrev" ${idx <= 0 ? "disabled" : ""}>← Previous</button>
          <span class="muted">Verse ${idx + 1} / ${verses.length}</span>
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaRecNext" ${idx >= verses.length - 1 ? "disabled" : ""}>Next →</button>
        </div>
        <div class="shloka-rec-goto-row">
          <label class="muted">Go to verse
            <input id="shlokaRecGotoVerse" ${verseInputAttrs(1, verses.length, idx + 1)} />
          </label>
          <button type="button" class="btn btn-gold btn-sm" id="btnShlokaRecGo">Go</button>
        </div>
        <p class="muted">${esc(paraId)} · script: ${esc(scriptMode)} · verse <strong>${idx + 1}</strong> opens with: <em>${esc((roman.split(/\n/)[0] || "").slice(0, 56))}${roman.length > 56 ? "…" : ""}</em></p>
        ${recorded ? `<p class="muted">Device take saved for this verse — card/reference use <strong>bundled</strong> audio (matched to verse #). Tap <strong>Play mine</strong> to hear your device take.</p>` : ""}
        ${window.AmpsShlokaBookEditor?.renderPanelHtml?.(idx, verses.length, para, scriptMode) || ""}
        <div class="shloka-rec-meter-wrap ${recording ? "is-live" : ""}">
          <div class="shloka-rec-meter-track"><div class="shloka-rec-meter-bar"></div></div>
          <div class="shloka-rec-meter-meta"><span class="muted">Input level · <span class="shloka-rec-inline-timer">${recording ? formatDuration(Date.now() - (_recordingStartedAt || Date.now())) : "0:00"}</span></span><span class="shloka-rec-meter-hot">Level OK</span></div>
        </div>
        <div class="reader-para shloka-verse-card" id="shlokaRecStudioCard">${cardHtml}</div>
        <p class="muted shloka-rec-status" id="shlokaRecStatus"></p>
        <nav class="quick-grid shloka-rec-bottom-nav" aria-label="Verse navigation" style="align-items:center;justify-content:space-between;margin-top:1rem">
          <button type="button" class="btn btn-ghost" id="btnShlokaRecPrevBottom" ${idx <= 0 ? "disabled" : ""}>← Previous</button>
          <span class="muted">Verse ${idx + 1} / ${verses.length}</span>
          <button type="button" class="btn btn-gold" id="btnShlokaRecNextBottom" ${idx >= verses.length - 1 ? "disabled" : ""}>Next →</button>
        </nav>
      </section>
      <section class="modern-card">
        <h3>Export / import</h3>
        <p class="muted">Export only recordings made on this device (not generated TTS). Files are named <code>ch-verses-p19.webm</code>, etc.</p>
        <div class="quick-grid" style="align-items:flex-end;flex-wrap:wrap">
          <label class="muted">From verse
            <input id="shlokaExportFrom" ${verseInputAttrs(1, verses.length, "")} placeholder="1" />
          </label>
          <label class="muted">To verse
            <input id="shlokaExportTo" ${verseInputAttrs(1, verses.length, "")} placeholder="${verses.length}" />
          </label>
          <button type="button" class="btn btn-gold btn-sm" id="btnShlokaRecExportRange" ${totalRec ? "" : "disabled"}>Export verse range</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnShlokaRecExportAll" ${totalRec ? "" : "disabled"}>Export all on device</button>
        </div>
        <p class="muted">On Mac: <code>npm run import:shloka-recordings -- ./folder --from 19 --to 30 --skip-existing</code> then rebuild.</p>
        <div class="quick-grid">
          <label class="btn btn-ghost btn-sm import-label">Import ZIP<input type="file" id="shlokaRecImport" accept=".zip,application/zip" hidden /></label>
          <label class="btn btn-ghost btn-sm import-label">Import audio folder<input type="file" id="shlokaRecImportFolder" accept=".webm,.mp3,.m4a,.wav,.ogg,audio/*" multiple webkitdirectory hidden /></label>
        </div>
        <p class="muted" id="shlokaRecExportStatus"></p>
      </section>`;

    renderShell(body, {
      title: "Shloka Studio",
      tab: "more",
      bind: () => {
        const status = (msg) => {
          const el = document.getElementById("shlokaRecStatus");
          if (!el) return;
          el.textContent = msg || "";
          if (!msg) {
            el.classList.remove("is-alert", "is-warn");
            return;
          }
          el.classList.add("is-alert");
          el.classList.toggle("is-warn", /⚠|silent|empty|failed|denied|cannot/i.test(msg));
          const box = el.getBoundingClientRect();
          if (box.top < 0 || box.bottom > window.innerHeight) {
            el.scrollIntoView({ block: "center", behavior: "smooth" });
          }
        };
        const go = n => {
          if (isRecording()) {
            status("Stop recording before changing verse.");
            return;
          }
          state.params.shlokaRecIdx = Math.max(0, Math.min(verses.length - 1, n));
          saveState?.();
          renderStudio();
        };
        const reloadStudio = (newIdx) => {
          if (Number.isFinite(newIdx)) state.params.shlokaRecIdx = Math.max(0, newIdx);
          saveState?.();
          delete state.bookCache?.["samskrta-shloka"];
          renderStudio();
        };
        window.AmpsShlokaBookEditor?.bindPanel?.({
          book,
          idx,
          verses,
          esc,
          reload: reloadStudio,
          preferHuman: state.settings.shlokaPreferHumanAudio !== false,
          patchCard: (para, verseNum) => {
            const cardEl = document.getElementById("shlokaRecStudioCard");
            if (!cardEl || !para) return false;
            cardEl.innerHTML = window.AmpsShlokaCard?.renderCard?.(para, verseNum, {
              esc,
              preferHuman: state.settings.shlokaPreferHumanAudio !== false,
            }) || "";
            window.AmpsShlokaCard?.scheduleHydrate?.(
              cardEl,
              state.settings.shlokaPreferHumanAudio !== false
            );
            return true;
          },
        });
        const jumpToVerse = () => {
          const input = document.getElementById("shlokaRecGotoVerse");
          const n = parseVerseInput(input?.value);
          const max = verses.length;
          if (!Number.isFinite(n) || n < 1 || n > max) {
            status(`Enter a verse number from 1 to ${max}.`);
            input?.focus?.();
            return;
          }
          go(n - 1);
        };
        document.getElementById("btnShlokaRecPrev")?.addEventListener("click", () => go(idx - 1));
        document.getElementById("btnShlokaRecNext")?.addEventListener("click", () => go(idx + 1));
        document.getElementById("btnShlokaRecPrevBottom")?.addEventListener("click", () => go(idx - 1));
        document.getElementById("btnShlokaRecNextBottom")?.addEventListener("click", () => go(idx + 1));
        document.getElementById("btnShlokaRecGo")?.addEventListener("click", jumpToVerse);
        const gotoInput = document.getElementById("shlokaRecGotoVerse");
        gotoInput?.addEventListener("keydown", e => {
          if (e.key === "Enter") {
            e.preventDefault();
            jumpToVerse();
          }
        });
        gotoInput?.addEventListener("click", e => e.stopPropagation());
        gotoInput?.addEventListener("touchstart", e => e.stopPropagation(), { passive: true });
        document.getElementById("shlokaRecSpeaker")?.addEventListener("change", e => {
          state.settings.shlokaRecorderSpeaker = e.target.value?.trim() || "";
          saveState();
        });
        const micSelect = document.getElementById("shlokaRecMic");
        refreshMicPicker(micSelect, state.settings.shlokaRecMicId || "").catch(() => {});
        micSelect?.addEventListener("change", e => {
          state.settings.shlokaRecMicId = e.target.value || "";
          saveState();
        });
        document.getElementById("shlokaRecCountIn")?.addEventListener("change", e => {
          state.settings.shlokaRecCountIn = !!e.target.checked;
          saveState();
        });
        const applyBedLevel = (level01, { previewHint } = {}) => {
          const v = Math.max(0, Math.min(1, Number(level01) || 0));
          state.settings.shlokaBedVolume = v;
          saveState();
          window.AmpsShlokaAudio?.setBedVolumeLevel?.(v);
          const label = document.getElementById("shlokaBedVolumeLabel");
          if (label) label.textContent = `${Math.round(v * 100)}%`;
          const slider = document.getElementById("shlokaBedVolume");
          if (slider) slider.value = String(Math.round(v * 100));
          const mix = (0.12 + v * 0.5).toFixed(2); // map slider → bake mix weight hint
          const bedVol = (0.04 + v * 0.12).toFixed(3);
          const hint = document.getElementById("shlokaBedBakeHint");
          if (hint) {
            hint.innerHTML = `Live bed <strong>${Math.round(v * 100)}%</strong> (Play mine). To bake into card/APK audio:<br><code>SHLOKA_VOICE_BED_MIX_WEIGHT=${mix} SHLOKA_VOICE_BED_VOLUME=${bedVol} npm run import:shloka-recordings -- /path/to/raw --from 1 --to 30 --force --produced</code>${previewHint ? ` · ${previewHint}` : ""}`;
          }
        };
        // Restore saved level into audio engine
        applyBedLevel(state.settings.shlokaBedVolume != null ? state.settings.shlokaBedVolume : 0.32);
        document.getElementById("shlokaBedVolume")?.addEventListener("input", e => {
          applyBedLevel(Number(e.target.value) / 100);
        });
        document.querySelectorAll("[data-bed-preset]")?.forEach(btn => {
          btn.addEventListener("click", () => applyBedLevel(Number(btn.getAttribute("data-bed-preset"))));
        });
        document.getElementById("btnShlokaRecReference")?.addEventListener("click", async () => {
          status("Playing bundled reference for this verse…");
          const ok = await window.AmpsShlokaAudio?.playVerse?.(paraId, { bundledOnly: true });
          status(ok ? "Reference finished." : "No bundled reference audio for this verse.");
        });
        document.getElementById("btnShlokaRecRecord")?.addEventListener("click", async () => {
          try {
            const verseHtml = focusVerseHtml(para, idx + 1, {
              esc,
              renderShlokaScriptsOnly: _api.renderShlokaScriptsOnly,
            });
            showFocusOverlay(verseHtml);
            if (state.settings.shlokaRecCountIn !== false) {
              await showCountIn(true);
            }
            const deviceId = state.settings.shlokaRecMicId || "";
            await startRecording({ deviceId });
            await refreshMicPicker(micSelect, deviceId);
            document.getElementById("btnShlokaRecStop")?.removeAttribute("disabled");
            document.querySelectorAll(".shloka-rec-meter-wrap").forEach(el => el.classList.add("is-live"));
            const recBtn = document.getElementById("btnShlokaRecRecord");
            if (recBtn) {
              recBtn.textContent = "Recording…";
              recBtn.classList.remove("btn-gold");
              recBtn.classList.add("btn-ghost");
            }
            status("Recording… read the verse — level meter should move when you speak. Tap Stop when finished.");
          } catch (err) {
            stopMic();
            hideFocusOverlay();
            status(err?.message || "Microphone access denied.");
          }
        });
        document.getElementById("btnShlokaRecStop")?.addEventListener("click", async () => {
          hideFocusOverlay();
          const blob = await stopRecording();
          if (!blob) {
            const err = _recorderError
              || "Recording empty — allow microphone access and check the level meter moves when you speak.";
            await renderStudio();
            status(err);
            return;
          }
          const elapsedSec = Math.round((blob._ampsElapsedMs || 0) / 1000);
          const playSec = Math.round(await blobDurationSeconds(blob));
          const peak = await blobPeakLevel(blob);
          const textHash = window.AmpsShlokaRecitation?.textHashForPara?.(para) || "";
          await saveRecording(paraId, blob, {
            roman,
            speaker: state.settings.shlokaRecorderSpeaker,
            reciter_name: state.settings.shlokaRecorderSpeaker,
            scriptMode: _api.getShlokaScriptMode?.() || state.settings.shlokaScriptMode,
            text_hash: textHash,
            review_status: peak != null && peak < 0.004 ? "rejected" : "draft",
            quality_metrics: {
              peak,
              elapsedSec,
              playableSec: playSec,
              peakDbApprox: peak != null ? +(20 * Math.log10(Math.max(peak, 1e-9))).toFixed(1) : null,
            },
            capture: {
              ...(_captureInfo || {}),
              elapsedSec,
              playableSec: playSec,
            },
          });
          const warn = playSec > 0 && elapsedSec > 0 && playSec < elapsedSec - 2
            ? ` ⚠ Playable ${playSec}s is shorter than recorded ${elapsedSec}s — try Chrome if this keeps happening.`
            : "";
          let levelWarn = "";
          if (peak != null && peak < 0.004) {
            levelWarn = " ⚠ This take is silent — blocked from approval. Re-record.";
          } else if (peak != null && peak < 0.08) {
            levelWarn = ` ⚠ Very quiet take (peak ${Math.round(peak * 100)}%) — raise your mic input level for the next one.`;
          }
          const msg = `Saved full take: timer ${elapsedSec || "?"}s · playable ${playSec || "?"}s. Tap Play mine.${warn}${levelWarn}`;
          await renderStudio();
          status(msg);
        });
        document.getElementById("btnShlokaRecPlay")?.addEventListener("click", async () => {
          const blob = await getBlob(paraId);
          if (!blob) return status("No recording.");
          await playBlobAudibly(blob, status);
        });
        document.getElementById("btnShlokaRecApprove")?.addEventListener("click", async () => {
          const row = await getRecording(paraId);
          if (!row?.blob) return status("No recording.");
          const peak = row.quality_metrics?.peak;
          if (peak != null && peak < 0.004) {
            return status("Cannot approve a silent take — re-record first.");
          }
          await setRecordingReviewStatus(paraId, "approved", {
            approved_by: state.settings.shlokaRecorderSpeaker || "studio",
          });
          status("Marked as approved human recitation (device). Export/import to install into the library.");
          renderStudio();
        });
        document.getElementById("btnShlokaRecReject")?.addEventListener("click", async () => {
          const row = await getRecording(paraId);
          if (!row?.blob) return status("No recording.");
          await setRecordingReviewStatus(paraId, "rejected");
          status("Marked as rejected.");
          renderStudio();
        });
        document.getElementById("btnShlokaRecDelete")?.addEventListener("click", async () => {
          if (!confirm("Delete your recording for this verse?")) return;
          await deleteRecording(paraId);
          status("Deleted.");
          renderStudio();
        });

        const resolveModeUrl = async () => {
          await window.AmpsShlokaAudio?.loadManifest?.();
          const resolved = await window.AmpsShlokaAudioPlayer?.resolveRecitation?.(paraId, {
            allowDraft: true,
            allowMachineDraft: true,
          });
          const badgeEl = document.getElementById("shlokaRecAudioBadge");
          if (badgeEl && resolved) {
            badgeEl.innerHTML = (window.AmpsShlokaAudioPlayer?.badgeHtml?.(resolved) || "")
              + ` <span class="muted">${resolved.label || ""}</span>`;
          }
          if (resolved?.blob) return URL.createObjectURL(resolved.blob);
          if (resolved?.file) return window.AmpsShlokaAudio?.publicAudioSrc?.(resolved.file) || "";
          return "";
        };
        resolveModeUrl().catch(() => {});

        const runMode = async (mode, modeOpts = {}) => {
          const url = await resolveModeUrl();
          if (!url) return status("No human or machine audio for this verse yet.");
          const pauseSec = Number(document.getElementById("shlokaRecLearnerPause")?.value) || 4;
          await window.AmpsShlokaRecitation?.playMode?.({
            mode,
            url,
            para,
            learnerPauseSec: pauseSec,
            repeats: modeOpts.repeats ?? 1,
            selectedLineIndex: modeOpts.selectedLineIndex ?? 0,
            onStatus: status,
          });
        };
        document.getElementById("btnShlokaModeNormal")?.addEventListener("click", () => runMode("normal"));
        document.getElementById("btnShlokaModeSlow")?.addEventListener("click", () => runMode("slow"));
        document.getElementById("btnShlokaModeLearning")?.addEventListener("click", () => runMode("learning"));
        document.getElementById("btnShlokaModeRepeatFull")?.addEventListener("click", () => runMode("repeat_full", { repeats: 2 }));
        document.getElementById("btnShlokaModeLine")?.addEventListener("click", () => runMode("line"));
        document.getElementById("btnShlokaModeSelectedLine")?.addEventListener("click", () => {
          const lineCount = Math.max(1, String(para.sanskritRoman || "").split(/\n/).filter(Boolean).length);
          const entered = Number(prompt(`Repeat which line? Enter 1–${lineCount}`, "1"));
          if (!Number.isFinite(entered) || entered < 1 || entered > lineCount) return;
          runMode("selected_line", { repeats: 2, selectedLineIndex: entered - 1 });
        });
        document.getElementById("btnShlokaModeWord")?.addEventListener("click", () => runMode("word"));
        document.getElementById("btnShlokaModeRepeatAfter")?.addEventListener("click", () => runMode("repeat_after"));
        document.getElementById("btnShlokaModeContinuous")?.addEventListener("click", () => runMode("continuous", { repeats: Infinity }));
        document.getElementById("btnShlokaModeStop")?.addEventListener("click", () => {
          window.AmpsShlokaRecitation?.stop?.();
          status("Playback stopped.");
        });
        document.getElementById("btnShlokaModeCompare")?.addEventListener("click", async () => {
          const ref = await resolveModeUrl();
          const blob = await getBlob(paraId);
          if (!ref || !blob) return status("Need reference audio and your recording.");
          const report = await window.AmpsShlokaRecitation?.compareMine?.({
            referenceUrl: ref,
            learnerBlob: blob,
            para,
            onStatus: status,
          });
          if (report) {
            status(`Compare: ref ${report.reference_line_sec}s · yours ${report.learner_duration_sec}s — ${report.note}`);
          }
        });

        window.AmpsShlokaCard?.scheduleHydrate?.(
          document.getElementById("shlokaRecStudioCard"),
          true
        );
        const saveExportBlob = async (blob, suffix) => {
          const filename = `amps-shloka-recordings-${suffix}-${new Date().toISOString().slice(0, 10)}.zip`;
          const nativeSaver = window.Capacitor?.Plugins?.AmpsFiles;
          if (nativeSaver?.saveFile) {
            const reader = new FileReader();
            reader.onload = async () => {
              const result = await nativeSaver.saveFile({
                data: String(reader.result || ""),
                filename,
                mimeType: "application/zip",
                relativePath: "Download/AMPS Library",
              });
              exportStatus.textContent = `Saved to ${result?.location || "Downloads/AMPS Library"}.`;
            };
            reader.readAsDataURL(blob);
          } else {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            a.remove();
            exportStatus.textContent = "ZIP downloaded.";
          }
        };
        const runExport = async (opts) => {
          const exportStatus = document.getElementById("shlokaRecExportStatus");
          try {
            exportStatus.textContent = "Preparing ZIP…";
            const blob = await exportZip(state.settings.shlokaRecorderSpeaker, opts);
            const suffix = opts.fromVerse || opts.toVerse
              ? `p${opts.fromVerse || 1}-p${opts.toVerse || verses.length}`
              : "all";
            await saveExportBlob(blob, suffix);
          } catch (err) {
            exportStatus.textContent = err?.message || "Export failed.";
          }
        };
        document.getElementById("btnShlokaRecExportAll")?.addEventListener("click", () => runExport({}));
        document.getElementById("btnShlokaRecExportRange")?.addEventListener("click", () => {
          const fromVerse = parseVerseInput(document.getElementById("shlokaExportFrom")?.value) || 0;
          const toVerse = parseVerseInput(document.getElementById("shlokaExportTo")?.value) || 0;
          runExport({ fromVerse, toVerse });
        });
        document.getElementById("shlokaRecImport")?.addEventListener("change", async e => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const exportStatus = document.getElementById("shlokaRecExportStatus");
          try {
            const { imported, skipped } = await importZip(file);
            exportStatus.textContent = `Imported ${imported} recording(s)${skipped ? `, skipped ${skipped}` : ""}.`;
            renderStudio();
          } catch (err) {
            exportStatus.textContent = err?.message || "Import failed.";
          }
        });
        document.getElementById("shlokaRecImportFolder")?.addEventListener("change", async e => {
          const files = e.target.files;
          e.target.value = "";
          if (!files?.length) return;
          const exportStatus = document.getElementById("shlokaRecExportStatus");
          try {
            const { imported, skipped } = await importAudioFiles(files);
            exportStatus.textContent = `Imported ${imported} recording(s)${skipped ? `, skipped ${skipped}` : ""}.`;
            renderStudio();
          } catch (err) {
            exportStatus.textContent = err?.message || "Import failed.";
          }
        });
      },
    });
  }

  function install(app) {
    _api = app;
  }

  const api = {
    install,
    renderStudio,
    getBlob,
    getRecording,
    hasRecording,
    countRecordings,
    saveRecording,
    setRecordingReviewStatus,
    deleteRecording,
    exportZip,
    importZip,
    importAudioFiles,
    listRecordedParaIds,
    isRecording,
    startRecording,
    stopRecording,
    playBlobAudibly,
    stopPreviewPlayback,
    getCaptureInfo: () => ({ ..._captureInfo }),
    qualityBadgeHtml,
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AmpsShlokaRecorder = api;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);

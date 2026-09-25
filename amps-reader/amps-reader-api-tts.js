/* AMPS Reader — API TTS with IndexedDB paragraph cache + device fallback */
(function () {
  "use strict";

  const IDB_NAME = "amps-api-tts-v61";
  const IDB_STORE = "audio";
  const PRON_REV_STORAGE = "amps-pronunciation-rev-v1";
  const DICT_REV_STORAGE = "amps-pronunciation-dict-rev-v1";
  let _dbPromise = null;
  let _activeAudio = null;
  let _activeUrl = null;

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

  async function idbPut(key, blob) {
    try {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(blob, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (_) {
      return false;
    }
  }

  function cacheKey(text, voice, rate, style, provider) {
    let pronRev = "";
    let dictRev = "";
    try {
      pronRev = localStorage.getItem(PRON_REV_STORAGE) || "";
      dictRev = localStorage.getItem(DICT_REV_STORAGE) || "";
    } catch (_) { /* ignore */ }
    return [provider || "api", String(text || "").trim(), voice || "nova", rate || 1, style || "normal", pronRev, dictRev].join("|");
  }

  function normalizeBaseUrl(url) {
    let s = String(url || "").trim();
    if (s && !/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "http://" + s;
    return s.replace(/\/+$/, "");
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function stopPlayback() {
    if (_activeAudio) {
      try {
        _activeAudio.pause();
        _activeAudio.src = "";
      } catch (_) { /* */ }
      _activeAudio = null;
    }
    if (_activeUrl) {
      try { URL.revokeObjectURL(_activeUrl); } catch (_) { /* */ }
      _activeUrl = null;
    }
  }

  async function fetchFromApi(baseUrl, apiKey, text, opts) {
    const url = normalizeBaseUrl(baseUrl) + "/api/tts/synthesize";
    const nativeNet = window.Capacitor?.Plugins?.AmpsNet;
    if (nativeNet?.postAudio) {
      const res = await nativeNet.postAudio({
        url,
        apiKey: apiKey || "",
        payload: {
          text: String(text || "").trim(),
          voice: opts?.voice || "nova",
          rate: opts?.rate || 1,
          style: opts?.style || "normal",
          provider: opts?.provider || "api",
        },
      });
      if (!res?.ok) throw new Error(`TTS API ${res?.status || ""}: ${String(res?.error || "").slice(0, 120)}`);
      const bin = atob(String(res.data || ""));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: res.mimeType || "audio/mpeg" });
    }
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["X-Api-Key"] = apiKey;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        text: String(text || "").trim(),
        voice: opts?.voice || "nova",
        rate: opts?.rate || 1,
        style: opts?.style || "normal",
        provider: opts?.provider || "api",
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`TTS API ${res.status}: ${err.slice(0, 120)}`);
    }
    return res.blob();
  }

  async function getStatus(baseUrl, apiKey) {
    const root = normalizeBaseUrl(baseUrl);
    if (!root) return { ok: false, error: "TTS URL is empty" };
    const headers = {};
    if (apiKey) headers["X-Api-Key"] = apiKey;
    try {
      const nativeNet = window.Capacitor?.Plugins?.AmpsNet;
      if (nativeNet?.getJson) {
        const res = await nativeNet.getJson({ url: root + "/api/tts/status", apiKey: apiKey || "" });
        const data = res?.json || {};
        return {
          ok: !!res?.ok && data?.ok !== false,
          status: res?.status,
          ...data,
        };
      }
      const res = await fetch(root + "/api/tts/status", { headers });
      const data = await res.json().catch(() => ({}));
      return {
        ok: res.ok && data?.ok !== false,
        status: res.status,
        ...data,
      };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  async function getAudioBlob(baseUrl, apiKey, text, opts) {
    const trimmed = String(text || "").trim();
    if (!trimmed || !normalizeBaseUrl(baseUrl)) return null;
    const key = cacheKey(trimmed, opts?.voice, opts?.rate, opts?.style, opts?.provider);
    if (!opts?.noCache) {
      const cached = await idbGet(key);
      if (cached instanceof Blob && cached.size) return cached;
    }
    const blob = await fetchFromApi(baseUrl, apiKey, trimmed, opts);
    if (blob?.size && !opts?.noCache) await idbPut(key, blob);
    return blob;
  }

  function tokenizeWords(text) {
    const plain = String(text || "").replace(/\s+/g, " ").trim();
    const tokens = [];
    const re = /\S+|\s+/g;
    let m;
    while ((m = re.exec(plain)) !== null) {
      tokens.push({ text: m[0], start: m.index, isWord: !/^\s+$/.test(m[0]) });
    }
    return tokens.filter(t => t.isWord);
  }

  function startWordTiming(text, rate, onWord, isCancelled, durationSeconds) {
    const words = tokenizeWords(text);
    if (!words.length || !onWord) return () => {};
    const durationMs = Number.isFinite(durationSeconds) && durationSeconds > 0
      ? durationSeconds * 1000
      : words.length * Math.max(115, 60000 / (180 * (Number(rate) || 1)));
    const weights = words.map(w => Math.max(0.85, Math.min(3.5, Math.sqrt(String(w.text || "").length))));
    const total = weights.reduce((sum, n) => sum + n, 0) || words.length;
    const targets = [];
    let acc = 0;
    words.forEach((word, index) => {
      targets.push({ at: Math.max(0, durationMs * (acc / total) - 35), start: word.start, index });
      acc += weights[index];
    });
    let fi = 0;
    onWord(words[0].start);
    fi = 1;
    const startedAt = performance.now();
    const timer = setInterval(() => {
      if (isCancelled?.() || fi >= targets.length) {
        clearInterval(timer);
        return;
      }
      const elapsed = performance.now() - startedAt;
      while (fi < targets.length && elapsed >= targets[fi].at) {
        onWord(targets[fi].start);
        fi += 1;
      }
    }, 45);
    return () => clearInterval(timer);
  }

  function playBlob(blob, rate, hooks) {
    stopPlayback();
    return new Promise(resolve => {
      if (!blob?.size) {
        resolve(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      _activeUrl = url;
      const audio = new Audio(url);
      _activeAudio = audio;
      audio.playbackRate = Math.min(2, Math.max(0.5, Number(rate) || 1));
      let stopWords = null;
      audio.onended = () => {
        stopWords?.();
        stopPlayback();
        hooks?.onend?.();
        resolve(true);
      };
      audio.onerror = () => {
        stopWords?.();
        stopPlayback();
        hooks?.onerror?.();
        resolve(false);
      };
      audio.play().then(() => {
        hooks?.onstart?.();
        if (hooks?.onWord && hooks?.spokenText) {
          stopWords = startWordTiming(hooks.spokenText, rate, hooks.onWord, hooks.isCancelled, audio.duration);
        }
      }).catch(() => {
        stopPlayback();
        resolve(false);
      });
    });
  }

  async function speak(text, config, hooks) {
    const baseUrl = normalizeBaseUrl(config?.apiUrl);
    if (!baseUrl) return false;
    try {
      const blob = await getAudioBlob(baseUrl, config?.apiKey, text, {
        voice: config?.voice,
        rate: config?.rate,
        style: config?.style,
        provider: config?.provider,
        noCache: config?.noCache,
      });
      if (!blob) return false;
      if (hooks?.isCancelled?.()) return false;
      return playBlob(blob, config?.rate, {
        ...hooks,
        spokenText: String(text || "").trim(),
      });
    } catch (err) {
      console.warn("API TTS failed, will fall back:", err.message || err);
      return false;
    }
  }

  async function speakSegments(segments, config, hooks) {
    const list = Array.isArray(segments) ? segments : [];
    const baseUrl = normalizeBaseUrl(config?.apiUrl);
    if (!baseUrl || !list.length) return false;
    const segConfigFor = seg => ({
      ...config,
      rate: (Number(config?.rate) || 1) * (Number(seg?.rateMultiplier) || 1),
    });
    const blobFor = seg => getAudioBlob(baseUrl, config?.apiKey, seg.text, {
      voice: config?.voice,
      rate: segConfigFor(seg).rate,
      style: config?.style,
      provider: config?.provider,
      noCache: config?.noCache,
    });
    let nextBlobPromise = blobFor(list[0]).catch(err => ({ __error: err }));
    for (let i = 0; i < list.length; i++) {
      const seg = list[i];
      if (hooks?.isCancelled?.()) return false;
      if (seg.pauseBefore) await delay(seg.pauseBefore);
      if (hooks?.isCancelled?.()) return false;
      const segConfig = segConfigFor(seg);
      const blob = await nextBlobPromise;
      if (blob?.__error || !blob?.size) return false;
      nextBlobPromise = list[i + 1]
        ? blobFor(list[i + 1]).catch(err => ({ __error: err }))
        : null;
      if (hooks?.isCancelled?.()) return false;
      const ok = await playBlob(blob, segConfig.rate, {
        isCancelled: hooks?.isCancelled,
        onstart: () => hooks?.onSegmentStart?.(seg),
        onWord: hooks?.onWord ? start => hooks.onWord(start, seg) : null,
        spokenText: String(seg.text || "").trim(),
      });
      if (!ok) return false;
      if (seg.pauseAfter && hooks?.isCancelled?.()) return false;
      if (seg.pauseAfter) await delay(seg.pauseAfter);
    }
    hooks?.onend?.();
    return true;
  }

  let lameLoadPromise = null;

  function lameScriptUrl() {
    try {
      const scriptUrl = document.currentScript?.src || "amps-reader-api-tts.js";
      return new URL("../vendor/lame.min.js", new URL(scriptUrl, location.href)).toString();
    } catch (_) {
      return "../vendor/lame.min.js";
    }
  }

  function ensureLamejs() {
    if (window.lamejs?.Mp3Encoder) return Promise.resolve(window.lamejs);
    if (lameLoadPromise) return lameLoadPromise;
    lameLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = lameScriptUrl();
      script.async = true;
      script.onload = () => {
        if (window.lamejs?.Mp3Encoder) resolve(window.lamejs);
        else reject(new Error("MP3 encoder failed to load."));
      };
      script.onerror = () => reject(new Error("Could not load MP3 encoder."));
      document.head.appendChild(script);
    });
    return lameLoadPromise;
  }

  function floatTo16BitPcm(channel, start, count) {
    const len = Math.max(0, Math.min(count, channel.length - start));
    const out = new Int16Array(len);
    for (let i = 0; i < len; i++) {
      const sample = Math.max(-1, Math.min(1, channel[start + i] || 0));
      out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return out;
  }

  async function audioBufferToMp3(buffer, kbps) {
    const lame = await ensureLamejs();
    const channels = buffer.numberOfChannels || 1;
    const sampleRate = buffer.sampleRate || 44100;
    const bitRate = Math.max(32, Math.min(192, Number(kbps) || 64));
    const encoder = new lame.Mp3Encoder(channels, sampleRate, bitRate);
    const blockSize = 1152;
    const left = buffer.getChannelData(0);
    const right = channels > 1 ? buffer.getChannelData(1) : left;
    const mp3Chunks = [];
    for (let i = 0; i < left.length; i += blockSize) {
      const leftChunk = floatTo16BitPcm(left, i, blockSize);
      const mp3buf = channels === 1
        ? encoder.encodeBuffer(leftChunk)
        : encoder.encodeBuffer(leftChunk, floatTo16BitPcm(right, i, blockSize));
      if (mp3buf?.length) mp3Chunks.push(mp3buf);
    }
    const end = encoder.flush();
    if (end?.length) mp3Chunks.push(end);
    return new Blob(mp3Chunks, { type: "audio/mpeg" });
  }

  function audioBufferToWav(buffer) {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const samples = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = channels * bytesPerSample;
    const dataSize = samples * blockAlign;
    const out = new ArrayBuffer(44 + dataSize);
    const view = new DataView(out);
    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeStr(36, "data");
    view.setUint32(40, dataSize, true);
    let offset = 44;
    const channelData = [];
    for (let c = 0; c < channels; c++) channelData.push(buffer.getChannelData(c));
    for (let i = 0; i < samples; i++) {
      for (let c = 0; c < channels; c++) {
        const sample = Math.max(-1, Math.min(1, channelData[c][i] || 0));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([out], { type: "audio/wav" });
  }

  async function decodeAudioBlob(blob) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error("Audio decoding is not supported in this browser.");
    const ctx = new Ctx();
    try {
      const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
      return buf;
    } finally {
      ctx.close?.();
    }
  }

  async function mergeChapterAudioItems(items, options) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) throw new Error("No audio segments to merge.");
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) throw new Error("Audio merge is not supported in this browser.");

    const pieces = [];
    let channels = 1;
    let sampleRate = 44100;
    for (const item of list) {
      if (item?.silenceMs) {
        pieces.push({ kind: "silence", ms: Math.max(0, Number(item.silenceMs) || 0) });
        continue;
      }
      if (!item?.blob?.size) throw new Error("Missing audio segment.");
      const buf = await decodeAudioBlob(item.blob);
      channels = Math.max(channels, buf.numberOfChannels || 1);
      sampleRate = buf.sampleRate || sampleRate;
      pieces.push({
        kind: "audio",
        buf,
        rate: Math.min(2, Math.max(0.5, Number(item.rate) || 1)),
        pauseBefore: Math.max(0, Number(item.pauseBefore) || 0),
        pauseAfter: Math.max(0, Number(item.pauseAfter) || 0),
      });
    }

    let totalSec = 0;
    pieces.forEach(p => {
      if (p.kind === "silence") totalSec += p.ms / 1000;
      else {
        totalSec += (p.pauseBefore + p.pauseAfter) / 1000;
        totalSec += p.buf.duration / p.rate;
      }
    });
    const offline = new OfflineCtx(channels, Math.max(1, Math.ceil(totalSec * sampleRate) + sampleRate), sampleRate);
    let t = 0;
    pieces.forEach(p => {
      if (p.kind === "silence") {
        t += p.ms / 1000;
        return;
      }
      t += p.pauseBefore / 1000;
      const src = offline.createBufferSource();
      src.buffer = p.buf;
      src.playbackRate.value = p.rate;
      src.connect(offline.destination);
      src.start(t);
      t += p.buf.duration / p.rate;
      t += p.pauseAfter / 1000;
    });
    const rendered = await offline.startRendering();
    const format = String(options?.format || "mp3").toLowerCase();
    if (format === "wav") return audioBufferToWav(rendered);
    return audioBufferToMp3(rendered, options?.mp3Kbps || 64);
  }

  async function buildChapterAudioBlob(config, parts, hooks) {
    const baseUrl = normalizeBaseUrl(config?.apiUrl);
    if (!baseUrl || !Array.isArray(parts) || !parts.length) return null;
    const items = [];
    const total = parts.length;
    for (let i = 0; i < parts.length; i++) {
      if (hooks?.isCancelled?.()) return null;
      const part = parts[i];
      if (part?.silenceMs) {
        items.push({ silenceMs: part.silenceMs });
        hooks?.onProgress?.(i + 1, total, "pause");
        continue;
      }
      const text = String(part?.text || "").trim();
      if (!text) continue;
      const rate = Number(part?.rate) || Number(config?.rate) || 1;
      const blob = await getAudioBlob(baseUrl, config?.apiKey, text, {
        voice: config?.voice,
        rate,
        style: config?.style,
        provider: config?.provider,
        noCache: config?.noCache,
      });
      if (!blob?.size) throw new Error(`Could not synthesize segment ${i + 1}.`);
      items.push({
        blob,
        rate,
        pauseBefore: part.pauseBefore || 0,
        pauseAfter: part.pauseAfter || 0,
      });
      hooks?.onProgress?.(i + 1, total, "segment");
    }
    if (hooks?.isCancelled?.()) return null;
    hooks?.onMerge?.();
    return mergeChapterAudioItems(items, {
      format: config?.format || hooks?.format || "mp3",
      mp3Kbps: config?.mp3Kbps || hooks?.mp3Kbps || 64,
    });
  }

  async function prefetchNext(baseUrl, apiKey, texts, opts, count) {
    const list = (texts || []).slice(0, count || 3);
    const cfg = {
      voice: opts?.voice || "nova",
      rate: opts?.rate || 1,
      style: opts?.style || "normal",
      provider: opts?.provider || "api",
    };
    for (const text of list) {
      try {
        await getAudioBlob(baseUrl, apiKey, text, cfg);
      } catch (_) { /* ignore prefetch errors */ }
    }
  }

  window.AmpsApiTts = {
    isConfigured(apiUrl) {
      return !!normalizeBaseUrl(apiUrl);
    },
    stop: stopPlayback,
    getAudioBlob,
    getStatus,
    speak,
    speakSegments,
    prefetchNext,
    mergeChapterAudioItems,
    buildChapterAudioBlob,
  };
})();

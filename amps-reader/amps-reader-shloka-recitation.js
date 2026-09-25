/**
 * Recitation learning modes for one approved/full audio file + timestamps.
 * Modes: normal, slow, line-by-line, word-by-word, repeat-after-teacher, continuous, meaning-after.
 */
(function (root) {
  "use strict";

  let _cancel = 0;
  let _audio = null;

  function textHashForPara(para) {
    const roman = String(para?.sanskritRoman || "").trim();
    const dev = String(para?.devanagari || "").trim();
    const raw = `${para?.id || ""}\n${roman}\n${dev}`;
    // Lightweight browser hash (not crypto) for identity display
    let h = 0;
    for (let i = 0; i < raw.length; i += 1) h = ((h << 5) - h) + raw.charCodeAt(i) | 0;
    return `local:${(h >>> 0).toString(16)}`;
  }

  function stop() {
    _cancel += 1;
    try { _audio?.pause?.(); } catch (_) { /* ignore */ }
    _audio = null;
    try { root.AmpsShlokaAudio?.stop?.(); } catch (_) { /* ignore */ }
  }

  function delay(ms, token) {
    return new Promise(resolve => {
      const t = setTimeout(() => {
        if (token !== _cancel) return resolve(false);
        resolve(true);
      }, ms);
      if (token !== _cancel) {
        clearTimeout(t);
        resolve(false);
      }
    });
  }

  async function playUrl(url, { rate = 1, start = 0, end = null } = {}, token) {
    if (token !== _cancel) return false;
    stopPreviewOnly();
    const audio = new Audio(url);
    _audio = audio;
    audio.playbackRate = Math.max(0.5, Math.min(1.5, rate));
    audio.currentTime = start;
    await audio.play().catch(() => {});
    return new Promise(resolve => {
      const tick = () => {
        if (token !== _cancel) {
          try { audio.pause(); } catch (_) { /* ignore */ }
          return resolve(false);
        }
        if (end != null && audio.currentTime >= end) {
          try { audio.pause(); } catch (_) { /* ignore */ }
          return resolve(true);
        }
        if (audio.ended || audio.paused) return resolve(true);
        requestAnimationFrame(tick);
      };
      audio.onended = () => resolve(token === _cancel);
      audio.onerror = () => resolve(false);
      requestAnimationFrame(tick);
    });
  }

  function stopPreviewOnly() {
    try { _audio?.pause?.(); } catch (_) { /* ignore */ }
    _audio = null;
  }

  function estimateLineCues(para, durationSec) {
    const lines = String(para?.sanskritRoman || "")
      .split(/\n+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (!lines.length) return [{ line_id: "line-1", start: 0, end: durationSec || 1, text: "" }];
    const dur = Math.max(1, Number(durationSec) || lines.length * 3);
    const step = dur / lines.length;
    return lines.map((text, i) => ({
      line_id: `line-${i + 1}`,
      text,
      start: +(i * step).toFixed(3),
      end: +((i + 1) * step).toFixed(3),
    }));
  }

  function estimateWordCues(lines) {
    const words = [];
    (lines || []).forEach(line => {
      const tokens = String(line.text || "").split(/\s+/).filter(Boolean);
      if (!tokens.length) return;
      const span = Math.max(0.05, line.end - line.start);
      const step = span / tokens.length;
      tokens.forEach((word, i) => {
        words.push({
          word,
          line_id: line.line_id,
          start: +(line.start + i * step).toFixed(3),
          end: +(line.start + (i + 1) * step).toFixed(3),
        });
      });
    });
    return words;
  }

  /**
   * @param {object} opts
   * @param {'normal'|'slow'|'learning'|'repeat_full'|'line'|'selected_line'|'word'|'repeat_after'|'continuous'|'meaning_after'} opts.mode
   * @param {string} opts.url
   * @param {object} opts.para
   * @param {number} [opts.learnerPauseSec=4]
   * @param {number|Infinity} [opts.repeats=1]
   * @param {function} [opts.onLine]
   * @param {function} [opts.onStatus]
   * @param {function} [opts.onMeaning]
   */
  async function playMode(opts = {}) {
    stop();
    const token = _cancel;
    const mode = opts.mode || "normal";
    const url = opts.url;
    const para = opts.para;
    const onStatus = typeof opts.onStatus === "function" ? opts.onStatus : () => {};
    const onLine = typeof opts.onLine === "function" ? opts.onLine : () => {};
    if (!url) {
      onStatus("No audio available.");
      return false;
    }

    const rate = mode === "slow" ? 0.85 : (mode === "learning" ? 0.75 : 1);
    const learnerPauseSec = Number(opts.learnerPauseSec);
    const pauseMs = Number.isFinite(learnerPauseSec) ? learnerPauseSec * 1000 : 4000;
    let repeats = opts.repeats == null ? 1 : opts.repeats;
    if (repeats === "continuous" || repeats === Infinity) repeats = Infinity;
    repeats = Number(repeats) || 1;

    const probe = new Audio(url);
    await new Promise(resolve => {
      probe.onloadedmetadata = () => resolve();
      probe.onerror = () => resolve();
      probe.src = url;
    });
    const duration = Number(probe.duration) || 0;
    const lines = opts.line_timestamps?.length
      ? opts.line_timestamps
      : estimateLineCues(para, duration);
    const words = opts.word_timestamps?.length
      ? opts.word_timestamps
      : estimateWordCues(lines);

    let round = 0;
    while (token === _cancel && (repeats === Infinity || round < repeats)) {
      round += 1;
      onStatus(repeats === Infinity
        ? `Continuous · pass ${round}`
        : `Pass ${round}/${repeats}`);

      if (mode === "normal" || mode === "slow" || mode === "learning"
        || mode === "repeat_full" || mode === "continuous" || mode === "meaning_after") {
        const ok = await playUrl(url, { rate }, token);
        if (!ok || token !== _cancel) return false;
        if (mode === "meaning_after") opts.onMeaning?.(para);
      } else if (mode === "line" || mode === "selected_line" || mode === "repeat_after") {
        const selectedIndex = Math.max(0, Math.min(
          lines.length - 1,
          Number(opts.selectedLineIndex) || 0,
        ));
        const linesToPlay = mode === "selected_line" ? [lines[selectedIndex]].filter(Boolean) : lines;
        for (const line of linesToPlay) {
          if (token !== _cancel) return false;
          onLine(line);
          onStatus(`Line ${line.line_id}`);
          await playUrl(url, { rate, start: line.start, end: line.end }, token);
          if (mode === "repeat_after") {
            onStatus(`Your turn (${Math.round(pauseMs / 1000)}s)…`);
            const cont = await delay(pauseMs, token);
            if (!cont) return false;
          } else {
            await delay(500, token);
          }
        }
      } else if (mode === "word") {
        for (const w of words) {
          if (token !== _cancel) return false;
          onStatus(w.word);
          await playUrl(url, { rate, start: w.start, end: w.end }, token);
          await delay(220, token);
        }
      } else {
        await playUrl(url, { rate }, token);
      }

      if (repeats !== Infinity && round >= repeats) break;
      if (repeats === Infinity) {
        const cont = await delay(800, token);
        if (!cont) return false;
      }
    }
    onStatus("Finished.");
    return true;
  }

  /**
   * Compare mine: reference line → learner blob → reference again.
   * Reports duration/silence/volume/timing only — no pronunciation score.
   */
  async function compareMine(opts = {}) {
    const { referenceUrl, learnerBlob, para, onStatus } = opts;
    const status = typeof onStatus === "function" ? onStatus : () => {};
    if (!referenceUrl || !learnerBlob) {
      status("Need both reference and your recording.");
      return null;
    }
    const lines = estimateLineCues(para, 12);
    const line = lines[0];
    status("Reference…");
    await playUrl(referenceUrl, { start: line.start, end: line.end }, _cancel);
    status("Your take…");
    const url = URL.createObjectURL(learnerBlob);
    try {
      const a = new Audio(url);
      await new Promise(resolve => {
        a.onloadedmetadata = resolve;
        a.onerror = resolve;
      });
      const learnerDur = Number(a.duration) || 0;
      await root.AmpsShlokaRecorder?.playBlobAudibly?.(learnerBlob, status);
      status("Reference again…");
      await playUrl(referenceUrl, { start: line.start, end: line.end }, _cancel);
      return {
        reference_line_sec: +(line.end - line.start).toFixed(2),
        learner_duration_sec: +learnerDur.toFixed(2),
        note: "Timing/volume comparison only — pronunciation requires human review.",
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const api = {
    textHashForPara,
    stop,
    playMode,
    compareMine,
    estimateLineCues,
    estimateWordCues,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AmpsShlokaRecitation = api;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);

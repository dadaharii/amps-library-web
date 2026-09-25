/* AMPS Reader — Study Listen controller, playing-sútra focus, mini player */
(function (root) {
  "use strict";

  const STATES = Object.freeze({
    idle: "idle",
    loading: "loading",
    playing: "playing",
    paused: "paused",
    repeating: "repeating",
    completed: "completed",
    error: "error",
  });

  const MSG_NO_AUDIO = "No approved audio is available for this sútra.";

  /** @type {{
   *  status: string,
   *  paragraphId: string|null,
   *  audioSource: string|null,
   *  studyMode: string,
   *  repeatTarget: number,
   *  repeatCompleted: number,
   *  bookId: string|null,
   *  chapterId: string|null,
   *  origin: string,
   *  sessionId: number,
   *  endedListenerCount: number,
   *  audioInstanceCount: number,
   * }} */
  let ctl = blankState();
  let activeCardEl = null;
  let liveRegionEl = null;
  let miniEl = null;
  let pauseResolver = null;

  function blankState() {
    return {
      status: STATES.idle,
      paragraphId: null,
      audioSource: null,
      studyMode: "off",
      repeatTarget: 1,
      repeatCompleted: 0,
      bookId: null,
      chapterId: null,
      origin: "study_listen",
      sessionId: 0,
      endedListenerCount: 0,
      audioInstanceCount: 0,
    };
  }

  function prefersReducedMotion() {
    try {
      return !!root.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    } catch (_) {
      return false;
    }
  }

  function clampRepeat(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 3;
    return Math.min(20, Math.max(1, Math.round(v)));
  }

  function isSpeakablePara(para) {
    if (!para) return false;
    return !!(
      para.kind === "shloka" ||
      para.sanskritRoman ||
      para.sutraRoman ||
      para.devanagari
    );
  }

  function isHeadingLike(el) {
    if (!el) return true;
    if (el.closest?.("header.reader-head")) return true;
    if (el.classList?.contains("reader-head")) return true;
    const id = String(el.id || "");
    if (!id || id === "readerArticle") return true;
    return false;
  }

  function stickyChromeHeight() {
    let h = 0;
    const sels = [
      ".topbar",
      ".reader-toolbar-wrap",
      ".shloka-script-bar",
      ".shloka-study-bar",
      ".reading-return-bar",
      ".shloka-verse-search-wrap",
      ".list-alpha-wrap",
    ];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < (root.innerHeight || 800) * 0.55) {
        h = Math.max(h, r.bottom);
      }
    }
    return Math.max(48, Math.round(h));
  }

  function announce(msg) {
    if (!msg) return;
    if (!liveRegionEl || !liveRegionEl.isConnected) {
      liveRegionEl = document.getElementById("studyListenLive");
      if (!liveRegionEl) {
        liveRegionEl = document.createElement("div");
        liveRegionEl.id = "studyListenLive";
        liveRegionEl.className = "sr-only";
        liveRegionEl.setAttribute("role", "status");
        liveRegionEl.setAttribute("aria-live", "polite");
        liveRegionEl.setAttribute("aria-atomic", "true");
        document.body.appendChild(liveRegionEl);
      }
    }
    liveRegionEl.textContent = "";
    window.setTimeout(() => {
      if (liveRegionEl) liveRegionEl.textContent = String(msg);
    }, 30);
  }

  function clearActiveClasses() {
    document.querySelectorAll(
      ".reader-para.is-audio-active, .reader-para.is-study-playing, .reader-para.is-study-paused, .reader-para.tts-active"
    ).forEach(el => {
      el.classList.remove("is-audio-active", "is-study-playing", "is-study-paused", "tts-active");
      el.removeAttribute("aria-current");
    });
    activeCardEl = null;
  }

  function markActive(paraId, phase) {
    clearActiveClasses();
    const el = paraId ? document.getElementById(paraId) : null;
    if (!el) return null;
    el.classList.add("is-audio-active", "tts-active");
    if (phase === "paused") el.classList.add("is-study-paused");
    else el.classList.add("is-study-playing");
    el.setAttribute("aria-current", "true");
    activeCardEl = el;
    return el;
  }

  function focusPlayingSutra(paragraphId, options = {}) {
    const el = paragraphId ? document.getElementById(paragraphId) : null;
    if (!el || isHeadingLike(el)) return false;

    const reduced = prefersReducedMotion() || options.reducedMotion === true;
    const behavior = reduced ? "auto" : (options.behavior || "smooth");
    const chrome = stickyChromeHeight();
    el.style.scrollMarginTop = `${chrome + 12}px`;

    try {
      // Prefer middle of usable viewport so sticky chrome does not cover the verse.
      el.scrollIntoView({ behavior, block: "center", inline: "nearest" });
    } catch (_) {
      const y =
        (root.scrollY || window.pageYOffset || 0) +
        el.getBoundingClientRect().top -
        chrome -
        Math.max(24, (root.innerHeight || 800) * 0.18);
      root.scrollTo({ top: Math.max(0, y), behavior });
    }

    if (options.focus !== false) {
      try {
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
        el.focus({ preventScroll: true });
      } catch (_) { /* ignore */ }
    }
    return true;
  }

  /**
   * Resolve the sútra intended for Study Listen / audio focus.
   * Order: playing → selected → nearest viewport → resume → first speakable.
   */
  function getCurrentStudySutra(ctx = {}) {
    const bookId = ctx.bookId || null;
    const chapter = ctx.chapter || null;
    const paragraphs = chapter?.paragraphs || ctx.paragraphs || [];
    const playingId = ctl.status !== STATES.idle && ctl.status !== STATES.completed
      ? ctl.paragraphId
      : null;
    const selectedId = ctx.selectedId || null;
    const resumeId = ctx.resumeId || null;

    const pick = (id) => {
      if (!id) return null;
      const para = paragraphs.find(p => p.id === id);
      if (!para || !isSpeakablePara(para)) return null;
      const card = document.getElementById(id);
      if (card && isHeadingLike(card)) return null;
      return {
        paragraphId: id,
        para,
        card: card || null,
        bookId,
        chapterId: chapter?.id || ctx.chapterId || null,
        canonicalText:
          para.sutraRoman ||
          para.sanskritRoman ||
          para.devanagari ||
          para.text ||
          "",
        audioKey: para.id,
      };
    };

    let hit = pick(playingId) || pick(selectedId);
    if (hit) return hit;

    // Nearest speakable card to top of readable viewport
    const chrome = stickyChromeHeight();
    const mid = chrome + Math.max(80, ((root.innerHeight || 800) - chrome) * 0.35);
    let best = null;
    let bestScore = -Infinity;
    for (const p of paragraphs) {
      if (!isSpeakablePara(p)) continue;
      const el = document.getElementById(p.id);
      if (!el || isHeadingLike(el) || el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom <= chrome || r.top >= (root.innerHeight || 800) - 40) continue;
      const center = (r.top + r.bottom) / 2;
      const score = -Math.abs(center - mid) + Math.min(r.height, 200) * 0.001;
      if (score > bestScore) {
        bestScore = score;
        best = p.id;
      }
    }
    hit = pick(best) || pick(resumeId);
    if (hit) return hit;

    const first = paragraphs.find(isSpeakablePara);
    return pick(first?.id);
  }

  async function resolveApprovedAudio(audioKey) {
    const Audio = root.AmpsShlokaAudio;
    const Player = root.AmpsShlokaAudioPlayer;
    if (!Audio || !audioKey) return { ok: false, reason: "none" };
    await Audio.loadManifest?.(true);
    if (Player?.resolveRecitation) {
      const resolved = await Player.resolveRecitation(audioKey, {
        allowDraft: false,
        allowMachineDraft: false,
      });
      if (resolved?.kind === "human" && (resolved.file || resolved.blob)) {
        return {
          ok: true,
          kind: "approved_human",
          file: resolved.file || null,
          blob: resolved.blob || null,
          source: resolved.file || "blob",
        };
      }
      if (resolved?.kind && resolved.kind !== "none" && resolved.kind !== "human") {
        return { ok: false, reason: "non_approved", kind: resolved.kind };
      }
    }
    const entry = Audio.lookupEntry?.(await Audio.loadManifest?.(), audioKey);
    const human = await Audio.hasHumanAudio?.(audioKey, entry);
    // Public policy: only approved human (hasHumanAudio may include generated — reject machine for study)
    const live = await Audio.hasLiveHumanAudio?.(audioKey, entry);
    if (live) {
      const src = Audio.humanSrcFor?.(audioKey) || Audio.bundledSrcFor?.(audioKey) || "";
      if (src) return { ok: true, kind: "approved_human", source: src, entry };
    }
    if (human && entry?.reviewStatus === "approved" && Audio.isLiveHumanEntry?.(entry)) {
      const src = Audio.humanSrcFor?.(audioKey) || "";
      if (src) return { ok: true, kind: "approved_human", source: src, entry };
    }
    return { ok: false, reason: "none" };
  }

  function ensureMiniPlayer() {
    if (miniEl?.isConnected) return miniEl;
    miniEl = document.getElementById("studyListenMini");
    if (!miniEl) {
      miniEl = document.createElement("div");
      miniEl.id = "studyListenMini";
      miniEl.className = "study-listen-mini";
      miniEl.setAttribute("role", "region");
      miniEl.setAttribute("aria-label", "Study audio player");
      miniEl.hidden = true;
      document.body.appendChild(miniEl);
    }
    miniEl.onclick = (e) => {
      const act = e.target?.closest?.("[data-study-listen-act]")?.getAttribute("data-study-listen-act");
      if (!act) return;
      if (act === "pause") togglePause();
      else if (act === "stop") stop({ announceDone: true });
      else if (act === "focus") focusPlayingSutra(ctl.paragraphId, { focus: true });
    };
    return miniEl;
  }

  function updateMiniPlayer() {
    const el = ensureMiniPlayer();
    const active =
      ctl.status === STATES.playing ||
      ctl.status === STATES.paused ||
      ctl.status === STATES.repeating ||
      ctl.status === STATES.loading;
    if (!active) {
      el.hidden = true;
      el.innerHTML = "";
      document.body.classList.remove("has-study-listen-mini");
      return;
    }
    document.body.classList.add("has-study-listen-mini");
    el.hidden = false;
    const n = Math.min(ctl.repeatCompleted + (ctl.status === STATES.paused ? 0 : 1), ctl.repeatTarget);
    const shown = ctl.status === STATES.loading ? 0 : Math.max(1, ctl.repeatCompleted || n);
    const label = ctl.paragraphId ? String(ctl.paragraphId).replace(/^.*-p/, "Sútra ") : "Sútra";
    const pauseLabel = ctl.status === STATES.paused ? "Resume" : "Pause";
    el.innerHTML = `
      <button type="button" class="study-listen-mini-btn" data-study-listen-act="pause" aria-label="${pauseLabel}">${ctl.status === STATES.paused ? "▶" : "⏸"}</button>
      <button type="button" class="study-listen-mini-btn" data-study-listen-act="stop" aria-label="Stop">⏹</button>
      <div class="study-listen-mini-meta">
        <strong>${escapeHtml(label)}</strong>
        <span>Playing ${shown} of ${ctl.repeatTarget}</span>
      </div>
      <button type="button" class="study-listen-mini-btn" data-study-listen-act="focus" aria-label="Show current sútra">◎</button>
    `;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(status, extra = {}) {
    ctl = { ...ctl, status, ...extra };
    if (ctl.paragraphId) {
      markActive(
        ctl.paragraphId,
        status === STATES.paused ? "paused" : "playing"
      );
    }
    updateMiniPlayer();
  }

  function isActive() {
    return (
      ctl.status === STATES.loading ||
      ctl.status === STATES.playing ||
      ctl.status === STATES.paused ||
      ctl.status === STATES.repeating
    );
  }

  function stop(opts = {}) {
    const sid = ctl.sessionId;
    ctl.sessionId += 1;
    if (pauseResolver) {
      const r = pauseResolver;
      pauseResolver = null;
      r();
    }
    try { root.AmpsShlokaAudio?.stop?.(); } catch (_) { /* ignore */ }
    try { root.AmpsAudio?.stop?.(); } catch (_) { /* ignore */ }
    clearActiveClasses();
    const wasActive = isActive() || ctl.status === STATES.completed;
    ctl = { ...blankState(), sessionId: ctl.sessionId };
    updateMiniPlayer();
    document.body.classList.remove("tts-reading", "tts-paused", "has-study-listen-mini");
    if (opts.announceDone && wasActive) announce("Playback stopped");
    return sid;
  }

  function togglePause() {
    if (ctl.status === STATES.paused) {
      setStatus(STATES.playing);
      document.body.classList.remove("tts-paused");
      announce("Resumed");
      if (root.AmpsShlokaAudio?.paused) root.AmpsShlokaAudio.resume?.();
      else root.AmpsAudio?.resume?.();
      if (pauseResolver) {
        const r = pauseResolver;
        pauseResolver = null;
        r();
      }
      return "playing";
    }
    if (ctl.status === STATES.playing || ctl.status === STATES.repeating) {
      setStatus(STATES.paused);
      document.body.classList.add("tts-paused");
      announce("Paused");
      root.AmpsShlokaAudio?.pause?.();
      root.AmpsAudio?.pause?.();
      return "paused";
    }
    return ctl.status;
  }

  async function waitIfPaused(sessionId) {
    while (ctl.sessionId === sessionId && ctl.status === STATES.paused) {
      await new Promise(resolve => {
        pauseResolver = resolve;
      });
    }
  }

  async function playApprovedOnce(audioKey, sessionId) {
    ctl.audioInstanceCount += 1;
    const ok = await root.AmpsShlokaAudio.playVerse(audioKey, { bundledOnly: false });
    if (ctl.sessionId !== sessionId) return false;
    return !!ok;
  }

  async function playTtsSegments(segments, rate, voice, pronunciationMode, pauseSettings, apiTts, sessionId) {
    if (!root.AmpsAudio?.speakSegmentList) return false;
    ctl.audioInstanceCount += 1;
    const ok = await root.AmpsAudio.speakSegmentList(
      segments,
      rate,
      voice,
      pronunciationMode,
      { pauseSettings, apiTts }
    );
    if (ctl.sessionId !== sessionId) return false;
    return ok !== false;
  }

  /**
   * Start Study Listen for the resolved sútra.
   * @returns {Promise<{ok:boolean, reason?:string, ctl?:object}>}
   */
  async function startStudyListen(opts = {}) {
    if (isActive()) {
      togglePause();
      return { ok: true, toggled: true, ctl: { ...ctl } };
    }

    const studyMode = opts.studyMode || root.AmpsShlokaStudy?.getMode?.(opts.settings) || "off";
    const repeatTarget = clampRepeat(
      opts.repeatCount ?? root.AmpsShlokaStudy?.getRepeatCount?.(opts.settings) ?? 3
    );
    const effectiveMode = studyMode === "off" ? "once" : studyMode;
    const repeats =
      effectiveMode === "repeat-verse" || effectiveMode === "repeat-line"
        ? repeatTarget
        : 1;

    const current = opts.sutra || getCurrentStudySutra(opts);
    if (!current?.paragraphId) {
      announce("No sútra found to study.");
      return { ok: false, reason: "no_sutra" };
    }

    stop({ announceDone: false });
    const sessionId = ctl.sessionId + 1;
    ctl = {
      ...blankState(),
      sessionId,
      status: STATES.loading,
      paragraphId: current.paragraphId,
      studyMode: effectiveMode,
      repeatTarget: repeats,
      repeatCompleted: 0,
      bookId: current.bookId,
      chapterId: current.chapterId,
      origin: opts.origin || "study_listen",
    };

    document.body.classList.add("tts-reading");
    document.body.classList.remove("tts-paused");
    markActive(current.paragraphId, "playing");
    focusPlayingSutra(current.paragraphId, { focus: true });
    updateMiniPlayer();
    announce("Loading audio");

    const approved = await resolveApprovedAudio(current.audioKey);
    let usedApproved = false;

    if (approved.ok) {
      usedApproved = true;
      ctl.audioSource = approved.source || approved.file || "approved";
      for (let i = 0; i < repeats; i += 1) {
        if (ctl.sessionId !== sessionId) return { ok: false, reason: "cancelled" };
        await waitIfPaused(sessionId);
        if (ctl.sessionId !== sessionId) return { ok: false, reason: "cancelled" };
        setStatus(i === 0 ? STATES.playing : STATES.repeating, {
          repeatCompleted: i,
        });
        announce(`Playing ${i + 1} of ${repeats}`);
        const ok = await playApprovedOnce(current.audioKey, sessionId);
        // playVerse awaits the real `ended` event internally.
        ctl.endedListenerCount += 1;
        if (!ok) {
          setStatus(STATES.error);
          announce("Playback error");
          clearActiveClasses();
          updateMiniPlayer();
          document.body.classList.remove("tts-reading");
          return { ok: false, reason: "play_failed" };
        }
        ctl.repeatCompleted = i + 1;
        updateMiniPlayer();
      }
    } else if (opts.allowTtsFallback !== false && root.AmpsAudio?.isSupported?.()) {
      // No approved human audio: language-aware device TTS via TtsOrchestrator.
      // Never rejected/draft/unreviewed machine / experimental XTTS in public profiles.
      if (root.TtsOrchestrator && root.TtsOrchestrator.experimentalMachineAudioAllowed?.() === false
          && opts.preferMachine === true) {
        setStatus(STATES.unavailable);
        announce(MSG_NO_AUDIO);
        showToast(MSG_NO_AUDIO);
        document.body.classList.remove("tts-reading");
        return { ok: false, reason: "no_approved_audio" };
      }
      const prefs = opts.scriptPrefs || { roman: true, dev: false };
      ctl.audioSource = "tts";
      for (let i = 0; i < repeats; i += 1) {
        if (ctl.sessionId !== sessionId) return { ok: false, reason: "cancelled" };
        await waitIfPaused(sessionId);
        if (ctl.sessionId !== sessionId) return { ok: false, reason: "cancelled" };

        const onceSettings = {
          ...(opts.settings || {}),
          shlokaStudyMode:
            effectiveMode === "repeat-line" ? "repeat-line" : "repeat-verse",
          shlokaRepeatCount: 1,
        };
        const segments =
          root.AmpsShlokaTts?.buildStudyChandaSegments?.(current.para, prefs, onceSettings) ||
          root.AmpsShlokaStudy?.buildStudySegments?.(
            current.para,
            onceSettings,
            prefs
          );
        if (!segments?.length) {
          setStatus(STATES.error);
          announce(MSG_NO_AUDIO);
          showToast(MSG_NO_AUDIO);
          focusPlayingSutra(current.paragraphId, { focus: true });
          document.body.classList.remove("tts-reading");
          clearActiveClasses();
          updateMiniPlayer();
          return { ok: false, reason: "no_segments" };
        }

        // Route each study segment: Samskrta lines → adapter; English commentary → English engine.
        let routedOk = false;
        if (root.TtsOrchestrator?.resolveSegments && root.AmpsAudio?.speakRoutedSegments) {
          const routed = [];
          for (const seg of segments) {
            const langHint = seg.language
              || (seg.kind === "meaning" || seg.kind === "commentary" || seg.kind === "translation"
                ? "en"
                : (seg.kind === "devanagari" || /[\u0900-\u097F]/.test(seg.text || "")
                  ? "sa-Deva"
                  : (seg.kind === "roman" || seg.kind === "sanskrit" || seg.kind === "sutra"
                    ? "sa-Latn"
                    : null)));
            const parts = await root.TtsOrchestrator.resolveSegments({
              text: seg.text,
              voicePreset: opts.voice || opts.settings?.ttsVoice || "in-en-female",
              language: langHint,
              corpusLanguage: langHint === "en" ? "en" : undefined,
              pronunciationMode: opts.settings?.sanskritPronunciation || "amps-enhanced",
              origin: "study_listen",
            });
            routed.push(...parts);
          }
          setStatus(i === 0 ? STATES.playing : STATES.repeating, { repeatCompleted: i });
          announce(`Playing ${i + 1} of ${repeats}`);
          ctl.audioInstanceCount += 1;
          routedOk = await root.AmpsAudio.speakRoutedSegments(routed, {
            rate: opts.rate || opts.settings?.ttsRate || 1,
            voicePreset: opts.voice || opts.settings?.ttsVoice || "in-en-female",
            pronunciationMode: opts.settings?.sanskritPronunciation || "amps-enhanced",
          });
          ctl.endedListenerCount += 1;
          if (!routedOk) {
            setStatus(STATES.error);
            announce("Playback error");
            clearActiveClasses();
            updateMiniPlayer();
            document.body.classList.remove("tts-reading");
            return { ok: false, reason: "play_failed" };
          }
          ctl.repeatCompleted = i + 1;
          updateMiniPlayer();
          continue;
        }

        setStatus(i === 0 ? STATES.playing : STATES.repeating, { repeatCompleted: i });
        announce(`Playing ${i + 1} of ${repeats}`);
        const ok = await playTtsSegments(
          segments,
          opts.rate || 0.65,
          opts.voice,
          opts.pronunciationMode,
          opts.pauseSettings,
          opts.apiTts,
          sessionId
        );
        ctl.endedListenerCount += 1;
        if (!ok) {
          setStatus(STATES.error);
          announce("Playback error");
          clearActiveClasses();
          updateMiniPlayer();
          document.body.classList.remove("tts-reading");
          return { ok: false, reason: "play_failed" };
        }
        ctl.repeatCompleted = i + 1;
        updateMiniPlayer();
      }
    } else {
      setStatus(STATES.error);
      announce(MSG_NO_AUDIO);
      showToast(MSG_NO_AUDIO);
      focusPlayingSutra(current.paragraphId, { focus: true });
      updateMiniPlayer();
      document.body.classList.remove("tts-reading");
      return { ok: false, reason: "no_audio" };
    }

    if (ctl.sessionId !== sessionId) return { ok: false, reason: "cancelled" };
    setStatus(STATES.completed, { repeatCompleted: repeats });
    announce("Playback completed");
    markActive(current.paragraphId, "playing");
    focusPlayingSutra(current.paragraphId, { focus: false });
    window.setTimeout(() => {
      if (ctl.sessionId === sessionId && ctl.status === STATES.completed) {
        clearActiveClasses();
        markActive(current.paragraphId, "playing");
        document.body.classList.remove("tts-reading", "tts-paused");
        ctl.status = STATES.idle;
        updateMiniPlayer();
      }
    }, 1200);
    return {
      ok: true,
      usedApproved,
      ctl: { ...ctl },
    };
  }

  function showToast(msg) {
    if (typeof root.showReaderToast === "function") {
      root.showReaderToast(msg);
      return;
    }
    let el = document.getElementById("readerToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "readerToast";
      el.className = "reader-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    window.setTimeout(() => el.classList.remove("show"), 3200);
  }

  function getControllerState() {
    return { ...ctl };
  }

  const api = {
    STATES,
    MSG_NO_AUDIO,
    clampRepeat,
    isSpeakablePara,
    stickyChromeHeight,
    getCurrentStudySutra,
    focusPlayingSutra,
    resolveApprovedAudio,
    startStudyListen,
    stop,
    togglePause,
    isActive,
    getControllerState,
    markActive,
    clearActiveClasses,
    announce,
    // test hooks
    _test: {
      get ctl() { return ctl; },
      setCtl(next) { ctl = { ...ctl, ...next }; },
      reset() { stop({ announceDone: false }); ctl = blankState(); },
    },
  };

  root.AmpsStudyListen = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);

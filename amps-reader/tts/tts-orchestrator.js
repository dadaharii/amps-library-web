/* AMPS Library — unified language-aware TTS orchestrator */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TtsOrchestrator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const STATES = Object.freeze({
    idle: "idle",
    loading: "loading",
    playing: "playing",
    paused: "paused",
    completed: "completed",
    error: "error",
    unavailable: "unavailable",
  });

  /** Single active session — features must not spawn independent overlapping Audio. */
  let session = {
    id: 0,
    status: STATES.idle,
    origin: null,
    segments: [],
    activeIndex: -1,
    listeners: new Set(),
  };

  function releaseProfile() {
    const flags = root.AmpsBuildFlags || {};
    if (flags.internalResearch === true) return "internal-research";
    if (flags.fullOffline === true || flags.profileId === "full-offline") return "full-offline";
    if (flags.slimCore === true || flags.profileId === "slim-core") return "slim-core";
    return flags.profileId || "default";
  }

  function experimentalMachineAudioAllowed() {
    const profile = releaseProfile();
    if (profile === "internal-research") return true;
    // Public / slim / full-offline: experimental XTTS stays private
    return false;
  }

  function notify(evt) {
    for (const fn of session.listeners) {
      try { fn(evt); } catch (_) { /* */ }
    }
    try {
      root.dispatchEvent?.(new CustomEvent("amps-tts-orchestrator", { detail: evt }));
    } catch (_) { /* */ }
  }

  function setStatus(status, extra) {
    session.status = status;
    notify({ type: "status", status, sessionId: session.id, ...(extra || {}) });
  }

  function subscribe(fn) {
    session.listeners.add(fn);
    return () => session.listeners.delete(fn);
  }

  function stop() {
    session.id += 1;
    setStatus(STATES.idle);
    root.AmpsAudio?.stop?.();
    root.AmpsShlokaAudio?.stop?.();
  }

  function pause() {
    if (session.status !== STATES.playing) return session.status;
    setStatus(STATES.paused);
    root.AmpsAudio?.pause?.();
    root.AmpsShlokaAudio?.pause?.();
    return STATES.paused;
  }

  function resume() {
    if (session.status !== STATES.paused) return session.status;
    setStatus(STATES.playing);
    root.AmpsAudio?.resume?.();
    root.AmpsShlokaAudio?.resume?.();
    return STATES.playing;
  }

  /**
   * Resolve content into routed speak segments.
   */
  async function resolveSegments(request) {
    const text = String(request?.text || "");
    const Router = root.TtsLanguageRouter;
    const English = root.EnglishTtsProcessor;
    const Samskrta = root.AmpsSamskrtaPronunciationAdapter;
    const Voices = root.TtsVoiceRegistry;
    const term = root.AmpsTtsTerminology;

    const classifyOpts = {
      explicitLanguage: request?.language || request?.explicitLanguage,
      corpusLanguage: request?.corpusLanguage || "en",
      element: request?.element || null,
    };

    const rawSegments = Router?.segment
      ? Router.segment(text, classifyOpts)
      : [{ text, language: "en", source: "fallback" }];

    const preferredPreset = request?.voicePreset || request?.voice || "in-en-female";
    const prepared = [];

    for (const seg of rawSegments) {
      if (!String(seg.text || "").trim()) continue;
      let language = seg.language;
      if (language === "punctuation" || language === "number" || language === "abbreviation") {
        language = "en";
      }

      const voiceRes = Voices?.resolveForLanguage?.(preferredPreset, language) || {
        voice: { preset: preferredPreset, locale: "en-IN" },
        locale: "en-IN",
        ok: true,
      };

      if (language === "en") {
        const en = English?.prepare?.(seg.text, { locale: voiceRes.locale }) || { text: seg.text, language: "en" };
        // Apply English AMPS terms (PROUT, Neohumanism) speakAs only — never ordinary English.
        let speakText = en.text;
        if (term?.TERMS) {
          for (const t of term.TERMS) {
            if (t.language !== "en" || !t.speakAs) continue;
            for (const a of t.aliases) {
              const re = new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
              speakText = speakText.replace(re, t.speakAs);
            }
          }
        }
        prepared.push({
          originalText: seg.text,
          text: speakText,
          language: "en",
          pronunciationFrontend: "english",
          voicePreset: voiceRes.voice?.preset || preferredPreset,
          locale: voiceRes.locale || "en-IN",
          remappedVoice: !!voiceRes.remapped,
          usedOrdinaryEnglishOverrides: false,
        });
        continue;
      }

      if (language === "sa-Latn" || language === "sa-Deva") {
        const sk = Samskrta?.prepare
          ? await Samskrta.prepare(seg.text, {
              language,
              pronunciationMode: request?.pronunciationMode || "amps-enhanced",
            })
          : { text: seg.text, language };
        prepared.push({
          originalText: seg.text,
          text: sk.text,
          language,
          pronunciationFrontend: "amps-samskrta",
          voicePreset: voiceRes.voice?.preset || preferredPreset,
          locale: voiceRes.locale || "en-IN",
          appliedApproved: sk.appliedApproved || [],
          reviewStatus: sk.reviewStatus || [],
          blocked: !!sk.blocked,
        });
        continue;
      }

      if (language === "hi-Deva") {
        prepared.push({
          originalText: seg.text,
          text: seg.text,
          language,
          pronunciationFrontend: "hindi",
          voicePreset: voiceRes.voice?.preset || "hi-female",
          locale: "hi-IN",
        });
        continue;
      }

      // Unknown → English default for Roman, else skip processor tricks
      const en = English?.prepare?.(seg.text) || { text: seg.text };
      prepared.push({
        originalText: seg.text,
        text: en.text,
        language: "en",
        pronunciationFrontend: "english",
        voicePreset: voiceRes.voice?.preset || preferredPreset,
        locale: voiceRes.locale || "en-IN",
      });
    }

    return prepared;
  }

  /**
   * Audio resolution priority for a sútra / paragraph.
   */
  function resolveAudioSource(request) {
    const profile = releaseProfile();
    // 1. Approved human
    if (request?.approvedHumanUrl || request?.approvedHumanKey) {
      return { kind: "approved-human", key: request.approvedHumanKey, url: request.approvedHumanUrl };
    }
    if (request?.audioKey && root.AmpsShlokaAudio?.hasApprovedHuman?.(request.audioKey)) {
      return { kind: "approved-human", key: request.audioKey };
    }
    // 2. Approved reviewed synthetic — only if explicitly marked approved
    if (request?.approvedSyntheticUrl) {
      return { kind: "approved-synthetic", url: request.approvedSyntheticUrl };
    }
    // Never: rejected, draft, unreviewed machine, private review, experimental XTTS in public
    if (request?.preferMachine === true && !experimentalMachineAudioAllowed()) {
      return { kind: "blocked-machine", reason: "experimental machine audio not public" };
    }
    // 3. Compatible on-device language voice
    return { kind: "device-tts", profile };
  }

  /**
   * Prepare speak text for legacy AmpsAudio callers — language-aware.
   */
  async function prepareSpeakRequest(text, voicePreset, options) {
    const segments = await resolveSegments({
      text,
      voicePreset,
      language: options?.contentLanguage || options?.language,
      corpusLanguage: options?.corpusLanguage || "en",
      pronunciationMode: options?.pronunciationMode || options?.sanskritMode,
      element: options?.element,
    });
    // For single-utterance legacy path, join while preserving per-segment metadata
    return {
      segments,
      text: segments.map(s => s.text).join(""),
      // If all English, mark so AmpsAudio skips Samskrta/Hindi processors
      allEnglish: segments.length > 0 && segments.every(s => s.language === "en"),
      anySamskrta: segments.some(s => s.language === "sa-Latn" || s.language === "sa-Deva"),
      primaryLanguage: segments[0]?.language || "en",
      primaryLocale: segments[0]?.locale || "en-IN",
      primaryPreset: segments[0]?.voicePreset || voicePreset,
    };
  }

  async function play(request) {
    const sid = ++session.id;
    setStatus(STATES.loading, { origin: request?.origin || "orchestrator" });
    session.origin = request?.origin || "orchestrator";

    const audio = resolveAudioSource(request);
    if (audio.kind === "blocked-machine") {
      setStatus(STATES.unavailable, { reason: audio.reason });
      return { ok: false, reason: audio.reason, sessionId: sid };
    }

    if (audio.kind === "approved-human" && root.AmpsShlokaAudio?.playVerse && audio.key) {
      setStatus(STATES.playing);
      const ok = await root.AmpsShlokaAudio.playVerse(audio.key, { bundledOnly: false });
      if (session.id !== sid) return { ok: false, reason: "superseded" };
      setStatus(ok ? STATES.completed : STATES.error);
      return { ok: !!ok, audio, sessionId: sid };
    }

    const prepared = await resolveSegments(request);
    session.segments = prepared;
    if (!prepared.length) {
      setStatus(STATES.unavailable, { reason: "no_text" });
      return { ok: false, reason: "no_text", sessionId: sid };
    }
    if (prepared.some(p => p.blocked)) {
      setStatus(STATES.unavailable, { reason: "blocked_unresolved_samskrta" });
      return { ok: false, reason: "blocked_unresolved_samskrta", sessionId: sid };
    }

    if (!root.AmpsAudio?.speakSegmentList && !root.AmpsAudio?.speak) {
      setStatus(STATES.unavailable, { reason: "no_tts_engine" });
      return { ok: false, reason: "no_tts_engine", sessionId: sid };
    }

    setStatus(STATES.playing);
    // Prefer segment list with per-segment language options when available
    if (root.AmpsAudio.speakRoutedSegments) {
      const ok = await root.AmpsAudio.speakRoutedSegments(prepared, request);
      if (session.id !== sid) return { ok: false, reason: "superseded" };
      setStatus(ok ? STATES.completed : STATES.error);
      return { ok: !!ok, audio: { kind: "device-tts" }, segments: prepared, sessionId: sid };
    }

    // Fallback: speak joined text with primary English-safe options
    const joined = prepared.map(s => s.text).join("");
    const preset = prepared.every(s => s.language === "en")
      ? (prepared[0]?.voicePreset || request?.voicePreset || "in-en-female")
      : (request?.voicePreset || "in-en-female");
    const ok = await root.AmpsAudio.speak?.(
      joined,
      request?.rate || 1,
      preset,
      null,
      {
        pronunciationMode: prepared.every(s => s.language === "en") ? "off" : (request?.pronunciationMode || "amps-enhanced"),
        contentLanguage: prepared.every(s => s.language === "en") ? "en" : prepared[0]?.language,
        routedSegments: prepared,
      }
    );
    if (session.id !== sid) return { ok: false, reason: "superseded" };
    setStatus(ok !== false ? STATES.completed : STATES.error);
    return { ok: ok !== false, audio: { kind: "device-tts" }, segments: prepared, sessionId: sid };
  }

  function getSession() {
    return {
      id: session.id,
      status: session.status,
      origin: session.origin,
      segmentCount: session.segments.length,
      activeIndex: session.activeIndex,
      releaseProfile: releaseProfile(),
      experimentalMachineAudioAllowed: experimentalMachineAudioAllowed(),
    };
  }

  function publicPronunciationSources() {
    return [
      "Approved human audio",
      "Approved Samskrta rules",
      "English system pronunciation",
      "Experimental audio unavailable publicly",
    ];
  }

  return {
    STATES,
    subscribe,
    stop,
    pause,
    resume,
    play,
    resolveSegments,
    resolveAudioSource,
    prepareSpeakRequest,
    getSession,
    releaseProfile,
    experimentalMachineAudioAllowed,
    publicPronunciationSources,
  };
});

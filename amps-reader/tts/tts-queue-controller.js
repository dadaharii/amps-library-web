/* AMPS Library — deterministic one-chunk-at-a-time TTS queue */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TtsQueueController = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const Session = () => root.TtsPlaybackSession;
  const Plan = () => root.TtsSpeechPlan;
  const Highlight = () => root.TtsHighlightController;
  const Diag = () => root.TtsSyncDiagnostics;
  const Caps = () => root.TtsPlatformCapabilities;
  const Orch = () => root.TtsOrchestrator;

  /** @type {object|null} */
  let active = null;
  /** Sole navigation callback — only place that advances paragraphs. */
  let advanceHandler = null;
  let utteranceSeq = 0;

  function getActive() {
    return active;
  }

  function setAdvanceHandler(fn) {
    advanceHandler = typeof fn === "function" ? fn : null;
  }

  function log(event, extra) {
    Diag()?.log?.({
      event,
      sessionId: active?.sessionId,
      paragraphId: active?.paragraphId,
      ...(extra || {}),
    });
  }

  function cancelActive(reason) {
    const S = Session();
    if (!active) return;
    const r = reason || S.END_REASON.user_stop;
    S.markCancelled(active, r);
    log("cancelled_end_ignored", { endReason: r, status: active.status });
    Highlight()?.setPaused?.(active, false);
    // Do not clear highlight immediately on pause-like interrupts
    if (r === S.END_REASON.user_stop || r === S.END_REASON.route_change || r === S.END_REASON.replacement) {
      Highlight()?.clearAll?.();
    }
    active = null;
  }

  /**
   * Speak engine adapter — injected or AmpsAudio low-level.
   * Must return { ok, endReason, error? }.
   */
  async function speakChunkEngine(chunk, session, request, position) {
    const token = `utt-${++utteranceSeq}`;
    Session().beginChunk(session, chunk, token);
    const gen = session.cancellationGeneration;
    Highlight()?.syncFromSession?.(session, chunk);
    log("chunk_started", {
      chunkId: chunk.chunkId,
      segmentId: chunk.segmentId,
      language: chunk.language,
      status: session.status,
    });

    // Process text via orchestrator / existing processors without losing canonical offsets
    let processed = chunk.visibleText;
    try {
      if (Orch()?.resolveSegments) {
        const routed = await Orch().resolveSegments({
          text: chunk.visibleText,
          voicePreset: request?.voicePreset,
          language: chunk.language === "en" ? "en" : chunk.language,
          corpusLanguage: chunk.language === "en" ? "en" : undefined,
          pronunciationMode: request?.pronunciationMode,
        });
        processed = routed.map(s => s.text).join("") || chunk.visibleText;
      }
    } catch (_) { /* keep visible */ }
    chunk.processedText = processed;

    const speakOne = request?.speakChunkFn;
    if (!speakOne) {
      return { ok: false, endReason: Session().END_REASON.platform_error, error: "no_speak_fn" };
    }

    const startedAt = Date.now();
    let result;
    try {
      result = await speakOne({
        text: chunk.visibleText,
        processedText: processed,
        language: chunk.language,
        voicePreset: request?.voicePreset,
        rate: request?.rate,
        expectedPause: chunk.expectedPause,
        chunkIndex: position?.index ?? 0,
        chunkCount: position?.count ?? 1,
        canonicalStart: chunk.canonicalStart,
        canonicalEnd: chunk.canonicalEnd,
        paragraphIndex: session.paragraphIndex,
        sessionId: session.sessionId,
        chunkId: chunk.chunkId,
        utteranceToken: token,
        cancellationGeneration: gen,
        onBoundary(processedIndex) {
          if (!Session().isActive(session, session.sessionId)) return;
          if (session.activeUtteranceToken !== token) return;
          const TextMap = root.TtsTextMap;
          const canon = TextMap?.mapProcessedToCanonical?.(chunk.textMap, processedIndex);
          Session().recordBoundary(session, processedIndex, canon);
          log("boundary", { chunkId: chunk.chunkId, charIndex: processedIndex });
          // Word highlight only when platform-capable
          if (Caps()?.wordHighlightAllowed?.(session.platformHints)) {
            Highlight()?.activateChunk?.(session, chunk, { wordIndex: -1 });
          }
        },
      });
    } catch (err) {
      result = {
        ok: false,
        endReason: Session().END_REASON.platform_error,
        error: String(err?.message || err || "speak_error"),
      };
    }

    const elapsedMs = Date.now() - startedAt;
    if (!Session().isActive(active, session.sessionId) || active !== session) {
      log("cancelled_end_ignored", {
        chunkId: chunk.chunkId,
        endReason: result?.endReason || Session().END_REASON.replacement,
        elapsedMs,
      });
      return { ok: false, endReason: Session().END_REASON.replacement, ignored: true };
    }

    const endReason = result?.endReason || (result?.ok ? Session().END_REASON.natural_end : Session().END_REASON.unknown);

    if (endReason !== Session().END_REASON.natural_end) {
      log("cancelled_end_ignored", { chunkId: chunk.chunkId, endReason, elapsedMs });
      return { ok: false, endReason, ignored: endReason !== Session().END_REASON.platform_error };
    }

    const complete = Session().tryCompleteChunk(session, {
      sessionId: session.sessionId,
      chunkId: chunk.chunkId,
      utteranceToken: token,
      cancellationGeneration: gen,
      endReason: Session().END_REASON.natural_end,
      expectedChars: processed.length,
      error: result?.error || null,
    });

    if (!complete.ok) {
      log("advance_blocked", {
        chunkId: chunk.chunkId,
        endReason: complete.reason,
        elapsedMs,
        status: session.status,
      });
      return { ok: false, endReason: complete.reason, retryable: complete.reason === "implausibly_short" };
    }

    chunk.status = "completed";
    log("chunk_completed", { chunkId: chunk.chunkId, elapsedMs, endReason: "natural_end" });
    log("natural_end", { chunkId: chunk.chunkId, elapsedMs });
    return { ok: true, endReason: Session().END_REASON.natural_end };
  }

  async function runChunkQueue(session, request) {
    const chunks = Plan()?.flattenChunks?.(session.speechPlan) || [];
    for (let i = 0; i < chunks.length; i += 1) {
      if (active !== session) return { ok: false, reason: "superseded" };
      if (session.status === Session().STATUS.cancelled
        || session.status === Session().STATUS.interrupted) {
        return { ok: false, reason: "cancelled" };
      }

      // Pause gate
      while (session.status === Session().STATUS.paused && active === session) {
        await new Promise(r => setTimeout(r, 120));
      }
      if (active !== session) return { ok: false, reason: "superseded" };

      session.currentChunkIndex = i;
      const chunk = chunks[i];
      let attempt = 0;
      let done = false;
      while (!done && attempt < 2) {
        attempt += 1;
        if (attempt > 1) {
          session.retryCount = attempt - 1;
          Highlight()?.setRetrying?.(session, true);
          log("retry", { chunkId: chunk.chunkId, status: "retrying" });
          request?.onRecovery?.("Resuming this paragraph…");
        }
        const result = await speakChunkEngine(chunk, session, request, { index: i, count: chunks.length });
        Highlight()?.setRetrying?.(session, false);
        if (result.ok) {
          done = true;
          session.retryCount = 0;
          break;
        }
        if (result.ignored || result.endReason === Session().END_REASON.user_stop
          || result.endReason === Session().END_REASON.replacement
          || result.endReason === Session().END_REASON.route_change) {
          return { ok: false, reason: result.endReason };
        }
        if (!result.retryable && attempt >= 2) {
          Session().markChunkFailed(session, chunk.chunkId, result.endReason);
          log("error", { chunkId: chunk.chunkId, endReason: result.endReason });
          request?.onRecovery?.(session.recoveryMessage || "Reading paused before this paragraph was completed.");
          return { ok: false, reason: result.endReason, recovery: true };
        }
        if (!result.retryable) {
          // one more loop if retryable flag missing but short/error
          if (attempt >= 2) {
            Session().markChunkFailed(session, chunk.chunkId, result.endReason);
            request?.onRecovery?.(session.recoveryMessage || "Reading paused before this paragraph was completed.");
            return { ok: false, reason: result.endReason, recovery: true };
          }
        }
      }
      if (!done) {
        Session().markChunkFailed(session, chunk.chunkId, "retry_exhausted");
        request?.onRecovery?.(session.recoveryMessage || "Reading paused before this paragraph was completed.");
        return { ok: false, reason: "retry_exhausted", recovery: true };
      }
    }
    return { ok: true };
  }

  /**
   * Play one paragraph through the deterministic queue.
   * Advances to next paragraph only via canAdvanceParagraph + advanceHandler.
   */
  async function playParagraph(request) {
    const S = Session();
    const paragraphId = request?.paragraphId;
    const canonicalText = String(request?.canonicalText || request?.text || "");
    if (!canonicalText.trim()) {
      return { ok: true, empty: true };
    }

    // Replace previous session
    if (active) {
      cancelActive(S.END_REASON.replacement);
    }

    const platformHints = request?.platformHints || Caps()?.resolve?.({
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      nativeAndroid: !!root.AmpsAudio?.useNative?.(),
    }) || {};

    const speechPlan = Plan().buildSpeechPlan(
      { id: paragraphId, text: canonicalText, language: request?.language },
      {
        paragraphId,
        corpusLanguage: request?.corpusLanguage || "en",
        language: request?.language,
        platformHints,
        maxChunkChars: request?.maxChunkChars,
        sentenceChunks: !!request?.sentenceChunks,
        element: request?.element,
      }
    );

    log("speech_plan_created", {
      paragraphId,
      status: "preparing",
      language: request?.language,
    });

    const session = S.create({
      origin: request?.origin || "reader",
      bookId: request?.bookId,
      chapterId: request?.chapterId,
      paragraphId,
      paragraphIndex: request?.paragraphIndex,
      paragraphElement: request?.element,
      canonicalText,
      speechPlan,
      repeatTarget: request?.repeatTarget || 1,
      platformHints,
    });
    active = session;
    log("session_created", { paragraphId, status: session.status });

    Highlight()?.activateParagraph?.(session, { scroll: request?.scroll !== false });

    // Repeat loop: each full pass must complete all chunks before increment
    while (active === session) {
      session.status = S.STATUS.speaking;
      const pass = await runChunkQueue(session, request);
      if (active !== session) return { ok: false, reason: "superseded", sessionId: session.sessionId };
      if (!pass.ok) {
        return {
          ok: false,
          reason: pass.reason,
          recovery: !!pass.recovery,
          sessionId: session.sessionId,
          recoveryMessage: session.recoveryMessage,
        };
      }

      const paragraphDone = S.markParagraphCompleted(session);
      log("paragraph_completed", {
        paragraphId,
        status: session.status,
        // repeatCompleted already incremented inside markParagraphCompleted
      });

      if (!paragraphDone) {
        // more repeats — reset already done in markParagraphCompleted
        log("retry", { paragraphId, status: "repeating" });
        continue;
      }

      const gate = S.canAdvanceParagraph(session, {
        paragraphId,
        bookId: request?.bookId,
        chapterId: request?.chapterId,
      });
      if (!gate.ok) {
        log("advance_blocked", { paragraphId, endReason: gate.reason, status: session.status });
        Highlight()?.markCompleted?.(session);
        active = null;
        return { ok: true, advanced: false, blockedReason: gate.reason, sessionId: session.sessionId };
      }

      log("advance_requested", { paragraphId });
      let advanced = false;
      if (advanceHandler) {
        advanced = !!(await advanceHandler({
          sessionId: session.sessionId,
          paragraphId,
          paragraphIndex: session.paragraphIndex,
          bookId: session.bookId,
          chapterId: session.chapterId,
        }));
        log(advanced ? "paragraph_advanced" : "advance_blocked", { paragraphId });
      } else if (request?.onParagraphComplete) {
        await request.onParagraphComplete({
          sessionId: session.sessionId,
          paragraphId,
          paragraphIndex: session.paragraphIndex,
        });
        advanced = true;
        log("paragraph_advanced", { paragraphId });
      }

      Highlight()?.markCompleted?.(session);
      active = null;
      return { ok: true, advanced, sessionId: session.sessionId, repeatCompleted: session.repeatCompleted };
    }
    return { ok: false, reason: "superseded" };
  }

  /**
   * Play a list of paragraphs sequentially — only this function advances.
   */
  async function playParagraphList(paragraphs, request) {
    const list = Array.isArray(paragraphs) ? paragraphs : [];
    const results = [];
    for (let i = 0; i < list.length; i += 1) {
      const para = list[i];
      const text = typeof para === "string" ? para : (para.text || para.canonicalText || "");
      const id = typeof para === "string"
        ? (request?.paraIds?.[i] || `p-${i}`)
        : (para.id || para.paragraphId || request?.paraIds?.[i] || `p-${i}`);

      request?.onParagraphStart?.(i, id, text);

      const result = await playParagraph({
        ...(request || {}),
        paragraphId: id,
        paragraphIndex: i,
        canonicalText: text,
        element: para?.element || request?.getElement?.(id) || null,
        // Disable auto-advance handler; list driver advances explicitly after gate
      });

      results.push(result);
      if (!result.ok) {
        if (result.recovery) break;
        if (result.reason === "superseded" || result.reason === "user_stop" || result.reason === "route_change") break;
        // Hard failure — do not skip to next paragraph
        break;
      }
      // Between paragraphs: optional pause
      if (i < list.length - 1 && request?.paragraphPauseMs) {
        await new Promise(r => setTimeout(r, request.paragraphPauseMs));
      }
    }
    return results;
  }

  function pause() {
    if (!active) return false;
    if (active.status !== Session().STATUS.speaking
      && active.status !== Session().STATUS.repeating) return false;
    active.status = Session().STATUS.paused;
    Highlight()?.setPaused?.(active, true);
    log("pause", { paragraphId: active.paragraphId, status: "paused" });
    return true;
  }

  function resume() {
    if (!active || active.status !== Session().STATUS.paused) return false;
    active.status = Session().STATUS.speaking;
    Highlight()?.setPaused?.(active, false);
    log("resume", { paragraphId: active.paragraphId, status: "speaking" });
    return true;
  }

  function stop(reason) {
    cancelActive(reason || Session().END_REASON.user_stop);
  }

  /** Public recovery actions */
  function recoveryActions() {
    return [
      { id: "resume", label: "Resume this paragraph" },
      { id: "restart", label: "Restart paragraph" },
      { id: "skip", label: "Skip paragraph" },
      { id: "stop", label: "Stop listening" },
    ];
  }

  return {
    getActive,
    setAdvanceHandler,
    playParagraph,
    playParagraphList,
    pause,
    resume,
    stop,
    cancelActive,
    recoveryActions,
    /** Test seam */
    _speakChunkEngine: speakChunkEngine,
  };
});

/* AMPS Library — TTS playback session state machine */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TtsPlaybackSession = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STATUS = Object.freeze({
    idle: "idle",
    preparing: "preparing",
    loading: "loading",
    speaking: "speaking",
    paused: "paused",
    segment_completed: "segment_completed",
    paragraph_completed: "paragraph_completed",
    repeating: "repeating",
    cancelled: "cancelled",
    interrupted: "interrupted",
    error: "error",
  });

  const END_REASON = Object.freeze({
    natural_end: "natural_end",
    user_stop: "user_stop",
    user_pause: "user_pause",
    route_change: "route_change",
    voice_change: "voice_change",
    replacement: "replacement",
    browser_interruption: "browser_interruption",
    platform_error: "platform_error",
    watchdog_retry: "watchdog_retry",
    unknown: "unknown",
  });

  let _sessionSeq = 0;

  function create(opts) {
    _sessionSeq += 1;
    const sessionId = `tts-sess-${_sessionSeq}-${Date.now().toString(36)}`;
    return {
      sessionId,
      origin: opts?.origin || "reader",
      bookId: opts?.bookId || null,
      chapterId: opts?.chapterId || null,
      paragraphId: opts?.paragraphId || null,
      paragraphIndex: Number.isFinite(opts?.paragraphIndex) ? opts.paragraphIndex : -1,
      paragraphElement: opts?.paragraphElement || null,
      canonicalText: String(opts?.canonicalText || ""),
      speechPlan: opts?.speechPlan || null,
      segments: opts?.speechPlan?.segments || [],
      currentSegmentIndex: 0,
      currentChunkIndex: 0,
      completedChunkIds: new Set(),
      failedChunkIds: new Set(),
      pendingChunkIds: new Set(opts?.speechPlan?.allChunkIds || []),
      repeatTarget: Math.max(1, Number(opts?.repeatTarget) || 1),
      repeatCompleted: 0,
      status: STATUS.preparing,
      startedAt: Date.now(),
      completedAt: null,
      cancellationReason: null,
      cancellationGeneration: 0,
      activeUtteranceToken: null,
      activeChunkId: null,
      lastBoundaryProcessed: -1,
      lastBoundaryCanonical: -1,
      chunkStartedAt: null,
      retryCount: 0,
      syncMode: opts?.speechPlan?.syncMode || "chunk_aligned",
      platformHints: opts?.platformHints || {},
      recoveryMessage: null,
    };
  }

  function isActive(session, sessionId) {
    return !!(session && session.sessionId === sessionId
      && session.status !== STATUS.cancelled
      && session.status !== STATUS.idle);
  }

  function markCancelled(session, reason) {
    if (!session) return;
    session.cancellationGeneration += 1;
    session.cancellationReason = reason || END_REASON.unknown;
    session.status = reason === END_REASON.browser_interruption || reason === END_REASON.route_change
      ? (reason === END_REASON.browser_interruption ? STATUS.interrupted : STATUS.cancelled)
      : STATUS.cancelled;
    session.activeUtteranceToken = null;
    session.activeChunkId = null;
  }

  function beginChunk(session, chunk, utteranceToken) {
    session.status = STATUS.speaking;
    session.activeChunkId = chunk.chunkId;
    session.activeUtteranceToken = utteranceToken;
    session.chunkStartedAt = Date.now();
    session.lastBoundaryProcessed = -1;
    session.lastBoundaryCanonical = chunk.canonicalStart;
    chunk.status = "speaking";
  }

  function recordBoundary(session, processedIndex, canonicalIndex) {
    if (!session || session.status !== STATUS.speaking) return;
    session.lastBoundaryProcessed = processedIndex;
    if (Number.isFinite(canonicalIndex)) session.lastBoundaryCanonical = canonicalIndex;
  }

  /**
   * Only natural_end with matching identities may complete a chunk.
   */
  function tryCompleteChunk(session, event) {
    if (!session || !event) return { ok: false, reason: "no_session" };
    if (event.sessionId !== session.sessionId) return { ok: false, reason: "stale_session" };
    if (session.status === STATUS.cancelled || session.status === STATUS.interrupted) {
      return { ok: false, reason: "session_cancelled" };
    }
    if (event.endReason !== END_REASON.natural_end) {
      return { ok: false, reason: "not_natural_end", endReason: event.endReason };
    }
    if (event.cancellationGeneration != null
      && event.cancellationGeneration !== session.cancellationGeneration) {
      return { ok: false, reason: "stale_generation" };
    }
    if (event.utteranceToken && session.activeUtteranceToken
      && event.utteranceToken !== session.activeUtteranceToken) {
      return { ok: false, reason: "stale_utterance" };
    }
    if (event.chunkId !== session.activeChunkId) {
      return { ok: false, reason: "wrong_chunk" };
    }
    if (session.completedChunkIds.has(event.chunkId)) {
      return { ok: false, reason: "already_completed" };
    }
    if (event.error) return { ok: false, reason: "error" };

    // Conservative elapsed check — reject implausibly short completions for long chunks
    const elapsed = Date.now() - (session.chunkStartedAt || Date.now());
    const chunkLen = Number(event.expectedChars) || 0;
    const minMs = Math.min(4000, Math.max(0, Math.floor(chunkLen * 8))); // ~8ms/char floor, capped
    if (chunkLen > 40 && elapsed < minMs * 0.25 && event.allowShort !== true) {
      return { ok: false, reason: "implausibly_short", elapsed, minMs };
    }

    session.completedChunkIds.add(event.chunkId);
    session.pendingChunkIds.delete(event.chunkId);
    session.activeChunkId = null;
    session.activeUtteranceToken = null;
    session.status = STATUS.segment_completed;
    return { ok: true };
  }

  function markChunkFailed(session, chunkId, reason) {
    if (!session) return;
    session.failedChunkIds.add(chunkId);
    session.pendingChunkIds.delete(chunkId);
    session.status = STATUS.error;
    session.recoveryMessage = "Reading paused before this paragraph was completed.";
  }

  function allChunksComplete(session) {
    if (!session?.speechPlan?.allChunkIds?.length) return false;
    return session.speechPlan.allChunkIds.every(id => session.completedChunkIds.has(id));
  }

  function resetChunksForRepeat(session) {
    session.completedChunkIds = new Set();
    session.failedChunkIds = new Set();
    session.pendingChunkIds = new Set(session.speechPlan?.allChunkIds || []);
    session.currentSegmentIndex = 0;
    session.currentChunkIndex = 0;
    session.retryCount = 0;
    for (const seg of session.segments || []) {
      for (const ch of seg.chunks || []) ch.status = "pending";
    }
  }

  /**
   * Sole gate for advancing to the next paragraph.
   */
  function canAdvanceParagraph(session, context) {
    const ctx = context || {};
    if (!session) return { ok: false, reason: "no_session" };
    if (session.status === STATUS.cancelled || session.status === STATUS.interrupted) {
      return { ok: false, reason: "cancelled" };
    }
    if (session.cancellationReason === END_REASON.user_stop
      || session.cancellationReason === END_REASON.route_change
      || session.cancellationReason === END_REASON.voice_change
      || session.cancellationReason === END_REASON.replacement) {
      return { ok: false, reason: "cancelled" };
    }
    if (session.status !== STATUS.paragraph_completed) {
      return { ok: false, reason: "not_paragraph_completed", status: session.status };
    }
    if (!allChunksComplete(session)) return { ok: false, reason: "chunks_incomplete" };
    if (session.pendingChunkIds.size > 0) return { ok: false, reason: "pending_chunks" };
    if (session.failedChunkIds.size > 0) return { ok: false, reason: "failed_chunks" };
    if (session.retryCount > 0 && session.activeChunkId) return { ok: false, reason: "retry_active" };
    if (ctx.paragraphId && ctx.paragraphId !== session.paragraphId) {
      return { ok: false, reason: "paragraph_mismatch" };
    }
    if (ctx.bookId && session.bookId && ctx.bookId !== session.bookId) {
      return { ok: false, reason: "book_mismatch" };
    }
    if (ctx.chapterId && session.chapterId && ctx.chapterId !== session.chapterId) {
      return { ok: false, reason: "chapter_mismatch" };
    }
    if (session.repeatCompleted < session.repeatTarget) {
      return { ok: false, reason: "repeats_remaining", remaining: session.repeatTarget - session.repeatCompleted };
    }
    return { ok: true };
  }

  function markParagraphCompleted(session) {
    if (!allChunksComplete(session)) return false;
    session.repeatCompleted += 1;
    if (session.repeatCompleted < session.repeatTarget) {
      session.status = STATUS.repeating;
      resetChunksForRepeat(session);
      return false; // not ready to advance — need another pass
    }
    session.status = STATUS.paragraph_completed;
    session.completedAt = Date.now();
    return true;
  }

  return {
    STATUS,
    END_REASON,
    create,
    isActive,
    markCancelled,
    beginChunk,
    recordBoundary,
    tryCompleteChunk,
    markChunkFailed,
    allChunksComplete,
    resetChunksForRepeat,
    canAdvanceParagraph,
    markParagraphCompleted,
  };
});

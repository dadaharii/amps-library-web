/* AMPS Reader — virtual paragraph rendering for long chapters */
(function () {
  "use strict";

  const THRESHOLD = 72;
  const BUFFER = 8;
  const EST_HEIGHT = 140;

  function shouldVirtualize(paraCount, pageMode) {
    return !pageMode && paraCount >= THRESHOLD;
  }

  function visibleRange(scrollY, viewportH, total, startEstimate) {
    const first = Math.max(0, Math.floor(scrollY / EST_HEIGHT) - BUFFER);
    const visible = Math.ceil(viewportH / EST_HEIGHT) + BUFFER * 2;
    return { start: first, end: Math.min(total, first + visible) };
  }

  function buildVirtualShell(total, start, end) {
    const topH = start * EST_HEIGHT;
    const bottomH = Math.max(0, (total - end) * EST_HEIGHT);
    return {
      topSpacer: `<div class="reader-vspacer" id="readerVTop" style="height:${topH}px" aria-hidden="true"></div>`,
      bottomSpacer: `<div class="reader-vspacer" id="readerVBottom" style="height:${bottomH}px" aria-hidden="true"></div>`,
      start,
      end,
    };
  }

  function attachVirtualScroll(opts) {
    const article = document.getElementById("readerArticle");
    if (!article || !opts?.total) return null;
    let start = opts.start || 0;
    let end = opts.end || Math.min(opts.total, BUFFER * 2 + 12);
    let ticking = false;

    const rerender = () => {
      ticking = false;
      const scroller = document.documentElement;
      const range = visibleRange(window.scrollY, window.innerHeight, opts.total, start);
      if (range.start === start && range.end === end) return;
      start = range.start;
      end = range.end;
      opts.onRangeChange?.(start, end);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(rerender);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }

  window.AmpsVirtualScroll = {
    THRESHOLD,
    shouldVirtualize,
    buildVirtualShell,
    attachVirtualScroll,
  };
})();

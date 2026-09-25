/* AMPS Reader — tap any visual line to read from there */
(function () {
  "use strict";

  function splitVisualLines(text) {
    const raw = String(text || "").replace(/<[^>]+>/g, " ");
    const lines = [];
    const blocks = raw.split(/\n+/);
    let offset = 0;
    blocks.forEach(block => {
      const trimmed = block.trim();
      if (!trimmed) {
        offset += block.length + 1;
        return;
      }
      // Sentence spans for tap-to-read only — do not split on ;: (prose / translations)
      const sentences = trimmed.match(/[^.!?।॥]+[.!?।॥]+["'”’)\]]?|[^.!?।॥]+/g) || [trimmed];
      let local = 0;
      sentences.forEach(s => {
        const t = s.trim();
        if (!t) return;
        const start = raw.indexOf(t, offset + local);
        const at = start >= 0 ? start : offset + local;
        lines.push({ text: t, offset: at });
        local = at + t.length - offset;
      });
      offset += block.length + 1;
    });
    if (!lines.length && raw.trim()) {
      lines.push({ text: raw.trim(), offset: 0 });
    }
    return lines;
  }

  function wrapParaLines(paraEl, plainText) {
    const textEl = paraEl?.querySelector(".para-text") || paraEl;
    if (!textEl || textEl.dataset.lineWrapped) return;
    if (textEl.querySelector("mark, .hl-mark, a.fn-ref, .shloka-ref-link")) return;
    // Only annotate shloka/sutra lines. Never rewrite prose with <br> — that
    // breaks normal paragraph flow (sentences must wrap naturally).
    if (
      paraEl?.classList?.contains("shloka-entry")
      || paraEl?.classList?.contains("discourse-shloka-entry")
      || textEl.querySelector(".shloka-line, .shloka-verse-block, .ananda-sutra-block")
    ) {
      wrapShlokaLines(textEl);
    }
  }

  function wrapShlokaLines(textEl) {
    textEl.querySelectorAll(".shloka-line:not(.shloka-meaning)").forEach((el, i) => {
      if (el.dataset.lineWrapped) return;
      el.classList.add("reader-line", "reader-line-shloka");
      el.dataset.lineIdx = String(i);
      el.dataset.lineOffset = "0";
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.title = "Read from this line";
      el.dataset.lineWrapped = "1";
    });
  }

  function bindReaderLines(article, onLineRead) {
    if (!article || article.dataset.lineBound) return;
    article.dataset.lineBound = "1";
    article.addEventListener("click", e => {
      const line = e.target.closest?.(".reader-line");
      if (!line) return;
      const para = line.closest?.("[data-para]");
      if (!para) return;
      const offset = Math.max(0, Number(line.dataset.lineOffset) || 0);
      onLineRead?.({
        paraId: para.dataset.para,
        charOffset: offset,
        lineText: line.textContent?.trim() || "",
      });
    });
    article.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const line = e.target.closest?.(".reader-line");
      if (!line) return;
      e.preventDefault();
      line.click();
    });
  }

  function decorateArticle(article, getParaText) {
    if (!article) return;
    article.querySelectorAll(".reader-para[data-para]").forEach(para => {
      const pid = para.dataset.para;
      const text = getParaText?.(pid) || para.querySelector(".para-text")?.textContent || "";
      wrapParaLines(para, text);
    });
  }

  window.AmpsLineRead = {
    splitVisualLines,
    wrapParaLines,
    decorateArticle,
    bindReaderLines,
  };
})();

/* Presentation Builder — minimal text PDF export (no external deps) */
(function () {
  "use strict";

  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN = 54;
  const MAX_PAGES = 25;
  const MAX_DISCOURSE_PAGES = 25;

  function escPdf(s) {
    return String(s || "")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)")
      .replace(/[^\x20-\x7E\n\r\t]/g, "?");
  }

  function wrapText(text, maxChars) {
    const words = String(text || "").replace(/\s+/g, " ").trim().split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
      const next = line ? line + " " + w : w;
      if (next.length > maxChars) {
        if (line) lines.push(line);
        line = w.length > maxChars ? w.slice(0, maxChars - 1) + "…" : w;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  function buildPageStreams(slides, opts) {
    const discourse = opts.mode === "discourse";
    const fontSize = discourse
      ? Math.min(18, Math.max(11, opts.fontSize || 14))
      : Math.min(36, Math.max(24, opts.fontSize || 28));
    const lineH = fontSize * 1.45;
    const bodyMax = Math.floor((PAGE_W - MARGIN * 2) / (fontSize * 0.52));
    const maxPages = discourse ? (opts.maxPages || MAX_DISCOURSE_PAGES) : MAX_PAGES;
    const pages = [];
    const slideLimit = discourse ? slides.length : Math.min(slides.length, MAX_PAGES);

    for (let idx = 0; idx < slideLimit && pages.length < maxPages; idx++) {
      const slide = slides[idx];
      const bulletLines = Array.isArray(slide.contentBullets) && slide.contentBullets.length
        ? slide.contentBullets.map(b => "• " + b)
        : null;
      const bodyLines = bulletLines || wrapText(slide.contentText, bodyMax);
      let lineIdx = 0;
      let contPage = 0;

      while (lineIdx < bodyLines.length && pages.length < maxPages) {
        contPage += 1;
        let y = PAGE_H - MARGIN - 20;
        const cmds = ["BT", "/F1 " + fontSize + " Tf", "0 0 0 rg"];

        function line(text, size, x) {
          const fs = size || fontSize;
          if (y < MARGIN + 40) return false;
          cmds.push("/F1 " + fs + " Tf", "0 0 0 rg");
          cmds.push("1 0 0 1 " + (x || MARGIN) + " " + y + " Tm");
          cmds.push("(" + escPdf(text) + ") Tj");
          y -= lineH * (fs / fontSize);
          return true;
        }

        if (contPage === 1 && opts.includePageRefs !== false) {
          if (slide.bookTitle) line(slide.bookTitle, 14, MARGIN);
          if (slide.chapterTitle) line(slide.chapterTitle, 12, MARGIN);
          y -= 8;
        }

        while (lineIdx < bodyLines.length) {
          if (!line(bodyLines[lineIdx], fontSize, MARGIN)) break;
          lineIdx += 1;
        }

        if (opts.includePageRefs !== false && slide.pageReference && lineIdx >= bodyLines.length) {
          y = MARGIN + 24;
          cmds.push("/F1 11 Tf", "0.4 0.4 0.4 rg");
          cmds.push("1 0 0 1 " + MARGIN + " " + y + " Tm");
          cmds.push("(" + escPdf(slide.pageReference) + ") Tj");
        }

        y = MARGIN + 8;
        cmds.push("/F1 10 Tf", "0.5 0.5 0.5 rg");
        cmds.push("1 0 0 1 " + (PAGE_W - MARGIN - 80) + " " + y + " Tm");
        const footer = discourse && slide.paraNum
          ? "Paragraph " + slide.paraNum + " of " + slide.paraTotal
          : "Slide " + (idx + 1) + " of " + slides.length;
        cmds.push("(" + escPdf(footer) + ") Tj");

        cmds.push("ET");
        pages.push(cmds.join("\n"));
      }
    }

    return pages;
  }

  function assemblePdf(pageStreams) {
    const objs = [];
    let n = 1;
    const catalogId = n++;
    const pagesId = n++;
    const fontId = n++;
    const pageIds = [];

    objs[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

    pageStreams.forEach(stream => {
      const contentId = n++;
      const pageId = n++;
      pageIds.push(pageId);
      objs[contentId] = "<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream";
      objs[pageId] = "<< /Type /Page /Parent " + pagesId + " 0 R /MediaBox [0 0 " + PAGE_W + " " + PAGE_H + "] /Contents " + contentId + " 0 R /Resources << /Font << /F1 " + fontId + " 0 R >> >> >>";
    });

    objs[pagesId] = "<< /Type /Pages /Kids [" + pageIds.map(id => id + " 0 R").join(" ") + "] /Count " + pageIds.length + " >>";
    objs[catalogId] = "<< /Type /Catalog /Pages " + pagesId + " 0 R >>";

    let body = "%PDF-1.4\n";
    const offsets = [0];
    for (let i = 1; i < objs.length; i++) {
      if (!objs[i]) continue;
      offsets[i] = body.length;
      body += i + " 0 obj\n" + objs[i] + "\nendobj\n";
    }
    const xref = body.length;
    body += "xref\n0 " + objs.length + "\n";
    body += "0000000000 65535 f \n";
    for (let i = 1; i < objs.length; i++) {
      if (!objs[i]) body += "0000000000 65535 f \n";
      else body += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    }
    body += "trailer\n<< /Size " + objs.length + " /Root " + catalogId + " 0 R >>\n";
    body += "startxref\n" + xref + "\n%%EOF";
    return body;
  }

  function exportPdf(slides, opts) {
    const limited = slides.slice(0, MAX_PAGES);
    const streams = buildPageStreams(limited, opts || {});
    const pdf = assemblePdf(streams);
    return new Blob([pdf], { type: "application/pdf" });
  }

  function exportPdfBlobUrl(slides, opts) {
    const blob = exportPdf(slides, opts);
    return URL.createObjectURL(blob);
  }

  function stripHtml(s) {
    return String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  function exportDiscourseChapter(book, chapter, opts) {
    // Public product: discourse bulk export is capped like slide PDF (no silent chapter dump).
    const paras = ((chapter && chapter.paragraphs) || []).slice(0, MAX_DISCOURSE_PAGES);
    if (!paras.length) {
      return exportPdf([{
        bookTitle: book?.title || "",
        chapterTitle: chapter?.title || "",
        contentText: "(No text in this discourse)",
      }], { mode: "discourse", fontSize: 14, ...(opts || {}) });
    }
    const slides = paras.map((p, i) => ({
      bookTitle: i === 0 ? (book?.title || "") : "",
      chapterTitle: i === 0 ? (chapter?.title || "") : "",
      contentText: stripHtml(p.text).slice(0, 400),
      pageReference: chapter?.datePlace && i === paras.length - 1 ? chapter.datePlace : "",
      paraNum: i + 1,
      paraTotal: paras.length,
    }));
    const streams = buildPageStreams(slides, {
      mode: "discourse",
      fontSize: 14,
      includePageRefs: true,
      maxPages: MAX_DISCOURSE_PAGES,
      ...(opts || {}),
    });
    return new Blob([assemblePdf(streams)], { type: "application/pdf" });
  }

  window.AmpsPresentationPdf = {
    exportPdf,
    exportPdfBlobUrl,
    exportDiscourseChapter,
    MAX_PAGES,
    MAX_DISCOURSE_PAGES,
    wrapText,
  };
})();

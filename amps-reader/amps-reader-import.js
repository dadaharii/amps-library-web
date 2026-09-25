/* AMPS Reader — AMPSBOOK, EPUB & PDF import */
(function (global) {
  "use strict";

  const AMPSBOOK_SCHEMA_RE = /\/schema\/ampsbook\/v1$/i;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (typeof document === "undefined") return reject(new Error("Browser document is not available"));
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function cleanText(value) {
    return String(value == null ? "" : value)
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
  }

  function slug(value) {
    const out = String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return out || "book";
  }

  function isAmpsBookObject(doc) {
    if (!doc || typeof doc !== "object") return false;
    if (String(doc.format || "").toUpperCase() === "AMPSBOOK") return true;
    if (AMPSBOOK_SCHEMA_RE.test(String(doc.$schema || ""))) return true;
    return false;
  }

  function validateAmpsBook(doc) {
    if (!isAmpsBookObject(doc)) throw new Error("Not an AMPSBOOK v1 document");
    if (!Array.isArray(doc.chapters) || !doc.chapters.length) {
      throw new Error("AMPSBOOK has no chapters");
    }
    const title = cleanText(doc.metadata?.title || doc.title);
    if (!title) throw new Error("AMPSBOOK title is missing");
    return true;
  }

  function semanticBlockParagraphs(block, chapterId, blockIndex, startIndex) {
    if (!block || typeof block !== "object") return [];
    const role = String(block.role || "body");
    const type = String(block.type || "paragraph");
    if (role === "chapter-title" || type === "heading") return [];
    if (role === "chapter-date" || type === "date") return [];

    const raw = cleanText(block.text);
    if (!raw) return [];
    const lines = raw
      .split(/\n+/)
      .map(s => s.replace(/^\t+/, "").trim())
      .filter(Boolean);
    const chunks = lines.length ? lines : [raw];
    return chunks.map((text, i) => ({
      id: `${chapterId}-p${startIndex + i}`,
      text,
      summary: [text.slice(0, 140)],
      sourceBlockOrder: block.order ?? blockIndex + 1,
      sourceRole: role,
      sourceType: type,
      align: block.align || "justify",
      fontSizePt: Number(block.font_size_pt || block.fontSizePt || 0) || null,
      leftIndentTwips: Number(block.left_indent_twips || 0) || 0,
      firstIndentTwips: Number(block.first_indent_twips || 0) || 0,
      rightIndentTwips: Number(block.right_indent_twips || 0) || 0,
    }));
  }

  function normalizeAmpsBook(doc) {
    validateAmpsBook(doc);
    const metadata = doc.metadata || {};
    const title = cleanText(metadata.title || doc.title);
    const sourceTitle = cleanText(metadata.source_title || metadata.sourceTitle || "");
    const originalTitle = cleanText(metadata.original_title || metadata.originalTitle || sourceTitle);
    const series = cleanText(metadata.series || "");
    const volume = metadata.volume == null ? null : cleanText(metadata.volume);
    const partLabel = cleanText(metadata.part_label || metadata.partLabel || "");
    const sourceSha = cleanText(doc.source?.sha256 || doc.integration?.source_sha256 || "");
    const id = `imported-ampsbook-${sourceSha ? sourceSha.slice(0, 16) : slug(title)}`;

    const chapters = doc.chapters.map((sourceChapter, chapterIndex) => {
      const chapterId = cleanText(sourceChapter.id) || `ch${chapterIndex + 1}`;
      const blocks = Array.isArray(sourceChapter.blocks)
        ? sourceChapter.blocks
        : Array.isArray(sourceChapter.paragraphs)
          ? sourceChapter.paragraphs.map((p, i) => ({
              order: i + 1,
              type: p.type || "paragraph",
              role: p.role || "body",
              text: p.text,
              align: p.align,
              font_size_pt: p.fontSizePt,
            }))
          : [];

      let datePlace = cleanText(sourceChapter.datePlace || sourceChapter.date_place || "");
      if (!datePlace) {
        const dateBlock = blocks.find(b => b?.role === "chapter-date" || b?.type === "date");
        datePlace = cleanText(dateBlock?.text || "");
      }

      const paragraphs = [];
      blocks.forEach((block, blockIndex) => {
        paragraphs.push(...semanticBlockParagraphs(block, chapterId, blockIndex, paragraphs.length + 1));
      });
      if (!paragraphs.length && Array.isArray(sourceChapter.paragraphs)) {
        sourceChapter.paragraphs.forEach((p, i) => {
          const text = cleanText(p?.text);
          if (!text) return;
          paragraphs.push({
            id: p.id || `${chapterId}-p${i + 1}`,
            text,
            summary: Array.isArray(p.summary) ? p.summary : [text.slice(0, 140)],
          });
        });
      }

      return {
        id: chapterId,
        title: cleanText(sourceChapter.title || sourceChapter.toc_title) || `Chapter ${chapterIndex + 1}`,
        chapterNum: String(sourceChapter.order ?? chapterIndex + 1),
        paragraphs,
        footnotes: [],
        editorialNotes: [],
        datePlace: datePlace || null,
        printedStartPage: sourceChapter.printed_start_page ?? sourceChapter.printedStartPage ?? null,
        sourceFontSizePt: Number(sourceChapter.source_font_size_pt || sourceChapter.sourceFontSizePt || 0) || null,
      };
    }).filter(ch => ch.paragraphs.length || ch.title);

    return {
      id,
      title,
      subtitle: cleanText(metadata.subtitle || originalTitle || "Imported AMPSBOOK"),
      originalTitle: originalTitle || null,
      sourceTitle: sourceTitle || null,
      series: series || null,
      volume,
      partLabel: partLabel || null,
      author: cleanText(metadata.author || ""),
      language: cleanText(metadata.language || "hi-Deva"),
      imported: true,
      format: "ampsbook",
      formatVersion: cleanText(doc.format_version || doc.version || "1.0"),
      chapters,
      sections: [],
      points: [],
      glossary: [],
      searchKeywords: [title, originalTitle, series, partLabel, "AMPSBOOK", "PageMaker", "Unicode"].filter(Boolean),
      ampsbookMetadata: {
        schema: doc.$schema || null,
        source: doc.source || null,
        integration: doc.integration || null,
        metadata,
        readingModel: doc.reading_model || doc.readingModel || null,
        printModel: doc.print_model || doc.printModel || null,
        toc: doc.toc || null,
      },
    };
  }

  function parseAmpsBookJsonText(text) {
    let doc;
    try {
      doc = JSON.parse(text);
    } catch (err) {
      throw new Error("Invalid AMPSBOOK JSON: " + err.message);
    }
    return normalizeAmpsBook(doc);
  }

  async function parseAmpsBookZip(file) {
    await loadScript("../vendor/jszip.min.js");
    const JSZip = global.JSZip;
    if (!JSZip) throw new Error("JSZip not loaded");
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    let entryName = "book.json";
    const manifestEntry = zip.file("manifest.json");
    if (manifestEntry) {
      try {
        const manifest = JSON.parse(await manifestEntry.async("string"));
        if (manifest.entry) entryName = String(manifest.entry);
      } catch (_) { /* book.json fallback */ }
    }
    const entry = zip.file(entryName) || zip.file("book.json");
    if (!entry) throw new Error("AMPSBOOK package is missing book.json");
    return parseAmpsBookJsonText(await entry.async("string"));
  }

  async function parseAmpsBookFile(file) {
    const name = String(file?.name || "").toLowerCase();
    if (name.endsWith(".zip")) return parseAmpsBookZip(file);
    if (typeof file.text === "function") return parseAmpsBookJsonText(await file.text());
    return parseAmpsBookJsonText(new TextDecoder("utf-8").decode(await file.arrayBuffer()));
  }

  async function parsePdf(file) {
    await loadScript("../vendor/pdf.min.js");
    const pdfjsLib = global.pdfjsLib;
    if (!pdfjsLib) throw new Error("PDF.js not loaded");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "../vendor/pdf.worker.min.js";
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const chapters = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(it => it.str).join(" ").replace(/\s+/g, " ").trim();
      if (text) {
        chapters.push({
          id: "p" + i,
          title: "Page " + i,
          chapterNum: String(i),
          paragraphs: [{ id: "p" + i + "-1", text, summary: [text.slice(0, 120)] }],
          footnotes: [],
          editorialNotes: [],
        });
      }
    }
    return {
      id: "imported-pdf-" + Date.now().toString(36),
      title: file.name.replace(/\.pdf$/i, ""),
      subtitle: "Imported PDF",
      imported: true,
      format: "pdf",
      chapters,
      sections: [],
      points: [],
      glossary: [],
    };
  }

  async function parseEpub(file) {
    await loadScript("../vendor/jszip.min.js");
    const JSZip = global.JSZip;
    if (!JSZip) throw new Error("JSZip not loaded");
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const chapters = [];
    const spine = [];
    zip.forEach((path) => {
      if (/\.(xhtml|html|htm)$/i.test(path) && !/nav|toc|cover/i.test(path)) spine.push(path);
    });
    spine.sort();
    let ci = 0;
    for (const path of spine.slice(0, 80)) {
      const html = await zip.file(path).async("string");
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/\s+/g, " ")
        .trim();
      if (text.length < 80) continue;
      ci += 1;
      const parts = text.match(/[^.!?]+[.!?]+/g) || [text];
      chapters.push({
        id: "ch" + ci,
        title: path.split("/").pop().replace(/\.\w+$/, "") || "Chapter " + ci,
        chapterNum: String(ci),
        paragraphs: parts.filter(p => p.trim().length > 40).map((p, i) => ({
          id: "ch" + ci + "-p" + (i + 1),
          text: p.trim(),
          summary: [p.trim().slice(0, 100)],
        })),
        footnotes: [],
        editorialNotes: [],
      });
    }
    if (!chapters.length) throw new Error("No readable content in EPUB");
    return {
      id: "imported-epub-" + Date.now().toString(36),
      title: file.name.replace(/\.epub$/i, ""),
      subtitle: "Imported EPUB",
      imported: true,
      format: "epub",
      chapters,
      sections: [],
      points: [],
      glossary: [],
    };
  }

  async function importFile(file) {
    const name = String(file?.name || "").toLowerCase();
    if (name.endsWith(".ampsbook.zip") || name.endsWith(".ampsbook")) return parseAmpsBookFile(file);
    if (name.endsWith(".ampsbook.json")) return parseAmpsBookFile(file);
    if (name.endsWith(".pdf")) return parsePdf(file);
    if (name.endsWith(".epub")) return parseEpub(file);
    throw new Error("Supported formats: AMPSBOOK, EPUB, PDF");
  }

  function patchImportPicker() {
    if (typeof document === "undefined") return;
    const input = document.getElementById("importFile");
    if (!input || !String(input.accept || "").includes(".epub")) return;
    input.accept = ".ampsbook.zip,.ampsbook,.ampsbook.json,.epub,.pdf";
    const label = input.closest("label");
    if (!label) return;
    for (const node of label.childNodes) {
      if (node.nodeType === 3 && /Choose EPUB or PDF/i.test(node.nodeValue || "")) {
        node.nodeValue = "Choose AMPSBOOK, EPUB or PDF";
      }
    }
  }

  function installImportUiCompatibility() {
    if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
    const start = () => {
      patchImportPicker();
      new MutationObserver(patchImportPicker).observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start, { once: true });
  }

  global.AmpsImport = {
    importFile,
    parsePdf,
    parseEpub,
    parseAmpsBookFile,
    parseAmpsBookZip,
    parseAmpsBookJsonText,
    normalizeAmpsBook,
    validateAmpsBook,
    isAmpsBookObject,
  };
  installImportUiCompatibility();
})(typeof window !== "undefined" ? window : globalThis);

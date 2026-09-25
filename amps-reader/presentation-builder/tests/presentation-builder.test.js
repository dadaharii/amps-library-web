#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

function loadModule(file, ctx) {
  const code = fs.readFileSync(path.join(ROOT, file), "utf8");
  vm.runInNewContext(code, ctx, { filename: file });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}

function run() {
  if (typeof Blob === "undefined") {
    global.Blob = class {
      constructor(parts, opts) {
        this._buf = Buffer.concat(parts.map(p => (Buffer.isBuffer(p) ? p : Buffer.from(p))));
        this.size = this._buf.length;
        this.type = opts?.type || "";
      }
    };
  }
  const ctx = { window: {}, console, Blob: global.Blob };
  loadModule("slide-content.js", ctx);
  loadModule("presentation-store.js", ctx);
  loadModule("services/pdf-export.js", ctx);
  loadModule("integration/search-integration.js", ctx);

  const Store = ctx.window.AmpsPresentationStore;
  const Pdf = ctx.window.AmpsPresentationPdf;
  const Search = ctx.window.AmpsPresentationSearch;

  const state = { settings: {} };

  const Content = ctx.window.AmpsPresentationContent;
  const longText = "The social cycle moves constantly. Workers struggle for rights. Sadvipras guide society toward balance and justice.";
  const prepared = Content.preparePassageContent({
    text: longText,
    summary: ["The social cycle moves constantly.", "Sadvipras guide society toward balance and justice."],
  });
  assert(prepared.contentBullets.length >= 2, "slide bullets");
  assert(prepared.presenterNotes.includes("social cycle"), "presenter excerpt keeps meaning");
  assert(prepared.presenterNotes.length <= longText.length, "presenter notes not longer than source");
  assert(!prepared.presenterNotes.includes("Administrator Studio"), "no studio leak");
  assert(prepared.contentBullets.every(b => b.length <= 100), "short slide bullets");
  assert(prepared.contentBullets.join(" ").length < longText.length, "bullets shorter than detail");

  const col = Store.createCollection(state, "Test class", [
    {
      bookId: "b1", bookTitle: "Book One", chapterId: "ch1", chapterTitle: "Ch 1",
      paraId: "ch1-p1", text: longText, summary: prepared.summary,
      contentBullets: prepared.contentBullets, contentText: prepared.contentText,
      presenterNotes: prepared.presenterNotes, pageRef: "Ch 1 · ¶1",
    },
    {
      bookId: "b2", bookTitle: "Book Two", chapterId: "ch2", chapterTitle: "Ch 2",
      paraId: "ch2-p1", text: "Second passage.", pageRef: "Ch 2 · ¶2",
    },
  ]);
  assert(col.items.length === 2, "collection items");

  Store.moveItem(state, col.id, 1, -1);
  assert(state.presentationBuilder.collections[0].items[0].bookId === "b2", "reorder");

  const { presentation, slides } = Store.createPresentation(state, col.id, {
    title: "Test class",
    fontSize: 28,
  });
  assert(slides.length === 2, "slide count");
  const bulletSlide = slides.find(s => (s.presenterNotes || "").includes("social cycle"));
  assert(bulletSlide?.contentBullets?.length >= 2, "slide has bullets");
  assert(bulletSlide?.presenterNotes?.includes("social cycle"), "slide presenter notes excerpt");
  assert(presentation.title === "Test class", "presentation title");

  const { sessionToken } = Store.startPresentation(state, presentation.id);
  assert(sessionToken, "session token");
  Store.updateSyncState(state, presentation.id, sessionToken, 1);
  assert(Store.getSyncState(state, presentation.id, sessionToken).currentSlide === 1, "sync slide");

  const blob = Pdf.exportPdf(slides, { fontSize: 28, includePageRefs: true });
  assert(blob instanceof Blob, "pdf blob");
  assert(blob.size > 500, "pdf size");

  const wrapped = Pdf.wrapText("word ".repeat(40).trim(), 20);
  assert(wrapped.length > 1, "wrap text");

  assert(Search.matchesSubject("philosophy", { title: "Idea and Ideology", series: "" }, () => ["philosophy"]), "subject filter");
  assert(Search.hitKey({ bookId: "a", paraId: "p1" }) === "a:p1", "hit key");

  const sharedText = "Philosophy is the rational study of cosmic existence and human conduct across all spheres of life.";
  const bookById = id => ({
    "ss-01": { seriesKey: "subhasita-samgraha", seriesOrder: 1 },
    "ss-11": { seriesKey: "subhasita-samgraha", seriesOrder: 11 },
    "other": { seriesKey: "", seriesOrder: 99 },
  }[id]);
  const dupRows = [
    { key: "ss-11:p1", bookId: "ss-11", text: sharedText },
    { key: "ss-01:p1", bookId: "ss-01", text: sharedText },
    { key: "other:p1", bookId: "other", text: "Unique passage about sadhana practice and meditation." },
  ];
  const deduped = Search.dedupePassageRows(dupRows, bookById);
  assert(deduped.rows.length === 2, "dedupe count");
  assert(deduped.skipped === 1, "dedupe skipped");
  assert(deduped.rows[0].bookId === "ss-01", "prefer earlier series part");

  const ser = Store.serialize(state);
  const state2 = { settings: {} };
  Store.hydrate(state2, ser);
  assert(state2.presentationBuilder.collections.length === 1, "hydrate");

  console.log("presentation-builder tests: OK");
}

try {
  run();
} catch (e) {
  console.error("presentation-builder tests FAILED:", e.message);
  process.exit(1);
}

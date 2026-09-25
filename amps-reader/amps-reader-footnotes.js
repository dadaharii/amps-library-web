/* AMPS Reader — inline footnote refs ↔ footnote panel (all books) */
(function () {
  "use strict";

  function footnoteNum(f, index) {
    if (f && f.num != null) return f.num;
    const m = String(f?.text || "").match(/^\(\s*(\d+)\s*\)/);
    return m ? parseInt(m[1], 10) : index + 1;
  }

  function footnoteIndex(ch, num) {
    const n = parseInt(num, 10);
    const list = ch?.footnotes || [];
    let idx = list.findIndex((f, i) => footnoteNum(f, i) === n);
    if (idx < 0 && n >= 1 && n <= list.length) idx = n - 1;
    return idx;
  }

  function isListMarker(text, matchIndex) {
    return matchIndex < 8 && /^\s*\(\s*\d+\s*\)/.test(String(text || ""));
  }

  function linkFootnoteRefsCore(raw, ch, escPlain, escMatch) {
    const list = ch?.footnotes || [];
    if (!list.length) return escPlain(raw);
    const text = String(raw || "");
    const re = /\(\s*(\d+)\s*\)/g;
    let out = "";
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const n = parseInt(m[1], 10);
      const idx = footnoteIndex(ch, n);
      if (idx < 0 || isListMarker(text, m.index)) continue;
      out += escPlain(text.slice(last, m.index));
      out += `<button type="button" class="fn-ref" data-fn="${idx}" aria-label="Footnote ${n}">${escMatch(m[0])}</button>`;
      last = m.index + m[0].length;
    }
    out += escPlain(text.slice(last));
    return out;
  }

  /** Plain paragraph text → HTML with footnote buttons. */
  function linkFootnoteRefs(text, ch, esc) {
    return linkFootnoteRefsCore(text, ch, esc, esc);
  }

  /** Already-escaped HTML (e.g. after highlights) — link refs without re-escaping. */
  function linkFootnoteRefsHtml(html, ch) {
    return linkFootnoteRefsCore(html, ch, s => s, s => s);
  }

  function footnoteDisplayText(f) {
    return String(f?.text || "").replace(/^\(\s*\d+\s*\)\s*/, "").trim();
  }

  function renderFootnotePanel(ch, esc, showByDefault) {
    const list = ch?.footnotes || [];
    if (!list.length) return "";
    const hidden = showByDefault ? "" : " hidden";
    let html = `<aside class="footnote-panel${hidden}" id="footnotePanel"><h4>Footnotes</h4><ol class="footnote-list">`;
    list.forEach((f, i) => {
      const n = footnoteNum(f, i);
      const back = f.refParaId
        ? ` <button type="button" class="fn-back" data-fn-back="${esc(f.refParaId)}" title="Back to reference">↑ ref</button>`
        : "";
      html += `<li id="fn-item-${i}" class="footnote-item" data-fn-num="${n}">${esc(footnoteDisplayText(f))}${back}</li>`;
    });
    html += `</ol></aside>`;
    return html;
  }

  function scrollToFootnote(index) {
    const panel = document.getElementById("footnotePanel");
    if (panel) panel.classList.remove("hidden");
    const li = document.getElementById(`fn-item-${index}`) || panel?.querySelectorAll(".footnote-item")[index];
    if (!li) return;
    li.classList.add("footnote-highlight");
    li.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => li.classList.remove("footnote-highlight"), 2500);
  }

  function scrollToFootnoteRef(paraId) {
    const el = document.getElementById(paraId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("footnote-ref-highlight");
    setTimeout(() => el.classList.remove("footnote-ref-highlight"), 2500);
  }

  function attachFootnoteRefParaIds(ch) {
    if (!ch?.footnotes?.length) return ch;
    const re = /\(\s*(\d+)\s*\)/g;
    ch.paragraphs?.forEach(p => {
      const raw = String(p.text || "");
      let m;
      while ((m = re.exec(raw)) !== null) {
        const n = parseInt(m[1], 10);
        const idx = footnoteIndex(ch, n);
        if (idx < 0 || isListMarker(raw, m.index)) continue;
        if (ch.footnotes[idx] && !ch.footnotes[idx].refParaId) {
          ch.footnotes[idx].refParaId = p.id;
        }
      }
    });
    return ch;
  }

  window.AmpsFootnotes = {
    linkFootnoteRefs,
    linkFootnoteRefsHtml,
    renderFootnotePanel,
    scrollToFootnote,
    scrollToFootnoteRef,
    attachFootnoteRefParaIds,
    footnoteIndex,
  };
})();

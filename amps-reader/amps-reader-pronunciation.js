/* AMPS Reader — pronunciation overrides + review screen */
(function () {
  "use strict";

  const STORAGE = "amps-pronunciation-overrides-v1";
  const REV_STORAGE = "amps-pronunciation-rev-v1";
  let api = null;

  function esc(s) {
    return api?.esc ? api.esc(s) : String(s ?? "");
  }

  function install(appApi) {
    api = appApi;
  }

  function normalizeRoman(s) {
    return String(s || "").trim();
  }

  function list() {
    try {
      const rows = JSON.parse(localStorage.getItem(STORAGE) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  function save(rows) {
    localStorage.setItem(STORAGE, JSON.stringify(rows || []));
    localStorage.setItem(REV_STORAGE, String(Date.now()));
    window.AmpsAudio?.resetUserPronunciationCache?.();
  }

  function upsert(roman, devanagari, meta) {
    const r = normalizeRoman(roman);
    const d = String(devanagari || "").trim();
    if (!r || !d) return { ok: false, error: "Enter both Roman word and Devanagari pronunciation." };
    const rows = list().filter(x => String(x.roman || "").toLowerCase() !== r.toLowerCase());
    rows.unshift({
      id: meta?.id || ("pron-" + Date.now().toString(36)),
      roman: r,
      devanagari: d,
      speech: String(meta?.speech || "").trim(),
      note: String(meta?.note || "").trim(),
      source: String(meta?.source || "").trim(),
      updated: Date.now(),
    });
    save(rows);
    return { ok: true };
  }

  function removeByRoman(roman) {
    const key = String(roman || "").toLowerCase();
    save(list().filter(r => String(r.roman || "").toLowerCase() !== key));
  }

  function search(query) {
    const q = String(query || "").trim().toLowerCase();
    const rows = list();
    if (!q) return rows;
    return rows.filter(r =>
      String(r.roman || "").toLowerCase().includes(q) ||
      String(r.devanagari || "").includes(q) ||
      String(r.note || "").toLowerCase().includes(q)
    );
  }

  function guessRomanFromSelection(text) {
    const t = String(text || "").trim();
    if (!t) return "";
    const word = t.split(/\s+/).find(w => /[A-Za-z]/.test(w));
    return word ? word.replace(/^[^A-Za-z]+|[^A-Za-z'’\-]+$/g, "") : t.slice(0, 48);
  }

  function showReportModal(opts) {
    const root = document.getElementById("modalRoot");
    if (!root) return;
    const roman = normalizeRoman(opts?.roman || "");
    const dev = String(opts?.devanagari || "").trim();
    const speech = String(opts?.speech || "").trim();
    const source = String(opts?.source || "").trim();
    root.innerHTML = `
      <div class="modal-backdrop" id="pronReportBd">
        <div class="modal pronunciation-modal">
          <h3>Report pronunciation</h3>
          <p class="muted">Save how this word should be spoken. Local corrections override the built-in dictionary.</p>
          ${source ? `<p class="pron-source-snippet">From: ${esc(source.slice(0, 120))}${source.length > 120 ? "…" : ""}</p>` : ""}
          <label>Roman word<input type="text" id="pronReportRoman" value="${esc(roman)}" /></label>
          <label>Read as Devanagari<input type="text" id="pronReportDev" value="${esc(dev)}" placeholder="चित्त" /></label>
          <label>Speak as (My Voice phonetic)<input type="text" id="pronReportSpeech" value="${esc(speech)}" placeholder="saa-dhaa-naa" /></label>
          <label>Note (optional)<input type="text" id="pronReportNote" placeholder="e.g. spiritual term" /></label>
          <p id="pronReportMsg" class="license-msg hidden"></p>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" id="pronReportCancel">Cancel</button>
            <button type="button" class="btn btn-gold" id="pronReportSave">Save correction</button>
          </div>
        </div>
      </div>`;
    const close = () => { root.innerHTML = ""; };
    document.getElementById("pronReportCancel")?.addEventListener("click", close);
    document.getElementById("pronReportBd")?.addEventListener("click", e => {
      if (e.target.id === "pronReportBd") close();
    });
    document.getElementById("pronReportSave")?.addEventListener("click", () => {
      const msg = document.getElementById("pronReportMsg");
      const res = upsert(
        document.getElementById("pronReportRoman")?.value,
        document.getElementById("pronReportDev")?.value,
        {
          speech: document.getElementById("pronReportSpeech")?.value,
          note: document.getElementById("pronReportNote")?.value,
          source,
        }
      );
      if (!res.ok) {
        if (msg) {
          msg.textContent = res.error;
          msg.className = "license-msg license-msg-err";
          msg.classList.remove("hidden");
        }
        return;
      }
      close();
      opts?.onSaved?.();
    });
  }

  function renderPage() {
    const rows = list();
    const fallbackRuleRows = [
      ["Roman set", "Saṁskrta can be represented with the 29-letter Roman set; f, q, qh, z are not Saṁskrta letters."],
      ["a", "aw/o sound depending on position; final pronounced a is generally like o in open."],
      ["á, i/ii, u/ú", "a as in father; i as in folio; u as in lute."],
      ["r, rr, lr, lrr", "r is ri/rea in Saṁskrta positions; rr/lr/lrr are uncommon in Bengali usage."],
      ["e, ae, o, ao", "e as in cachet or sometimes apple; ae like oy; o as in open; ao begins in o and ends in u."],
      ["ḿ, ṋ", "ḿ is nasal like ng; ṋ nasalizes the preceding vowel unless used before class consonants."],
      ["h", "After a vowel before consonant it is silent in Bengali; otherwise h as in half."],
      ["c, kh, gh, ch, jh", "c is unaspirated ch; aspirated consonants expel breath."],
      ["t́, d́, ń", "Cerebral t/d/n; ń is often read as dental n in Bengali."],
      ["d́a/d́ha", "In the middle or end of a word, d́a and d́ha are read as ŕa and ŕha."],
      ["y", "At the beginning of a word y is read like j. In the middle or at the end of a word it remains y (य), not j."],
      ["v", "At the beginning of a word, like v in victory; in the middle, like w in awaken."],
      ["s, ś, sh", "Usually sh; directly before r, t, or th they are read as plain s."],
      ["kś", "Read as kh."],
      ["jiṋa / jiṋá", "Read like gya/ga; after a vowel the g sound is doubled."],
      ["ghaiṋ", "Read as घञ्."],
      ["Máyávádins", "Read as मायावादिनस् (mayavadins)."],
    ];
    const ruleRows = window.RomanSamskrtaLib?.ROMAN_SAMSKRTA_RULES || fallbackRuleRows;
    const body = `
      <section class="hero hero-compact">
        <h1>Pronunciation corrections</h1>
        <p class="hero-sub">${rows.length} local correction${rows.length === 1 ? "" : "s"}. These train both Devanagari conversion and My Voice phonetic pronunciation.</p>
      </section>
      <section class="modern-card pron-test-card">
        <h2>Roman Saṁskrta tester</h2>
        <p class="muted">Enter Roman Saṁskrta to check script conversion and My Voice phonetic speech. Use “Speak as” corrections such as saa-dhaa-naa, gya, gyaa.</p>
        <label>Roman Saṁskrta<input type="text" id="pronRuleInput" value="Saḿskrta" autocomplete="off" /></label>
        <div class="pron-test-output"><small>Devanagari</small><strong id="pronRuleDev">संस्कृत</strong></div>
        <div class="pron-test-output"><small>Speech form</small><strong id="pronRuleSpeech">sangskrta</strong></div>
        <button type="button" class="btn btn-ghost btn-sm" id="btnPronRuleSpeak">Play pronunciation</button>
      </section>
      <details class="modern-card" open>
        <summary><strong>Roman Saṁskrta Final pronunciation rules</strong></summary>
        <div class="pron-rule-list">
          ${ruleRows.map(r => `<div class="queue-row"><span><strong>${esc(r[0])}</strong><small>${esc(r[1])}</small></span></div>`).join("")}
        </div>
      </details>
      <div class="pron-review-toolbar">
        <input type="search" id="pronSearch" class="pron-search" placeholder="Search Roman, Devanagari, notes…" />
        <button type="button" class="btn btn-gold btn-sm" id="btnPronAdd">Add correction</button>
      </div>
      <div id="pronList" class="pron-list"></div>
      <p class="muted pron-foot">Tip: while reading, select a word and tap 🗣 in the highlight bar to report pronunciation.</p>`;
    api.renderShell(body, {
      title: "Pronunciation",
      tab: "more",
      bind: () => {
        const updateRuleTest = () => {
          const input = document.getElementById("pronRuleInput")?.value || "";
          const lib = window.RomanSamskrtaLib;
          const audio = window.AmpsAudio;
          let dev = "";
          try {
            dev = lib?.transliterate?.(
              input, "roman-custom", { acceptScholarlyRomanInput: true }
            )?.devanagari || "";
          } catch (_) { /* leave blank */ }
          const readerDev = audio?.applyAmpsPronunciation?.(input, new Map()) || input;
          if (readerDev !== input && /[\u0900-\u097F]/.test(readerDev)) dev = readerDev;
          const speech = audio?.applyAmpsSingleVoicePronunciation?.(input, new Map())
            || input.split(/(\s+)/).map(part => /[\p{L}\p{M}]/u.test(part)
              ? (lib?.pronounceRomanSamskrtaWord?.(part) || part)
              : part).join("");
          const devEl = document.getElementById("pronRuleDev");
          const speechEl = document.getElementById("pronRuleSpeech");
          if (devEl) devEl.textContent = dev || "—";
          if (speechEl) speechEl.textContent = speech || "—";
          return speech;
        };
        document.getElementById("pronRuleInput")?.addEventListener("input", updateRuleTest);
        document.getElementById("btnPronRuleSpeak")?.addEventListener("click", () => {
          const speech = updateRuleTest();
          if (!speech.trim()) return;
          window.AmpsAudio?.speakSegmentList?.(
            [{ text: speech }], 0.85, "in-en-female", "normal", { readingStyle: "normal" }
          );
        });
        updateRuleTest();
        const renderList = () => {
          const q = document.getElementById("pronSearch")?.value || "";
          const filtered = search(q);
          const el = document.getElementById("pronList");
          if (!el) return;
          if (!filtered.length) {
            el.innerHTML = `<div class="modern-card"><p class="muted">${q ? "No matches." : "No corrections yet."}</p></div>`;
            return;
          }
          el.innerHTML = filtered.map(row => `
            <article class="pron-card" data-id="${esc(row.id || row.roman)}">
              <div class="pron-card-main">
                <strong class="pron-roman">${esc(row.roman)}</strong>
                <span class="pron-arrow">→</span>
                <span class="pron-dev">${esc(row.devanagari)}</span>
              </div>
              ${row.speech ? `<p class="muted pron-note">My Voice: ${esc(row.speech)}</p>` : ""}
              ${row.note ? `<p class="muted pron-note">${esc(row.note)}</p>` : ""}
              <p class="muted pron-meta">Updated ${new Date(row.updated || Date.now()).toLocaleString()}</p>
              <div class="pron-card-actions">
                <button type="button" class="btn btn-ghost btn-sm" data-pron-edit="${esc(row.roman)}">Edit</button>
                <button type="button" class="btn btn-ghost btn-sm" data-pron-del="${esc(row.roman)}">Delete</button>
              </div>
            </article>`).join("");
          el.querySelectorAll("[data-pron-edit]").forEach(btn => {
            btn.addEventListener("click", () => {
              const row = list().find(r => String(r.roman).toLowerCase() === btn.dataset.pronEdit.toLowerCase());
              if (!row) return;
              showReportModal({
                roman: row.roman,
                devanagari: row.devanagari,
                speech: row.speech,
                source: row.note,
                onSaved: renderList,
              });
              const noteEl = document.getElementById("pronReportNote");
              if (noteEl && row.note) noteEl.value = row.note;
            });
          });
          el.querySelectorAll("[data-pron-del]").forEach(btn => {
            btn.addEventListener("click", () => {
              if (!confirm(`Delete pronunciation for “${btn.dataset.pronDel}”?`)) return;
              removeByRoman(btn.dataset.pronDel);
              renderList();
            });
          });
        };
        document.getElementById("pronSearch")?.addEventListener("input", renderList);
        document.getElementById("btnPronAdd")?.addEventListener("click", () => {
          showReportModal({ onSaved: renderList });
        });
        renderList();
      },
    });
  }

  window.AmpsPronunciation = {
    install,
    list,
    save,
    upsert,
    removeByRoman,
    search,
    guessRomanFromSelection,
    showReportModal,
    renderPage,
  };
})();

/* Presentation Builder — short slide bullets (audience) vs full text (presenter) */
(function () {
  "use strict";

  const SLIDE_BULLET_MAX_CHARS = 96;
  const SLIDE_BULLET_MAX_WORDS = 12;

  function sentences(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÀÂÄÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝŸ"“(\[])/)
      .map(s => s.trim())
      .filter(s => s.length > 15);
  }

  function dedupe(list) {
    const out = [];
    const seen = new Set();
    for (const item of list || []) {
      const t = String(item || "").trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  }

  function shortenWords(s, maxWords, maxChars) {
    const words = String(s || "").replace(/\s+/g, " ").trim().split(/\s+/);
    const mw = maxWords || SLIDE_BULLET_MAX_WORDS;
    const mc = maxChars || SLIDE_BULLET_MAX_CHARS;
    if (!words.length) return "";
    let out = words.length <= mw ? words.join(" ") : words.slice(0, mw).join(" ");
    if (out.length > mc) {
      out = out.slice(0, mc);
      const sp = out.lastIndexOf(" ");
      if (sp > 24) out = out.slice(0, sp);
    }
    const trimmed = out.replace(/[,;:]$/, "").trim();
    const full = words.join(" ");
    if (trimmed.length >= full.length - 4) return trimmed;
    return trimmed + "…";
  }

  function toSlideBullet(sentence) {
    const s = String(sentence || "").replace(/\s+/g, " ").trim();
    if (!s) return "";
    const def = s.match(/^([^:]{2,48}):\s*(.+)$/);
    if (def) {
      const term = def[1].trim();
      const gloss = shortenWords(def[2], 8, 64);
      return gloss.length > 12 ? `${term} — ${gloss}` : term;
    }
    return shortenWords(s);
  }

  function bulletsFromText(text, max) {
    const limit = max || 5;
    const sents = sentences(text);
    if (!sents.length) {
      const t = String(text || "").trim();
      return t ? [toSlideBullet(t)] : [];
    }
    const picks = [];
    if (sents[0]) picks.push(sents[0]);
    if (sents.length > 2 && picks.length < limit) picks.push(sents[Math.floor(sents.length / 2)]);
    if (sents.length > 1 && picks.length < limit) {
      const last = sents[sents.length - 1];
      if (!picks.includes(last)) picks.push(last);
    }
    for (const s of sents) {
      if (picks.length >= limit) break;
      if (!picks.includes(s)) picks.push(s);
    }
    return dedupe(picks.map(toSlideBullet).filter(Boolean)).slice(0, limit);
  }

  function slideBulletsFromParagraph(text, summary) {
    const source = dedupe(summary).filter(s => s.length > 10);
    const sents = source.length ? source : sentences(text);
    const bullets = dedupe(
      sents.map(toSlideBullet).filter(Boolean)
    ).slice(0, 5);
    if (!bullets.length && text) bullets.push(toSlideBullet(text));
    return bullets;
  }

  function formatBulletsPlain(bullets) {
    return (bullets || []).map(b => "• " + b).join("\n");
  }

  function noteExcerpt(text, maxChars) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    const limit = maxChars || 280;
    if (t.length <= limit) return t;
    const cut = t.slice(0, limit);
    const sp = cut.lastIndexOf(" ");
    return (sp > 80 ? cut.slice(0, sp) : cut).trim() + "… [excerpt]";
  }

  /**
   * @param {{ text?: string, summary?: string[], presenterNotes?: string, id?: string, shlokaParaId?: string }} para
   */
  function preparePassageContent(para) {
    const text = String(para?.text || "").trim();
    const summary = Array.isArray(para?.summary) ? para.summary : [];
    const bullets = slideBulletsFromParagraph(text, summary);
    const custom = String(para?.presenterNotes || "").trim();
    // Public builder: do not auto-export full passages as Presenter Notes.
    let presenterNotes = custom && custom !== text
      ? noteExcerpt(custom, 400)
      : noteExcerpt(text, 280);

    const shlokaId = para?.shlokaParaId || (String(para?.id || "").startsWith("ch-verses-p") ? para.id : "");
    let recitation = null;
    if (shlokaId && typeof window.AmpsShlokaPresentationAudio?.formatRecitationNotes === "function") {
      // Sync stub: omit play unless caller later resolves approval asynchronously.
      recitation = {
        showPlay: false,
        prefer: "none",
        notes: window.AmpsShlokaPresentationAudio.formatRecitationNotes({
          recitation_type: "Traditional Samskrta recitation",
          source: "resolve at present time — only approved human/machine may play",
          status: "check_approval",
          recommended_repeats: 3,
          deep_link: `#shloka-recorder?verse=${String(shlokaId).replace(/\D+/g, "")}`,
        }),
        paragraph_id: shlokaId,
      };
      presenterNotes = window.AmpsShlokaPresentationAudio.appendRecitationToPresenterNotes(
        presenterNotes,
        recitation.notes,
      );
    }

    return {
      text,
      summary: summary.length ? summary : sentences(text).slice(0, 3),
      contentBullets: bullets,
      contentText: formatBulletsPlain(bullets),
      presenterNotes,
      recitation,
    };
  }

  window.AmpsPresentationContent = {
    sentences,
    dedupe,
    shortenWords,
    toSlideBullet,
    bulletsFromText,
    slideBulletsFromParagraph,
    formatBulletsPlain,
    preparePassageContent,
  };
})();

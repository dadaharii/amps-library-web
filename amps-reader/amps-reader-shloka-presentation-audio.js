/**
 * Recitation metadata for presentation / presenter notes.
 * Omits play affordances unless audio is approved.
 */
(function (root) {
  "use strict";

  function formatRecitationNotes(meta) {
    if (!meta) return "";
    const lines = [
      `RECITATION TYPE: ${meta.recitation_type || "Traditional Samskrta recitation"}`,
      `RECITATION DURATION: ${meta.duration != null ? `${meta.duration}s` : "n/a"}`,
      `AUDIO SOURCE: ${meta.source || "none"}`,
      `APPROVAL STATUS: ${meta.status || "unavailable"}`,
      `RECOMMENDED REPEAT COUNT: ${meta.recommended_repeats || 3}`,
      `OPEN IN AMPS LIBRARY: ${meta.deep_link || ""}`,
    ];
    if (meta.pronunciation_guidance) {
      lines.splice(2, 0, `PRONUNCIATION GUIDANCE: ${meta.pronunciation_guidance}`);
    }
    if (meta.line_breaks) {
      lines.splice(3, 0, `LINE BREAKS: ${meta.line_breaks}`);
    }
    return lines.join("\n");
  }

  /**
   * Build play policy for a verse from dual-recitation resolver.
   * @returns {{ showPlay: boolean, prefer: string, notes: string, label: string }}
   */
  async function recitationForPresentation(paraId, opts = {}) {
    const deep = `#shloka-recorder?verse=${String(paraId || "").replace(/\D+/g, "")}`;
    const resolved = await root.AmpsShlokaAudioPlayer?.resolveRecitation?.(paraId, {
      allowDraft: false,
      allowMachineDraft: false,
    });
    const approvedHuman = resolved?.kind === "human" && resolved.status === "approved";
    const approvedMachine = resolved?.kind === "machine"
      && resolved.status === "approved_machine_recitation";
    const showPlay = !!(approvedHuman || approvedMachine);
    const prefer = approvedHuman ? "human" : (approvedMachine ? "machine" : "none");
    const notes = formatRecitationNotes({
      recitation_type: "Traditional Samskrta recitation",
      duration: null,
      source: showPlay ? `${resolved.label} (${resolved.source})` : "none — omit play button",
      status: showPlay ? resolved.status : "unapproved_or_missing",
      recommended_repeats: opts.recommended_repeats || 3,
      deep_link: deep,
      pronunciation_guidance: opts.pronunciation_guidance || "",
      line_breaks: opts.line_breaks || "",
    });
    return {
      showPlay,
      prefer,
      label: showPlay ? resolved.label : "",
      badge: showPlay ? resolved.badge : "Unavailable",
      notes,
      deep_link: deep,
    };
  }

  function appendRecitationToPresenterNotes(existing, recitationBlock) {
    const base = String(existing || "").trim();
    const block = String(recitationBlock || "").trim();
    if (!block) return base;
    if (!base) return block;
    if (base.includes("RECITATION TYPE:")) return base;
    return `${base}\n\n${block}`;
  }

  const api = {
    formatRecitationNotes,
    recitationForPresentation,
    appendRecitationToPresenterNotes,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AmpsShlokaPresentationAudio = api;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);

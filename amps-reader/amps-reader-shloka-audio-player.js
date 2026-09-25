/**
 * Unified playback resolver + badges for dual human/machine recitation.
 * Prefers approved human; never labels machine as human.
 */
(function (root) {
  "use strict";

  const LABELS = {
    human: "Human recitation",
    machine: "Machine recitation",
    tts: "Computer pronunciation fallback",
    none: "Unavailable",
  };

  function loadManifestV2() {
    return root.AmpsShlokaAudio?._manifestV2 || null;
  }

  function v1Entry(paraId) {
    return root.AmpsShlokaAudio?.lookupEntry?.(paraId) || null;
  }

  function v2Entry(paraId) {
    return loadManifestV2()?.entries?.[paraId] || null;
  }

  /**
   * Resolve what to play for a verse.
   * @param {string} paraId
   * @param {{ allowDraft?: boolean, allowMachineDraft?: boolean, prefer?: string }} opts
   */
  async function resolveRecitation(paraId, opts = {}) {
    const allowDraft = opts.allowDraft === true;
    const allowMachineDraft = opts.allowMachineDraft === true;

    // Device recording (Studio) — preferred for "mine" / draft review
    try {
      const row = await root.AmpsShlokaRecorder?.getRecording?.(paraId);
      if (row?.blob?.size) {
        const status = row.review_status || "draft";
        if (status === "approved" || allowDraft) {
          return {
            kind: "human",
            source: "device",
            blob: row.blob,
            label: LABELS.human,
            badge: status === "approved" ? "Approved human" : "My recording",
            status,
            audio_type: "human_recitation",
          };
        }
      }
    } catch (_) { /* ignore */ }

    const v2 = v2Entry(paraId);
    if (v2?.audio) {
      const human = v2.audio.human;
      if (human?.file && human.status === "approved") {
        return {
          kind: "human",
          source: "bundled",
          file: human.file,
          label: LABELS.human,
          badge: "Approved human",
          status: human.status,
          audio_type: "human_recitation",
        };
      }
      if (human?.file && allowDraft && (human.status === "draft" || human.status === "reviewed")) {
        return {
          kind: "human",
          source: "bundled",
          file: human.file,
          label: LABELS.human,
          badge: "My recording",
          status: human.status,
          audio_type: "human_recitation",
        };
      }

      const machine = v2.audio.machine;
      const preferEngine = opts.prefer === "say" ? "say" : (opts.prefer === "xtts" ? "xtts" : machine?.selected_engine);
      if (machine?.status === "approved_machine_recitation" || (allowMachineDraft && machine?.status === "draft")) {
        const cands = machine.candidates || {};
        const allowed = cand => {
          if (!cand?.file || cand.status === "rejected" || cand.approved === false && cand.review_decision === "rejected") {
            return false;
          }
          if (machine.status === "approved_machine_recitation") {
            return cand.status === "selected" || cand.approved === true;
          }
          return allowMachineDraft && (cand.status === "draft" || cand.status === "selected");
        };
        const cand = (preferEngine && allowed(cands[preferEngine]) && cands[preferEngine])
          || (allowed(cands.xtts) && cands.xtts)
          || (allowed(cands.say) && cands.say);
        if (cand?.file) {
          return {
            kind: "machine",
            source: "bundled",
            file: cand.file,
            engine: cand.engine,
            label: LABELS.machine,
            badge: machine.status === "approved_machine_recitation" ? "Approved machine" : "Machine draft",
            status: machine.status,
            audio_type: "machine_recitation",
          };
        }
      }
    }

    // Legacy v1: live human only (clones must not appear as human)
    const v1 = v1Entry(paraId);
    if (v1?.humanLive && v1.humanFile && !v1.humanClone
      && (v1.reviewStatus === "approved" || allowDraft)) {
      return {
        kind: "human",
        source: "bundled",
        file: v1.humanFile,
        label: LABELS.human,
        badge: v1.reviewStatus === "approved" ? "Approved human" : "My recording",
        status: v1.reviewStatus || "draft",
        audio_type: "human_recitation",
      };
    }

    // Approved machine via legacy machine path
    if (v1?.audioType === "machine_recitation" && v1.reviewStatus === "approved_machine_recitation" && v1.humanFile) {
      return {
        kind: "machine",
        source: "bundled",
        file: v1.humanFile,
        label: LABELS.machine,
        badge: "Approved machine",
        status: "approved_machine_recitation",
        audio_type: "machine_recitation",
      };
    }

    return {
      kind: "none",
      label: LABELS.none,
      badge: "Unavailable",
      audio_type: null,
    };
  }

  function badgeHtml(resolved) {
    if (!resolved) return "";
    const cls = resolved.kind === "human"
      ? "shloka-audio-badge is-human"
      : resolved.kind === "machine"
        ? "shloka-audio-badge is-machine"
        : "shloka-audio-badge is-none";
    return `<span class="${cls}">${resolved.badge || resolved.label}</span>`;
  }

  const api = {
    LABELS,
    resolveRecitation,
    badgeHtml,
    setManifestV2(m) {
      if (root.AmpsShlokaAudio) root.AmpsShlokaAudio._manifestV2 = m;
    },
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AmpsShlokaAudioPlayer = api;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);

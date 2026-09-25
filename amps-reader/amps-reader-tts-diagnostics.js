/* AMPS Reader — TTS diagnostics for Android / browser testing */
(function () {
  "use strict";

  let api = null;

  function install(appApi) {
    api = appApi;
  }

  function esc(s) {
    return api?.esc ? api.esc(s) : String(s ?? "");
  }

  function panelHtml() {
    return `
      <div class="tts-diag-panel modern-card">
        <h3>TTS diagnostics</h3>
        <p class="muted">Run on a real Android device to verify listen, highlight, and API fallback.</p>
        <div class="tts-diag-grid">
          <button type="button" class="btn btn-ghost btn-sm" id="btnDiagNative">Test device TTS</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnDiagApi">Test API TTS</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnDiagPravachan">Test pravachan</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnDiagStop">Stop</button>
        </div>
        <pre id="ttsDiagLog" class="tts-diag-log"></pre>
      </div>`;
  }

  function log(msg) {
    const el = document.getElementById("ttsDiagLog");
    if (!el) return;
    el.textContent = (el.textContent ? el.textContent + "\n" : "") + msg;
  }

  function bindPanel(state) {
    document.getElementById("btnDiagStop")?.addEventListener("click", () => {
      window.AmpsAudio?.stop?.();
      window.AmpsApiTts?.stop?.();
      log("Stopped.");
    });
    document.getElementById("btnDiagNative")?.addEventListener("click", async () => {
      log("Device TTS: " + (window.AmpsAudio?.useNative?.() ? "native plugin" : "browser synth"));
      window.AmpsAudio?.preview?.(
        state.settings.ttsVoice,
        state.settings.sanskritSpeechRate ?? state.settings.ttsRate ?? 0.9,
        state.settings.sanskritPronunciation ?? state.settings.ttsPronunciation
      );
    });
    document.getElementById("btnDiagApi")?.addEventListener("click", async () => {
      const url = state.settings.ttsApiUrl;
      if (!window.AmpsApiTts?.isConfigured?.(url)) {
        log("API TTS: not configured (set TTS API URL in reader settings).");
        return;
      }
      log("API TTS: fetching…");
      const ok = await window.AmpsApiTts.speak("Svadharme nidhanam shreyah.", {
        apiUrl: url,
        apiKey: state.settings.ttsApiKey,
        rate: 1,
      });
      log("API TTS: " + (ok ? "played" : "failed"));
    });
    document.getElementById("btnDiagPravachan")?.addEventListener("click", async () => {
      log("Pravachan sample…");
      await window.AmpsAudio?.speakParagraphs?.(
        ["Dharma is the eternal rhythm of the Cosmic mind. Each being must follow their own svadharma with sincerity."],
        ["diag-p1"],
        0.75,
        () => {},
        state.settings.ttsVoice,
        0,
        null,
        "amps-enhanced",
        { readingStyle: "pravachan", apiTts: window.AmpsApiTts?.isConfigured?.(state.settings.ttsApiUrl) ? { apiUrl: state.settings.ttsApiUrl, apiKey: state.settings.ttsApiKey } : null }
      );
    });
  }

  window.AmpsTtsDiag = {
    install,
    panelHtml,
    bindPanel,
  };
})();

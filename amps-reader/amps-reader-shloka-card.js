/* AMPS Reader — Samskrta Shloka verse card: audio → verse → meaning */
(function (root) {
  "use strict";

  let hydrateGen = 0;
  let ioObserver = null;
  let playBound = false;

  function preferHumanFrom(helpers, preferHuman) {
    if (preferHuman !== undefined) return preferHuman !== false;
    if (helpers?.preferHuman !== undefined) return helpers.preferHuman !== false;
    return true;
  }

  function syncSrcFromManifest(paraId, preferHuman) {
    if (!paraId) return { src: "", fallback: "", humanOnly: false, live: false };
    const sync = window.AmpsShlokaAudio?.syncSrcFor?.(paraId);
    if (sync?.src) return sync;
    return { src: "", fallback: "", humanOnly: false, live: false };
  }

  async function resolveAudioSrc(paraId, preferHuman) {
    if (!paraId) return { src: "", fallback: "", kind: "none" };
    await window.AmpsShlokaAudio?.loadManifest?.();

    // Bundled audio is keyed to paraId — always prefer it for the verse card so
    // text and audio cannot drift (device takes are for "Play mine" only).
    const sync = syncSrcFromManifest(paraId, preferHuman);
    if (preferHuman !== false && sync.src) {
      return {
        src: sync.src,
        fallback: sync.fallback || "",
        kind: sync.live ? "bundled-live" : "bundled-generated",
      };
    }

    if (preferHuman !== false && window.AmpsShlokaRecorder?.getBlob) {
      try {
        const blob = await window.AmpsShlokaRecorder.getBlob(paraId);
        if (blob?.size) {
          const fallback = sync.src
            || window.AmpsShlokaAudio?.bundledFallbackSrcFor?.(paraId)
            || window.AmpsShlokaAudio?.bundledSrcFor?.(paraId)
            || "";
          return { src: URL.createObjectURL(blob), fallback, kind: "device-live" };
        }
      } catch (_) { /* fall through */ }
    }

    if (sync.src) {
      return {
        src: sync.src,
        fallback: sync.fallback || "",
        kind: sync.live ? "bundled-live" : "bundled-generated",
      };
    }
    const guessed = window.AmpsShlokaAudio?.publicAudioSrc?.(`custom/mp3/${paraId}.mp3`) || "";
    if (guessed) return { src: guessed, fallback: "", kind: "bundled-generated" };
    return { src: "", fallback: "", kind: "none" };
  }

  function bindAudioFallback(audio) {
    if (!audio || audio.dataset.fallbackBound === "1") return;
    audio.dataset.fallbackBound = "1";
    audio.addEventListener("error", () => {
      if (audio.dataset.humanOnly === "1") return;
      const fallback = audio.getAttribute("data-audio-fallback");
      if (!fallback || audio.dataset.fallbackUsed === "1") return;
      if (audio.getAttribute("src") === fallback) return;
      audio.dataset.fallbackUsed = "1";
      audio.setAttribute("src", fallback);
      audio.load();
    });
  }

  function applyAudioSrc(audio, src, fallback, humanOnly, kind) {
    if (!audio || !src) return false;
    bindAudioFallback(audio);
    if (humanOnly) audio.dataset.humanOnly = "1";
    else delete audio.dataset.humanOnly;
    if (kind === "device-live") audio.dataset.shlokaDeviceLive = "1";
    else delete audio.dataset.shlokaDeviceLive;
    if (fallback) audio.setAttribute("data-audio-fallback", fallback);
    else audio.removeAttribute("data-audio-fallback");
    delete audio.dataset.fallbackUsed;
    const cur = audio.getAttribute("src") || "";
    if (cur !== src) {
      audio.setAttribute("src", src);
      audio.load();
    }
    audio.volume = 1;
    audio.muted = false;
    audio.classList.remove("shloka-verse-audio-missing");
    audio.dataset.hydrated = "1";
    audio.removeAttribute("disabled");
    return true;
  }

  function audioHasSrc(audio) {
    return !!(audio?.getAttribute?.("src") || audio?.currentSrc);
  }

  async function hydrateOneAudio(audio, preferHuman) {
    const paraId = audio.getAttribute("data-shloka-audio-id");
    if (!paraId) return;

    // Always re-resolve so a fresh device recording overrides a stale bundled src.
    const resolved = await resolveAudioSrc(paraId, preferHuman);
    if (resolved.src) {
      applyAudioSrc(audio, resolved.src, resolved.fallback, false, resolved.kind);
      return;
    }
    audio.classList.add("shloka-verse-audio-missing");
    if (!audio.nextElementSibling?.classList?.contains("shloka-verse-audio-hint")) {
      audio.insertAdjacentHTML("afterend", `<p class="muted shloka-verse-audio-hint">No audio yet — tap Listen in toolbar or record in Shloka Studio.</p>`);
    }
  }

  function visibleFirst(audios) {
    const list = Array.from(audios || []);
    list.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const va = ra.bottom > 0 && ra.top < window.innerHeight;
      const vb = rb.bottom > 0 && rb.top < window.innerHeight;
      if (va !== vb) return va ? -1 : 1;
      return ra.top - rb.top;
    });
    return list;
  }

  async function hydrateAudio(rootEl, preferHuman) {
    const gen = ++hydrateGen;
    const scope = rootEl || document;
    const audios = scope.querySelectorAll?.("audio[data-shloka-audio-id]") || [];
    const batchSize = 16;
    for (let i = 0; i < audios.length; i += batchSize) {
      if (gen !== hydrateGen) return;
      const batch = Array.from(audios).slice(i, i + batchSize);
      await Promise.all(batch.map(audio => hydrateOneAudio(audio, preferHuman)));
    }
  }

  function observeLazyHydrate(rootEl, preferHuman) {
    ioObserver?.disconnect?.();
    const scope = rootEl || document;
    const pending = Array.from(scope.querySelectorAll?.('audio[data-shloka-audio-id]') || []);
    if (!pending.length) return;

    pending.forEach(audio => hydrateOneAudio(audio, preferHuman));

    if (typeof IntersectionObserver === "undefined") return;
    ioObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        hydrateOneAudio(entry.target, preferHuman);
        ioObserver.unobserve(entry.target);
      });
    }, { rootMargin: "320px 0px", threshold: 0.01 });
    pending.forEach(audio => {
      if (!audioHasSrc(audio)) ioObserver.observe(audio);
    });
  }

  function bindPlayHydrate(scope, preferHuman) {
    if (playBound) return;
    playBound = true;
    const root = scope || document;
    root.addEventListener("play", e => {
      const audio = e.target;
      if (!audio?.matches?.("audio[data-shloka-audio-id]")) return;
      audio.volume = 1;
      audio.muted = false;
      // Device-live bed padding used to wait 10s before voice — felt like silence.
      // Play immediately; optional short bed can still start in parallel.
      if (audio.dataset.shlokaDeviceLive === "1" && audio.dataset.shlokaBedPadding !== "1") {
        window.AmpsShlokaAudio?.startBedUnderVoice?.(0);
      }
      if (audioHasSrc(audio) && audio.dataset.hydrated === "1") return;
      e.preventDefault();
      audio.pause();
      hydrateOneAudio(audio, preferHuman).then(() => {
        if (!audioHasSrc(audio)) return;
        audio.volume = 1;
        audio.muted = false;
        if (audio.dataset.shlokaDeviceLive === "1") {
          window.AmpsShlokaAudio?.startBedUnderVoice?.(0);
        }
        const p = audio.play();
        if (p?.catch) p.catch(() => {});
      });
    }, true);
    root.addEventListener("playing", e => {
      const audio = e.target;
      if (!audio?.matches?.("audio[data-shloka-audio-id]")) return;
      audio.volume = 1;
      audio.muted = false;
    }, true);
    root.addEventListener("pause", e => {
      const audio = e.target;
      if (!audio?.matches?.("audio[data-shloka-audio-id]")) return;
      if (audio.dataset.shlokaDeviceLive === "1" && !audio.ended) {
        window.AmpsShlokaAudio?.pauseBed?.();
      }
    }, true);
    root.addEventListener("ended", e => {
      const audio = e.target;
      if (!audio?.matches?.("audio[data-shloka-audio-id]")) return;
      if (audio.dataset.shlokaDeviceLive === "1") {
        window.AmpsShlokaAudio?.stopBed?.();
      }
    }, true);
  }

  function renderCard(p, verseNum, helpers) {
    const esc = helpers?.esc || (s => String(s || ""));
    const scriptsHtml = helpers?.renderShlokaScriptsOnly?.(p) || "";
    const meaningHtml = helpers?.renderShlokaMeaningOnly?.(p) || "";
    const sourcesHtml = helpers?.renderShlokaSources?.(p) || "";
    const paraId = p?.id || "";
    const title = verseNum ? `Verse ${verseNum}` : "Verse";
    const preferHuman = preferHumanFrom(helpers);
    const sync = syncSrcFromManifest(paraId, preferHuman);
    const srcAttr = sync.src ? ` src="${esc(sync.src)}"` : "";
    const fallbackAttr = sync.fallback ? ` data-audio-fallback="${esc(sync.fallback)}"` : "";
    const humanAttr = sync.live && !sync.fallback ? ` data-human-only="1"` : "";
    const hydratedAttr = sync.src ? ` data-hydrated="1"` : "";
    const beforeSourcesHtml = helpers?.beforeSourcesHtml || helpers?.afterVerseHtml || "";
    const hideMeanings = helpers?.hideMeanings === true;
    const meaningBlock = !hideMeanings && meaningHtml
      ? `<div class="shloka-verse-card-meaning">
          <h3 class="shloka-verse-meaning-label">Meanings</h3>
          <div class="shloka-verse-meaning-body">${meaningHtml}</div>
        </div>`
      : "";

    return `<div class="shloka-verse-card-inner">
      <audio class="shloka-verse-audio" controls preload="metadata" data-shloka-audio-id="${esc(paraId)}"${srcAttr}${fallbackAttr}${humanAttr}${hydratedAttr}></audio>
      <h2 class="shloka-verse-card-title">${esc(title)}</h2>
      <div class="shloka-verse-card-text">${scriptsHtml}</div>
      ${beforeSourcesHtml}
      ${meaningBlock}
      ${sourcesHtml}
    </div>`;
  }

  function scheduleHydrate(rootEl, preferHuman) {
    const run = () => {
      const scope = rootEl || document.getElementById("readerArticle");
      if (!scope) return;
      scope.querySelectorAll?.("audio[data-shloka-audio-id]").forEach(audio => {
        bindAudioFallback(audio);
        if (audio.dataset.humanOnly === "1") audio.dataset.humanOnly = "1";
      });
      bindPlayHydrate(scope, preferHuman);
      observeLazyHydrate(scope, preferHuman);
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(run));
    } else {
      setTimeout(run, 0);
    }
  }

  const api = {
    renderCard,
    hydrateAudio,
    scheduleHydrate,
    resolveAudioSrc,
    bindAudioFallback,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.AmpsShlokaCard = api;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);

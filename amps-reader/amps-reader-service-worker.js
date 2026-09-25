/**
 * AMPS Reader — service worker registration and update UX (Batch 5A).
 * Browser PWA only. Disabled inside Capacitor native WebViews by default.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AmpsServiceWorker = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const STATES = Object.freeze({
    unsupported: "unsupported",
    registering: "registering",
    ready: "ready",
    update_available: "update_available",
    update_installed: "update_installed",
    offline: "offline",
    error: "error",
    disabled_native: "disabled_native",
    disabled_profile: "disabled_profile",
  });

  const listeners = new Set();
  let state = STATES.unsupported;
  let registration = null;
  let lastError = null;
  let releaseId = null;

  function emit(next, detail) {
    state = next;
    const payload = { state, detail: detail || null, releaseId, error: lastError };
    listeners.forEach((fn) => {
      try {
        fn(payload);
      } catch (_) {}
    });
    try {
      root.dispatchEvent(new CustomEvent("amps-sw-state", { detail: payload }));
    } catch (_) {}
    return payload;
  }

  function onStateChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function isSecureContext() {
    try {
      if (typeof window === "undefined") return false;
      if (window.isSecureContext) return true;
      const h = location.hostname;
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (_) {
      return false;
    }
  }

  function isCapacitorNative() {
    try {
      if (window.Capacitor?.isNativePlatform?.()) return true;
      if (window.capacitor?.isNative) return true;
      const proto = String(location.protocol || "");
      return proto === "capacitor:" || proto === "ionic:";
    } catch (_) {
      return false;
    }
  }

  function profileAllowsPwa() {
    const flags = root.AmpsBuildFlags || {};
    if (flags.pwa === false) return false;
    if (flags.profileId && /no-?pwa/i.test(flags.profileId)) return false;
    return flags.pwa !== false;
  }

  function userIsBusy() {
    try {
      const route = String(location.hash || "");
      if (/note|edit|record|present/i.test(route)) return true;
      if (document.body?.classList?.contains("note-editing")) return true;
      if (document.body?.classList?.contains("recording")) return true;
      if (document.body?.dataset?.ampsBusy === "1") return true;
      if (root.AmpsReaderBusy?.()) return true;
    } catch (_) {}
    return false;
  }

  function saveResumeContext() {
    try {
      const payload = {
        hash: location.hash || "",
        href: location.href || "",
        scrollY: window.scrollY || 0,
        savedAt: new Date().toISOString(),
      };
      sessionStorage.setItem("amps-sw-resume", JSON.stringify(payload));
      return payload;
    } catch (_) {
      return null;
    }
  }

  function restoreResumeContext() {
    try {
      const raw = sessionStorage.getItem("amps-sw-resume");
      if (!raw) return null;
      const payload = JSON.parse(raw);
      sessionStorage.removeItem("amps-sw-resume");
      if (payload.hash && location.hash !== payload.hash) {
        location.hash = payload.hash;
      }
      if (typeof payload.scrollY === "number") {
        window.setTimeout(() => window.scrollTo(0, payload.scrollY), 50);
      }
      return payload;
    } catch (_) {
      return null;
    }
  }

  function showUpdateBanner(reg) {
    let el = document.getElementById("ampsSwUpdateBanner");
    if (!el) {
      el = document.createElement("div");
      el.id = "ampsSwUpdateBanner";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.style.cssText =
        "position:fixed;z-index:9999;left:12px;right:12px;bottom:12px;padding:12px 14px;" +
        "background:#1a120b;color:#f7f1e8;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.35);" +
        "display:flex;gap:10px;flex-wrap:wrap;align-items:center;font:14px/1.4 system-ui,sans-serif";
      el.innerHTML =
        '<span style="flex:1 1 180px">A library update is ready.</span>' +
        '<button type="button" data-amps-sw="now" style="padding:8px 12px;border-radius:8px;border:0;background:#e85d04;color:#fff;font-weight:600">Update now</button>' +
        '<button type="button" data-amps-sw="later" style="padding:8px 12px;border-radius:8px;border:1px solid #666;background:transparent;color:#f7f1e8">Later</button>';
      document.body.appendChild(el);
      el.addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-amps-sw]");
        if (!btn) return;
        const action = btn.getAttribute("data-amps-sw");
        if (action === "later") {
          el.remove();
          return;
        }
        if (action === "now") {
          if (userIsBusy()) {
            el.querySelector("span").textContent =
              "Finish reading or editing first, then tap Update now.";
            return;
          }
          saveResumeContext();
          const worker = reg.waiting;
          if (worker) worker.postMessage({ type: "SKIP_WAITING" });
          el.remove();
        }
      });
    }
    return el;
  }

  function watchRegistration(reg) {
    registration = reg;
    if (reg.waiting) {
      emit(STATES.update_available, { waiting: true });
      showUpdateBanner(reg);
    }
    reg.addEventListener("updatefound", () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          emit(STATES.update_available, { installing: true });
          showUpdateBanner(reg);
        } else if (installing.state === "installed") {
          emit(STATES.ready, { firstInstall: true });
        }
      });
    });
  }

  async function register(options = {}) {
    lastError = null;
    restoreResumeContext();

    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return emit(STATES.unsupported, { reason: "no_service_worker" });
    }
    if (!profileAllowsPwa()) {
      return emit(STATES.disabled_profile);
    }
    if (isCapacitorNative() && options.allowNative !== true) {
      return emit(STATES.disabled_native, {
        reason: "Capacitor uses bundled assets; SW disabled by policy",
      });
    }
    if (!isSecureContext()) {
      return emit(STATES.unsupported, { reason: "insecure_context" });
    }

    emit(STATES.registering);
    try {
      const scriptUrl = options.scriptUrl || "../sw.js";
      const scope = options.scope || "../";
      const reg = await navigator.serviceWorker.register(scriptUrl, { scope });
      watchRegistration(reg);
      if (navigator.serviceWorker.controller) {
        emit(STATES.ready, { controlled: true });
      } else {
        emit(STATES.ready, { controlled: false });
      }
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        emit(STATES.update_installed);
        // Soft reload only when not busy and resume context saved.
        if (!userIsBusy()) {
          saveResumeContext();
          location.reload();
        }
      });
      window.addEventListener("offline", () => emit(STATES.offline));
      window.addEventListener("online", () => emit(STATES.ready, { online: true }));
      if (!navigator.onLine) emit(STATES.offline);
      return { ok: true, registration: reg, state };
    } catch (err) {
      lastError = { message: String(err && err.message ? err.message : err) };
      return emit(STATES.error, lastError);
    }
  }

  function getState() {
    return { state, releaseId, error: lastError, registration };
  }

  function setReleaseId(id) {
    releaseId = id || null;
  }

  // Auto-bootstrap when included as a browser script.
  if (typeof window !== "undefined" && !window.__AMPS_SW_NO_AUTO__) {
    window.addEventListener("DOMContentLoaded", () => {
      try {
        fetch("data/release-manifest.json", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((m) => setReleaseId(m && m.releaseId))
          .catch(() => {})
          .finally(() => register());
      } catch (_) {
        register();
      }
    });
  }

  return {
    STATES,
    register,
    onStateChange,
    getState,
    setReleaseId,
    isSecureContext,
    isCapacitorNative,
    userIsBusy,
    saveResumeContext,
    restoreResumeContext,
  };
});

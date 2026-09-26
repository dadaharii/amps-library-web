/* AMPS Reader — "new version available" banner for the sideloaded Android APK,
   and an "Add to Home Screen / Dock" guide for the iPhone and Mac web app */
(function () {
  "use strict";

  const RELEASES_API = "https://api.github.com/repos/dadaharii/amps-library-app/releases/latest";
  const DOWNLOAD_PAGE = "https://amps-ebook-api.onrender.com/download/";
  const STORE_KEY = "amps-update-check";
  const CHECK_EVERY_MS = 30 * 60 * 1000;
  const SNOOZE_MS = 24 * 60 * 60 * 1000;

  function currentVersion() {
    return String(window.AmpsBuildFlags?.appVersion || "").trim();
  }

  function isAndroidApp() {
    return window.Capacitor?.getPlatform?.() === "android";
  }

  function parseVersion(v) {
    const m = String(v || "").match(/(\d+)\.(\d+)\.(\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  }

  function isNewer(latest, current) {
    const a = parseVersion(latest);
    const b = parseVersion(current);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i++) {
      if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
  }

  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function saveStore(s) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch (_) { /* storage full or disabled */ }
  }

  async function fetchLatest() {
    const res = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
    if (!res.ok) throw new Error("Release check failed: " + res.status);
    const rel = await res.json();
    const apk = (rel.assets || []).find((a) => /\.apk$/i.test(a.name || ""));
    return {
      version: (parseVersion(rel.tag_name) || []).join("."),
      title: rel.name || rel.tag_name || "",
      notes: String(rel.body || ""),
      url: apk?.browser_download_url || rel.html_url || DOWNLOAD_PAGE,
    };
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function whatsNew(notes) {
    return notes
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^[-*•]\s+/.test(l))
      .map((l) => l.replace(/^[-*•]\s+/, ""))
      .slice(0, 3);
  }

  function injectStyles() {
    if (document.getElementById("ampsUpdateStyles")) return;
    const st = document.createElement("style");
    st.id = "ampsUpdateStyles";
    st.textContent = `
      .amps-update-banner { position: fixed; left: 12px; right: 12px; bottom: calc(76px + env(safe-area-inset-bottom, 0px));
        z-index: 9000; max-width: 560px; margin: 0 auto; padding: 14px 16px; border-radius: 14px;
        background: var(--surface, #fffaf0); color: var(--text, #1a1410); border: 1px solid var(--border, rgba(166,124,0,0.35));
        box-shadow: 0 10px 30px rgba(0,0,0,0.25); font-size: 14px; line-height: 1.45; }
      .amps-update-banner h4 { margin: 0 0 4px; font-size: 15px; }
      .amps-update-banner ul, .amps-update-banner ol { margin: 6px 0; padding-left: 20px; }
      .amps-update-banner li { margin: 3px 0; }
      .amps-update-banner p { margin: 0; opacity: 0.8; }
      .amps-update-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
      .amps-update-actions .btn-ghost { color: inherit; border-color: var(--border, rgba(0,0,0,0.2)); }
    `;
    document.head.appendChild(st);
  }

  function showBanner(latest, current) {
    document.getElementById("ampsUpdateBanner")?.remove();
    injectStyles();
    const items = whatsNew(latest.notes);
    const el = document.createElement("div");
    el.id = "ampsUpdateBanner";
    el.className = "amps-update-banner";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "App update available");
    el.innerHTML = `
      <h4>A new version of AMPS Library is available</h4>
      <p>Version ${esc(latest.version)} (you have ${esc(current)}). Your license, bookmarks and notes are kept.</p>
      ${items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
      <div class="amps-update-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="ampsUpdateLater">Later</button>
        <a class="btn btn-gold btn-sm" id="ampsUpdateGet" href="${esc(latest.url)}" target="_blank" rel="noopener">Download update</a>
      </div>`;
    document.body.appendChild(el);
    document.getElementById("ampsUpdateLater").addEventListener("click", () => {
      const s = loadStore();
      s.snoozedVersion = latest.version;
      s.snoozedUntil = Date.now() + SNOOZE_MS;
      saveStore(s);
      el.remove();
    });
    document.getElementById("ampsUpdateGet").addEventListener("click", () => el.remove());
  }

  function showStatus(title, text) {
    document.getElementById("ampsUpdateBanner")?.remove();
    injectStyles();
    const el = document.createElement("div");
    el.id = "ampsUpdateBanner";
    el.className = "amps-update-banner";
    el.setAttribute("role", "status");
    el.innerHTML = `
      <h4>${esc(title)}</h4>
      <p>${esc(text)}</p>
      <div class="amps-update-actions">
        <button type="button" class="btn btn-gold btn-sm" id="ampsUpdateOk">OK</button>
      </div>`;
    document.body.appendChild(el);
    document.getElementById("ampsUpdateOk").addEventListener("click", () => el.remove());
  }

  /**
   * Returns the latest release info when an update is available, else null.
   * opts.launch skips the resume throttle; opts.manual always reports a result.
   */
  async function check(opts = {}) {
    const current = currentVersion();
    const manual = !!opts.manual;
    if (!opts.force && !manual && (!isAndroidApp() || !current)) return null;
    const s = loadStore();
    const now = Date.now();
    const throttled = s.lastChecked && now - s.lastChecked < CHECK_EVERY_MS && !s.pendingVersion;
    if (!opts.force && !manual && !opts.launch && throttled) return null;

    let latest;
    try {
      latest = await fetchLatest();
    } catch (_) {
      if (manual) showStatus("Could not check for updates", "Check your internet connection and try again.");
      return null;
    }
    s.lastChecked = now;
    s.pendingVersion = isNewer(latest.version, current) ? latest.version : null;
    saveStore(s);
    if (!s.pendingVersion) {
      if (manual) showStatus("You have the latest version", `AMPS Library ${current || latest.version} is up to date.`);
      return null;
    }
    const snoozed = s.snoozedVersion === latest.version && now < (s.snoozedUntil || 0);
    if (!snoozed || opts.force || manual) showBanner(latest, current || "unknown");
    return latest;
  }

  function installPlatform() {
    if (window.Capacitor?.isNativePlatform?.()) return null;
    const standalone = navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches;
    if (standalone) return null;
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
    if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua)) return "mac";
    return null;
  }

  function showInstallHint(opts = {}) {
    const platform = opts.platform || installPlatform();
    if (!platform) return false;
    const s = loadStore();
    if (!opts.force && (s.installHintDismissed || Date.now() < (s.installHintSnoozedUntil || 0))) return false;
    document.getElementById("ampsInstallHint")?.remove();
    injectStyles();
    const shareIcon = `<svg width="16" height="20" viewBox="0 0 16 20" aria-hidden="true" style="vertical-align:-3px"><path d="M8 1v12M4 5l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 8H2v11h12V8h-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
    const steps = platform === "ios"
      ? `<ol><li>Tap the Share button ${shareIcon} in Safari's toolbar.</li><li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li></ol>
         <p>AMPS Library then opens from your Home Screen like any other app.</p>`
      : `<ol><li>In Safari's menu bar, choose <strong>File → Add to Dock…</strong></li><li>Click <strong>Add</strong>.</li></ol>
         <p>AMPS Library then opens from your Dock in its own window.</p>`;
    const el = document.createElement("div");
    el.id = "ampsInstallHint";
    el.className = "amps-update-banner";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Install AMPS Library");
    el.innerHTML = `
      <h4>Install AMPS Library on your ${platform === "ios" ? "iPhone" : "Mac"}</h4>
      ${steps}
      <div class="amps-update-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="ampsInstallLater">Later</button>
        <button type="button" class="btn btn-gold btn-sm" id="ampsInstallDone">Got it</button>
      </div>`;
    document.body.appendChild(el);
    document.getElementById("ampsInstallLater").addEventListener("click", () => {
      const st = loadStore();
      st.installHintSnoozedUntil = Date.now() + 3 * SNOOZE_MS;
      saveStore(st);
      el.remove();
    });
    document.getElementById("ampsInstallDone").addEventListener("click", () => {
      const st = loadStore();
      st.installHintDismissed = true;
      saveStore(st);
      el.remove();
    });
    return true;
  }

  function start() {
    setTimeout(() => check({ launch: true }), 4000);
    setTimeout(() => showInstallHint(), 6000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.AmpsUpdateCheck = { check, isNewer, currentVersion, showInstallHint, isAndroidApp };
})();

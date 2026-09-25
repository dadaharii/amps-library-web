/* AMPS Reader — license activation, status checks, premium gating */
(function () {
  "use strict";

  let api = null;

  function esc(s) {
    return api?.esc ? api.esc(s) : String(s ?? "");
  }

  function builtInApiBase() {
    return String(window.AmpsBuildFlags?.licenseServerUrl || "").trim().replace(/\/$/, "");
  }

  function getApiBase() {
    const url = builtInApiBase() || String(api?.state?.settings?.apiBaseUrl || "").trim();
    return url.replace(/\/$/, "");
  }

  function deviceId() {
    return window.AmpsSync?.deviceId?.() || "unknown-device";
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function normalizeKey(raw) {
    return String(raw || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .replace(/(.{4})(?=.)/g, "$1-")
      .slice(0, 19);
  }

  function ensureLicenseState() {
    if (!api.state.license) {
      api.state.license = {
        email: "",
        licenseKey: "",
        valid: false,
        isActive: false,
        activatedAt: null,
        lastChecked: null,
        deviceRegistered: false,
        maxDevices: 1,
        entitlements: [],
        subscriptions: [],
        hasAccess: false,
      };
    }
    if (!Array.isArray(api.state.license.entitlements)) api.state.license.entitlements = [];
    if (!Array.isArray(api.state.license.subscriptions)) api.state.license.subscriptions = [];
    return api.state.license;
  }

  function isEnforced() {
    return !!getApiBase();
  }

  function isLicensed() {
    if (!isEnforced()) return true;
    const lic = ensureLicenseState();
    return !!(lic.valid || lic.hasAccess);
  }

  function getEntitlements() {
    if (!isEnforced()) return ["ALL"];
    const lic = ensureLicenseState();
    if (!isLicensed()) return [];
    const ents = Array.isArray(lic.entitlements) ? lic.entitlements.filter(Boolean) : [];
    // Legacy keys (activated before Phase 2) → full library
    if (!ents.length && lic.valid) return ["ALL"];
    return ents;
  }

  function slugifySeries(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/['\u2019\u02bc]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function entitlementMatchesBook(ent, book) {
    if (!ent || !book) return false;
    if (ent === "ALL") return true;
    if (ent.startsWith("book:")) return ent.slice(5) === book.id;
    if (ent.startsWith("series:")) {
      const raw = ent.slice(7).trim();
      if (!raw) return false;
      if (book.series === raw || book.seriesKey === raw) return true;
      if (String(book.series || "").toLowerCase() === raw.toLowerCase()) return true;
      const slug = slugifySeries(raw);
      if (book.seriesKey === slug) return true;
      if (slugifySeries(book.series) === slug) return true;
    }
    return false;
  }

  /** Offline / no server URL → always true. Otherwise requires license + matching entitlement. */
  function canAccessBook(book) {
    if (!book) return false;
    if (!isEnforced()) return true;
    if (!isLicensed()) return false;
    const ents = getEntitlements();
    if (!ents.length) return false;
    return ents.some((e) => entitlementMatchesBook(e, book));
  }

  function applyAccessPayload(data) {
    const lic = ensureLicenseState();
    if (Array.isArray(data?.entitlements)) lic.entitlements = data.entitlements;
    if (Array.isArray(data?.subscriptions)) lic.subscriptions = data.subscriptions;
    if (data?.hasAccess != null) lic.hasAccess = !!data.hasAccess;
  }

  async function apiFetch(path, opts) {
    const base = getApiBase();
    if (!base) throw new Error("License server URL is not configured");
    const res = await fetch(base + path, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(opts?.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || data.message || "Request failed");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function persistFromActivation(data, email, licenseKey) {
    const lic = ensureLicenseState();
    lic.email = email;
    lic.licenseKey = licenseKey;
    lic.valid = true;
    lic.isActive = !!data.license?.isActive;
    lic.activatedAt = data.license?.activatedAt || new Date().toISOString();
    lic.lastChecked = Date.now();
    lic.deviceRegistered = true;
    lic.maxDevices = data.license?.maxDevices || 1;
    applyAccessPayload(data);
    if (!lic.entitlements.length) lic.entitlements = ["ALL"];
    lic.hasAccess = lic.hasAccess || lic.valid;
    api.saveState();
  }

  function clearLicense() {
    api.state.license = {
      email: "",
      licenseKey: "",
      valid: false,
      isActive: false,
      activatedAt: null,
      lastChecked: null,
      deviceRegistered: false,
      maxDevices: 1,
      entitlements: [],
      subscriptions: [],
      hasAccess: false,
    };
    api.saveState();
  }

  async function activate(email, licenseKey) {
    const em = normalizeEmail(email);
    const key = normalizeKey(licenseKey);
    if (!em || !key || key.length < 19) {
      throw new Error("Enter your purchase email and license key (XXXX-XXXX-XXXX-XXXX).");
    }
    const data = await apiFetch("/api/licenses/activate", {
      method: "POST",
      body: JSON.stringify({
        email: em,
        licenseKey: key,
        deviceId: deviceId(),
      }),
    });
    persistFromActivation(data, em, key);
    return data;
  }

  async function refreshStatus() {
    const lic = ensureLicenseState();
    if (!lic.email || !lic.licenseKey) return { valid: false };
    const q = new URLSearchParams({
      email: lic.email,
      licenseKey: lic.licenseKey,
      deviceId: deviceId(),
    });
    const data = await apiFetch("/api/licenses/status?" + q.toString());
    lic.valid = !!(data.valid && data.isActive);
    lic.isActive = !!data.isActive;
    lic.deviceRegistered = !!data.deviceRegistered;
    lic.lastChecked = Date.now();
    lic.maxDevices = data.maxDevices || lic.maxDevices || 1;
    applyAccessPayload(data);
    if (lic.valid && !lic.entitlements.length) lic.entitlements = ["ALL"];
    if (!lic.valid) {
      lic.deviceRegistered = false;
      lic.hasAccess = false;
    }
    api.saveState();
    return data;
  }

  function formatKeyInput(value) {
    return normalizeKey(value);
  }

  function licenseStatusLabel() {
    const lic = ensureLicenseState();
    if (!isEnforced()) return "Offline mode — no license required";
    if (!lic.email) return "Not activated";
    if (lic.valid) {
      const ents = getEntitlements();
      if (ents.includes("ALL")) return "Active — full library";
      if (ents.length) return `Active — ${ents.length} entitlement${ents.length === 1 ? "" : "s"}`;
      return "Active on this device";
    }
    return "License needs attention";
  }

  function licenseStatusBadgeClass() {
    if (!isEnforced()) return "license-badge-offline";
    return isLicensed() ? "license-badge-active" : "license-badge-inactive";
  }

  function renderGateHtml() {
    const lic = ensureLicenseState();
    return `
      <section class="license-hero">
        <div class="license-hero-glow"></div>
        <div class="license-hero-inner">
          <p class="license-eyebrow">Premium eBook</p>
          <h1>Unlock AMPS Reader</h1>
          <p class="license-lead">Enter the email and license key from your purchase confirmation to access the full sacred library on this device.</p>
          <div class="license-features">
            <div class="license-feature"><span>📚</span><div><strong>Full library</strong><small>162+ books offline</small></div></div>
            <div class="license-feature"><span>☁️</span><div><strong>Cloud sync</strong><small>Progress across devices</small></div></div>
            <div class="license-feature"><span>📄</span><div><strong>PDF export</strong><small>Discourse & presentations</small></div></div>
          </div>
        </div>
      </section>
      <div class="license-card">
        <form id="licenseGateForm" class="license-form" autocomplete="on">
          <label class="license-field">
            <span>Email used at purchase</span>
            <input type="email" id="licenseEmail" inputmode="email" autocomplete="email"
              placeholder="you@example.com" value="${esc(lic.email)}" required />
          </label>
          <label class="license-field">
            <span>License key</span>
            <input type="text" id="licenseKey" inputmode="text" autocomplete="off"
              placeholder="XXXX-XXXX-XXXX-XXXX" value="${esc(lic.licenseKey)}"
              maxlength="19" spellcheck="false" required />
          </label>
          <p class="license-device muted">Device ID: <code>${esc(deviceId())}</code></p>
          <p id="licenseGateMsg" class="license-msg" hidden></p>
          <button type="submit" class="btn btn-gold license-submit" id="licenseGateBtn">
            Activate license
          </button>
        </form>
        <p class="license-foot muted">Need help? Contact support with your receipt. <a href="#settings" class="link">Settings</a></p>
      </div>`;
  }

  function bindGateForm() {
    const form = document.getElementById("licenseGateForm");
    const keyInput = document.getElementById("licenseKey");
    const msg = document.getElementById("licenseGateMsg");
    const btn = document.getElementById("licenseGateBtn");

    keyInput?.addEventListener("input", e => {
      const pos = e.target.selectionStart;
      e.target.value = formatKeyInput(e.target.value);
      try { e.target.setSelectionRange(pos, pos); } catch (_) { /* */ }
    });

    form?.addEventListener("submit", async e => {
      e.preventDefault();
      if (!msg || !btn) return;
      msg.hidden = true;
      msg.className = "license-msg";
      btn.disabled = true;
      btn.textContent = "Activating…";
      try {
        await activate(
          document.getElementById("licenseEmail")?.value,
          document.getElementById("licenseKey")?.value
        );
        msg.textContent = "License activated! Opening your library…";
        msg.className = "license-msg license-msg-ok";
        msg.hidden = false;
        setTimeout(() => api.renderFromState?.(), 600);
      } catch (err) {
        msg.textContent = err.message || "Activation failed. Check your email and key.";
        msg.className = "license-msg license-msg-err";
        msg.hidden = false;
      } finally {
        btn.disabled = false;
        btn.textContent = "Activate license";
      }
    });
  }

  function renderGatePage() {
    api.renderShell(renderGateHtml(), {
      title: "Activate",
      tab: "library",
      bind: bindGateForm,
    });
  }

  function showActivationModal(opts) {
    const root = document.getElementById("modalRoot");
    if (!root) return;
    const reason = opts?.reason ? `<p class="muted">${esc(opts.reason)}</p>` : "";
    const lic = ensureLicenseState();
    root.innerHTML = `
      <div class="modal-backdrop license-modal-bd" id="licenseModalBd">
        <div class="modal license-modal">
          <div class="license-modal-head">
            <span class="license-modal-icon">🔐</span>
            <h3>Activate your license</h3>
            ${reason}
          </div>
          <form id="licenseModalForm" class="license-form">
            <label class="license-field">
              <span>Email</span>
              <input type="email" id="licenseModalEmail" value="${esc(lic.email)}" required />
            </label>
            <label class="license-field">
              <span>License key</span>
              <input type="text" id="licenseModalKey" value="${esc(lic.licenseKey)}"
                placeholder="XXXX-XXXX-XXXX-XXXX" maxlength="19" required />
            </label>
            <p id="licenseModalMsg" class="license-msg" hidden></p>
            <div class="modal-actions license-modal-actions">
              <button type="button" class="btn btn-ghost" id="licenseModalCancel">Later</button>
              <button type="submit" class="btn btn-gold" id="licenseModalBtn">Activate</button>
            </div>
          </form>
        </div>
      </div>`;

    document.getElementById("licenseModalKey")?.addEventListener("input", e => {
      e.target.value = formatKeyInput(e.target.value);
    });
    document.getElementById("licenseModalCancel")?.addEventListener("click", () => {
      root.innerHTML = "";
    });
    document.getElementById("licenseModalBd")?.addEventListener("click", e => {
      if (e.target.id === "licenseModalBd") root.innerHTML = "";
    });
    document.getElementById("licenseModalForm")?.addEventListener("submit", async e => {
      e.preventDefault();
      const msg = document.getElementById("licenseModalMsg");
      const btn = document.getElementById("licenseModalBtn");
      if (!msg || !btn) return;
      msg.hidden = true;
      btn.disabled = true;
      try {
        await activate(
          document.getElementById("licenseModalEmail")?.value,
          document.getElementById("licenseModalKey")?.value
        );
        root.innerHTML = "";
        api.renderFromState?.();
      } catch (err) {
        msg.textContent = err.message || "Activation failed";
        msg.className = "license-msg license-msg-err";
        msg.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
  }

  function requirePremium(featureLabel) {
    if (isLicensed()) return true;
    showActivationModal({
      reason: featureLabel
        ? `${featureLabel} requires an active license on this device.`
        : "This feature requires an active license.",
    });
    return false;
  }

  function requireBookAccess(book, opts = {}) {
    if (!isEnforced()) return true;
    if (!isLicensed()) {
      showActivationModal({
        reason: opts.reason || "Activate your license to open this book.",
      });
      return false;
    }
    if (canAccessBook(book)) return true;
    const ents = getEntitlements().join(", ") || "none";
    showActivationModal({
      reason:
        opts.reason ||
        `“${book.title || book.id}” is not included in your plan (entitlements: ${ents}). Upgrade or choose another series pack.`,
    });
    return false;
  }

  function settingsSectionHtml() {
    const lic = ensureLicenseState();
    const base = getApiBase();
    const ents = getEntitlements();
    const entLine =
      isEnforced() && isLicensed()
        ? `<p class="muted license-status-meta">Entitlements: <code>${esc(ents.join(", ") || "—")}</code></p>`
        : "";
    return `
      <hr class="settings-divider" />
      <h2 class="settings-section-title">License &amp; account</h2>
      ${builtInApiBase()
        ? `<p class="muted">This edition requires an active subscription. Activate with the email and key from your purchase.</p>`
        : `<p class="muted">Connect to your license server to unlock the full library, sync, and PDF export. Leave blank for offline / unrestricted APKs.</p>
      <label>License server URL
        <input type="url" id="apiBaseUrl" placeholder="https://api.yoursite.com"
          value="${esc(api.state.settings.apiBaseUrl || "")}" />
      </label>`}
      <div class="license-status-card ${licenseStatusBadgeClass()}">
        <div class="license-status-top">
          <span class="license-status-dot"></span>
          <strong>${esc(licenseStatusLabel())}</strong>
        </div>
        ${lic.email ? `<p class="muted license-status-email">${esc(lic.email)}</p>` : ""}
        ${lic.licenseKey && lic.valid ? `<p class="license-key-display"><code>${esc(lic.licenseKey)}</code></p>` : ""}
        ${entLine}
        ${lic.lastChecked ? `<p class="muted license-status-meta">Last verified ${new Date(lic.lastChecked).toLocaleString()}</p>` : ""}
        <div class="license-status-actions">
          <button type="button" class="btn btn-gold btn-sm" id="btnLicenseActivate">Activate / update</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnLicenseRefresh">Verify status</button>
          ${lic.email ? `<button type="button" class="btn btn-ghost btn-sm" id="btnLicenseSignOut">Sign out license</button>` : ""}
        </div>
      </div>
      ${base ? `<p class="muted">Device: <code>${esc(deviceId())}</code></p>` : ""}`;
  }

  function bindSettingsSection() {
    document.getElementById("apiBaseUrl")?.addEventListener("change", e => {
      api.state.settings.apiBaseUrl = e.target.value.trim();
      api.saveState();
    });
    document.getElementById("btnLicenseActivate")?.addEventListener("click", () => {
      showActivationModal({ reason: "Enter the email and key from your purchase." });
    });
    document.getElementById("btnLicenseRefresh")?.addEventListener("click", async () => {
      if (!getApiBase()) return alert("Set license server URL first.");
      try {
        if (!ensureLicenseState().email) {
          showActivationModal({});
          return;
        }
        await refreshStatus();
        alert(isLicensed() ? "License is active on this device." : "License is not active. Try activating again.");
        api.renderFromState?.();
      } catch (err) {
        alert(err.message || "Could not verify license.");
      }
    });
    document.getElementById("btnLicenseSignOut")?.addEventListener("click", () => {
      if (!confirm("Remove license from this device? You can activate again with your key.")) return;
      clearLicense();
      api.renderFromState?.();
    });
  }

  async function init(app) {
    api = app;
    ensureLicenseState();
    const builtIn = builtInApiBase();
    if (builtIn && api.state.settings && api.state.settings.apiBaseUrl !== builtIn) {
      api.state.settings.apiBaseUrl = builtIn;
      api.saveState?.();
    }
    if (isEnforced() && ensureLicenseState().email && ensureLicenseState().licenseKey) {
      try {
        await refreshStatus();
      } catch (_) {
        /* offline — keep last known state */
      }
    }
  }

  function shouldGateRoute(route) {
    if (!isEnforced() || isLicensed()) return false;
    const exempt = ["settings"];
    return !exempt.includes(route);
  }

  window.AmpsLicense = {
    init,
    activate,
    refreshStatus,
    isLicensed,
    isEnforced,
    getEntitlements,
    canAccessBook,
    requirePremium,
    requireBookAccess,
    showActivationModal,
    renderGatePage,
    renderGateHtml,
    bindGateForm,
    shouldGateRoute,
    settingsSectionHtml,
    bindSettingsSection,
    deviceId,
    clearLicense,
  };
})();

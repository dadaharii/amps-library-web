/* AMPS Reader — English → Hindi translation with local cache (summaries) */
(function () {
  "use strict";

  const CACHE_KEY = "amps-summary-hi-cache";
  const MAX_CACHE = 4000;

  function loadCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    } catch (_) {
      return {};
    }
  }

  function saveCache(cache) {
    try {
      const keys = Object.keys(cache);
      if (keys.length > MAX_CACHE) {
        keys.slice(0, keys.length - MAX_CACHE).forEach(k => delete cache[k]);
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (_) { /* quota */ }
  }

  function cacheKey(text) {
    return String(text || "").trim().slice(0, 500);
  }

  async function translateEnHi(text) {
    const src = String(text || "").trim();
    if (!src) return "";
    const cache = loadCache();
    const key = cacheKey(src);
    if (cache[key]) return cache[key];

    const url = "https://api.mymemory.translated.net/get?q="
      + encodeURIComponent(src.slice(0, 480))
      + "&langpair=en|hi";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Translation failed");
    const data = await res.json();
    const out = (data.responseData?.translatedText || src).trim();
    if (out && out.toUpperCase() !== src.toUpperCase()) {
      cache[key] = out;
      saveCache(cache);
    }
    return out || src;
  }

  async function translateBatch(texts, onProgress) {
    const list = Array.isArray(texts) ? texts : [texts];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      if (onProgress) onProgress(i, list.length);
      try {
        out.push(await translateEnHi(list[i]));
      } catch (_) {
        out.push(list[i]);
      }
      if (i < list.length - 1) await new Promise(r => setTimeout(r, 120));
    }
    return out;
  }

  async function localizeSummaries(texts, lang) {
    if (lang !== "hi") return texts;
    return translateBatch(texts);
  }

  window.AmpsTranslate = {
    translateEnHi,
    translateBatch,
    localizeSummaries,
    loadCache,
  };
})();

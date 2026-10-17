/**
 * HTTP-клиент к Cards Game API + Telegram WebApp helpers.
 */
(function () {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const FETCH_TIMEOUT_MS = 12000;

  function getInitData() {
    if (tg && tg.initData) return tg.initData;
    return localStorage.getItem("dev_init_data") || "";
  }

  function apiBase() {
    return (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || "";
  }

  async function request(path, opts = {}) {
    const base = apiBase();
    if (!base || base.includes("YOUR-BOTHOST") || base.includes("example.com")) {
      const err = new Error("API_BASE не настроен (js/config.js)");
      err.status = 0;
      err.code = "NO_API_BASE";
      throw err;
    }
    const url = path.startsWith("http") ? path : `${base}${path}`;
    const headers = Object.assign(
      { Accept: "application/json" },
      opts.headers || {}
    );
    const initData = getInitData();
    if (initData) {
      headers["X-Telegram-Init-Data"] = initData;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout || FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: opts.method || "GET",
        headers,
        body: opts.body,
        credentials: "omit",
        signal: ctrl.signal,
      });
      if (!res.ok) {
        let detail = res.statusText;
        try {
          const j = await res.json();
          detail = j.detail || j.error || detail;
        } catch (_) {}
        const err = new Error(
          typeof detail === "string" ? detail : JSON.stringify(detail)
        );
        err.status = res.status;
        throw err;
      }
      if (res.status === 204) return null;
      return res.json();
    } catch (e) {
      if (e.name === "AbortError") {
        const err = new Error("Таймаут запроса к API");
        err.status = 0;
        err.code = "TIMEOUT";
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  window.API = {
    health: () => request("/health", { timeout: 6000 }),
    rarities: () => request("/api/rarities"),
    cards: (params = {}) => {
      const q = new URLSearchParams();
      if (params.rarity && params.rarity !== "all") q.set("rarity", params.rarity);
      if (params.page != null) q.set("page", params.page);
      if (params.limit != null) q.set("limit", params.limit);
      if (params.q) q.set("q", params.q);
      const s = q.toString();
      return request(`/api/cards${s ? "?" + s : ""}`);
    },
    card: (id) => request(`/api/cards/${id}`),
    top: (kind = "coins", limit = 20) =>
      request(`/api/top?kind=${encodeURIComponent(kind)}&limit=${limit}`),
    stats: () => request("/api/stats"),
    me: () => request("/api/me"),
    myCollection: (params = {}) => {
      const q = new URLSearchParams();
      if (params.rarity && params.rarity !== "all") q.set("rarity", params.rarity);
      if (params.page != null) q.set("page", params.page);
      if (params.limit != null) q.set("limit", params.limit);
      const s = q.toString();
      return request(`/api/me/collection${s ? "?" + s : ""}`);
    },
    activity: (range = "week") =>
      request(`/api/me/activity?range=${encodeURIComponent(range)}`),
    user: (id) => request(`/api/users/${id}`),
    userCollection: (id, params = {}) => {
      const q = new URLSearchParams();
      if (params.rarity && params.rarity !== "all") q.set("rarity", params.rarity);
      if (params.page != null) q.set("page", params.page);
      if (params.limit != null) q.set("limit", params.limit);
      const s = q.toString();
      return request(`/api/users/${id}/collection${s ? "?" + s : ""}`);
    },
    getInitData,
    apiBase,
    tg,
  };
})();

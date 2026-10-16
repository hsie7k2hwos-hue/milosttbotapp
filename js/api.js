/**
 * HTTP-клиент к Cards Game API + Telegram WebApp helpers.
 */
(function () {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  function getInitData() {
    if (tg && tg.initData) return tg.initData;
    // dev fallback
    return localStorage.getItem("dev_init_data") || "";
  }

  async function request(path, opts = {}) {
    const base = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || "";
    const url = path.startsWith("http") ? path : `${base}${path}`;
    const headers = Object.assign(
      { Accept: "application/json" },
      opts.headers || {}
    );
    const initData = getInitData();
    if (initData) {
      headers["X-Telegram-Init-Data"] = initData;
    }
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body,
      credentials: "omit",
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const j = await res.json();
        detail = j.detail || j.error || detail;
      } catch (_) {}
      const err = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    return res.json();
  }

  window.API = {
    health: () => request("/health"),
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
    user: (id) => request(`/api/users/${id}`),
    getInitData,
    tg,
  };
})();

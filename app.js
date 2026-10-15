/**
 * Мряу Mini App
 * Hosted on Vercel. API on BotHost.
 *
 * Env (build-time via window or meta):
 *   window.__API_BASE__  — e.g. https://your-bot.bothost.io
 * Or set in vercel.json / index as fallback.
 */
(function () {
  "use strict";

  // ── Config ──────────────────────────────────────────────────────────────
  const API_BASE =
    (typeof window !== "undefined" && window.__API_BASE__) ||
    document.querySelector('meta[name="api-base"]')?.content ||
    ""; // empty = same origin (if reverse-proxied)

  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor("#1a1d28");
      tg.setBackgroundColor("#12141c");
    } catch (_) {}
  }

  // ── State ───────────────────────────────────────────────────────────────
  const state = {
    me: null,
    tab: "cards",
    collection: null,
    rarityFilter: null,
    topKind: "coins",
    top: null,
    profileTarget: null, // user_id or null (= me)
    profileData: null,
    viewingOther: false,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ── API ─────────────────────────────────────────────────────────────────
  function getInitData() {
    return tg?.initData || "";
  }

  async function api(path, opts = {}) {
    const url = `${API_BASE}${path}`;
    const headers = {
      Accept: "application/json",
      ...(opts.headers || {}),
    };
    const initData = getInitData();
    if (initData) {
      headers["Authorization"] = `tma ${initData}`;
      headers["X-Telegram-Init-Data"] = initData;
    }

    const res = await fetch(url, { ...opts, headers });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const j = await res.json();
        detail = j.detail || detail;
      } catch (_) {}
      const err = new Error(detail);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  function photoUrl(card) {
    if (!card?.photo_url) return null;
    if (card.photo_url.startsWith("http")) return card.photo_url;
    return `${API_BASE}${card.photo_url}`;
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString("ru-RU");
  }

  function plural(n, one, few, many) {
    n = Math.abs(n) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 === 1) return one;
    if (n1 >= 2 && n1 <= 4) return few;
    return many;
  }

  function fmtDays(n) {
    return `${fmt(n)} ${plural(n, "день", "дня", "дней")}`;
  }

  // ── Header ──────────────────────────────────────────────────────────────
  function updateHeader() {
    const me = state.me;
    if (!me) return;
    $("#hdr-coins .val").textContent = fmt(me.coins);
    $("#hdr-streak .val").textContent = fmt(me.streak);
    $("#hdr-name").textContent = me.nickname || "…";
  }

  // ── Render helpers ──────────────────────────────────────────────────────
  function showLoader() {
    $("#content").innerHTML = `
      <div class="loader"><div class="spinner"></div><p>Загрузка…</p></div>
    `;
  }

  function showError(msg) {
    $("#content").innerHTML = `
      <div class="error-box">
        <div class="title">Ошибка</div>
        <p>${escapeHtml(msg)}</p>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Cards tab ───────────────────────────────────────────────────────────
  async function loadCollection() {
    const q = state.rarityFilter
      ? `?rarity=${encodeURIComponent(state.rarityFilter)}`
      : "";
    state.collection = await api(`/api/collection${q}`);
  }

  function renderCards() {
    const col = state.collection;
    if (!col) return;

    const chips = [
      {
        key: null,
        label: "Все",
        cnt: col.total_owned,
      },
      ...col.rarity_stats.map((r) => ({
        key: r.key,
        label: `${r.icon} ${r.name}`,
        cnt: r.owned,
      })),
    ];

    let html = `<div class="section-title">Собрано ${fmt(col.total_owned)} из ${fmt(col.total_in_game)}</div>`;
    html += `<div class="rarity-row">`;
    for (const c of chips) {
      const active =
        (c.key === null && !state.rarityFilter) ||
        c.key === state.rarityFilter
          ? " active"
          : "";
      html += `<button class="chip${active}" data-rarity="${c.key ?? ""}" type="button">
        ${escapeHtml(c.label)}<span class="cnt">${fmt(c.cnt)}</span>
      </button>`;
    }
    html += `</div>`;

    if (!col.cards.length) {
      html += `
        <div class="empty-state">
          <div class="emoji">🃏</div>
          <p>Пока нет карточек этой редкости</p>
        </div>`;
    } else {
      html += `<div class="cards-grid">`;
      for (const card of col.cards) {
        const src = photoUrl(card);
        html += `
          <div class="card-item rarity-${escapeHtml(card.rarity)}" data-id="${card.id}">
            <div class="thumb">
              ${
                src
                  ? `<img src="${escapeHtml(src)}" alt="" loading="lazy" onerror="this.parentNode.innerHTML='<span class=placeholder>🃏</span>'" />`
                  : `<span class="placeholder">🃏</span>`
              }
            </div>
            <div class="meta">
              <div class="name">${escapeHtml(card.name)}</div>
              <div class="rarity-line">${escapeHtml(card.rarity_icon)} ${escapeHtml(card.rarity_name)}</div>
            </div>
          </div>`;
      }
      html += `</div>`;
    }

    $("#content").innerHTML = html;

    $$(".chip").forEach((el) => {
      el.addEventListener("click", async () => {
        const r = el.dataset.rarity || null;
        if (r === (state.rarityFilter || "")) return;
        state.rarityFilter = r;
        showLoader();
        try {
          await loadCollection();
          renderCards();
        } catch (e) {
          showError(e.message);
        }
      });
    });

    $$(".card-item").forEach((el) => {
      el.addEventListener("click", () => {
        const id = Number(el.dataset.id);
        const card = col.cards.find((c) => c.id === id);
        if (card) openCardModal(card);
      });
    });
  }

  function openCardModal(card) {
    const src = photoUrl(card);
    const reward = Number(card.reward || 0);
    const rewardStr =
      reward < 0
        ? `−${fmt(Math.abs(reward))} 🪙`
        : `+${fmt(reward)} 🪙`;

    $("#card-modal-body").innerHTML = `
      ${
        src
          ? `<img class="card-img" src="${escapeHtml(src)}" alt="" />`
          : `<div class="card-img" style="display:flex;align-items:center;justify-content:center;font-size:48px">🃏</div>`
      }
      <div class="card-title">${escapeHtml(card.name)}</div>
      <div class="card-rarity">${escapeHtml(card.rarity_icon)} ${escapeHtml(card.rarity_name)}</div>
      <div class="card-reward">${rewardStr}</div>
    `;
    $("#card-modal").classList.remove("hidden");
    try {
      tg?.HapticFeedback?.impactOccurred("light");
    } catch (_) {}
  }

  function closeModal() {
    $("#card-modal").classList.add("hidden");
  }

  // ── Top tab ─────────────────────────────────────────────────────────────
  async function loadTop() {
    state.top = await api(`/api/top?kind=${state.topKind}&limit=20`);
  }

  function renderTop() {
    const t = state.top;
    if (!t) return;

    const kinds = [
      { key: "coins", label: "🪙 Монеты" },
      { key: "cards", label: "🃏 Карточки" },
      { key: "streak", label: "🔥 Стрик" },
    ];

    let html = `<div class="top-kinds">`;
    for (const k of kinds) {
      html += `<button class="kind-btn${k.key === state.topKind ? " active" : ""}" data-kind="${k.key}" type="button">${k.label}</button>`;
    }
    html += `</div>`;

    const unit =
      state.topKind === "cards" ? "🃏" : state.topKind === "streak" ? "🔥" : "🪙";

    html += `<div class="top-list">`;
    for (const row of t.items) {
      let rankClass = "";
      if (row.rank === 1) rankClass = " gold";
      else if (row.rank === 2) rankClass = " silver";
      else if (row.rank === 3) rankClass = " bronze";

      const medal =
        row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : row.rank;

      html += `
        <div class="top-row${row.is_me ? " me" : ""}" data-uid="${row.user_id}">
          <div class="top-rank${rankClass}">${medal}</div>
          <div class="top-nick">${escapeHtml(row.nickname)}</div>
          <div class="top-value">${fmt(row.value)} ${unit}</div>
        </div>`;
    }
    html += `</div>`;

    html += `
      <div class="my-rank-bar">
        <span>Ваше место: <strong>#${fmt(t.me.rank)}</strong></span>
        <span><strong>${fmt(t.me.value)}</strong> ${unit}</span>
      </div>`;

    $("#content").innerHTML = html;

    $$(".kind-btn").forEach((el) => {
      el.addEventListener("click", async () => {
        const k = el.dataset.kind;
        if (k === state.topKind) return;
        state.topKind = k;
        showLoader();
        try {
          await loadTop();
          renderTop();
        } catch (e) {
          showError(e.message);
        }
      });
    });

    $$(".top-row").forEach((el) => {
      el.addEventListener("click", () => {
        const uid = Number(el.dataset.uid);
        openProfile(uid);
      });
    });
  }

  // ── Profile tab ─────────────────────────────────────────────────────────
  async function loadProfile(userId) {
    if (!userId || userId === state.me?.user_id) {
      state.profileData = { ...state.me, is_own: true };
      state.viewingOther = false;
      return;
    }
    state.profileData = await api(`/api/profile/${userId}`);
    state.viewingOther = true;
  }

  function renderProfile() {
    const p = state.profileData;
    if (!p) return;

    let html = "";
    if (state.viewingOther) {
      html += `<button class="back-btn" id="back-to-top" type="button">‹ Назад к топу</button>`;
    }

    html += `
      <div class="profile-card">
        <div class="profile-avatar">👤</div>
        <div class="profile-name">${escapeHtml(p.nickname)}</div>
        <div class="profile-id">ID ${p.user_id}</div>
        <div class="profile-stats">
          <div class="pstat">
            <span class="num">${fmt(p.coins)}</span>
            <div class="lbl">монет</div>
          </div>
          <div class="pstat">
            <span class="num">${fmt(p.cards_count)}</span>
            <div class="lbl">из ${fmt(p.total_cards)}</div>
          </div>
          <div class="pstat">
            <span class="num">${fmt(p.streak)}</span>
            <div class="lbl">${plural(p.streak, "день", "дня", "дней")}</div>
          </div>
        </div>
      </div>`;

    if (p.is_own) {
      html += `
        <div class="section-title">О себе</div>
        <div class="error-box" style="text-align:left">
          <p style="color:var(--text);margin-bottom:8px">Стрик обновляется, когда вы получаете карточку каждый день.</p>
          <p style="color:var(--muted);font-size:13px">Если пропустить больше 24 часов — серия сгорает.</p>
        </div>`;
    } else {
      html += `
        <div class="empty-state">
          <div class="emoji">🔒</div>
          <p>Коллекция карточек этого игрока скрыта</p>
        </div>`;
    }

    $("#content").innerHTML = html;

    const back = $("#back-to-top");
    if (back) {
      back.addEventListener("click", () => {
        state.viewingOther = false;
        state.profileTarget = null;
        // вернуться на вкладку топа
        switchTab("top", false);
      });
    }
  }

  async function openProfile(userId) {
    state.profileTarget = userId;
    // переключаем визуально на профиль
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === "profile"));
    state.tab = "profile";
    showLoader();
    try {
      await loadProfile(userId);
      renderProfile();
    } catch (e) {
      showError(e.message);
    }
  }

  // ── Tabs ────────────────────────────────────────────────────────────────
  async function switchTab(name, reload = true) {
    state.tab = name;
    state.viewingOther = false;
    state.profileTarget = null;
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    showLoader();
    try {
      if (name === "cards") {
        if (reload || !state.collection) await loadCollection();
        renderCards();
      } else if (name === "top") {
        if (reload || !state.top) await loadTop();
        renderTop();
      } else if (name === "profile") {
        await loadProfile(state.me.user_id);
        renderProfile();
      }
    } catch (e) {
      showError(e.message || "Не удалось загрузить");
    }
  }

  // ── Init ────────────────────────────────────────────────────────────────
  async function init() {
    // modal close
    $$("[data-close]").forEach((el) => el.addEventListener("click", closeModal));

    $$(".tab").forEach((el) => {
      el.addEventListener("click", () => {
        const tab = el.dataset.tab;
        if (tab === state.tab && !state.viewingOther) return;
        switchTab(tab);
      });
    });

    if (!getInitData() && !location.search.includes("debug")) {
      // вне Telegram — предупреждение
      showError("Откройте мини-приложение из Telegram-бота «Мряу».");
      return;
    }

    showLoader();
    try {
      state.me = await api("/api/me");
      updateHeader();
      await switchTab("cards");
    } catch (e) {
      console.error(e);
      if (e.status === 403) {
        showError("Доступ ограничен. Вы заблокированы.");
      } else if (e.status === 401) {
        showError("Не удалось авторизоваться. Перезапустите мини-приложение.");
      } else {
        showError(e.message || "Ошибка соединения с сервером");
      }
    }
  }

  init();
})();

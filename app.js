/**
 * Мряу Mini App — реальные данные из API бота
 *
 * Настройка: в index.html задай
 *   window.MEOW_API_BASE = "https://api.твой-домен.com";
 */

(function () {
  "use strict";

  const API_BASE = (window.MEOW_API_BASE || "").replace(/\/$/, "");

  const RARITIES = {
    common: { icon: "⚪", name: "Обычная" },
    rare: { icon: "🔵", name: "Редкая" },
    epic: { icon: "🟣", name: "Эпическая" },
    mythical: { icon: "🔴", name: "Мифическая" },
    legendary: { icon: "🟡", name: "Легендарная" },
  };

  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor("#0f0f13");
      tg.setBackgroundColor("#0f0f13");
    } catch (_) {}
  }

  function getInitData() {
    return tg?.initData || "";
  }

  function isTelegram() {
    return !!(tg && tg.initData);
  }

  function isAdminRole(role) {
    return role === "admin" || role === "superadmin";
  }

  // ── Fatal overlay (blocks entire UI) ──
  function showFatal(title, message, steps) {
    const overlay = document.getElementById("fatalOverlay");
    const app = document.getElementById("app");
    document.getElementById("fatalTitle").textContent = title || "Ошибка";
    document.getElementById("fatalMessage").textContent = message || "";
    const ol = document.getElementById("fatalSteps");
    ol.innerHTML = "";
    if (steps && steps.length) {
      steps.forEach((s) => {
        const li = document.createElement("li");
        li.innerHTML = s;
        ol.appendChild(li);
      });
    }
    overlay.classList.remove("hidden");
    app.classList.add("is-blocked");
  }

  function hideFatal() {
    document.getElementById("fatalOverlay").classList.add("hidden");
    document.getElementById("app").classList.remove("is-blocked");
  }

  async function api(path, options = {}) {
    if (!API_BASE || API_BASE.includes("YOUR-API-HOST")) {
      throw new Error(
        'API не настроен. В index.html укажи URL сервера с api.py, например https://api.example.com'
      );
    }
    const initData = getInitData();
    if (!initData) {
      throw new Error(
        "Открой мини-аппку из Telegram (кнопка бота). Без initData API недоступен."
      );
    }

    const url = API_BASE + path;
    let res;
    try {
      res = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": initData,
          ...(options.headers || {}),
        },
      });
    } catch (netErr) {
      throw new Error(
        "Сеть: не удалось связаться с API (" + url + "). Проверь HTTPS и CORS."
      );
    }

    let data = null;
    try {
      data = await res.json();
    } catch (_) {}

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(
          "404 на " +
            url +
            " — это не сервер api.py. MEOW_API_BASE должен указывать на хост, где крутится uvicorn api:app."
        );
      }
      if (res.status === 403) {
        throw new Error(
          (data && (data.detail || data.message)) || "Доступ запрещён"
        );
      }
      const msg =
        (data && (data.detail || data.message)) || ("Ошибка " + res.status);
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return data;
  }

  let me = null;
  let collection = null;
  let market = null;
  let topData = null;
  let adminData = null;
  let currentFilter = "all";
  let topKind = "coins";
  let browserRarity = null;
  let browserPage = 0;
  let browserData = null;
  let adminNavInjected = false;

  function fmt(n) {
    return Number(n || 0).toLocaleString("ru-RU").replace(/\s/g, "\u00a0");
  }

  function toast(msg, duration = 2800) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), duration);
  }

  function haptic(type = "light") {
    try {
      if (tg?.HapticFeedback) {
        if (type === "success") tg.HapticFeedback.notificationOccurred("success");
        else if (type === "error") tg.HapticFeedback.notificationOccurred("error");
        else tg.HapticFeedback.impactOccurred(type);
      }
    } catch (_) {}
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function rarityEmoji(r) {
    return (
      { common: "🃏", rare: "💠", epic: "🔮", mythical: "🔥", legendary: "⭐" }[
        r
      ] || "🃏"
    );
  }

  function cardPhotoSrc(card) {
    if (!API_BASE || !card) return null;
    if (card.photo_url) {
      return card.photo_url.startsWith("http")
        ? card.photo_url
        : API_BASE + card.photo_url;
    }
    if (card.id) return API_BASE + `/api/card/${card.id}/photo`;
    return null;
  }

  function setAvatar(el, photoUrl, fallbackEmoji) {
    if (!el) return;
    const fallback = fallbackEmoji || "🐱";
    el.innerHTML = `<span class="avatar-fallback">${fallback}</span>`;
    el.classList.remove("has-photo");
    if (!photoUrl) return;
    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.src = photoUrl;
    img.onload = () => {
      el.classList.add("has-photo");
    };
    img.onerror = () => {
      el.classList.remove("has-photo");
      if (img.parentNode) img.remove();
    };
    el.appendChild(img);
  }

  // ── Header / Profile ──
  function renderHeader() {
    if (!me) return;
    document.getElementById("userNickname").textContent = me.nickname;
    document.getElementById("userId").textContent = `ID ${me.user_id}`;
    document.getElementById("coinsValue").textContent = fmt(me.coins);
    document.getElementById("gemsValue").textContent = fmt(me.gems);
    setAvatar(document.getElementById("userAvatar"), me.photo_url, "🐱");
  }

  function renderProfile() {
    if (!me) return;
    document.getElementById("profileName").textContent = me.nickname;
    document.getElementById("profileRole").textContent = me.role_display;
    document.getElementById("statCards").textContent = fmt(me.cards_count);
    document.getElementById("statStreak").textContent = me.streak;
    document.getElementById("statDays").textContent = me.days_with_us;

    const parts = (me.gender_display || "— Не задан").split(" ");
    document.querySelector("#genderRow .gender-icon").textContent =
      parts[0] || "—";
    document.querySelector("#genderRow .gender-text").textContent =
      parts.slice(1).join(" ") || "Не задан";

    setAvatar(document.getElementById("profileAvatar"), me.photo_url, "🐱");

    const hint = document.getElementById("claimHint");
    if (me.can_claim_free) {
      hint.textContent = "Готово ✓";
      hint.style.color = "var(--success)";
    } else {
      const rem = me.cooldown_remaining || 0;
      const h = Math.floor(rem / 3600);
      const m = Math.floor((rem % 3600) / 60);
      hint.textContent = h > 0 ? `через ${h} ч ${m} мин` : `через ${m} мин`;
      hint.style.color = "";
    }
  }

  function ensureAdminNav() {
    if (!me || !isAdminRole(me.role) || adminNavInjected) return;
    const nav = document.getElementById("bottomNav");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-btn admin-nav";
    btn.dataset.tab = "admin";
    btn.innerHTML =
      '<span class="nav-icon">🛡</span><span class="nav-label">Админ</span>';
    btn.addEventListener("click", () => switchTab("admin"));
    nav.appendChild(btn);
    adminNavInjected = true;
  }

  // ── Collection ──
  function renderRarityFilters() {
    const container = document.getElementById("rarityFilters");
    if (!collection) {
      container.innerHTML = "";
      return;
    }
    const stats = collection.stats || {};
    const totals = collection.rarity_totals || {};

    let html = `<button type="button" class="filter-chip ${
      currentFilter === "all" ? "active" : ""
    }" data-rarity="all">Все</button>`;

    for (const [key, info] of Object.entries(RARITIES)) {
      const cnt = stats[key] || 0;
      if (cnt === 0 && currentFilter !== key) continue;
      const tot = totals[key] || 0;
      html += `<button type="button" class="filter-chip ${
        currentFilter === key ? "active" : ""
      }" data-rarity="${key}">
        ${info.icon} ${info.name} · ${cnt}${tot ? "/" + tot : ""}
      </button>`;
    }
    container.innerHTML = html;

    container.querySelectorAll(".filter-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentFilter = btn.dataset.rarity;
        renderRarityFilters();
        renderCollection();
        haptic("light");
      });
    });
  }

  function renderCollection() {
    const grid = document.getElementById("cardsGrid");
    if (!collection) {
      grid.innerHTML =
        '<div class="empty-state"><div class="empty-icon">⏳</div><p>Загрузка…</p></div>';
      return;
    }

    document.getElementById("collOwned").textContent = collection.owned_unique;
    document.getElementById("collTotal").textContent = collection.total_in_game;

    let items = collection.cards || [];
    if (currentFilter !== "all") {
      items = items.filter((c) => c.rarity === currentFilter);
    }

    if (items.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🃏</div>
          <p>Пока нет карточек</p>
          <p class="muted">Напиши «мряу» в боте, чтобы получить первую</p>
        </div>`;
      return;
    }

    grid.innerHTML = items
      .map((c) => {
        const emoji = rarityEmoji(c.rarity);
        const photoSrc = cardPhotoSrc(c);
        const img = photoSrc
          ? `<img class="card-img" src="${escAttr(photoSrc)}" alt="" loading="lazy" onerror="this.style.display='none';var e=this.nextElementSibling;if(e)e.style.display='inline'" /><span class="card-emoji" style="display:none">${emoji}</span>`
          : `<span class="card-emoji">${emoji}</span>`;
        return `
        <div class="card-item" data-id="${c.id}">
          <div class="card-thumb">
            ${img}
            <div class="card-rarity-bar ${c.rarity}"></div>
            ${c.amount > 1 ? `<div class="card-amount">×${c.amount}</div>` : ""}
          </div>
          <div class="card-body">
            <div class="card-name">${escHtml(c.name)}</div>
            <div class="card-meta">${c.rarity_icon} ${escHtml(c.rarity_name)}</div>
          </div>
        </div>`;
      })
      .join("");

    grid.querySelectorAll(".card-item").forEach((el) => {
      el.addEventListener("click", () => openCardModal(+el.dataset.id));
    });
  }

  // ── Market ──
  function renderMarket() {
    if (!market) return;
    document.getElementById("marketGems").textContent = fmt(market.gems);

    const list = document.getElementById("marketList");
    list.innerHTML = (market.rarities || [])
      .map((r) => {
        const done = !!r.collected;
        return `
        <div class="market-item ${done ? "is-done" : ""}" data-rarity="${r.key}" data-missing="${r.missing}">
          <div class="market-icon ${r.key}">${r.icon}</div>
          <div class="market-info-text">
            <div class="market-name">${escHtml(r.name)}</div>
            <div class="market-desc">${
              done ? "Все собраны" : `Не хватает ${r.missing} шт · нажми, чтобы купить`
            }</div>
          </div>
          ${
            done
              ? '<span class="market-done">✓ собрано</span>'
              : `<span class="market-price">${r.price} 💎</span>`
          }
        </div>`;
      })
      .join("");

    list.querySelectorAll(".market-item:not(.is-done)").forEach((el) => {
      el.addEventListener("click", () => {
        openMarketBrowser(el.dataset.rarity);
        haptic("light");
      });
    });
  }

  function showMarketList() {
    document.getElementById("marketBrowser").classList.add("hidden");
    document.getElementById("marketList").classList.remove("hidden");
    document.getElementById("exchangeCard").classList.remove("hidden");
    browserRarity = null;
    browserData = null;
  }

  async function openMarketBrowser(rarity) {
    browserRarity = rarity;
    browserPage = 0;
    document.getElementById("marketList").classList.add("hidden");
    document.getElementById("exchangeCard").classList.add("hidden");
    document.getElementById("marketBrowser").classList.remove("hidden");
    const info = RARITIES[rarity] || { name: rarity, icon: "" };
    document.getElementById("browserTitle").textContent =
      `${info.icon} ${info.name}`;
    await loadBrowserPage();
  }

  async function loadBrowserPage() {
    const box = document.getElementById("browserCard");
    const buyBtn = document.getElementById("browserBuy");
    box.innerHTML = '<div class="empty-state"><p>Загрузка…</p></div>';
    buyBtn.disabled = true;

    try {
      browserData = await api(
        `/api/market/cards?rarity=${encodeURIComponent(browserRarity)}&page=${browserPage}`
      );
    } catch (e) {
      box.innerHTML = `<div class="empty-state"><p>${escHtml(e.message)}</p></div>`;
      document.getElementById("browserPage").textContent = "—";
      document.getElementById("browserPrev").disabled = true;
      document.getElementById("browserNext").disabled = true;
      return;
    }

    const total = browserData.total || 0;
    const page = browserData.page || 0;
    browserPage = page;

    document.getElementById("browserPage").textContent =
      total ? `${page + 1} / ${total}` : "0 / 0";
    document.getElementById("browserPrev").disabled = page <= 0;
    document.getElementById("browserNext").disabled = page >= total - 1 || total === 0;

    if (!browserData.card || total === 0) {
      box.innerHTML =
        '<div class="empty-state"><div class="empty-icon">✓</div><p>Все карточки этой редкости собраны</p></div>';
      buyBtn.disabled = true;
      buyBtn.textContent = "Купить";
      return;
    }

    const card = browserData.card;
    const emoji = rarityEmoji(card.rarity);
    const photoSrc = cardPhotoSrc({
      id: card.id,
      photo_url: `/api/card/${card.id}/photo`,
    });
    const price = browserData.price || 0;
    const gems = browserData.gems || 0;

    box.innerHTML = `
      <div class="browser-thumb">
        ${
          photoSrc
            ? `<img src="${escAttr(photoSrc)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'" /><span class="card-emoji-lg" style="display:none">${emoji}</span>`
            : `<span class="card-emoji-lg">${emoji}</span>`
        }
      </div>
      <div class="browser-body">
        <div class="browser-name">${escHtml(card.name)}</div>
        <div class="browser-meta">${browserData.rarity_icon || ""} ${escHtml(
          browserData.rarity_name || card.rarity
        )} · ${price} 💎</div>
      </div>`;

    buyBtn.disabled = gems < price;
    buyBtn.textContent =
      gems < price
        ? `Нужно ${price} 💎 (у вас ${gems})`
        : `Купить за ${price} 💎`;
  }

  async function doBuyCurrent() {
    if (!browserData?.card) return;
    const cardId = browserData.card.id;
    try {
      const res = await api("/api/market/buy", {
        method: "POST",
        body: JSON.stringify({ card_id: cardId }),
      });
      toast(`✓ ${res.card?.name || "Карточка"} куплена`);
      haptic("success");
      if (me) {
        me.gems = res.gems;
        renderHeader();
        renderProfile();
      }
      await loadMarket();
      // reload same page index (list shrinks)
      await loadBrowserPage();
      if (browserData && browserData.total === 0) {
        showMarketList();
        renderMarket();
      }
      collection = null; // force refresh on next visit
    } catch (e) {
      toast(e.message || "Ошибка покупки");
      haptic("error");
    }
  }

  // ── Top ──
  function renderTop() {
    const list = document.getElementById("topList");
    if (!topData) {
      list.innerHTML = '<div class="empty-state"><p>Загрузка…</p></div>';
      return;
    }

    const unit = topData.unit || "";
    const medals = ["🥇", "🥈", "🥉"];
    const data = topData.top || [];

    list.innerHTML = data
      .map((row, i) => {
        const rankClass =
          i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
        const rank = i < 3 ? medals[i] : `${i + 1}.`;
        return `
        <div class="top-row">
          <div class="top-rank ${rankClass}">${rank}</div>
          <div class="top-nick">${escHtml(row.nickname)}</div>
          <div class="top-value">${fmt(row.value)} ${unit}</div>
        </div>`;
      })
      .join("");

    const meRow = topData.me || {};
    document.getElementById("myRank").innerHTML = `
      📌 Ваше место · <b>#${meRow.rank || "—"}</b><br>
      ${escHtml(meRow.nickname || "")} · <b>${fmt(meRow.value)}</b> ${unit}`;
  }

  // ── Admin ──
  function renderAdmin() {
    const statsEl = document.getElementById("adminStats");
    const logEl = document.getElementById("adminLog");
    if (!adminData) {
      statsEl.innerHTML = '<div class="empty-state"><p>Загрузка…</p></div>';
      logEl.innerHTML = "";
      return;
    }

    const s = adminData.stats || {};
    statsEl.innerHTML = `
      <div class="admin-stat-card">
        <div class="label">Игроков</div>
        <div class="value">${fmt(s.users_total || 0)}</div>
      </div>
      <div class="admin-stat-card">
        <div class="label">Карточек в игре</div>
        <div class="value">${fmt(s.cards_total || 0)}</div>
      </div>
      <div class="admin-stat-card">
        <div class="label">Выдано (шт)</div>
        <div class="value">${fmt(s.inventory_total || 0)}</div>
      </div>
      <div class="admin-stat-card">
        <div class="label">Забанено</div>
        <div class="value">${fmt(s.banned || 0)}</div>
      </div>
      <div class="admin-stat-card">
        <div class="label">Монет в обороте</div>
        <div class="value">${fmt(s.coins_sum || 0)}</div>
      </div>
      <div class="admin-stat-card">
        <div class="label">Кристаллов</div>
        <div class="value">${fmt(s.gems_sum || 0)}</div>
      </div>`;

    const logs = adminData.recent || [];
    if (!logs.length) {
      logEl.innerHTML =
        '<div class="empty-state"><p>Нет недавних получений</p></div>';
      return;
    }

    logEl.innerHTML = logs
      .map((row) => {
        const t = row.claim_time
          ? new Date(row.claim_time * 1000).toLocaleString("ru-RU", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—";
        return `
        <div class="admin-log-row">
          <div class="time">${escHtml(t)}</div>
          <div class="body">
            <b>${escHtml(row.nickname || "User" + row.user_id)}</b>
            получил ${row.rarity_icon || ""} ${escHtml(row.card_name || "?")}
            ${row.amount > 1 ? "×" + row.amount : ""}
          </div>
        </div>`;
      })
      .join("");
  }

  // ── Modal ──
  async function openCardModal(cardId) {
    const local =
      collection && (collection.cards || []).find((c) => c.id === cardId);
    if (local) {
      showModal(local);
      return;
    }
    try {
      const card = await api(`/api/card/${cardId}`);
      showModal(card);
    } catch (e) {
      toast(e.message || "Ошибка");
      haptic("error");
    }
  }

  function showModal(card) {
    const modalPhoto = document.getElementById("modalPhoto");
    const photoSrc = cardPhotoSrc(card);
    const emoji = rarityEmoji(card.rarity);
    if (photoSrc) {
      modalPhoto.innerHTML = `<img src="${escAttr(photoSrc)}" alt="" onerror="this.parentNode.innerHTML='<span class=\\'card-emoji-lg\\'>${emoji}</span>'" />`;
    } else {
      modalPhoto.innerHTML = `<span class="card-emoji-lg">${emoji}</span>`;
    }
    document.getElementById("modalName").textContent = card.name;
    document.getElementById("modalRarity").innerHTML =
      `${card.rarity_icon || ""} ${card.rarity_name || card.rarity}`;
    const parts = [];
    if (card.reward) parts.push(`Награда: +${card.reward} 🪙`);
    if (card.amount) parts.push(`У вас: ×${card.amount}`);
    document.getElementById("modalMeta").textContent = parts.join(" · ");
    document.getElementById("cardModal").classList.add("open");
    haptic("light");
  }

  function closeCardModal() {
    document.getElementById("cardModal").classList.remove("open");
  }

  // ── Load ──
  async function loadMe() {
    me = await api("/api/me");
    renderHeader();
    renderProfile();
    ensureAdminNav();
  }

  async function loadCollection() {
    collection = await api("/api/collection");
    renderRarityFilters();
    renderCollection();
  }

  async function loadMarket() {
    market = await api("/api/market");
    renderMarket();
  }

  async function loadTop() {
    topData = await api(`/api/top?kind=${topKind}`);
    renderTop();
  }

  async function loadAdmin() {
    adminData = await api("/api/admin/overview");
    renderAdmin();
  }

  async function refreshAll() {
    try {
      hideFatal();
      await loadMe();
      await Promise.all([loadCollection(), loadMarket(), loadTop()]);
      if (me && isAdminRole(me.role)) {
        loadAdmin().catch(() => {});
      }
    } catch (e) {
      console.error(e);
      const msg = e.message || "Не удалось загрузить данные";
      const steps = [];
      if (!API_BASE) {
        steps.push(
          'В <code>index.html</code> задай <code>window.MEOW_API_BASE = "https://…"</code>'
        );
      }
      if (!isTelegram()) {
        steps.push("Открой мини-аппку <b>из Telegram</b> (кнопка Web App в боте)");
      }
      steps.push("Убедись, что <code>api.py</code> запущен и доступен по HTTPS");
      steps.push("Проверь CORS и совпадение BOT_TOKEN");
      showFatal("Нет данных из бота", msg, steps);
      toast(msg);
    }
  }

  async function doExchange(amount) {
    try {
      const res = await api("/api/market/exchange", {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      toast(`✓ +${amount} 💎`);
      haptic("success");
      me.coins = res.coins;
      me.gems = res.gems;
      renderHeader();
      renderProfile();
      await loadMarket();
    } catch (e) {
      toast(e.message || "Ошибка обмена");
      haptic("error");
    }
  }

  function switchTab(tab) {
    document
      .querySelectorAll(".tab-panel")
      .forEach((p) => p.classList.remove("active"));
    document
      .querySelectorAll(".nav-btn")
      .forEach((b) => b.classList.remove("active"));
    document.querySelector(`.tab-panel[data-tab="${tab}"]`)?.classList.add("active");
    document.querySelector(`.nav-btn[data-tab="${tab}"]`)?.classList.add("active");
    haptic("light");

    if (tab === "collection") {
      if (!collection) loadCollection().catch((e) => toast(e.message));
      else {
        renderRarityFilters();
        renderCollection();
      }
    } else if (tab === "market") {
      showMarketList();
      if (!market) loadMarket().catch((e) => toast(e.message));
      else renderMarket();
    } else if (tab === "top") {
      if (!topData) loadTop().catch((e) => toast(e.message));
      else renderTop();
    } else if (tab === "profile") {
      renderProfile();
    } else if (tab === "admin") {
      if (!me || !isAdminRole(me.role)) {
        toast("Недостаточно прав");
        switchTab("profile");
        return;
      }
      if (!adminData) loadAdmin().catch((e) => toast(e.message));
      else renderAdmin();
    }
  }

  // Events
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll(".action-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "claim") {
        toast("🃏 Напиши «мряу» в чате с ботом, чтобы получить карточку");
        haptic("light");
      } else if (action === "dice") {
        toast("🎲 Напиши «мряу кубик» в чате с ботом");
        haptic("light");
      } else if (action === "market") switchTab("market");
      else if (action === "top") switchTab("top");
    });
  });

  document.querySelectorAll(".top-tab").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document
        .querySelectorAll(".top-tab")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      topKind = btn.dataset.kind;
      haptic("light");
      try {
        await loadTop();
      } catch (e) {
        toast(e.message);
      }
    });
  });

  document.querySelectorAll(".ex-btn").forEach((btn) => {
    btn.addEventListener("click", () => doExchange(+btn.dataset.amount));
  });

  document.getElementById("modalClose").addEventListener("click", closeCardModal);
  document
    .querySelector(".modal-backdrop")
    .addEventListener("click", closeCardModal);

  document.getElementById("browserClose").addEventListener("click", () => {
    showMarketList();
    haptic("light");
  });
  document.getElementById("browserPrev").addEventListener("click", async () => {
    if (browserPage > 0) {
      browserPage -= 1;
      await loadBrowserPage();
      haptic("light");
    }
  });
  document.getElementById("browserNext").addEventListener("click", async () => {
    if (browserData && browserPage < (browserData.total || 0) - 1) {
      browserPage += 1;
      await loadBrowserPage();
      haptic("light");
    }
  });
  document.getElementById("browserBuy").addEventListener("click", doBuyCurrent);

  document.getElementById("adminRefresh")?.addEventListener("click", async () => {
    try {
      await loadAdmin();
      toast("Админ-данные обновлены");
      haptic("success");
    } catch (e) {
      toast(e.message);
      haptic("error");
    }
  });

  document.getElementById("fatalRetry").addEventListener("click", () => {
    refreshAll();
  });

  document.querySelector(".header")?.addEventListener("dblclick", () => {
    refreshAll();
    toast("Обновление…");
  });

  // Start: setup checks first, then load
  if (!API_BASE) {
    showFatal("API не настроен", "Адрес сервера не указан.", [
      'В <code>index.html</code> добавь:<br><code>window.MEOW_API_BASE = "https://твой-api.ru";</code>',
      "Задеплой фронт и открой из Telegram",
    ]);
  } else if (!isTelegram()) {
    showFatal(
      "Открой из Telegram",
      "Мини-аппка открыта вне Telegram — нет initData.",
      [
        "Нажми кнопку Web App в боте",
        "Или Menu Button в BotFather с URL фронта",
      ]
    );
  } else {
    refreshAll();
  }
})();

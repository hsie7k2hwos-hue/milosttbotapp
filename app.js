/**
 * Мряу Mini App v2
 * window.MEOW_API_BASE в index.html
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

  // ── Fatal ──
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
    const needsAuth = !path.startsWith("/api/help") && !path.startsWith("/health");
    if (needsAuth && !initData) {
      throw new Error(
        "Открой мини-аппку из Telegram (кнопка бота). Без initData API недоступен."
      );
    }

    const url = API_BASE + path;
    let res;
    try {
      const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      };
      if (initData) headers["X-Telegram-Init-Data"] = initData;

      res = await fetch(url, { ...options, headers });
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
  let topData = null;
  let adminData = null;
  let currentFilter = "all";
  let topKind = "coins";
  let previousTab = "profile";
  let claimTimerId = null;

  // admin state
  let adminCardsPage = 0;
  let adminUsersPage = 0;
  let adminCardsTotal = 0;
  let adminUsersTotal = 0;
  let editingCardId = null;
  let adminUserDetailId = null;
  const ADMIN_LIMIT = 30;

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

  function formatCooldown(sec) {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return (
      String(h).padStart(2, "0") +
      ":" +
      String(m).padStart(2, "0") +
      ":" +
      String(r).padStart(2, "0")
    );
  }

  // ── Header / Profile ──
  function renderHeader() {
    if (!me) return;
    document.getElementById("userNickname").textContent = me.nickname;
    document.getElementById("coinsValue").textContent = fmt(me.coins);
    setAvatar(document.getElementById("userAvatar"), me.photo_url, "🐱");
  }

  function renderProfile() {
    if (!me) return;
    document.getElementById("profileName").textContent = me.nickname;
    document.getElementById("statCards").textContent = fmt(me.cards_count);
    document.getElementById("statStreak").textContent = me.streak;
    document.getElementById("statDays").textContent = me.days_with_us;
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

  // ── Claim tab ──
  function stopClaimTimer() {
    if (claimTimerId) {
      clearInterval(claimTimerId);
      claimTimerId = null;
    }
  }

  function updateClaimUI() {
    if (!me) return;
    const idle = document.getElementById("claimIdle");
    const result = document.getElementById("claimResult");
    const timerBlock = document.getElementById("claimTimerBlock");
    const timerEl = document.getElementById("claimTimer");
    const btn = document.getElementById("claimBtn");

    // если результат открыт — не трогаем
    if (!result.classList.contains("hidden")) return;

    idle.classList.remove("hidden");
    result.classList.add("hidden");

    const rem = me.cooldown_remaining || 0;
    if (rem > 0) {
      timerBlock.classList.remove("hidden");
      btn.classList.add("hidden");
      timerEl.textContent = formatCooldown(rem);
      stopClaimTimer();
      const start = Date.now();
      const baseRem = rem;
      claimTimerId = setInterval(() => {
        const elapsed = Math.floor((Date.now() - start) / 1000);
        const left = Math.max(0, baseRem - elapsed);
        me.cooldown_remaining = left;
        timerEl.textContent = formatCooldown(left);
        if (left <= 0) {
          stopClaimTimer();
          me.can_claim_free = true;
          me.cooldown_remaining = 0;
          updateClaimUI();
          renderProfile();
        }
      }, 1000);
    } else {
      stopClaimTimer();
      timerBlock.classList.add("hidden");
      btn.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Получить карточку";
    }
  }

  async function doClaim() {
    const btn = document.getElementById("claimBtn");
    btn.disabled = true;
    btn.textContent = "Открываем…";
    try {
      const res = await api("/api/claim", { method: "POST", body: "{}" });
      haptic("success");

      me.coins = res.coins;
      me.streak = res.streak;
      me.last_claim = res.last_claim;
      me.cooldown_remaining = res.cooldown_remaining;
      me.can_claim_free = false;
      me.cards_count = (me.cards_count || 0) + (res.is_new ? 1 : 0);

      renderHeader();
      renderProfile();
      collection = null;

      const card = res.card;
      const photoSrc = cardPhotoSrc(card);
      const emoji = rarityEmoji(card.rarity);
      const box = document.getElementById("claimResultCard");
      box.innerHTML = `
        <div class="browser-thumb claim-thumb">
          ${
            photoSrc
              ? `<img src="${escAttr(photoSrc)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'" /><span class="card-emoji-lg" style="display:none">${emoji}</span>`
              : `<span class="card-emoji-lg">${emoji}</span>`
          }
        </div>
        <div class="browser-body">
          <div class="browser-name">${escHtml(card.name)}</div>
          <div class="browser-meta">${card.rarity_icon || ""} ${escHtml(
            card.rarity_name || card.rarity
          )}</div>
        </div>`;

      const meta = [];
      if (res.is_new) meta.push("✨ Новая!");
      else meta.push("Уже была в коллекции");
      meta.push(`+${res.reward_coins} 🪙`);
      if (res.streak_increased) meta.push(`🔥 Стрик: ${res.streak}`);
      else meta.push(`🔥 Стрик: ${res.streak}`);
      document.getElementById("claimResultMeta").textContent = meta.join(" · ");

      document.getElementById("claimIdle").classList.add("hidden");
      document.getElementById("claimResult").classList.remove("hidden");
      toast(`✓ ${card.name}`);
    } catch (e) {
      toast(e.message || "Ошибка");
      haptic("error");
      btn.disabled = false;
      btn.textContent = "Получить карточку";
      // обновить кулдаун если сервер сказал что не прошёл
      try {
        await loadMe();
        updateClaimUI();
      } catch (_) {}
    }
  }

  function closeClaimResult() {
    document.getElementById("claimResult").classList.add("hidden");
    document.getElementById("claimIdle").classList.remove("hidden");
    updateClaimUI();
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
          <p class="muted">Открой вкладку «Получить» или напиши «мряу» в боте</p>
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

  // ── Help ──
  async function loadHelp() {
    const el = document.getElementById("helpContent");
    try {
      const data = await api("/api/help");
      el.innerHTML = (data.sections || [])
        .map(
          (s) => `
        <div class="help-block">
          <h3>${escHtml(s.title)}</h3>
          <p>${escHtml(s.text)}</p>
        </div>`
        )
        .join("");
    } catch (_) {
      // fallback offline
      el.innerHTML = `
        <div class="help-block">
          <h3>🃏 Как получить карточку</h3>
          <p>Напиши «мряу» в чате с ботом или нажми «Получить карточку» в мини-приложении. Кулдаун — 4 часа.</p>
        </div>
        <div class="help-block">
          <h3>🔥 Стрик</h3>
          <p>Получай карточку каждый день, чтобы наращивать стрик. Если пропустишь день — стрик сбросится.</p>
        </div>
        <div class="help-block">
          <h3>🪙 Монеты</h3>
          <p>За каждую карточку начисляются монеты: обычная +10, редкая +25, эпическая +50, мифическая +75, легендарная +100.</p>
        </div>
        <div class="help-block">
          <h3>🎲 Кубик</h3>
          <p>Напиши «мряу кубик» в боте, чтобы бросить кубик и получить бонус.</p>
        </div>
        <div class="help-block">
          <h3>📊 Редкости</h3>
          <div class="rarity-legend">
            <div><span class="dot common"></span>Обычная</div>
            <div><span class="dot rare"></span>Редкая</div>
            <div><span class="dot epic"></span>Эпическая</div>
            <div><span class="dot mythical"></span>Мифическая</div>
            <div><span class="dot legendary"></span>Легендарная</div>
          </div>
        </div>
        <div class="help-block">
          <h3>📱 Мини-приложение</h3>
          <p>Карточки — коллекция. Получить — бесплатная карточка. Топ — рейтинг. Профиль — статистика.</p>
        </div>`;
    }
  }

  // ── Admin ──
  function showAdminSection(name) {
    ["adminOverview", "adminCards", "adminUsers", "adminUserDetail", "adminCardForm"].forEach(
      (id) => {
        document.getElementById(id)?.classList.add("hidden");
      }
    );
    document.getElementById(name)?.classList.remove("hidden");
  }

  function renderAdminOverview() {
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
        <div class="label">Карточек</div>
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
        <div class="label">Монет</div>
        <div class="value">${fmt(s.coins_sum || 0)}</div>
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
          </div>
        </div>`;
      })
      .join("");
  }

  async function loadAdminCards() {
    const q = document.getElementById("adminCardSearch").value.trim();
    const rarity = document.getElementById("adminCardRarity").value;
    const params = new URLSearchParams({
      page: String(adminCardsPage),
      limit: String(ADMIN_LIMIT),
    });
    if (q) params.set("q", q);
    if (rarity) params.set("rarity", rarity);

    const data = await api("/api/admin/cards?" + params.toString());
    adminCardsTotal = data.total || 0;
    const list = document.getElementById("adminCardsList");
    const cards = data.cards || [];

    if (!cards.length) {
      list.innerHTML = '<div class="empty-state"><p>Нет карточек</p></div>';
    } else {
      list.innerHTML = cards
        .map((c) => {
          const emoji = rarityEmoji(c.rarity);
          return `
          <div class="admin-row" data-id="${c.id}">
            <div class="admin-row-icon">${c.rarity_icon || emoji}</div>
            <div class="admin-row-body">
              <div class="admin-row-title">${escHtml(c.name)}</div>
              <div class="admin-row-sub">#${c.id} · ${escHtml(c.rarity_name || c.rarity)}</div>
            </div>
            <button type="button" class="text-btn admin-edit-card" data-id="${c.id}">Изменить</button>
          </div>`;
        })
        .join("");

      list.querySelectorAll(".admin-edit-card").forEach((btn) => {
        btn.addEventListener("click", () => openCardForm(+btn.dataset.id, cards));
      });
    }

    const pages = Math.max(1, Math.ceil(adminCardsTotal / ADMIN_LIMIT));
    document.getElementById("adminCardsPage").textContent =
      `${adminCardsPage + 1} / ${pages}`;
    document.getElementById("adminCardsPrev").disabled = adminCardsPage <= 0;
    document.getElementById("adminCardsNext").disabled =
      adminCardsPage >= pages - 1;
  }

  function openCardForm(cardId, cardsList) {
    editingCardId = cardId;
    showAdminSection("adminCardForm");
    const title = document.getElementById("adminCardFormTitle");
    const delBtn = document.getElementById("cfDelete");

    if (cardId) {
      title.textContent = "Изменить карточку #" + cardId;
      delBtn.classList.remove("hidden");
      const c = (cardsList || []).find((x) => x.id === cardId);
      if (c) {
        document.getElementById("cfName").value = c.name || "";
        document.getElementById("cfRarity").value = c.rarity || "common";
        document.getElementById("cfPhotoId").value = c.photo_id || "";
        document.getElementById("cfPhotoPath").value = c.photo_path || "";
      } else {
        // load single
        api("/api/admin/cards?q=" + cardId).then((d) => {
          const found = (d.cards || []).find((x) => x.id === cardId);
          if (found) {
            document.getElementById("cfName").value = found.name || "";
            document.getElementById("cfRarity").value = found.rarity || "common";
            document.getElementById("cfPhotoId").value = found.photo_id || "";
            document.getElementById("cfPhotoPath").value = found.photo_path || "";
          }
        });
      }
    } else {
      title.textContent = "Новая карточка";
      delBtn.classList.add("hidden");
      document.getElementById("cfName").value = "";
      document.getElementById("cfRarity").value = "common";
      document.getElementById("cfPhotoId").value = "";
      document.getElementById("cfPhotoPath").value = "";
    }
  }

  async function saveCardForm(e) {
    e.preventDefault();
    const body = {
      name: document.getElementById("cfName").value.trim(),
      rarity: document.getElementById("cfRarity").value,
      photo_id: document.getElementById("cfPhotoId").value.trim() || null,
      photo_path: document.getElementById("cfPhotoPath").value.trim() || null,
    };
    try {
      if (editingCardId) {
        await api("/api/admin/cards/" + editingCardId, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast("Карточка обновлена");
      } else {
        await api("/api/admin/cards", {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast("Карточка создана");
      }
      haptic("success");
      showAdminSection("adminCards");
      await loadAdminCards();
    } catch (err) {
      toast(err.message);
      haptic("error");
    }
  }

  async function deleteCard() {
    if (!editingCardId) return;
    if (!confirm("Удалить карточку #" + editingCardId + " и все записи в инвентарях?"))
      return;
    try {
      await api("/api/admin/cards/" + editingCardId, { method: "DELETE" });
      toast("Удалено");
      haptic("success");
      showAdminSection("adminCards");
      await loadAdminCards();
    } catch (err) {
      toast(err.message);
      haptic("error");
    }
  }

  async function loadAdminUsers() {
    const q = document.getElementById("adminUserSearch").value.trim();
    const role = document.getElementById("adminUserRole").value;
    const params = new URLSearchParams({
      page: String(adminUsersPage),
      limit: String(ADMIN_LIMIT),
    });
    if (q) params.set("q", q);
    if (role) params.set("role", role);

    const data = await api("/api/admin/users?" + params.toString());
    adminUsersTotal = data.total || 0;
    const list = document.getElementById("adminUsersList");
    const users = data.users || [];

    if (!users.length) {
      list.innerHTML = '<div class="empty-state"><p>Никого не найдено</p></div>';
    } else {
      list.innerHTML = users
        .map(
          (u) => `
        <div class="admin-row" data-id="${u.user_id}">
          <div class="admin-row-icon">${(u.role_display || "").split(" ")[0] || "👤"}</div>
          <div class="admin-row-body">
            <div class="admin-row-title">${escHtml(u.nickname)}</div>
            <div class="admin-row-sub">ID ${u.user_id} · ${fmt(u.coins)} 🪙 · 🔥${u.streak}</div>
          </div>
        </div>`
        )
        .join("");

      list.querySelectorAll(".admin-row").forEach((el) => {
        el.addEventListener("click", () => openUserDetail(+el.dataset.id));
      });
    }

    const pages = Math.max(1, Math.ceil(adminUsersTotal / ADMIN_LIMIT));
    document.getElementById("adminUsersPage").textContent =
      `${adminUsersPage + 1} / ${pages}`;
    document.getElementById("adminUsersPrev").disabled = adminUsersPage <= 0;
    document.getElementById("adminUsersNext").disabled =
      adminUsersPage >= pages - 1;
  }

  async function openUserDetail(userId) {
    adminUserDetailId = userId;
    showAdminSection("adminUserDetail");
    const body = document.getElementById("adminUserBody");
    body.innerHTML = '<div class="empty-state"><p>Загрузка…</p></div>';
    try {
      const u = await api("/api/admin/users/" + userId);
      body.innerHTML = `
        <div class="admin-user-card">
          <h3>${escHtml(u.nickname)}</h3>
          <div class="admin-user-meta">
            <div>ID: <b>${u.user_id}</b></div>
            <div>Роль: ${escHtml(u.role_display)}</div>
            <div>Пол: ${escHtml(u.gender_display)}</div>
            <div>Регистрация: ${escHtml(u.registration_str)}</div>
            <div>Дней с нами: ${u.days_with_us}</div>
            <div>Монеты: <b>${fmt(u.coins)}</b> 🪙</div>
            <div>Стрик: <b>${u.streak}</b> 🔥</div>
            <div>Карточек (уник.): <b>${u.cards_unique}</b></div>
          </div>
          <div class="admin-form" style="margin-top:12px">
            <label>Ник
              <input type="text" id="auNick" class="admin-input" value="${escAttr(u.nickname)}" maxlength="32" />
            </label>
            <label>Монеты
              <input type="number" id="auCoins" class="admin-input" value="${u.coins}" min="0" />
            </label>
            <label>Стрик
              <input type="number" id="auStreak" class="admin-input" value="${u.streak}" min="0" />
            </label>
            <label>Роль
              <select id="auRole" class="admin-select">
                <option value="user" ${u.role === "user" ? "selected" : ""}>Пользователь</option>
                <option value="admin" ${u.role === "admin" ? "selected" : ""}>Админ</option>
                <option value="superadmin" ${u.role === "superadmin" ? "selected" : ""}>Суперадмин</option>
                <option value="banned" ${u.role === "banned" ? "selected" : ""}>Бан</option>
              </select>
            </label>
            <label class="checkbox-label">
              <input type="checkbox" id="auResetCd" /> Сбросить кулдаун
            </label>
            <div class="form-actions">
              <button type="button" id="auSave" class="claim-btn small">Сохранить</button>
            </div>
          </div>
          <div class="section-title" style="margin-top:16px">Выдать карточку</div>
          <div class="admin-form">
            <label>ID карточки
              <input type="number" id="auGiveId" class="admin-input" min="1" />
            </label>
            <label>Количество
              <input type="number" id="auGiveAmt" class="admin-input" value="1" min="1" max="100" />
            </label>
            <button type="button" id="auGive" class="claim-btn small">Выдать</button>
          </div>
          <div class="section-title" style="margin-top:16px">Инвентарь (последние)</div>
          <div class="admin-log">
            ${(u.inventory || [])
              .map(
                (c) => `
              <div class="admin-log-row">
                <div class="body">${c.rarity_icon || ""} ${escHtml(c.name)} ${
                  c.amount > 1 ? "×" + c.amount : ""
                }</div>
              </div>`
              )
              .join("") || '<div class="empty-state"><p>Пусто</p></div>'}
          </div>
        </div>`;

      document.getElementById("auSave").addEventListener("click", async () => {
        const payload = {
          nickname: document.getElementById("auNick").value.trim(),
          coins: +document.getElementById("auCoins").value,
          streak: +document.getElementById("auStreak").value,
          role: document.getElementById("auRole").value,
        };
        if (document.getElementById("auResetCd").checked) {
          payload.reset_cooldown = true;
        }
        try {
          await api("/api/admin/users/" + userId, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
          toast("Сохранено");
          haptic("success");
          openUserDetail(userId);
        } catch (err) {
          toast(err.message);
          haptic("error");
        }
      });

      document.getElementById("auGive").addEventListener("click", async () => {
        const card_id = +document.getElementById("auGiveId").value;
        const amount = +document.getElementById("auGiveAmt").value || 1;
        if (!card_id) {
          toast("Укажи ID карточки");
          return;
        }
        try {
          const res = await api("/api/admin/users/" + userId + "/give-card", {
            method: "POST",
            body: JSON.stringify({ card_id, amount }),
          });
          toast(`Выдано: ${res.card?.name || card_id}`);
          haptic("success");
          openUserDetail(userId);
        } catch (err) {
          toast(err.message);
          haptic("error");
        }
      });
    } catch (e) {
      body.innerHTML = `<div class="empty-state"><p>${escHtml(e.message)}</p></div>`;
    }
  }

  function renderAdmin() {
    renderAdminOverview();
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
  }

  async function loadCollection() {
    collection = await api("/api/collection");
    renderRarityFilters();
    renderCollection();
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
      await Promise.all([loadCollection(), loadTop()]);
      updateClaimUI();
    } catch (e) {
      console.error(e);
      const msg = e.message || "Не удалось загрузить данные";
      const steps = [];
      if (!API_BASE || API_BASE.includes("YOUR-API-HOST")) {
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

  function switchTab(tab) {
    // page panels (help/admin) hide bottom nav conceptually but keep it
    document
      .querySelectorAll(".tab-panel")
      .forEach((p) => p.classList.remove("active"));
    document
      .querySelectorAll(".nav-btn")
      .forEach((b) => b.classList.remove("active"));

    const panel = document.querySelector(`.tab-panel[data-tab="${tab}"]`);
    panel?.classList.add("active");

    if (["cards", "claim", "top", "profile"].includes(tab)) {
      document.querySelector(`.nav-btn[data-tab="${tab}"]`)?.classList.add("active");
      previousTab = tab;
    }

    haptic("light");

    if (tab === "cards") {
      if (!collection) loadCollection().catch((e) => toast(e.message));
      else {
        renderRarityFilters();
        renderCollection();
      }
    } else if (tab === "claim") {
      updateClaimUI();
    } else if (tab === "top") {
      if (!topData) loadTop().catch((e) => toast(e.message));
      else renderTop();
    } else if (tab === "profile") {
      renderProfile();
    } else if (tab === "help") {
      loadHelp();
    } else if (tab === "admin") {
      if (!me || !isAdminRole(me.role)) {
        toast("Недостаточно прав");
        switchTab("profile");
        return;
      }
      showAdminSection("adminOverview");
      document
        .querySelectorAll(".admin-tab")
        .forEach((t) => t.classList.toggle("active", t.dataset.admin === "overview"));
      if (!adminData) loadAdmin().catch((e) => toast(e.message));
      else renderAdmin();
    }
  }

  // ── Events ──
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("helpBtn").addEventListener("click", () => {
    switchTab("help");
  });

  document.querySelectorAll(".back-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.back || previousTab || "profile");
    });
  });

  document.querySelectorAll(".action-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "claim") switchTab("claim");
      else if (action === "dice") {
        toast("🎲 Напиши «мряу кубик» в чате с ботом");
        haptic("light");
      } else if (action === "top") switchTab("top");
      else if (action === "cards") switchTab("cards");
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

  document.getElementById("claimBtn").addEventListener("click", doClaim);
  document.getElementById("claimAgainBtn").addEventListener("click", closeClaimResult);

  document.getElementById("modalClose").addEventListener("click", closeCardModal);
  document
    .querySelector(".modal-backdrop")
    .addEventListener("click", closeCardModal);

  // Double-tap profile → admin
  let lastProfileTap = 0;
  document.getElementById("profileCard")?.addEventListener("click", () => {
    const now = Date.now();
    if (now - lastProfileTap < 400) {
      if (me && isAdminRole(me.role)) {
        switchTab("admin");
        haptic("success");
      }
    }
    lastProfileTap = now;
  });

  // Admin tabs
  document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document
        .querySelectorAll(".admin-tab")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const name = btn.dataset.admin;
      if (name === "overview") {
        showAdminSection("adminOverview");
        if (!adminData) await loadAdmin().catch((e) => toast(e.message));
        else renderAdminOverview();
      } else if (name === "cards") {
        showAdminSection("adminCards");
        adminCardsPage = 0;
        await loadAdminCards().catch((e) => toast(e.message));
      } else if (name === "users") {
        showAdminSection("adminUsers");
        adminUsersPage = 0;
        await loadAdminUsers().catch((e) => toast(e.message));
      }
      haptic("light");
    });
  });

  document.getElementById("adminRefresh")?.addEventListener("click", async () => {
    try {
      await loadAdmin();
      toast("Обновлено");
      haptic("success");
    } catch (e) {
      toast(e.message);
      haptic("error");
    }
  });

  document.getElementById("adminCardAdd")?.addEventListener("click", () => {
    openCardForm(null);
  });

  document.getElementById("cardForm")?.addEventListener("submit", saveCardForm);
  document.getElementById("cfDelete")?.addEventListener("click", deleteCard);
  document.getElementById("adminCardFormBack")?.addEventListener("click", () => {
    showAdminSection("adminCards");
  });

  let cardSearchT;
  document.getElementById("adminCardSearch")?.addEventListener("input", () => {
    clearTimeout(cardSearchT);
    cardSearchT = setTimeout(() => {
      adminCardsPage = 0;
      loadAdminCards().catch((e) => toast(e.message));
    }, 300);
  });
  document.getElementById("adminCardRarity")?.addEventListener("change", () => {
    adminCardsPage = 0;
    loadAdminCards().catch((e) => toast(e.message));
  });
  document.getElementById("adminCardsPrev")?.addEventListener("click", () => {
    if (adminCardsPage > 0) {
      adminCardsPage--;
      loadAdminCards().catch((e) => toast(e.message));
    }
  });
  document.getElementById("adminCardsNext")?.addEventListener("click", () => {
    adminCardsPage++;
    loadAdminCards().catch((e) => toast(e.message));
  });

  let userSearchT;
  document.getElementById("adminUserSearch")?.addEventListener("input", () => {
    clearTimeout(userSearchT);
    userSearchT = setTimeout(() => {
      adminUsersPage = 0;
      loadAdminUsers().catch((e) => toast(e.message));
    }, 300);
  });
  document.getElementById("adminUserRole")?.addEventListener("change", () => {
    adminUsersPage = 0;
    loadAdminUsers().catch((e) => toast(e.message));
  });
  document.getElementById("adminUsersPrev")?.addEventListener("click", () => {
    if (adminUsersPage > 0) {
      adminUsersPage--;
      loadAdminUsers().catch((e) => toast(e.message));
    }
  });
  document.getElementById("adminUsersNext")?.addEventListener("click", () => {
    adminUsersPage++;
    loadAdminUsers().catch((e) => toast(e.message));
  });
  document.getElementById("adminUserBack")?.addEventListener("click", () => {
    showAdminSection("adminUsers");
  });

  document.getElementById("fatalRetry").addEventListener("click", () => {
    refreshAll();
  });

  document.querySelector(".header")?.addEventListener("dblclick", () => {
    refreshAll();
    toast("Обновление…");
  });

  // Start
  if (!API_BASE || API_BASE.includes("YOUR-API-HOST")) {
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

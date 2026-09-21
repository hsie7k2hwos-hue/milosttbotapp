/**
 * Мряу Mini App — клиентский интерфейс карточной игры
 * Работает как Telegram Web App + standalone-демо
 */

(function () {
  "use strict";

  // ── Telegram WebApp ──
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor("#0f0f13");
      tg.setBackgroundColor("#0f0f13");
    } catch (_) {}
    // Подстраиваем под тему Telegram, если доступна
    if (tg.colorScheme === "light") {
      // оставляем тёмную тему — она лучше подходит под карточный стиль
    }
  }

  // ── Константы (синхронизированы с ботом) ──
  const RARITIES = {
    common:    { icon: "⚪", name: "Обычная",    color: "#9ca3af", price: 1,  reward: 10  },
    rare:      { icon: "🔵", name: "Редкая",     color: "#3b82f6", price: 3,  reward: 25  },
    epic:      { icon: "🟣", name: "Эпическая",  color: "#a855f7", price: 8,  reward: 50  },
    mythical:  { icon: "🔴", name: "Мифическая", color: "#ef4444", price: 20, reward: 75  },
    legendary: { icon: "🟡", name: "Легендарная",color: "#eab308", price: 50, reward: 100 },
  };

  const GENDERS = {
    male:   { icon: "♂", name: "Мужской" },
    female: { icon: "♀", name: "Женский" },
    other:  { icon: "⚧", name: "Другой" },
    none:   { icon: "—", name: "Не задан" },
  };

  const ROLES = {
    user:       { icon: "👤", name: "Пользователь" },
    admin:      { icon: "🛡", name: "Администратор" },
    superadmin: { icon: "👑", name: "Главный администратор" },
    banned:     { icon: "🚫", name: "Заблокирован" },
  };

  // Демо-карточки (в реальном проекте приходят с бэкенда)
  const DEMO_CARDS = [
    { id: 1,  name: "Рыжий котик",     rarity: "common",    emoji: "🐈" },
    { id: 2,  name: "Сонный котёнок",  rarity: "common",    emoji: "😺" },
    { id: 3,  name: "Чёрный пантер",   rarity: "rare",      emoji: "🐆" },
    { id: 4,  name: "Белый тигр",      rarity: "rare",      emoji: "🐯" },
    { id: 5,  name: "Лунный кот",      rarity: "epic",      emoji: "🌙" },
    { id: 6,  name: "Огненный рысь",   rarity: "epic",      emoji: "🔥" },
    { id: 7,  name: "Кристальный кот", rarity: "mythical",  emoji: "💎" },
    { id: 8,  name: "Теневой барс",    rarity: "mythical",  emoji: "🌑" },
    { id: 9,  name: "Золотой сфинкс",  rarity: "legendary", emoji: "✨" },
    { id: 10, name: "Дракон-кот",      rarity: "legendary", emoji: "🐉" },
    { id: 11, name: "Мяу-рыцарь",     rarity: "rare",      emoji: "⚔️" },
    { id: 12, name: "Космо-кот",       rarity: "epic",      emoji: "🚀" },
  ];

  // ── Состояние (локальное хранилище для демо) ──
  const STORAGE_KEY = "meow_miniapp_v1";

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function createDefaultState(user) {
    const now = Date.now();
    return {
      userId: user?.id || 0,
      nickname: user?.first_name || user?.username || "Гость",
      username: user?.username || null,
      role: "user",
      gender: "none",
      coins: 250,
      gems: 5,
      streak: 3,
      registration: now - 7 * 86400000,
      lastClaim: 0,
      lastDice: 0,
      inventory: [
        { cardId: 1, amount: 2 },
        { cardId: 2, amount: 1 },
        { cardId: 3, amount: 1 },
        { cardId: 5, amount: 1 },
      ],
    };
  }

  let state = loadState();
  const tgUser = tg?.initDataUnsafe?.user;

  if (!state || (tgUser && state.userId !== tgUser.id)) {
    state = createDefaultState(tgUser);
    saveState(state);
  }

  // Обновляем ник из Telegram, если есть
  if (tgUser) {
    state.nickname = tgUser.first_name + (tgUser.last_name ? " " + tgUser.last_name : "");
    state.username = tgUser.username || null;
    state.userId = tgUser.id;
  }

  // ── Утилиты ──
  function fmt(n) {
    return Number(n).toLocaleString("ru-RU").replace(/\s/g, "\u00a0");
  }

  function plural(n, one, few, many) {
    n = Math.abs(n) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }

  function daysSince(ts) {
    return Math.floor((Date.now() - ts) / 86400000);
  }

  function toast(msg, duration = 2500) {
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

  // ── Рендер шапки и профиля ──
  function renderHeader() {
    document.getElementById("userNickname").textContent = state.nickname;
    document.getElementById("userId").textContent = state.userId ? `ID ${state.userId}` : "Демо-режим";
    document.getElementById("coinsValue").textContent = fmt(state.coins);
    document.getElementById("gemsValue").textContent = fmt(state.gems);

    const avatarEl = document.getElementById("userAvatar");
    if (tgUser?.photo_url) {
      avatarEl.innerHTML = `<img src="${tgUser.photo_url}" alt="" />`;
    }
  }

  function renderProfile() {
    document.getElementById("profileName").textContent = state.nickname;
    const role = ROLES[state.role] || ROLES.user;
    document.getElementById("profileRole").textContent = `${role.icon} ${role.name}`;

    const owned = state.inventory.reduce((s, i) => s + i.amount, 0);
    document.getElementById("statCards").textContent = fmt(owned);
    document.getElementById("statStreak").textContent = state.streak;
    document.getElementById("statDays").textContent = daysSince(state.registration);

    const g = GENDERS[state.gender] || GENDERS.none;
    document.querySelector("#genderRow .gender-icon").textContent = g.icon;
    document.querySelector("#genderRow .gender-text").textContent = g.name;

    const profileAvatar = document.getElementById("profileAvatar");
    if (tgUser?.photo_url) {
      profileAvatar.innerHTML = `<img src="${tgUser.photo_url}" alt="" />`;
    }

    // Подсказка кулдауна
    const COOLDOWN = 4 * 3600 * 1000;
    const remaining = Math.max(0, COOLDOWN - (Date.now() - state.lastClaim));
    const hint = document.getElementById("claimHint");
    if (remaining <= 0) {
      hint.textContent = "Готово ✓";
      hint.style.color = "var(--success)";
    } else {
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      hint.textContent = h > 0 ? `через ${h} ч ${m} мин` : `через ${m} мин`;
      hint.style.color = "";
    }
  }

  // ── Коллекция ──
  let currentFilter = "all";

  function renderRarityFilters() {
    const container = document.getElementById("rarityFilters");
    const counts = {};
    state.inventory.forEach((inv) => {
      const card = DEMO_CARDS.find((c) => c.id === inv.cardId);
      if (card) counts[card.rarity] = (counts[card.rarity] || 0) + inv.amount;
    });

    let html = `<button class="filter-chip ${currentFilter === "all" ? "active" : ""}" data-rarity="all">Все</button>`;
    for (const [key, info] of Object.entries(RARITIES)) {
      const cnt = counts[key] || 0;
      if (cnt === 0 && currentFilter !== key) continue;
      html += `<button class="filter-chip ${currentFilter === key ? "active" : ""}" data-rarity="${key}">
        ${info.icon} ${info.name} · ${cnt}
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
    const ownedIds = new Set(state.inventory.map((i) => i.cardId));
    const totalUnique = DEMO_CARDS.length;
    const ownedUnique = ownedIds.size;

    document.getElementById("collOwned").textContent = ownedUnique;
    document.getElementById("collTotal").textContent = totalUnique;

    let items = state.inventory
      .map((inv) => {
        const card = DEMO_CARDS.find((c) => c.id === inv.cardId);
        return card ? { ...card, amount: inv.amount } : null;
      })
      .filter(Boolean);

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
      .map(
        (c) => `
      <div class="card-item" data-id="${c.id}">
        <div class="card-thumb">
          ${c.emoji}
          <div class="card-rarity-bar ${c.rarity}"></div>
          ${c.amount > 1 ? `<div class="card-amount">×${c.amount}</div>` : ""}
        </div>
        <div class="card-body">
          <div class="card-name">${c.name}</div>
          <div class="card-meta">${RARITIES[c.rarity].icon} ${RARITIES[c.rarity].name}</div>
        </div>
      </div>`
      )
      .join("");

    grid.querySelectorAll(".card-item").forEach((el) => {
      el.addEventListener("click", () => openCardModal(+el.dataset.id));
    });
  }

  // ── Маркет ──
  function renderMarket() {
    document.getElementById("marketGems").textContent = fmt(state.gems);
    const list = document.getElementById("marketList");
    const ownedIds = new Set(state.inventory.map((i) => i.cardId));

    list.innerHTML = Object.entries(RARITIES)
      .map(([key, info]) => {
        const missing = DEMO_CARDS.filter((c) => c.rarity === key && !ownedIds.has(c.id)).length;
        const done = missing === 0;
        return `
        <div class="market-item">
          <div class="market-icon ${key}">${info.icon}</div>
          <div class="market-info-text">
            <div class="market-name">${info.name}</div>
            <div class="market-desc">${done ? "Все собраны" : `Не хватает ${missing} шт`}</div>
          </div>
          ${done
            ? `<span class="market-done">✓ собрано</span>`
            : `<span class="market-price">${info.price} 💎</span>`}
        </div>`;
      })
      .join("");
  }

  // ── Топ (демо) ──
  const DEMO_TOP = {
    coins: [
      { nick: "Кира", value: 12540 },
      { nick: "Мурзик", value: 9870 },
      { nick: "Барсик", value: 7650 },
      { nick: "Луна", value: 5430 },
      { nick: "Тигрёнок", value: 4210 },
      { nick: "Снежок", value: 3100 },
      { nick: "Рыжик", value: 2890 },
      { nick: "Пушок", value: 2100 },
      { nick: "Васька", value: 1750 },
      { nick: "Том", value: 1200 },
    ],
    cards: [
      { nick: "Кира", value: 48 },
      { nick: "Луна", value: 42 },
      { nick: "Мурзик", value: 39 },
      { nick: "Барсик", value: 35 },
      { nick: "Тигрёнок", value: 31 },
      { nick: "Снежок", value: 28 },
      { nick: "Рыжик", value: 24 },
      { nick: "Пушок", value: 20 },
      { nick: "Васька", value: 17 },
      { nick: "Том", value: 12 },
    ],
    streak: [
      { nick: "Кира", value: 45 },
      { nick: "Мурзик", value: 38 },
      { nick: "Луна", value: 30 },
      { nick: "Барсик", value: 22 },
      { nick: "Тигрёнок", value: 18 },
      { nick: "Снежок", value: 14 },
      { nick: "Рыжик", value: 11 },
      { nick: "Пушок", value: 9 },
      { nick: "Васька", value: 7 },
      { nick: "Том", value: 4 },
    ],
  };

  let topKind = "coins";

  function renderTop() {
    const list = document.getElementById("topList");
    const data = DEMO_TOP[topKind] || [];
    const unit = topKind === "coins" ? "🪙" : topKind === "cards" ? "🃏" : "🔥";
    const medals = ["🥇", "🥈", "🥉"];

    list.innerHTML = data
      .map((row, i) => {
        const rankClass = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
        const rank = i < 3 ? medals[i] : `${i + 1}.`;
        return `
        <div class="top-row">
          <div class="top-rank ${rankClass}">${rank}</div>
          <div class="top-nick">${row.nick}</div>
          <div class="top-value">${fmt(row.value)} ${unit}</div>
        </div>`;
      })
      .join("");

    // Моё место (демо)
    const myValue =
      topKind === "coins"
        ? state.coins
        : topKind === "cards"
        ? state.inventory.reduce((s, i) => s + i.amount, 0)
        : state.streak;
    const rank = data.filter((r) => r.value > myValue).length + 1;
    document.getElementById("myRank").innerHTML = `
      📌 Ваше место · <b>#${rank}</b><br>
      ${state.nickname} · <b>${fmt(myValue)}</b> ${unit}`;
  }

  // ── Модалка карточки ──
  function openCardModal(cardId) {
    const card = DEMO_CARDS.find((c) => c.id === cardId);
    if (!card) return;
    const inv = state.inventory.find((i) => i.cardId === cardId);
    const r = RARITIES[card.rarity];

    document.getElementById("modalPhoto").innerHTML = card.emoji;
    document.getElementById("modalName").textContent = card.name;
    document.getElementById("modalRarity").innerHTML = `${r.icon} ${r.name}`;
    document.getElementById("modalMeta").textContent =
      `Награда: +${r.reward} 🪙` + (inv ? ` · У вас: ×${inv.amount}` : "");

    document.getElementById("cardModal").classList.add("open");
    haptic("light");
  }

  function closeCardModal() {
    document.getElementById("cardModal").classList.remove("open");
  }

  // ── Действия ──
  function claimCard() {
    const COOLDOWN = 4 * 3600 * 1000;
    const remaining = Math.max(0, COOLDOWN - (Date.now() - state.lastClaim));

    if (remaining > 0) {
      // Мгновенная покупка
      const ratio = remaining / COOLDOWN;
      const cost = Math.max(5, Math.round(5 + (150 - 5) * ratio));
      if (state.coins < cost) {
        toast(`Нужно ${cost} 🪙, у вас ${state.coins}`);
        haptic("error");
        return;
      }
      state.coins -= cost;
      toast(`⚡ Карточка за ${cost} 🪙`);
    } else {
      toast("✨ Новая карточка!");
    }

    // Выдаём случайную карточку
    const ownedIds = new Set(state.inventory.map((i) => i.cardId));
    const missing = DEMO_CARDS.filter((c) => !ownedIds.has(c.id));
    let card;
    if (missing.length > 0 && Math.random() > 0.25) {
      card = missing[Math.floor(Math.random() * missing.length)];
    } else {
      card = DEMO_CARDS[Math.floor(Math.random() * DEMO_CARDS.length)];
    }

    const inv = state.inventory.find((i) => i.cardId === card.id);
    if (inv) inv.amount += 1;
    else state.inventory.push({ cardId: card.id, amount: 1 });

    const isDup = !!inv;
    const reward = isDup
      ? Math.floor(RARITIES[card.rarity].reward * 0.5)
      : RARITIES[card.rarity].reward;
    state.coins += reward;
    if (!isDup && RARITIES[card.rarity].price >= 20) {
      // mythical/legendary gem
      const gems = card.rarity === "legendary" ? 2 : card.rarity === "mythical" ? 1 : 0;
      state.gems += gems;
    }

    state.lastClaim = Date.now();
    saveState(state);
    renderAll();
    haptic("success");
    openCardModal(card.id);
  }

  function rollDice() {
    const COOLDOWN = 10 * 60 * 1000;
    if (Date.now() - state.lastDice < COOLDOWN) {
      const rem = Math.ceil((COOLDOWN - (Date.now() - state.lastDice)) / 60000);
      toast(`Кубик через ${rem} мин`);
      haptic("error");
      return;
    }
    if (state.coins < 10) {
      toast("Нужно минимум 10 🪙");
      haptic("error");
      return;
    }

    // Взвешенный бросок как в боте
    const values = [];
    const weights = [];
    for (let v = -10; v <= 10; v++) {
      values.push(v);
      weights.push(v > 0 ? 4 + v : v === 0 ? 6 : 2);
    }
    let total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let delta = 0;
    for (let i = 0; i < values.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        delta = values[i];
        break;
      }
    }

    state.coins = Math.max(0, state.coins + delta);
    state.lastDice = Date.now();
    saveState(state);
    renderAll();

    if (delta > 0) {
      toast(`🎉 +${delta} 🪙`);
      haptic("success");
    } else if (delta < 0) {
      toast(`😔 ${delta} 🪙`);
      haptic("error");
    } else {
      toast("· Ничья ±0");
      haptic("light");
    }
  }

  function exchangeGems(amount) {
    const cost = amount * 100;
    if (state.coins < cost) {
      toast(`Нужно ${fmt(cost)} 🪙`);
      haptic("error");
      return;
    }
    state.coins -= cost;
    state.gems += amount;
    saveState(state);
    renderAll();
    toast(`✓ +${amount} 💎`);
    haptic("success");
  }

  // ── Навигация ──
  function switchTab(tab) {
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelector(`.tab-panel[data-tab="${tab}"]`)?.classList.add("active");
    document.querySelector(`.nav-btn[data-tab="${tab}"]`)?.classList.add("active");
    haptic("light");

    if (tab === "collection") {
      renderRarityFilters();
      renderCollection();
    } else if (tab === "market") {
      renderMarket();
    } else if (tab === "top") {
      renderTop();
    } else if (tab === "profile") {
      renderProfile();
    }
  }

  function renderAll() {
    renderHeader();
    renderProfile();
    renderRarityFilters();
    renderCollection();
    renderMarket();
    renderTop();
  }

  // ── События ──
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll(".action-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "claim") claimCard();
      else if (action === "dice") rollDice();
      else if (action === "market") switchTab("market");
      else if (action === "top") switchTab("top");
    });
  });

  document.querySelectorAll(".top-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".top-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      topKind = btn.dataset.kind;
      renderTop();
      haptic("light");
    });
  });

  document.querySelectorAll(".ex-btn").forEach((btn) => {
    btn.addEventListener("click", () => exchangeGems(+btn.dataset.amount));
  });

  document.getElementById("modalClose").addEventListener("click", closeCardModal);
  document.querySelector(".modal-backdrop").addEventListener("click", closeCardModal);

  // Кнопка «Закрыть» в Telegram (MainButton не используем)
  if (tg) {
    tg.BackButton.hide();
  }

  // ── Старт ──
  renderAll();

  // Сообщение при первом открытии
  if (!localStorage.getItem("meow_welcomed")) {
    setTimeout(() => {
      toast("Демо-режим: данные хранятся локально. Полная синхронизация — через API бота.");
      localStorage.setItem("meow_welcomed", "1");
    }, 800);
  }
})();

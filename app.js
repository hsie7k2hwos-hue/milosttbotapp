/**
 * Мряу — Telegram Mini App
 * Вкладки: Мои карточки | Топ | Профиль
 * Клик по игроку в топе → публичный профиль (без карточек)
 */
(function () {
  "use strict";

  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor("secondary_bg_color");
      tg.setBackgroundColor("bg_color");
    } catch (_) {}
  }

  const API = ""; // same origin
  let initData = tg?.initData || "";
  let me = null;
  let currentRarity = "all";
  let currentTopKind = "coins";
  let collectionCache = null;
  let viewingOther = false;

  // ── Auth headers ────────────────────────────────────────────────────────
  function authHeaders() {
    const h = { Accept: "application/json" };
    if (initData) {
      h["Authorization"] = "tma " + initData;
      h["X-Telegram-Init-Data"] = initData;
    }
    return h;
  }

  async function api(path, opts = {}) {
    const res = await fetch(API + path, {
      ...opts,
      headers: { ...authHeaders(), ...(opts.headers || {}) },
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const j = await res.json();
        detail = j.detail || JSON.stringify(j);
      } catch (_) {}
      throw new Error(detail || "Ошибка " + res.status);
    }
    return res.json();
  }

  // ── Format helpers ──────────────────────────────────────────────────────
  function fmtNum(n) {
    n = Number(n) || 0;
    return n.toLocaleString("ru-RU").replace(/,/g, "\u00a0");
  }

  function pluralDays(n) {
    n = Math.abs(n);
    if (n % 100 >= 11 && n % 100 <= 14) return "дней";
    const last = n % 10;
    if (last === 1) return "день";
    if (last >= 2 && last <= 4) return "дня";
    return "дней";
  }

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  // ── Header ──────────────────────────────────────────────────────────────
  function updateHeader(data) {
    if (!data) return;
    document.getElementById("hdr-coins").textContent = fmtNum(data.coins);
    document.getElementById("hdr-streak").textContent =
      fmtNum(data.streak) + " " + pluralDays(data.streak);
  }

  // ── Tabs ────────────────────────────────────────────────────────────────
  function switchTab(tab) {
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.classList.toggle("active", p.dataset.tab === tab);
      if (p.dataset.tab === "other") p.hidden = tab !== "other";
    });
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    viewingOther = tab === "other";
    if (tab === "cards") loadCollection();
    if (tab === "top") loadTop();
    if (tab === "profile") loadProfile();
  }

  document.getElementById("bottom-nav").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-btn");
    if (!btn) return;
    switchTab(btn.dataset.tab);
  });

  document.getElementById("btn-back-other").addEventListener("click", () => {
    switchTab("top");
  });

  // ── Collection ──────────────────────────────────────────────────────────
  async function loadCollection() {
    const grid = document.getElementById("cards-grid");
    const summary = document.getElementById("cards-summary");
    try {
      const q = currentRarity && currentRarity !== "all" ? "?rarity=" + encodeURIComponent(currentRarity) : "";
      const data = await api("/api/collection" + q);
      collectionCache = data;
      summary.textContent = `Собрано ${fmtNum(data.total_owned)} из ${fmtNum(data.total_in_game)}`;
      renderRarityChips(data.categories || []);
      renderCards(data.cards || []);
    } catch (err) {
      grid.innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
      summary.textContent = "";
    }
  }

  function renderRarityChips(categories) {
    const el = document.getElementById("rarity-chips");
    let html = `<button class="chip${currentRarity === "all" ? " active" : ""}" data-rarity="all">Все</button>`;
    for (const c of categories) {
      const active = currentRarity === c.key ? " active" : "";
      html += `<button class="chip${active}" data-rarity="${esc(c.key)}">${esc(c.icon)} ${esc(c.name)} ${c.owned}/${c.total}</button>`;
    }
    el.innerHTML = html;
    el.querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentRarity = btn.dataset.rarity;
        loadCollection();
      });
    });
  }

  function renderCards(cards) {
    const grid = document.getElementById("cards-grid");
    if (!cards.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="big">🃏</div>
          <p>Пока нет карточек</p>
          <p class="muted">Напишите «мряу» в боте, чтобы получить первую</p>
        </div>`;
      return;
    }
    grid.innerHTML = cards
      .map(
        (c) => `
      <article class="card-item" data-rarity="${esc(c.rarity)}" data-id="${c.id}">
        <div class="thumb">
          ${
            c.photo_url
              ? `<img src="${esc(c.photo_url)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" />
                 <span class="ph" style="display:none">🃏</span>`
              : `<span class="ph">🃏</span>`
          }
        </div>
        <div class="meta">
          <div class="name">${esc(c.name)}</div>
          <div class="rarity">${esc(c.rarity_icon)} ${esc(c.rarity_name)}</div>
        </div>
      </article>`
      )
      .join("");

    grid.querySelectorAll(".card-item").forEach((el) => {
      el.addEventListener("click", () => {
        const id = Number(el.dataset.id);
        const card = (collectionCache?.cards || []).find((x) => x.id === id);
        if (card) openCardModal(card);
      });
    });
  }

  // ── Card modal ──────────────────────────────────────────────────────────
  function openCardModal(card) {
    const modal = document.getElementById("card-modal");
    const img = document.getElementById("modal-photo");
    const ph = document.getElementById("modal-placeholder");
    document.getElementById("modal-name").textContent = card.name;
    document.getElementById("modal-rarity").textContent =
      `${card.rarity_icon} ${card.rarity_name}`;
    const rw = Number(card.reward) || 0;
    document.getElementById("modal-reward").textContent =
      rw < 0 ? `Штраф: −${fmtNum(Math.abs(rw))} 🪙` : `Награда: +${fmtNum(rw)} 🪙`;

    if (card.photo_url) {
      img.src = card.photo_url;
      img.hidden = false;
      ph.style.display = "none";
      img.onerror = () => {
        img.hidden = true;
        ph.style.display = "block";
      };
    } else {
      img.hidden = true;
      ph.style.display = "block";
    }
    modal.hidden = false;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  }

  function closeCardModal() {
    document.getElementById("card-modal").hidden = true;
  }

  document.getElementById("modal-close").addEventListener("click", closeCardModal);
  document.getElementById("modal-backdrop").addEventListener("click", closeCardModal);

  // ── Top ─────────────────────────────────────────────────────────────────
  async function loadTop() {
    const list = document.getElementById("top-list");
    const myRank = document.getElementById("my-rank");
    try {
      const data = await api("/api/top?kind=" + encodeURIComponent(currentTopKind) + "&limit=20");
      renderTopKinds();
      renderTopList(data);
      myRank.innerHTML = `Ваше место: <strong>#${fmtNum(data.my_rank)}</strong> · ${fmtNum(data.my_value)} ${esc(data.unit)}`;
    } catch (err) {
      list.innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
      myRank.textContent = "";
    }
  }

  function renderTopKinds() {
    document.querySelectorAll("#top-kinds .chip").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.kind === currentTopKind);
    });
  }

  document.getElementById("top-kinds").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    currentTopKind = btn.dataset.kind;
    loadTop();
  });

  function renderTopList(data) {
    const list = document.getElementById("top-list");
    const medals = ["🥇", "🥈", "🥉"];
    if (!data.items?.length) {
      list.innerHTML = `<div class="empty-state"><p>Пока пусто</p></div>`;
      return;
    }
    list.innerHTML = data.items
      .map((item) => {
        const rankLabel = item.rank <= 3 ? medals[item.rank - 1] : item.rank + ".";
        return `
        <div class="top-row${item.is_me ? " is-me" : ""}" data-uid="${item.user_id}">
          <span class="top-rank">${rankLabel}</span>
          <span class="top-nick">${esc(item.nickname)}</span>
          <span class="top-value">${fmtNum(item.value)} ${esc(data.unit)}</span>
        </div>`;
      })
      .join("");

    list.querySelectorAll(".top-row").forEach((row) => {
      row.addEventListener("click", () => {
        const uid = Number(row.dataset.uid);
        if (uid) openOtherProfile(uid);
      });
    });
  }

  // ── Profile (own) ───────────────────────────────────────────────────────
  async function loadProfile() {
    const el = document.getElementById("profile-content");
    try {
      const data = me || (await api("/api/me"));
      me = data;
      updateHeader(data);
      el.innerHTML = renderProfileHTML(data, true);
    } catch (err) {
      el.innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
    }
  }

  function renderProfileHTML(data, isOwn) {
    const reg = data.registration
      ? new Date(data.registration * 1000).toLocaleDateString("ru-RU")
      : "—";
    return `
      <div class="profile-card">
        <div class="profile-avatar">👤</div>
        <div class="profile-name">${esc(data.nickname)}</div>
        <div class="profile-id">ID ${data.user_id}</div>
        <div class="profile-stats">
          <div class="pstat">
            <span class="pval">🪙 ${fmtNum(data.coins)}</span>
            <span class="plabel">монеты</span>
          </div>
          <div class="pstat">
            <span class="pval">🃏 ${fmtNum(data.cards_count)}</span>
            <span class="plabel">из ${fmtNum(data.total_cards)}</span>
          </div>
          <div class="pstat">
            <span class="pval">🔥 ${fmtNum(data.streak)}</span>
            <span class="plabel">${pluralDays(data.streak)}</span>
          </div>
        </div>
        ${
          isOwn
            ? `<p class="profile-note">Карточки можно получить в боте командой «мряу» или кнопкой. Кулдаун — 3 часа.</p>`
            : data.cards_hidden
              ? `<p class="profile-note">Коллекция карточек этого игрока скрыта.</p>`
              : ""
        }
        <p class="profile-note" style="margin-top:8px">В игре с ${esc(reg)}</p>
      </div>`;
  }

  // ── Other user profile ──────────────────────────────────────────────────
  async function openOtherProfile(userId) {
    if (me && userId === me.user_id) {
      switchTab("profile");
      return;
    }
    const content = document.getElementById("other-content");
    const title = document.getElementById("other-title");
    content.innerHTML = `<div class="loader">Загрузка…</div>`;
    switchTab("other");
    try {
      const data = await api("/api/profile/" + userId);
      title.textContent = data.nickname || "Профиль";
      content.innerHTML = renderProfileHTML(data, false);
    } catch (err) {
      content.innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
    }
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  async function boot() {
    if (!initData && location.search.includes("tgWebAppData")) {
      // fallback for some clients
      try {
        const params = new URLSearchParams(location.hash.slice(1) || location.search);
        initData = params.get("tgWebAppData") || initData;
      } catch (_) {}
    }

    try {
      me = await api("/api/me");
      updateHeader(me);
    } catch (err) {
      document.getElementById("header-stats").innerHTML =
        `<span class="muted" style="font-size:12px">${esc(err.message)}</span>`;
      console.error(err);
    }
    loadCollection();
  }

  boot();
})();

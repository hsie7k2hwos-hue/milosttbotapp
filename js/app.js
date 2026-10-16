/**
 * Cards Mini App — UI logic
 */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    page: "collection",
    rarities: [],
    rarityFilter: "all",
    search: "",
    cardsPage: 0,
    cardsTotal: 0,
    cards: [],
    loadingCards: false,
    topKind: "coins",
    top: [],
    me: null,
    myRarity: "all",
    myPage: 0,
    myCards: [],
    myTotal: 0,
    theme: localStorage.getItem("theme") || "dark",
  };

  // ── Telegram bootstrap ──────────────────────────────────────────────────
  function initTelegram() {
    const tg = API.tg;
    if (!tg) return;
    try {
      tg.ready();
      tg.expand();
      if (tg.setHeaderColor) {
        tg.setHeaderColor(state.theme === "dark" ? "#000000" : "#f2f2f7");
      }
      if (tg.setBackgroundColor) {
        tg.setBackgroundColor(state.theme === "dark" ? "#000000" : "#f2f2f7");
      }
      // sync theme with Telegram if user hasn't chosen
      if (!localStorage.getItem("theme") && tg.colorScheme) {
        state.theme = tg.colorScheme === "light" ? "light" : "dark";
      }
    } catch (e) {
      console.warn("tg init", e);
    }
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    localStorage.setItem("theme", state.theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = state.theme === "dark" ? "#000000" : "#f2f2f7";
    const tg = API.tg;
    if (tg) {
      try {
        if (tg.setHeaderColor) {
          tg.setHeaderColor(state.theme === "dark" ? "#000000" : "#f2f2f7");
        }
        if (tg.setBackgroundColor) {
          tg.setBackgroundColor(state.theme === "dark" ? "#000000" : "#f2f2f7");
        }
      } catch (_) {}
    }
  }

  // ── Utils ───────────────────────────────────────────────────────────────
  function fmt(n) {
    const x = Number(n) || 0;
    return x.toLocaleString("ru-RU").replace(/\s/g, "\u00a0");
  }

  function fmtTime(sec) {
    if (!sec || sec <= 0) return "готово";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h} ч ${m} мин`;
    if (m > 0) return `${m} мин`;
    return `${sec} сек`;
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.hidden = true;
    }, 2800);
  }

  function haptic(type) {
    try {
      if (API.tg && API.tg.HapticFeedback) {
        if (type === "impact") API.tg.HapticFeedback.impactOccurred("light");
        else API.tg.HapticFeedback.selectionChanged();
      }
    } catch (_) {}
  }

  // ── Navigation ──────────────────────────────────────────────────────────
  const PAGE_META = {
    collection: { title: "Коллекция", sub: "Все карточки" },
    top: { title: "Топ игроков", sub: "Рейтинг" },
    profile: { title: "Профиль", sub: "Ваша статистика" },
  };

  function navigate(page) {
    if (!PAGE_META[page]) return;
    state.page = page;
    $$(".page").forEach((p) => p.classList.toggle("active", p.dataset.page === page));
    $$(".nav-item").forEach((n) =>
      n.classList.toggle("active", n.dataset.nav === page)
    );
    const meta = PAGE_META[page];
    $("#pageTitle").textContent = meta.title;
    $("#pageSubtitle").textContent = meta.sub;
    haptic("select");

    if (page === "collection" && !state.cards.length) loadCards(true);
    if (page === "top") loadTop();
    if (page === "profile") loadProfile();
  }

  // ── Collection ──────────────────────────────────────────────────────────
  function renderRarityChips(container, active, onClick, includeAll = true, countsMap = null) {
    const el = $(container);
    if (!el) return;
    const parts = [];
    if (includeAll) {
      const total =
        countsMap && countsMap._total != null
          ? countsMap._total
          : state.rarities.reduce((s, r) => s + (r.count || 0), 0);
      parts.push(
        `<button type="button" class="chip${active === "all" ? " active" : ""}" data-r="all">📦 Все<span class="cnt">${fmt(total)}</span></button>`
      );
    }
    state.rarities.forEach((r) => {
      const cnt =
        countsMap && countsMap[r.key] != null ? countsMap[r.key] : r.count || 0;
      if (!includeAll && cnt === 0) return;
      parts.push(
        `<button type="button" class="chip r-${r.key}${active === r.key ? " active" : ""}" data-r="${r.key}">${r.icon} ${r.name}<span class="cnt">${fmt(cnt)}</span></button>`
      );
    });
    el.innerHTML = parts.join("");
    el.onclick = (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      onClick(btn.dataset.r);
    };
  }

  function cardTileHtml(c, compact = false) {
    const reward =
      c.reward < 0
        ? `−${fmt(Math.abs(c.reward))} 🪙`
        : `+${fmt(c.reward)} 🪙`;
    const sub = c.owners != null ? `${fmt(c.owners)} вл. · ${reward}` : reward;
    return `
      <article class="card-tile r-${c.rarity}" data-id="${c.id}" role="button" tabindex="0">
        <div class="card-tile__fallback">${c.rarity_icon || "🃏"}</div>
        ${
          c.has_photo
            ? `<img class="card-tile__img" src="${c.photo_url}" alt="" loading="lazy" onload="this.style.opacity=1" onerror="this.remove()" style="opacity:0;transition:opacity .3s" />`
            : ""
        }
        <span class="card-tile__badge">${c.rarity_icon || ""} ${c.rarity_name || c.rarity}</span>
        <div class="card-tile__foot">
          <div class="card-tile__name">${escapeHtml(c.name)}</div>
          ${compact ? "" : `<div class="card-tile__sub">${sub}</div>`}
        </div>
      </article>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function loadRarities() {
    try {
      const data = await API.rarities();
      state.rarities = data.items || [];
      renderRarityChips("#rarityChips", state.rarityFilter, (r) => {
        state.rarityFilter = r;
        renderRarityChips("#rarityChips", state.rarityFilter, arguments.callee);
        loadCards(true);
      });
    } catch (e) {
      console.error(e);
      toast("Не удалось загрузить редкости");
    }
  }

  async function loadCards(reset = false) {
    if (state.loadingCards) return;
    state.loadingCards = true;
    if (reset) {
      state.cardsPage = 0;
      state.cards = [];
      $("#cardGrid").innerHTML = Array.from({ length: 6 })
        .map(() => `<div class="skeleton" style="aspect-ratio:2/3"></div>`)
        .join("");
    }
    try {
      const data = await API.cards({
        rarity: state.rarityFilter,
        page: state.cardsPage,
        limit: APP_CONFIG.PAGE_SIZE,
        q: state.search || undefined,
      });
      const items = data.items || [];
      if (reset) state.cards = items;
      else state.cards = state.cards.concat(items);
      state.cardsTotal = data.total || 0;
      $("#statTotal").textContent = fmt(state.cardsTotal);
      $("#statShown").textContent = fmt(state.cards.length);
      $("#cardGrid").innerHTML = state.cards.map((c) => cardTileHtml(c)).join("");
      $("#collectionEmpty").hidden = state.cards.length > 0;
      const more =
        state.cards.length < state.cardsTotal && items.length >= APP_CONFIG.PAGE_SIZE;
      $("#loadMoreBtn").hidden = !more;
    } catch (e) {
      console.error(e);
      toast("Ошибка загрузки карточек");
      if (reset) $("#cardGrid").innerHTML = "";
      $("#collectionEmpty").hidden = false;
    } finally {
      state.loadingCards = false;
    }
  }

  // ── Top ─────────────────────────────────────────────────────────────────
  async function loadTop() {
    const list = $("#topList");
    list.innerHTML = Array.from({ length: 5 })
      .map(
        () =>
          `<div class="skeleton" style="height:56px;border-radius:14px"></div>`
      )
      .join("");
    try {
      const data = await API.top(state.topKind, 20);
      state.top = data.items || [];
      const unit =
        state.topKind === "cards" ? "🃏" : state.topKind === "streak" ? "🔥" : "🪙";
      if (!state.top.length) {
        list.innerHTML = "";
        $("#topEmpty").hidden = false;
        return;
      }
      $("#topEmpty").hidden = true;
      list.innerHTML = state.top
        .map(
          (r) => `
        <div class="top-row">
          <div class="top-rank">${r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank}</div>
          <div class="top-info">
            <div class="top-name">${escapeHtml(r.name)}</div>
          </div>
          <div class="top-value">${fmt(r.value)} ${unit}</div>
        </div>`
        )
        .join("");
    } catch (e) {
      console.error(e);
      toast("Ошибка топа");
      list.innerHTML = "";
      $("#topEmpty").hidden = false;
    }
  }

  // ── Profile ─────────────────────────────────────────────────────────────
  async function loadProfile() {
    try {
      const me = await API.me();
      state.me = me;
      $("#profileName").textContent = me.name || "Игрок";
      $("#profileMeta").textContent = me.username
        ? `@${me.username} · #${me.rank_coins}`
        : `ID ${me.user_id} · место #${me.rank_coins}`;
      $("#pCoins").textContent = fmt(me.coins);
      $("#pCards").textContent = `${fmt(me.cards_count)}/${fmt(me.total_cards)}`;
      $("#pStreak").textContent = fmt(me.streak);
      $("#pRank").textContent = `#${fmt(me.rank_coins)}`;
      $("#infoCooldown").textContent = fmtTime(me.cooldown_left);
      $("#infoNickCost").textContent = "150 🪙";

      const av = $("#profileAvatar");
      if (me.photo_url) {
        av.innerHTML = `<img src="${me.photo_url}" alt="" />`;
      } else {
        av.textContent = "👤";
      }

      // rarity bars
      const maxOwned = Math.max(
        1,
        ...(me.rarities || []).map((r) => r.owned || 0)
      );
      $("#rarityBars").innerHTML = (me.rarities || [])
        .map((r) => {
          const pct = Math.round(((r.owned || 0) / maxOwned) * 100);
          return `
          <div class="rarity-bar-row r-${r.key}">
            <span class="ico">${r.icon}</span>
            <div class="rarity-bar-track"><div class="rarity-bar-fill" style="width:${pct}%"></div></div>
            <span class="rarity-bar-num">${fmt(r.owned)}</span>
          </div>`;
        })
        .join("");

      const countsMap = { _total: me.cards_count };
      (me.rarities || []).forEach((r) => {
        countsMap[r.key] = r.owned;
      });
      renderRarityChips(
        "#myRarityChips",
        state.myRarity,
        (r) => {
          state.myRarity = r;
          renderRarityChips("#myRarityChips", state.myRarity, arguments.callee, true, countsMap);
          loadMyCards(true);
        },
        true,
        countsMap
      );

      loadMyCards(true);

      // global stats for nick cost / cooldown label refresh
      try {
        const st = await API.stats();
        if (st.nickname_cost != null) {
          $("#infoNickCost").textContent = `${fmt(st.nickname_cost)} 🪙`;
        }
      } catch (_) {}
    } catch (e) {
      console.error(e);
      if (e.status === 401) {
        $("#profileName").textContent = "Гость";
        $("#profileMeta").textContent = "Откройте мини-приложение из Telegram";
        toast("Нужна авторизация Telegram");
      } else {
        toast("Ошибка профиля");
      }
    }
  }

  async function loadMyCards(reset = false) {
    if (!state.me) return;
    if (reset) {
      state.myPage = 0;
      state.myCards = [];
      $("#myCardGrid").innerHTML = Array.from({ length: 6 })
        .map(() => `<div class="skeleton" style="aspect-ratio:2/3"></div>`)
        .join("");
    }
    try {
      const data = await API.myCollection({
        rarity: state.myRarity,
        page: state.myPage,
        limit: APP_CONFIG.MY_PAGE_SIZE,
      });
      const items = data.items || [];
      if (reset) state.myCards = items;
      else state.myCards = state.myCards.concat(items);
      state.myTotal = data.total || 0;
      $("#myCardGrid").innerHTML = state.myCards
        .map((c) => cardTileHtml(c, true))
        .join("");
      $("#myEmpty").hidden = state.myCards.length > 0;
      const more =
        state.myCards.length < state.myTotal &&
        items.length >= APP_CONFIG.MY_PAGE_SIZE;
      $("#myLoadMoreBtn").hidden = !more;
    } catch (e) {
      console.error(e);
      if (reset) $("#myCardGrid").innerHTML = "";
      $("#myEmpty").hidden = false;
    }
  }

  // ── Card sheet ──────────────────────────────────────────────────────────
  async function openCard(id) {
    haptic("impact");
    const sheet = $("#cardSheet");
    const backdrop = $("#sheetBackdrop");
    const img = $("#sheetPhoto");
    const fallback = $("#sheetFallback");
    img.classList.remove("loaded");
    img.removeAttribute("src");
    fallback.style.display = "grid";
    $("#sheetName").textContent = "…";
    $("#sheetRarity").textContent = "";
    $("#sheetMeta").textContent = "";
    sheet.hidden = false;
    backdrop.hidden = false;

    try {
      const c = await API.card(id);
      $("#sheetName").textContent = c.name;
      $("#sheetRarity").innerHTML = `${c.rarity_icon || ""} ${c.rarity_name || c.rarity}`;
      const reward =
        c.reward < 0
          ? `Штраф −${fmt(Math.abs(c.reward))} 🪙`
          : `Награда +${fmt(c.reward)} 🪙`;
      $("#sheetMeta").innerHTML = `
        ${reward}<br>
        Владельцев: <b>${fmt(c.owners)}</b><br>
        ID: <code>${c.id}</code>`;
      if (c.has_photo && c.photo_url) {
        img.onload = () => {
          img.classList.add("loaded");
          fallback.style.display = "none";
        };
        img.onerror = () => {
          img.classList.remove("loaded");
          fallback.style.display = "grid";
        };
        img.src = c.photo_url;
      }
      fallback.textContent = c.rarity_icon || "🃏";
    } catch (e) {
      toast("Не удалось открыть карточку");
      closeSheet();
    }
  }

  function closeSheet() {
    $("#cardSheet").hidden = true;
    $("#sheetBackdrop").hidden = true;
  }

  // ── Events ──────────────────────────────────────────────────────────────
  function bindEvents() {
    $$(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => navigate(btn.dataset.nav));
    });

    $("#themeToggle").addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      applyTheme();
      haptic("select");
    });

    let searchTimer;
    $("#searchInput").addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.search = e.target.value.trim();
        loadCards(true);
      }, 320);
    });

    $("#loadMoreBtn").addEventListener("click", () => {
      state.cardsPage += 1;
      loadCards(false);
    });
    $("#myLoadMoreBtn").addEventListener("click", () => {
      state.myPage += 1;
      loadMyCards(false);
    });

    $$("#topKindTabs .seg").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$("#topKindTabs .seg").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.topKind = btn.dataset.kind;
        loadTop();
        haptic("select");
      });
    });

    document.addEventListener("click", (e) => {
      const tile = e.target.closest(".card-tile");
      if (tile && tile.dataset.id) openCard(Number(tile.dataset.id));
    });

    $("#sheetClose").addEventListener("click", closeSheet);
    $("#sheetBackdrop").addEventListener("click", closeSheet);
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  async function boot() {
    applyTheme();
    initTelegram();
    bindEvents();

    // health check
    try {
      await API.health();
    } catch (e) {
      console.warn("API health failed", e);
      toast("API недоступен — проверьте API_BASE");
    }

    await loadRarities();
    await loadCards(true);

    const loader = $("#bootLoader");
    loader.classList.add("hide");
    setTimeout(() => {
      loader.hidden = true;
    }, 400);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

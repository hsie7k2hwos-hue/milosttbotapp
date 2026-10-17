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
    meCounts: null,
    topKind: "coins",
    top: [],
    me: null,
    activityRange: "week",
    theme: localStorage.getItem("theme") || "dark",
  };

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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Надёжная подгрузка картинки: без opacity-хака (кэш часто не стреляет onload). */
  function bindImg(img, url, onOk, onFail) {
    if (!img || !url) {
      if (onFail) onFail();
      return;
    }
    const done = (ok) => {
      img.classList.toggle("is-loaded", !!ok);
      img.classList.toggle("is-error", !ok);
      if (ok && onOk) onOk();
      if (!ok && onFail) onFail();
    };
    img.decoding = "async";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    // сброс перед сменой src
    img.removeAttribute("src");
    img.onload = () => done(true);
    img.onerror = () => done(false);
    // cache bust только если уже был error на этом url
    img.src = url;
    // если уже в кэше и complete
    if (img.complete && img.naturalWidth > 0) {
      done(true);
    }
  }

  // ── Navigation ──────────────────────────────────────────────────────────
  const PAGE_META = {
    collection: { title: "Мои карты", sub: "Коллекция" },
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

    if (page === "collection") loadMyCards(true);
    if (page === "top") loadTop();
    if (page === "profile") loadProfile();
  }

  // ── Chips ───────────────────────────────────────────────────────────────
  function renderRarityChips(container, active, onClick, countsMap) {
    const el = $(container);
    if (!el) return;
    const parts = [];
    const total =
      countsMap && countsMap._total != null
        ? countsMap._total
        : (countsMap
            ? Object.keys(countsMap)
                .filter((k) => k !== "_total")
                .reduce((s, k) => s + (countsMap[k] || 0), 0)
            : 0);
    parts.push(
      `<button type="button" class="chip${active === "all" ? " active" : ""}" data-r="all">📦 Все<span class="cnt">${fmt(total)}</span></button>`
    );
    state.rarities.forEach((r) => {
      const cnt = countsMap && countsMap[r.key] != null ? countsMap[r.key] : 0;
      if (countsMap && cnt === 0) return;
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

  function cardTileHtml(c) {
    const reward =
      c.reward < 0
        ? `−${fmt(Math.abs(c.reward))} 🪙`
        : `+${fmt(c.reward)} 🪙`;
    const photoAttr =
      c.has_photo && c.photo_url
        ? `data-photo="${escapeHtml(c.photo_url)}"`
        : "";
    return `
      <article class="card-tile r-${c.rarity}" data-id="${c.id}" ${photoAttr} role="button" tabindex="0">
        <div class="card-tile__fallback">${c.rarity_icon || "🃏"}</div>
        <img class="card-tile__img" alt="" decoding="async" draggable="false" />
        <span class="card-tile__badge">${c.rarity_icon || ""} ${escapeHtml(c.rarity_name || c.rarity)}</span>
        <div class="card-tile__foot">
          <div class="card-tile__name">${escapeHtml(c.name)}</div>
          <div class="card-tile__sub">${reward}</div>
        </div>
      </article>`;
  }

  function hydrateCardImages(root) {
    const scope = root || document;
    $$(".card-tile[data-photo]", scope).forEach((tile) => {
      const url = tile.getAttribute("data-photo");
      const img = tile.querySelector(".card-tile__img");
      const fallback = tile.querySelector(".card-tile__fallback");
      if (!img || !url) return;
      bindImg(
        img,
        url,
        () => {
          if (fallback) fallback.style.opacity = "0";
        },
        () => {
          img.style.display = "none";
          if (fallback) fallback.style.opacity = "1";
        }
      );
    });
  }

  // ── My collection (main) ────────────────────────────────────────────────
  async function ensureMeCounts() {
    if (state.meCounts) return state.meCounts;
    try {
      const me = await API.me();
      state.me = me;
      const map = { _total: me.cards_count || 0 };
      (me.rarities || []).forEach((r) => {
        map[r.key] = r.owned || 0;
      });
      state.meCounts = map;
      return map;
    } catch (e) {
      console.error(e);
      return { _total: 0 };
    }
  }

  async function loadRarities() {
    try {
      const data = await API.rarities();
      state.rarities = data.items || [];
    } catch (e) {
      console.error(e);
    }
  }

  async function loadMyCards(reset = false) {
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
      const counts = await ensureMeCounts();
      renderRarityChips("#rarityChips", state.rarityFilter, (r) => {
        state.rarityFilter = r;
        loadMyCards(true);
      }, counts);

      const data = await API.myCollection({
        rarity: state.rarityFilter,
        page: state.cardsPage,
        limit: APP_CONFIG.PAGE_SIZE,
      });
      let items = data.items || [];
      // клиентский поиск по имени
      if (state.search) {
        const q = state.search.toLowerCase();
        items = items.filter((c) => (c.name || "").toLowerCase().includes(q));
      }
      if (reset) state.cards = items;
      else state.cards = state.cards.concat(items);
      state.cardsTotal = data.total || 0;
      $("#statTotal").textContent = fmt(state.cardsTotal);
      $("#statShown").textContent = fmt(state.cards.length);
      $("#cardGrid").innerHTML = state.cards.map((c) => cardTileHtml(c)).join("");
      hydrateCardImages($("#cardGrid"));
      $("#collectionEmpty").hidden = state.cards.length > 0;
      const more =
        !state.search &&
        state.cards.length < state.cardsTotal &&
        (data.items || []).length >= APP_CONFIG.PAGE_SIZE;
      $("#loadMoreBtn").hidden = !more;
    } catch (e) {
      console.error(e);
      if (e.status === 401) {
        toast("Откройте мини-приложение из Telegram");
        $("#collectionEmpty").querySelector("p").textContent =
          "Нужна авторизация Telegram";
      } else {
        toast("Ошибка загрузки коллекции");
      }
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
          `<div class="skeleton" style="height:64px;border-radius:14px"></div>`
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
        .map((r) => {
          const medal =
            r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : String(r.rank);
          const av = r.avatar_url
            ? `<img class="top-avatar-img" data-src="${escapeHtml(r.avatar_url)}" alt="" />`
            : `<span class="top-avatar-ph">👤</span>`;
          return `
        <button type="button" class="top-row" data-user="${r.user_id}">
          <div class="top-rank">${medal}</div>
          <div class="top-avatar">${av}</div>
          <div class="top-info">
            <div class="top-name">${escapeHtml(r.name)}</div>
          </div>
          <div class="top-value">${fmt(r.value)} ${unit}</div>
        </button>`;
        })
        .join("");

      // load avatars
      $$(".top-avatar-img", list).forEach((img) => {
        const src = img.getAttribute("data-src");
        bindImg(img, src, null, () => {
          img.replaceWith(Object.assign(document.createElement("span"), {
            className: "top-avatar-ph",
            textContent: "👤",
          }));
        });
      });
    } catch (e) {
      console.error(e);
      toast("Ошибка топа");
      list.innerHTML = "";
      $("#topEmpty").hidden = false;
    }
  }

  // ── User profile sheet ──────────────────────────────────────────────────
  async function openUserProfile(userId) {
    haptic("impact");
    const sheet = $("#userSheet");
    const backdrop = $("#sheetBackdrop");
    sheet.hidden = false;
    backdrop.hidden = false;
    $("#userSheetName").textContent = "…";
    $("#userSheetMeta").textContent = "";
    $("#userCardGrid").innerHTML = "";
    $("#userRarityBars").innerHTML = "";

    try {
      const u = await API.user(userId);
      $("#userSheetName").textContent = u.name || "Игрок";
      $("#userSheetMeta").textContent = `ID ${u.user_id} · место #${u.rank_coins}`;
      $("#uCoins").textContent = fmt(u.coins);
      $("#uCards").textContent = `${fmt(u.cards_count)}/${fmt(u.total_cards)}`;
      $("#uStreak").textContent = fmt(u.streak);
      $("#uRank").textContent = `#${fmt(u.rank_coins)}`;

      const av = $("#userSheetAvatar");
      if (u.avatar_url) {
        av.innerHTML = `<img alt="" />`;
        bindImg(av.querySelector("img"), u.avatar_url, null, () => {
          av.textContent = "👤";
        });
      } else {
        av.textContent = "👤";
      }

      const maxOwned = Math.max(
        1,
        ...(u.rarities || []).map((r) => r.owned || 0)
      );
      $("#userRarityBars").innerHTML = (u.rarities || [])
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

      const col = await API.userCollection(userId, { page: 0, limit: 12 });
      const items = col.items || [];
      $("#userCardGrid").innerHTML = items.map((c) => cardTileHtml(c)).join("");
      hydrateCardImages($("#userCardGrid"));
    } catch (e) {
      console.error(e);
      toast("Не удалось открыть профиль");
      closeSheets();
    }
  }

  // ── Profile ─────────────────────────────────────────────────────────────
  function renderChart(points) {
    const el = $("#chartBars");
    if (!points || !points.length) {
      el.innerHTML = `<div class="chart-empty">Нет данных</div>`;
      return;
    }
    const max = Math.max(1, ...points.map((p) => p.count));
    const showLabels = points.length <= 14;
    el.innerHTML = points
      .map((p) => {
        const h = Math.max(4, Math.round((p.count / max) * 100));
        const label = p.date.slice(5); // MM-DD
        return `<div class="chart-col" title="${p.date}: ${p.count}">
          <div class="chart-bar" style="height:${h}%"></div>
          ${showLabels ? `<span class="chart-lbl">${label}</span>` : ""}
        </div>`;
      })
      .join("");
  }

  async function loadActivity() {
    try {
      const data = await API.activity(state.activityRange);
      renderChart(data.points || []);
      $("#chartTotal").textContent = fmt(data.total || 0);
    } catch (e) {
      console.error(e);
      $("#chartBars").innerHTML = `<div class="chart-empty">Нет данных</div>`;
      $("#chartTotal").textContent = "0";
    }
  }

  async function loadProfile() {
    try {
      const me = await API.me();
      state.me = me;
      const map = { _total: me.cards_count || 0 };
      (me.rarities || []).forEach((r) => {
        map[r.key] = r.owned || 0;
      });
      state.meCounts = map;

      $("#profileName").textContent = me.name || "Игрок";
      $("#profileMeta").textContent = me.username
        ? `@${me.username} · #${me.rank_coins}`
        : `ID ${me.user_id} · место #${me.rank_coins}`;
      $("#pCoins").textContent = fmt(me.coins);
      $("#pCards").textContent = `${fmt(me.cards_count)}/${fmt(me.total_cards)}`;
      $("#pStreak").textContent = fmt(me.streak);
      $("#pRank").textContent = `#${fmt(me.rank_coins)}`;
      $("#infoCooldown").textContent = fmtTime(me.cooldown_left);

      const av = $("#profileAvatar");
      const avUrl = me.photo_url || me.avatar_url;
      if (avUrl) {
        av.innerHTML = `<img alt="" />`;
        bindImg(av.querySelector("img"), avUrl, null, () => {
          av.textContent = "👤";
        });
      } else {
        av.textContent = "👤";
      }

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

      try {
        const st = await API.stats();
        if (st.nickname_cost != null) {
          $("#infoNickCost").textContent = `${fmt(st.nickname_cost)} 🪙`;
        }
      } catch (_) {
        $("#infoNickCost").textContent = "150 🪙";
      }

      await loadActivity();
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

  // ── Card sheet ──────────────────────────────────────────────────────────
  async function openCard(id) {
    haptic("impact");
    const sheet = $("#cardSheet");
    const backdrop = $("#sheetBackdrop");
    const img = $("#sheetPhoto");
    const fallback = $("#sheetFallback");
    img.classList.remove("is-loaded");
    img.removeAttribute("src");
    fallback.style.display = "grid";
    $("#sheetName").textContent = "…";
    $("#sheetRarity").textContent = "";
    $("#sheetMeta").textContent = "";
    sheet.hidden = false;
    backdrop.hidden = false;
    $("#userSheet").hidden = true;

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
      fallback.textContent = c.rarity_icon || "🃏";
      if (c.has_photo && c.photo_url) {
        bindImg(
          img,
          c.photo_url,
          () => {
            fallback.style.display = "none";
          },
          () => {
            fallback.style.display = "grid";
          }
        );
      }
    } catch (e) {
      toast("Не удалось открыть карточку");
      closeSheets();
    }
  }

  function closeSheets() {
    $("#cardSheet").hidden = true;
    $("#userSheet").hidden = true;
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
        loadMyCards(true);
      }, 320);
    });

    $("#loadMoreBtn").addEventListener("click", () => {
      state.cardsPage += 1;
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

    $$("#activityRangeTabs .seg").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$("#activityRangeTabs .seg").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.activityRange = btn.dataset.range;
        loadActivity();
        haptic("select");
      });
    });

    document.addEventListener("click", (e) => {
      const tile = e.target.closest(".card-tile");
      if (tile && tile.dataset.id) {
        openCard(Number(tile.dataset.id));
        return;
      }
      const row = e.target.closest(".top-row[data-user]");
      if (row) {
        openUserProfile(Number(row.dataset.user));
      }
    });

    $("#sheetClose").addEventListener("click", closeSheets);
    $("#userSheetClose").addEventListener("click", closeSheets);
    $("#sheetBackdrop").addEventListener("click", closeSheets);
  }

  async function boot() {
    applyTheme();
    initTelegram();
    bindEvents();

    try {
      await API.health();
    } catch (e) {
      console.warn("API health failed", e);
      toast("API недоступен — проверьте API_BASE");
    }

    await loadRarities();
    await loadMyCards(true);

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

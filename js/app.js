/**
 * Cards Mini App — UI logic (hardened boot)
 */
(function () {
  "use strict";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }
  function on(el, ev, fn) {
    if (el) el.addEventListener(ev, fn);
  }

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
    theme: "dark",
  };

  try {
    state.theme = localStorage.getItem("theme") || "dark";
  } catch (_) {}

  function pageSize() {
    return (window.APP_CONFIG && window.APP_CONFIG.PAGE_SIZE) || 24;
  }

  function hideBootLoader() {
    if (typeof window.__killBootLoader === "function") {
      window.__killBootLoader();
      return;
    }
    const loader = $("#bootLoader");
    if (!loader) return;
    loader.classList.add("hide");
    loader.hidden = true;
    loader.style.display = "none";
  }

  function initTelegram() {
    const tg = window.API && API.tg;
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
    try {
      localStorage.setItem("theme", state.theme);
    } catch (_) {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = state.theme === "dark" ? "#000000" : "#f2f2f7";
    const tg = window.API && API.tg;
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
    if (h > 0) return h + " ч " + m + " мин";
    if (m > 0) return m + " мин";
    return sec + " сек";
  }

  function toast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(function () {
      el.hidden = true;
    }, 3000);
  }

  function haptic(type) {
    try {
      const tg = window.API && API.tg;
      if (tg && tg.HapticFeedback) {
        if (type === "impact") tg.HapticFeedback.impactOccurred("light");
        else tg.HapticFeedback.selectionChanged();
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

  function bindImg(img, url, onOk, onFail) {
    if (!img || !url) {
      if (onFail) onFail();
      return;
    }
    function done(ok) {
      img.classList.toggle("is-loaded", !!ok);
      img.classList.toggle("is-error", !ok);
      if (ok && onOk) onOk();
      if (!ok && onFail) onFail();
    }
    img.decoding = "async";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.removeAttribute("src");
    img.onload = function () {
      done(true);
    };
    img.onerror = function () {
      done(false);
    };
    img.src = url;
    if (img.complete && img.naturalWidth > 0) done(true);
  }

  const PAGE_META = {
    collection: { title: "Мои карты", sub: "Коллекция" },
    top: { title: "Топ игроков", sub: "Рейтинг" },
    profile: { title: "Профиль", sub: "Ваша статистика" },
  };

  function navigate(page) {
    if (!PAGE_META[page]) return;
    state.page = page;
    $$(".page").forEach(function (p) {
      p.classList.toggle("active", p.dataset.page === page);
    });
    $$(".nav-item").forEach(function (n) {
      n.classList.toggle("active", n.dataset.nav === page);
    });
    const meta = PAGE_META[page];
    const t = $("#pageTitle");
    const s = $("#pageSubtitle");
    if (t) t.textContent = meta.title;
    if (s) s.textContent = meta.sub;
    haptic("select");
    if (page === "collection") loadMyCards(true);
    if (page === "top") loadTop();
    if (page === "profile") loadProfile();
  }

  function renderRarityChips(container, active, onClick, countsMap) {
    const el = $(container);
    if (!el) return;
    const parts = [];
    let total = 0;
    if (countsMap && countsMap._total != null) total = countsMap._total;
    else if (countsMap) {
      Object.keys(countsMap).forEach(function (k) {
        if (k !== "_total") total += countsMap[k] || 0;
      });
    }
    parts.push(
      '<button type="button" class="chip' +
        (active === "all" ? " active" : "") +
        '" data-r="all">📦 Все<span class="cnt">' +
        fmt(total) +
        "</span></button>"
    );
    state.rarities.forEach(function (r) {
      const cnt = countsMap && countsMap[r.key] != null ? countsMap[r.key] : 0;
      if (countsMap && cnt === 0) return;
      parts.push(
        '<button type="button" class="chip r-' +
          r.key +
          (active === r.key ? " active" : "") +
          '" data-r="' +
          r.key +
          '">' +
          r.icon +
          " " +
          r.name +
          '<span class="cnt">' +
          fmt(cnt) +
          "</span></button>"
      );
    });
    el.innerHTML = parts.join("");
    el.onclick = function (e) {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      onClick(btn.dataset.r);
    };
  }

  function cardTileHtml(c) {
    const reward =
      c.reward < 0
        ? "−" + fmt(Math.abs(c.reward)) + " 🪙"
        : "+" + fmt(c.reward) + " 🪙";
    const photoAttr =
      c.has_photo && c.photo_url
        ? ' data-photo="' + escapeHtml(c.photo_url) + '"'
        : "";
    return (
      '<article class="card-tile r-' +
      c.rarity +
      '" data-id="' +
      c.id +
      '"' +
      photoAttr +
      ' role="button" tabindex="0">' +
      '<div class="card-tile__fallback">' +
      (c.rarity_icon || "🃏") +
      "</div>" +
      '<img class="card-tile__img" alt="" decoding="async" draggable="false" />' +
      '<span class="card-tile__badge">' +
      (c.rarity_icon || "") +
      " " +
      escapeHtml(c.rarity_name || c.rarity) +
      "</span>" +
      '<div class="card-tile__foot">' +
      '<div class="card-tile__name">' +
      escapeHtml(c.name) +
      "</div>" +
      '<div class="card-tile__sub">' +
      reward +
      "</div>" +
      "</div></article>"
    );
  }

  function hydrateCardImages(root) {
    $$(".card-tile[data-photo]", root || document).forEach(function (tile) {
      const url = tile.getAttribute("data-photo");
      const img = tile.querySelector(".card-tile__img");
      const fallback = tile.querySelector(".card-tile__fallback");
      if (!img || !url) return;
      bindImg(
        img,
        url,
        function () {
          if (fallback) fallback.style.opacity = "0";
        },
        function () {
          img.style.display = "none";
          if (fallback) fallback.style.opacity = "1";
        }
      );
    });
  }

  async function ensureMeCounts() {
    if (state.meCounts) return state.meCounts;
    try {
      const me = await API.me();
      state.me = me;
      const map = { _total: me.cards_count || 0 };
      (me.rarities || []).forEach(function (r) {
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

  function showCollectionEmpty(text) {
    const box = $("#collectionEmpty");
    const p = $("#collectionEmptyText");
    if (box) box.hidden = false;
    if (p && text) p.textContent = text;
  }

  async function loadMyCards(reset) {
    if (state.loadingCards) return;
    state.loadingCards = true;
    const grid = $("#cardGrid");
    if (reset) {
      state.cardsPage = 0;
      state.cards = [];
      if (grid) {
        grid.innerHTML = Array.from({ length: 6 })
          .map(function () {
            return '<div class="skeleton" style="aspect-ratio:2/3"></div>';
          })
          .join("");
      }
    }
    try {
      const counts = await ensureMeCounts();
      renderRarityChips(
        "#rarityChips",
        state.rarityFilter,
        function (r) {
          state.rarityFilter = r;
          loadMyCards(true);
        },
        counts
      );

      const data = await API.myCollection({
        rarity: state.rarityFilter,
        page: state.cardsPage,
        limit: pageSize(),
      });
      let items = data.items || [];
      if (state.search) {
        const q = state.search.toLowerCase();
        items = items.filter(function (c) {
          return (c.name || "").toLowerCase().indexOf(q) !== -1;
        });
      }
      if (reset) state.cards = items;
      else state.cards = state.cards.concat(items);
      state.cardsTotal = data.total || 0;
      const st = $("#statTotal");
      const ss = $("#statShown");
      if (st) st.textContent = fmt(state.cardsTotal);
      if (ss) ss.textContent = fmt(state.cards.length);
      if (grid) grid.innerHTML = state.cards.map(cardTileHtml).join("");
      hydrateCardImages(grid);
      const empty = $("#collectionEmpty");
      if (empty) empty.hidden = state.cards.length > 0;
      const more =
        !state.search &&
        state.cards.length < state.cardsTotal &&
        (data.items || []).length >= pageSize();
      const btn = $("#loadMoreBtn");
      if (btn) btn.hidden = !more;
    } catch (e) {
      console.error(e);
      if (e.status === 401) {
        toast("Откройте мини-приложение из Telegram");
        showCollectionEmpty("Нужна авторизация Telegram");
      } else if (e.code === "NO_API_BASE") {
        showCollectionEmpty("Укажите API_BASE в js/config.js");
        toast("API не настроен");
      } else {
        toast(e.message || "Ошибка загрузки");
        showCollectionEmpty("Не удалось загрузить коллекцию");
      }
      if (reset && grid) grid.innerHTML = "";
    } finally {
      state.loadingCards = false;
    }
  }

  async function loadTop() {
    const list = $("#topList");
    if (list) {
      list.innerHTML = Array.from({ length: 5 })
        .map(function () {
          return '<div class="skeleton" style="height:64px;border-radius:14px"></div>';
        })
        .join("");
    }
    try {
      const data = await API.top(state.topKind, 20);
      state.top = data.items || [];
      const unit =
        state.topKind === "cards"
          ? "🃏"
          : state.topKind === "streak"
            ? "🔥"
            : "🪙";
      if (!state.top.length) {
        if (list) list.innerHTML = "";
        const te = $("#topEmpty");
        if (te) te.hidden = false;
        return;
      }
      const te = $("#topEmpty");
      if (te) te.hidden = true;
      if (!list) return;
      list.innerHTML = state.top
        .map(function (r) {
          const medal =
            r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : String(r.rank);
          const av = r.avatar_url
            ? '<img class="top-avatar-img" data-src="' +
              escapeHtml(r.avatar_url) +
              '" alt="" />'
            : '<span class="top-avatar-ph">👤</span>';
          return (
            '<button type="button" class="top-row" data-user="' +
            r.user_id +
            '">' +
            '<div class="top-rank">' +
            medal +
            "</div>" +
            '<div class="top-avatar">' +
            av +
            "</div>" +
            '<div class="top-info"><div class="top-name">' +
            escapeHtml(r.name) +
            "</div></div>" +
            '<div class="top-value">' +
            fmt(r.value) +
            " " +
            unit +
            "</div></button>"
          );
        })
        .join("");
      $$(".top-avatar-img", list).forEach(function (img) {
        const src = img.getAttribute("data-src");
        bindImg(img, src, null, function () {
          const sp = document.createElement("span");
          sp.className = "top-avatar-ph";
          sp.textContent = "👤";
          img.replaceWith(sp);
        });
      });
    } catch (e) {
      console.error(e);
      toast("Ошибка топа");
      if (list) list.innerHTML = "";
      const te = $("#topEmpty");
      if (te) te.hidden = false;
    }
  }

  async function openUserProfile(userId) {
    haptic("impact");
    const sheet = $("#userSheet");
    const backdrop = $("#sheetBackdrop");
    if (sheet) sheet.hidden = false;
    if (backdrop) backdrop.hidden = false;
    const nameEl = $("#userSheetName");
    if (nameEl) nameEl.textContent = "…";
    try {
      const u = await API.user(userId);
      if (nameEl) nameEl.textContent = u.name || "Игрок";
      const meta = $("#userSheetMeta");
      if (meta) meta.textContent = "ID " + u.user_id + " · место #" + u.rank_coins;
      const set = function (id, v) {
        const el = $(id);
        if (el) el.textContent = v;
      };
      set("#uCoins", fmt(u.coins));
      set("#uCards", fmt(u.cards_count) + "/" + fmt(u.total_cards));
      set("#uStreak", fmt(u.streak));
      set("#uRank", "#" + fmt(u.rank_coins));
      const av = $("#userSheetAvatar");
      if (av) {
        if (u.avatar_url) {
          av.innerHTML = "<img alt=\"\" />";
          bindImg(av.querySelector("img"), u.avatar_url, null, function () {
            av.textContent = "👤";
          });
        } else av.textContent = "👤";
      }
      const maxOwned = Math.max(
        1,
        ...(u.rarities || []).map(function (r) {
          return r.owned || 0;
        })
      );
      const bars = $("#userRarityBars");
      if (bars) {
        bars.innerHTML = (u.rarities || [])
          .map(function (r) {
            const pct = Math.round(((r.owned || 0) / maxOwned) * 100);
            return (
              '<div class="rarity-bar-row r-' +
              r.key +
              '"><span class="ico">' +
              r.icon +
              '</span><div class="rarity-bar-track"><div class="rarity-bar-fill" style="width:' +
              pct +
              '%"></div></div><span class="rarity-bar-num">' +
              fmt(r.owned) +
              "</span></div>"
            );
          })
          .join("");
      }
      const col = await API.userCollection(userId, { page: 0, limit: 12 });
      const ug = $("#userCardGrid");
      if (ug) {
        ug.innerHTML = (col.items || []).map(cardTileHtml).join("");
        hydrateCardImages(ug);
      }
    } catch (e) {
      console.error(e);
      toast("Не удалось открыть профиль");
      closeSheets();
    }
  }

  function renderChart(points) {
    const el = $("#chartBars");
    if (!el) return;
    if (!points || !points.length) {
      el.innerHTML = '<div class="chart-empty">Нет данных</div>';
      return;
    }
    const max = Math.max(
      1,
      ...points.map(function (p) {
        return p.count;
      })
    );
    const showLabels = points.length <= 14;
    el.innerHTML = points
      .map(function (p) {
        const h = Math.max(4, Math.round((p.count / max) * 100));
        const label = p.date.slice(5);
        return (
          '<div class="chart-col" title="' +
          p.date +
          ": " +
          p.count +
          '"><div class="chart-bar" style="height:' +
          h +
          '%"></div>' +
          (showLabels ? '<span class="chart-lbl">' + label + "</span>" : "") +
          "</div>"
        );
      })
      .join("");
  }

  async function loadActivity() {
    try {
      const data = await API.activity(state.activityRange);
      renderChart(data.points || []);
      const ct = $("#chartTotal");
      if (ct) ct.textContent = fmt(data.total || 0);
    } catch (e) {
      console.error(e);
      const el = $("#chartBars");
      if (el) el.innerHTML = '<div class="chart-empty">Нет данных</div>';
    }
  }

  async function loadProfile() {
    try {
      const me = await API.me();
      state.me = me;
      const map = { _total: me.cards_count || 0 };
      (me.rarities || []).forEach(function (r) {
        map[r.key] = r.owned || 0;
      });
      state.meCounts = map;
      const set = function (id, v) {
        const el = $(id);
        if (el) el.textContent = v;
      };
      set("#profileName", me.name || "Игрок");
      set(
        "#profileMeta",
        me.username
          ? "@" + me.username + " · #" + me.rank_coins
          : "ID " + me.user_id + " · место #" + me.rank_coins
      );
      set("#pCoins", fmt(me.coins));
      set("#pCards", fmt(me.cards_count) + "/" + fmt(me.total_cards));
      set("#pStreak", fmt(me.streak));
      set("#pRank", "#" + fmt(me.rank_coins));
      set("#infoCooldown", fmtTime(me.cooldown_left));
      const av = $("#profileAvatar");
      const avUrl = me.photo_url || me.avatar_url;
      if (av) {
        if (avUrl) {
          av.innerHTML = "<img alt=\"\" />";
          bindImg(av.querySelector("img"), avUrl, null, function () {
            av.textContent = "👤";
          });
        } else av.textContent = "👤";
      }
      const maxOwned = Math.max(
        1,
        ...(me.rarities || []).map(function (r) {
          return r.owned || 0;
        })
      );
      const bars = $("#rarityBars");
      if (bars) {
        bars.innerHTML = (me.rarities || [])
          .map(function (r) {
            const pct = Math.round(((r.owned || 0) / maxOwned) * 100);
            return (
              '<div class="rarity-bar-row r-' +
              r.key +
              '"><span class="ico">' +
              r.icon +
              '</span><div class="rarity-bar-track"><div class="rarity-bar-fill" style="width:' +
              pct +
              '%"></div></div><span class="rarity-bar-num">' +
              fmt(r.owned) +
              "</span></div>"
            );
          })
          .join("");
      }
      try {
        const st = await API.stats();
        if (st.nickname_cost != null) set("#infoNickCost", fmt(st.nickname_cost) + " 🪙");
        else set("#infoNickCost", "150 🪙");
      } catch (_) {
        set("#infoNickCost", "150 🪙");
      }
      await loadActivity();
    } catch (e) {
      console.error(e);
      if (e.status === 401) {
        const n = $("#profileName");
        const m = $("#profileMeta");
        if (n) n.textContent = "Гость";
        if (m) m.textContent = "Откройте из Telegram";
        toast("Нужна авторизация Telegram");
      } else toast("Ошибка профиля");
    }
  }

  async function openCard(id) {
    haptic("impact");
    const sheet = $("#cardSheet");
    const backdrop = $("#sheetBackdrop");
    const img = $("#sheetPhoto");
    const fallback = $("#sheetFallback");
    if (img) {
      img.classList.remove("is-loaded");
      img.removeAttribute("src");
    }
    if (fallback) fallback.style.display = "grid";
    const sn = $("#sheetName");
    if (sn) sn.textContent = "…";
    if (sheet) sheet.hidden = false;
    if (backdrop) backdrop.hidden = false;
    const us = $("#userSheet");
    if (us) us.hidden = true;
    try {
      const c = await API.card(id);
      if (sn) sn.textContent = c.name;
      const sr = $("#sheetRarity");
      if (sr) sr.innerHTML = (c.rarity_icon || "") + " " + (c.rarity_name || c.rarity);
      const sm = $("#sheetMeta");
      if (sm) {
        const reward =
          c.reward < 0
            ? "Штраф −" + fmt(Math.abs(c.reward)) + " 🪙"
            : "Награда +" + fmt(c.reward) + " 🪙";
        sm.innerHTML =
          reward +
          "<br>Владельцев: <b>" +
          fmt(c.owners) +
          "</b><br>ID: <code>" +
          c.id +
          "</code>";
      }
      if (fallback) fallback.textContent = c.rarity_icon || "🃏";
      if (c.has_photo && c.photo_url && img) {
        bindImg(
          img,
          c.photo_url,
          function () {
            if (fallback) fallback.style.display = "none";
          },
          function () {
            if (fallback) fallback.style.display = "grid";
          }
        );
      }
    } catch (e) {
      toast("Не удалось открыть карточку");
      closeSheets();
    }
  }

  function closeSheets() {
    const cs = $("#cardSheet");
    const us = $("#userSheet");
    const bd = $("#sheetBackdrop");
    if (cs) cs.hidden = true;
    if (us) us.hidden = true;
    if (bd) bd.hidden = true;
  }

  function bindEvents() {
    $$(".nav-item").forEach(function (btn) {
      on(btn, "click", function () {
        navigate(btn.dataset.nav);
      });
    });
    on($("#themeToggle"), "click", function () {
      state.theme = state.theme === "dark" ? "light" : "dark";
      applyTheme();
      haptic("select");
    });
    let searchTimer;
    on($("#searchInput"), "input", function (e) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.search = e.target.value.trim();
        loadMyCards(true);
      }, 320);
    });
    on($("#loadMoreBtn"), "click", function () {
      state.cardsPage += 1;
      loadMyCards(false);
    });
    $$("#topKindTabs .seg").forEach(function (btn) {
      on(btn, "click", function () {
        $$("#topKindTabs .seg").forEach(function (b) {
          b.classList.remove("active");
        });
        btn.classList.add("active");
        state.topKind = btn.dataset.kind;
        loadTop();
        haptic("select");
      });
    });
    $$("#activityRangeTabs .seg").forEach(function (btn) {
      on(btn, "click", function () {
        $$("#activityRangeTabs .seg").forEach(function (b) {
          b.classList.remove("active");
        });
        btn.classList.add("active");
        state.activityRange = btn.dataset.range;
        loadActivity();
        haptic("select");
      });
    });
    on(document, "click", function (e) {
      const tile = e.target.closest(".card-tile");
      if (tile && tile.dataset.id) {
        openCard(Number(tile.dataset.id));
        return;
      }
      const row = e.target.closest(".top-row[data-user]");
      if (row) openUserProfile(Number(row.dataset.user));
    });
    on($("#sheetClose"), "click", closeSheets);
    on($("#userSheetClose"), "click", closeSheets);
    on($("#sheetBackdrop"), "click", closeSheets);
  }

  async function boot() {
    // 1) Сразу убираем лоадер — UI виден всегда
    hideBootLoader();

    try {
      applyTheme();
    } catch (e) {
      console.warn(e);
    }
    try {
      initTelegram();
    } catch (e) {
      console.warn(e);
    }
    try {
      bindEvents();
    } catch (e) {
      console.error("bindEvents", e);
    }

    if (!window.API) {
      if (window.__showBootError) {
        window.__showBootError("API-модуль не загрузился", "Проверьте js/api.js на Vercel");
      }
      return;
    }

    const base = API.apiBase ? API.apiBase() : "";
    if (!base || /YOUR-BOTHOST|example\.com/i.test(base)) {
      showCollectionEmpty(
        "Укажите URL API в js/config.js (FALLBACK) или откройте с ?api=https://..."
      );
      toast("API_BASE не настроен");
      return;
    }

    try {
      await API.health();
    } catch (e) {
      console.warn("health", e);
      toast(e.code === "TIMEOUT" ? "API не отвечает" : "API недоступен: " + (e.message || ""));
      showCollectionEmpty("Нет связи с сервером. Проверьте API_BASE и CORS.");
    }

    try {
      await loadRarities();
    } catch (e) {
      console.warn(e);
    }
    try {
      await loadMyCards(true);
    } catch (e) {
      console.error(e);
      showCollectionEmpty("Ошибка загрузки коллекции");
    }
  }

  function start() {
    try {
      boot().catch(function (e) {
        console.error(e);
        hideBootLoader();
        if (window.__showBootError) {
          window.__showBootError("Сбой запуска", (e && e.message) || String(e));
        }
      });
    } catch (e) {
      hideBootLoader();
      if (window.__showBootError) {
        window.__showBootError("Критическая ошибка", String(e));
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

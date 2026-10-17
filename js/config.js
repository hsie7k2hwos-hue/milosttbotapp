/**
 * Конфигурация мини-приложения.
 *
 * API_BASE — публичный URL бэкенда на BotHost (без слэша в конце).
 * Задаётся:
 *   1) window.__API_BASE__ (инжект при деплое)
 *   2) meta / query ?api=
 *   3) localStorage api_base
 *   4) fallback ниже — замените на свой URL
 */
(function () {
  const params = new URLSearchParams(location.search);
  const fromQuery = params.get("api");
  const fromStorage = localStorage.getItem("api_base");
  const fromWindow = typeof window.__API_BASE__ === "string" ? window.__API_BASE__ : "";

  // ⚠️ Замените на публичный URL API бота (BotHost)
  const FALLBACK = "https://bot-1788312110-6885-chekinikita.bothost.tech/";

  const raw = (fromWindow || fromQuery || fromStorage || FALLBACK).replace(/\/$/, "");
  window.APP_CONFIG = {
    API_BASE: raw,
    PAGE_SIZE: 24,
    MY_PAGE_SIZE: 18,
  };

  if (fromQuery) {
    try {
      localStorage.setItem("api_base", raw);
    } catch (_) {}
  }
})();

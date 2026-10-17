/**
 * ОБЯЗАТЕЛЬНО укажите публичный URL API бота (BotHost).
 *
 * Можно так:
 *  1) Заменить FALLBACK ниже
 *  2) Открыть мини-приложение: https://app.vercel.app/?api=https://your-api.com
 *  3) window.__API_BASE__ до загрузки скриптов
 */
(function () {
  var params = new URLSearchParams(location.search);
  var fromQuery = params.get("api");
  var fromStorage = null;
  try {
    fromStorage = localStorage.getItem("api_base");
  } catch (_) {}
  var fromWindow =
    typeof window.__API_BASE__ === "string" ? window.__API_BASE__ : "";

  // >>> ЗАМЕНИТЕ НА СВОЙ ПУБЛИЧНЫЙ URL API <<<
  var FALLBACK = "https://bot-1788312110-6885-chekinikita.bothost.tech";

  var raw = (fromWindow || fromQuery || fromStorage || FALLBACK).replace(
    /\/$/,
    ""
  );
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

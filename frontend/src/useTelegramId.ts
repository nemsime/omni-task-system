import { useCallback, useEffect, useState } from "react";

const KEY = "telegramId";
const URL_PARAM = "tg";

function readUrlTelegramId(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get(URL_PARAM);
  if (!value) return null;
  const trimmed = value.trim();
  // Telegram IDs are positive integers; reject anything else to avoid
  // accidentally persisting garbage from a malformed link.
  return /^\d+$/.test(trimmed) ? trimmed : null;
}

function stripTelegramIdFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(URL_PARAM)) return;
  url.searchParams.delete(URL_PARAM);
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}

export function useTelegramId() {
  const [telegramId, setTelegramIdState] = useState<string | null>(() => {
    return readUrlTelegramId() ?? localStorage.getItem(KEY);
  });

  // Persist a URL-derived ID and clean the param out so refreshes / bookmarks
  // don't keep re-applying it and the ID doesn't linger in referer headers.
  useEffect(() => {
    const fromUrl = readUrlTelegramId();
    if (fromUrl) {
      localStorage.setItem(KEY, fromUrl);
    }
    stripTelegramIdFromUrl();
  }, []);

  const setTelegramId = useCallback((value: string | null) => {
    if (value) {
      localStorage.setItem(KEY, value);
    } else {
      localStorage.removeItem(KEY);
    }
    setTelegramIdState(value);
  }, []);

  return { telegramId, setTelegramId };
}

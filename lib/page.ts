/**
 * YouTube のページ種別判定と SPA ナビゲーション購読。
 */

const YT_HOST = /(^|\.)youtube\.com$/;

export function isYouTube(): boolean {
  return YT_HOST.test(location.hostname);
}

export function isHomePage(): boolean {
  return isYouTube() && location.pathname === '/';
}

export function isWatchPage(): boolean {
  return isYouTube() && location.pathname.startsWith('/watch');
}

/**
 * YouTube の SPA 遷移（yt-navigate-*）と popstate を購読する。
 * navigate-start はマスクを掛け直す（フリッカー防止）、finish は再適用に使う。
 */
export function onNavigation(handlers: {
  start?: () => void;
  finish?: () => void;
}): () => void {
  const start = () => handlers.start?.();
  const finish = () => handlers.finish?.();
  document.addEventListener('yt-navigate-start', start);
  document.addEventListener('yt-navigate-finish', finish);
  window.addEventListener('popstate', finish);
  return () => {
    document.removeEventListener('yt-navigate-start', start);
    document.removeEventListener('yt-navigate-finish', finish);
    window.removeEventListener('popstate', finish);
  };
}

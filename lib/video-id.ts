/** カードのリンク href から動画 ID を取り出す純粋関数。取得不可なら null。 */
export function parseVideoId(href: string | null | undefined): string | null {
  if (typeof href !== 'string' || !href) {
    return null;
  }
  try {
    const url = new URL(href, 'https://www.youtube.com');
    if (url.pathname === '/watch') {
      const v = url.searchParams.get('v');
      return v && /^[\w-]{1,24}$/.test(v) ? v : null;
    }
    const shorts = url.pathname.match(/^\/shorts\/([\w-]{1,24})$/);
    return shorts ? shorts[1]! : null;
  } catch {
    return null;
  }
}

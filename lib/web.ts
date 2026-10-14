/** Fetch a prospect's website and reduce it to readable text for the research agent. */
export async function fetchSiteText(url: string | null | undefined, maxChars = 12000): Promise<string> {
  if (!url) return "";
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const res = await fetch(href, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EhubResearchBot/1.0)" },
      redirect: "follow",
    });
    if (!res.ok) return "";
    const html = await res.text();
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] ?? "";
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    return `TITLE: ${title}\nDESCRIPTION: ${desc}\nCONTENT: ${text}`.slice(0, maxChars);
  } catch {
    return "";
  }
}

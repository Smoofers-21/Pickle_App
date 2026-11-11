import type { BeforeSend } from "@vercel/analytics/next";

const publicPaths = new Set(["/", "/new", "/join"]);

// Only send known page routes. Lobby codes, URL credentials, queries and
// fragments must never become analytics dimensions. New routes require review.
export const sanitizeAnalyticsEvent: BeforeSend = (event) => {
  if (event.type !== "pageview") return null;

  try {
    const url = new URL(event.url);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    const privateRoute = /^\/(lobby|join)\/[^/]+\/?$/.exec(url.pathname);
    const path = privateRoute ? `/${privateRoute[1]}/[code]` : url.pathname;
    if (!privateRoute && !publicPaths.has(path)) return null;

    return { type: "pageview", url: new URL(path, url.origin).href };
  } catch {
    return null;
  }
};

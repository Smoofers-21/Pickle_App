import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Next.js sends every NEXT_PUBLIC_ variable to the browser. Stop the build if
// a secret is ever given that prefix by mistake (see Security and privacy in
// docs/build-plan.md).
const leakedSecrets = Object.keys(process.env).filter(
  (name) =>
    name.startsWith("NEXT_PUBLIC_") &&
    /SECRET|SERVICE_ROLE|PRIVATE|GEOAPIFY|GOOGLE|PLACES|TICKETMASTER/.test(name),
);
if (leakedSecrets.length > 0) {
  throw new Error(
    `These variables must not start with NEXT_PUBLIC_, because that sends them to every browser: ${leakedSecrets.join(", ")}`,
  );
}

// Phones talk only to our own server and to Supabase (from milestone 2).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseOrigins = supabaseUrl
  ? [new URL(supabaseUrl).origin, new URL(supabaseUrl).origin.replace(/^https:/, "wss:")]
  : [];

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js needs inline scripts to start the page. Scripts from any other
  // site are blocked.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Event images come only from Ticketmaster's image host (the parser keeps
  // https *.ticketm.net URLs only); restaurant photos are local.
  "img-src 'self' data: blob: https://*.ticketm.net",
  "font-src 'self'",
  `connect-src 'self' ${supabaseOrigins.join(" ")}`.trim(),
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

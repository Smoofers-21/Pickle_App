import type { Metadata, Viewport } from "next";
import { WebAnalytics } from "@/components/WebAnalytics";
import "@fontsource-variable/outfit";
import "./globals.css";

// Absolute address for the link preview image. Vercel sets these at build.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

const description = "Decide what to do with your friends in a few minutes.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Pickle",
  applicationName: "Pickle",
  description,
  appleWebApp: { capable: true, title: "Pickle", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Pickle",
    description,
    siteName: "Pickle",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Pickle logo" }],
  },
  twitter: { card: "summary_large_image", images: ["/og-image.png"] },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        {children}
        {process.env.VERCEL_ENV === "production" && <WebAnalytics />}
      </body>
    </html>
  );
}

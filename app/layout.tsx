import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ONE_LINER } from "@/lib/one-liner";
import { OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/site";

const instrumentSerif = localFont({
  variable: "--font-instrument-serif",
  display: "swap",
  src: [
    { path: "./fonts/InstrumentSerif-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/InstrumentSerif-Italic.ttf", weight: "400", style: "italic" },
  ],
  fallback: ["Iowan Old Style", "Georgia", "serif"],
});

const instrumentSans = localFont({
  variable: "--font-instrument-sans",
  display: "swap",
  src: [{ path: "./fonts/InstrumentSans.ttf", weight: "400 700", style: "normal" }],
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const dmMono = localFont({
  variable: "--font-dm-mono",
  display: "swap",
  src: [
    { path: "./fonts/DMMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/DMMono-Medium.ttf", weight: "500", style: "normal" },
  ],
  fallback: ["ui-monospace", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: ONE_LINER,
  applicationName: SITE_NAME,
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", site: "@ariadne_agents", images: [OG_IMAGE.url] },
  // App pages hold people's documents; only the public pages opt back in to indexing.
  robots: { index: false, follow: false },
};

// viewport-fit=cover lets the app paint under notches; the edges pad themselves with
// env(safe-area-inset-*) (globals.css). resizes-content makes Android shrink the layout
// viewport (and dvh) for the keyboard, so pinned footers stay above it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#f2ece1",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${instrumentSans.variable} ${dmMono.variable} h-full antialiased`}
      // Analytics token, used by public/consent.js only after the visitor accepts (empty: no analytics).
      data-cf-beacon={process.env.NEXT_PUBLIC_CF_BEACON_TOKEN || undefined}
    >
      <body className="h-full font-sans text-ink">
        {children}
        <script src="/consent.js" defer />
      </body>
    </html>
  );
}

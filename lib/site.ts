/** Public facts used by metadata, the sitemap and JSON-LD. Override with NEXT_PUBLIC_SITE_URL. */
export const SITE_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SITE_URL?.trim()) ||
  "http://localhost:3000";
export const SITE_NAME = "Ariadne";
export const TAGLINE = "AI fact-checking for researchers";
export const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "Ariadne: Stop Second-Guessing Your Research. Every Key Claim, Checked Against Its Source.",
};
export const SOCIAL = [
  "https://x.com/ariadne_agents",
  "https://www.instagram.com/ariadne_agents/",
];
export const GITHUB_REPO = "https://github.com/saadixsd/Ariadne";
export const GITHUB_ISSUES = `${GITHUB_REPO}/issues`;

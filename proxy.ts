import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CAMPAIGN_COOKIE, CAMPAIGN_COOKIE_MAX_AGE, campaignFromParams, encodeCampaign } from "@/lib/campaign";

// "/" is the public landing page (static). Everything else that is not a door page or the
// API needs a session; signed-out visitors are sent to /sign-in.
const PUBLIC_PATHS = ["/", "/sign-in", "/sign-up", "/verify"];
// Query keys that only ever meant "open the board" when the board lived at "/".
const LEGACY_BOARD_KEYS = ["project", "new"];
// The door pages are static. Only a visitor who already holds a session cookie needs
// the dynamic variant, which redirects a signed-in, verified account to the board.
const DOOR_PATHS = ["/sign-in", "/sign-up"];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// A write to the API must come from Ariadne's own pages. Browsers send Origin on every
// cross-site POST/PATCH/DELETE (a form on another site included), so a mismatch is refused.
// Requests without Origin (curl, server-to-server, the tests) are let through unless the
// browser marks them cross-site; the session cookie is SameSite=Lax on top of this.
function isCrossSiteWrite(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host !== (request.headers.get("host") ?? request.nextUrl.host);
    } catch {
      return true; // "null" or garbage
    }
  }
  return request.headers.get("sec-fetch-site") === "cross-site";
}

// First touch wins: an outreach link (?ref=…&utm_…) is kept for sign-up unless one is already kept.
export function proxy(request: NextRequest) {
  const response = route(request);
  if (request.method === "GET" && !request.cookies.get(CAMPAIGN_COOKIE)) {
    const campaign = campaignFromParams(request.nextUrl.searchParams);
    if (campaign) {
      response.cookies.set(CAMPAIGN_COOKIE, encodeCampaign(campaign), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: CAMPAIGN_COOKIE_MAX_AGE,
        path: "/",
      });
    }
  }
  return response;
}

function route(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // One canonical host: www.ariadneagents.si → ariadneagents.si (permanent, path and query kept).
  if (request.headers.get("host")?.toLowerCase() === "www.ariadneagents.si") {
    return NextResponse.redirect(`https://ariadneagents.si${pathname}${request.nextUrl.search}`, 308);
  }
  if (pathname.startsWith("/api/") && isCrossSiteWrite(request)) {
    return NextResponse.json({ error: "This request came from another site, so Ariadne refused it." }, { status: 403 });
  }
  const hasSession = Boolean(request.cookies.get("ariadne_session")?.value);
  if (pathname === "/") {
    // Old links (/?project=…, /?new=1) still go to the board. Everyone else, signed in or
    // not, gets the static landing page; "Tie the Thread" (/sign-up) sends a signed-in
    // visitor on to the board.
    const legacy = LEGACY_BOARD_KEYS.some((key) => request.nextUrl.searchParams.has(key));
    if (legacy) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  if (DOOR_PATHS.includes(pathname) && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = `${pathname}/session`;
    return NextResponse.rewrite(url);
  }
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    PUBLIC_PATHS.some((path) => pathname === path)
  ) {
    return NextResponse.next();
  }
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

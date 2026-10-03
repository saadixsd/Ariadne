import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/verify"];
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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/") && isCrossSiteWrite(request)) {
    return NextResponse.json({ error: "This request came from another site, so Ariadne refused it." }, { status: 403 });
  }
  if (DOOR_PATHS.includes(pathname) && request.cookies.get("ariadne_session")?.value) {
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
  if (!request.cookies.get("ariadne_session")?.value) {
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

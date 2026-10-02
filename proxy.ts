import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/verify"];
// The door pages are static. Only a visitor who already holds a session cookie needs
// the dynamic variant, which redirects a signed-in, verified account to the board.
const DOOR_PATHS = ["/sign-in", "/sign-up"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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

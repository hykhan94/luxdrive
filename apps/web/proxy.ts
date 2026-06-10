import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy: protects /dashboard/* routes
 *
 * Only checks if the session cookie EXISTS — does NOT validate server-side.
 * The cookie lives on localhost (shared between ports 3000 and 5000),
 * but the proxy's server-side fetch can't forward browser cookies cross-port.
 *
 * Real session validation happens client-side in auth-context.tsx
 * via authApi.getSession() which runs in the browser with credentials: include.
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect dashboard routes
  if (!pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  // Check for Better Auth session cookie
  const hasSession =
    request.cookies.has("better-auth.session_token") ||
    request.cookies.has("__Secure-better-auth.session_token");

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("login", "true");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};

import { isTeachingPrototype, postLoginPath } from "@/lib/teaching/config";
import {
  deniedTeachingRoleRedirect,
  SESSION_MARKER_COOKIE,
  sharedAuthCookieDomain,
} from "@/lib/teaching/home-routing";
import { isOwner, isResearcher, isTeacher } from "@/lib/teaching/teacher-utils";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabasePublicKey, getSupabaseUrl } from "./env";

/**
 * Paths that must load without a Supabase session (marketing, legal, auth,
 * tokenized invite accept). `/invite/accept` without a token redirects to
 * `/auth/signup` in the page; keep the path public so invite hash recovery
 * still works before cookies exist.
 */
export function isPublicPath(pathname: string): boolean {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  return (
    path === "/" ||
    path === "/privacy" ||
    path === "/terms" ||
    path.startsWith("/auth") ||
    path.startsWith("/invite") ||
    path.startsWith("/api/invitations") ||
    path.startsWith("/api/apparatuses")
  );
}

/**
 * Unauthenticated PAGE shells redirect to login. API routes are left alone so
 * handlers can return 401 JSON (do not HTML-redirect `/api/*`).
 */
export function unauthenticatedPageRedirect(
  pathname: string
): "/auth/login" | null {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  if (path.startsWith("/api/")) return null;
  if (isPublicPath(path)) return null;
  return "/auth/login";
}

/** Prefer public Host / X-Forwarded-Host — nextUrl.hostname is often 127.0.0.1 behind the proxy. */
function requestHostname(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-host");
  if (forwarded) {
    return forwarded.split(",")[0].trim().split(":")[0].toLowerCase();
  }
  const host = request.headers.get("host");
  if (host) {
    return host.split(":")[0].toLowerCase();
  }
  return request.nextUrl.hostname.toLowerCase();
}

function applySessionMarker(
  response: NextResponse,
  request: NextRequest,
  authed: boolean
): NextResponse {
  const hostname = requestHostname(request);
  const domain = sharedAuthCookieDomain(hostname);
  const secure = request.nextUrl.protocol === "https:" || Boolean(domain);
  const base = {
    path: "/",
    sameSite: "lax" as const,
    secure,
    ...(domain ? { domain } : {}),
  };
  if (authed) {
    response.cookies.set(SESSION_MARKER_COOKIE, "1", {
      ...base,
      maxAge: 60 * 60 * 24 * 400,
    });
  } else {
    response.cookies.set(SESSION_MARKER_COOKIE, "", {
      ...base,
      maxAge: 0,
    });
  }
  return response;
}

function redirectWithCookies(
  url: URL,
  supabaseResponse: NextResponse,
  request: NextRequest,
  authed: boolean
): NextResponse {
  const redirect = NextResponse.redirect(url);
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie.name, cookie.value);
  });
  return applySessionMarker(redirect, request, authed);
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // /admin → /owner (roles rename); keep before auth so bookmarks still work
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/admin/, "/owner");
    return NextResponse.redirect(url, 308);
  }

  // E2E test mode: skip Supabase auth check
  if (
    process.env.E2E_TEST_MODE === "true" ||
    request.cookies.get("__e2e_test__")?.value === "true"
  ) {
    return NextResponse.next({
      request,
    });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublicKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginRedirect = unauthenticatedPageRedirect(pathname);
    if (loginRedirect) {
      const url = request.nextUrl.clone();
      url.pathname = loginRedirect;
      url.search = "";
      return redirectWithCookies(url, supabaseResponse, request, false);
    }
    return applySessionMarker(supabaseResponse, request, false);
  }

  // /auth/confirm handles hash errors + PKCE itself (including for signed-in users
  // who hit a stale confirmation link). Do not bounce them away first.
  if (
    pathname.startsWith("/auth") &&
    !pathname.startsWith("/auth/signout") &&
    pathname !== "/auth/confirm"
  ) {
    const targetPath = isTeachingPrototype() ? postLoginPath(user) : "/";
    const url = new URL(targetPath, request.url);
    return redirectWithCookies(url, supabaseResponse, request, true);
  }

  // Teaching: role dashboards are server-gated (client guards alone are not enough).
  if (isTeachingPrototype()) {
    const deniedPath = deniedTeachingRoleRedirect({
      isTeaching: true,
      pathname,
      isOwner: isOwner(user),
      isTeacher: isTeacher(user),
      isResearcher: isResearcher(user),
    });
    if (deniedPath) {
      const url = request.nextUrl.clone();
      url.pathname = deniedPath;
      url.search = "";
      return redirectWithCookies(url, supabaseResponse, request, true);
    }
  }

  return applySessionMarker(supabaseResponse, request, true);
}

import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET || "clinic-shift-scheduler-secret-key-development",
  });

  const { pathname } = req.nextUrl;

  const isAuthRoute = pathname.startsWith("/login");
  const isPublicRoute = isAuthRoute || pathname === "/";

  // If user is NOT logged in and trying to access a protected route
  if (!token && !isPublicRoute) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If user IS logged in and trying to access /login
  if (token && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // RBAC: Protecting manager routes (/manager/*)
  if (pathname.startsWith("/manager") && token?.role !== "manager") {
    const dashboardUrl = new URL("/dashboard", req.url);
    dashboardUrl.searchParams.set("error", "AccessDenied");
    return NextResponse.redirect(dashboardUrl);
  }

  // RBAC: Protecting staff routes (/staff/*)
  if (pathname.startsWith("/staff") && token?.role !== "staff") {
    const dashboardUrl = new URL("/dashboard", req.url);
    dashboardUrl.searchParams.set("error", "AccessDenied");
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/manager/:path*",
    "/staff/:path*",
    "/login",
  ],
};

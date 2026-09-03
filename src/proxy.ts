import NextAuth from "next-auth";
import { authConfig } from "@/infrastructure/auth/auth.config";
import { getProxyRedirectPath } from "@/lib/proxy-authorization";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const redirectPath = getProxyRedirectPath({
    session: req.auth,
    pathname: req.nextUrl.pathname,
  });

  if (redirectPath) {
    return NextResponse.redirect(new URL(redirectPath, req.url));
  }
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/api/assignments/:path*",
    "/api/registro",
    "/api/perfil",
    "/registro",
    "/perfil",
  ],
};

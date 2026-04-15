import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { PdepUser } from "@/types";

export default auth((req) => {
  const pdepUser = (req.auth as unknown as { pdepUser?: PdepUser } | null)
    ?.pdepUser;

  // No autenticado → login
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Alumno intentando acceder a rutas de admin → dashboard
  if (req.nextUrl.pathname.startsWith("/admin") && !pdepUser?.isAdmin) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
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

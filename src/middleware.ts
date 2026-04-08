export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/api/assignments/:path*",
    "/api/registro",
    "/registro",
  ],
};

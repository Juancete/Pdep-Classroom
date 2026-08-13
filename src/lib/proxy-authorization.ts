import type { PdepUser } from "@/types";

export function getProxyRedirectPath({
  session,
  pathname,
}: {
  session: unknown;
  pathname: string;
}): "/login" | "/dashboard" | null {
  const pdepUser = (session as { pdepUser?: PdepUser } | null)?.pdepUser;

  if (!session) return "/login";
  if (pathname.startsWith("/admin") && !pdepUser?.isAdmin) return "/dashboard";
  return null;
}

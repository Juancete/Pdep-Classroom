import type { SessionPdepUser } from "@/types";
import { rolDesdeNombre } from "@/domain/entities/RolDeUsuario";

export function getProxyRedirectPath({
  session,
  pathname,
}: {
  session: unknown;
  pathname: string;
}): "/login" | "/dashboard" | null {
  const pdepUser = (session as { pdepUser?: SessionPdepUser } | null)?.pdepUser;

  if (!session) return "/login";
  if (pathname.startsWith("/admin")) {
    const puedeAdministrar = pdepUser ? rolDesdeNombre(pdepUser.rolNombre).puedeAdministrar() : false;
    if (!puedeAdministrar) return "/dashboard";
  }
  return null;
}

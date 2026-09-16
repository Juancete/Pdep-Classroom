import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/infrastructure/auth/auth";
import type { PdepUser, SessionPdepUser } from "@/types";
import { resolverRol } from "@/domain/entities/RolDeUsuario";
import { esResponsableDeEntorno } from "@/lib/responsables-de-entorno";
import { hayAdministradorActivo } from "@/infrastructure/repositories";

// Se lanza cuando no se pudo verificar el rol del usuario (típicamente, la
// consulta a `Administrador` falló). A propósito no se atrapa acá ni en
// `getCurrentUser()`: el issue #83 pide rechazar la operación con un error
// controlado en vez de reutilizar un rol anterior, así que cada consumidor
// decide cómo mostrarlo (ver `guardAdmin`/`guardUser` en `api-auth.ts` para
// el canal HTTP; las páginas dejan que llegue al error boundary de Next).
export class PermisosNoVerificablesError extends Error {
  constructor(cause: unknown) {
    super("No se pudieron verificar tus permisos. Reintentá en unos segundos.");
    this.name = "PermisosNoVerificablesError";
    this.cause = cause;
  }
}

// `cache()` memoiza esto dentro de una misma request (React server
// components) — el nav, el banner de sincronización y la página que se está
// renderizando comparten una sola consulta a `Administrador` en vez de una
// por cada `getCurrentUser()`. No persiste nada entre requests: cada request
// nueva vuelve a resolver el rol desde cero, que es exactamente lo que pide
// el issue ("sin cachearlo entre solicitudes ni confiar en un rol guardado
// en el JWT").
const resolverUsuarioActual = cache(async (): Promise<PdepUser | null> => {
  const session = await auth();
  if (!session) return null;
  const raw = (session as unknown as { pdepUser?: SessionPdepUser }).pdepUser;
  if (!raw) return null;

  const esResponsable = esResponsableDeEntorno(raw.githubUsername);
  let esAdministradorActivo = false;
  if (!esResponsable) {
    try {
      esAdministradorActivo = await hayAdministradorActivo(raw.githubUsername);
    } catch (cause) {
      throw new PermisosNoVerificablesError(cause);
    }
  }

  return {
    githubUsername: raw.githubUsername,
    name: raw.name,
    image: raw.image,
    rol: resolverRol({ esResponsableDeEntorno: esResponsable, esAdministradorActivo }),
  };
});

export async function getCurrentUser(): Promise<PdepUser | null> {
  return resolverUsuarioActual();
}

export async function requireUser(): Promise<PdepUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<PdepUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.rol.puedeAdministrar()) redirect("/dashboard");
  return user;
}

// Responsables: los configurados por `ADMIN_GITHUB_USERNAMES`, los únicos que
// pueden gestionar el ABM de administradores (issue #83).
export async function requireResponsable(): Promise<PdepUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.rol.puedeGestionarAdministradores()) redirect("/dashboard");
  return user;
}

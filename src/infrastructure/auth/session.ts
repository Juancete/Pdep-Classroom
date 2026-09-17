import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/infrastructure/auth/auth";
import type { PdepUser, SessionPdepUser } from "@/types";
import { resolverRol } from "@/domain/entities/RolDeUsuario";
import { esResponsableDeEntorno } from "@/lib/responsables-de-entorno";
import { hayDocenteActivo } from "@/infrastructure/repositories";
import { PermisosNoVerificablesError } from "./PermisosNoVerificablesError";

// La clase vive en su propio módulo sin imports (ver el docblock ahí) para
// que `api-errors.ts` la pueda sumar a su tabla sin importar `session.ts`.
// Se re-exporta acá para que `api-auth.ts` y su test sigan importándola
// desde `@/infrastructure/auth/session` sin cambios.
export { PermisosNoVerificablesError } from "./PermisosNoVerificablesError";

// `cache()` memoiza esto dentro de una misma request (React server
// components) — el nav, el banner de sincronización y la página que se está
// renderizando comparten una sola consulta a `Docente` en vez de una
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
  let esDocenteActivo = false;
  if (!esResponsable) {
    try {
      esDocenteActivo = await hayDocenteActivo(raw.githubUsername);
    } catch (cause) {
      throw new PermisosNoVerificablesError(cause);
    }
  }

  return {
    githubUsername: raw.githubUsername,
    name: raw.name,
    image: raw.image,
    rol: resolverRol({ esResponsableDeEntorno: esResponsable, esDocenteActivo }),
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
// pueden gestionar el ABM de docentes (issue #83).
export async function requireResponsable(): Promise<PdepUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.rol.puedeGestionarDocentes()) redirect("/dashboard");
  return user;
}

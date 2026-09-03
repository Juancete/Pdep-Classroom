import { logger } from "@/lib/logger";
import { getComisionActiva } from "@/infrastructure/repositories";
import { verificarConsistenciaAlumno } from "@/application/verificarConsistenciaAlumno";

/**
 * Handler de `events.signIn` de NextAuth: corre server-side tras un OAuth
 * flow exitoso (no en revalidación de JWT). Lanza DB→Sheets fire-and-forget
 * para no bloquear el redirect post-OAuth.
 *
 * Vive en su propio módulo para que sea testeable sin necesidad de simular
 * el setup completo de NextAuth.
 *
 * Excepción documentada a la regla de capas: este módulo de infraestructura
 * invoca un caso de uso de `application/` como reacción al evento de login.
 */
export async function onSignIn(profile: unknown): Promise<void> {
  const githubUsername = (profile as { login?: unknown } | null | undefined)
    ?.login;
  if (typeof githubUsername !== "string" || !githubUsername) return;

  const comisionActiva = await getComisionActiva().catch((error) => {
    logger.error(
      { err: error, githubUsername },
      "getComisionActiva falló en events.signIn"
    );
    return null;
  });
  if (!comisionActiva) return;

  verificarConsistenciaAlumno(githubUsername, comisionActiva).catch((error) => {
    logger.error(
      { err: error, githubUsername },
      "verificarConsistenciaAlumno lanzó excepción inesperada tras login"
    );
  });
}

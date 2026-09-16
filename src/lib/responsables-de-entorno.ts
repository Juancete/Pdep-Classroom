import { normalizarGithubUsername } from "@/domain/entities/domain-constants";

// Se lee `process.env` en cada llamada (no una vez a nivel de módulo, como
// hacía `auth.config.ts` antes de #83): permite que los tests usen
// `vi.stubEnv` sin `vi.resetModules()`, y evita congelar un valor que en
// teoría podría cambiar entre deploys sin reiniciar el proceso.
//
// Único parser de `ADMIN_GITHUB_USERNAMES` del proyecto — antes había dos
// (`auth.config.ts` normalizaba con `.toLowerCase()`, `login/page.tsx` no),
// y `resolverRol` comparaba con `.toLowerCase()` a secas: un valor como
// `@juancete` en el entorno no matcheaba nunca y degradaba silenciosamente
// al responsable a alumno. Acá se normaliza con la misma función que usa
// todo el resto del dominio para usernames de GitHub.
export function responsablesDeEntorno(): string[] {
  return (process.env.ADMIN_GITHUB_USERNAMES ?? "")
    .split(",")
    .map((username) => normalizarGithubUsername(username))
    .filter(Boolean);
}

export function esResponsableDeEntorno(githubUsername: string): boolean {
  const normalizado = normalizarGithubUsername(githubUsername);
  return responsablesDeEntorno().includes(normalizado);
}

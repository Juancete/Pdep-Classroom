import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { authConfig as AuthConfigType } from "./auth.config";

// `authConfig` arma su lista de providers una sola vez al importar el
// módulo, leyendo NODE_ENV en ese momento — igual que login/page.tsx. Para
// probar los dos casos (development vs. cualquier otro valor) hay que
// resetear el registro de módulos y reimportar bajo cada valor de env.
async function importAuthConfig(): Promise<typeof AuthConfigType> {
  vi.resetModules();
  const mod = await import("./auth.config");
  return mod.authConfig;
}

// Auth.js resuelve el id efectivo recién al procesar un request real,
// mezclando `options` (lo que el código de la app pasó) sobre los defaults
// del factory del provider — ver `parseProviders` en @auth/core. Antes de
// ese merge, `provider.id` todavía es el default genérico ("credentials"),
// así que hay que mirar `provider.options.id` para el id real configurado.
function providerIds(authConfig: typeof AuthConfigType): string[] {
  return authConfig.providers.map((provider) => {
    const raw = provider as { id?: string; options?: { id?: string } };
    return raw.options?.id ?? raw.id ?? "";
  });
}

describe("authConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("siempre registra el provider de GitHub", async () => {
    const authConfig = await importAuthConfig();
    expect(providerIds(authConfig)).toContain("github");
  });

  it("no registra el login de desarrollo fuera de NODE_ENV=development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DEV_LOGIN", "true");
    const authConfig = await importAuthConfig();
    expect(providerIds(authConfig)).not.toContain("dev-login");
  });

  it("no registra el login de desarrollo si falta ENABLE_DEV_LOGIN, aunque NODE_ENV sea development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_LOGIN", "");
    const authConfig = await importAuthConfig();
    expect(providerIds(authConfig)).not.toContain("dev-login");
  });

  it("registra el login de desarrollo cuando NODE_ENV=development y ENABLE_DEV_LOGIN=true", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_LOGIN", "true");
    const authConfig = await importAuthConfig();
    expect(providerIds(authConfig)).toContain("dev-login");
  });

  describe("callback jwt", () => {
    function callJwt(authConfig: typeof AuthConfigType, args: any) {
      return (authConfig.callbacks!.jwt as any)(args);
    }

    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("ENABLE_DEV_LOGIN", "true");
    });

    it("toma el username del profile de GitHub cuando hay uno", async () => {
      const authConfig = await importAuthConfig();
      const token = await callJwt(authConfig, {
        token: {},
        profile: { login: "juangarcia" },
      });
      expect(token.githubUsername).toBe("juangarcia");
    });

    it("toma el username del user cuando el login vino del provider de desarrollo", async () => {
      const authConfig = await importAuthConfig();
      const token = await callJwt(authConfig, {
        token: {},
        account: { provider: "dev-login" },
        user: { id: "alumno-test" },
      });
      expect(token.githubUsername).toBe("alumno-test");
    });

    it("ignora el user si el provider no es dev-login (nunca confía en una cuenta ajena)", async () => {
      const authConfig = await importAuthConfig();
      const token = await callJwt(authConfig, {
        token: { githubUsername: "previo" },
        account: { provider: "otro-provider" },
        user: { id: "alguien" },
      });
      expect(token.githubUsername).toBe("previo");
    });

    it("preserva el token sin cambios si no hay profile ni cuenta de desarrollo", async () => {
      const authConfig = await importAuthConfig();
      const token = await callJwt(authConfig, { token: { githubUsername: "previo" } });
      expect(token.githubUsername).toBe("previo");
    });
  });

  describe("callback session", () => {
    function callSession(authConfig: typeof AuthConfigType, args: any) {
      return (authConfig.callbacks!.session as any)(args);
    }

    it("guarda rolNombre como string, no la instancia de RolDeUsuario", async () => {
      // Regresión: Auth.js clona el objeto de sesión internamente antes de
      // devolverlo desde auth(), y ese clon no preserva el prototype de una
      // instancia de clase — DOCENTE/ESTUDIANTE quedarían como `{}` sin
      // métodos del otro lado. Por eso acá sólo puede viajar un string.
      vi.stubEnv("ADMIN_GITHUB_USERNAMES", "");
      const authConfig = await importAuthConfig();
      const session = await callSession(authConfig, {
        session: { user: {} },
        token: { githubUsername: "ana" },
      });
      expect(session.pdepUser.rolNombre).toBe("alumno");
      expect(session.pdepUser).not.toHaveProperty("rol");
    });

    it("resuelve rolNombre='docente' para un username en ADMIN_GITHUB_USERNAMES", async () => {
      vi.stubEnv("ADMIN_GITHUB_USERNAMES", "juancete");
      const authConfig = await importAuthConfig();
      const session = await callSession(authConfig, {
        session: { user: {} },
        token: { githubUsername: "juancete" },
      });
      expect(session.pdepUser.rolNombre).toBe("docente");
    });

    it("resuelve rolNombre='alumno' para un username fuera de ADMIN_GITHUB_USERNAMES", async () => {
      vi.stubEnv("ADMIN_GITHUB_USERNAMES", "juancete");
      const authConfig = await importAuthConfig();
      const session = await callSession(authConfig, {
        session: { user: {} },
        token: { githubUsername: "ana" },
      });
      expect(session.pdepUser.rolNombre).toBe("alumno");
    });
  });
});

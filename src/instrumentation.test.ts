import { describe, it, expect, afterEach } from "vitest";
import { assertGoogleGroupsConfig, assertProductionConfig } from "./instrumentation";

// ── Tests ────────────────────────────────────────────────────
// Esta assertion corre al boot desde register() para frenar el server
// si la config es incoherente — antes de que un alumno reciba el error
// de misconfig como respuesta del registro.

describe("assertGoogleGroupsConfig", () => {
  const ENV_BACKUP = { ...process.env };

  afterEach(() => {
    process.env = { ...ENV_BACKUP };
  });

  it("no tira si ninguna env var está seteada (feature desactivada)", () => {
    delete process.env.GOOGLE_GROUP_EMAIL;
    delete process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL;
    expect(() => assertGoogleGroupsConfig()).not.toThrow();
  });

  it("no tira si ambas env vars están seteadas", () => {
    process.env.GOOGLE_GROUP_EMAIL = "pdep@googlegroups.com";
    process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL = "admin@utn.edu.ar";
    expect(() => assertGoogleGroupsConfig()).not.toThrow();
  });

  it("tira si GOOGLE_GROUP_EMAIL está seteada pero GOOGLE_WORKSPACE_ADMIN_EMAIL no", () => {
    process.env.GOOGLE_GROUP_EMAIL = "pdep@googlegroups.com";
    delete process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL;
    expect(() => assertGoogleGroupsConfig()).toThrow(/GOOGLE_WORKSPACE_ADMIN_EMAIL/);
  });

  it("no tira si GOOGLE_WORKSPACE_ADMIN_EMAIL está seteada pero GOOGLE_GROUP_EMAIL no (feature desactivada)", () => {
    delete process.env.GOOGLE_GROUP_EMAIL;
    process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL = "admin@utn.edu.ar";
    expect(() => assertGoogleGroupsConfig()).not.toThrow();
  });
});

describe("assertProductionConfig", () => {
  const ENV_BACKUP = { ...process.env };
  const required = [
    "DATABASE_URL",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "NEXTAUTH_SECRET",
    "ADMIN_GITHUB_USERNAMES",
    "GITHUB_APP_ID",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_APP_INSTALLATION_ID",
    "GITHUB_WEBHOOK_SECRET",
    "GOOGLE_SERVICE_ACCOUNT_KEY",
    "GOOGLE_GROUP_EMAIL",
    "GOOGLE_WORKSPACE_ADMIN_EMAIL",
  ];

  afterEach(() => {
    process.env = { ...ENV_BACKUP };
  });

  it("no exige credenciales fuera de Vercel production", () => {
    delete process.env.VERCEL_ENV;
    expect(() => assertProductionConfig()).not.toThrow();
  });

  it("informa todas las variables faltantes en producción", () => {
    process.env.VERCEL_ENV = "production";
    for (const name of required) delete process.env[name];

    expect(() => assertProductionConfig()).toThrow(/DATABASE_URL.*GITHUB_CLIENT_ID/);
  });

  it("acepta una configuración completa y rechaza el login de desarrollo", () => {
    process.env.VERCEL_ENV = "production";
    for (const name of required) process.env[name] = "configured";
    delete process.env.ENABLE_DEV_LOGIN;
    expect(() => assertProductionConfig()).not.toThrow();

    process.env.ENABLE_DEV_LOGIN = "true";
    expect(() => assertProductionConfig()).toThrow(/ENABLE_DEV_LOGIN/);
  });
});

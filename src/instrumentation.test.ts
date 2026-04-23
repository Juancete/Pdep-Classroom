import { describe, it, expect, afterEach } from "vitest";
import { assertGoogleGroupsConfig } from "./instrumentation";

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

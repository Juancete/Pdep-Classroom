import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockMembersInsert = vi.fn();
const mockJWT = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    auth: {
      JWT: function (...args: unknown[]) {
        return mockJWT(...args);
      },
    },
    admin: () => ({
      members: { insert: (...args: unknown[]) => mockMembersInsert(...args) },
    }),
  },
}));

import { agregarMiembroAGrupo, assertGoogleGroupsConfig } from "./googleGroups";

// ── Helpers ──────────────────────────────────────────────────

// Service account JSON mínimo, base64. El contenido no importa más allá
// de poder parsearlo como JSON válido.
const FAKE_SA_KEY = Buffer.from(
  JSON.stringify({
    client_email: "sa@proyecto.iam.gserviceaccount.com",
    private_key: "FAKE_PRIVATE_KEY",
  })
).toString("base64");

// Emula un error tipo `GaxiosError` de la Admin SDK.
function gaxiosError(code: number, reason: string, message = "boom") {
  return Object.assign(new Error(message), {
    code,
    errors: [{ reason, message }],
  });
}

// ── Tests ────────────────────────────────────────────────────

describe("agregarMiembroAGrupo", () => {
  const ENV_BACKUP = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_GROUP_EMAIL = "pdep@googlegroups.com";
    process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL = "admin@utn.edu.ar";
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = FAKE_SA_KEY;
    mockMembersInsert.mockResolvedValue({ data: {} });
    mockJWT.mockReturnValue({});
  });

  afterEach(() => {
    process.env = { ...ENV_BACKUP };
  });

  it("retorna 'skipped' cuando GOOGLE_GROUP_EMAIL no está configurada", async () => {
    delete process.env.GOOGLE_GROUP_EMAIL;
    const result = await agregarMiembroAGrupo("juan@gmail.com");
    expect(result).toEqual({ status: "skipped" });
    expect(mockMembersInsert).not.toHaveBeenCalled();
  });

  it("retorna 'skipped' cuando GOOGLE_GROUP_EMAIL está vacío", async () => {
    process.env.GOOGLE_GROUP_EMAIL = "   ";
    const result = await agregarMiembroAGrupo("juan@gmail.com");
    expect(result).toEqual({ status: "skipped" });
    expect(mockMembersInsert).not.toHaveBeenCalled();
  });

  it("agrega el miembro al grupo con role MEMBER (happy path)", async () => {
    const result = await agregarMiembroAGrupo("juan@gmail.com");
    expect(result).toEqual({ status: "added" });
    expect(mockMembersInsert).toHaveBeenCalledWith({
      groupKey: "pdep@googlegroups.com",
      requestBody: { email: "juan@gmail.com", role: "MEMBER" },
    });
  });

  it("impersona al admin del workspace (domain-wide delegation)", async () => {
    await agregarMiembroAGrupo("juan@gmail.com");
    expect(mockJWT).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "sa@proyecto.iam.gserviceaccount.com",
        subject: "admin@utn.edu.ar",
        scopes: ["https://www.googleapis.com/auth/admin.directory.group.member"],
      })
    );
  });

  it("retorna 'already_member' cuando la API devuelve 409 en err.code", async () => {
    mockMembersInsert.mockRejectedValue(gaxiosError(409, "duplicate"));
    const result = await agregarMiembroAGrupo("juan@gmail.com");
    expect(result).toEqual({ status: "already_member" });
  });

  it("retorna 'already_member' cuando la API devuelve 409 en err.status", async () => {
    // googleapis a veces expone el status por err.status en vez de err.code
    const err = Object.assign(new Error("Conflict"), { status: 409 });
    mockMembersInsert.mockRejectedValue(err);
    const result = await agregarMiembroAGrupo("juan@gmail.com");
    expect(result).toEqual({ status: "already_member" });
  });

  it("retorna 'already_member' cuando el reason 'duplicate' viene top-level en err.errors", async () => {
    mockMembersInsert.mockRejectedValue(gaxiosError(400, "duplicate"));
    const result = await agregarMiembroAGrupo("juan@gmail.com");
    expect(result).toEqual({ status: "already_member" });
  });

  it("retorna 'already_member' cuando el reason 'duplicate' viene anidado en response.data.error.errors", async () => {
    const err = Object.assign(new Error("Member already exists"), {
      code: 400,
      response: {
        data: {
          error: {
            errors: [{ reason: "duplicate", message: "Member already exists" }],
          },
        },
      },
    });
    mockMembersInsert.mockRejectedValue(err);
    const result = await agregarMiembroAGrupo("juan@gmail.com");
    expect(result).toEqual({ status: "already_member" });
  });

  it("retorna 'error' con mensaje cuando la API falla con otro código", async () => {
    mockMembersInsert.mockRejectedValue(gaxiosError(403, "forbidden", "Sin permisos"));
    const result = await agregarMiembroAGrupo("juan@gmail.com");
    expect(result).toEqual({ status: "error", error: "Sin permisos" });
  });

});

// ── assertGoogleGroupsConfig ─────────────────────────────────
// Esta función corre al boot desde instrumentation.ts — acá testeamos
// que tire cuando la config es incoherente, para que el deploy falle
// antes de que un alumno reciba un error en su cara.

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
    expect(() => assertGoogleGroupsConfig()).toThrow(
      /GOOGLE_WORKSPACE_ADMIN_EMAIL/
    );
  });

  it("no tira si GOOGLE_WORKSPACE_ADMIN_EMAIL está seteada pero GOOGLE_GROUP_EMAIL no (feature desactivada)", () => {
    delete process.env.GOOGLE_GROUP_EMAIL;
    process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL = "admin@utn.edu.ar";
    expect(() => assertGoogleGroupsConfig()).not.toThrow();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockMembersInsert = vi.fn();
const mockJWT = vi.fn();

const mockMembersDelete = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    auth: {
      JWT: function (...args: unknown[]) {
        return mockJWT(...args);
      },
    },
    admin: () => ({
      members: {
        insert: (...args: unknown[]) => mockMembersInsert(...args),
        delete: (...args: unknown[]) => mockMembersDelete(...args),
      },
    }),
  },
}));

import {
  agregarMiembroAGrupo,
  isGoogleGroupsConfigured,
  quitarMiembroDeGrupo,
} from "./googleGroups";

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
    mockMembersDelete.mockResolvedValue({ data: {} });
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

  it("considera habilitada la integración solo con grupo y admin configurados", () => {
    expect(isGoogleGroupsConfigured()).toBe(true);
    delete process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL;
    expect(isGoogleGroupsConfigured()).toBe(false);
  });

  it("considera desactivada la integración sin service account key", () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    expect(isGoogleGroupsConfigured()).toBe(false);
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
    expect(mockMembersInsert).toHaveBeenCalledWith(
      {
        groupKey: "pdep@googlegroups.com",
        requestBody: { email: "juan@gmail.com", role: "MEMBER" },
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("pasa un AbortSignal con timeout para que la llamada no se cuelgue", async () => {
    await agregarMiembroAGrupo("juan@gmail.com");
    const opts = mockMembersInsert.mock.calls[0][1];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
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

describe("quitarMiembroDeGrupo", () => {
  const ENV_BACKUP = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_GROUP_EMAIL = "pdep@googlegroups.com";
    process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL = "admin@utn.edu.ar";
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = FAKE_SA_KEY;
    mockMembersDelete.mockResolvedValue({ data: {} });
    mockJWT.mockReturnValue({});
  });

  afterEach(() => {
    process.env = { ...ENV_BACKUP };
  });

  it("retorna 'skipped' cuando GOOGLE_GROUP_EMAIL no está configurada", async () => {
    delete process.env.GOOGLE_GROUP_EMAIL;
    const result = await quitarMiembroDeGrupo("juan@gmail.com");
    expect(result).toEqual({ status: "skipped" });
    expect(mockMembersDelete).not.toHaveBeenCalled();
  });

  it("elimina el miembro del grupo (happy path)", async () => {
    const result = await quitarMiembroDeGrupo("juan@gmail.com");
    expect(result).toEqual({ status: "removed" });
    expect(mockMembersDelete).toHaveBeenCalledWith(
      { groupKey: "pdep@googlegroups.com", memberKey: "juan@gmail.com" },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("retorna 'not_member' cuando la API devuelve 404 en err.code", async () => {
    mockMembersDelete.mockRejectedValue(gaxiosError(404, "notFound"));
    const result = await quitarMiembroDeGrupo("juan@gmail.com");
    expect(result).toEqual({ status: "not_member" });
  });

  it("retorna 'not_member' cuando la API devuelve 404 en err.status", async () => {
    const err = Object.assign(new Error("Not Found"), { status: 404 });
    mockMembersDelete.mockRejectedValue(err);
    const result = await quitarMiembroDeGrupo("juan@gmail.com");
    expect(result).toEqual({ status: "not_member" });
  });

  it("retorna 'not_member' cuando reason 'resourceNotFound' viene en err.errors", async () => {
    mockMembersDelete.mockRejectedValue(gaxiosError(400, "resourceNotFound"));
    const result = await quitarMiembroDeGrupo("juan@gmail.com");
    expect(result).toEqual({ status: "not_member" });
  });

  it("retorna 'error' con mensaje cuando la API falla con otro código", async () => {
    mockMembersDelete.mockRejectedValue(gaxiosError(403, "forbidden", "Sin permisos"));
    const result = await quitarMiembroDeGrupo("juan@gmail.com");
    expect(result).toEqual({ status: "error", error: "Sin permisos" });
  });

  it("retorna 'error' cuando el 404 indica que el grupo no existe (groupKey en el mensaje)", async () => {
    mockMembersDelete.mockRejectedValue(gaxiosError(404, "notFound", "Resource Not Found: groupKey"));
    const result = await quitarMiembroDeGrupo("juan@gmail.com");
    expect(result.status).toBe("error");
  });

  it("retorna 'not_member' cuando el 404 indica que el miembro no estaba (memberKey en el mensaje)", async () => {
    const err = gaxiosError(404, "notFound", "Resource Not Found: memberKey");
    mockMembersDelete.mockRejectedValue(err);
    const result = await quitarMiembroDeGrupo("juan@gmail.com");
    expect(result).toEqual({ status: "not_member" });
  });

  it("retorna 'not_member' cuando el 404 no incluye marcador de groupKey ni memberKey (comportamiento defensivo)", async () => {
    const err = Object.assign(new Error("Not Found"), { status: 404 });
    mockMembersDelete.mockRejectedValue(err);
    const result = await quitarMiembroDeGrupo("juan@gmail.com");
    expect(result).toEqual({ status: "not_member" });
  });
});

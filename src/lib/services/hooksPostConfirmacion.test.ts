import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockAgregarMiembroAGrupo = vi.fn();
const mockQuitarMiembroDeGrupo = vi.fn();
const mockIntentarSincronizarGrupos = vi.fn();

vi.mock("@/lib/googleGroups", () => ({
  agregarMiembroAGrupo: (...args: unknown[]) => mockAgregarMiembroAGrupo(...args),
  quitarMiembroDeGrupo: (...args: unknown[]) => mockQuitarMiembroDeGrupo(...args),
}));

vi.mock("./intentarSincronizarGrupos", () => ({
  intentarSincronizarGrupos: (...args: unknown[]) =>
    mockIntentarSincronizarGrupos(...args),
}));

import {
  hookGoogleGroups,
  hookGruposSync,
  ejecutarHooksPostConfirmacion,
  HOOKS_CONFIRMACION_ALUMNO,
  HOOKS_IMPORTACION_ALUMNO,
  type ContextoAlumno,
} from "./hooksPostConfirmacion";

// ── Helpers ──────────────────────────────────────────────────

function makeCtx(overrides: Partial<ContextoAlumno> = {}): ContextoAlumno {
  return {
    githubUsername: "juangarcia",
    email: "juan@gmail.com",
    comision: { id: "c1" } as never,
    ...overrides,
  };
}

// ── hookGoogleGroups ─────────────────────────────────────────

describe("hookGoogleGroups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgregarMiembroAGrupo.mockResolvedValue({ status: "added" });
    mockQuitarMiembroDeGrupo.mockResolvedValue({ status: "removed" });
  });

  it("devuelve el status de la suscripción del email actual", async () => {
    const resultado = await hookGoogleGroups(makeCtx());
    expect(resultado).toEqual({ groupSubscription: "added" });
  });

  it("pasa el email del contexto a agregarMiembroAGrupo", async () => {
    await hookGoogleGroups(makeCtx({ email: "nueva@utn.edu.ar" }));
    expect(mockAgregarMiembroAGrupo).toHaveBeenCalledWith("nueva@utn.edu.ar");
  });

  it("loguea (con email enmascarado) cuando la suscripción falla", async () => {
    const { logger } = await import("@/lib/logger");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    mockAgregarMiembroAGrupo.mockResolvedValue({ status: "error", error: "Sin permisos" });

    await hookGoogleGroups(makeCtx({ email: "juan@gmail.com" }));

    const loggedPayload = JSON.stringify(errorSpy.mock.calls);
    expect(loggedPayload).not.toContain("juan@gmail.com");
    expect(loggedPayload).toContain("@gmail.com");
    expect(loggedPayload).toContain("juangarcia");
    errorSpy.mockRestore();
  });

  it("devuelve groupSubscription:'error' cuando la suscripción falla (sin throwear)", async () => {
    mockAgregarMiembroAGrupo.mockResolvedValue({ status: "error", error: "boom" });
    const resultado = await hookGoogleGroups(makeCtx());
    expect(resultado).toEqual({ groupSubscription: "error" });
  });

  it("no intenta quitar el email previo cuando no hay emailPrevio", async () => {
    await hookGoogleGroups(makeCtx({ emailPrevio: undefined }));
    expect(mockQuitarMiembroDeGrupo).not.toHaveBeenCalled();
  });

  it("no intenta quitar el email previo cuando el email no cambió", async () => {
    await hookGoogleGroups(makeCtx({ email: "juan@gmail.com", emailPrevio: "juan@gmail.com" }));
    expect(mockQuitarMiembroDeGrupo).not.toHaveBeenCalled();
  });

  it("no intenta quitar el email previo cuando la normalización coincide (case, espacios)", async () => {
    await hookGoogleGroups(makeCtx({ email: "juan@gmail.com", emailPrevio: "  JUAN@GMAIL.COM  " }));
    expect(mockQuitarMiembroDeGrupo).not.toHaveBeenCalled();
  });

  it("quita el email previo cuando el email cambió", async () => {
    await hookGoogleGroups(
      makeCtx({ email: "nuevo@utn.edu.ar", emailPrevio: "viejo@gmail.com" })
    );
    expect(mockQuitarMiembroDeGrupo).toHaveBeenCalledWith("viejo@gmail.com");
  });

  it("quita el email previo cuando el email actual ya estaba suscripto", async () => {
    mockAgregarMiembroAGrupo.mockResolvedValue({ status: "already_member" });
    await hookGoogleGroups(
      makeCtx({ email: "nuevo@utn.edu.ar", emailPrevio: "viejo@gmail.com" })
    );
    expect(mockQuitarMiembroDeGrupo).toHaveBeenCalledWith("viejo@gmail.com");
  });

  it("no quita el email previo si falló la suscripción del email actual", async () => {
    mockAgregarMiembroAGrupo.mockResolvedValue({ status: "error", error: "boom" });
    await hookGoogleGroups(
      makeCtx({ email: "nuevo@utn.edu.ar", emailPrevio: "viejo@gmail.com" })
    );
    expect(mockQuitarMiembroDeGrupo).not.toHaveBeenCalled();
  });

  it("no quita el email previo si la suscripción del email actual fue skipeada", async () => {
    mockAgregarMiembroAGrupo.mockResolvedValue({ status: "skipped" });
    await hookGoogleGroups(
      makeCtx({ email: "nuevo@utn.edu.ar", emailPrevio: "viejo@gmail.com" })
    );
    expect(mockQuitarMiembroDeGrupo).not.toHaveBeenCalled();
  });

  it("no degrada groupSubscription cuando la baja del email previo falla", async () => {
    mockQuitarMiembroDeGrupo.mockResolvedValue({ status: "error", error: "boom" });
    const resultado = await hookGoogleGroups(
      makeCtx({ email: "nuevo@utn.edu.ar", emailPrevio: "viejo@gmail.com" })
    );
    expect(resultado).toEqual({ groupSubscription: "added" });
  });

  it("loguea (con email enmascarado) cuando la baja del email previo falla", async () => {
    const { logger } = await import("@/lib/logger");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    mockQuitarMiembroDeGrupo.mockResolvedValue({ status: "error", error: "boom" });

    await hookGoogleGroups(
      makeCtx({ email: "nuevo@utn.edu.ar", emailPrevio: "viejo@gmail.com" })
    );

    const loggedPayload = JSON.stringify(errorSpy.mock.calls);
    expect(loggedPayload).not.toContain("viejo@gmail.com");
    expect(loggedPayload).toContain("@gmail.com");
    errorSpy.mockRestore();
  });
});

// ── hookGruposSync ───────────────────────────────────────────

describe("hookGruposSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIntentarSincronizarGrupos.mockResolvedValue(undefined);
  });

  it("devuelve gruposSync:'ok' cuando el wrapper resuelve sin error", async () => {
    const resultado = await hookGruposSync(makeCtx());
    expect(resultado).toEqual({ gruposSync: "ok" });
  });

  it("devuelve gruposSync:'error' (sin throwear) cuando el wrapper lanza", async () => {
    mockIntentarSincronizarGrupos.mockRejectedValue(new Error("Sheets caído"));
    const resultado = await hookGruposSync(makeCtx());
    expect(resultado).toEqual({ gruposSync: "error" });
  });

  it("pasa githubUsername y comision a intentarSincronizarGrupos", async () => {
    const comision = { id: "c2" } as never;
    await hookGruposSync(makeCtx({ githubUsername: "anagarcia", comision }));
    expect(mockIntentarSincronizarGrupos).toHaveBeenCalledWith("anagarcia", comision);
  });
});

// ── ejecutarHooksPostConfirmacion ────────────────────────────

describe("ejecutarHooksPostConfirmacion", () => {
  it("devuelve resultado vacío cuando la lista de hooks está vacía", async () => {
    const resultado = await ejecutarHooksPostConfirmacion(makeCtx(), []);
    expect(resultado).toEqual({});
  });

  it("mergea los slices de resultado de múltiples hooks", async () => {
    mockAgregarMiembroAGrupo.mockResolvedValue({ status: "added" });
    mockIntentarSincronizarGrupos.mockResolvedValue(undefined);

    const resultado = await ejecutarHooksPostConfirmacion(makeCtx(), [
      hookGoogleGroups,
      hookGruposSync,
    ]);

    expect(resultado).toEqual({ groupSubscription: "added", gruposSync: "ok" });
  });

  it("el slice de un hook posterior pisa el anterior si comparten clave", async () => {
    const hookA = vi.fn().mockResolvedValue({ groupSubscription: "added" });
    const hookB = vi.fn().mockResolvedValue({ groupSubscription: "already_member" });

    const resultado = await ejecutarHooksPostConfirmacion(makeCtx(), [hookA, hookB]);

    expect(resultado).toEqual({ groupSubscription: "already_member" });
  });
});

// ── Políticas por origen ─────────────────────────────────────

describe("HOOKS_CONFIRMACION_ALUMNO (registro y perfil)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgregarMiembroAGrupo.mockResolvedValue({ status: "added" });
    mockIntentarSincronizarGrupos.mockResolvedValue(undefined);
  });

  it("corre Google Groups y sync de grupos", async () => {
    await ejecutarHooksPostConfirmacion(makeCtx(), HOOKS_CONFIRMACION_ALUMNO);
    expect(mockAgregarMiembroAGrupo).toHaveBeenCalledOnce();
    expect(mockIntentarSincronizarGrupos).toHaveBeenCalledOnce();
  });
});

describe("HOOKS_IMPORTACION_ALUMNO (importación admin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgregarMiembroAGrupo.mockResolvedValue({ status: "added" });
  });

  it("corre Google Groups", async () => {
    await ejecutarHooksPostConfirmacion(makeCtx(), HOOKS_IMPORTACION_ALUMNO);
    expect(mockAgregarMiembroAGrupo).toHaveBeenCalledOnce();
  });

  // La sync de grupos NO se hace inline en la importación: queda en la action
  // dedicada `sincronizarGruposDeLaComision` (lectura única de la hoja, UI propia).
  it("NO corre sync de grupos (queda delegado a sincronizarGruposDeLaComision)", async () => {
    await ejecutarHooksPostConfirmacion(makeCtx(), HOOKS_IMPORTACION_ALUMNO);
    expect(mockIntentarSincronizarGrupos).not.toHaveBeenCalled();
  });
});

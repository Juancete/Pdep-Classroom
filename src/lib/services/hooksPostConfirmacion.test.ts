import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIntentarSincronizarGoogleGroup = vi.fn();
const mockIntentarSincronizarGrupos = vi.fn();

vi.mock("./intentarSincronizarGoogleGroup", () => ({
  intentarSincronizarGoogleGroup: (...args: unknown[]) =>
    mockIntentarSincronizarGoogleGroup(...args),
}));

vi.mock("./intentarSincronizarGrupos", () => ({
  intentarSincronizarGrupos: (...args: unknown[]) =>
    mockIntentarSincronizarGrupos(...args),
}));

import {
  ejecutarHooksPostConfirmacion,
  hookGoogleGroups,
  hookGruposSync,
  HOOKS_CONFIRMACION_ALUMNO,
  HOOKS_IMPORTACION_ALUMNO,
  type ContextoAlumno,
} from "./hooksPostConfirmacion";

function makeCtx(overrides: Partial<ContextoAlumno> = {}): ContextoAlumno {
  return {
    githubUsername: "juangarcia",
    email: "juan@gmail.com",
    comision: { id: "c1" } as never,
    ...overrides,
  };
}

describe("hookGoogleGroups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIntentarSincronizarGoogleGroup.mockResolvedValue({ status: "added" });
  });

  it("delega por githubUsername y devuelve el status", async () => {
    const resultado = await hookGoogleGroups(
      makeCtx({ githubUsername: "anagarcia" })
    );

    expect(mockIntentarSincronizarGoogleGroup).toHaveBeenCalledWith(
      "anagarcia"
    );
    expect(resultado).toEqual({ groupSubscription: "added" });
  });

  it("propaga un resultado degradado sin lanzar", async () => {
    mockIntentarSincronizarGoogleGroup.mockResolvedValue({
      status: "error",
      error: "boom",
    });

    await expect(hookGoogleGroups(makeCtx())).resolves.toEqual({
      groupSubscription: "error",
    });
  });
});

describe("hookGruposSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIntentarSincronizarGrupos.mockResolvedValue(undefined);
  });

  it("devuelve ok y pasa alumno y comisión", async () => {
    const ctx = makeCtx({ githubUsername: "anagarcia" });
    const resultado = await hookGruposSync(ctx);

    expect(mockIntentarSincronizarGrupos).toHaveBeenCalledWith(
      "anagarcia",
      ctx.comision
    );
    expect(resultado).toEqual({ gruposSync: "ok" });
  });

  it("degrada el error sin lanzarlo", async () => {
    mockIntentarSincronizarGrupos.mockRejectedValue(new Error("Sheets caído"));
    await expect(hookGruposSync(makeCtx())).resolves.toEqual({
      gruposSync: "error",
    });
  });
});

describe("ejecutarHooksPostConfirmacion", () => {
  it("devuelve vacío sin hooks", async () => {
    await expect(ejecutarHooksPostConfirmacion(makeCtx(), [])).resolves.toEqual(
      {}
    );
  });

  it("mergea resultados en orden", async () => {
    const hookA = vi.fn().mockResolvedValue({ groupSubscription: "added" });
    const hookB = vi.fn().mockResolvedValue({
      groupSubscription: "already_member",
      gruposSync: "ok",
    });

    await expect(
      ejecutarHooksPostConfirmacion(makeCtx(), [hookA, hookB])
    ).resolves.toEqual({
      groupSubscription: "already_member",
      gruposSync: "ok",
    });
  });
});

describe("políticas por origen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIntentarSincronizarGoogleGroup.mockResolvedValue({ status: "added" });
    mockIntentarSincronizarGrupos.mockResolvedValue(undefined);
  });

  it("registro y perfil ejecutan Google Groups y grupos de TP", async () => {
    await ejecutarHooksPostConfirmacion(
      makeCtx(),
      HOOKS_CONFIRMACION_ALUMNO
    );
    expect(mockIntentarSincronizarGoogleGroup).toHaveBeenCalledOnce();
    expect(mockIntentarSincronizarGrupos).toHaveBeenCalledOnce();
  });

  it("la importación ejecuta solo Google Groups", async () => {
    await ejecutarHooksPostConfirmacion(
      makeCtx(),
      HOOKS_IMPORTACION_ALUMNO
    );
    expect(mockIntentarSincronizarGoogleGroup).toHaveBeenCalledOnce();
    expect(mockIntentarSincronizarGrupos).not.toHaveBeenCalled();
  });
});

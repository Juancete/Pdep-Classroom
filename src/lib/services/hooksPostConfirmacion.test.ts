import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCanalesActivos = vi.fn();
const mockIntentarSincronizarGrupos = vi.fn();

vi.mock("@/lib/canales", () => ({
  canalesActivos: (...args: unknown[]) => mockCanalesActivos(...args),
}));

vi.mock("./intentarSincronizarGrupos", () => ({
  intentarSincronizarGrupos: (...args: unknown[]) =>
    mockIntentarSincronizarGrupos(...args),
}));

import {
  ejecutarHooksPostConfirmacion,
  hookCanalesDeComunicacion,
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

function makeCanalFalso(overrides: {
  asunto?: string;
  sincronizar?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    asuntoPendiente: () => overrides.asunto ?? "hacer algo",
    sincronizar: overrides.sincronizar ?? vi.fn().mockResolvedValue({ estado: "sincronizada" }),
  };
}

describe("hookCanalesDeComunicacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recorre los canales activos y no llama a los inactivos (canalesActivos ya los filtró)", async () => {
    const canalActivo = makeCanalFalso();
    mockCanalesActivos.mockReturnValue([canalActivo]);

    const resultado = await hookCanalesDeComunicacion(
      makeCtx({ githubUsername: "anagarcia" })
    );

    expect(canalActivo.sincronizar).toHaveBeenCalledWith("anagarcia");
    expect(resultado).toEqual({ canalesConError: [] });
  });

  it("acumula el asunto de cada canal que falla, sin frenar a los demás", async () => {
    const canalOk = makeCanalFalso({ asunto: "hacer A" });
    const canalRoto = makeCanalFalso({
      asunto: "hacer B",
      sincronizar: vi.fn().mockResolvedValue({ estado: "error", error: "boom" }),
    });
    mockCanalesActivos.mockReturnValue([canalOk, canalRoto]);

    const resultado = await hookCanalesDeComunicacion(makeCtx());

    expect(canalOk.sincronizar).toHaveBeenCalled();
    expect(canalRoto.sincronizar).toHaveBeenCalled();
    expect(resultado).toEqual({ canalesConError: ["hacer B"] });
  });

  it("sin canales activos no llama a nada y devuelve la lista vacía", async () => {
    mockCanalesActivos.mockReturnValue([]);
    await expect(hookCanalesDeComunicacion(makeCtx())).resolves.toEqual({
      canalesConError: [],
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
    const hookA = vi.fn().mockResolvedValue({ canalesConError: [] });
    const hookB = vi.fn().mockResolvedValue({
      canalesConError: ["hacer algo"],
      gruposSync: "ok",
    });

    await expect(
      ejecutarHooksPostConfirmacion(makeCtx(), [hookA, hookB])
    ).resolves.toEqual({
      canalesConError: ["hacer algo"],
      gruposSync: "ok",
    });
  });
});

describe("políticas por origen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanalesActivos.mockReturnValue([makeCanalFalso()]);
    mockIntentarSincronizarGrupos.mockResolvedValue(undefined);
  });

  it("registro y perfil ejecutan los canales de comunicación y grupos de TP", async () => {
    await ejecutarHooksPostConfirmacion(makeCtx(), HOOKS_CONFIRMACION_ALUMNO);
    expect(mockCanalesActivos).toHaveBeenCalledOnce();
    expect(mockIntentarSincronizarGrupos).toHaveBeenCalledOnce();
  });

  it("la importación ejecuta solo los canales de comunicación", async () => {
    await ejecutarHooksPostConfirmacion(makeCtx(), HOOKS_IMPORTACION_ALUMNO);
    expect(mockCanalesActivos).toHaveBeenCalledOnce();
    expect(mockIntentarSincronizarGrupos).not.toHaveBeenCalled();
  });
});

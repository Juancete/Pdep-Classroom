import { describe, it, expect, vi, beforeEach } from "vitest";
import { Comision } from "@/domain/entities";

const mockLeerComisionConsultadaId = vi.fn();
const mockGetComisiones = vi.fn();

vi.mock("@/infrastructure/navegacion/comisionConsultadaCookie", () => ({
  leerComisionConsultadaId: () => mockLeerComisionConsultadaId(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  getComisiones: () => mockGetComisiones(),
}));

// `obtenerContextoDeComision` memoiza con `cache()` de React dentro de una
// misma request — como acá cada test llama directo a la función (fuera de
// un render de React), no hace falta resetear módulos entre tests: cada
// invocación vuelve a ejecutar el cuerpo (misma nota que
// `src/infrastructure/auth/session.test.ts`).
import { obtenerContextoDeComision } from "./comisionConsultada";

function comisionCon(id: string, anio: number, activa: boolean): Comision {
  const comision = new Comision(anio, "sheet-test");
  comision.id = id;
  comision.activa = activa;
  return comision;
}

describe("obtenerContextoDeComision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sin cookie devuelve el contexto de la comisión activa", async () => {
    const comisionActiva = comisionCon("c-2026", 2026, true);
    mockLeerComisionConsultadaId.mockResolvedValue(undefined);
    mockGetComisiones.mockResolvedValue([comisionActiva]);

    const { contexto, comisiones } = await obtenerContextoDeComision();

    expect(contexto.comisionConsultada()).toBe(comisionActiva);
    expect(contexto.esHistorica()).toBe(false);
    expect(comisiones).toEqual([comisionActiva]);
  });

  it("con cookie de una comisión histórica devuelve el contexto histórico", async () => {
    const comisionActiva = comisionCon("c-2026", 2026, true);
    const comisionHistorica = comisionCon("c-2025", 2025, false);
    mockLeerComisionConsultadaId.mockResolvedValue("c-2025");
    mockGetComisiones.mockResolvedValue([comisionActiva, comisionHistorica]);

    const { contexto } = await obtenerContextoDeComision();

    expect(contexto.esHistorica()).toBe(true);
    expect(contexto.comisionConsultada()).toBe(comisionHistorica);
    expect(contexto.comisionActiva()).toBe(comisionActiva);
  });

  it("con cookie de una comisión eliminada cae a la activa", async () => {
    const comisionActiva = comisionCon("c-2026", 2026, true);
    mockLeerComisionConsultadaId.mockResolvedValue("id-borrado");
    mockGetComisiones.mockResolvedValue([comisionActiva]);

    const { contexto } = await obtenerContextoDeComision();

    expect(contexto.comisionConsultada()).toBe(comisionActiva);
  });

  it("sin comisiones en el sistema devuelve ContextoSinComision", async () => {
    mockLeerComisionConsultadaId.mockResolvedValue(undefined);
    mockGetComisiones.mockResolvedValue([]);

    const { contexto, comisiones } = await obtenerContextoDeComision();

    expect(contexto.comisionConsultada()).toBeNull();
    expect(comisiones).toEqual([]);
  });
});

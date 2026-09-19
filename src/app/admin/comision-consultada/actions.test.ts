import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetComision = vi.fn();
const mockGuardarComisionConsultadaId = vi.fn();
const mockBorrarComisionConsultadaId = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("@/infrastructure/auth/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  getComision: (id: string) => mockGetComision(id),
  // `cambiarComisionConsultada` nunca debe llamar a estas — sólo lee, no
  // toca `Comision.activa`. Si algún día alguien las importa acá, un test
  // más abajo lo detecta.
  updateComision: vi.fn(),
  createComision: vi.fn(),
}));

vi.mock("@/infrastructure/navegacion/comisionConsultadaCookie", () => ({
  guardarComisionConsultadaId: (id: string) => mockGuardarComisionConsultadaId(id),
  borrarComisionConsultadaId: () => mockBorrarComisionConsultadaId(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string, tipo?: string) => mockRevalidatePath(path, tipo),
}));

import { cambiarComisionConsultada } from "./actions";
import { updateComision, createComision } from "@/infrastructure/repositories";

function comisionCon(id: string, activa: boolean) {
  return { id, activa };
}

function formDataCon(comisionId?: string): FormData {
  const formData = new FormData();
  if (comisionId !== undefined) formData.append("comisionId", comisionId);
  return formData;
}

describe("cambiarComisionConsultada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
  });

  it("siempre llama a requireAdmin", async () => {
    mockGetComision.mockResolvedValue(comisionCon("c1", false));
    await cambiarComisionConsultada(formDataCon("c1"));
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("guarda la cookie cuando la comisión elegida existe y no es la activa", async () => {
    mockGetComision.mockResolvedValue(comisionCon("c-2025", false));

    await cambiarComisionConsultada(formDataCon("c-2025"));

    expect(mockGuardarComisionConsultadaId).toHaveBeenCalledWith("c-2025");
    expect(mockBorrarComisionConsultadaId).not.toHaveBeenCalled();
  });

  it("borra la cookie cuando la comisión elegida es la activa (el default ya la sigue)", async () => {
    mockGetComision.mockResolvedValue(comisionCon("c-2026", true));

    await cambiarComisionConsultada(formDataCon("c-2026"));

    expect(mockBorrarComisionConsultadaId).toHaveBeenCalledOnce();
    expect(mockGuardarComisionConsultadaId).not.toHaveBeenCalled();
  });

  it("borra la cookie cuando la comisión elegida no existe", async () => {
    mockGetComision.mockResolvedValue(null);

    await cambiarComisionConsultada(formDataCon("id-inexistente"));

    expect(mockBorrarComisionConsultadaId).toHaveBeenCalledOnce();
    expect(mockGuardarComisionConsultadaId).not.toHaveBeenCalled();
  });

  it("borra la cookie cuando no viene comisionId (volver a la activa)", async () => {
    await cambiarComisionConsultada(formDataCon());

    expect(mockBorrarComisionConsultadaId).toHaveBeenCalledOnce();
    expect(mockGetComision).not.toHaveBeenCalled();
  });

  it("borra la cookie cuando comisionId es un string vacío o sólo espacios", async () => {
    await cambiarComisionConsultada(formDataCon("   "));

    expect(mockBorrarComisionConsultadaId).toHaveBeenCalledOnce();
    expect(mockGetComision).not.toHaveBeenCalled();
  });

  it("no tira y borra la cookie cuando comisionId llega como File en vez de string", async () => {
    const formData = new FormData();
    formData.set("comisionId", new File(["contenido"], "archivo.txt"));

    await expect(cambiarComisionConsultada(formData)).resolves.not.toThrow();

    expect(mockGetComision).not.toHaveBeenCalled();
    expect(mockBorrarComisionConsultadaId).toHaveBeenCalledOnce();
  });

  it("revalida /admin como layout en todos los casos", async () => {
    mockGetComision.mockResolvedValue(comisionCon("c-2025", false));

    await cambiarComisionConsultada(formDataCon("c-2025"));

    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin", "layout");
  });

  it("nunca toca Comision.activa vía updateComision o createComision", async () => {
    mockGetComision.mockResolvedValue(comisionCon("c-2025", false));

    await cambiarComisionConsultada(formDataCon("c-2025"));
    await cambiarComisionConsultada(formDataCon());

    expect(updateComision).not.toHaveBeenCalled();
    expect(createComision).not.toHaveBeenCalled();
  });

  it("dos cambios consecutivos (simulando dos docentes con cookie jars distintos) no se pisan entre sí", async () => {
    mockGetComision
      .mockResolvedValueOnce(comisionCon("c-2025", false))
      .mockResolvedValueOnce(comisionCon("c-2024", false));

    await cambiarComisionConsultada(formDataCon("c-2025"));
    await cambiarComisionConsultada(formDataCon("c-2024"));

    expect(mockGuardarComisionConsultadaId).toHaveBeenNthCalledWith(1, "c-2025");
    expect(mockGuardarComisionConsultadaId).toHaveBeenNthCalledWith(2, "c-2024");
  });
});

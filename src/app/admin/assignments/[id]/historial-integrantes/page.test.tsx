import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IndividualAssignment, GrupalAssignment } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetAssignment = vi.fn();
const mockGetHistorialDeMembresias = vi.fn();
const mockRedirect = vi.fn();

vi.mock("@/infrastructure/auth/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  getAssignment: (id: string) => mockGetAssignment(id),
  getHistorialDeMembresias: (id: string, page: number) =>
    mockGetHistorialDeMembresias(id, page),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error("redirect");
  },
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    "aria-current": ariaCurrent,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-current"?: "page";
  }) => (
    <a href={href} className={className} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
}));

vi.mock("../historial-membresias", () => ({
  HistorialDeMembresias: ({
    assignmentId,
    historial,
  }: {
    assignmentId: string;
    historial: { total: number };
  }) => (
    <div
      data-testid="historial-membresias"
      data-assignment={assignmentId}
      data-total={historial.total}
    />
  ),
}));

import HistorialIntegrantesPage from "./page";

// ── Helpers ──────────────────────────────────────────────────

const paginaVacia = { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 };

function makeIndividualAssignment(
  overrides?: Partial<IndividualAssignment>
): IndividualAssignment {
  const assignment = new IndividualAssignment();
  assignment.id = "a1";
  assignment.titulo = "Kata Funcional";
  assignment.descripcion = "Descripción de la kata";
  assignment.templateRepo = "kata-template";
  assignment.tipo = "individual";
  assignment.paradigma = "funcional";
  assignment.slug = "kata-funcional";
  assignment.createdAt = new Date("2026-01-01");
  return Object.assign(assignment, overrides);
}

function makeGrupalAssignment(
  overrides?: Partial<GrupalAssignment>
): GrupalAssignment {
  const assignment = new GrupalAssignment();
  assignment.id = "a2";
  assignment.titulo = "TP Objetos";
  assignment.descripcion = "Trabajo práctico grupal";
  assignment.templateRepo = "tp-objetos-template";
  assignment.tipo = "grupal";
  assignment.paradigma = "objetos";
  assignment.slug = "tp-objetos";
  assignment.createdAt = new Date("2026-01-01");
  assignment.maxIntegrantes = 3;
  return Object.assign(assignment, overrides);
}

// ── Tests ────────────────────────────────────────────────────

describe("Admin Assignment Historial de Integrantes Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockGetHistorialDeMembresias.mockResolvedValue(paginaVacia);
  });

  it("siempre llama a requireAdmin", async () => {
    mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
    await HistorialIntegrantesPage({ params: Promise.resolve({ id: "a2" }) });
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("redirige a /admin/assignments si el assignment no existe", async () => {
    mockGetAssignment.mockResolvedValue(null);
    await expect(
      HistorialIntegrantesPage({ params: Promise.resolve({ id: "no-existe" }) })
    ).rejects.toThrow("redirect");
    expect(mockRedirect).toHaveBeenCalledWith("/admin/assignments");
  });

  it("redirige al detalle si el assignment no es grupal, sin consultar el historial", async () => {
    mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
    await expect(
      HistorialIntegrantesPage({ params: Promise.resolve({ id: "a1" }) })
    ).rejects.toThrow("redirect");
    expect(mockRedirect).toHaveBeenCalledWith("/admin/assignments/a1");
    expect(mockGetHistorialDeMembresias).not.toHaveBeenCalled();
  });

  it("muestra el historial para assignments grupales", async () => {
    mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
    mockGetHistorialDeMembresias.mockResolvedValue({ ...paginaVacia, total: 4 });
    const element = await HistorialIntegrantesPage({ params: Promise.resolve({ id: "a2" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('data-testid="historial-membresias"');
    expect(html).toContain('data-total="4"');
  });

  it("marca la pestaña Integrantes como activa", async () => {
    mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
    const element = await HistorialIntegrantesPage({ params: Promise.resolve({ id: "a2" }) });
    expect(renderToStaticMarkup(element)).toMatch(/aria-current="page"[^>]*>Integrantes</);
  });

  it("normaliza y consulta la página solicitada", async () => {
    mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
    await HistorialIntegrantesPage({
      params: Promise.resolve({ id: "a2" }),
      searchParams: Promise.resolve({ page: "2" }),
    });
    expect(mockGetHistorialDeMembresias).toHaveBeenCalledWith("a2", 2);
  });

  it("normaliza una página inválida a la primera", async () => {
    mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
    await HistorialIntegrantesPage({
      params: Promise.resolve({ id: "a2" }),
      searchParams: Promise.resolve({ page: "2-invalida" }),
    });
    expect(mockGetHistorialDeMembresias).toHaveBeenCalledWith("a2", 1);
  });
});

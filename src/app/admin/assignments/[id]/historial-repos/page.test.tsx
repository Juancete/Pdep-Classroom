import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IndividualAssignment, Entrega } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetAssignment = vi.fn();
const mockGetEntregas = vi.fn();
const mockGetRepoDeletionHistory = vi.fn();
const mockRedirect = vi.fn();

vi.mock("@/infrastructure/auth/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  getAssignment: (id: string) => mockGetAssignment(id),
  getEntregas: (id: string) => mockGetEntregas(id),
  getRepoDeletionHistory: (id: string, page: number) =>
    mockGetRepoDeletionHistory(id, page),
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

vi.mock("../../delete-repos-button", () => ({
  DeleteReposButton: ({
    activeRepoCount,
    deletionEnabled,
  }: {
    activeRepoCount: number;
    deletionEnabled: boolean;
  }) => (
    <button
      data-testid="delete-repos-button"
      data-count={activeRepoCount}
      data-enabled={String(deletionEnabled)}
    />
  ),
}));

vi.mock("../repo-deletion-history", () => ({
  RepoDeletionHistory: ({
    assignmentId,
    history,
  }: {
    assignmentId: string;
    history: { total: number };
  }) => (
    <div
      data-testid="repo-deletion-history"
      data-assignment={assignmentId}
      data-total={history.total}
    />
  ),
}));

import HistorialReposPage from "./page";

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

function makeEntrega(overrides?: Partial<Entrega>): Entrega {
  const entrega = new Entrega();
  entrega.id = "e1";
  entrega.githubUsernames = ["usuario1"];
  entrega.repoName = "kata-funcional-usuario1";
  entrega.repoUrl = "https://github.com/org/kata-funcional-usuario1";
  entrega.createdAt = new Date("2026-01-02");
  return Object.assign(entrega, overrides);
}

// ── Tests ────────────────────────────────────────────────────

describe("Admin Assignment Historial de Repos Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockGetEntregas.mockResolvedValue([]);
    mockGetRepoDeletionHistory.mockResolvedValue(paginaVacia);
  });

  it("siempre llama a requireAdmin", async () => {
    mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
    await HistorialReposPage({ params: Promise.resolve({ id: "a1" }) });
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("redirige a /admin/assignments si el assignment no existe", async () => {
    mockGetAssignment.mockResolvedValue(null);
    await expect(
      HistorialReposPage({ params: Promise.resolve({ id: "no-existe" }) })
    ).rejects.toThrow("redirect");
    expect(mockRedirect).toHaveBeenCalledWith("/admin/assignments");
  });

  it("muestra el historial de borrado", async () => {
    mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
    mockGetRepoDeletionHistory.mockResolvedValue({ ...paginaVacia, total: 7 });
    const element = await HistorialReposPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('data-testid="repo-deletion-history"');
    expect(html).toContain('data-total="7"');
  });

  it("marca la pestaña Repos borrados como activa", async () => {
    mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
    const element = await HistorialReposPage({ params: Promise.resolve({ id: "a1" }) });
    expect(renderToStaticMarkup(element)).toMatch(/aria-current="page"[^>]*>Repos borrados</);
  });

  it("normaliza y consulta la página solicitada del historial", async () => {
    mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
    await HistorialReposPage({
      params: Promise.resolve({ id: "a1" }),
      searchParams: Promise.resolve({ page: "3" }),
    });
    expect(mockGetRepoDeletionHistory).toHaveBeenCalledWith("a1", 3);
  });

  it("normaliza una página inválida a la primera", async () => {
    mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
    await HistorialReposPage({
      params: Promise.resolve({ id: "a1" }),
      searchParams: Promise.resolve({ page: "3-invalida" }),
    });
    expect(mockGetRepoDeletionHistory).toHaveBeenCalledWith("a1", 1);
  });

  describe("botón de borrar repositorios", () => {
    it("cuenta sólo las entregas con repo activo", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      mockGetEntregas.mockResolvedValue([
        makeEntrega({ id: "e1", provisionEstado: "activa" }),
        makeEntrega({ id: "e2", provisionEstado: "activa", repoUrl: undefined }),
        makeEntrega({ id: "e3", provisionEstado: "activa", repoDeleted: true }),
      ]);
      const element = await HistorialReposPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).toContain('data-count="1"');
    });

    it("lo habilita según permiteBorrarRepos del assignment", async () => {
      const assignment = makeIndividualAssignment({ estadoNombre: "archivado" });
      mockGetAssignment.mockResolvedValue(assignment);
      const element = await HistorialReposPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).toContain(
        `data-enabled="${String(assignment.permiteBorrarRepos())}"`
      );
    });
  });
});

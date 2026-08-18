import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Comision, IndividualAssignment } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetAssignments = vi.fn();
const mockGetEntregaCountsByAssignment = vi.fn();
const mockGetActiveRepoCountsByAssignment = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/repositories", () => ({
  getAssignments: (filtro?: unknown) => mockGetAssignments(filtro),
  getEntregaCountsByAssignment: () => mockGetEntregaCountsByAssignment(),
  getActiveRepoCountsByAssignment: () => mockGetActiveRepoCountsByAssignment(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("./delete-button", () => ({
  DeleteAssignmentButton: ({
    id,
    titulo,
    compact,
  }: {
    id: string;
    titulo: string;
    compact?: boolean;
  }) => (
    <button data-id={id} data-compact={String(Boolean(compact))}>
      Eliminar {titulo}
    </button>
  ),
}));

vi.mock("./delete-repos-button", () => ({
  DeleteReposButton: ({
    assignmentId,
    activeRepoCount,
    compact,
  }: {
    assignmentId: string;
    activeRepoCount: number;
    compact?: boolean;
  }) =>
    activeRepoCount > 0 ? (
      <button
        data-testid="delete-repos-button"
        data-id={assignmentId}
        data-compact={String(Boolean(compact))}
      >
        Borrar repos ({activeRepoCount})
      </button>
    ) : null,
}));

vi.mock("./estado-quick-actions", () => ({
  EstadoQuickActions: ({
    assignmentId,
    accionesDisponibles,
  }: {
    assignmentId: string;
    accionesDisponibles: string[];
  }) => (
    <div
      data-testid="estado-quick-actions"
      data-assignment={assignmentId}
      data-acciones={accionesDisponibles.join(",")}
    />
  ),
}));

import AdminAssignmentsPage from "./page";

// ── Helpers ──────────────────────────────────────────────────

function makeAssignment(overrides?: Partial<IndividualAssignment>): IndividualAssignment {
  const assignment = new IndividualAssignment();
  const comision = new Comision(2026, "sheet-1");
  comision.activa = true;
  assignment.id = "a1";
  assignment.titulo = "Kata Funcional";
  assignment.descripcion = "Descripción de la kata";
  assignment.templateRepo = "kata-template";
  assignment.tipo = "individual";
  assignment.paradigma = "funcional";
  assignment.slug = "kata-funcional";
  assignment.createdAt = new Date("2026-01-01");
  assignment.comision = comision;
  return Object.assign(assignment, overrides);
}

// ── Tests ────────────────────────────────────────────────────

describe("Admin Assignments page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockGetEntregaCountsByAssignment.mockResolvedValue(new Map());
    mockGetActiveRepoCountsByAssignment.mockResolvedValue(new Map());
  });

  it("siempre llama a requireAdmin", async () => {
    mockGetAssignments.mockResolvedValue([]);
    await AdminAssignmentsPage({});
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("muestra el link para crear un nuevo assignment", async () => {
    mockGetAssignments.mockResolvedValue([]);
    const element = await AdminAssignmentsPage({});
    const html = renderToStaticMarkup(element);
    expect(html).toContain("href=\"/admin/assignments/new\"");
    expect(html).toContain("Nuevo Assignment");
  });

  describe("estado vacío", () => {
    it("muestra mensaje cuando no hay assignments", async () => {
      mockGetAssignments.mockResolvedValue([]);
      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);
      expect(html).toContain("No hay assignments todavía");
    });

    it("no muestra filas cuando no hay assignments", async () => {
      mockGetAssignments.mockResolvedValue([]);
      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);
      expect(html).not.toContain("Kata Funcional");
    });
  });

  describe("con assignments", () => {
    it("no muestra el estado vacío cuando hay assignments", async () => {
      mockGetAssignments.mockResolvedValue([makeAssignment()]);
      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);
      expect(html).not.toContain("No hay assignments todavía");
    });

    it("muestra el título del assignment", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ titulo: "TP Lógico" }),
      ]);
      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);
      expect(html).toContain("TP Lógico");
    });

    it("muestra el paradigma del assignment", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ paradigma: "objetos" }),
      ]);
      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);
      expect(html).toContain("objetos");
    });

    it("muestra el tipo del assignment", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ tipo: "grupal" }),
      ]);
      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);
      expect(html).toContain("grupal");
    });

    it("muestra el templateRepo", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ templateRepo: "mi-template-especial" }),
      ]);
      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);
      expect(html).toContain("mi-template-especial");
    });

    it("muestra la comisión activa asociada", async () => {
      const comision = new Comision(2027, "sheet-2");
      comision.activa = true;
      mockGetAssignments.mockResolvedValue([makeAssignment({ comision })]);

      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);

      expect(html).toContain("2027");
      expect(html).toContain("Activa");
    });

    it("muestra comisión histórica cuando no está activa", async () => {
      const comision = new Comision(2025, "sheet-old");
      comision.activa = false;
      mockGetAssignments.mockResolvedValue([makeAssignment({ comision })]);

      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);

      expect(html).toContain("2025");
      expect(html).toContain("Histórica");
    });

    it("muestra Sin comisión para assignments huérfanos", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ comision: undefined }),
      ]);

      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);

      expect(html).toContain("Sin comisión");
    });

    it("muestra las cabeceras de la tabla", async () => {
      mockGetAssignments.mockResolvedValue([makeAssignment()]);
      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Título");
      expect(html).toContain("Estado");
      expect(html).toContain("Paradigma");
      expect(html).toContain("Tipo");
      expect(html).toContain("Comisión");
      expect(html).toContain("Template");
      expect(html).toContain("Entregas");
      expect(html).toContain("Deadline");
      expect(html).toContain("Acciones");
    });

    it("muestra el link de editar por cada assignment", async () => {
      mockGetAssignments.mockResolvedValue([makeAssignment({ id: "a1" })]);
      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);
      expect(html).toContain('href="/admin/assignments/a1/edit"');
      expect(html).toContain("Editar");
    });

    it("muestra el botón de eliminar por cada assignment, en modo compact", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ id: "tp-1", titulo: "Kata Funcional" }),
      ]);
      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Eliminar Kata Funcional");
      expect(html).toContain('data-compact="true"');
    });
  });

  describe("acciones rápidas de estado", () => {
    it("pasa las transiciones disponibles según estado y entregas", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ id: "tp-1", estadoNombre: "borrador" }),
      ]);
      mockGetEntregaCountsByAssignment.mockResolvedValue(new Map());

      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);

      expect(html).toContain('data-testid="estado-quick-actions"');
      expect(html).toContain('data-assignment="tp-1"');
      expect(html).toContain('data-acciones="publicado,archivado"');
    });

    it("no ofrece volver a borrador cuando el publicado ya tiene entregas", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ id: "tp-1", estadoNombre: "publicado" }),
      ]);
      mockGetEntregaCountsByAssignment.mockResolvedValue(new Map([["tp-1", 2]]));

      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);

      expect(html).toContain('data-acciones="archivado"');
    });
  });

  describe("conteo de entregas", () => {
    it("muestra 0 entregas cuando no hay ninguna", async () => {
      mockGetAssignments.mockResolvedValue([makeAssignment({ id: "tp-1" })]);
      mockGetEntregaCountsByAssignment.mockResolvedValue(new Map());

      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);
      expect(html).toContain(">0<");
    });

    it("muestra la cantidad correcta de entregas", async () => {
      mockGetAssignments.mockResolvedValue([makeAssignment({ id: "tp-1" })]);
      mockGetEntregaCountsByAssignment.mockResolvedValue(new Map([["tp-1", 3]]));

      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);
      expect(html).toContain(">3<");
    });
  });

  describe("botón de borrar repos", () => {
    it("muestra el botón cuando hay repos activos", async () => {
      mockGetAssignments.mockResolvedValue([makeAssignment({ id: "a1" })]);
      mockGetActiveRepoCountsByAssignment.mockResolvedValue(new Map([["a1", 3]]));

      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Borrar repos (3)");
      expect(html).toContain('data-compact="true"');
    });

    it("no muestra el botón cuando no hay repos activos", async () => {
      mockGetAssignments.mockResolvedValue([makeAssignment({ id: "a1" })]);
      mockGetActiveRepoCountsByAssignment.mockResolvedValue(new Map());

      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);
      expect(html).not.toContain("Borrar repos");
    });
  });

  describe("formato de deadline", () => {
    it("muestra el deadline formateado cuando está presente", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ deadline: new Date("2026-06-30") }),
      ]);
      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);
      // Localización es-AR: "30/6/2026" o similar
      expect(html).toContain("2026");
      expect(html).not.toContain(">—<");
    });

    it('muestra "—" cuando no hay deadline', async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ deadline: undefined }),
      ]);
      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);
      expect(html).toContain("—");
    });
  });

  describe("estado", () => {
    it("muestra el badge de estado por assignment", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ estadoNombre: "archivado" }),
      ]);
      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-testid="estado-badge"');
      expect(html).toContain("Archivado");
    });

    it("muestra los chips de filtro por estado", async () => {
      mockGetAssignments.mockResolvedValue([]);
      const element = await AdminAssignmentsPage({});
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Todos");
      expect(html).toContain('href="/admin/assignments?estado=borrador"');
      expect(html).toContain('href="/admin/assignments?estado=publicado"');
      expect(html).toContain('href="/admin/assignments?estado=archivado"');
    });

    it("pasa el filtro al repositorio cuando el estado es válido", async () => {
      mockGetAssignments.mockResolvedValue([]);
      const element = await AdminAssignmentsPage({
        searchParams: Promise.resolve({ estado: "archivado" }),
      });
      renderToStaticMarkup(element);
      expect(mockGetAssignments).toHaveBeenCalledWith({ estado: "archivado" });
    });

    it("ignora un estado desconocido en el query string", async () => {
      mockGetAssignments.mockResolvedValue([]);
      const element = await AdminAssignmentsPage({
        searchParams: Promise.resolve({ estado: "basura" }),
      });
      renderToStaticMarkup(element);
      expect(mockGetAssignments).toHaveBeenCalledWith(undefined);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PdepUser } from "@/types";
import { GrupalAssignment, IndividualAssignment } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireUser = vi.fn();
const mockGetAssignment = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockGetGruposDeAssignment = vi.fn();
const mockGetEntregaDeUsuario = vi.fn();
const mockNotFound = vi.fn(() => { throw new Error("NOT_FOUND"); });

vi.mock("@/lib/session", () => ({
  requireUser: () => mockRequireUser(),
}));

vi.mock("@/lib/repositories", () => ({
  getAssignment: (id: string) => mockGetAssignment(id),
  getAlumnoByGithub: (username: string) => mockGetAlumnoByGithub(username),
  getGruposDeAssignment: (id: string) => mockGetGruposDeAssignment(id),
  getEntregaDeUsuario: (assignmentId: string, username: string) =>
    mockGetEntregaDeUsuario(assignmentId, username),
}));

vi.mock("next/navigation", () => ({
  notFound: () => mockNotFound(),
}));

vi.mock("./grupo-selector", () => ({
  GrupoSelector: (props: { assignmentId: string; inscripcionesCerradas: boolean }) => (
    <div
      data-testid="grupo-selector"
      data-assignment={props.assignmentId}
      data-cerradas={String(props.inscripcionesCerradas)}
    >
      GrupoSelector
    </div>
  ),
}));

vi.mock("./mi-grupo", () => ({
  MiGrupo: (props: { grupo: { nombre: string }; tieneEntrega: boolean }) => (
    <div
      data-testid="mi-grupo"
      data-nombre={props.grupo.nombre}
      data-tiene-entrega={String(props.tieneEntrega)}
    >
      MiGrupo
    </div>
  ),
}));

import GrupoPage from "./page";

// ── Helpers ──────────────────────────────────────────────────

function makeUser(overrides?: Partial<PdepUser>): PdepUser {
  return {
    githubUsername: "ana",
    name: "Ana García",
    image: "",
    isAdmin: false,
    ...overrides,
  };
}

function makeGrupalAssignment(overrides = {}): GrupalAssignment {
  const assignment = new GrupalAssignment();
  assignment.id = "a1";
  assignment.titulo = "TP Grupal";
  assignment.paradigma = "objetos";
  assignment.slug = "tp-grupal";
  assignment.maxIntegrantes = 3;
  assignment.inscripcionesCerradas = false;
  assignment.comision = { id: "c1" } as never;
  return Object.assign(assignment, overrides);
}

function makeAlumno(comisionId = "c1") {
  return {
    id: "alumno-ana",
    githubUsername: "ana",
    comision: { id: comisionId },
  };
}

function makeGrupo(
  id: string,
  miembros: string[],
  maxIntegrantes = 3,
  nombre = `grupo-${id}`
) {
  const lleno = miembros.length >= maxIntegrantes;
  return {
    id,
    nombre,
    paradigma: "objetos",
    maxIntegrantes,
    isOpen: () => !lleno,
    estaLleno: () => lleno,
    etiquetaCupo: () => lleno
      ? `Completo (${maxIntegrantes}/${maxIntegrantes})`
      : `${miembros.length}/${maxIntegrantes} integrantes`,
    contieneA: (username: string) => miembros.some((member) => member.toLowerCase() === username.toLowerCase()),
    usernamesDeMiembros: () => miembros,
    alumnos: {
      getItems: () => miembros.map((username) => ({ githubUsername: username })),
    },
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("GrupoPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue(makeUser());
    mockGetAssignment.mockResolvedValue(makeGrupalAssignment());
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
    mockGetGruposDeAssignment.mockResolvedValue([]);
    mockGetEntregaDeUsuario.mockResolvedValue(null);
  });

  it("llama a notFound si el assignment no existe", async () => {
    mockGetAssignment.mockResolvedValue(null);
    await expect(GrupoPage({ params: Promise.resolve({ id: "a1" }) })).rejects.toThrow("NOT_FOUND");
  });

  it("llama a notFound si el assignment es individual", async () => {
    const individual = new IndividualAssignment();
    individual.id = "a1";
    mockGetAssignment.mockResolvedValue(individual);
    await expect(GrupoPage({ params: Promise.resolve({ id: "a1" }) })).rejects.toThrow("NOT_FOUND");
  });

  it("llama a notFound para acceso directo desde otra comisión", async () => {
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno("c2"));

    await expect(GrupoPage({ params: Promise.resolve({ id: "a1" }) })).rejects.toThrow("NOT_FOUND");

    expect(mockGetGruposDeAssignment).not.toHaveBeenCalled();
  });

  it("permite acceso global al administrador", async () => {
    mockRequireUser.mockResolvedValue(makeUser({ isAdmin: true }));

    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });

    expect(renderToStaticMarkup(element)).toContain("TP Grupal");
    expect(mockGetAlumnoByGithub).not.toHaveBeenCalled();
  });

  it("muestra el título del assignment", async () => {
    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("TP Grupal");
  });

  it("muestra maxIntegrantes y paradigma en el subtítulo", async () => {
    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("3 integrantes");
    expect(html).toContain("objetos");
  });

  it("muestra GrupoSelector cuando el alumno no está en ningún grupo", async () => {
    mockGetGruposDeAssignment.mockResolvedValue([
      makeGrupo("g1", ["bob", "cora"]),
    ]);
    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("data-testid=\"grupo-selector\"");
    expect(html).not.toContain("data-testid=\"mi-grupo\"");
  });

  it("muestra MiGrupo cuando el alumno ya está en un grupo", async () => {
    mockGetGruposDeAssignment.mockResolvedValue([
      makeGrupo("g1", ["ana", "bob"], 3, "Los Lambdas"),
    ]);
    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("data-testid=\"mi-grupo\"");
    expect(html).toContain("Los Lambdas");
    expect(html).not.toContain("data-testid=\"grupo-selector\"");
  });

  it("pasa tieneEntrega=false a MiGrupo cuando no hay entrega", async () => {
    mockGetGruposDeAssignment.mockResolvedValue([
      makeGrupo("g1", ["ana"], 3, "Los Lambdas"),
    ]);
    mockGetEntregaDeUsuario.mockResolvedValue(null);
    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("data-tiene-entrega=\"false\"");
  });

  it("pasa tieneEntrega=true a MiGrupo cuando ya aceptó el TP", async () => {
    mockGetGruposDeAssignment.mockResolvedValue([
      makeGrupo("g1", ["ana"], 3, "Los Lambdas"),
    ]);
    mockGetEntregaDeUsuario.mockResolvedValue({ id: "e1", repoUrl: "https://github.com/x" });
    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("data-tiene-entrega=\"true\"");
  });

  it("pasa inscripcionesCerradas al GrupoSelector", async () => {
    mockGetAssignment.mockResolvedValue(
      makeGrupalAssignment({ inscripcionesCerradas: true })
    );
    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("data-cerradas=\"true\"");
  });

  it("no consulta entrega si el alumno no tiene grupo (optimización)", async () => {
    mockGetGruposDeAssignment.mockResolvedValue([
      makeGrupo("g1", ["bob", "cora"]),
    ]);
    await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    expect(mockGetEntregaDeUsuario).not.toHaveBeenCalled();
  });
});

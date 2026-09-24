import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PdepUser } from "@/types";
import {
  Grupo,
  MiembroDeGrupo,
  GrupalAssignment,
  IndividualAssignment,
  DOCENTE,
  ESTUDIANTE,
} from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireUser = vi.fn();
const mockGetAssignment = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockGetComisionActiva = vi.fn();
const mockGetGruposDeAssignment = vi.fn();
const mockGetEntregaLogica = vi.fn();
const mockGetGrupoIdsConRepoActivo = vi.fn();
const mockNotFound = vi.fn(() => { throw new Error("NOT_FOUND"); });

vi.mock("@/infrastructure/auth/session", () => ({
  requireUser: () => mockRequireUser(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  getAssignment: (id: string) => mockGetAssignment(id),
  getAlumnoByGithub: (username: string) => mockGetAlumnoByGithub(username),
  getComisionActiva: () => mockGetComisionActiva(),
  getGruposDeAssignment: (id: string) => mockGetGruposDeAssignment(id),
  getEntregaLogica: (data: unknown) => mockGetEntregaLogica(data),
  getGrupoIdsConRepoActivo: (id: string) => mockGetGrupoIdsConRepoActivo(id),
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
  MiGrupo: (props: {
    grupo: { nombre: string };
    tieneRepo: boolean;
    tieneAccesoAlRepo: boolean;
    integrantes: { username: string; nombreCompleto: string | null; tieneAccesoAlRepo: boolean }[];
    githubUsername: string;
    motivoBloqueo: string | null;
    esUltimoMiembro: boolean;
    gruposDisponibles: { id: string; nombre: string }[];
  }) => (
    <div
      data-testid="mi-grupo"
      data-nombre={props.grupo.nombre}
      data-tiene-repo={String(props.tieneRepo)}
      data-tiene-acceso={String(props.tieneAccesoAlRepo)}
      // Issue #138: username + acceso al repo de cada integrante, en el
      // mismo orden que llegan — sin el nombre completo (no hace falta para
      // estos tests de esta página).
      data-integrantes={props.integrantes
        .map((integrante) => `${integrante.username}:${integrante.tieneAccesoAlRepo}`)
        .join(",")}
      data-username={props.githubUsername}
      data-motivo={props.motivoBloqueo ?? ""}
      data-ultimo={String(props.esUltimoMiembro)}
      data-disponibles={props.gruposDisponibles.map((grupo) => grupo.id).join(",")}
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
    rol: ESTUDIANTE,
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
  // Publicado por defecto: la página exige que el assignment esté disponible.
  assignment.transicionarA("publicado", { tieneEntregas: false }, "docente1");
  return Object.assign(assignment, overrides);
}

function makeAlumno(comisionId = "c1") {
  const comision = { id: comisionId };
  // `confirmoRegistroEn` duck-typed (issue #107, revisión de code review):
  // `ParticipanteAlumno.comisionDeParticipacion` ahora lo llama para exigir
  // registro confirmado, no alcanza con tener `comision`.
  return {
    id: "alumno-ana",
    githubUsername: "ana",
    comision,
    confirmoRegistroEn: (otraComision: { id: string } | null) =>
      otraComision?.id === comision.id,
  };
}

// Issue #138: miembros como `MiembroDeGrupo` (no `Alumno`) — `nombreCompleto()`
// necesita esa clase, y `alumno` queda sin completar (mismo caso que un
// docente en un grupo de demo, issue #107/#112).
function makeGrupo(
  id: string,
  usernames: string[],
  maxIntegrantes = 3,
  nombre = `grupo-${id}`
): Grupo {
  const grupo = new Grupo();
  grupo.id = id;
  grupo.nombre = nombre;
  grupo.nombreNormalizado = nombre;
  grupo.paradigma = "objetos";
  grupo.maxIntegrantes = maxIntegrantes;
  grupo.creadoPor = usernames[0] ?? "alguien";
  const items = usernames.map((username) =>
    Object.assign(new MiembroDeGrupo(), { githubUsername: username })
  );
  Object.assign(grupo, {
    miembros: { getItems: () => items, length: items.length },
  });
  return grupo;
}

function makeEntregaFake({ tieneRepo, colaboradores }: { tieneRepo: boolean; colaboradores: string[] }) {
  return {
    id: "e1",
    hasRepo: () => tieneRepo,
    perteneceA: (username: string) => colaboradores.includes(username),
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("GrupoPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue(makeUser());
    mockGetAssignment.mockResolvedValue(makeGrupalAssignment());
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
    mockGetComisionActiva.mockResolvedValue({ id: "c1" });
    mockGetGruposDeAssignment.mockResolvedValue([]);
    mockGetEntregaLogica.mockResolvedValue(null);
    mockGetGrupoIdsConRepoActivo.mockResolvedValue(new Set());
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

  // issue #107/#112: el docente ya no tiene acceso global — participa
  // desde la comisión activa, igual que un alumno participa desde la suya.
  it("el docente accede cuando la comisión activa coincide con la del assignment", async () => {
    mockRequireUser.mockResolvedValue(makeUser({ rol: DOCENTE }));
    mockGetComisionActiva.mockResolvedValue({ id: "c1" });

    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });

    expect(renderToStaticMarkup(element)).toContain("TP Grupal");
    expect(mockGetAlumnoByGithub).not.toHaveBeenCalled();
  });

  it("el docente rebota si la comisión activa no coincide con la del assignment", async () => {
    mockRequireUser.mockResolvedValue(makeUser({ rol: DOCENTE }));
    mockGetComisionActiva.mockResolvedValue({ id: "c2" });

    await expect(GrupoPage({ params: Promise.resolve({ id: "a1" }) })).rejects.toThrow("NOT_FOUND");
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

  it("pasa tieneRepo=false y tieneAccesoAlRepo=false a MiGrupo cuando no hay entrega", async () => {
    mockGetGruposDeAssignment.mockResolvedValue([
      makeGrupo("g1", ["ana"], 3, "Los Lambdas"),
    ]);
    mockGetEntregaLogica.mockResolvedValue(null);
    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("data-tiene-repo=\"false\"");
    expect(html).toContain("data-tiene-acceso=\"false\"");
  });

  it("pasa tieneRepo=true y tieneAccesoAlRepo=true cuando el repo está activo y el usuario es colaborador", async () => {
    mockGetGruposDeAssignment.mockResolvedValue([
      makeGrupo("g1", ["ana"], 3, "Los Lambdas"),
    ]);
    mockGetEntregaLogica.mockResolvedValue(makeEntregaFake({ tieneRepo: true, colaboradores: ["ana"] }));
    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("data-tiene-repo=\"true\"");
    expect(html).toContain("data-tiene-acceso=\"true\"");
  });

  // Issue #138: `integrantes` es `Grupo.resumenDeIntegrantes(entrega)` — un
  // integrante puede tener acceso y otro no, según figure o no en
  // `githubUsernames` de la entrega (issue #123).
  it("pasa integrantes con el acceso al repo de cada uno", async () => {
    mockGetGruposDeAssignment.mockResolvedValue([
      makeGrupo("g1", ["ana", "bob"], 3, "Los Lambdas"),
    ]);
    mockGetEntregaLogica.mockResolvedValue(
      makeEntregaFake({ tieneRepo: true, colaboradores: ["ana"] })
    );
    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('data-integrantes="ana:true,bob:false"');
  });

  it("pasa tieneAccesoAlRepo=false cuando el repo está activo pero el usuario no figura como colaborador", async () => {
    mockGetGruposDeAssignment.mockResolvedValue([
      makeGrupo("g1", ["ana", "bob"], 3, "Los Lambdas"),
    ]);
    mockGetEntregaLogica.mockResolvedValue(makeEntregaFake({ tieneRepo: true, colaboradores: ["bob"] }));
    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("data-tiene-repo=\"true\"");
    expect(html).toContain("data-tiene-acceso=\"false\"");
  });

  it("pasa tieneRepo=false cuando la entrega existe pero no tiene repo activo", async () => {
    mockGetGruposDeAssignment.mockResolvedValue([
      makeGrupo("g1", ["ana"], 3, "Los Lambdas"),
    ]);
    mockGetEntregaLogica.mockResolvedValue(makeEntregaFake({ tieneRepo: false, colaboradores: ["ana"] }));
    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("data-tiene-repo=\"false\"");
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
    expect(mockGetEntregaLogica).not.toHaveBeenCalled();
  });

  it("consulta la entrega por grupoId, no por el snapshot de usernames", async () => {
    mockGetGruposDeAssignment.mockResolvedValue([
      makeGrupo("g1", ["ana"], 3, "Los Lambdas"),
    ]);
    await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    expect(mockGetEntregaLogica).toHaveBeenCalledWith({
      assignmentId: "a1",
      grupoId: "g1",
    });
  });

  it("no bloquea al alumno cuando puede salir/cambiarse", async () => {
    mockGetGruposDeAssignment.mockResolvedValue([
      makeGrupo("g1", ["ana", "bob"], 3, "Los Lambdas"),
    ]);
    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('data-motivo=""');
  });

  it("bloquea al alumno con el mensaje del error de dominio cuando el grupo ya aceptó el TP", async () => {
    mockGetGruposDeAssignment.mockResolvedValue([
      makeGrupo("g1", ["ana"], 3, "Los Lambdas"),
    ]);
    mockGetEntregaLogica.mockResolvedValue(makeEntregaFake({ tieneRepo: true, colaboradores: ["ana"] }));
    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("El grupo ya aceptó el TP");
  });

  // issue #107/#112: ya no hay bypass — el docente sigue exactamente las
  // mismas reglas de membresía que un alumno.
  it("bloquea al docente igual que a un alumno cuando el grupo ya aceptó el TP", async () => {
    mockRequireUser.mockResolvedValue(makeUser({ rol: DOCENTE, githubUsername: "ana" }));
    mockGetComisionActiva.mockResolvedValue({ id: "c1" });
    const grupoDeDocentes = makeGrupo("g1", ["ana"], 3, "Los Lambdas");
    grupoDeDocentes.tipoDeIntegrantes = "docentes";
    mockGetGruposDeAssignment.mockResolvedValue([grupoDeDocentes]);
    mockGetEntregaLogica.mockResolvedValue(makeEntregaFake({ tieneRepo: true, colaboradores: ["ana"] }));
    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("El grupo ya aceptó el TP");
  });

  it("marca esUltimoMiembro cuando el alumno está solo en el grupo", async () => {
    mockGetGruposDeAssignment.mockResolvedValue([
      makeGrupo("g1", ["ana"], 3, "Los Lambdas"),
    ]);
    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('data-ultimo="true"');
  });

  it("no marca esUltimoMiembro cuando hay más integrantes", async () => {
    mockGetGruposDeAssignment.mockResolvedValue([
      makeGrupo("g1", ["ana", "bob"], 3, "Los Lambdas"),
    ]);
    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('data-ultimo="false"');
  });

  it("ofrece como destino los grupos con cupo, excluyendo el propio", async () => {
    mockGetGruposDeAssignment.mockResolvedValue([
      makeGrupo("g1", ["ana"], 3, "Los Lambdas"),
      makeGrupo("g2", ["bob"], 3, "Los Monoides"),
      makeGrupo("g3", ["carla", "dan", "eva"], 3, "Grupo Lleno"),
    ]);
    const element = await GrupoPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('data-disponibles="g2"');
  });
});

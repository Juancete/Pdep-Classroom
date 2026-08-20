import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PdepUser } from "@/types";
import {
  Alumno,
  Comision,
  Entrega,
  GrupalAssignment,
  IndividualAssignment,
  DOCENTE,
  ESTUDIANTE,
  type Assignment,
} from "@/domain/entities";

const mockGetAssignment = vi.fn();
const mockGetEntregaDeUsuario = vi.fn();
const mockGetGrupoDeAlumno = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockCrearEntregaSiAssignmentDisponible = vi.fn();
const mockCrearEntrega = vi.fn();
const mockGetRepoInfo = vi.fn();
const mockAddCollaborators = vi.fn();

vi.mock("@/lib/repositories", () => ({
  getAssignment: (id: string) => mockGetAssignment(id),
  getEntregaDeUsuario: (assignmentId: string, username: string) =>
    mockGetEntregaDeUsuario(assignmentId, username),
  getGrupoDeAlumnoEnAssignment: (assignmentId: string, username: string) =>
    mockGetGrupoDeAlumno(assignmentId, username),
  getAlumnoByGithub: (username: string) => mockGetAlumnoByGithub(username),
  crearEntregaSiAssignmentDisponible: (data: unknown, rol: unknown) =>
    mockCrearEntregaSiAssignmentDisponible(data, rol),
}));

vi.mock("@/lib/github", () => ({
  crearEntrega: (opts: unknown) => mockCrearEntrega(opts),
  getRepoInfo: (repoName: string) => mockGetRepoInfo(repoName),
  addCollaborators: (repoName: string, usernames: string[]) =>
    mockAddCollaborators(repoName, usernames),
}));

import {
  aceptarAssignment,
  AlumnoNoRegistradoError,
  AssignmentNoDisponibleError,
  AssignmentNoEncontradoError,
} from "./aceptarAssignment";
import { AccesoAssignmentProhibidoError } from "./assignmentAuthorization";
import { NombreRepositorioDemasiadoLargoError } from "@/lib/naming";

function makeComision(id = "c1"): Comision {
  const comision = new Comision(2026, "sheet-test");
  comision.id = id;
  return comision;
}

function makeUser(overrides?: Partial<PdepUser>): PdepUser {
  return {
    githubUsername: "juangarcia",
    name: "Juan García",
    image: "",
    rol: ESTUDIANTE,
    ...overrides,
  };
}

function makeAssignment(overrides?: Partial<IndividualAssignment & GrupalAssignment>): Assignment {
  const assignment: Assignment =
    overrides?.tipo === "grupal"
      ? Object.assign(new GrupalAssignment(), { maxIntegrantes: 4 })
      : new IndividualAssignment();
  assignment.id = "a1";
  assignment.titulo = "Kata Funcional";
  assignment.descripcion = "";
  assignment.templateRepo = "pdep-mn-utn/kata-template";
  assignment.paradigma = "funcional";
  assignment.slug = "kata-funcional";
  assignment.createdAt = new Date("2026-01-01");
  assignment.comision = makeComision();
  // Publicado por defecto: la mayoría de estos tests ejercitan el camino
  // feliz de aceptar, que requiere que el assignment esté disponible. Los
  // tests de ciclo de vida overridean `estadoNombre` explícitamente.
  assignment.transicionarA("publicado", { tieneEntregas: false }, "docente1");
  return Object.assign(assignment, overrides);
}

function makeAlumno(overrides?: Partial<Alumno>): Alumno {
  const alumno = new Alumno();
  alumno.id = "alumno-1";
  alumno.githubUsername = "juangarcia";
  alumno.legajo = "12345";
  alumno.nombre = "Juan";
  alumno.apellido = "García";
  alumno.email = "juan@example.com";
  alumno.comision = makeComision();
  return Object.assign(alumno, overrides);
}

function makeEntrega(overrides?: Partial<Entrega>): Entrega {
  const entrega = new Entrega();
  entrega.id = "e1";
  entrega.repoName = "kata-funcional-juangarcia";
  entrega.repoUrl = "https://github.com/pdep-mn-utn/kata-funcional-juangarcia";
  entrega.githubUsernames = ["juangarcia"];
  entrega.createdAt = new Date();
  return Object.assign(entrega, overrides);
}

function makeGrupo(
  githubUsernames: string[],
  id = "grupo-uuid-1",
  nombreNormalizado = "los-lambdas"
) {
  return {
    id,
    nombreNormalizado,
    usernamesDeMiembros: () => githubUsernames,
  };
}

describe("aceptarAssignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAssignment.mockResolvedValue(makeAssignment());
    mockGetEntregaDeUsuario.mockResolvedValue(null);
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
    mockGetRepoInfo.mockResolvedValue(null);
    mockCrearEntrega.mockResolvedValue({
      repoName: "kata-funcional-juangarcia",
      repoUrl: "https://github.com/pdep-mn-utn/kata-funcional-juangarcia",
      repoGithubId: "111222",
    });
    mockCrearEntregaSiAssignmentDisponible.mockResolvedValue(makeEntrega());
  });

  it("devuelve la entrega existente sin tocar GitHub", async () => {
    const entrega = makeEntrega();
    mockGetEntregaDeUsuario.mockResolvedValue(entrega);

    await expect(aceptarAssignment("a1", makeUser())).resolves.toBe(entrega);

    expect(mockGetRepoInfo).not.toHaveBeenCalled();
    expect(mockCrearEntrega).not.toHaveBeenCalled();
    expect(mockCrearEntregaSiAssignmentDisponible).not.toHaveBeenCalled();
  });

  it("falla con error de dominio si el assignment no existe", async () => {
    mockGetAssignment.mockResolvedValue(null);

    await expect(aceptarAssignment("a1", makeUser())).rejects.toBeInstanceOf(
      AssignmentNoEncontradoError
    );
  });

  it("crea repo y entrega individual con alumnoId", async () => {
    await aceptarAssignment("a1", makeUser());

    expect(mockCrearEntrega).toHaveBeenCalledWith(
      expect.objectContaining({
        templateRepo: "kata-template",
        repoName: "kata-funcional-juangarcia",
        usernames: ["juangarcia"],
      })
    );
    expect(mockCrearEntregaSiAssignmentDisponible).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentId: "a1",
        alumnoId: "alumno-1",
        grupoId: undefined,
        repoName: "kata-funcional-juangarcia",
        // Id numérico de GitHub del repo (issue #60): se captura en la
        // creación real desde template, en vez de depender pura y
        // exclusivamente del "self-heal" del primer webhook.
        repoGithubId: "111222",
      }),
      ESTUDIANTE
    );
  });

  it("cuando el repo ya existía (no se crea desde template), toma repoGithubId de GitHub en vez de depender del self-heal del primer webhook", async () => {
    mockGetRepoInfo.mockResolvedValue({
      repoGithubId: "555666",
      repoUrl: "https://github.com/pdep-mn-utn/kata-funcional-juangarcia",
    });

    await aceptarAssignment("a1", makeUser());

    expect(mockCrearEntrega).not.toHaveBeenCalled();
    expect(mockCrearEntregaSiAssignmentDisponible).toHaveBeenCalledWith(
      expect.objectContaining({ repoGithubId: "555666" }),
      ESTUDIANTE
    );
  });

  it("rechaza una entrega individual cuyo nombre completo supera el límite", async () => {
    mockGetAssignment.mockResolvedValue(
      makeAssignment({ slug: "a".repeat(90) })
    );
    mockGetAlumnoByGithub.mockResolvedValue(
      makeAlumno({ githubUsername: "b".repeat(10) })
    );

    await expect(
      aceptarAssignment(
        "a1",
        makeUser({ githubUsername: "b".repeat(10) })
      )
    ).rejects.toBeInstanceOf(NombreRepositorioDemasiadoLargoError);

    expect(mockGetRepoInfo).not.toHaveBeenCalled();
    expect(mockCrearEntrega).not.toHaveBeenCalled();
  });

  it("mantiene el requisito funcional de alumno para un admin que acepta un TP individual", async () => {
    mockGetAlumnoByGithub.mockResolvedValue(null);

    await expect(aceptarAssignment("a1", makeUser({ rol: DOCENTE }))).rejects.toBeInstanceOf(
      AlumnoNoRegistradoError
    );

    expect(mockCrearEntrega).not.toHaveBeenCalled();
  });

  it("crea entrega grupal con grupoId y todos los miembros", async () => {
    mockGetAssignment.mockResolvedValue(makeAssignment({ tipo: "grupal" }));
    mockGetGrupoDeAlumno.mockResolvedValue(makeGrupo(["juangarcia", "mariaperez"]));
    mockCrearEntrega.mockResolvedValue({
      repoName: "kata-funcional-los-lambdas",
      repoUrl: "https://github.com/pdep-mn-utn/kata-funcional-los-lambdas",
    });

    await aceptarAssignment("a1", makeUser());

    expect(mockGetAlumnoByGithub).toHaveBeenCalledWith("juangarcia");
    expect(mockCrearEntrega).toHaveBeenCalledWith(
      expect.objectContaining({
        repoName: "kata-funcional-los-lambdas",
        usernames: ["juangarcia", "mariaperez"],
      })
    );
    expect(mockCrearEntregaSiAssignmentDisponible).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentId: "a1",
        alumnoId: undefined,
        grupoId: "grupo-uuid-1",
        repoName: "kata-funcional-los-lambdas",
        githubUsernames: ["juangarcia", "mariaperez"],
      }),
      ESTUDIANTE
    );
  });

  it("reconcilia cuando el repo ya existe en GitHub", async () => {
    mockGetRepoInfo.mockResolvedValue({
      repoGithubId: "777888",
      repoUrl: "https://github.com/pdep-mn-utn/kata-funcional-juangarcia",
    });

    await aceptarAssignment("a1", makeUser());

    expect(mockCrearEntrega).not.toHaveBeenCalled();
    expect(mockAddCollaborators).toHaveBeenCalledWith(
      "kata-funcional-juangarcia",
      ["juangarcia"]
    );
    expect(mockCrearEntregaSiAssignmentDisponible).toHaveBeenCalledWith(
      expect.objectContaining({
        repoName: "kata-funcional-juangarcia",
        repoUrl: "https://github.com/pdep-mn-utn/kata-funcional-juangarcia",
        repoGithubId: "777888",
      }),
      ESTUDIANTE
    );
  });

  it("si crearEntrega falla pero el repo apareció, reconcilia la entrega local con su repoGithubId", async () => {
    mockGetRepoInfo
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        repoGithubId: "999000",
        repoUrl: "https://github.com/pdep-mn-utn/kata-funcional-juangarcia",
      });
    mockCrearEntrega.mockRejectedValue(new Error("name already exists"));

    await aceptarAssignment("a1", makeUser());

    expect(mockAddCollaborators).toHaveBeenCalledWith(
      "kata-funcional-juangarcia",
      ["juangarcia"]
    );
    expect(mockCrearEntregaSiAssignmentDisponible).toHaveBeenCalledWith(
      expect.objectContaining({ repoGithubId: "999000" }),
      ESTUDIANTE
    );
  });

  it("propaga el error de GitHub si el repo no existe después del fallo", async () => {
    mockGetRepoInfo
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockCrearEntrega.mockRejectedValue(new Error("GitHub caído"));

    await expect(aceptarAssignment("a1", makeUser())).rejects.toThrow("GitHub caído");
  });

  it("rechaza un alumno de otra comisión antes de consultar entregas o GitHub", async () => {
    mockGetAlumnoByGithub.mockResolvedValue(
      makeAlumno({ comision: makeComision("c2") })
    );

    await expect(aceptarAssignment("a1", makeUser())).rejects.toBeInstanceOf(
      AccesoAssignmentProhibidoError
    );

    expect(mockGetEntregaDeUsuario).not.toHaveBeenCalled();
    expect(mockGetRepoInfo).not.toHaveBeenCalled();
    expect(mockCrearEntrega).not.toHaveBeenCalled();
    expect(mockCrearEntregaSiAssignmentDisponible).not.toHaveBeenCalled();
  });

  it("rechaza para alumnos un assignment histórico sin comisión", async () => {
    mockGetAssignment.mockResolvedValue(makeAssignment({ comision: undefined }));

    await expect(aceptarAssignment("a1", makeUser())).rejects.toBeInstanceOf(
      AccesoAssignmentProhibidoError
    );
  });

  it("permite acceso global al administrador", async () => {
    mockGetAlumnoByGithub.mockResolvedValue(
      makeAlumno({ comision: makeComision("c2") })
    );

    await expect(
      aceptarAssignment("a1", makeUser({ rol: DOCENTE }))
    ).resolves.toBeInstanceOf(Entrega);
  });

  it("rechaza aceptar un assignment en borrador y no toca GitHub", async () => {
    const borrador = makeAssignment();
    borrador.estadoNombre = "borrador";
    mockGetAssignment.mockResolvedValue(borrador);

    await expect(aceptarAssignment("a1", makeUser())).rejects.toBeInstanceOf(
      AssignmentNoDisponibleError
    );

    expect(mockGetEntregaDeUsuario).not.toHaveBeenCalled();
    expect(mockCrearEntrega).not.toHaveBeenCalled();
  });

  it("rechaza aceptar un assignment archivado y no toca GitHub", async () => {
    const archivado = makeAssignment();
    archivado.transicionarA("archivado", { tieneEntregas: false }, "docente1");
    mockGetAssignment.mockResolvedValue(archivado);

    await expect(aceptarAssignment("a1", makeUser())).rejects.toBeInstanceOf(
      AssignmentNoDisponibleError
    );

    expect(mockCrearEntrega).not.toHaveBeenCalled();
  });

  it("permite al administrador aceptar un assignment en borrador", async () => {
    const borrador = makeAssignment();
    borrador.estadoNombre = "borrador";
    mockGetAssignment.mockResolvedValue(borrador);

    await expect(
      aceptarAssignment("a1", makeUser({ rol: DOCENTE }))
    ).resolves.toBeInstanceOf(Entrega);
  });

  it("pasa el rol a crearEntregaSiAssignmentDisponible para que revalide bajo lock", async () => {
    await aceptarAssignment("a1", makeUser({ rol: ESTUDIANTE }));
    expect(mockCrearEntregaSiAssignmentDisponible).toHaveBeenCalledWith(
      expect.any(Object),
      ESTUDIANTE
    );

    mockGetAlumnoByGithub.mockResolvedValue(
      makeAlumno({ comision: makeComision("c2") })
    );
    await aceptarAssignment("a1", makeUser({ rol: DOCENTE }));
    expect(mockCrearEntregaSiAssignmentDisponible).toHaveBeenCalledWith(
      expect.any(Object),
      DOCENTE
    );
  });
});

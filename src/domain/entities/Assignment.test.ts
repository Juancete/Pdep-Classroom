import { describe, it, expect, vi } from "vitest";
import { IndividualAssignment } from "./IndividualAssignment";
import { GrupalAssignment, GrupoNoAsignadoError } from "./GrupalAssignment";
import type { Assignment } from "./Assignment";
import { Alumno } from "./Alumno";
import type { Grupo } from "./Grupo";

function fakeAlumno(github: string): Alumno {
  return Object.assign(new Alumno(), { githubUsername: github });
}

function fakeGrupo(id: string, usernames: string[]): Grupo {
  return {
    id,
    nombreNormalizado: `nombre-${id}`,
    alumnos: { getItems: () => usernames.map(fakeAlumno) },
    usernamesDeMiembros: () => usernames,
    usernamesCanonicos: () => usernames.map(Alumno.normalizarUsername),
  } as unknown as Grupo;
}

describe("IndividualAssignment", () => {
  it("la etiqueta de totales es 'Alumnos'", () => {
    expect(new IndividualAssignment().etiquetaTotales()).toBe("Alumnos");
  });

  it("totalEsperado cuenta todos los alumnos del curso", async () => {
    const individual = new IndividualAssignment();
    const alumnos = [fakeAlumno("ana"), fakeAlumno("bob"), fakeAlumno("cora")];
    const total = await individual.totalEsperado({
      getAlumnosDelCurso: async () => alumnos,
      getGruposDeAssignment: vi.fn(),
    });
    expect(total).toBe(3);
  });

  it("totalEsperado no consulta grupos (no le aplican al individual)", async () => {
    const individual = new IndividualAssignment();
    const getGrupos = vi.fn();
    await individual.totalEsperado({
      getAlumnosDelCurso: async () => [],
      getGruposDeAssignment: getGrupos,
    });
    expect(getGrupos).not.toHaveBeenCalled();
  });

  it("resolverParticipantesPara devuelve solo al usuario que acepta", async () => {
    const individual = new IndividualAssignment();
    const participantes = await individual.resolverParticipantesPara({ githubUsername: "ana" });
    expect(participantes.usernames).toEqual(["ana"]);
    expect(participantes.grupoId).toBeUndefined();
  });

  it("resolverParticipantesPara ignora la lambda de buscar grupo", async () => {
    // Se tipea como Assignment (contrato base) para poder pasar el segundo argumento
    // y verificar que la implementación individual no lo invoca.
    const individual: Assignment = new IndividualAssignment();
    const buscar = vi.fn();
    await individual.resolverParticipantesPara({ githubUsername: "ana" }, buscar);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("requiereSeleccionDeGrupo siempre devuelve false", () => {
    const individual = new IndividualAssignment();
    expect(individual.requiereSeleccionDeGrupo({ isAdmin: false }, null)).toBe(false);
    expect(individual.requiereSeleccionDeGrupo({ isAdmin: false }, fakeGrupo("g1", []))).toBe(false);
    expect(individual.requiereSeleccionDeGrupo({ isAdmin: true }, null)).toBe(false);
  });

  it("alumnosSinGrupo siempre devuelve arreglo vacío", () => {
    const individual = new IndividualAssignment();
    expect(individual.alumnosSinGrupo([fakeAlumno("ana")], [])).toEqual([]);
  });

  it("extraFormDefaults devuelve objeto vacío", () => {
    expect(new IndividualAssignment().extraFormDefaults()).toEqual({});
  });
});

describe("GrupalAssignment", () => {
  function nuevoGrupal(): GrupalAssignment {
    const grupal = new GrupalAssignment();
    grupal.id = "a1";
    grupal.maxIntegrantes = 4;
    return grupal;
  }

  it("la etiqueta de totales es 'Grupos'", () => {
    expect(nuevoGrupal().etiquetaTotales()).toBe("Grupos");
  });

  it("totalEsperado cuenta los grupos del assignment", async () => {
    const grupal = nuevoGrupal();
    const total = await grupal.totalEsperado({
      getAlumnosDelCurso: vi.fn(),
      getGruposDeAssignment: async (id) => {
        expect(id).toBe("a1");
        return [fakeGrupo("g1", []), fakeGrupo("g2", [])];
      },
    });
    expect(total).toBe(2);
  });

  it("totalEsperado no consulta alumnos del curso (no aplica al grupal)", async () => {
    const grupal = nuevoGrupal();
    const getAlumnos = vi.fn();
    await grupal.totalEsperado({
      getAlumnosDelCurso: getAlumnos,
      getGruposDeAssignment: async () => [],
    });
    expect(getAlumnos).not.toHaveBeenCalled();
  });

  it("resolverParticipantesPara devuelve miembros, id y nombre normalizado", async () => {
    const grupal = nuevoGrupal();
    const buscar = vi.fn().mockResolvedValue(
      fakeGrupo("los-lambdas", ["ana", "bob"])
    );
    const participantes = await grupal.resolverParticipantesPara({ githubUsername: "ana" }, buscar);
    expect(participantes).toEqual({
      usernames: ["ana", "bob"],
      grupoId: "los-lambdas",
      grupoNombreNormalizado: "nombre-los-lambdas",
    });
    expect(buscar).toHaveBeenCalledWith("a1", "ana");
  });

  it("resolverParticipantesPara lanza GrupoNoAsignadoError si el alumno no tiene grupo", async () => {
    const grupal = nuevoGrupal();
    const buscar = vi.fn().mockResolvedValue(null);
    await expect(
      grupal.resolverParticipantesPara({ githubUsername: "forastero" }, buscar)
    ).rejects.toBeInstanceOf(GrupoNoAsignadoError);
  });

  it("el error incluye el assignmentId y el githubUsername para diagnóstico", async () => {
    const grupal = nuevoGrupal();
    const buscar = vi.fn().mockResolvedValue(null);
    try {
      await grupal.resolverParticipantesPara({ githubUsername: "forastero" }, buscar);
      expect.fail("debería haber lanzado GrupoNoAsignadoError");
    } catch (error) {
      expect(error).toBeInstanceOf(GrupoNoAsignadoError);
      const err = error as GrupoNoAsignadoError;
      expect(err.assignmentId).toBe("a1");
      expect(err.githubUsername).toBe("forastero");
    }
  });

  it("requiereSeleccionDeGrupo devuelve true cuando no es admin y no tiene grupo", () => {
    expect(nuevoGrupal().requiereSeleccionDeGrupo({ isAdmin: false }, null)).toBe(true);
  });

  it("requiereSeleccionDeGrupo devuelve false cuando ya tiene grupo", () => {
    expect(nuevoGrupal().requiereSeleccionDeGrupo({ isAdmin: false }, fakeGrupo("g1", []))).toBe(false);
  });

  it("requiereSeleccionDeGrupo devuelve false cuando es admin", () => {
    expect(nuevoGrupal().requiereSeleccionDeGrupo({ isAdmin: true }, null)).toBe(false);
  });

  it("alumnosSinGrupo devuelve los alumnos no asignados a ningún grupo", () => {
    const alumnos = [fakeAlumno("ana"), fakeAlumno("bob"), fakeAlumno("carol")];
    const grupos = [fakeGrupo("g1", ["ana"])];
    const sinGrupo = nuevoGrupal().alumnosSinGrupo(alumnos, grupos);
    expect(sinGrupo.map((alumno) => alumno.githubUsername)).toEqual(["bob", "carol"]);
  });

  it("alumnosSinGrupo devuelve vacío cuando todos tienen grupo", () => {
    const alumnos = [fakeAlumno("ANA"), fakeAlumno("BOB")];
    const grupos = [fakeGrupo("g1", ["ana", "bob"])];
    expect(nuevoGrupal().alumnosSinGrupo(alumnos, grupos)).toHaveLength(0);
  });

  it("alumnosSinGrupo es case-insensitive", () => {
    const alumnos = [fakeAlumno("AnaGarcia")];
    const grupos = [fakeGrupo("g1", ["anagarcia"])];
    expect(nuevoGrupal().alumnosSinGrupo(alumnos, grupos)).toHaveLength(0);
  });

  it("extraFormDefaults incluye maxIntegrantes", () => {
    expect(nuevoGrupal().extraFormDefaults()).toEqual({ maxIntegrantes: 4 });
  });
});

describe("Assignment.nombreDelTemplate", () => {
  it("devuelve solo el nombre cuando el templateRepo incluye organización", () => {
    const individual = new IndividualAssignment();
    individual.templateRepo = "pdep-unahur/kata-funcional";
    expect(individual.nombreDelTemplate()).toBe("kata-funcional");
  });

  it("devuelve el templateRepo completo cuando no hay slash", () => {
    const individual = new IndividualAssignment();
    individual.templateRepo = "kata-funcional";
    expect(individual.nombreDelTemplate()).toBe("kata-funcional");
  });
});

describe("Assignment.cargarGruposCon", () => {
  it("IndividualAssignment devuelve [] sin llamar al loader", async () => {
    const loader = vi.fn();
    const individual = new IndividualAssignment();
    const result = await individual.cargarGruposCon(loader);
    expect(result).toEqual([]);
    expect(loader).not.toHaveBeenCalled();
  });

  it("GrupalAssignment llama al loader con su id y devuelve el resultado", async () => {
    const grupal = new GrupalAssignment();
    grupal.id = "a1";
    const grupos = [fakeGrupo("g1", ["ana"])];
    const loader = vi.fn().mockResolvedValue(grupos);
    const result = await grupal.cargarGruposCon(loader);
    expect(loader).toHaveBeenCalledWith("a1");
    expect(result).toBe(grupos);
  });
});

describe("Assignment.aplicarCamposExtra", () => {
  it("IndividualAssignment ignora cualquier campo extra sin lanzar error", () => {
    const individual = new IndividualAssignment();
    expect(() => individual.aplicarCamposExtra({ maxIntegrantes: 5 })).not.toThrow();
    expect(() => individual.aplicarCamposExtra({})).not.toThrow();
  });

  it("GrupalAssignment setea maxIntegrantes cuando viene en los datos", () => {
    const grupal = new GrupalAssignment();
    grupal.maxIntegrantes = 3;
    grupal.aplicarCamposExtra({ maxIntegrantes: 6 });
    expect(grupal.maxIntegrantes).toBe(6);
  });

  it("GrupalAssignment no modifica maxIntegrantes si no viene en los datos", () => {
    const grupal = new GrupalAssignment();
    grupal.maxIntegrantes = 3;
    grupal.aplicarCamposExtra({});
    expect(grupal.maxIntegrantes).toBe(3);
  });
});

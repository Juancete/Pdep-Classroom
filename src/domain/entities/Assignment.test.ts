import { describe, it, expect, vi } from "vitest";
import { IndividualAssignment } from "./IndividualAssignment";
import { GrupalAssignment, GrupoNoAsignadoError } from "./GrupalAssignment";
import type { Alumno } from "./Alumno";
import type { Grupo } from "./Grupo";

function fakeAlumno(github: string): Alumno {
  return { githubUsername: github } as Alumno;
}

function fakeGrupo(id: string, usernames: string[]): Grupo {
  return {
    id,
    alumnos: { getItems: () => usernames.map(fakeAlumno) },
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
    const participantes = await individual.resolverParticipantesPara(
      { githubUsername: "ana" },
      vi.fn()
    );
    expect(participantes.usernames).toEqual(["ana"]);
    expect(participantes.grupoId).toBeUndefined();
  });

  it("resolverParticipantesPara ignora la lambda de buscar grupo", async () => {
    const individual = new IndividualAssignment();
    const buscar = vi.fn();
    await individual.resolverParticipantesPara({ githubUsername: "ana" }, buscar);
    expect(buscar).not.toHaveBeenCalled();
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

  it("resolverParticipantesPara devuelve los usernames del grupo y su id", async () => {
    const grupal = nuevoGrupal();
    const buscar = vi.fn().mockResolvedValue(
      fakeGrupo("los-lambdas", ["ana", "bob"])
    );
    const participantes = await grupal.resolverParticipantesPara({ githubUsername: "ana" }, buscar);
    expect(participantes).toEqual({ usernames: ["ana", "bob"], grupoId: "los-lambdas" });
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
});

import { describe, it, expect } from "vitest";
import { Collection } from "@mikro-orm/core";
import {
  Grupo,
  GrupoLlenoError,
  AlumnoYaEnGrupoDelAssignmentError,
  InscripcionesCerradasError,
  AssignmentNoGrupalError,
} from "./Grupo";
import { GrupalAssignment } from "./GrupalAssignment";
import type { Alumno } from "./Alumno";

function fakeAlumno(github: string): Alumno {
  return {
    id: `id-${github}`,
    githubUsername: github,
  } as Alumno;
}

function nuevoGrupo(maxIntegrantes: number, miembros: Alumno[] = []): Grupo {
  const grupo = new Grupo();
  grupo.id = "g1";
  grupo.nombre = "Los Lambdas";
  grupo.paradigma = "funcional";
  grupo.maxIntegrantes = maxIntegrantes;
  grupo.creadoPor = miembros[0]?.githubUsername ?? "alguien";
  // Reemplazo la Collection real por una mínima testeable: contains() y add().
  // Evita arrastrar el ORM en tests puros de la entidad.
  const items: Alumno[] = [...miembros];
  grupo.alumnos = {
    contains: (alumno: Alumno) => items.some((member) => member.id === alumno.id),
    add: (alumno: Alumno) => items.push(alumno),
    get length() {
      return items.length;
    },
  } as unknown as Collection<Alumno>;
  return grupo;
}

describe("Grupo", () => {
  describe("isOpen", () => {
    it("es true cuando hay menos miembros que el max", () => {
      const grupo = nuevoGrupo(3, [fakeAlumno("ana")]);
      expect(grupo.isOpen()).toBe(true);
    });

    it("es false cuando se alcanza el max", () => {
      const grupo = nuevoGrupo(2, [fakeAlumno("ana"), fakeAlumno("bob")]);
      expect(grupo.isOpen()).toBe(false);
    });
  });

  describe("canJoin", () => {
    it("permite unirse si hay cupo y el alumno no es miembro", () => {
      const grupo = nuevoGrupo(3, [fakeAlumno("ana")]);
      expect(grupo.canJoin(fakeAlumno("bob"))).toBe(true);
    });

    it("rechaza si el alumno ya es miembro", () => {
      const ana = fakeAlumno("ana");
      const grupo = nuevoGrupo(3, [ana]);
      expect(grupo.canJoin(ana)).toBe(false);
    });

    it("rechaza si el grupo está lleno", () => {
      const grupo = nuevoGrupo(2, [fakeAlumno("ana"), fakeAlumno("bob")]);
      expect(grupo.canJoin(fakeAlumno("cora"))).toBe(false);
    });
  });

  describe("addMember", () => {
    it("suma al alumno cuando hay cupo y no es miembro", () => {
      const grupo = nuevoGrupo(3, [fakeAlumno("ana")]);
      const bob = fakeAlumno("bob");
      grupo.addMember(bob);
      expect(grupo.alumnos.contains(bob)).toBe(true);
    });

    it("lanza GrupoLlenoError cuando ya alcanzó el max", () => {
      const grupo = nuevoGrupo(2, [fakeAlumno("ana"), fakeAlumno("bob")]);
      expect(() => grupo.addMember(fakeAlumno("cora"))).toThrow(GrupoLlenoError);
    });

    it("el GrupoLlenoError lleva el grupoId y maxIntegrantes para diagnóstico", () => {
      const grupo = nuevoGrupo(2, [fakeAlumno("ana"), fakeAlumno("bob")]);
      try {
        grupo.addMember(fakeAlumno("cora"));
        expect.fail("debería haber lanzado GrupoLlenoError");
      } catch (error) {
        expect(error).toBeInstanceOf(GrupoLlenoError);
        const lleno = error as GrupoLlenoError;
        expect(lleno.grupoId).toBe("g1");
        expect(lleno.maxIntegrantes).toBe(2);
      }
    });

    it("lanza Error genérico si el alumno ya es miembro (programmer error: el caller debió validar antes)", () => {
      const ana = fakeAlumno("ana");
      const grupo = nuevoGrupo(3, [ana]);
      expect(() => grupo.addMember(ana)).toThrow(/ya es miembro/);
    });
  });
});

describe("GrupalAssignment.aceptaNuevasInscripciones", () => {
  function nuevoGrupal(): GrupalAssignment {
    const grupal = new GrupalAssignment();
    grupal.id = "a1";
    grupal.maxIntegrantes = 3;
    return grupal;
  }

  it("acepta inscripciones por default (flag inicializa false)", () => {
    expect(nuevoGrupal().aceptaNuevasInscripciones()).toBe(true);
  });

  it("rechaza cuando el docente cerró las inscripciones", () => {
    const grupal = nuevoGrupal();
    grupal.inscripcionesCerradas = true;
    expect(grupal.aceptaNuevasInscripciones()).toBe(false);
  });
});

// Smoke test: los errores tipados llevan los datos de diagnóstico esperados
// y el handler HTTP los puede discriminar por `instanceof` o por `name`.
describe("Errores de negocio de inscripción a grupos", () => {
  it("InscripcionesCerradasError lleva el assignmentId", () => {
    const error = new InscripcionesCerradasError("a1");
    expect(error.assignmentId).toBe("a1");
    expect(error.name).toBe("InscripcionesCerradasError");
  });

  it("AlumnoYaEnGrupoDelAssignmentError lleva assignmentId y githubUsername", () => {
    const error = new AlumnoYaEnGrupoDelAssignmentError("a1", "ana");
    expect(error.assignmentId).toBe("a1");
    expect(error.githubUsername).toBe("ana");
    expect(error.name).toBe("AlumnoYaEnGrupoDelAssignmentError");
  });

  it("AssignmentNoGrupalError lleva el assignmentId", () => {
    const error = new AssignmentNoGrupalError("a1");
    expect(error.assignmentId).toBe("a1");
    expect(error.name).toBe("AssignmentNoGrupalError");
  });
});

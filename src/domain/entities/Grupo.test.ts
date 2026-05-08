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
import { Alumno } from "./Alumno";

function fakeAlumno(github: string): Alumno {
  return Object.assign(new Alumno(), {
    id: `id-${github}`,
    githubUsername: github,
  });
}

function nuevoGrupo(maxIntegrantes: number, miembros: Alumno[] = []): Grupo {
  const grupo = new Grupo();
  grupo.id = "g1";
  grupo.nombre = "Los Lambdas";
  grupo.paradigma = "funcional";
  grupo.maxIntegrantes = maxIntegrantes;
  grupo.creadoPor = miembros[0]?.githubUsername ?? "alguien";
  const items: Alumno[] = [...miembros];
  grupo.alumnos = {
    contains: (alumno: Alumno) => items.some((member) => member.id === alumno.id),
    add: (alumno: Alumno) => { items.push(alumno); },
    getItems: () => items,
    get length() { return items.length; },
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

describe("Grupo — predicados de cupo", () => {
  describe("estaLleno", () => {
    it("devuelve false cuando hay cupo disponible", () => {
      const grupo = nuevoGrupo(3, [fakeAlumno("ana")]);
      expect(grupo.estaLleno()).toBe(false);
    });

    it("devuelve true cuando el grupo alcanzó el máximo", () => {
      const grupo = nuevoGrupo(2, [fakeAlumno("ana"), fakeAlumno("bob")]);
      expect(grupo.estaLleno()).toBe(true);
    });
  });

  describe("cantidadMiembros", () => {
    it("devuelve 0 para un grupo vacío", () => {
      const grupo = nuevoGrupo(3);
      expect(grupo.cantidadMiembros()).toBe(0);
    });

    it("devuelve la cantidad de miembros actuales", () => {
      const grupo = nuevoGrupo(3, [fakeAlumno("ana"), fakeAlumno("bob")]);
      expect(grupo.cantidadMiembros()).toBe(2);
    });
  });

  describe("etiquetaCupo", () => {
    it("muestra 'Completo' cuando está lleno", () => {
      const grupo = nuevoGrupo(2, [fakeAlumno("ana"), fakeAlumno("bob")]);
      expect(grupo.etiquetaCupo()).toBe("Completo (2/2)");
    });

    it("muestra 'X/N integrantes' cuando hay cupo", () => {
      const grupo = nuevoGrupo(3, [fakeAlumno("ana")]);
      expect(grupo.etiquetaCupo()).toBe("1/3 integrantes");
    });
  });
});

describe("Grupo — pertenencia", () => {
  describe("contieneA", () => {
    it("devuelve true cuando el username coincide (exacto)", () => {
      const grupo = nuevoGrupo(3, [fakeAlumno("AnaGarcia")]);
      expect(grupo.contieneA("AnaGarcia")).toBe(true);
    });

    it("es case-insensitive", () => {
      const grupo = nuevoGrupo(3, [fakeAlumno("AnaGarcia")]);
      expect(grupo.contieneA("anagarcia")).toBe(true);
      expect(grupo.contieneA("ANAGARCIA")).toBe(true);
    });

    it("devuelve false cuando el username no está en el grupo", () => {
      const grupo = nuevoGrupo(3, [fakeAlumno("ana")]);
      expect(grupo.contieneA("bob")).toBe(false);
    });

    it("devuelve false para un grupo vacío", () => {
      const grupo = nuevoGrupo(3);
      expect(grupo.contieneA("ana")).toBe(false);
    });
  });

  describe("usernamesDeMiembros", () => {
    it("devuelve lista vacía para grupo sin miembros", () => {
      const grupo = nuevoGrupo(3);
      expect(grupo.usernamesDeMiembros()).toEqual([]);
    });

    it("devuelve los githubUsernames de todos los miembros", () => {
      const grupo = nuevoGrupo(3, [fakeAlumno("ana"), fakeAlumno("bob")]);
      expect(grupo.usernamesDeMiembros()).toEqual(["ana", "bob"]);
    });

    it("preserva el casing original almacenado en DB", () => {
      const grupo = nuevoGrupo(2, [fakeAlumno("AnaGarcia")]);
      expect(grupo.usernamesDeMiembros()).toEqual(["AnaGarcia"]);
    });
  });

  describe("usernamesCanonicos", () => {
    it("devuelve lista vacía para grupo sin miembros", () => {
      const grupo = nuevoGrupo(3);
      expect(grupo.usernamesCanonicos()).toEqual([]);
    });

    it("normaliza todos los usernames a minúsculas y sin @", () => {
      const grupo = nuevoGrupo(3, [fakeAlumno("@AnaGarcia"), fakeAlumno("BOB")]);
      expect(grupo.usernamesCanonicos()).toEqual(["anagarcia", "bob"]);
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

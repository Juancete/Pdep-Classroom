import { describe, it, expect } from "vitest";
import { Collection } from "@mikro-orm/core";
import {
  Grupo,
  GrupoLlenoError,
  AlumnoYaEnGrupoDelAssignmentError,
  InscripcionesCerradasError,
  AssignmentNoGrupalError,
  AlumnoNoEsMiembroDelGrupoError,
  GrupoConEntregaError,
} from "./Grupo";
import { MiembroDeGrupo } from "./MiembroDeGrupo";
import { GrupalAssignment } from "./GrupalAssignment";
import { Alumno } from "./Alumno";

function fakeAlumno(github: string): Alumno {
  return Object.assign(new Alumno(), {
    id: `id-${github}`,
    githubUsername: github,
  });
}

// Miembro de test: por default sin `alumno` (como un docente en un grupo
// de demo) — los tests que necesitan el vínculo lo pasan explícito.
function fakeMiembro(githubUsername: string, alumno: Alumno | null = null): MiembroDeGrupo {
  return Object.assign(new MiembroDeGrupo(), {
    id: `miembro-${githubUsername}`,
    githubUsername,
    alumno: alumno ?? undefined,
  });
}

function nuevoGrupo(maxIntegrantes: number, miembrosIniciales: MiembroDeGrupo[] = []): Grupo {
  const grupo = new Grupo();
  grupo.id = "g1";
  grupo.nombre = "Los Lambdas";
  grupo.nombreNormalizado = "los-lambdas";
  grupo.paradigma = "funcional";
  grupo.maxIntegrantes = maxIntegrantes;
  grupo.creadoPor = miembrosIniciales[0]?.githubUsername ?? "alguien";
  grupo.assignment = Object.assign(new GrupalAssignment(), { id: "a1" });
  const items: MiembroDeGrupo[] = [...miembrosIniciales];
  grupo.miembros = {
    contains: (miembro: MiembroDeGrupo) => items.some((item) => item.id === miembro.id),
    add: (miembro: MiembroDeGrupo) => { items.push(miembro); },
    remove: (miembro: MiembroDeGrupo) => {
      const index = items.findIndex((item) => item.id === miembro.id);
      if (index !== -1) items.splice(index, 1);
    },
    getItems: () => items,
    get length() { return items.length; },
  } as unknown as Collection<MiembroDeGrupo>;
  return grupo;
}

describe("Grupo", () => {
  describe("isOpen", () => {
    it("es true cuando hay menos miembros que el max", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("ana")]);
      expect(grupo.isOpen()).toBe(true);
    });

    it("es false cuando se alcanza el max", () => {
      const grupo = nuevoGrupo(2, [fakeMiembro("ana"), fakeMiembro("bob")]);
      expect(grupo.isOpen()).toBe(false);
    });
  });

  describe("agregarMiembro", () => {
    it("suma un miembro cuando hay cupo y no está ya adentro", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("ana")]);
      const bob = fakeAlumno("bob");
      grupo.agregarMiembro(bob.githubUsername, bob);
      expect(grupo.contieneA("bob")).toBe(true);
    });

    it("lanza GrupoLlenoError cuando ya alcanzó el max", () => {
      const grupo = nuevoGrupo(2, [fakeMiembro("ana"), fakeMiembro("bob")]);
      expect(() => grupo.agregarMiembro("cora", fakeAlumno("cora"))).toThrow(GrupoLlenoError);
    });

    it("el GrupoLlenoError lleva el grupoId y maxIntegrantes para diagnóstico", () => {
      const grupo = nuevoGrupo(2, [fakeMiembro("ana"), fakeMiembro("bob")]);
      try {
        grupo.agregarMiembro("cora", fakeAlumno("cora"));
        expect.fail("debería haber lanzado GrupoLlenoError");
      } catch (error) {
        expect(error).toBeInstanceOf(GrupoLlenoError);
        const lleno = error as GrupoLlenoError;
        expect(lleno.grupoId).toBe("g1");
        expect(lleno.maxIntegrantes).toBe(2);
      }
    });

    it("lanza Error genérico si el username ya es miembro (programmer error: el caller debió validar antes)", () => {
      const ana = fakeAlumno("ana");
      const grupo = nuevoGrupo(3, [fakeMiembro("ana", ana)]);
      expect(() => grupo.agregarMiembro("ana", ana)).toThrow(/ya es miembro/);
    });

    it("admite un miembro sin alumno (docente sin fila en Alumno)", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("ana")]);
      const miembro = grupo.agregarMiembro("profe-docente", null);
      expect(miembro.alumno).toBeUndefined();
      expect(grupo.contieneA("profe-docente")).toBe(true);
    });
  });

  describe("quitarMiembro", () => {
    it("quita al miembro del grupo", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("ana"), fakeMiembro("bob")]);
      grupo.quitarMiembro("ana");
      expect(grupo.contieneA("ana")).toBe(false);
    });

    it("no toca a los demás miembros", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("ana"), fakeMiembro("bob")]);
      grupo.quitarMiembro("ana");
      expect(grupo.contieneA("bob")).toBe(true);
    });

    it("deja estaVacio() en true si era el último miembro", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("ana")]);
      grupo.quitarMiembro("ana");
      expect(grupo.estaVacio()).toBe(true);
    });

    it("lanza AlumnoNoEsMiembroDelGrupoError si el username no es miembro", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("ana")]);
      expect(() => grupo.quitarMiembro("forastero")).toThrow(AlumnoNoEsMiembroDelGrupoError);
    });

    it("el AlumnoNoEsMiembroDelGrupoError lleva el grupoId y el githubUsername", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("ana")]);
      try {
        grupo.quitarMiembro("forastero");
        expect.fail("debería haber lanzado AlumnoNoEsMiembroDelGrupoError");
      } catch (error) {
        expect(error).toBeInstanceOf(AlumnoNoEsMiembroDelGrupoError);
        const noMiembro = error as AlumnoNoEsMiembroDelGrupoError;
        expect(noMiembro.grupoId).toBe("g1");
        expect(noMiembro.githubUsername).toBe("forastero");
      }
    });
  });

  describe("estaVacio", () => {
    it("es true para un grupo sin miembros", () => {
      expect(nuevoGrupo(3).estaVacio()).toBe(true);
    });

    it("es false cuando tiene al menos un miembro", () => {
      expect(nuevoGrupo(3, [fakeMiembro("ana")]).estaVacio()).toBe(false);
    });
  });

  // Fase 3 de la auditoría de dominio: antes la UI predecía con
  // `cantidadMiembros() === 1` (sin chequear que el alumno realmente sea
  // miembro) y el repo evaluaba post-remoción con `estaVacio() && !tieneEntrega`.
  describe("quedaraVacioSiSale", () => {
    it("es true si el username es el único integrante", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("ana")]);
      expect(grupo.quedaraVacioSiSale("ana")).toBe(true);
    });

    it("es false si hay más de un integrante", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("ana"), fakeMiembro("bob")]);
      expect(grupo.quedaraVacioSiSale("ana")).toBe(false);
    });

    it("es false si el username no pertenece al grupo (aunque sea el único miembro)", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("ana")]);
      expect(grupo.quedaraVacioSiSale("forastero")).toBe(false);
    });
  });

  describe("seEliminaAlSalir", () => {
    it("es true si el grupo quedó vacío y no tiene entrega", () => {
      const grupo = nuevoGrupo(3);
      expect(grupo.seEliminaAlSalir(false)).toBe(true);
    });

    it("es false si el grupo quedó vacío pero tiene entrega (se preserva como histórico)", () => {
      const grupo = nuevoGrupo(3);
      expect(grupo.seEliminaAlSalir(true)).toBe(false);
    });

    it("es false si el grupo no quedó vacío", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("ana")]);
      expect(grupo.seEliminaAlSalir(false)).toBe(false);
    });
  });

  describe("toResumen", () => {
    it("devuelve el resumen plano que usan las routes de grupos", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("ana"), fakeMiembro("bob")]);
      expect(grupo.toResumen()).toEqual({
        id: "g1",
        nombre: "Los Lambdas",
        paradigma: "funcional",
        maxIntegrantes: 3,
        estaLleno: false,
        miembros: ["ana", "bob"],
        tipoDeIntegrantes: "alumnos",
      });
    });

    it("estaLleno refleja el cupo", () => {
      const grupo = nuevoGrupo(2, [fakeMiembro("ana"), fakeMiembro("bob")]);
      expect(grupo.toResumen().estaLleno).toBe(true);
    });

    it("informa tipoDeIntegrantes cuando es un grupo de docentes", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("profe-docente")]);
      grupo.tipoDeIntegrantes = "docentes";
      expect(grupo.toResumen().tipoDeIntegrantes).toBe("docentes");
    });
  });

  describe("miembroConUsername", () => {
    it("devuelve el miembro cuando el username coincide", () => {
      const miembro = fakeMiembro("AnaGarcia");
      const grupo = nuevoGrupo(3, [miembro]);
      expect(grupo.miembroConUsername("anagarcia")).toBe(miembro);
    });

    it("es case-insensitive", () => {
      const miembro = fakeMiembro("AnaGarcia");
      const grupo = nuevoGrupo(3, [miembro]);
      expect(grupo.miembroConUsername("ANAGARCIA")).toBe(miembro);
    });

    it("devuelve undefined si no está en el grupo", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("ana")]);
      expect(grupo.miembroConUsername("bob")).toBeUndefined();
    });
  });

  describe("admiteIntegrantesDe", () => {
    it("distingue grupos de alumnos y de docentes", () => {
      const grupoDeAlumnos = nuevoGrupo(3);
      expect(grupoDeAlumnos.admiteIntegrantesDe("alumnos")).toBe(true);
      expect(grupoDeAlumnos.admiteIntegrantesDe("docentes")).toBe(false);

      const grupoDeDocentes = nuevoGrupo(3);
      grupoDeDocentes.tipoDeIntegrantes = "docentes";
      expect(grupoDeDocentes.admiteIntegrantesDe("docentes")).toBe(true);
      expect(grupoDeDocentes.admiteIntegrantesDe("alumnos")).toBe(false);
    });
  });

  describe("miembro sin alumno (docente en un grupo de demo)", () => {
    it("cuenta para el cupo y aparece en usernamesDeMiembros", () => {
      const grupo = nuevoGrupo(2, [fakeMiembro("ana")]);
      grupo.agregarMiembro("profe-docente", null);

      expect(grupo.cantidadMiembros()).toBe(2);
      expect(grupo.estaLleno()).toBe(true);
      expect(grupo.usernamesDeMiembros()).toContain("profe-docente");
      expect(grupo.contieneA("profe-docente")).toBe(true);
    });
  });
});

describe("Grupo — predicados de cupo", () => {
  describe("estaLleno", () => {
    it("devuelve false cuando hay cupo disponible", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("ana")]);
      expect(grupo.estaLleno()).toBe(false);
    });

    it("devuelve true cuando el grupo alcanzó el máximo", () => {
      const grupo = nuevoGrupo(2, [fakeMiembro("ana"), fakeMiembro("bob")]);
      expect(grupo.estaLleno()).toBe(true);
    });
  });

  describe("cantidadMiembros", () => {
    it("devuelve 0 para un grupo vacío", () => {
      const grupo = nuevoGrupo(3);
      expect(grupo.cantidadMiembros()).toBe(0);
    });

    it("devuelve la cantidad de miembros actuales", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("ana"), fakeMiembro("bob")]);
      expect(grupo.cantidadMiembros()).toBe(2);
    });
  });

  describe("etiquetaCupo", () => {
    it("muestra 'Completo' cuando está lleno", () => {
      const grupo = nuevoGrupo(2, [fakeMiembro("ana"), fakeMiembro("bob")]);
      expect(grupo.etiquetaCupo()).toBe("Completo (2/2)");
    });

    it("muestra 'X/N integrantes' cuando hay cupo", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("ana")]);
      expect(grupo.etiquetaCupo()).toBe("1/3 integrantes");
    });
  });
});

describe("Grupo — pertenencia", () => {
  describe("contieneA", () => {
    it("devuelve true cuando el username coincide (exacto)", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("AnaGarcia")]);
      expect(grupo.contieneA("AnaGarcia")).toBe(true);
    });

    it("es case-insensitive", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("AnaGarcia")]);
      expect(grupo.contieneA("anagarcia")).toBe(true);
      expect(grupo.contieneA("ANAGARCIA")).toBe(true);
    });

    it("devuelve false cuando el username no está en el grupo", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("ana")]);
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
      const grupo = nuevoGrupo(3, [fakeMiembro("ana"), fakeMiembro("bob")]);
      expect(grupo.usernamesDeMiembros()).toEqual(["ana", "bob"]);
    });

    it("preserva el casing original almacenado en DB", () => {
      const grupo = nuevoGrupo(2, [fakeMiembro("AnaGarcia")]);
      expect(grupo.usernamesDeMiembros()).toEqual(["AnaGarcia"]);
    });
  });

  describe("usernamesCanonicos", () => {
    it("devuelve lista vacía para grupo sin miembros", () => {
      const grupo = nuevoGrupo(3);
      expect(grupo.usernamesCanonicos()).toEqual([]);
    });

    it("normaliza todos los usernames a minúsculas y sin @", () => {
      const grupo = nuevoGrupo(3, [fakeMiembro("@AnaGarcia"), fakeMiembro("BOB")]);
      expect(grupo.usernamesCanonicos()).toEqual(["anagarcia", "bob"]);
    });
  });
});

describe("GrupalAssignment.crearGrupo", () => {
  function nuevoGrupal(): GrupalAssignment {
    const grupal = new GrupalAssignment();
    grupal.id = "a1";
    grupal.slug = "tp1";
    grupal.paradigma = "funcional";
    grupal.maxIntegrantes = 3;
    return grupal;
  }

  it("fija el tipo de integrantes (alumnos por defecto)", () => {
    const grupo = nuevoGrupal().crearGrupo("Los Lambdas", "ana");
    expect(grupo.tipoDeIntegrantes).toBe("alumnos");
  });

  it("permite fijar explícitamente el tipo de integrantes", () => {
    const grupo = nuevoGrupal().crearGrupo("Profes FP", "profe1", "docentes");
    expect(grupo.tipoDeIntegrantes).toBe("docentes");
  });
});

describe("GrupalAssignment.aceptaNuevasInscripciones", () => {
  function nuevoGrupal(): GrupalAssignment {
    const grupal = new GrupalAssignment();
    grupal.id = "a1";
    grupal.maxIntegrantes = 3;
    // Publicado por defecto: aceptar inscripciones requiere que el
    // assignment esté disponible. El test de estado en borrador vive abajo.
    grupal.transicionarA("publicado", { tieneEntregas: false }, "docente1");
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

  it("rechaza mientras el assignment no esté publicado", () => {
    const grupal = new GrupalAssignment();
    grupal.id = "a1";
    grupal.maxIntegrantes = 3;
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

  it("AlumnoNoEsMiembroDelGrupoError lleva grupoId y githubUsername", () => {
    const error = new AlumnoNoEsMiembroDelGrupoError("g1", "forastero");
    expect(error.grupoId).toBe("g1");
    expect(error.githubUsername).toBe("forastero");
    expect(error.name).toBe("AlumnoNoEsMiembroDelGrupoError");
    expect(error.message).toContain("forastero");
  });

  it("GrupoConEntregaError lleva el grupoId", () => {
    const error = new GrupoConEntregaError("g1");
    expect(error.grupoId).toBe("g1");
    expect(error.name).toBe("GrupoConEntregaError");
  });
});

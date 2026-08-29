import { describe, it, expect, vi } from "vitest";
import { IndividualAssignment, AlumnoNoRegistradoError } from "./IndividualAssignment";
import {
  GrupalAssignment,
  GrupoNoAsignadoError,
  GrupoSinNombreNormalizadoError,
} from "./GrupalAssignment";
import type { Assignment } from "./Assignment";
import { Alumno } from "./Alumno";
import type { Grupo } from "./Grupo";
import { TransicionDeEstadoInvalidaError } from "./EstadoAssignment";
import { DOCENTE, ESTUDIANTE } from "./RolDeUsuario";
import {
  AssignmentEstructuraInmutableError,
  AssignmentTipoInmutableError,
  AssignmentNoGrupalError,
} from "./Assignment";

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
    const participantes = await individual.resolverParticipantesPara(
      { githubUsername: "ana" },
      vi.fn(),
      fakeAlumno("ana")
    );
    expect(participantes.usernames).toEqual(["ana"]);
    expect(participantes.grupoId).toBeUndefined();
  });

  it("resolverParticipantesPara ignora la lambda de buscar grupo", async () => {
    // Se tipea como Assignment (contrato base) para poder pasar el segundo argumento
    // y verificar que la implementación individual no lo invoca.
    const individual: Assignment = new IndividualAssignment();
    const buscar = vi.fn();
    await individual.resolverParticipantesPara({ githubUsername: "ana" }, buscar, fakeAlumno("ana"));
    expect(buscar).not.toHaveBeenCalled();
  });

  // Fase 3 de la auditoría de dominio: antes este chequeo era
  // `if (!grupoId && !alumno) throw AlumnoNoRegistradoError` en
  // `aceptarAssignment.ts`, un branch por tipo fuera del dominio.
  it("resolverParticipantesPara lanza AlumnoNoRegistradoError si el alumno no está registrado", async () => {
    const individual = new IndividualAssignment();
    await expect(
      individual.resolverParticipantesPara({ githubUsername: "forastero" }, vi.fn(), null)
    ).rejects.toBeInstanceOf(AlumnoNoRegistradoError);
  });

  it("requiereSeleccionDeGrupo siempre devuelve false", () => {
    const individual = new IndividualAssignment();
    expect(individual.requiereSeleccionDeGrupo({ rol: ESTUDIANTE }, null)).toBe(false);
    expect(individual.requiereSeleccionDeGrupo({ rol: ESTUDIANTE }, fakeGrupo("g1", []))).toBe(false);
    expect(individual.requiereSeleccionDeGrupo({ rol: DOCENTE }, null)).toBe(false);
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
    const participantes = await grupal.resolverParticipantesPara({ githubUsername: "ana" }, buscar, null);
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
      grupal.resolverParticipantesPara({ githubUsername: "forastero" }, buscar, null)
    ).rejects.toBeInstanceOf(GrupoNoAsignadoError);
  });

  it("el error incluye el assignmentId y el githubUsername para diagnóstico", async () => {
    const grupal = nuevoGrupal();
    const buscar = vi.fn().mockResolvedValue(null);
    try {
      await grupal.resolverParticipantesPara({ githubUsername: "forastero" }, buscar, null);
      expect.fail("debería haber lanzado GrupoNoAsignadoError");
    } catch (error) {
      expect(error).toBeInstanceOf(GrupoNoAsignadoError);
      const err = error as GrupoNoAsignadoError;
      expect(err.assignmentId).toBe("a1");
      expect(err.githubUsername).toBe("forastero");
    }
  });

  it("requiereSeleccionDeGrupo devuelve true cuando no es admin y no tiene grupo", () => {
    expect(nuevoGrupal().requiereSeleccionDeGrupo({ rol: ESTUDIANTE }, null)).toBe(true);
  });

  it("requiereSeleccionDeGrupo devuelve false cuando ya tiene grupo", () => {
    expect(nuevoGrupal().requiereSeleccionDeGrupo({ rol: ESTUDIANTE }, fakeGrupo("g1", []))).toBe(false);
  });

  it("requiereSeleccionDeGrupo devuelve false cuando es admin", () => {
    expect(nuevoGrupal().requiereSeleccionDeGrupo({ rol: DOCENTE }, null)).toBe(false);
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

// Fase 3 de la auditoría de dominio: antes vivía como una rama
// `grupoId ? buildRepoName({..grupoNombreNormalizado}) : buildRepoName({..githubUsername})`
// en `aceptarAssignment.ts`.
describe("Assignment.nombreDeRepoPara", () => {
  it("individual: usa el slug y el username del único participante", () => {
    const individual = new IndividualAssignment();
    individual.slug = "kata-funcional";
    expect(individual.nombreDeRepoPara({ usernames: ["ana"] })).toBe(
      "kata-funcional-ana"
    );
  });

  it("grupal: usa el slug y el nombre normalizado del grupo", () => {
    const grupal = new GrupalAssignment();
    grupal.slug = "tp-objetos";
    expect(
      grupal.nombreDeRepoPara({
        usernames: ["ana", "bob"],
        grupoId: "g1",
        grupoNombreNormalizado: "los-lambdas",
      })
    ).toBe("tp-objetos-los-lambdas");
  });

  it("grupal: lanza GrupoSinNombreNormalizadoError si falta el nombre normalizado", () => {
    const grupal = new GrupalAssignment();
    grupal.slug = "tp-objetos";
    expect(() =>
      grupal.nombreDeRepoPara({ usernames: ["ana"] })
    ).toThrow(GrupoSinNombreNormalizadoError);
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

describe("Assignment.comoGrupal / exigirGrupal", () => {
  it("GrupalAssignment.comoGrupal devuelve la misma instancia", () => {
    const grupal = new GrupalAssignment();
    expect(grupal.comoGrupal()).toBe(grupal);
  });

  it("IndividualAssignment.comoGrupal devuelve null", () => {
    const individual = new IndividualAssignment();
    expect(individual.comoGrupal()).toBeNull();
  });

  it("GrupalAssignment.exigirGrupal devuelve la misma instancia", () => {
    const grupal = new GrupalAssignment();
    expect(grupal.exigirGrupal()).toBe(grupal);
  });

  it("IndividualAssignment.exigirGrupal lanza AssignmentNoGrupalError con el id del assignment", () => {
    const individual = new IndividualAssignment();
    individual.id = "a1";
    expect(() => individual.exigirGrupal()).toThrow(AssignmentNoGrupalError);
    try {
      individual.exigirGrupal();
      throw new Error("no debería llegar acá");
    } catch (error) {
      expect(error).toBeInstanceOf(AssignmentNoGrupalError);
      expect((error as AssignmentNoGrupalError).assignmentId).toBe("a1");
    }
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

describe("Assignment — ciclo de vida", () => {
  it("nace en borrador, no visible y sin acciones habilitadas", () => {
    const individual = new IndividualAssignment();
    expect(individual.estadoNombre).toBe("borrador");
    expect(individual.esVisibleParaAlumno(false)).toBe(false);
    expect(individual.esVisibleParaAlumno(true)).toBe(false);
    expect(individual.permiteAccionesDeAlumno()).toBe(false);
  });

  it("publicar sella publicadoEn y publicadoPor", () => {
    const individual = new IndividualAssignment();
    individual.id = "a1";
    individual.transicionarA("publicado", { tieneEntregas: false }, "docente1");
    expect(individual.estadoNombre).toBe("publicado");
    expect(individual.publicadoPor).toBe("docente1");
    expect(individual.publicadoEn).toBeInstanceOf(Date);
    expect(individual.esVisibleParaAlumno(false)).toBe(true);
    expect(individual.permiteAccionesDeAlumno()).toBe(true);
  });

  it("publicar un assignment ya publicado no resella la auditoría", () => {
    const individual = new IndividualAssignment();
    individual.id = "a1";
    individual.transicionarA("publicado", { tieneEntregas: false }, "docente1");
    const publicadoEnOriginal = individual.publicadoEn;

    individual.transicionarA("publicado", { tieneEntregas: false }, "docente2");

    expect(individual.publicadoPor).toBe("docente1");
    expect(individual.publicadoEn).toBe(publicadoEnOriginal);
  });

  it("despublicar sin entregas vuelve a borrador", () => {
    const individual = new IndividualAssignment();
    individual.id = "a1";
    individual.transicionarA("publicado", { tieneEntregas: false }, "docente1");
    individual.transicionarA("borrador", { tieneEntregas: false }, "docente1");
    expect(individual.estadoNombre).toBe("borrador");
  });

  it("despublicar con entregas lanza TransicionDeEstadoInvalidaError", () => {
    const individual = new IndividualAssignment();
    individual.id = "a1";
    individual.transicionarA("publicado", { tieneEntregas: false }, "docente1");
    expect(() =>
      individual.transicionarA("borrador", { tieneEntregas: true }, "docente1")
    ).toThrow(TransicionDeEstadoInvalidaError);
    expect(individual.estadoNombre).toBe("publicado");
  });

  it("archivar sella archivadoEn y archivadoPor, y solo es visible con entrega", () => {
    const individual = new IndividualAssignment();
    individual.id = "a1";
    individual.transicionarA("publicado", { tieneEntregas: false }, "docente1");
    individual.transicionarA("archivado", { tieneEntregas: true }, "docente1");
    expect(individual.estadoNombre).toBe("archivado");
    expect(individual.archivadoPor).toBe("docente1");
    expect(individual.archivadoEn).toBeInstanceOf(Date);
    expect(individual.esVisibleParaAlumno(true)).toBe(true);
    expect(individual.esVisibleParaAlumno(false)).toBe(false);
    expect(individual.permiteAccionesDeAlumno()).toBe(false);
  });

  it("un archivado puede volver a publicarse pero no a borrador", () => {
    const individual = new IndividualAssignment();
    individual.id = "a1";
    individual.transicionarA("publicado", { tieneEntregas: false }, "docente1");
    individual.transicionarA("archivado", { tieneEntregas: false }, "docente1");

    expect(() =>
      individual.transicionarA("borrador", { tieneEntregas: false }, "docente1")
    ).toThrow(TransicionDeEstadoInvalidaError);

    individual.transicionarA("publicado", { tieneEntregas: false }, "docente1");
    expect(individual.estadoNombre).toBe("publicado");
  });

  it("GrupalAssignment.aceptaNuevasInscripciones exige estado publicado además de inscripciones abiertas", () => {
    const grupal = new GrupalAssignment();
    grupal.id = "a1";
    expect(grupal.aceptaNuevasInscripciones()).toBe(false); // borrador

    grupal.transicionarA("publicado", { tieneEntregas: false }, "docente1");
    expect(grupal.aceptaNuevasInscripciones()).toBe(true);

    grupal.inscripcionesCerradas = true;
    expect(grupal.aceptaNuevasInscripciones()).toBe(false);

    grupal.inscripcionesCerradas = false;
    grupal.transicionarA("archivado", { tieneEntregas: false }, "docente1");
    expect(grupal.aceptaNuevasInscripciones()).toBe(false);
  });
});

// B4 de la auditoría de dominio: `AssignmentRepository.deleteAssignment`
// exigía borrador + 0 entregas + 0 grupos, pero el botón del panel admin
// sólo chequeaba borrador + 0 entregas — ofrecía un borrado que el server
// rechazaba. `razonNoEliminable`/`puedeEliminarse` son ahora la única fuente
// para las dos superficies.
describe("Assignment.puedeEliminarse / razonNoEliminable", () => {
  it("un borrador sin entregas ni grupos puede eliminarse", () => {
    const individual = new IndividualAssignment();
    individual.id = "a1";

    expect(individual.razonNoEliminable({ tieneEntregas: false, tieneGrupos: false })).toBeNull();
    expect(individual.puedeEliminarse({ tieneEntregas: false, tieneGrupos: false })).toBe(true);
  });

  it("un assignment publicado o archivado no puede eliminarse aunque no tenga entregas ni grupos", () => {
    const individual = new IndividualAssignment();
    individual.id = "a1";
    individual.transicionarA("publicado", { tieneEntregas: false }, "docente1");

    expect(individual.razonNoEliminable({ tieneEntregas: false, tieneGrupos: false })).toBe("estado");
    expect(individual.puedeEliminarse({ tieneEntregas: false, tieneGrupos: false })).toBe(false);
  });

  it("un borrador con entregas no puede eliminarse", () => {
    const individual = new IndividualAssignment();
    individual.id = "a1";

    expect(individual.razonNoEliminable({ tieneEntregas: true, tieneGrupos: false })).toBe("entregas");
  });

  // Éste es exactamente el caso que antes divergía: la UI sólo miraba
  // entregasCounts, así que un grupal en borrador con grupos pero sin
  // entregas mostraba el botón de borrar aunque el server lo iba a rechazar.
  it("un grupal en borrador con grupos pero sin entregas no puede eliminarse", () => {
    const grupal = new GrupalAssignment();
    grupal.id = "a1";

    expect(grupal.razonNoEliminable({ tieneEntregas: false, tieneGrupos: true })).toBe("grupos");
    expect(grupal.puedeEliminarse({ tieneEntregas: false, tieneGrupos: true })).toBe(false);
  });
});

// Fase 3 de la auditoría de dominio: antes esta regla vivía en
// `AssignmentRepository.updateAssignment` con un `instanceof GrupalAssignment`
// para el caso de `maxIntegrantes` — `camposEstructuralesQueCambian` lo
// reemplaza (Individual: `[]`, Grupal: chequea `maxIntegrantes`).
describe("Assignment.actualizarEstructura", () => {
  function nuevoIndividualBorrador(): IndividualAssignment {
    const assignment = new IndividualAssignment();
    assignment.id = "a1";
    assignment.titulo = "Kata Funcional";
    assignment.slug = "kata-funcional";
    assignment.templateRepo = "kata-template";
    assignment.paradigma = "funcional";
    return assignment;
  }

  it("en borrador permite cambiar campos estructurales libremente", () => {
    const assignment = nuevoIndividualBorrador();

    assignment.actualizarEstructura({
      titulo: "Kata Funcional v2",
      slug: "kata-funcional-v2",
      templateRepo: "otro-template",
      paradigma: "logico",
    });

    expect(assignment.titulo).toBe("Kata Funcional v2");
    expect(assignment.slug).toBe("kata-funcional-v2");
    expect(assignment.templateRepo).toBe("otro-template");
    expect(assignment.paradigma).toBe("logico");
  });

  it("título/descripción/deadline se pueden editar en cualquier estado", () => {
    const assignment = nuevoIndividualBorrador();
    assignment.transicionarA("publicado", { tieneEntregas: false }, "docente1");

    assignment.actualizarEstructura({
      titulo: "Nuevo título",
      descripcion: "Nueva descripción",
      deadline: "2026-12-31",
    });

    expect(assignment.titulo).toBe("Nuevo título");
    expect(assignment.descripcion).toBe("Nueva descripción");
    expect(assignment.deadline).toEqual(new Date("2026-12-31"));
  });

  it("publicado rechaza cambiar el slug", () => {
    const assignment = nuevoIndividualBorrador();
    assignment.transicionarA("publicado", { tieneEntregas: false }, "docente1");

    expect(() => assignment.actualizarEstructura({ slug: "otro-slug" })).toThrow(
      AssignmentEstructuraInmutableError
    );
    expect(assignment.slug).toBe("kata-funcional");
  });

  it("publicado rechaza cambiar el template y el paradigma, listando ambos campos", () => {
    const assignment = nuevoIndividualBorrador();
    assignment.transicionarA("publicado", { tieneEntregas: false }, "docente1");

    try {
      assignment.actualizarEstructura({ templateRepo: "otro", paradigma: "objetos" });
      expect.fail("debería haber lanzado AssignmentEstructuraInmutableError");
    } catch (error) {
      expect(error).toBeInstanceOf(AssignmentEstructuraInmutableError);
      expect((error as AssignmentEstructuraInmutableError).campos).toEqual([
        "el template",
        "el paradigma",
      ]);
    }
  });

  it("el tipo nunca puede cambiar — en borrador lanza el error específico", () => {
    const assignment = nuevoIndividualBorrador();

    expect(() => assignment.actualizarEstructura({ tipo: "grupal" })).toThrow(
      AssignmentTipoInmutableError
    );
  });

  it("el tipo nunca puede cambiar — publicado lanza el error genérico con 'el tipo'", () => {
    const assignment = nuevoIndividualBorrador();
    assignment.transicionarA("publicado", { tieneEntregas: false }, "docente1");

    try {
      assignment.actualizarEstructura({ tipo: "grupal" });
      expect.fail("debería haber lanzado AssignmentEstructuraInmutableError");
    } catch (error) {
      expect(error).toBeInstanceOf(AssignmentEstructuraInmutableError);
      expect(error).not.toBeInstanceOf(AssignmentTipoInmutableError);
      expect((error as AssignmentEstructuraInmutableError).campos).toEqual(["el tipo"]);
    }
  });

  it("publicado sin cambios estructurales no lanza nada", () => {
    const assignment = nuevoIndividualBorrador();
    assignment.transicionarA("publicado", { tieneEntregas: false }, "docente1");

    expect(() =>
      assignment.actualizarEstructura({ slug: "kata-funcional", titulo: "Otro" })
    ).not.toThrow();
  });

  it("el slug resuelto a partir del título cuenta como cambio estructural", () => {
    const assignment = nuevoIndividualBorrador();
    assignment.transicionarA("publicado", { tieneEntregas: false }, "docente1");

    // slug vacío ⇒ se deriva del título nuevo, que difiere del slug actual.
    expect(() =>
      assignment.actualizarEstructura({ slug: "", titulo: "Kata Distinta" })
    ).toThrow(AssignmentEstructuraInmutableError);
  });

  it("grupal en borrador puede cambiar maxIntegrantes", () => {
    const grupal = new GrupalAssignment();
    grupal.id = "a2";
    grupal.titulo = "TP Objetos";
    grupal.slug = "tp-objetos";
    grupal.templateRepo = "tp-template";
    grupal.paradigma = "objetos";
    grupal.maxIntegrantes = 3;

    grupal.actualizarEstructura({ maxIntegrantes: 5 });

    expect(grupal.maxIntegrantes).toBe(5);
  });

  it("grupal publicado rechaza cambiar maxIntegrantes", () => {
    const grupal = new GrupalAssignment();
    grupal.id = "a2";
    grupal.titulo = "TP Objetos";
    grupal.slug = "tp-objetos";
    grupal.templateRepo = "tp-template";
    grupal.paradigma = "objetos";
    grupal.maxIntegrantes = 3;
    grupal.transicionarA("publicado", { tieneEntregas: false }, "docente1");

    try {
      grupal.actualizarEstructura({ maxIntegrantes: 5 });
      expect.fail("debería haber lanzado AssignmentEstructuraInmutableError");
    } catch (error) {
      expect(error).toBeInstanceOf(AssignmentEstructuraInmutableError);
      expect((error as AssignmentEstructuraInmutableError).campos).toEqual([
        "el máximo de integrantes",
      ]);
    }
    expect(grupal.maxIntegrantes).toBe(3);
  });

  it("individual publicado ignora maxIntegrantes (camposEstructuralesQueCambian devuelve [])", () => {
    const assignment = nuevoIndividualBorrador();
    assignment.transicionarA("publicado", { tieneEntregas: false }, "docente1");

    expect(() =>
      assignment.actualizarEstructura({ maxIntegrantes: 10 })
    ).not.toThrow();
  });
});

import { describe, it, expect, vi } from "vitest";
import {
  RolDeUsuario,
  DOCENTE,
  ESTUDIANTE,
  RESPONSABLE,
  resolverRol,
  AccesoAssignmentProhibidoError,
} from "./RolDeUsuario";
import { AssignmentNoDisponibleError } from "./Assignment";
import { GrupalAssignment } from "./GrupalAssignment";
import { Grupo, InscripcionesCerradasError, GrupoConEntregaError } from "./Grupo";
import { IndividualAssignment } from "./IndividualAssignment";
import { Alumno } from "./Alumno";
import { Comision } from "./Comision";

function fakeComision(id = "c1"): Comision {
  const comision = new Comision(2026, "sheet-test");
  comision.id = id;
  return comision;
}

function fakeAlumno(comisionId = "c1"): Alumno {
  return Object.assign(new Alumno(), {
    id: "alumno-1",
    githubUsername: "ana",
    comision: fakeComision(comisionId),
  });
}

function fakeAssignmentPublicado(comisionId: string | null = "c1"): IndividualAssignment {
  const assignment = new IndividualAssignment();
  assignment.id = "a1";
  assignment.comision = comisionId ? fakeComision(comisionId) : undefined;
  assignment.transicionarA("publicado", { tieneEntregas: false }, "docente1");
  return assignment;
}

function fakeAssignmentBorrador(comisionId: string | null = "c1"): IndividualAssignment {
  const assignment = new IndividualAssignment();
  assignment.id = "a1";
  assignment.comision = comisionId ? fakeComision(comisionId) : undefined;
  return assignment;
}

function fakeGrupal(overrides: Partial<GrupalAssignment> = {}): GrupalAssignment {
  const grupal = new GrupalAssignment();
  grupal.id = "a1";
  grupal.maxIntegrantes = 3;
  grupal.comision = fakeComision();
  grupal.inscripcionesCerradas = false;
  grupal.transicionarA("publicado", { tieneEntregas: false }, "docente1");
  Object.assign(grupal, overrides);
  return grupal;
}

function fakeGrupo(id = "g1"): Grupo {
  const grupo = new Grupo();
  grupo.id = id;
  grupo.nombre = "Los Lambdas";
  grupo.nombreNormalizado = "los-lambdas";
  return grupo;
}

describe("Estudiante.autorizarAccesoAssignment", () => {
  it("permite al alumno de la misma comisión", () => {
    expect(() =>
      ESTUDIANTE.autorizarAccesoAssignment(fakeAlumno("c1"), fakeAssignmentPublicado("c1"))
    ).not.toThrow();
  });

  it("rechaza al alumno de otra comisión", () => {
    expect(() =>
      ESTUDIANTE.autorizarAccesoAssignment(fakeAlumno("c2"), fakeAssignmentPublicado("c1"))
    ).toThrow(AccesoAssignmentProhibidoError);
  });

  it("rechaza sin alumno registrado", () => {
    expect(() =>
      ESTUDIANTE.autorizarAccesoAssignment(null, fakeAssignmentPublicado("c1"))
    ).toThrow(AccesoAssignmentProhibidoError);
  });

  it("rechaza assignments históricos sin comisión", () => {
    expect(() =>
      ESTUDIANTE.autorizarAccesoAssignment(fakeAlumno("c1"), fakeAssignmentPublicado(null))
    ).toThrow(AccesoAssignmentProhibidoError);
  });
});

describe("Docente.autorizarAccesoAssignment", () => {
  it("permite acceso global, sin alumno y sin comisión", () => {
    expect(() =>
      DOCENTE.autorizarAccesoAssignment(null, fakeAssignmentPublicado(null))
    ).not.toThrow();
  });
});

describe("Estudiante.autorizarAccionSobreAssignment", () => {
  it("permite sobre un assignment publicado de la comisión", () => {
    expect(() =>
      ESTUDIANTE.autorizarAccionSobreAssignment(fakeAlumno("c1"), fakeAssignmentPublicado("c1"))
    ).not.toThrow();
  });

  it("rechaza sobre un assignment en borrador", () => {
    expect(() =>
      ESTUDIANTE.autorizarAccionSobreAssignment(fakeAlumno("c1"), fakeAssignmentBorrador("c1"))
    ).toThrow(AssignmentNoDisponibleError);
  });

  it("prioriza el rechazo por comisión sobre el de estado", () => {
    expect(() =>
      ESTUDIANTE.autorizarAccionSobreAssignment(fakeAlumno("c2"), fakeAssignmentPublicado("c1"))
    ).toThrow(AccesoAssignmentProhibidoError);
  });
});

describe("Docente.autorizarAccionSobreAssignment", () => {
  it("permite actuar sobre un assignment en borrador", () => {
    expect(() =>
      DOCENTE.autorizarAccionSobreAssignment(null, fakeAssignmentBorrador("c1"))
    ).not.toThrow();
  });
});

describe("puedeAdministrar", () => {
  it("Docente tiene alcance administrativo", () => {
    expect(DOCENTE.puedeAdministrar()).toBe(true);
  });

  it("Estudiante no tiene alcance administrativo", () => {
    expect(ESTUDIANTE.puedeAdministrar()).toBe(false);
  });

  it("Responsable también tiene alcance administrativo (hereda de Docente)", () => {
    expect(RESPONSABLE.puedeAdministrar()).toBe(true);
  });
});

describe("puedeGestionarDocentes", () => {
  it("sólo el Responsable puede gestionar docentes", () => {
    expect(RESPONSABLE.puedeGestionarDocentes()).toBe(true);
    expect(DOCENTE.puedeGestionarDocentes()).toBe(false);
    expect(ESTUDIANTE.puedeGestionarDocentes()).toBe(false);
  });
});

describe("navegación por rol", () => {
  it("Docente ve las secciones de admin y termina en Mis TPs", () => {
    const items = DOCENTE.itemsDeNavegacion();
    expect(items.map((item) => item.href)).toEqual([
      "/admin/assignments",
      "/admin/grupos",
      "/admin/comisiones",
      "/admin/alumnos",
      "/admin/operaciones",
      "/dashboard",
    ]);
    expect(items.find((item) => item.href === "/admin/operaciones")?.label).toBe(
      "Diagnóstico"
    );
    expect(items.at(-1)?.label).toBe("Mis TPs");
  });

  it("Estudiante sólo ve Mis TPs", () => {
    expect(ESTUDIANTE.itemsDeNavegacion()).toEqual([{ href: "/dashboard", label: "Mis TPs" }]);
  });

  it("Responsable ve las mismas secciones que Docente más Docentes, y termina en Mis TPs", () => {
    const items = RESPONSABLE.itemsDeNavegacion();
    expect(items.map((item) => item.href)).toEqual([
      "/admin/assignments",
      "/admin/grupos",
      "/admin/comisiones",
      "/admin/alumnos",
      "/admin/operaciones",
      "/admin/docentes",
      "/dashboard",
    ]);
    expect(items.find((item) => item.href === "/admin/docentes")?.label).toBe("Docentes");
  });

  it("solo el Estudiante ve el banner de sincronización", () => {
    expect(ESTUDIANTE.veBannerDeSincronizacion()).toBe(true);
    expect(DOCENTE.veBannerDeSincronizacion()).toBe(false);
    expect(RESPONSABLE.veBannerDeSincronizacion()).toBe(false);
  });
});

describe("rutaDeInicio", () => {
  it("Estudiante aterriza en /dashboard", () => {
    expect(ESTUDIANTE.rutaDeInicio()).toBe("/dashboard");
  });

  it("Docente aterriza en /admin/assignments", () => {
    expect(DOCENTE.rutaDeInicio()).toBe("/admin/assignments");
  });

  it("Responsable hereda la ruta de inicio del Docente", () => {
    expect(RESPONSABLE.rutaDeInicio()).toBe("/admin/assignments");
  });

  it("la ruta de inicio de cada rol es el primer ítem de su navegación", () => {
    for (const rol of [DOCENTE, ESTUDIANTE, RESPONSABLE]) {
      expect(rol.itemsDeNavegacion()[0]?.href).toBe(rol.rutaDeInicio());
    }
  });
});

describe("exigeRegistroDeAlumno", () => {
  it("sólo el Estudiante exige registro confirmado para Mis TPs", () => {
    expect(ESTUDIANTE.exigeRegistroDeAlumno()).toBe(true);
    expect(DOCENTE.exigeRegistroDeAlumno()).toBe(false);
    expect(RESPONSABLE.exigeRegistroDeAlumno()).toBe(false);
  });
});

describe("assignmentsParaMisTps", () => {
  it("Docente pide todos los assignments sin mirar la comisión activa", async () => {
    const todos = vi.fn().mockResolvedValue([fakeAssignmentPublicado()]);
    const deComision = vi.fn();

    const assignments = await DOCENTE.assignmentsParaMisTps({ todos, deComision }, "c1");

    expect(assignments).toHaveLength(1);
    expect(deComision).not.toHaveBeenCalled();
  });

  it("Estudiante pide los assignments de la comisión activa", async () => {
    const todos = vi.fn();
    const deComision = vi.fn().mockResolvedValue([fakeAssignmentPublicado("c1")]);

    const assignments = await ESTUDIANTE.assignmentsParaMisTps({ todos, deComision }, "c1");

    expect(deComision).toHaveBeenCalledWith("c1");
    expect(assignments).toHaveLength(1);
    expect(todos).not.toHaveBeenCalled();
  });

  it("Estudiante sin comisión activa no consulta ninguna fuente", async () => {
    const todos = vi.fn();
    const deComision = vi.fn();

    const assignments = await ESTUDIANTE.assignmentsParaMisTps({ todos, deComision }, null);

    expect(assignments).toEqual([]);
    expect(todos).not.toHaveBeenCalled();
    expect(deComision).not.toHaveBeenCalled();
  });
});

describe("veAssignmentEnMisTps", () => {
  it("Docente ve un assignment en borrador", () => {
    expect(DOCENTE.veAssignmentEnMisTps(fakeAssignmentBorrador(), false)).toBe(true);
  });

  it("Docente ve un assignment archivado sin entrega", () => {
    const assignment = fakeAssignmentPublicado();
    assignment.transicionarA("archivado", { tieneEntregas: false }, "docente1");

    expect(DOCENTE.veAssignmentEnMisTps(assignment, false)).toBe(true);
  });

  it("Estudiante delega en esVisibleParaAlumno del assignment", () => {
    expect(ESTUDIANTE.veAssignmentEnMisTps(fakeAssignmentPublicado(), false)).toBe(true);
    expect(ESTUDIANTE.veAssignmentEnMisTps(fakeAssignmentBorrador(), false)).toBe(false);

    const archivado = fakeAssignmentPublicado();
    archivado.transicionarA("archivado", { tieneEntregas: false }, "docente1");
    expect(ESTUDIANTE.veAssignmentEnMisTps(archivado, false)).toBe(false);
    expect(ESTUDIANTE.veAssignmentEnMisTps(archivado, true)).toBe(true);
  });
});

describe("habilitaAccionesSobre", () => {
  it("Docente puede actuar sobre un assignment en borrador", () => {
    expect(DOCENTE.habilitaAccionesSobre(fakeAssignmentBorrador())).toBe(true);
  });

  it("Estudiante sólo puede actuar sobre un assignment publicado", () => {
    expect(ESTUDIANTE.habilitaAccionesSobre(fakeAssignmentPublicado())).toBe(true);
    expect(ESTUDIANTE.habilitaAccionesSobre(fakeAssignmentBorrador())).toBe(false);
  });

  it("Responsable hereda el comportamiento del Docente", () => {
    expect(RESPONSABLE.habilitaAccionesSobre(fakeAssignmentBorrador())).toBe(true);
  });
});

describe("Estudiante.autorizarCambioDeMembresia", () => {
  it("autoriza con inscripciones abiertas y sin entrega", () => {
    expect(() =>
      ESTUDIANTE.autorizarCambioDeMembresia({
        assignment: fakeGrupal(),
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).not.toThrow();
  });

  it("rechaza con InscripcionesCerradasError cuando el docente cerró las inscripciones", () => {
    expect(() =>
      ESTUDIANTE.autorizarCambioDeMembresia({
        assignment: fakeGrupal({ inscripcionesCerradas: true }),
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).toThrow(InscripcionesCerradasError);
  });

  it("rechaza con InscripcionesCerradasError cuando el assignment no está publicado", () => {
    const grupal = new GrupalAssignment();
    grupal.id = "a1";
    grupal.maxIntegrantes = 3;
    expect(() =>
      ESTUDIANTE.autorizarCambioDeMembresia({
        assignment: grupal,
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).toThrow(InscripcionesCerradasError);
  });

  it("rechaza con GrupoConEntregaError cuando el grupo ya aceptó el TP", () => {
    expect(() =>
      ESTUDIANTE.autorizarCambioDeMembresia({
        assignment: fakeGrupal(),
        grupo: fakeGrupo(),
        grupoTieneEntrega: true,
      })
    ).toThrow(GrupoConEntregaError);
  });

  it("prioriza inscripciones cerradas sobre grupo con entrega", () => {
    expect(() =>
      ESTUDIANTE.autorizarCambioDeMembresia({
        assignment: fakeGrupal({ inscripcionesCerradas: true }),
        grupo: fakeGrupo(),
        grupoTieneEntrega: true,
      })
    ).toThrow(InscripcionesCerradasError);
  });
});

describe("Docente.autorizarCambioDeMembresia", () => {
  it("autoriza siempre, incluso con inscripciones cerradas y grupo con entrega", () => {
    expect(() =>
      DOCENTE.autorizarCambioDeMembresia({
        assignment: fakeGrupal({ inscripcionesCerradas: true }),
        grupo: fakeGrupo(),
        grupoTieneEntrega: true,
      })
    ).not.toThrow();
  });
});

describe("origenDeAuditoria", () => {
  it("Estudiante se audita como 'alumno'", () => {
    expect(ESTUDIANTE.origenDeAuditoria()).toBe("alumno");
  });

  it("Docente se audita como 'docente'", () => {
    expect(DOCENTE.origenDeAuditoria()).toBe("docente");
  });

  it("Responsable también se audita como 'docente' (hereda de Docente)", () => {
    expect(RESPONSABLE.origenDeAuditoria()).toBe("docente");
  });
});

describe("Responsable conserva el resto de los permisos docentes por herencia", () => {
  it("accede a cualquier assignment como el Docente", () => {
    expect(() =>
      RESPONSABLE.autorizarAccesoAssignment(null, fakeAssignmentPublicado(null))
    ).not.toThrow();
  });

  it("resuelve cambios de membresía siempre, como el Docente", () => {
    expect(() =>
      RESPONSABLE.autorizarCambioDeMembresia({
        assignment: fakeGrupal({ inscripcionesCerradas: true }),
        grupo: fakeGrupo(),
        grupoTieneEntrega: true,
      })
    ).not.toThrow();
  });
});

describe("motivoDeBloqueoDeMembresia", () => {
  it("devuelve null cuando el cambio está autorizado", () => {
    expect(
      ESTUDIANTE.motivoDeBloqueoDeMembresia({
        assignment: fakeGrupal(),
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).toBeNull();
  });

  it("devuelve el mensaje del error que el servidor tiraría", () => {
    const contexto = {
      assignment: fakeGrupal(),
      grupo: fakeGrupo(),
      grupoTieneEntrega: true,
    };
    const motivo = ESTUDIANTE.motivoDeBloqueoDeMembresia(contexto);
    const error = new GrupoConEntregaError("g1");
    expect(motivo).toBe(error.message);
  });

  it("nunca bloquea al Docente", () => {
    expect(
      DOCENTE.motivoDeBloqueoDeMembresia({
        assignment: fakeGrupal({ inscripcionesCerradas: true }),
        grupo: fakeGrupo(),
        grupoTieneEntrega: true,
      })
    ).toBeNull();
  });

  it("también traduce InscripcionesCerradasError a motivo", () => {
    const contexto = {
      assignment: fakeGrupal({ inscripcionesCerradas: true }),
      grupo: fakeGrupo(),
      grupoTieneEntrega: false,
    };
    const motivo = ESTUDIANTE.motivoDeBloqueoDeMembresia(contexto);
    const error = new InscripcionesCerradasError(contexto.assignment.id);
    expect(motivo).toBe(error.message);
  });

  it("relanza un error inesperado en vez de mostrarlo como bloqueo", () => {
    const rolConBug = Object.create(ESTUDIANTE) as typeof ESTUDIANTE;
    rolConBug.autorizarCambioDeMembresia = () => {
      throw new TypeError("contexto mal armado");
    };

    expect(() =>
      rolConBug.motivoDeBloqueoDeMembresia({
        assignment: fakeGrupal(),
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).toThrow(TypeError);
  });
});

describe("resolverRol", () => {
  it("devuelve RESPONSABLE si es responsable de entorno, sin importar si también es docente activo", () => {
    expect(
      resolverRol({ esResponsableDeEntorno: true, esDocenteActivo: true })
    ).toBe(RESPONSABLE);
    expect(
      resolverRol({ esResponsableDeEntorno: true, esDocenteActivo: false })
    ).toBe(RESPONSABLE);
  });

  it("devuelve DOCENTE si no es responsable pero sí docente activo", () => {
    expect(
      resolverRol({ esResponsableDeEntorno: false, esDocenteActivo: true })
    ).toBe(DOCENTE);
  });

  it("devuelve ESTUDIANTE si no es ni responsable ni docente activo", () => {
    expect(
      resolverRol({ esResponsableDeEntorno: false, esDocenteActivo: false })
    ).toBe(ESTUDIANTE);
  });
});

describe("DOCENTE, ESTUDIANTE y RESPONSABLE son instancias de RolDeUsuario", () => {
  it("son singletons reutilizados", () => {
    expect(DOCENTE).toBeInstanceOf(RolDeUsuario);
    expect(ESTUDIANTE).toBeInstanceOf(RolDeUsuario);
    expect(RESPONSABLE).toBeInstanceOf(RolDeUsuario);
    const rol1 = resolverRol({ esResponsableDeEntorno: false, esDocenteActivo: false });
    const rol2 = resolverRol({ esResponsableDeEntorno: false, esDocenteActivo: false });
    expect(rol1).toBe(ESTUDIANTE);
    expect(rol1).toBe(rol2);
  });
});

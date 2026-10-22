import { describe, it, expect, vi } from "vitest";
import {
  RolDeUsuario,
  DOCENTE,
  ESTUDIANTE,
  RESPONSABLE,
  resolverRol,
} from "./RolDeUsuario";
import { AccesoAssignmentProhibidoError, ParticipanteAlumno, ParticipanteDocente } from "./Participante";
import { Alumno } from "./Alumno";
import { Comision } from "./Comision";
import type { Grupo } from "./Grupo";
import { Entrega } from "./Entrega";
import { IndividualAssignment } from "./IndividualAssignment";
import { INTEGRANTES_ALUMNOS, INTEGRANTES_DOCENTES } from "./TipoDeIntegrantes";

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
      "/admin/alumnos",
      "/admin/comisiones",
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
      "/admin/alumnos",
      "/admin/comisiones",
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

describe("menú de cuenta por rol", () => {
  it("Estudiante edita su perfil y ese ítem avisa la sincronización pendiente", () => {
    expect(ESTUDIANTE.itemsDeCuenta()).toEqual([
      { href: "/perfil", label: "Editar perfil", aviso: "sincronizacion" },
    ]);
  });

  it("Docente ve los errores y ese ítem avisa los errores sin leer", () => {
    expect(DOCENTE.itemsDeCuenta()).toEqual([
      { href: "/admin/errores", label: "Errores", aviso: "errores" },
    ]);
  });

  it("Responsable hereda el menú de cuenta del Docente", () => {
    expect(RESPONSABLE.itemsDeCuenta()).toEqual(DOCENTE.itemsDeCuenta());
  });
});

describe("comoParticipante", () => {
  it("Estudiante construye un ParticipanteAlumno consultando sólo fuentes.alumno", async () => {
    const alumno = fakeAlumno();
    const fuentesAlumno = vi.fn().mockResolvedValue(alumno);
    const fuentesComisionActiva = vi.fn();

    const participante = await ESTUDIANTE.comoParticipante("ana", {
      alumno: fuentesAlumno,
      comisionActiva: fuentesComisionActiva,
    });

    expect(participante).toBeInstanceOf(ParticipanteAlumno);
    expect(participante.alumno).toBe(alumno);
    expect(fuentesAlumno).toHaveBeenCalled();
    expect(fuentesComisionActiva).not.toHaveBeenCalled();
  });

  it("Docente construye un ParticipanteDocente consultando sólo fuentes.comisionActiva", async () => {
    const comisionActiva = fakeComision();
    const fuentesAlumno = vi.fn();
    const fuentesComisionActiva = vi.fn().mockResolvedValue(comisionActiva);

    const participante = await DOCENTE.comoParticipante("profe-docente", {
      alumno: fuentesAlumno,
      comisionActiva: fuentesComisionActiva,
    });

    expect(participante).toBeInstanceOf(ParticipanteDocente);
    expect(participante.alumno).toBeNull();
    expect(participante.githubUsername).toBe("profe-docente");
    expect(fuentesComisionActiva).toHaveBeenCalled();
    expect(fuentesAlumno).not.toHaveBeenCalled();
  });

  it("Responsable hereda el comoParticipante del Docente", async () => {
    const participante = await RESPONSABLE.comoParticipante("responsable1", {
      alumno: vi.fn(),
      comisionActiva: vi.fn().mockResolvedValue(null),
    });
    expect(participante).toBeInstanceOf(ParticipanteDocente);
  });
});

describe("actorSobreMembresiaAjena", () => {
  it("el Docente resuelve siempre y se audita como 'docente'", () => {
    const actor = DOCENTE.actorSobreMembresiaAjena("a1");
    expect(() => actor.autorizarAltaEnGrupo({} as never)).not.toThrow();
    expect(() => actor.autorizarBajaDeGrupo({} as never)).not.toThrow();
    expect(actor.origenDeAuditoria()).toBe("docente");
  });

  it("el actor docente autoriza el alta en un grupo que ya aceptó el TP", () => {
    const actor = DOCENTE.actorSobreMembresiaAjena("a1");
    expect(() => actor.autorizarAltaEnGrupo({} as never)).not.toThrow();
  });

  it("el actor docente autoriza la baja en un grupo que ya aceptó el TP", () => {
    const actor = DOCENTE.actorSobreMembresiaAjena("a1");
    expect(() =>
      actor.autorizarBajaDeGrupo({ grupoTieneEntrega: true } as never)
    ).not.toThrow();
  });

  it("el Responsable hereda el mismo comportamiento que el Docente", () => {
    const actor = RESPONSABLE.actorSobreMembresiaAjena("a1");
    expect(() => actor.autorizarBajaDeGrupo({} as never)).not.toThrow();
    expect(actor.origenDeAuditoria()).toBe("docente");
  });

  it("el Estudiante nunca administra la membresía de otro", () => {
    expect(() => ESTUDIANTE.actorSobreMembresiaAjena("a1")).toThrow(
      AccesoAssignmentProhibidoError
    );
  });

  // Revisión de code review (issue #107/#112): `moverAlumnoDeGrupo` ahora le
  // pide al actor tanto el acceso al assignment como el tipo de grupo a
  // ingresar — el docente administrando a otro conserva el alcance global
  // (no-op) y mueve dentro del tipo del grupo origen.
  it("el Docente autoriza cualquier assignment y devuelve el tipo del origen o 'alumnos'", () => {
    const actor = DOCENTE.actorSobreMembresiaAjena("a1");

    expect(() => actor.autorizarAccionSobreAssignment({} as never)).not.toThrow();
    expect(actor.tipoDeGrupoAlIngresar({ tipoDeIntegrantes: INTEGRANTES_DOCENTES } as Grupo)).toBe(
      INTEGRANTES_DOCENTES
    );
    expect(actor.tipoDeGrupoAlIngresar(null)).toBe(INTEGRANTES_ALUMNOS);
  });
});

function assignmentConEstado(id: string, estado: "publicado" | "archivado"): IndividualAssignment {
  const assignment = new IndividualAssignment();
  assignment.id = id;
  assignment.transicionarA(estado, { tieneEntregas: true }, "docente1");
  return assignment;
}

describe.each([
  ["DOCENTE", DOCENTE],
  ["RESPONSABLE", RESPONSABLE],
])("alcance global de %s", (_nombre, rol) => {
  it("entregasAlcanzables devuelve todas las con repo activo y no consulta la del usuario", async () => {
    const entregas = [new Entrega(), new Entrega()];
    const laDelUsuario = vi.fn();
    const resultado = await rol.entregasAlcanzables({
      todasConRepoActivo: vi.fn().mockResolvedValue(entregas),
      laDelUsuario,
    });
    expect(resultado).toBe(entregas);
    expect(laDelUsuario).not.toHaveBeenCalled();
  });

  it("sincroniza la participación", () => {
    expect(rol.sincronizaParticipacion()).toBe(true);
  });

  it("assignmentsVisibles devuelve todos y no consulta alumno, comisión ni entregas", async () => {
    const assignments = [assignmentConEstado("a1", "publicado")];
    const alumno = vi.fn();
    const deComision = vi.fn();
    const entregasDelUsuario = vi.fn();
    const resultado = await rol.assignmentsVisibles({
      todos: vi.fn().mockResolvedValue(assignments),
      alumno,
      deComision,
      entregasDelUsuario,
    });
    expect(resultado).toBe(assignments);
    expect(alumno).not.toHaveBeenCalled();
    expect(deComision).not.toHaveBeenCalled();
    expect(entregasDelUsuario).not.toHaveBeenCalled();
  });
});

describe("alcance de ESTUDIANTE", () => {
  it("entregasAlcanzables devuelve sólo la propia", async () => {
    const entrega = new Entrega();
    const todasConRepoActivo = vi.fn();
    const resultado = await ESTUDIANTE.entregasAlcanzables({
      todasConRepoActivo,
      laDelUsuario: vi.fn().mockResolvedValue(entrega),
    });
    expect(resultado).toEqual([entrega]);
    expect(todasConRepoActivo).not.toHaveBeenCalled();
  });

  it("entregasAlcanzables sin entrega propia devuelve una lista vacía", async () => {
    const resultado = await ESTUDIANTE.entregasAlcanzables({
      todasConRepoActivo: vi.fn(),
      laDelUsuario: vi.fn().mockResolvedValue(null),
    });
    expect(resultado).toEqual([]);
  });

  it("no sincroniza la participación", () => {
    expect(ESTUDIANTE.sincronizaParticipacion()).toBe(false);
  });

  it("assignmentsVisibles sin alumno registrado devuelve null y no consulta la comisión", async () => {
    const deComision = vi.fn();
    const todos = vi.fn();
    const resultado = await ESTUDIANTE.assignmentsVisibles({
      todos,
      alumno: vi.fn().mockResolvedValue(null),
      deComision,
      entregasDelUsuario: vi.fn(),
    });
    expect(resultado).toBeNull();
    expect(deComision).not.toHaveBeenCalled();
    expect(todos).not.toHaveBeenCalled();
  });

  it("assignmentsVisibles lista los publicados y los archivados sólo si ya tiene entrega", async () => {
    const publicado = assignmentConEstado("a-publicado", "publicado");
    const archivadoConEntrega = assignmentConEstado("a-archivado-con", "archivado");
    const archivadoSinEntrega = assignmentConEstado("a-archivado-sin", "archivado");
    const deComision = vi
      .fn()
      .mockResolvedValue([publicado, archivadoConEntrega, archivadoSinEntrega]);
    const todos = vi.fn();

    const resultado = await ESTUDIANTE.assignmentsVisibles({
      todos,
      alumno: vi.fn().mockResolvedValue(fakeAlumno("c9")),
      deComision,
      entregasDelUsuario: vi
        .fn()
        .mockResolvedValue(new Map([["a-archivado-con", new Entrega()]])),
    });

    expect(deComision).toHaveBeenCalledWith("c9");
    expect(resultado).toEqual([publicado, archivadoConEntrega]);
    expect(todos).not.toHaveBeenCalled();
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

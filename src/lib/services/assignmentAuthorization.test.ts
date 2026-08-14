import { describe, expect, it } from "vitest";
import {
  AccesoAssignmentProhibidoError,
  AssignmentNoDisponibleError,
  autorizarAccesoAssignment,
  autorizarAccionSobreAssignment,
} from "./assignmentAuthorization";
import { IndividualAssignment } from "@/domain/entities/IndividualAssignment";

function makeAssignment(comisionId: string | null = "c1") {
  return {
    id: "a1",
    comision: comisionId ? { id: comisionId } : undefined,
  } as never;
}

function makeAlumno(comisionId = "c1") {
  return {
    id: "alumno-1",
    comision: { id: comisionId },
  } as never;
}

function makeAssignmentPublicado(comisionId: string | null = "c1") {
  const assignment = new IndividualAssignment();
  assignment.id = "a1";
  assignment.comision = comisionId ? ({ id: comisionId } as never) : undefined;
  assignment.transicionarA("publicado", { tieneEntregas: false }, "docente1");
  return assignment;
}

describe("autorizarAccesoAssignment", () => {
  it("permite al alumno de la misma comisión", () => {
    expect(() =>
      autorizarAccesoAssignment(
        { isAdmin: false },
        makeAlumno("c1"),
        makeAssignment("c1")
      )
    ).not.toThrow();
  });

  it("rechaza al alumno de otra comisión", () => {
    expect(() =>
      autorizarAccesoAssignment(
        { isAdmin: false },
        makeAlumno("c2"),
        makeAssignment("c1")
      )
    ).toThrow(AccesoAssignmentProhibidoError);
  });

  it("rechaza usuarios comunes sin alumno registrado", () => {
    expect(() =>
      autorizarAccesoAssignment(
        { isAdmin: false },
        null,
        makeAssignment("c1")
      )
    ).toThrow(AccesoAssignmentProhibidoError);
  });

  it("rechaza para alumnos los assignments históricos sin comisión", () => {
    expect(() =>
      autorizarAccesoAssignment(
        { isAdmin: false },
        makeAlumno("c1"),
        makeAssignment(null)
      )
    ).toThrow(AccesoAssignmentProhibidoError);
  });

  it("permite acceso global a administradores", () => {
    expect(() =>
      autorizarAccesoAssignment(
        { isAdmin: true },
        null,
        makeAssignment(null)
      )
    ).not.toThrow();
  });
});

describe("autorizarAccionSobreAssignment", () => {
  it("permite al alumno de la comisión sobre un assignment publicado", () => {
    expect(() =>
      autorizarAccionSobreAssignment(
        { isAdmin: false },
        makeAlumno("c1"),
        makeAssignmentPublicado("c1")
      )
    ).not.toThrow();
  });

  it("rechaza al alumno sobre un assignment en borrador", () => {
    const borrador = new IndividualAssignment();
    borrador.id = "a1";
    borrador.comision = { id: "c1" } as never;
    expect(() =>
      autorizarAccionSobreAssignment({ isAdmin: false }, makeAlumno("c1"), borrador)
    ).toThrow(AssignmentNoDisponibleError);
  });

  it("rechaza al alumno sobre un assignment archivado, aunque sea de su comisión", () => {
    const archivado = new IndividualAssignment();
    archivado.id = "a1";
    archivado.comision = { id: "c1" } as never;
    archivado.transicionarA("publicado", { tieneEntregas: false }, "docente1");
    archivado.transicionarA("archivado", { tieneEntregas: false }, "docente1");
    expect(() =>
      autorizarAccionSobreAssignment({ isAdmin: false }, makeAlumno("c1"), archivado)
    ).toThrow(AssignmentNoDisponibleError);
  });

  it("prioriza el rechazo por comisión sobre el de estado", () => {
    expect(() =>
      autorizarAccionSobreAssignment(
        { isAdmin: false },
        makeAlumno("c2"),
        makeAssignmentPublicado("c1")
      )
    ).toThrow(AccesoAssignmentProhibidoError);
  });

  it("permite a los administradores actuar sobre un assignment en cualquier estado", () => {
    const borrador = new IndividualAssignment();
    borrador.id = "a1";
    expect(() =>
      autorizarAccionSobreAssignment({ isAdmin: true }, null, borrador)
    ).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import {
  AccesoAssignmentProhibidoError,
  autorizarAccesoAssignment,
} from "./assignmentAuthorization";

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

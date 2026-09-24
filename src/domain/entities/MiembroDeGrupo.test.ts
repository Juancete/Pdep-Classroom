import { describe, it, expect } from "vitest";
import { MiembroDeGrupo } from "./MiembroDeGrupo";
import { Alumno } from "./Alumno";

function fakeAlumno(nombre: string, apellido: string): Alumno {
  return Object.assign(new Alumno(), {
    id: `id-${nombre}`,
    nombre,
    apellido,
    githubUsername: nombre.toLowerCase(),
  });
}

function fakeMiembro(githubUsername: string, alumno: Alumno | null = null): MiembroDeGrupo {
  return Object.assign(new MiembroDeGrupo(), {
    id: `miembro-${githubUsername}`,
    githubUsername,
    alumno: alumno ?? undefined,
  });
}

describe("MiembroDeGrupo.nombreCompleto", () => {
  it("devuelve el nombreCompleto del Alumno vinculado", () => {
    const alumno = fakeAlumno("Ana", "García");
    const miembro = fakeMiembro("ana", alumno);
    expect(miembro.nombreCompleto()).toBe("García, Ana");
  });

  it("devuelve null cuando no hay Alumno vinculado (docente de demo, issue #107/#112)", () => {
    const miembro = fakeMiembro("profe-docente");
    expect(miembro.nombreCompleto()).toBeNull();
  });
});

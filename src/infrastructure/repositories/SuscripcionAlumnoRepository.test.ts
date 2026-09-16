import { describe, expect, it, vi } from "vitest";
import { Alumno, SuscripcionAlumno } from "@/domain/entities";
import { getSuscripcionesPorAlumno } from "./SuscripcionAlumnoRepository";

function nuevoAlumno(id: string): Alumno {
  return Object.assign(new Alumno(), { id });
}

function nuevaSuscripcion(alumno: Alumno, canal: SuscripcionAlumno["canal"] = "google_groups") {
  return Object.assign(new SuscripcionAlumno(), { alumno, canal });
}

describe("getSuscripcionesPorAlumno", () => {
  it("con un array de ids vacío no consulta la DB y devuelve un Map vacío", async () => {
    const find = vi.fn();
    const entityManager = { find } as unknown as Parameters<typeof getSuscripcionesPorAlumno>[1];

    const resultado = await getSuscripcionesPorAlumno([], entityManager);

    expect(resultado.size).toBe(0);
    expect(find).not.toHaveBeenCalled();
  });

  it("agrupa las suscripciones encontradas por id de alumno", async () => {
    const alumnoUno = nuevoAlumno("alumno-1");
    const alumnoDos = nuevoAlumno("alumno-2");
    const suscripcionUnoA = nuevaSuscripcion(alumnoUno, "google_groups");
    const suscripcionDos = nuevaSuscripcion(alumnoDos, "google_groups");
    const find = vi.fn().mockResolvedValue([suscripcionUnoA, suscripcionDos]);
    const entityManager = { find } as unknown as Parameters<typeof getSuscripcionesPorAlumno>[1];

    const resultado = await getSuscripcionesPorAlumno(
      [alumnoUno.id, alumnoDos.id],
      entityManager
    );

    expect(find).toHaveBeenCalledWith(SuscripcionAlumno, {
      alumno: { $in: [alumnoUno.id, alumnoDos.id] },
    });
    expect(resultado.get(alumnoUno.id)).toEqual([suscripcionUnoA]);
    expect(resultado.get(alumnoDos.id)).toEqual([suscripcionDos]);
  });

  it("agrupa varias suscripciones del mismo alumno (distintos canales) en la misma entrada", async () => {
    const alumno = nuevoAlumno("alumno-1");
    const suscripcionCanalUno = nuevaSuscripcion(alumno, "google_groups");
    const find = vi.fn().mockResolvedValue([suscripcionCanalUno]);
    const entityManager = { find } as unknown as Parameters<typeof getSuscripcionesPorAlumno>[1];

    const resultado = await getSuscripcionesPorAlumno([alumno.id], entityManager);

    expect(resultado.get(alumno.id)).toEqual([suscripcionCanalUno]);
    expect(resultado.get("otro-alumno")).toBeUndefined();
  });
});

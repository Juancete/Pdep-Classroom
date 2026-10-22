import { describe, it, expect } from "vitest";
import {
  EstadoDeProvision,
  NOMBRES_ESTADO_DE_PROVISION,
  type NombreEstadoDeProvision,
} from "./EstadoDeProvision";

describe("EstadoDeProvision.desdeNombre", () => {
  it.each(NOMBRES_ESTADO_DE_PROVISION)("resuelve la instancia de '%s'", (nombre) => {
    expect(EstadoDeProvision.desdeNombre(nombre).nombre).toBe(nombre);
  });

  it("devuelve siempre la misma instancia por nombre", () => {
    expect(EstadoDeProvision.desdeNombre("pendiente")).toBe(EstadoDeProvision.desdeNombre("pendiente"));
  });
});

describe("EstadoDeProvision.tieneRepoActivo", () => {
  it.each<[NombreEstadoDeProvision, boolean]>([
    ["pendiente", false],
    ["activa", true],
    ["fallida", false],
  ])("'%s' -> %s", (nombre, esperado) => {
    expect(EstadoDeProvision.desdeNombre(nombre).tieneRepoActivo()).toBe(esperado);
  });
});

describe("EstadoDeProvision.puedeEstarEnCurso", () => {
  it.each<[NombreEstadoDeProvision, boolean]>([
    ["pendiente", true],
    ["activa", false],
    ["fallida", false],
  ])("'%s' -> %s", (nombre, esperado) => {
    expect(EstadoDeProvision.desdeNombre(nombre).puedeEstarEnCurso()).toBe(esperado);
  });
});

describe("EstadoDeProvision.aviso", () => {
  it("pendiente avisa con tono de advertencia", () => {
    expect(EstadoDeProvision.desdeNombre("pendiente").aviso()).toEqual({
      etiqueta: "Aprovisionamiento pendiente",
      tono: "advertencia",
    });
  });

  it("fallida avisa con tono de error", () => {
    expect(EstadoDeProvision.desdeNombre("fallida").aviso()).toEqual({
      etiqueta: "Aprovisionamiento fallido",
      tono: "error",
    });
  });

  it("activa no avisa nada", () => {
    expect(EstadoDeProvision.desdeNombre("activa").aviso()).toBeNull();
  });
});

describe("EstadoDeProvision.mensajeParaAlumno", () => {
  const MENSAJE_CREANDO = "Estamos creando el repositorio.";
  const MENSAJE_QUEDO_PENDIENTE = "La creación del repo quedó pendiente antes de archivar el TP.";

  it.each<[NombreEstadoDeProvision, boolean, string]>([
    ["pendiente", true, MENSAJE_CREANDO],
    ["pendiente", false, MENSAJE_QUEDO_PENDIENTE],
    ["activa", true, MENSAJE_CREANDO],
    ["activa", false, MENSAJE_QUEDO_PENDIENTE],
    ["fallida", true, "No se pudo crear el repo. Podés reintentar."],
    ["fallida", false, "No se pudo crear el repo antes de archivar el TP. Consultá al equipo docente."],
  ])("'%s' con puedeActuar=%s", (nombre, puedeActuar, esperado) => {
    expect(EstadoDeProvision.desdeNombre(nombre).mensajeParaAlumno(puedeActuar)).toBe(esperado);
  });
});

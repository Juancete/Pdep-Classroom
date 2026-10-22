import { describe, it, expect } from "vitest";
import {
  ACEPTAR,
  ConRepo,
  ELEGIR_GRUPO,
  SIN_ACCION,
  SinRepo,
  type AvisoDeRepoPendiente,
  type DatosDeRepo,
  type PresentacionDeSituacion,
} from "./SituacionDeAlumno";

const presentacionDePrueba: PresentacionDeSituacion<string> = {
  conRepo: (repo) => `conRepo:${repo.repoUrl}:${repo.ciResultadoNombre}:${repo.ciDetalleUrl}:${repo.tieneResultadoAutomatico}`,
  sinRepo: (aviso) => `sinRepo:${aviso.mensaje}:${aviso.puedeReintentar}`,
  elegirGrupo: () => "elegirGrupo",
  aceptar: () => "aceptar",
  sinAccion: () => "sinAccion",
};

describe("SituacionDeAlumno.presentar", () => {
  it("ConRepo llama a conRepo con sus datos", () => {
    const repo: DatosDeRepo = {
      repoUrl: "https://github.com/org/repo",
      ciResultadoNombre: "passing",
      ciDetalleUrl: "https://ci/1",
      tieneResultadoAutomatico: true,
    };
    expect(new ConRepo(repo).presentar(presentacionDePrueba)).toBe(
      "conRepo:https://github.com/org/repo:passing:https://ci/1:true"
    );
  });

  it("SinRepo llama a sinRepo con su aviso", () => {
    const aviso: AvisoDeRepoPendiente = { mensaje: "Creando", puedeReintentar: true };
    expect(new SinRepo(aviso).presentar(presentacionDePrueba)).toBe("sinRepo:Creando:true");
  });

  it("ELEGIR_GRUPO llama sólo a elegirGrupo", () => {
    expect(ELEGIR_GRUPO.presentar(presentacionDePrueba)).toBe("elegirGrupo");
  });

  it("ACEPTAR llama sólo a aceptar", () => {
    expect(ACEPTAR.presentar(presentacionDePrueba)).toBe("aceptar");
  });

  it("SIN_ACCION llama sólo a sinAccion", () => {
    expect(SIN_ACCION.presentar(presentacionDePrueba)).toBe("sinAccion");
  });
});

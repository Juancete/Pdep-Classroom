import { describe, it, expect } from "vitest";
import {
  EstadoAssignment,
  TransicionDeEstadoInvalidaError,
  transicionesDisponibles,
  type NombreEstadoAssignment,
} from "./EstadoAssignment";

const ASSIGNMENT_ID = "assignment-1";

function transicionar(
  desde: NombreEstadoAssignment,
  hacia: NombreEstadoAssignment,
  tieneEntregas = false
) {
  return EstadoAssignment.desdeNombre(desde).transicionarA(ASSIGNMENT_ID, hacia, {
    tieneEntregas,
  });
}

describe("EstadoAssignment.desdeNombre", () => {
  it("resuelve las tres instancias por nombre", () => {
    expect(EstadoAssignment.desdeNombre("borrador").nombre).toBe("borrador");
    expect(EstadoAssignment.desdeNombre("publicado").nombre).toBe("publicado");
    expect(EstadoAssignment.desdeNombre("archivado").nombre).toBe("archivado");
  });
});

describe("EstadoAssignment.esVisibleParaAlumno", () => {
  it("borrador nunca es visible, tenga o no entrega", () => {
    const borrador = EstadoAssignment.desdeNombre("borrador");
    expect(borrador.esVisibleParaAlumno(false)).toBe(false);
    expect(borrador.esVisibleParaAlumno(true)).toBe(false);
  });

  it("publicado siempre es visible", () => {
    const publicado = EstadoAssignment.desdeNombre("publicado");
    expect(publicado.esVisibleParaAlumno(false)).toBe(true);
    expect(publicado.esVisibleParaAlumno(true)).toBe(true);
  });

  it("archivado es visible solo si el alumno tiene entrega", () => {
    const archivado = EstadoAssignment.desdeNombre("archivado");
    expect(archivado.esVisibleParaAlumno(false)).toBe(false);
    expect(archivado.esVisibleParaAlumno(true)).toBe(true);
  });
});

describe("EstadoAssignment.permiteAccionesDeAlumno", () => {
  it("solo publicado habilita aceptar/gestionar grupo", () => {
    expect(EstadoAssignment.desdeNombre("borrador").permiteAccionesDeAlumno()).toBe(false);
    expect(EstadoAssignment.desdeNombre("publicado").permiteAccionesDeAlumno()).toBe(true);
    expect(EstadoAssignment.desdeNombre("archivado").permiteAccionesDeAlumno()).toBe(false);
  });
});

describe("EstadoAssignment.permiteEliminacion", () => {
  it("solo borrador habilita el borrado físico del assignment", () => {
    expect(EstadoAssignment.desdeNombre("borrador").permiteEliminacion()).toBe(true);
    expect(EstadoAssignment.desdeNombre("publicado").permiteEliminacion()).toBe(false);
    expect(EstadoAssignment.desdeNombre("archivado").permiteEliminacion()).toBe(false);
  });
});

describe("EstadoAssignment.permiteBorrarRepos", () => {
  it("solo archivado habilita el borrado masivo de repos", () => {
    expect(EstadoAssignment.desdeNombre("borrador").permiteBorrarRepos()).toBe(false);
    expect(EstadoAssignment.desdeNombre("publicado").permiteBorrarRepos()).toBe(false);
    expect(EstadoAssignment.desdeNombre("archivado").permiteBorrarRepos()).toBe(true);
  });
});

describe("EstadoAssignment.permiteEditarEstructura", () => {
  it("solo borrador habilita editar campos estructurales", () => {
    expect(EstadoAssignment.desdeNombre("borrador").permiteEditarEstructura()).toBe(true);
    expect(EstadoAssignment.desdeNombre("publicado").permiteEditarEstructura()).toBe(false);
    expect(EstadoAssignment.desdeNombre("archivado").permiteEditarEstructura()).toBe(false);
  });
});

// Ajuste post-Fase 3: `admin/assignments/[id]/page.tsx` reusaba
// `permiteEditarEstructura()` para decidir si mostrar el contador
// "Pendientes" — coincidían por casualidad sólo en borrador, pero el
// nombre no describía la condición real ("¿pudo haber entregas?").
describe("EstadoAssignment.esperaEntregas", () => {
  it("borrador no espera entregas todavía", () => {
    expect(EstadoAssignment.desdeNombre("borrador").esperaEntregas()).toBe(false);
  });

  it("publicado y archivado sí esperan/tuvieron entregas", () => {
    expect(EstadoAssignment.desdeNombre("publicado").esperaEntregas()).toBe(true);
    expect(EstadoAssignment.desdeNombre("archivado").esperaEntregas()).toBe(true);
  });
});

// Fase 3 de la auditoría de dominio — mismo idioma que
// `RolDeUsuario.motivoDeBloqueoDeMembresia`: el texto que ve el admin en
// `estado-panel.tsx` ES el `message` del error que tiraría el servidor.
describe("EstadoAssignment.motivoDeBloqueo", () => {
  it("devuelve null cuando la transición está permitida", () => {
    expect(
      EstadoAssignment.desdeNombre("publicado").motivoDeBloqueo(ASSIGNMENT_ID, "borrador", {
        tieneEntregas: false,
      })
    ).toBeNull();
  });

  it("devuelve el mensaje del error tipado cuando la transición está bloqueada", () => {
    const motivo = EstadoAssignment.desdeNombre("publicado").motivoDeBloqueo(
      ASSIGNMENT_ID,
      "borrador",
      { tieneEntregas: true }
    );
    expect(motivo).toBe(
      'No se puede pasar de "publicado" a "borrador": tiene entregas — archivalo en vez de despublicarlo'
    );
  });

  it("un archivado nunca puede volver a borrador — devuelve el motivo estructural", () => {
    const motivo = EstadoAssignment.desdeNombre("archivado").motivoDeBloqueo(
      ASSIGNMENT_ID,
      "borrador",
      { tieneEntregas: false }
    );
    expect(motivo).toContain("un archivado solo puede volver a publicarse");
  });
});

describe("EstadoAssignment.transicionarA — matriz de transiciones", () => {
  it("borrador → borrador es no-op", () => {
    expect(transicionar("borrador", "borrador").nombre).toBe("borrador");
  });

  it("borrador → publicado", () => {
    expect(transicionar("borrador", "publicado").nombre).toBe("publicado");
  });

  it("borrador → archivado", () => {
    expect(transicionar("borrador", "archivado").nombre).toBe("archivado");
  });

  it("publicado → publicado es no-op", () => {
    expect(transicionar("publicado", "publicado").nombre).toBe("publicado");
  });

  it("publicado → borrador sin entregas", () => {
    expect(transicionar("publicado", "borrador", false).nombre).toBe("borrador");
  });

  it("publicado → borrador con entregas lanza TransicionDeEstadoInvalidaError", () => {
    expect(() => transicionar("publicado", "borrador", true)).toThrow(
      TransicionDeEstadoInvalidaError
    );
  });

  it("publicado → archivado, con o sin entregas", () => {
    expect(transicionar("publicado", "archivado", false).nombre).toBe("archivado");
    expect(transicionar("publicado", "archivado", true).nombre).toBe("archivado");
  });

  it("archivado → archivado es no-op", () => {
    expect(transicionar("archivado", "archivado").nombre).toBe("archivado");
  });

  it("archivado → publicado (desarchivar)", () => {
    expect(transicionar("archivado", "publicado").nombre).toBe("publicado");
  });

  it("archivado → borrador no está permitido", () => {
    expect(() => transicionar("archivado", "borrador")).toThrow(
      TransicionDeEstadoInvalidaError
    );
  });

  it("transicionesDisponibles: borrador ofrece publicar y archivar", () => {
    const disponibles = transicionesDisponibles(
      EstadoAssignment.desdeNombre("borrador"),
      ASSIGNMENT_ID,
      { tieneEntregas: false }
    );
    expect(disponibles.sort()).toEqual(["archivado", "publicado"]);
  });

  it("transicionesDisponibles: publicado sin entregas ofrece despublicar y archivar", () => {
    const disponibles = transicionesDisponibles(
      EstadoAssignment.desdeNombre("publicado"),
      ASSIGNMENT_ID,
      { tieneEntregas: false }
    );
    expect(disponibles.sort()).toEqual(["archivado", "borrador"]);
  });

  it("transicionesDisponibles: publicado con entregas solo ofrece archivar", () => {
    const disponibles = transicionesDisponibles(
      EstadoAssignment.desdeNombre("publicado"),
      ASSIGNMENT_ID,
      { tieneEntregas: true }
    );
    expect(disponibles).toEqual(["archivado"]);
  });

  it("transicionesDisponibles: archivado solo ofrece publicar", () => {
    const disponibles = transicionesDisponibles(
      EstadoAssignment.desdeNombre("archivado"),
      ASSIGNMENT_ID,
      { tieneEntregas: false }
    );
    expect(disponibles).toEqual(["publicado"]);
  });

  it("el error de transición inválida incluye assignmentId, desde y hacia", () => {
    try {
      transicionar("publicado", "borrador", true);
      throw new Error("no debería llegar acá");
    } catch (error) {
      expect(error).toBeInstanceOf(TransicionDeEstadoInvalidaError);
      const transicionInvalida = error as TransicionDeEstadoInvalidaError;
      expect(transicionInvalida.assignmentId).toBe(ASSIGNMENT_ID);
      expect(transicionInvalida.desde).toBe("publicado");
      expect(transicionInvalida.hacia).toBe("borrador");
    }
  });
});

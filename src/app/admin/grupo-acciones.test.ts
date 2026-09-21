import { describe, it, expect } from "vitest";
import { ACCIONES, advertenciaEntregaDestino, confirmacionPara } from "./grupo-acciones";
import type { GrupoAdminResumen } from "./grupo-resumen";

function makeGrupo(overrides: Partial<GrupoAdminResumen> = {}): GrupoAdminResumen {
  return {
    id: "g1",
    nombre: "Los Lambdas",
    maxIntegrantes: 3,
    estaLleno: false,
    etiquetaCupo: "2/3 integrantes",
    tipoDeIntegrantes: "alumnos",
    miembros: [
      { username: "ana", nombreCompleto: "Ana García" },
      { username: "bob", nombreCompleto: "Bob Pérez" },
    ],
    destinos: [],
    ...overrides,
  };
}

const ENTREGA = { estadoRepo: "activo" as const };

describe("confirmacionPara", () => {
  it("quitar sin entrega y con varios integrantes es sólo la confirmación base", () => {
    expect(confirmacionPara("quitar", makeGrupo())).toBe(ACCIONES.quitar.confirmacion);
  });

  it("quitar con entrega advierte que se revoca el acceso al repo", () => {
    const texto = confirmacionPara("quitar", makeGrupo({ entrega: ENTREGA }));
    expect(texto).toContain(ACCIONES.quitar.confirmacion);
    expect(texto).toContain("se le va a revocar el acceso al repositorio");
  });

  it("mover con entrega advierte que se revoca el acceso al repo", () => {
    expect(confirmacionPara("mover", makeGrupo({ entrega: ENTREGA }))).toContain(
      "se le va a revocar el acceso al repositorio"
    );
  });

  it("agregar con entrega advierte que se da acceso al repo", () => {
    expect(confirmacionPara("agregar", makeGrupo({ entrega: ENTREGA }))).toContain(
      "se le va a dar acceso al repositorio"
    );
  });

  it("quitar al último integrante sin entrega advierte que el grupo se elimina", () => {
    const grupo = makeGrupo({ miembros: [{ username: "ana", nombreCompleto: "Ana García" }] });
    expect(confirmacionPara("quitar", grupo)).toContain("Es el último integrante");
  });

  it("quitar al último integrante con entrega no dice que el grupo se elimina", () => {
    const grupo = makeGrupo({
      miembros: [{ username: "ana", nombreCompleto: "Ana García" }],
      entrega: ENTREGA,
    });
    expect(confirmacionPara("quitar", grupo)).not.toContain("Es el último integrante");
  });

  it("agregar a un grupo con un solo integrante y sin entrega no advierte que el grupo se elimina", () => {
    const grupo = makeGrupo({ miembros: [{ username: "ana", nombreCompleto: "Ana García" }] });
    const texto = confirmacionPara("agregar", grupo);
    expect(texto).not.toContain("Es el último integrante");
    expect(texto).toBe(ACCIONES.agregar.confirmacion);
  });
});

describe("advertenciaEntregaDestino", () => {
  it("avisa que el grupo destino con entrega recibe acceso al repo", () => {
    expect(advertenciaEntregaDestino({ conEntrega: true })).toContain(
      "El grupo destino ya aceptó el TP"
    );
  });

  it("no advierte si el destino no tiene entrega", () => {
    expect(advertenciaEntregaDestino({ conEntrega: false })).toBeNull();
  });
});

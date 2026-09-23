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
const ANA = { username: "ana", nombreCompleto: "Ana García" };
const DESTINO = { nombre: "Los Monoides" };

describe("confirmacionPara", () => {
  it("quitar nombra al alumno con su username y al grupo", () => {
    expect(confirmacionPara("quitar", makeGrupo(), ANA)).toBe(
      '¿Seguro que querés quitar a Ana García (@ana) del grupo "Los Lambdas"?'
    );
  });

  it("mover nombra al alumno, el grupo de origen y el destino", () => {
    expect(confirmacionPara("mover", makeGrupo(), ANA, DESTINO)).toBe(
      '¿Seguro que querés mover a Ana García (@ana) del grupo "Los Lambdas" al grupo "Los Monoides"?'
    );
  });

  it("agregar nombra al alumno y al grupo al que entra", () => {
    expect(confirmacionPara("agregar", makeGrupo(), ANA)).toBe(
      '¿Seguro que querés agregar a Ana García (@ana) al grupo "Los Lambdas"?'
    );
  });

  it("quitar sin entrega y con varios integrantes es sólo la confirmación base", () => {
    expect(confirmacionPara("quitar", makeGrupo(), ANA)).toBe(
      ACCIONES.quitar.confirmacion("Ana García (@ana)", "Los Lambdas")
    );
  });

  it("quitar con entrega advierte que se revoca el acceso al repo", () => {
    const texto = confirmacionPara("quitar", makeGrupo({ entrega: ENTREGA }), ANA);
    expect(texto).toContain("quitar a Ana García (@ana)");
    expect(texto).toContain("se le va a revocar el acceso al repositorio");
  });

  it("mover con entrega advierte que se revoca el acceso al repo", () => {
    expect(confirmacionPara("mover", makeGrupo({ entrega: ENTREGA }), ANA, DESTINO)).toContain(
      "se le va a revocar el acceso al repositorio"
    );
  });

  it("agregar con entrega advierte que se da acceso al repo", () => {
    expect(confirmacionPara("agregar", makeGrupo({ entrega: ENTREGA }), ANA)).toContain(
      "se le va a dar acceso al repositorio"
    );
  });

  it("quitar al último integrante sin entrega advierte que el grupo se elimina", () => {
    const grupo = makeGrupo({ miembros: [ANA] });
    expect(confirmacionPara("quitar", grupo, ANA)).toContain("Es el último integrante");
  });

  it("quitar al último integrante con entrega no dice que el grupo se elimina", () => {
    const grupo = makeGrupo({ miembros: [ANA], entrega: ENTREGA });
    expect(confirmacionPara("quitar", grupo, ANA)).not.toContain("Es el último integrante");
  });

  it("agregar a un grupo con un solo integrante y sin entrega no advierte que el grupo se elimina", () => {
    const grupo = makeGrupo({ miembros: [ANA] });
    const texto = confirmacionPara("agregar", grupo, ANA);
    expect(texto).not.toContain("Es el último integrante");
    expect(texto).toBe(ACCIONES.agregar.confirmacion("Ana García (@ana)", "Los Lambdas"));
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

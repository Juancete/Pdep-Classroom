import { describe, it, expect } from "vitest";
import { Comision, VENTANA_IMPORTACION_GRUPOS_MS } from "./Comision";

function nuevaComision(overrides: Partial<Comision> = {}): Comision {
  const comision = new Comision(2026, "sheet-test");
  return Object.assign(comision, overrides);
}

describe("Comision.activar / desactivar", () => {
  it("activar pone activa en true", () => {
    const comision = nuevaComision({ activa: false });
    comision.activar();
    expect(comision.activa).toBe(true);
  });

  it("desactivar pone activa en false", () => {
    const comision = nuevaComision({ activa: true });
    comision.desactivar();
    expect(comision.activa).toBe(false);
  });
});

// Fase 2 de la auditoría de dominio: antes se chequeaba `gruposImportadosEn`
// como truthiness en 6 lugares (perfil/page.tsx, admin/comisiones/[id]/edit/page.tsx,
// ComisionRepository.ts, hooksPostConfirmacion.ts) — `gruposYaImportados()`
// es la única fuente.
describe("Comision.gruposYaImportados", () => {
  it("es false antes de importar", () => {
    expect(nuevaComision().gruposYaImportados()).toBe(false);
  });

  it("es true después de completar la importación", () => {
    const comision = nuevaComision({ gruposImportadosEn: new Date() });
    expect(comision.gruposYaImportados()).toBe(true);
  });
});

describe("Comision.importacionEnProceso", () => {
  it("es false sin un reclamo vigente", () => {
    expect(nuevaComision().importacionEnProceso(new Date())).toBe(false);
  });

  it("es true dentro de la ventana del lease", () => {
    const ahora = new Date("2026-08-19T10:05:00Z");
    const comision = nuevaComision({
      gruposImportacionToken: "token-1",
      gruposImportacionIniciadaEn: new Date(ahora.getTime() - (VENTANA_IMPORTACION_GRUPOS_MS - 1)),
    });
    expect(comision.importacionEnProceso(ahora)).toBe(true);
  });

  it("es false cuando el lease ya venció (reclamo abandonado)", () => {
    const ahora = new Date("2026-08-19T10:05:00Z");
    const comision = nuevaComision({
      gruposImportacionToken: "token-1",
      gruposImportacionIniciadaEn: new Date(ahora.getTime() - VENTANA_IMPORTACION_GRUPOS_MS),
    });
    expect(comision.importacionEnProceso(ahora)).toBe(false);
  });
});

describe("Comision.reclamarImportacionDeGrupos", () => {
  it("setea el token y la fecha de inicio", () => {
    const comision = nuevaComision();
    const ahora = new Date("2026-08-19T10:00:00Z");

    comision.reclamarImportacionDeGrupos("token-1", ahora);

    expect(comision.gruposImportacionToken).toBe("token-1");
    expect(comision.gruposImportacionIniciadaEn).toBe(ahora);
  });
});

describe("Comision.renovarImportacion", () => {
  it("renueva la fecha de inicio si el token coincide con el reclamo vigente", () => {
    const comision = nuevaComision({ gruposImportacionToken: "token-1" });
    const ahora = new Date("2026-08-19T10:10:00Z");

    expect(comision.renovarImportacion("token-1", ahora)).toBe(true);
    expect(comision.gruposImportacionIniciadaEn).toBe(ahora);
  });

  it("no renueva si el token no coincide", () => {
    const comision = nuevaComision({
      gruposImportacionToken: "token-1",
      gruposImportacionIniciadaEn: undefined,
    });

    expect(comision.renovarImportacion("token-otro", new Date())).toBe(false);
    expect(comision.gruposImportacionIniciadaEn).toBeUndefined();
  });

  it("no renueva si la importación ya se completó", () => {
    const comision = nuevaComision({
      gruposImportacionToken: "token-1",
      gruposImportadosEn: new Date("2026-08-19T09:00:00Z"),
    });

    expect(comision.renovarImportacion("token-1", new Date())).toBe(false);
  });
});

describe("Comision.completarImportacionDeGrupos", () => {
  it("cierra la importación con la fecha recibida y limpia el lease cuando el token coincide", () => {
    const comision = nuevaComision({
      gruposImportacionToken: "token-1",
      gruposImportacionIniciadaEn: new Date(),
    });
    const ahora = new Date("2026-08-19T10:00:00Z");

    expect(comision.completarImportacionDeGrupos("token-1", ahora)).toBe(true);
    expect(comision.gruposImportadosEn).toBe(ahora);
    expect(comision.gruposImportacionToken).toBeUndefined();
    expect(comision.gruposImportacionIniciadaEn).toBeUndefined();
  });

  it("no completa nada si el token no coincide", () => {
    const comision = nuevaComision({ gruposImportacionToken: "token-1" });

    expect(comision.completarImportacionDeGrupos("token-otro", new Date())).toBe(false);
    expect(comision.gruposImportadosEn).toBeUndefined();
  });
});

// Issue #109: la columna elegida para volcar el grupo de un assignment
// grupal no puede coincidir con ninguna columna de datos personales de la
// hoja de alumnos de la comisión.
describe("Comision.columnaOcupadaPorDatosPersonales", () => {
  it("modo separado: detecta legajo, apellido, nombre, github y email", () => {
    const comision = nuevaComision({
      columnConfig: {
        sheetName: "Alumnos",
        headerRows: 1,
        legajo: 0,
        apellido: 1,
        nombre: 2,
        githubUsername: 3,
        email: 4,
      },
    });

    expect(comision.columnaOcupadaPorDatosPersonales(0)).toBe(true); // legajo
    expect(comision.columnaOcupadaPorDatosPersonales(1)).toBe(true); // apellido
    expect(comision.columnaOcupadaPorDatosPersonales(2)).toBe(true); // nombre
    expect(comision.columnaOcupadaPorDatosPersonales(3)).toBe(true); // github
    expect(comision.columnaOcupadaPorDatosPersonales(4)).toBe(true); // email
  });

  it("modo separado: una columna libre no está ocupada", () => {
    const comision = nuevaComision({
      columnConfig: {
        sheetName: "Alumnos",
        headerRows: 1,
        legajo: 0,
        apellido: 1,
        nombre: 2,
        githubUsername: 3,
        email: 4,
      },
    });

    expect(comision.columnaOcupadaPorDatosPersonales(5)).toBe(false);
  });

  it("modo completo: detecta la columna de nombre completo en vez de apellido/nombre", () => {
    const comision = nuevaComision({
      columnConfig: {
        sheetName: "Alumnos",
        headerRows: 1,
        legajo: 0,
        apellido: 1,
        nombre: 2,
        githubUsername: 3,
        email: 4,
        modoNombre: "completo",
        nombreCompleto: 5,
      },
    });

    expect(comision.columnaOcupadaPorDatosPersonales(5)).toBe(true); // nombreCompleto
    expect(comision.columnaOcupadaPorDatosPersonales(1)).toBe(false); // apellido ya no se usa
  });

  it("no considera ocupada la columna de grupos del bootstrap Sheets → DB", () => {
    const comision = nuevaComision({
      columnConfig: {
        sheetName: "Alumnos",
        headerRows: 1,
        legajo: 0,
        apellido: 1,
        nombre: 2,
        githubUsername: 3,
        email: 4,
        grupos: {
          sheetName: "Grupos",
          headerRows: 1,
          githubUsername: 0,
          nombreGrupoPorParadigma: { funcional: 6 },
        },
      },
    });

    expect(comision.columnaOcupadaPorDatosPersonales(6)).toBe(false);
  });
});

describe("Comision.liberarImportacion", () => {
  it("libera el reclamo cuando el token coincide", () => {
    const comision = nuevaComision({
      gruposImportacionToken: "token-1",
      gruposImportacionIniciadaEn: new Date(),
    });

    expect(comision.liberarImportacion("token-1")).toBe(true);
    expect(comision.gruposImportacionToken).toBeUndefined();
    expect(comision.gruposImportacionIniciadaEn).toBeUndefined();
  });

  it("no libera nada si el token no coincide (no pisa un reclamo ajeno)", () => {
    const comision = nuevaComision({ gruposImportacionToken: "token-1" });

    expect(comision.liberarImportacion("token-otro")).toBe(false);
    expect(comision.gruposImportacionToken).toBe("token-1");
  });
});

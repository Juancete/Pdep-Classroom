import { describe, it, expect } from "vitest";
import type { ColumnConfig } from "@/types";
import {
  MapeoDeNombreSeparado,
  MapeoDeNombreCompleto,
  ModoNombreCompletoSinColumnaError,
  mapeoDeNombreDe,
  datosPersonalesMapeados,
  problemasDeDatosPersonales,
  MENSAJE_COLUMNA_REPETIDA,
  MENSAJE_NOMBRE_COMPLETO_OBLIGATORIO,
  type ConfigDeDatosPersonales,
} from "./MapeoDeNombre";

// ── MapeoDeNombreSeparado ────────────────────────────────────

describe("MapeoDeNombreSeparado", () => {
  const mapeo = new MapeoDeNombreSeparado(1, 2);

  it("lee apellido y nombre de sus columnas y los trimea", () => {
    const fila = ["12345", "  García  ", "  Juan  ", "juangarcia", "j@m.com"];
    expect(mapeo.leerDeFila(fila)).toEqual({ apellido: "García", nombre: "Juan" });
  });

  it("devuelve strings vacíos para celdas faltantes", () => {
    expect(mapeo.leerDeFila(["12345"])).toEqual({ apellido: "", nombre: "" });
  });

  it("celdasParaEscribir devuelve dos celdas, una por columna", () => {
    expect(mapeo.celdasParaEscribir({ apellido: "García", nombre: "Juan" })).toEqual([
      { columna: 1, valor: "García" },
      { columna: 2, valor: "Juan" },
    ]);
  });

  it("columnasUsadas devuelve apellido y nombre", () => {
    expect(mapeo.columnasUsadas()).toEqual([1, 2]);
  });
});

// ── MapeoDeNombreCompleto ─────────────────────────────────────

describe("MapeoDeNombreCompleto", () => {
  const mapeo = new MapeoDeNombreCompleto(5);

  it("separa apellido y nombre por la primera coma y trimea", () => {
    const fila = ["", "", "", "", "", "García, Juan"];
    expect(mapeo.leerDeFila(fila)).toEqual({ apellido: "García", nombre: "Juan" });
  });

  it("usa sólo la primera coma: el resto queda del lado del nombre", () => {
    const fila = ["", "", "", "", "", "Pérez, María, José"];
    expect(mapeo.leerDeFila(fila)).toEqual({ apellido: "Pérez", nombre: "María, José" });
  });

  it("sin coma: devuelve apellido y nombre vacíos más el texto original en crudo", () => {
    const fila = ["", "", "", "", "", "García Juan"];
    expect(mapeo.leerDeFila(fila)).toEqual({
      apellido: "",
      nombre: "",
      crudo: "García Juan",
    });
  });

  it("coma sin apellido: no infiere nada, devuelve vacío más el crudo", () => {
    const fila = ["", "", "", "", "", ", Juan"];
    expect(mapeo.leerDeFila(fila)).toEqual({ apellido: "", nombre: "", crudo: ", Juan" });
  });

  it("coma sin nombre: no infiere nada, devuelve vacío más el crudo", () => {
    const fila = ["", "", "", "", "", "García,"];
    expect(mapeo.leerDeFila(fila)).toEqual({ apellido: "", nombre: "", crudo: "García," });
  });

  it("celda vacía: devuelve vacío con crudo también vacío", () => {
    const fila = ["", "", "", "", "", ""];
    expect(mapeo.leerDeFila(fila)).toEqual({ apellido: "", nombre: "", crudo: "" });
  });

  it("celdasParaEscribir devuelve una sola celda con 'Apellido, Nombre'", () => {
    expect(mapeo.celdasParaEscribir({ apellido: "García", nombre: "Juan" })).toEqual([
      { columna: 5, valor: "García, Juan" },
    ]);
  });

  it("columnasUsadas devuelve sólo la columna de nombre completo", () => {
    expect(mapeo.columnasUsadas()).toEqual([5]);
  });
});

// ── mapeoDeNombreDe (factory) ─────────────────────────────────

describe("mapeoDeNombreDe", () => {
  const baseConfig: ColumnConfig = {
    sheetName: "Alumnos",
    headerRows: 1,
    legajo: 0,
    apellido: 1,
    nombre: 2,
    githubUsername: 3,
    email: 4,
  };

  it("sin modoNombre configurado, devuelve un mapeo separado", () => {
    const mapeo = mapeoDeNombreDe(baseConfig);
    expect(mapeo).toBeInstanceOf(MapeoDeNombreSeparado);
    expect(mapeo.columnasUsadas()).toEqual([1, 2]);
  });

  it("modoNombre 'separado' explícito devuelve un mapeo separado", () => {
    const mapeo = mapeoDeNombreDe({ ...baseConfig, modoNombre: "separado" });
    expect(mapeo).toBeInstanceOf(MapeoDeNombreSeparado);
  });

  it("modoNombre 'completo' con columna configurada devuelve un mapeo completo", () => {
    const mapeo = mapeoDeNombreDe({
      ...baseConfig,
      modoNombre: "completo",
      nombreCompleto: 6,
    });
    expect(mapeo).toBeInstanceOf(MapeoDeNombreCompleto);
    expect(mapeo.columnasUsadas()).toEqual([6]);
  });

  it("modoNombre 'completo' sin columna configurada lanza error de invariante", () => {
    expect(() => mapeoDeNombreDe({ ...baseConfig, modoNombre: "completo" })).toThrow(
      ModoNombreCompletoSinColumnaError
    );
  });
});

// ── datosPersonales / configDeNombre ──────────────────────────

describe("MapeoDeNombre.datosPersonales y configDeNombre", () => {
  it("el separado expone apellido y nombre y persiste sólo el modo", () => {
    const mapeo = new MapeoDeNombreSeparado(1, 2);
    expect(mapeo.datosPersonales()).toEqual([
      { dato: "apellido", columna: 1 },
      { dato: "nombre", columna: 2 },
    ]);
    expect(mapeo.configDeNombre()).toEqual({ modoNombre: "separado" });
  });

  it("el completo expone nombreCompleto y persiste modo y columna", () => {
    const mapeo = new MapeoDeNombreCompleto(7);
    expect(mapeo.datosPersonales()).toEqual([{ dato: "nombreCompleto", columna: 7 }]);
    expect(mapeo.configDeNombre()).toEqual({ modoNombre: "completo", nombreCompleto: 7 });
  });
});

// ── datosPersonalesMapeados ───────────────────────────────────

const CONFIG_BASE: ConfigDeDatosPersonales = {
  legajo: 0,
  apellido: 1,
  nombre: 2,
  githubUsername: 3,
  email: 4,
  modoNombre: "separado",
};

describe("datosPersonalesMapeados", () => {
  it("en modo separado devuelve los cinco datos en orden", () => {
    expect(datosPersonalesMapeados(CONFIG_BASE)).toEqual([
      { dato: "legajo", columna: 0 },
      { dato: "githubUsername", columna: 3 },
      { dato: "email", columna: 4 },
      { dato: "apellido", columna: 1 },
      { dato: "nombre", columna: 2 },
    ]);
  });

  it("en modo completo devuelve los comunes más nombreCompleto", () => {
    expect(
      datosPersonalesMapeados({ ...CONFIG_BASE, modoNombre: "completo", nombreCompleto: 7 })
    ).toEqual([
      { dato: "legajo", columna: 0 },
      { dato: "githubUsername", columna: 3 },
      { dato: "email", columna: 4 },
      { dato: "nombreCompleto", columna: 7 },
    ]);
  });

  it("en modo completo sin columna lanza ModoNombreCompletoSinColumnaError", () => {
    expect(() => datosPersonalesMapeados({ ...CONFIG_BASE, modoNombre: "completo" })).toThrow(
      ModoNombreCompletoSinColumnaError
    );
  });
});

// ── problemasDeDatosPersonales ────────────────────────────────

describe("problemasDeDatosPersonales", () => {
  it("sin problemas devuelve una lista vacía", () => {
    expect(problemasDeDatosPersonales(CONFIG_BASE)).toEqual([]);
  });

  it("una colisión simple reporta los dos datos involucrados", () => {
    expect(problemasDeDatosPersonales({ ...CONFIG_BASE, email: 0 })).toEqual([
      { dato: "legajo", mensaje: MENSAJE_COLUMNA_REPETIDA },
      { dato: "email", mensaje: MENSAJE_COLUMNA_REPETIDA },
    ]);
  });

  it("modo completo sin columna reporta sólo nombreCompleto", () => {
    expect(problemasDeDatosPersonales({ ...CONFIG_BASE, modoNombre: "completo" })).toEqual([
      { dato: "nombreCompleto", mensaje: MENSAJE_NOMBRE_COMPLETO_OBLIGATORIO },
    ]);
  });

  it("modo completo sin columna sigue revisando las colisiones entre los comunes", () => {
    expect(
      problemasDeDatosPersonales({ ...CONFIG_BASE, modoNombre: "completo", email: 0 })
    ).toEqual([
      { dato: "nombreCompleto", mensaje: MENSAJE_NOMBRE_COMPLETO_OBLIGATORIO },
      { dato: "legajo", mensaje: MENSAJE_COLUMNA_REPETIDA },
      { dato: "email", mensaje: MENSAJE_COLUMNA_REPETIDA },
    ]);
  });

  it("en modo completo válido apellido y nombre no cuentan: apellido = nombreCompleto no colisiona", () => {
    expect(
      problemasDeDatosPersonales({
        ...CONFIG_BASE,
        modoNombre: "completo",
        apellido: 7,
        nombreCompleto: 7,
      })
    ).toEqual([]);
  });
});

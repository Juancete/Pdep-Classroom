import type { ColumnConfig } from "@/types";

export interface DatosDeNombre {
  apellido: string;
  nombre: string;
  crudo?: string;
}

export interface CeldaDeNombre {
  columna: number;
  valor: string;
}

export type DatoDeNombre = "apellido" | "nombre" | "nombreCompleto";
export type DatoPersonal = "legajo" | "githubUsername" | "email" | DatoDeNombre;

export interface DatoPersonalMapeado {
  dato: DatoPersonal;
  columna: number;
}

export type ConfigDeNombre = Pick<
  ColumnConfig,
  "apellido" | "nombre" | "modoNombre" | "nombreCompleto"
>;
export type ConfigDeDatosPersonales = Pick<ColumnConfig, "legajo" | "githubUsername" | "email"> &
  ConfigDeNombre;

// Cómo se lee y se escribe el nombre de un alumno en la planilla. Una
// cursada nueva trae apellido y nombre en columnas separadas; una cursada
// en marcha ya los trae consolidados en una sola columna "Apellido, Nombre".
// Dos modos con reglas de lectura y escritura distintas son dos ifs por
// "quién es el objeto" repartidos entre ambos flujos, así que se resuelven
// con Strategy en vez de ramificar en cada punto de uso.
export abstract class MapeoDeNombre {
  abstract leerDeFila(row: unknown[]): DatosDeNombre;
  abstract celdasParaEscribir(datos: { apellido: string; nombre: string }): CeldaDeNombre[];

  /** Datos de nombre que este mapeo lee y escribe, cada uno con su columna. */
  abstract datosPersonales(): Array<{ dato: DatoDeNombre; columna: number }>;

  /** Qué configuración de nombre se persiste: el mapeo decide, no el caller. */
  abstract configDeNombre(): Pick<ColumnConfig, "modoNombre" | "nombreCompleto">;

  columnasUsadas(): number[] {
    return this.datosPersonales().map(({ columna }) => columna);
  }
}

function normalizarCelda(valor: unknown): string {
  return String(valor ?? "").trim();
}

export class MapeoDeNombreSeparado extends MapeoDeNombre {
  constructor(
    private readonly columnaApellido: number,
    private readonly columnaNombre: number
  ) {
    super();
  }

  leerDeFila(row: unknown[]): DatosDeNombre {
    return {
      apellido: normalizarCelda(row[this.columnaApellido]),
      nombre: normalizarCelda(row[this.columnaNombre]),
    };
  }

  celdasParaEscribir(datos: { apellido: string; nombre: string }): CeldaDeNombre[] {
    return [
      { columna: this.columnaApellido, valor: datos.apellido.trim() },
      { columna: this.columnaNombre, valor: datos.nombre.trim() },
    ];
  }

  datosPersonales(): Array<{ dato: DatoDeNombre; columna: number }> {
    return [
      { dato: "apellido", columna: this.columnaApellido },
      { dato: "nombre", columna: this.columnaNombre },
    ];
  }

  configDeNombre(): Pick<ColumnConfig, "modoNombre" | "nombreCompleto"> {
    return { modoNombre: "separado" };
  }
}

export class MapeoDeNombreCompleto extends MapeoDeNombre {
  constructor(private readonly columnaNombreCompleto: number) {
    super();
  }

  leerDeFila(row: unknown[]): DatosDeNombre {
    const textoCompleto = normalizarCelda(row[this.columnaNombreCompleto]);
    const indiceDePrimeraComa = textoCompleto.indexOf(",");
    if (indiceDePrimeraComa === -1) {
      return { apellido: "", nombre: "", crudo: textoCompleto };
    }

    const apellido = textoCompleto.slice(0, indiceDePrimeraComa).trim();
    const nombre = textoCompleto.slice(indiceDePrimeraComa + 1).trim();
    if (!apellido || !nombre) {
      return { apellido: "", nombre: "", crudo: textoCompleto };
    }

    return { apellido, nombre };
  }

  celdasParaEscribir(datos: { apellido: string; nombre: string }): CeldaDeNombre[] {
    return [
      {
        columna: this.columnaNombreCompleto,
        valor: `${datos.apellido.trim()}, ${datos.nombre.trim()}`,
      },
    ];
  }

  datosPersonales(): Array<{ dato: DatoDeNombre; columna: number }> {
    return [{ dato: "nombreCompleto", columna: this.columnaNombreCompleto }];
  }

  configDeNombre(): Pick<ColumnConfig, "modoNombre" | "nombreCompleto"> {
    return { modoNombre: "completo", nombreCompleto: this.columnaNombreCompleto };
  }
}

// El modo "completo" exige la columna de nombre completo configurada. La
// validación del form (Fase 4) impide llegar a este estado desde la UI;
// queda acá como guardia de invariante para cualquier otro caller.
export class ModoNombreCompletoSinColumnaError extends Error {
  constructor() {
    super(
      "El modo de nombre completo requiere configurar la columna de nombre completo (nombreCompleto)."
    );
    this.name = "ModoNombreCompletoSinColumnaError";
  }
}

// Único lugar de producción que decide por `modoNombre` — el resto del código
// delega al objeto (el form cliente lo mira sólo para mostrar campos).
export function mapeoDeNombreDe(config: ConfigDeNombre): MapeoDeNombre {
  if (config.modoNombre === "completo") {
    if (config.nombreCompleto === undefined) {
      throw new ModoNombreCompletoSinColumnaError();
    }
    return new MapeoDeNombreCompleto(config.nombreCompleto);
  }
  return new MapeoDeNombreSeparado(config.apellido, config.nombre);
}

function datosComunes(config: ConfigDeDatosPersonales): DatoPersonalMapeado[] {
  return [
    { dato: "legajo", columna: config.legajo },
    { dato: "githubUsername", columna: config.githubUsername },
    { dato: "email", columna: config.email },
  ];
}

/**
 * Todos los datos personales de la hoja con su columna: los tres comunes más
 * los del nombre según el modo. Lanza `ModoNombreCompletoSinColumnaError` si
 * el modo completo no tiene columna.
 */
export function datosPersonalesMapeados(config: ConfigDeDatosPersonales): DatoPersonalMapeado[] {
  return [...datosComunes(config), ...mapeoDeNombreDe(config).datosPersonales()];
}

export interface ProblemaDeDatoPersonal {
  dato: DatoPersonal;
  mensaje: string;
}

export const MENSAJE_NOMBRE_COMPLETO_OBLIGATORIO =
  "La columna de nombre completo es obligatoria en modo 'completo'";
export const MENSAJE_COLUMNA_REPETIDA = "Esta columna ya está usada por otro dato personal";

/**
 * Validación completa de la configuración de datos personales, en un solo
 * lugar: columna de nombre completo faltante y columnas repetidas entre datos
 * personales (un dato mapeado a la misma columna que otro pisaría esa celda
 * al escribir). Si falta la columna de nombre completo, las colisiones se
 * siguen revisando entre los datos restantes (los comunes).
 */
export function problemasDeDatosPersonales(
  config: ConfigDeDatosPersonales
): ProblemaDeDatoPersonal[] {
  const problemas: ProblemaDeDatoPersonal[] = [];
  let datos: DatoPersonalMapeado[];
  try {
    datos = datosPersonalesMapeados(config);
  } catch (error) {
    if (!(error instanceof ModoNombreCompletoSinColumnaError)) throw error;
    problemas.push({ dato: "nombreCompleto", mensaje: MENSAJE_NOMBRE_COMPLETO_OBLIGATORIO });
    datos = datosComunes(config);
  }

  const datosPorColumna = new Map<number, DatoPersonal[]>();
  for (const { dato, columna } of datos) {
    const datosConEstaColumna = datosPorColumna.get(columna) ?? [];
    datosConEstaColumna.push(dato);
    datosPorColumna.set(columna, datosConEstaColumna);
  }
  for (const datosRepetidos of datosPorColumna.values()) {
    if (datosRepetidos.length < 2) continue;
    for (const dato of datosRepetidos) {
      problemas.push({ dato, mensaje: MENSAJE_COLUMNA_REPETIDA });
    }
  }
  return problemas;
}

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

// Cómo se lee y se escribe el nombre de un alumno en la planilla. Una
// cursada nueva trae apellido y nombre en columnas separadas; una cursada
// en marcha ya los trae consolidados en una sola columna "Apellido, Nombre".
// Dos modos con reglas de lectura y escritura distintas son dos ifs por
// "quién es el objeto" repartidos entre ambos flujos, así que se resuelven
// con Strategy en vez de ramificar en cada punto de uso.
export interface MapeoDeNombre {
  leerDeFila(row: unknown[]): DatosDeNombre;
  celdasParaEscribir(datos: { apellido: string; nombre: string }): CeldaDeNombre[];
  columnasUsadas(): number[];
}

function normalizarCelda(valor: unknown): string {
  return String(valor ?? "").trim();
}

export class MapeoDeNombreSeparado implements MapeoDeNombre {
  constructor(
    private readonly columnaApellido: number,
    private readonly columnaNombre: number
  ) {}

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

  columnasUsadas(): number[] {
    return [this.columnaApellido, this.columnaNombre];
  }
}

export class MapeoDeNombreCompleto implements MapeoDeNombre {
  constructor(private readonly columnaNombreCompleto: number) {}

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

  columnasUsadas(): number[] {
    return [this.columnaNombreCompleto];
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

// Único lugar que mira `modoNombre` — el resto del código delega al objeto.
export function mapeoDeNombreDe(config: ColumnConfig): MapeoDeNombre {
  if (config.modoNombre === "completo") {
    if (config.nombreCompleto === undefined) {
      throw new ModoNombreCompletoSinColumnaError();
    }
    return new MapeoDeNombreCompleto(config.nombreCompleto);
  }
  return new MapeoDeNombreSeparado(config.apellido, config.nombre);
}

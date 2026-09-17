import { google } from "googleapis";
import {
  Alumno,
  isValidEmail,
  validateRegistro,
  mapeoDeNombreDe,
  type RegistroInput,
} from "@/domain/entities";
import {
  type ColumnConfig,
  DEFAULT_COLUMN_CONFIG,
  type GruposColumnConfig,
  type Paradigma,
  PARADIGMAS,
} from "@/types";
import { colLetter, rangoDeHoja } from "@/lib/sheets-columns";
import { PlanillaNoDisponibleError } from "@/infrastructure/PlanillaNoDisponibleError";

export { isValidEmail, validateRegistro, colLetter };
export type { RegistroInput };

// ── Auth con service account ────────────────────────────────

function getSheetsClient(readonly = true) {
  const keyJson = Buffer.from(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "",
    "base64"
  ).toString("utf-8");

  const credentials = JSON.parse(keyJson);

  const scopes = readonly
    ? ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    : ["https://www.googleapis.com/auth/spreadsheets"];

  const auth = new google.auth.GoogleAuth({ credentials, scopes });
  return google.sheets({ version: "v4", auth });
}

// ── Helpers de configuración ─────────────────────────────────

function resolveConfig(config?: Partial<ColumnConfig>): ColumnConfig {
  return { ...DEFAULT_COLUMN_CONFIG, ...config };
}

function resolveSpreadsheetId(spreadsheetId?: string): string {
  if (!spreadsheetId) throw new Error("No hay una comisión activa con planilla configurada. Creá una comisión en /admin/comisiones.");
  return spreadsheetId;
}

// Calcula el rango para leer todas las filas de datos.
// La columna más alta usada determina el ancho del rango; las columnas de
// nombre dependen del modo (separado: apellido+nombre; completo: una sola).
function buildReadRange(config: ColumnConfig): string {
  const maxCol = Math.max(
    config.legajo, config.githubUsername, config.email,
    ...mapeoDeNombreDe(config).columnasUsadas()
  );
  const startRow = config.headerRows + 1;
  const endCol = colLetter(maxCol);
  return rangoDeHoja(config.sheetName, `A${startRow}:${endCol}500`);
}

// ── Parsear filas → Alumno[] (pura, testeable) ──────────────

export function parseAlumnosRows(
  rows: unknown[][],
  config: ColumnConfig = DEFAULT_COLUMN_CONFIG
): Alumno[] {
  const mapeoDeNombre = mapeoDeNombreDe(config);
  return rows
    .filter((row) => row[config.legajo] && row[config.githubUsername])
    .map((row) => {
      const alumno = new Alumno();
      const { apellido, nombre } = mapeoDeNombre.leerDeFila(row);
      alumno.aplicarRegistro({
        legajo: norm(row[config.legajo]),
        apellido,
        nombre,
        githubUsername: norm(row[config.githubUsername]),
        email: norm(row[config.email]),
      });
      return alumno;
    });
}

// ── Leer alumnos ────────────────────────────────────────────

export async function getAlumnos(
  spreadsheetId?: string,
  config?: Partial<ColumnConfig>
): Promise<Alumno[]> {
  const id = resolveSpreadsheetId(spreadsheetId);
  const columnConfig = resolveConfig(config);

  try {
    const sheets = getSheetsClient();
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: buildReadRange(columnConfig),
    });
    return parseAlumnosRows(data.values ?? [], columnConfig);
  } catch (error) {
    throw new Error(`No se pudo leer la planilla de alumnos: ${(error as Error).message}`);
  }
}

export async function getAlumnoByGithub(
  username: string,
  spreadsheetId?: string,
  config?: Partial<ColumnConfig>
): Promise<Alumno | undefined> {
  const all = await getAlumnos(spreadsheetId, config);
  return all.find(
    (alumno) => alumno.usernameCanonico === Alumno.normalizarUsername(username)
  );
}

export async function getAlumnoByLegajo(
  legajo: string,
  spreadsheetId?: string,
  config?: Partial<ColumnConfig>
): Promise<Alumno | undefined> {
  const all = await getAlumnos(spreadsheetId, config);
  return all.find((alumno) => alumno.legajo === legajo.trim());
}

// ── Precarga para registro (cursada en marcha) ──────────────
// A diferencia de getAlumnos/getAlumnoByGithub, no descarta filas sin
// legajo cuando la comisión permite precarga sin legajo (alumno que ya
// está en la planilla vigente pero nunca tuvo legajo asignado). Devuelve
// un tipo parcial, no un Alumno: no persiste nada ni inventa legajos.

export type DatosPrecargaAlumno = {
  legajo?: string;
  apellido?: string;
  nombre?: string;
  email?: string;
  nombreCrudo?: string;
};

export async function getDatosPrecargaByGithub(
  githubUsername: string,
  spreadsheetId?: string,
  config?: Partial<ColumnConfig>
): Promise<DatosPrecargaAlumno | undefined> {
  const id = resolveSpreadsheetId(spreadsheetId);
  const columnConfig = resolveConfig(config);
  const githubNormalizado = Alumno.normalizarUsername(githubUsername);

  let rows: unknown[][];
  try {
    const sheets = getSheetsClient();
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: buildReadRange(columnConfig),
    });
    rows = data.values ?? [];
  } catch (error) {
    throw new Error(`No se pudo leer la planilla de alumnos: ${(error as Error).message}`);
  }

  const fila = rows.find(
    (row) =>
      Alumno.normalizarUsername(row[columnConfig.githubUsername]) === githubNormalizado
  );
  if (!fila) return undefined;

  const legajo = norm(fila[columnConfig.legajo]);
  if (!legajo && !columnConfig.permitirPrecargaSinLegajo) return undefined;

  const { apellido, nombre, crudo } = mapeoDeNombreDe(columnConfig).leerDeFila(fila);
  const email = norm(fila[columnConfig.email]);

  return {
    legajo: legajo || undefined,
    apellido: apellido || undefined,
    nombre: nombre || undefined,
    email: email || undefined,
    nombreCrudo: crudo,
  };
}

// ── Encontrar el número de fila de un alumno (1-based, incluyendo header) ──
// Lee sólo la columna de github (no el rango ancho A→maxCol): más barato y
// no depende de dónde caiga el legajo ni ninguna otra columna mapeada.

async function findAlumnoRowIndex(
  githubUsername: string,
  spreadsheetId: string,
  config: ColumnConfig
): Promise<number | null> {
  const sheets = getSheetsClient();
  const startRow = config.headerRows + 1;
  const columnaGithub = colLetter(config.githubUsername);
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: rangoDeHoja(config.sheetName, `${columnaGithub}${startRow}:${columnaGithub}500`),
  });
  const rows = data.values ?? [];
  const rowIndex = rows.findIndex(
    (row) => Alumno.normalizarUsername(row[0]) === Alumno.normalizarUsername(githubUsername)
  );
  if (rowIndex === -1) return null;
  return config.headerRows + 1 + rowIndex;
}

// ── Upsert de alumno en la planilla ─────────────────────────
// Unifica registro (insert) y actualización (update): busca la fila por
// githubUsername; si existe, actualiza sólo las celdas de datos personales
// mapeadas (batchUpdate, una celda por dato); si no, agrega una fila al
// final. Nunca lee ni reescribe la fila entera: una cursada en marcha tiene
// fórmulas y notas en columnas intermedias que no hay que tocar.

export type UpsertAlumnoResult =
  | { ok: true }
  | { ok: false; error: string };

type CeldaAEscribir = { columna: number; valor: string };

function celdasDeDatosPersonales(
  input: RegistroInput,
  githubNormalizado: string,
  columnConfig: ColumnConfig
): CeldaAEscribir[] {
  const celdasDeNombre = mapeoDeNombreDe(columnConfig).celdasParaEscribir({
    apellido: input.apellido.trim(),
    nombre: input.nombre.trim(),
  });
  return [
    { columna: columnConfig.legajo, valor: input.legajo.trim() },
    { columna: columnConfig.githubUsername, valor: githubNormalizado },
    { columna: columnConfig.email, valor: Alumno.normalizarEmail(input.email) },
    ...celdasDeNombre,
  ];
}

// La coherencia legajo↔github la garantiza la DB (upsertAlumno →
// LegajoConflictError). Este upsert solo refleja en Sheets lo que ya
// validó y persistió la DB; el caller debe invocarlo después del upsert
// en DB para evitar escribir Sheets si hay conflicto.
//
// Un error de la API de Sheets al buscar la fila o escribirla (típicamente
// un 403 porque la service account no tiene rol Editor sobre la planilla,
// issue #92) sale como `PlanillaNoDisponibleError`, no crudo del SDK: el
// caller ya validó y persistió en DB, así que esto es una falla operativa
// de la planilla, no un dato inválido del alumno.
export async function upsertarAlumnoEnSheets(
  input: RegistroInput,
  spreadsheetId?: string,
  config?: Partial<ColumnConfig>
): Promise<UpsertAlumnoResult> {
  const validationError = validateRegistro(input);
  if (validationError) return { ok: false, error: validationError };

  const id = resolveSpreadsheetId(spreadsheetId);
  const columnConfig = resolveConfig(config);
  const githubNormalizado = Alumno.normalizarUsername(input.githubUsername);
  const celdas = celdasDeDatosPersonales(input, githubNormalizado, columnConfig);

  try {
    const rowNumber = await findAlumnoRowIndex(githubNormalizado, id, columnConfig);
    const sheets = getSheetsClient(false);

    if (rowNumber === null) {
      const maxCol = Math.max(...celdas.map((celda) => celda.columna));
      const row = new Array(maxCol + 1).fill("");
      for (const celda of celdas) row[celda.columna] = celda.valor;

      await sheets.spreadsheets.values.append({
        spreadsheetId: id,
        range: rangoDeHoja(columnConfig.sheetName, `A:${colLetter(maxCol)}`),
        valueInputOption: "RAW",
        requestBody: { values: [row] },
      });
      return { ok: true };
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        valueInputOption: "RAW",
        data: celdas.map((celda) => ({
          range: rangoDeHoja(columnConfig.sheetName, `${colLetter(celda.columna)}${rowNumber}`),
          values: [[celda.valor]],
        })),
      },
    });
    return { ok: true };
  } catch (error) {
    throw new PlanillaNoDisponibleError(error);
  }
}

// ── Hoja de grupos ──────────────────────────────────────────

// Una fila parseada de la hoja de grupos: alumno + paradigma + nombre del grupo.
// Un mismo alumno puede aparecer en varias asignaciones (una por paradigma).
export interface AsignacionGrupoRow {
  githubUsername: string;
  paradigma: Paradigma;
  nombreGrupo: string;
}

function buildGruposReadRange(config: GruposColumnConfig): string {
  const gruposCols = PARADIGMAS
    .map((paradigma) => config.nombreGrupoPorParadigma[paradigma])
    .filter((value): value is number => typeof value === "number");
  const maxCol = Math.max(config.githubUsername, ...gruposCols);
  const startRow = config.headerRows + 1;
  return rangoDeHoja(config.sheetName, `A${startRow}:${colLetter(maxCol)}500`);
}

export function parseAsignacionesGrupos(
  rows: unknown[][],
  config: GruposColumnConfig
): AsignacionGrupoRow[] {
  const result: AsignacionGrupoRow[] = [];
  for (const row of rows) {
    const github = Alumno.normalizarUsername(row[config.githubUsername]);
    if (!github) continue;
    for (const paradigma of PARADIGMAS) {
      const colIndex = config.nombreGrupoPorParadigma[paradigma];
      if (colIndex === undefined) continue;
      const nombreGrupo = norm(row[colIndex]);
      if (!nombreGrupo) continue;
      result.push({ githubUsername: github, paradigma, nombreGrupo });
    }
  }
  return result;
}

export async function getAsignacionesGrupos(
  spreadsheetId: string,
  config: GruposColumnConfig
): Promise<AsignacionGrupoRow[]> {
  const id = resolveSpreadsheetId(spreadsheetId);
  try {
    const sheets = getSheetsClient();
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: buildGruposReadRange(config),
    });
    return parseAsignacionesGrupos(data.values ?? [], config);
  } catch (error) {
    throw new Error(`No se pudo leer la hoja de grupos: ${(error as Error).message}`);
  }
}

// ── Nombres de hojas del spreadsheet ────────────────────────

export async function getSheetNames(spreadsheetId: string): Promise<string[]> {
  const id = resolveSpreadsheetId(spreadsheetId);
  const sheets = getSheetsClient();
  const { data } = await sheets.spreadsheets.get({
    spreadsheetId: id,
    fields: "sheets.properties.title",
  });
  return (data.sheets ?? [])
    .map((sheet) => sheet.properties?.title ?? "")
    .filter(Boolean);
}

// ── Helpers ─────────────────────────────────────────────────

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

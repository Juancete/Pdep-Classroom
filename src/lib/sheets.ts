import { google } from "googleapis";
import { Alumno } from "@/domain/entities";
import {
  type ColumnConfig,
  DEFAULT_COLUMN_CONFIG,
  type GruposColumnConfig,
  type Paradigma,
  PARADIGMAS,
} from "@/types";

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
// La columna más alta usada determina el ancho del rango.
function buildReadRange(config: ColumnConfig): string {
  const maxCol = Math.max(
    config.legajo, config.apellido, config.nombre,
    config.githubUsername, config.email
  );
  const startRow = config.headerRows + 1;
  const endCol = colLetter(maxCol);
  return `${config.sheetName}!A${startRow}:${endCol}500`;
}

// Convierte índice 0-based a letra de columna (0→A, 25→Z, 26→AA…)
export function colLetter(index: number): string {
  let result = "";
  let remaining = index;
  do {
    result = String.fromCharCode(65 + (remaining % 26)) + result;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return result;
}

// ── Parsear filas → Alumno[] (pura, testeable) ──────────────

export function parseAlumnosRows(
  rows: unknown[][],
  config: ColumnConfig = DEFAULT_COLUMN_CONFIG
): Alumno[] {
  return rows
    .filter((row) => row[config.legajo] && row[config.githubUsername])
    .map((row) => {
      const alumno = new Alumno();
      alumno.legajo = norm(row[config.legajo]);
      alumno.apellido = norm(row[config.apellido]);
      alumno.nombre = norm(row[config.nombre]);
      alumno.githubUsername = Alumno.normalizarUsername(row[config.githubUsername]);
      alumno.email = norm(row[config.email]);
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

// ── Encontrar el número de fila de un alumno (1-based, incluyendo header) ──

async function findAlumnoRowIndex(
  githubUsername: string,
  spreadsheetId: string,
  config: ColumnConfig
): Promise<number | null> {
  const sheets = getSheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: buildReadRange(config),
  });
  const rows = data.values ?? [];
  const rowIndex = rows.findIndex(
    (row) =>
      Alumno.normalizarUsername(row[config.githubUsername]) ===
      Alumno.normalizarUsername(githubUsername)
  );
  if (rowIndex === -1) return null;
  return config.headerRows + 1 + rowIndex;
}

// ── Registro de alumno ──────────────────────────────────────

export interface RegistroInput {
  legajo: string;
  apellido: string;
  nombre: string;
  githubUsername: string;
  email: string;
}

// Regex de email RFC-lite: una arroba, algún dominio, un punto después.
// Suficiente para detectar typos comunes sin sobre-complicar.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function validateRegistro(input: RegistroInput): string | null {
  const { legajo, apellido, nombre, githubUsername, email } = input;

  if (!legajo || !new RegExp(`^${Alumno.LEGAJO_PATTERN}$`).test(legajo.trim()))
    return "El legajo debe tener entre 4 y 8 dígitos";
  if (!apellido.trim()) return "El apellido es obligatorio";
  if (!nombre.trim()) return "El nombre es obligatorio";
  if (typeof githubUsername !== "string")
    return "El usuario de GitHub debe ser un texto";
  if (!githubUsername.trim()) return "El usuario de GitHub es obligatorio";
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(githubUsername.trim()))
    return "El usuario de GitHub no tiene un formato válido";
  if (!isValidEmail(email)) return "El email no es válido";
  return null;
}

// ── Upsert de alumno en la planilla ─────────────────────────
// Unifica registro (insert) y actualización (update): busca la fila por
// githubUsername; si existe, la actualiza respetando columnas desconocidas,
// y si no, la agrega al final.

export type UpsertAlumnoResult =
  | { ok: true }
  | { ok: false; error: string };

// La coherencia legajo↔github la garantiza la DB (upsertAlumno →
// LegajoConflictError). Este upsert solo refleja en Sheets lo que ya
// validó y persistió la DB; el caller debe invocarlo después del upsert
// en DB para evitar escribir Sheets si hay conflicto.
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

  const rowNumber = await findAlumnoRowIndex(githubNormalizado, id, columnConfig);
  const sheets = getSheetsClient(false);
  const maxCol = Math.max(
    columnConfig.legajo, columnConfig.apellido, columnConfig.nombre,
    columnConfig.githubUsername, columnConfig.email
  );

  if (rowNumber === null) {
    const row = new Array(maxCol + 1).fill("");
    row[columnConfig.legajo] = input.legajo.trim();
    row[columnConfig.apellido] = input.apellido.trim();
    row[columnConfig.nombre] = input.nombre.trim();
    row[columnConfig.githubUsername] = githubNormalizado;
    row[columnConfig.email] = Alumno.normalizarEmail(input.email);

    await sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: `${columnConfig.sheetName}!A:${colLetter(maxCol)}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });
    return { ok: true };
  }

  const range = `${columnConfig.sheetName}!A${rowNumber}:${colLetter(maxCol)}${rowNumber}`;
  const { data: existing } = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range,
  });
  const existingRow: unknown[] = existing.values?.[0] ?? [];
  while (existingRow.length <= maxCol) existingRow.push("");

  existingRow[columnConfig.legajo] = input.legajo.trim();
  existingRow[columnConfig.apellido] = input.apellido.trim();
  existingRow[columnConfig.nombre] = input.nombre.trim();
  existingRow[columnConfig.email] = Alumno.normalizarEmail(input.email);

  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [existingRow] },
  });
  return { ok: true };
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
  return `${config.sheetName}!A${startRow}:${colLetter(maxCol)}500`;
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

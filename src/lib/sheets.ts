import { google } from "googleapis";
import { Alumno } from "@/domain/entities";
import { type ColumnConfig, DEFAULT_COLUMN_CONFIG } from "@/types";

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
  let n = index;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
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
      const a = new Alumno();
      a.legajo = norm(row[config.legajo]);
      a.apellido = norm(row[config.apellido]);
      a.nombre = norm(row[config.nombre]);
      a.githubUsername = norm(row[config.githubUsername]).replace("@", "").toLowerCase();
      a.email = norm(row[config.email]);
      // comision es una relación ManyToOne — no se puede resolver desde la planilla
      return a;
    });
}

// ── Leer alumnos ────────────────────────────────────────────

export async function getAlumnos(
  spreadsheetId?: string,
  config?: Partial<ColumnConfig>
): Promise<Alumno[]> {
  const id = resolveSpreadsheetId(spreadsheetId);
  const cfg = resolveConfig(config);

  try {
    const sheets = getSheetsClient();
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: buildReadRange(cfg),
    });
    return parseAlumnosRows(data.values ?? [], cfg);
  } catch (e) {
    throw new Error(`No se pudo leer la planilla de alumnos: ${(e as Error).message}`);
  }
}

export async function getAlumnoByGithub(
  username: string,
  spreadsheetId?: string,
  config?: Partial<ColumnConfig>
): Promise<Alumno | undefined> {
  const all = await getAlumnos(spreadsheetId, config);
  return all.find(
    (a) => a.githubUsername.toLowerCase() === username.toLowerCase()
  );
}

export async function getAlumnoByLegajo(
  legajo: string,
  spreadsheetId?: string,
  config?: Partial<ColumnConfig>
): Promise<Alumno | undefined> {
  const all = await getAlumnos(spreadsheetId, config);
  return all.find((a) => a.legajo === legajo.trim());
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
  const idx = rows.findIndex(
    (row) =>
      norm(row[config.githubUsername]).replace("@", "").toLowerCase() ===
      githubUsername.toLowerCase()
  );
  if (idx === -1) return null;
  // idx es 0-based dentro de los datos; la fila real = headerRows + 1 + idx
  return config.headerRows + 1 + idx;
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

  if (!legajo || !/^\d{4,8}$/.test(legajo.trim()))
    return "El legajo debe tener entre 4 y 8 dígitos";
  if (!apellido.trim()) return "El apellido es obligatorio";
  if (!nombre.trim()) return "El nombre es obligatorio";
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
  | { ok: false; error: string; field?: "legajo" | "githubUsername" };

export async function upsertarAlumnoEnSheets(
  input: RegistroInput,
  spreadsheetId?: string,
  config?: Partial<ColumnConfig>
): Promise<UpsertAlumnoResult> {
  const validationError = validateRegistro(input);
  if (validationError) return { ok: false, error: validationError };

  const id = resolveSpreadsheetId(spreadsheetId);
  const cfg = resolveConfig(config);
  const githubNormalizado = input.githubUsername.trim().toLowerCase();

  // El legajo debe pertenecer al mismo github o a nadie — si ya es de otro
  // alumno es conflicto, tanto al insertar como al editar.
  const porLegajo = await getAlumnoByLegajo(input.legajo, id, cfg);
  if (porLegajo && porLegajo.githubUsername.toLowerCase() !== githubNormalizado) {
    return {
      ok: false,
      error: `El legajo ${input.legajo} ya está registrado con el usuario @${porLegajo.githubUsername}. Verificá que sea el tuyo.`,
      field: "legajo",
    };
  }

  const rowNumber = await findAlumnoRowIndex(githubNormalizado, id, cfg);
  const sheets = getSheetsClient(false);
  const maxCol = Math.max(
    cfg.legajo, cfg.apellido, cfg.nombre,
    cfg.githubUsername, cfg.email
  );

  if (rowNumber === null) {
    const row = new Array(maxCol + 1).fill("");
    row[cfg.legajo] = input.legajo.trim();
    row[cfg.apellido] = input.apellido.trim();
    row[cfg.nombre] = input.nombre.trim();
    row[cfg.githubUsername] = githubNormalizado;
    row[cfg.email] = input.email.trim().toLowerCase();

    await sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: `${cfg.sheetName}!A:${colLetter(maxCol)}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });
    return { ok: true };
  }

  // Leemos la fila completa para no pisar columnas desconocidas que el admin
  // pueda tener (notas, observaciones, etc).
  const range = `${cfg.sheetName}!A${rowNumber}:${colLetter(maxCol)}${rowNumber}`;
  const { data: existing } = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range,
  });
  const existingRow: unknown[] = existing.values?.[0] ?? [];
  while (existingRow.length <= maxCol) existingRow.push("");

  existingRow[cfg.legajo] = input.legajo.trim();
  existingRow[cfg.apellido] = input.apellido.trim();
  existingRow[cfg.nombre] = input.nombre.trim();
  existingRow[cfg.email] = input.email.trim().toLowerCase();
  // githubUsername NO se sobrescribe: la fila se identifica por él.

  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [existingRow] },
  });
  return { ok: true };
}

// ── Helpers ─────────────────────────────────────────────────

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

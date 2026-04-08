import { google } from "googleapis";
import type { Alumno, Grupo, Paradigma } from "@/types";

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

// ── Parsear filas → Alumno[] (pura, testeable) ──────────────

export function parseAlumnosRows(rows: unknown[][]): Alumno[] {
  return rows
    .filter((row) => row[0] && row[3]) // legajo + github obligatorios
    .map((row) => ({
      legajo: norm(row[0]),
      apellido: norm(row[1]),
      nombre: norm(row[2]),
      githubUsername: norm(row[3]).replace("@", "").toLowerCase(),
      email: norm(row[4]),
      comision: norm(row[5]) || "miércoles noche",
    }));
}

// ── Leer alumnos ────────────────────────────────────────────

export async function getAlumnos(): Promise<Alumno[]> {
  const id = process.env.GOOGLE_SHEET_ALUMNOS_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ALUMNOS_ID no está configurado.");

  try {
    const sheets = getSheetsClient();
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: "Alumnos!A2:F500",
    });
    return parseAlumnosRows(data.values ?? []);
  } catch (e) {
    throw new Error(`No se pudo leer la planilla de alumnos: ${(e as Error).message}`);
  }
}

export async function getAlumnoByGithub(
  username: string
): Promise<Alumno | undefined> {
  const all = await getAlumnos();
  return all.find(
    (a) => a.githubUsername.toLowerCase() === username.toLowerCase()
  );
}

export async function getAlumnoByLegajo(
  legajo: string
): Promise<Alumno | undefined> {
  const all = await getAlumnos();
  return all.find((a) => a.legajo === legajo.trim());
}

// ── Registro de alumno ──────────────────────────────────────

export interface RegistroInput {
  legajo: string;
  apellido: string;
  nombre: string;
  githubUsername: string;
  email: string;
  comision: string;
}

export function validateRegistro(input: RegistroInput): string | null {
  const { legajo, apellido, nombre, githubUsername, email, comision } = input;

  if (!legajo || !/^\d{4,8}$/.test(legajo.trim()))
    return "El legajo debe tener entre 4 y 8 dígitos";
  if (!apellido.trim()) return "El apellido es obligatorio";
  if (!nombre.trim()) return "El nombre es obligatorio";
  if (!githubUsername.trim()) return "El usuario de GitHub es obligatorio";
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(githubUsername.trim()))
    return "El usuario de GitHub no tiene un formato válido";
  if (!email.trim() || !email.includes("@")) return "El email no es válido";
  if (!comision.trim()) return "La comisión es obligatoria";
  return null;
}

export async function registrarAlumno(
  input: RegistroInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const validationError = validateRegistro(input);
  if (validationError) return { ok: false, error: validationError };

  const spreadsheetId = process.env.GOOGLE_SHEET_ALUMNOS_ID;
  if (!spreadsheetId) return { ok: false, error: "Planilla no configurada" };

  // Verificar duplicados
  const porLegajo = await getAlumnoByLegajo(input.legajo);
  if (porLegajo) {
    return {
      ok: false,
      error: `El legajo ${input.legajo} ya está registrado (${porLegajo.githubUsername})`,
    };
  }

  const porGithub = await getAlumnoByGithub(input.githubUsername);
  if (porGithub) {
    return {
      ok: false,
      error: `El usuario ${input.githubUsername} ya está registrado (legajo ${porGithub.legajo})`,
    };
  }

  // Escribir fila en la planilla
  const sheets = getSheetsClient(false);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Alumnos!A:F",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          input.legajo.trim(),
          input.apellido.trim(),
          input.nombre.trim(),
          input.githubUsername.trim().toLowerCase(),
          input.email.trim().toLowerCase(),
          input.comision.trim(),
        ],
      ],
    },
  });

  return { ok: true };
}

// ── Grupos ──────────────────────────────────────────────────

export function parseGruposRows(
  rows: unknown[][],
  paradigma?: Paradigma
): Grupo[] {
  const grupos: Grupo[] = rows
    .filter((row) => row[0] && row[1])
    .map((row) => ({
      id: norm(row[0]).toLowerCase().replace(/\s+/g, "-"),
      nombre: norm(row[0]),
      paradigma: norm(row[1]).toLowerCase() as Paradigma,
      miembros: row
        .slice(2)
        .map((m) => norm(m).replace("@", "").toLowerCase())
        .filter(Boolean),
    }));

  if (paradigma) return grupos.filter((g) => g.paradigma === paradigma);
  return grupos;
}

export async function getGrupos(paradigma?: Paradigma): Promise<Grupo[]> {
  const id = process.env.GOOGLE_SHEET_ALUMNOS_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ALUMNOS_ID no está configurado.");

  try {
    const sheets = getSheetsClient();
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: "Grupos!A2:H100",
    });
    return parseGruposRows(data.values ?? [], paradigma);
  } catch (e) {
    throw new Error(`No se pudo leer la planilla de grupos: ${(e as Error).message}`);
  }
}

export async function getGrupoDeAlumno(
  githubUsername: string,
  paradigma: Paradigma
): Promise<Grupo | undefined> {
  const grupos = await getGrupos(paradigma);
  return grupos.find((g) =>
    g.miembros.some((m) => m.toLowerCase() === githubUsername.toLowerCase())
  );
}

// ── Helpers ─────────────────────────────────────────────────

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

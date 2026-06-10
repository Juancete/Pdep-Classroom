"use server";

import { requireAdmin } from "@/lib/session";
import {
  createComision,
  updateComision,
  getComision,
  LegajoConflictError,
  getAlumnosByComision,
  getAlumnosConGoogleGroupPendiente,
  ComisionActivaDuplicadaError,
} from "@/lib/repositories";
import { getAsignacionesGrupos, getSheetNames, type AsignacionGrupoRow } from "@/lib/sheets";
import { intentarSincronizarGrupos } from "@/lib/services/intentarSincronizarGrupos";
import {
  importarAlumnosDeComision,
  LecturaPlanillaAlumnosError,
} from "@/lib/services/importarAlumnosDeComision";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_COLUMN_CONFIG, type GruposColumnConfig } from "@/types";
import { intentarSincronizarGoogleGroup } from "@/lib/services/intentarSincronizarGoogleGroup";
import { isGoogleGroupsConfigured } from "@/lib/googleGroups";

export type ComisionFormState =
  | { ok: false; errors: Record<string, string[] | undefined> }
  | null;

export async function fetchSheetNames(
  spreadsheetId: string
): Promise<string[] | { error: string }> {
  await requireAdmin();
  if (!spreadsheetId.trim()) return { error: "Ingresá el ID de la planilla primero" };
  try {
    return await getSheetNames(spreadsheetId);
  } catch (error) {
    return { error: (error as Error).message };
  }
}

const ColumnIndexSchema = z.coerce
  .number({ invalid_type_error: "Debe ser un número de columna" })
  .int()
  .min(0, "Columna inválida")
  .max(25, "Columna inválida");

// "" → undefined para columnas opcionales de grupos: la UI envía string vacío
// cuando el admin elige "(sin columna)".
const OptionalColumnIndexSchema = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? undefined : value),
  ColumnIndexSchema.optional()
);

const ComisionSchema = z.object({
  anio: z.coerce
    .number({ invalid_type_error: "El año es obligatorio" })
    .int()
    .min(2020, "Año inválido")
    .max(2100, "Año inválido"),
  spreadsheetId: z.string().min(1, "El ID de la planilla es obligatorio"),
  activa: z.coerce.boolean().optional().transform((value) => value ?? false),
  sheetName: z.string().min(1, "El nombre de la hoja es obligatorio"),
  headerRows: z.coerce.number().int().min(0).max(10),
  col_legajo: ColumnIndexSchema,
  col_apellido: ColumnIndexSchema,
  col_nombre: ColumnIndexSchema,
  col_githubUsername: ColumnIndexSchema,
  col_email: ColumnIndexSchema,
  grupos_enabled: z.coerce.boolean().optional().transform((value) => value ?? false),
  grupos_sheetName: z.string().optional(),
  grupos_headerRows: z.coerce.number().int().min(0).max(10).optional(),
  grupos_col_githubUsername: OptionalColumnIndexSchema,
  grupos_col_funcional: OptionalColumnIndexSchema,
  grupos_col_logico: OptionalColumnIndexSchema,
  grupos_col_objetos: OptionalColumnIndexSchema,
});

function parseFormData(formData: FormData) {
  return {
    anio: formData.get("anio") ?? undefined,
    spreadsheetId: (formData.get("spreadsheetId") as string) || "",
    activa: formData.get("activa") === "on",
    sheetName: (formData.get("sheetName") as string) || DEFAULT_COLUMN_CONFIG.sheetName,
    headerRows: formData.get("headerRows") ?? DEFAULT_COLUMN_CONFIG.headerRows,
    col_legajo: formData.get("col_legajo") ?? DEFAULT_COLUMN_CONFIG.legajo,
    col_apellido: formData.get("col_apellido") ?? DEFAULT_COLUMN_CONFIG.apellido,
    col_nombre: formData.get("col_nombre") ?? DEFAULT_COLUMN_CONFIG.nombre,
    col_githubUsername: formData.get("col_githubUsername") ?? DEFAULT_COLUMN_CONFIG.githubUsername,
    col_email: formData.get("col_email") ?? DEFAULT_COLUMN_CONFIG.email,
    grupos_enabled: formData.get("grupos_enabled") === "on",
    grupos_sheetName: (formData.get("grupos_sheetName") as string) ?? undefined,
    grupos_headerRows: formData.get("grupos_headerRows") ?? undefined,
    grupos_col_githubUsername: formData.get("grupos_col_githubUsername") ?? undefined,
    grupos_col_funcional: formData.get("grupos_col_funcional") ?? undefined,
    grupos_col_logico: formData.get("grupos_col_logico") ?? undefined,
    grupos_col_objetos: formData.get("grupos_col_objetos") ?? undefined,
  };
}

function toColumnConfig(data: z.infer<typeof ComisionSchema>) {
  const base = {
    sheetName: data.sheetName,
    headerRows: data.headerRows,
    legajo: data.col_legajo,
    apellido: data.col_apellido,
    nombre: data.col_nombre,
    githubUsername: data.col_githubUsername,
    email: data.col_email,
  };

  if (!data.grupos_enabled) return base;

  // Si el admin activó la sección de grupos pero no completó los campos mínimos,
  // guardamos igual los defaults para no perder intención: sheetName cae a
  // "Alumnos" y githubUsername al de la hoja de alumnos.
  const nombreGrupoPorParadigma: GruposColumnConfig["nombreGrupoPorParadigma"] = {};
  if (data.grupos_col_funcional !== undefined) nombreGrupoPorParadigma.funcional = data.grupos_col_funcional;
  if (data.grupos_col_logico !== undefined) nombreGrupoPorParadigma.logico = data.grupos_col_logico;
  if (data.grupos_col_objetos !== undefined) nombreGrupoPorParadigma.objetos = data.grupos_col_objetos;

  // Si el admin activó la sección pero no mapeó ninguna columna de grupo, la
  // config es inútil — la omitimos para que la sync sea no-op, igual que si
  // no hubiera activado nada.
  if (Object.keys(nombreGrupoPorParadigma).length === 0) return base;

  const grupos: GruposColumnConfig = {
    sheetName: data.grupos_sheetName || data.sheetName,
    headerRows: data.grupos_headerRows ?? data.headerRows,
    githubUsername: data.grupos_col_githubUsername ?? data.col_githubUsername,
    nombreGrupoPorParadigma,
  };

  return { ...base, grupos };
}

export async function crearComision(
  _prevState: ComisionFormState,
  formData: FormData
): Promise<ComisionFormState> {
  await requireAdmin();

  const raw = parseFormData(formData);
  const result = ComisionSchema.safeParse(raw);

  if (!result.success) {
    return { ok: false, errors: result.error.flatten().fieldErrors };
  }

  const { anio, spreadsheetId, activa } = result.data;
  try {
    await createComision({
      anio,
      spreadsheetId,
      activa,
      columnConfig: toColumnConfig(result.data),
    });
  } catch (error) {
    if (error instanceof ComisionActivaDuplicadaError) {
      return {
        ok: false,
        errors: {
          activa: [
            "Otra comisión fue activada al mismo tiempo. Recargá la página y volvé a intentar.",
          ],
        },
      };
    }
    throw error;
  }
  redirect("/admin/comisiones");
}

export async function actualizarComision(
  _prevState: ComisionFormState,
  formData: FormData
): Promise<ComisionFormState> {
  await requireAdmin();

  const id = formData.get("id") as string;
  const raw = parseFormData(formData);
  const result = ComisionSchema.safeParse(raw);

  if (!result.success) {
    return { ok: false, errors: result.error.flatten().fieldErrors };
  }

  const { anio, spreadsheetId, activa } = result.data;
  try {
    await updateComision(id, {
      anio,
      spreadsheetId,
      activa,
      columnConfig: toColumnConfig(result.data),
    });
  } catch (error) {
    if (error instanceof ComisionActivaDuplicadaError) {
      return {
        ok: false,
        errors: {
          activa: [
            "Otra comisión fue activada al mismo tiempo. Recargá la página y volvé a intentar.",
          ],
        },
      };
    }
    throw error;
  }
  redirect("/admin/comisiones");
}

export type SyncState =
  | { status: "idle" }
  | { status: "ok"; sincronizados: number; conErrorDeGrupo: number }
  | { status: "error"; message: string };

export async function sincronizarAlumnos(
  _prevState: SyncState,
  formData: FormData
): Promise<SyncState> {
  await requireAdmin();

  const id = formData.get("comisionId") as string;
  const comision = await getComision(id);
  if (!comision) return { status: "error", message: "Comisión no encontrada" };

  try {
    const { sincronizados, conErrorDeGrupo } = await importarAlumnosDeComision(comision);
    revalidatePath("/admin/comisiones");
    return { status: "ok", sincronizados, conErrorDeGrupo };
  } catch (error) {
    if (error instanceof LecturaPlanillaAlumnosError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof LegajoConflictError) {
      return { status: "error", message: error.message };
    }
    throw error;
  }
}

export type SyncGruposState =
  | { status: "idle" }
  | { status: "ok"; sincronizados: number; aunConError: number }
  | { status: "error"; message: string };

// Importa los grupos desde la planilla para todos los alumnos de la comisión.
// Útil para bootstrapping cuando la cursada ya está en marcha al desplegar.
// El wrapper `intentarSincronizarGrupos` se encarga del logging y de actualizar
// el flag por alumno; esta action solo agrega un resumen para que el admin lo vea.
export async function sincronizarGruposDeLaComision(
  _prevState: SyncGruposState,
  formData: FormData
): Promise<SyncGruposState> {
  await requireAdmin();

  const id = formData.get("comisionId") as string;
  const comision = await getComision(id);
  if (!comision) return { status: "error", message: "Comisión no encontrada" };

  const alumnos = await getAlumnosByComision(id);

  // Lectura única de la hoja de grupos: con N alumnos evitamos N lecturas a
  // Sheets (cada alumno releía la hoja entera). Si la lectura falla reportamos
  // el error global y no modificamos los flags.
  let asignaciones: AsignacionGrupoRow[] | undefined;
  const gruposConfig = comision.gruposConfig();
  if (gruposConfig && alumnos.length > 0) {
    try {
      asignaciones = await getAsignacionesGrupos(comision.spreadsheetId, gruposConfig);
    } catch (error) {
      return { status: "error", message: (error as Error).message };
    }
  }

  let sincronizados = 0;
  let aunConError = 0;
  for (const alumno of alumnos) {
    try {
      await intentarSincronizarGrupos(alumno.githubUsername, comision, asignaciones);
      sincronizados++;
    } catch {
      aunConError++;
    }
  }

  revalidatePath("/admin/comisiones");
  revalidatePath(`/admin/comisiones/${id}/edit`);
  return { status: "ok", sincronizados, aunConError };
}

export type SyncGoogleGroupState =
  | { status: "idle" }
  | {
      status: "ok";
      sincronizados: number;
      omitidos: number;
      aunConError: number;
    }
  | { status: "error"; message: string };

export async function sincronizarGoogleGroupsDeLaComision(
  _prevState: SyncGoogleGroupState,
  formData: FormData
): Promise<SyncGoogleGroupState> {
  await requireAdmin();

  const id = formData.get("comisionId") as string;
  const comision = await getComision(id);
  if (!comision) return { status: "error", message: "Comisión no encontrada" };

  const alumnos = await getAlumnosConGoogleGroupPendiente(
    id,
    isGoogleGroupsConfigured()
  );
  let sincronizados = 0;
  let omitidos = 0;
  let aunConError = 0;

  for (const alumno of alumnos) {
    const resultado = await intentarSincronizarGoogleGroup(
      alumno.githubUsername
    );
    if (
      resultado.status === "added" ||
      resultado.status === "already_member"
    ) {
      sincronizados++;
    } else if (resultado.status === "skipped") {
      omitidos++;
    } else {
      aunConError++;
    }
  }

  revalidatePath(`/admin/comisiones/${id}/edit`);
  revalidatePath("/perfil");
  return { status: "ok", sincronizados, omitidos, aunConError };
}

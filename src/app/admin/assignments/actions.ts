"use server";

import { requireAdmin } from "@/infrastructure/auth/session";
import {
  ComisionActivaRequeridaError,
  AssignmentEstructuraInmutableError,
  createAssignment,
  updateAssignment,
  getComisionActiva,
  getAssignment,
} from "@/infrastructure/repositories";
import {
  type Comision,
  AssignmentNoEncontradoError,
  AssignmentNoGrupalError,
} from "@/domain/entities";
import { redirect } from "next/navigation";
import { AssignmentSchema, AssignmentFormState } from "@/lib/assignment-schema";
import {
  volcarGruposAPlanilla,
  ColumnaDeGrupoNoConfiguradaError,
  AssignmentSinComisionError,
} from "@/application/volcarGruposAPlanilla";
import { PlanillaNoDisponibleError } from "@/infrastructure/PlanillaNoDisponibleError";

// Issue #109: la columna elegida para volcar el grupo no puede coincidir
// con una columna de datos personales del alumno en la hoja de la comisión.
const MENSAJE_COLUMNA_OCUPADA = "Esta columna ya está usada por un dato personal del alumno.";

function parseFormData(formData: FormData) {
  return {
    titulo: formData.get("titulo") as string,
    slug: (formData.get("slug") as string) || "",
    descripcion: (formData.get("descripcion") as string) || "",
    templateRepo: formData.get("templateRepo") as string,
    tipo: formData.get("tipo") as string,
    paradigma: formData.get("paradigma") as string,
    deadline: (formData.get("deadline") as string) || "",
    maxIntegrantes: formData.get("maxIntegrantes") ?? undefined,
    // Clave siempre presente (aunque valga `undefined`): así el form puede
    // limpiar la columna ya configurada mandando "" en edición — ver el
    // comentario en `AssignmentBaseSchema.columnaGrupoEnPlanilla`.
    columnaGrupoEnPlanilla: formData.get("columnaGrupoEnPlanilla") ?? undefined,
  };
}

// Sólo aplica si vino una columna numérica — no hace falta ramificar por
// `tipo === "grupal"`, un individual nunca manda esta columna desde el form.
function erroresDeColumnaOcupada(
  comision: Comision | null | undefined,
  columna: number | undefined
): AssignmentFormState {
  if (columna === undefined) return null;
  if (!comision?.columnaOcupadaPorDatosPersonales(columna)) return null;
  return { ok: false, errors: { columnaGrupoEnPlanilla: [MENSAJE_COLUMNA_OCUPADA] } };
}

export async function crearAssignment(
  _prevState: AssignmentFormState,
  formData: FormData
): Promise<AssignmentFormState> {
  await requireAdmin();

  const raw = parseFormData(formData);
  const result = AssignmentSchema.safeParse(raw);

  if (!result.success) {
    return { ok: false, errors: result.error.flatten().fieldErrors };
  }

  // En alta la comisión relevante es la activa — la misma que usa
  // `createAssignment` para asignar el assignment nuevo. Si no hay comisión
  // activa, no validamos acá: `createAssignment` lanza
  // `ComisionActivaRequeridaError` más abajo con el error correspondiente.
  if (result.data.columnaGrupoEnPlanilla !== undefined) {
    const comisionActiva = await getComisionActiva();
    const errorDeColumna = erroresDeColumnaOcupada(
      comisionActiva,
      result.data.columnaGrupoEnPlanilla
    );
    if (errorDeColumna) return errorDeColumna;
  }

  try {
    await createAssignment(result.data);
  } catch (error) {
    if (error instanceof ComisionActivaRequeridaError) {
      return { ok: false, errors: {}, formError: error.message };
    }
    throw error;
  }

  redirect("/admin/assignments");
}

export async function actualizarAssignment(
  _prevState: AssignmentFormState,
  formData: FormData
): Promise<AssignmentFormState> {
  await requireAdmin();

  const id = formData.get("id") as string;
  const raw = parseFormData(formData);
  const result = AssignmentSchema.safeParse(raw);

  if (!result.success) {
    return { ok: false, errors: result.error.flatten().fieldErrors };
  }

  // En edición la comisión relevante es la del propio assignment (populada
  // por `getAssignment`), no necesariamente la activa.
  if (result.data.columnaGrupoEnPlanilla !== undefined) {
    const assignment = await getAssignment(id);
    const errorDeColumna = erroresDeColumnaOcupada(
      assignment?.comision,
      result.data.columnaGrupoEnPlanilla
    );
    if (errorDeColumna) return errorDeColumna;
  }

  try {
    await updateAssignment(id, result.data);
  } catch (error) {
    if (error instanceof AssignmentEstructuraInmutableError) {
      return { ok: false, errors: {}, formError: error.message };
    }
    throw error;
  }
  redirect("/admin/assignments");
}

// Issue #109: volcado manual DB → planilla del grupo de cada alumno,
// disparado desde el detalle del assignment grupal.
export type VolcarGruposState =
  | { status: "idle" }
  | { status: "ok"; alumnosEscritos: number; sinFila: string[] }
  | { status: "error"; message: string };

export async function volcarGruposALaPlanilla(
  _prevState: VolcarGruposState,
  formData: FormData
): Promise<VolcarGruposState> {
  await requireAdmin();

  const assignmentId = formData.get("assignmentId") as string;

  try {
    const { alumnosEscritos, sinFila } = await volcarGruposAPlanilla(assignmentId);
    return { status: "ok", alumnosEscritos, sinFila };
  } catch (error) {
    // `PlanillaNoDisponibleError.message` ya incluye la recomendación de
    // verificar el rol Editor de la service account — se reutiliza tal
    // cual, sin reescribirlo acá.
    if (
      error instanceof PlanillaNoDisponibleError ||
      error instanceof AssignmentNoEncontradoError ||
      error instanceof AssignmentNoGrupalError ||
      error instanceof ColumnaDeGrupoNoConfiguradaError ||
      error instanceof AssignmentSinComisionError
    ) {
      return { status: "error", message: error.message };
    }
    throw error;
  }
}

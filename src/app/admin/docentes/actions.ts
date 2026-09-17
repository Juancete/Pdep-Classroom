"use server";

import { requireResponsable } from "@/infrastructure/auth/session";
import { Docente, DocenteInvalidoError } from "@/domain/entities";
import {
  crearDocente,
  renombrarDocente,
  cambiarEstadoDocente,
  DocenteDuplicadoError,
  DocenteProtegidoError,
  DocenteNoEncontradoError,
} from "@/infrastructure/repositories";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const DOCENTES_PATH = "/admin/docentes";

export type DocenteFormState =
  | { ok: false; errors: Record<string, string[] | undefined>; valores?: Record<string, string> }
  | { ok: true }
  | null;

// Sin `.max()` acá: la longitud es una regla de dominio, no de forma — vive
// en `Docente.validarNombre`/`validarAlta` (ver el pre-chequeo en cada
// action más abajo). Zod sólo garantiza que el campo sea el tipo esperado.
const AltaSchema = z.object({
  githubUsername: z.string(),
  nombre: z.string().optional(),
});

const RenombrarSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().optional(),
});

const CambiarEstadoSchema = z.object({
  id: z.string().uuid(),
  activo: z.boolean(),
});

// Errores de dominio conocidos del ABM completo (alta, renombrado, cambio de
// estado): duplicado, protegido por configuración de entorno, inválido
// según la propia entidad (defensa extra detrás de los pre-chequeos de
// `validarAlta`/`validarNombre`), o el docente no existe más. Cada action
// decide cómo mostrarlos (error de campo o `{ ok: false }`); lo que
// comparten es que no son bugs — un error fuera de esta lista sí lo es y se
// propaga.
const ERRORES_CONOCIDOS_DEL_ABM = [
  DocenteDuplicadoError,
  DocenteProtegidoError,
  DocenteInvalidoError,
  DocenteNoEncontradoError,
];

function esErrorConocidoDelAbm(error: unknown): error is Error {
  return error instanceof Error && ERRORES_CONOCIDOS_DEL_ABM.some((tipoDeError) => error instanceof tipoDeError);
}

// Lo que el usuario tipeó en el alta, tal cual llegó en el FormData — se
// devuelve junto con los errores para que el form lo reponga como
// `defaultValue` tras un reset automático de React 19 (ver
// `docente-form.tsx`).
function valoresDelAlta(formData: FormData): Record<string, string> {
  return {
    githubUsername: (formData.get("githubUsername") as string) ?? "",
    nombre: (formData.get("nombre") as string) ?? "",
  };
}

// Mismo idioma que `valoresDelAlta`, para el form de renombrado (ver
// `NombreEditable` en `docente-acciones.tsx`).
function valoresDelRenombrado(formData: FormData): Record<string, string> {
  return {
    nombre: (formData.get("nombre") as string) ?? "",
  };
}

export async function crearDocenteAction(
  _prevState: DocenteFormState,
  formData: FormData
): Promise<DocenteFormState> {
  const responsable = await requireResponsable();

  const parsed = AltaSchema.safeParse({
    githubUsername: (formData.get("githubUsername") as string) ?? "",
    nombre: (formData.get("nombre") as string) || undefined,
  });
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors, valores: valoresDelAlta(formData) };
  }

  const { githubUsername, nombre } = parsed.data;

  // Se pre-chequea el username y el nombre por separado (en vez de un solo
  // `validarAlta({ githubUsername, nombre })`) para poder devolver el error
  // en el campo que corresponde: `validarAlta` con `nombre` omitido sólo
  // puede fallar por el username, así que cualquier error acá es de
  // `githubUsername`. El nombre se valida aparte, mismo idioma que el
  // pre-chequeo de `renombrarDocenteAction`.
  const errorDeUsername = Docente.validarAlta({ githubUsername });
  if (errorDeUsername) {
    return {
      ok: false,
      errors: { githubUsername: [errorDeUsername] },
      valores: valoresDelAlta(formData),
    };
  }

  const errorDeNombre = Docente.validarNombre(nombre);
  if (errorDeNombre) {
    return {
      ok: false,
      errors: { nombre: [errorDeNombre] },
      valores: valoresDelAlta(formData),
    };
  }

  try {
    await crearDocente({ githubUsername, nombre, porUsuario: responsable.githubUsername });
  } catch (error) {
    if (esErrorConocidoDelAbm(error)) {
      return {
        ok: false,
        errors: { githubUsername: [error.message] },
        valores: valoresDelAlta(formData),
      };
    }
    throw error;
  }

  revalidatePath(DOCENTES_PATH);
  return { ok: true };
}

export async function renombrarDocenteAction(
  _prevState: DocenteFormState,
  formData: FormData
): Promise<DocenteFormState> {
  const responsable = await requireResponsable();

  const parsed = RenombrarSchema.safeParse({
    id: (formData.get("id") as string) ?? "",
    nombre: (formData.get("nombre") as string) || undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.flatten().fieldErrors,
      valores: valoresDelRenombrado(formData),
    };
  }

  // Mismo pre-chequeo que el alta, antes de tocar el repositorio: la regla
  // de longitud vive en el dominio (`Docente.validarNombre`), acá sólo
  // se llama.
  const errorDeFormato = Docente.validarNombre(parsed.data.nombre);
  if (errorDeFormato) {
    return {
      ok: false,
      errors: { nombre: [errorDeFormato] },
      valores: valoresDelRenombrado(formData),
    };
  }

  try {
    await renombrarDocente(parsed.data.id, parsed.data.nombre, responsable.githubUsername);
  } catch (error) {
    if (esErrorConocidoDelAbm(error)) {
      return {
        ok: false,
        errors: { nombre: [error.message] },
        valores: valoresDelRenombrado(formData),
      };
    }
    throw error;
  }

  revalidatePath(DOCENTES_PATH);
  return { ok: true };
}

// Llamada directa desde el cliente (no un <form>), mismo idioma que
// `fetchSheetNames` en comisiones/actions.ts: el botón de activar/desactivar
// no necesita un `<form>` propio, sólo pide confirmación y dispara esto.
//
// Es una server action invocable con argumentos arbitrarios desde el
// cliente: no hay que confiar en los tipos TS (ej. un `"false"` llegaría acá
// como truthy) — se valida con Zod antes de tocar el repositorio.
export async function cambiarEstadoDocenteAction(
  id: string,
  activo: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const responsable = await requireResponsable();

  const parsed = CambiarEstadoSchema.safeParse({ id, activo });
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos" };
  }

  try {
    await cambiarEstadoDocente(parsed.data.id, parsed.data.activo, responsable.githubUsername);
  } catch (error) {
    // A diferencia de las otras dos actions, acá no hay `throw` para un
    // error desconocido: esto se invoca directo desde el cliente (no hay un
    // `<form>` ni un error boundary de por medio — ver el comentario de más
    // arriba), así que un throw llegaría al cliente como el mensaje
    // sanitizado genérico de Next, sin loguear el detalle real en el
    // servidor.
    if (esErrorConocidoDelAbm(error)) {
      return { ok: false, error: error.message };
    }
    logger.error({ err: error, docenteId: parsed.data.id }, "Error al cambiar el estado del docente");
    return { ok: false, error: "No se pudo cambiar el estado del docente. Reintentá en unos segundos." };
  }
  revalidatePath(DOCENTES_PATH);
  return { ok: true };
}

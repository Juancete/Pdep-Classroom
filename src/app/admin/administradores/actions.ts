"use server";

import { requireResponsable } from "@/infrastructure/auth/session";
import { Administrador, AdministradorInvalidoError } from "@/domain/entities";
import {
  crearAdministrador,
  renombrarAdministrador,
  cambiarEstadoAdministrador,
  AdministradorDuplicadoError,
  AdministradorProtegidoError,
  AdministradorNoEncontradoError,
} from "@/infrastructure/repositories";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const ADMINISTRADORES_PATH = "/admin/administradores";

export type AdministradorFormState =
  | { ok: false; errors: Record<string, string[] | undefined>; valores?: Record<string, string> }
  | { ok: true }
  | null;

// Sin `.max()` acá: la longitud es una regla de dominio, no de forma — vive
// en `Administrador.validarNombre`/`validarAlta` (ver el pre-chequeo en cada
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
  AdministradorDuplicadoError,
  AdministradorProtegidoError,
  AdministradorInvalidoError,
  AdministradorNoEncontradoError,
];

function esErrorConocidoDelAbm(error: unknown): error is Error {
  return error instanceof Error && ERRORES_CONOCIDOS_DEL_ABM.some((tipoDeError) => error instanceof tipoDeError);
}

// Lo que el usuario tipeó en el alta, tal cual llegó en el FormData — se
// devuelve junto con los errores para que el form lo reponga como
// `defaultValue` tras un reset automático de React 19 (ver
// `administrador-form.tsx`).
function valoresDelAlta(formData: FormData): Record<string, string> {
  return {
    githubUsername: (formData.get("githubUsername") as string) ?? "",
    nombre: (formData.get("nombre") as string) ?? "",
  };
}

// Mismo idioma que `valoresDelAlta`, para el form de renombrado (ver
// `NombreEditable` en `administrador-acciones.tsx`).
function valoresDelRenombrado(formData: FormData): Record<string, string> {
  return {
    nombre: (formData.get("nombre") as string) ?? "",
  };
}

export async function crearAdministradorAction(
  _prevState: AdministradorFormState,
  formData: FormData
): Promise<AdministradorFormState> {
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
  // pre-chequeo de `renombrarAdministradorAction`.
  const errorDeUsername = Administrador.validarAlta({ githubUsername });
  if (errorDeUsername) {
    return {
      ok: false,
      errors: { githubUsername: [errorDeUsername] },
      valores: valoresDelAlta(formData),
    };
  }

  const errorDeNombre = Administrador.validarNombre(nombre);
  if (errorDeNombre) {
    return {
      ok: false,
      errors: { nombre: [errorDeNombre] },
      valores: valoresDelAlta(formData),
    };
  }

  try {
    await crearAdministrador({ githubUsername, nombre, porUsuario: responsable.githubUsername });
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

  revalidatePath(ADMINISTRADORES_PATH);
  return { ok: true };
}

export async function renombrarAdministradorAction(
  _prevState: AdministradorFormState,
  formData: FormData
): Promise<AdministradorFormState> {
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
  // de longitud vive en el dominio (`Administrador.validarNombre`), acá sólo
  // se llama.
  const errorDeFormato = Administrador.validarNombre(parsed.data.nombre);
  if (errorDeFormato) {
    return {
      ok: false,
      errors: { nombre: [errorDeFormato] },
      valores: valoresDelRenombrado(formData),
    };
  }

  try {
    await renombrarAdministrador(parsed.data.id, parsed.data.nombre, responsable.githubUsername);
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

  revalidatePath(ADMINISTRADORES_PATH);
  return { ok: true };
}

// Llamada directa desde el cliente (no un <form>), mismo idioma que
// `fetchSheetNames` en comisiones/actions.ts: el botón de activar/desactivar
// no necesita un `<form>` propio, sólo pide confirmación y dispara esto.
//
// Es una server action invocable con argumentos arbitrarios desde el
// cliente: no hay que confiar en los tipos TS (ej. un `"false"` llegaría acá
// como truthy) — se valida con Zod antes de tocar el repositorio.
export async function cambiarEstadoAdministradorAction(
  id: string,
  activo: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const responsable = await requireResponsable();

  const parsed = CambiarEstadoSchema.safeParse({ id, activo });
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos" };
  }

  try {
    await cambiarEstadoAdministrador(parsed.data.id, parsed.data.activo, responsable.githubUsername);
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
    logger.error({ err: error, administradorId: parsed.data.id }, "Error al cambiar el estado del docente");
    return { ok: false, error: "No se pudo cambiar el estado del docente. Reintentá en unos segundos." };
  }
  revalidatePath(ADMINISTRADORES_PATH);
  return { ok: true };
}

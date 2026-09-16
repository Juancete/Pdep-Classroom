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

const AltaSchema = z.object({
  githubUsername: z.string(),
  nombre: z.string().max(255, "El nombre no puede superar los 255 caracteres").optional(),
});

const RenombrarSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().max(255, "El nombre no puede superar los 255 caracteres").optional(),
});

const CambiarEstadoSchema = z.object({
  id: z.string().uuid(),
  activo: z.boolean(),
});

// Errores de dominio que, al fallar el alta, se muestran como error de
// campo en `githubUsername` en vez de propagarse: duplicado, protegido por
// configuración de entorno, o inválido según la propia entidad (defensa
// extra detrás del pre-chequeo de `validarAlta` de más arriba).
const ERRORES_DE_ALTA_COMO_CAMPO = [
  AdministradorDuplicadoError,
  AdministradorProtegidoError,
  AdministradorInvalidoError,
];

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

  const errorDeFormato = Administrador.validarAlta({ githubUsername, nombre });
  if (errorDeFormato) {
    return {
      ok: false,
      errors: { githubUsername: [errorDeFormato] },
      valores: valoresDelAlta(formData),
    };
  }

  try {
    await crearAdministrador({ githubUsername, nombre, porUsuario: responsable.githubUsername });
  } catch (error) {
    if (
      error instanceof Error &&
      ERRORES_DE_ALTA_COMO_CAMPO.some((tipoDeError) => error instanceof tipoDeError)
    ) {
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
      valores: { nombre: (formData.get("nombre") as string) ?? "" },
    };
  }

  try {
    await renombrarAdministrador(parsed.data.id, parsed.data.nombre, responsable.githubUsername);
  } catch (error) {
    if (error instanceof AdministradorProtegidoError) {
      return {
        ok: false,
        errors: { nombre: [error.message] },
        valores: { nombre: (formData.get("nombre") as string) ?? "" },
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
    if (error instanceof AdministradorProtegidoError || error instanceof AdministradorNoEncontradoError) {
      return { ok: false, error: error.message };
    }
    logger.error({ err: error, administradorId: parsed.data.id }, "Error al cambiar el estado del administrador");
    return { ok: false, error: "No se pudo cambiar el estado del administrador. Reintentá en unos segundos." };
  }
  revalidatePath(ADMINISTRADORES_PATH);
  return { ok: true };
}

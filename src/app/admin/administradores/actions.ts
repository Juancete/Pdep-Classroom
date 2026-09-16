"use server";

import { requireResponsable } from "@/infrastructure/auth/session";
import { Administrador } from "@/domain/entities";
import { normalizarGithubUsername } from "@/domain/entities/domain-constants";
import { esResponsableDeEntorno } from "@/lib/responsables-de-entorno";
import {
  crearAdministrador,
  renombrarAdministrador,
  cambiarEstadoAdministrador,
  AdministradorDuplicadoError,
} from "@/infrastructure/repositories";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const ADMINISTRADORES_PATH = "/admin/administradores";

export type AdministradorFormState =
  | { ok: false; errors: Record<string, string[] | undefined> }
  | { ok: true }
  | null;

const AltaSchema = z.object({
  githubUsername: z.string(),
  nombre: z.string().optional(),
});

const RenombrarSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().optional(),
});

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
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  const { githubUsername, nombre } = parsed.data;

  const errorDeFormato = Administrador.validarAlta({ githubUsername, nombre });
  if (errorDeFormato) {
    return { ok: false, errors: { githubUsername: [errorDeFormato] } };
  }

  if (esResponsableDeEntorno(githubUsername)) {
    return {
      ok: false,
      errors: {
        githubUsername: [
          `@${normalizarGithubUsername(githubUsername)} ya es responsable por configuración del entorno.`,
        ],
      },
    };
  }

  try {
    await crearAdministrador({ githubUsername, nombre, porUsuario: responsable.githubUsername });
  } catch (error) {
    if (error instanceof AdministradorDuplicadoError) {
      return { ok: false, errors: { githubUsername: [error.message] } };
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
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  await renombrarAdministrador(parsed.data.id, parsed.data.nombre, responsable.githubUsername);
  revalidatePath(ADMINISTRADORES_PATH);
  return { ok: true };
}

// Llamada directa desde el cliente (no un <form>), mismo idioma que
// `fetchSheetNames` en comisiones/actions.ts: el botón de activar/desactivar
// no necesita un `<form>` propio, sólo pide confirmación y dispara esto.
export async function cambiarEstadoAdministradorAction(
  id: string,
  activo: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const responsable = await requireResponsable();
  try {
    await cambiarEstadoAdministrador(id, activo, responsable.githubUsername);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Error desconocido" };
  }
  revalidatePath(ADMINISTRADORES_PATH);
  return { ok: true };
}

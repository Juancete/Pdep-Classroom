import {
  agregarMiembroAGrupo,
  isGoogleGroupsConfigured,
  quitarMiembroDeGrupo,
  type AgregarMiembroResult,
} from "@/lib/googleGroups";
import {
  actualizarEstadoGoogleGroup,
  getAlumnoByGithub,
} from "@/lib/repositories";
import { logger } from "@/lib/logger";

export function sanitizarErrorGoogleGroup(texto: string): string {
  return texto.replace(
    /([\w.+-]{1,2})([\w.+-]*)(@[\w.-]+\.\w+)/g,
    "$1xxxxxx$3"
  );
}

async function marcarFallido(
  githubUsername: string,
  error: string,
  message: string
): Promise<void> {
  const errorSanitizado = sanitizarErrorGoogleGroup(error);
  await actualizarEstadoGoogleGroup(githubUsername, (alumno) => {
    alumno.marcarGoogleGroupFallido(errorSanitizado);
  });
  logger.error({ githubUsername, err: errorSanitizado }, message);
}

/**
 * Hace converger la membresía del Google Group con el email actual del alumno.
 * El email nuevo se asegura antes de retirar direcciones anteriores. Las bajas
 * pendientes se conservan en DB para tolerar cambios sucesivos de email.
 */
async function reconciliarGoogleGroup(
  githubUsername: string
): Promise<AgregarMiembroResult> {
  const alumno = await getAlumnoByGithub(githubUsername);
  if (!alumno) {
    return { status: "error", error: "Alumno no encontrado" };
  }

  await actualizarEstadoGoogleGroup(githubUsername, (actual) => {
    actual.registrarIntentoGoogleGroup();
  });

  if (!isGoogleGroupsConfigured()) {
    await actualizarEstadoGoogleGroup(githubUsername, (actual) => {
      actual.marcarGoogleGroupOmitido();
    });
    return { status: "skipped" };
  }

  const alta = await agregarMiembroAGrupo(alumno.email);
  if (alta.status === "error") {
    await marcarFallido(
      githubUsername,
      alta.error,
      "Error al suscribir al Google Group"
    );
    return alta;
  }
  if (alta.status === "skipped") {
    await actualizarEstadoGoogleGroup(githubUsername, (actual) => {
      actual.marcarGoogleGroupOmitido();
    });
    return alta;
  }

  const actualizado = await actualizarEstadoGoogleGroup(
    githubUsername,
    (actual) => {
      actual.registrarEmailAgregadoAGoogleGroup(alumno.email);
    }
  );
  const pendientesBaja = [
    ...(actualizado?.googleGroupEmailsPendientesBaja ?? []),
  ];

  for (const emailAnterior of pendientesBaja) {
    const baja = await quitarMiembroDeGrupo(emailAnterior);
    if (baja.status === "error") {
      await marcarFallido(
        githubUsername,
        baja.error,
        "Error al des-suscribir un email anterior del Google Group"
      );
      return { status: "error", error: baja.error };
    }
    if (baja.status === "skipped") {
      await actualizarEstadoGoogleGroup(githubUsername, (actual) => {
        actual.marcarGoogleGroupOmitido();
      });
      return { status: "skipped" };
    }
    await actualizarEstadoGoogleGroup(githubUsername, (actual) => {
      actual.registrarBajaGoogleGroup(emailAnterior);
    });
  }

  await actualizarEstadoGoogleGroup(githubUsername, (actual) => {
    actual.marcarGoogleGroupSincronizado();
  });
  return alta;
}

export async function intentarSincronizarGoogleGroup(
  githubUsername: string
): Promise<AgregarMiembroResult> {
  try {
    return await reconciliarGoogleGroup(githubUsername);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error inesperado de sincronización";
    const errorSanitizado = sanitizarErrorGoogleGroup(message);
    logger.error(
      { githubUsername, err: errorSanitizado },
      "Falló la reconciliación persistente del Google Group"
    );
    return { status: "error", error: errorSanitizado };
  }
}

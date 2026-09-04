import type { Alumno, NombreDeCanal } from "@/domain/entities";
import { actualizarSuscripcion, getAlumnoByGithub } from "@/infrastructure/repositories";
import { logger } from "@/lib/logger";

export type ResultadoDeAlta =
  | { estado: "alta" }
  | { estado: "ya_estaba" }
  | { estado: "omitida" }
  | { estado: "error"; error: string };

export type ResultadoDeBaja =
  | { estado: "baja" }
  | { estado: "no_estaba" }
  | { estado: "omitida" }
  | { estado: "error"; error: string };

export type ResultadoDeSincronizacion =
  | { estado: "sincronizada" }
  | { estado: "omitida" }
  | { estado: "error"; error: string };

/**
 * Template Method sobre la suscripción de un alumno a un canal de
 * comunicación externo (Google Groups hoy; Discord u otro mañana). El
 * algoritmo de reconciliación — intento, alta, drenar bajas pendientes,
 * marcar sincronizada — vive acá y es el mismo para cualquier canal; cada
 * subclase sólo aporta cómo hablar con su servicio externo.
 *
 * El vocabulario de esta clase es deliberadamente agnóstico del canal: no
 * dice "email" ni "grupo", dice "destinatario". Para Google Groups un
 * destinatario es un email; para un canal futuro podría ser el ID de una
 * cuenta de Discord. `destinatarioDe` puede devolver `null` cuando el alumno
 * todavía no vinculó su identidad en ese canal — se trata igual que "canal
 * sin configurar": se omite, sin error.
 */
export abstract class CanalDeComunicacion {
  /** Nombre persistido en `suscripcion_alumno.canal`. */
  abstract get nombre(): NombreDeCanal;

  /** Nombre legible para el docente (health check de `/admin/operaciones`). */
  abstract get etiqueta(): string;

  /** `true` si las variables de entorno del canal están completas. */
  abstract estaConfigurado(): boolean;

  /** Frase para componer el aviso al alumno, ej: "suscribirte al grupo de Google del curso". */
  abstract asuntoPendiente(): string;

  /** Identidad del alumno en este canal, o `null` si todavía no la tiene. */
  abstract destinatarioDe(alumno: Alumno): string | null;

  protected abstract darDeAlta(destinatario: string): Promise<ResultadoDeAlta>;
  protected abstract darDeBaja(destinatario: string): Promise<ResultadoDeBaja>;

  /**
   * Enmascara PII de un mensaje de error antes de persistirlo/loguearlo. Cada
   * canal tiene su propio tipo de dato sensible (emails, tokens); default:
   * no enmascara nada.
   */
  protected sanitizarError(texto: string): string {
    return texto;
  }

  /**
   * Hace converger la suscripción del alumno a este canal. Nunca throwea:
   * cualquier excepción se degrada a `{ estado: "error" }` logueado. Molde:
   * `intentarSincronizarGoogleGroup` (previo a este refactor).
   *
   * `private` a propósito: es la frontera pública de la clase, no un paso
   * que una subclase deba (o pueda) reemplazar — el algoritmo es el mismo
   * para cualquier canal.
   */
  async sincronizar(githubUsername: string): Promise<ResultadoDeSincronizacion> {
    try {
      return await this.reconciliar(githubUsername);
    } catch (error) {
      const mensaje =
        error instanceof Error ? error.message : "Error inesperado de sincronización";
      const errorSanitizado = this.sanitizarError(mensaje);
      logger.error(
        { githubUsername, canal: this.nombre, err: errorSanitizado },
        `Falló la reconciliación persistente del canal ${this.nombre}`
      );
      return { estado: "error", error: errorSanitizado };
    }
  }

  /**
   * El Template Method: intento → (si no hay nada que hacer, omitida) → alta
   * → drenar bajas pendientes → sincronizada. El alta se asegura siempre
   * antes de cualquier baja, para no dejar al alumno afuera del canal entre
   * dos llamadas si el proceso se corta a la mitad.
   */
  private async reconciliar(githubUsername: string): Promise<ResultadoDeSincronizacion> {
    const alumno = await getAlumnoByGithub(githubUsername);
    if (!alumno) {
      return { estado: "error", error: "Alumno no encontrado" };
    }

    await actualizarSuscripcion(githubUsername, this.nombre, (suscripcion) => {
      suscripcion.registrarIntento();
    });

    if (!this.estaConfigurado()) {
      await this.marcarOmitida(githubUsername);
      return { estado: "omitida" };
    }

    const destinatario = this.destinatarioDe(alumno);
    if (destinatario === null) {
      await this.marcarOmitida(githubUsername);
      return { estado: "omitida" };
    }

    const alta = await this.darDeAlta(destinatario);
    if (alta.estado === "error") {
      await this.marcarFallida(
        githubUsername,
        alta.error,
        `Error al sincronizar el canal ${this.nombre}`
      );
      return alta;
    }
    if (alta.estado === "omitida") {
      await this.marcarOmitida(githubUsername);
      return alta;
    }

    const actualizada = await actualizarSuscripcion(githubUsername, this.nombre, (suscripcion) => {
      suscripcion.registrarAlta(destinatario);
    });
    const pendientesBaja = [...(actualizada?.destinatariosPendientesBaja ?? [])];

    for (const destinatarioAnterior of pendientesBaja) {
      const baja = await this.darDeBaja(destinatarioAnterior);
      if (baja.estado === "error") {
        await this.marcarFallida(
          githubUsername,
          baja.error,
          `Error al des-suscribir un destinatario anterior del canal ${this.nombre}`
        );
        return { estado: "error", error: baja.error };
      }
      if (baja.estado === "omitida") {
        await this.marcarOmitida(githubUsername);
        return { estado: "omitida" };
      }
      await actualizarSuscripcion(githubUsername, this.nombre, (suscripcion) => {
        suscripcion.registrarBaja(destinatarioAnterior);
      });
    }

    await actualizarSuscripcion(githubUsername, this.nombre, (suscripcion) => {
      suscripcion.marcarSincronizada();
    });
    return { estado: "sincronizada" };
  }

  private async marcarFallida(
    githubUsername: string,
    error: string,
    mensajeDeLog: string
  ): Promise<void> {
    const errorSanitizado = this.sanitizarError(error);
    await actualizarSuscripcion(githubUsername, this.nombre, (suscripcion) => {
      suscripcion.marcarFallida(errorSanitizado);
    });
    logger.error({ githubUsername, canal: this.nombre, err: errorSanitizado }, mensajeDeLog);
  }

  private async marcarOmitida(githubUsername: string): Promise<void> {
    await actualizarSuscripcion(githubUsername, this.nombre, (suscripcion) => {
      suscripcion.marcarOmitida();
    });
  }
}

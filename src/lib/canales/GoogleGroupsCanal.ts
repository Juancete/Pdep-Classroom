import { Alumno, type NombreDeCanal } from "@/domain/entities";
import {
  agregarMiembroAGrupo,
  isGoogleGroupsConfigured,
  quitarMiembroDeGrupo,
} from "@/lib/googleGroups";
import {
  CanalDeComunicacion,
  type ResultadoDeAlta,
  type ResultadoDeBaja,
} from "./CanalDeComunicacion";

// Enmascara emails embebidos en un mensaje de error de la API de Google
// antes de persistirlo/loguearlo. Deja 1-2 caracteres + "xxxxxx" + dominio,
// suficiente para reconocer de quién es sin exponer el email completo.
function enmascararEmails(texto: string): string {
  return texto.replace(
    /([\w.+-]{1,2})([\w.+-]*)(@[\w.-]+\.\w+)/g,
    "$1xxxxxx$3"
  );
}

export class GoogleGroupsCanal extends CanalDeComunicacion {
  readonly nombre: NombreDeCanal = "google_groups";
  readonly etiqueta = "Google Groups";

  estaConfigurado(): boolean {
    return isGoogleGroupsConfigured();
  }

  asuntoPendiente(): string {
    return "suscribirte al grupo de Google del curso";
  }

  destinatarioDe(alumno: Alumno): string {
    return Alumno.normalizarEmail(alumno.email);
  }

  protected async darDeAlta(destinatario: string): Promise<ResultadoDeAlta> {
    const resultado = await agregarMiembroAGrupo(destinatario);
    switch (resultado.status) {
      case "added":
        return { estado: "alta" };
      case "already_member":
        return { estado: "ya_estaba" };
      case "skipped":
        return { estado: "omitida" };
      case "error":
        return { estado: "error", error: resultado.error };
    }
  }

  protected async darDeBaja(destinatario: string): Promise<ResultadoDeBaja> {
    const resultado = await quitarMiembroDeGrupo(destinatario);
    switch (resultado.status) {
      case "removed":
        return { estado: "baja" };
      case "not_member":
        return { estado: "no_estaba" };
      case "skipped":
        return { estado: "omitida" };
      case "error":
        return { estado: "error", error: resultado.error };
    }
  }

  protected sanitizarError(texto: string): string {
    return enmascararEmails(texto);
  }
}

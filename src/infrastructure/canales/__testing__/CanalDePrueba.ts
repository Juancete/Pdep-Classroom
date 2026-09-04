import { vi } from "vitest";
import type { Alumno, NombreDeCanal } from "@/domain/entities";
import {
  CanalDeComunicacion,
  type ResultadoDeAlta,
  type ResultadoDeBaja,
} from "../CanalDeComunicacion";

/**
 * Doble de canal para testear el Template Method de `CanalDeComunicacion`
 * sin depender de ningún servicio externo real. Cada primitiva es un
 * `vi.fn()` configurable desde el test — por defecto un canal "feliz":
 * configurado, con el email del alumno como destinatario, altas y bajas que
 * siempre tienen éxito.
 */
export class CanalDePrueba extends CanalDeComunicacion {
  readonly nombre: NombreDeCanal = "google_groups";
  readonly etiqueta = "Canal de prueba";

  estaConfigurado = vi.fn(() => true);
  asuntoPendiente = vi.fn(() => "hacer algo en el canal de prueba");
  destinatarioDe = vi.fn((alumno: Alumno): string | null => alumno.email);
  darDeAlta = vi.fn(async (): Promise<ResultadoDeAlta> => ({ estado: "alta" }));
  darDeBaja = vi.fn(async (): Promise<ResultadoDeBaja> => ({ estado: "baja" }));
  sanitizarErrorMock = vi.fn((texto: string) => texto);

  protected sanitizarError(texto: string): string {
    return this.sanitizarErrorMock(texto);
  }
}

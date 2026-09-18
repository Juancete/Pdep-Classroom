import type { Comision } from "./Comision";

/**
 * Contexto de comisión que un docente está consultando en el panel admin
 * (issue #114). Antes, `/admin/grupos` y `/admin/assignments` mostraban
 * datos de *todas* las comisiones a la vez y `/admin/alumnos` mostraba
 * siempre la activa — ninguna de las tres permitía consultar una comisión
 * histórica de forma consistente. Modelado como Strategy (evita un ifs de
 * tipo — "¿hay comisión seleccionada? ¿es la activa? ¿hay activa?" —
 * repetido en cada vista y en la barra del panel): las tres páginas y la
 * barra sólo le preguntan al contexto, nunca inspeccionan de qué subtipo es.
 *
 * Tres implementaciones, resueltas por `resolverContextoDeComision`:
 * `ContextoDeComisionActiva` (se está viendo la comisión activa),
 * `ContextoDeComisionHistorica` (se eligió una comisión que no es la
 * activa) y `ContextoSinComision` (no hay comisión activa ni selección
 * válida — nunca "todas las comisiones").
 */
export abstract class ContextoDeComision {
  /** Comisión que las páginas deben consultar. `null` si no hay ninguna. */
  abstract comisionConsultada(): Comision | null;

  /** Comisión activa del sistema, exista o no selección. `null` si no hay. */
  abstract comisionActiva(): Comision | null;

  /** `true` si la comisión consultada no es la activa. */
  abstract esHistorica(): boolean;

  /**
   * `true` si desde este contexto se puede crear un assignment nuevo.
   * `createAssignment` siempre crea en la activa (sin cambios de regla de
   * negocio) — consultando una histórica no tiene sentido ofrecer el alta.
   */
  abstract permiteCrearAssignments(): boolean;

  /** Texto del header del panel («Viendo: 2026 (activa)», etc). */
  abstract descripcion(): string;

  /** `true` si corresponde ofrecer el botón «Volver a la activa». */
  abstract ofreceVolverALaActiva(): boolean;
}

class ContextoDeComisionActiva extends ContextoDeComision {
  constructor(private readonly comision: Comision) {
    super();
  }

  comisionConsultada(): Comision | null {
    return this.comision;
  }

  comisionActiva(): Comision | null {
    return this.comision;
  }

  esHistorica(): boolean {
    return false;
  }

  permiteCrearAssignments(): boolean {
    return true;
  }

  descripcion(): string {
    return `Viendo: ${this.comision.anio} (activa)`;
  }

  ofreceVolverALaActiva(): boolean {
    return false;
  }
}

class ContextoDeComisionHistorica extends ContextoDeComision {
  constructor(
    private readonly comisionHistorica: Comision,
    private readonly comisionActivaDelSistema: Comision | null
  ) {
    super();
  }

  comisionConsultada(): Comision | null {
    return this.comisionHistorica;
  }

  comisionActiva(): Comision | null {
    return this.comisionActivaDelSistema;
  }

  esHistorica(): boolean {
    return true;
  }

  permiteCrearAssignments(): boolean {
    return false;
  }

  descripcion(): string {
    const infoDeActiva = this.comisionActivaDelSistema
      ? `Activa: ${this.comisionActivaDelSistema.anio}`
      : "Sin comisión activa";
    return `Viendo: ${this.comisionHistorica.anio} (histórica) · ${infoDeActiva}`;
  }

  ofreceVolverALaActiva(): boolean {
    return this.comisionActivaDelSistema !== null;
  }
}

class ContextoSinComision extends ContextoDeComision {
  comisionConsultada(): Comision | null {
    return null;
  }

  comisionActiva(): Comision | null {
    return null;
  }

  esHistorica(): boolean {
    return false;
  }

  permiteCrearAssignments(): boolean {
    return false;
  }

  descripcion(): string {
    return "Sin comisión activa";
  }

  ofreceVolverALaActiva(): boolean {
    return false;
  }
}

/**
 * Único punto de decisión de qué comisión se está consultando (análogo a
 * `resolverRol` en `RolDeUsuario.ts`). `idSeleccionado` viaja desde la
 * cookie `comision_consultada` (issue #114) — acá el dominio no sabe nada de
 * cookies, sólo recibe el id crudo.
 *
 * - Id seleccionado y existe entre `comisiones` → activa o histórica según
 *   `comision.activa`.
 * - Id ausente, inexistente o de una comisión ya eliminada → cae a la
 *   activa; si no hay activa, `ContextoSinComision`. Nunca "todas".
 */
export function resolverContextoDeComision(
  comisiones: Comision[],
  idSeleccionado?: string
): ContextoDeComision {
  const comisionActivaDelSistema =
    comisiones.find((comision) => comision.activa) ?? null;

  const comisionSeleccionada = idSeleccionado
    ? comisiones.find((comision) => comision.id === idSeleccionado) ?? null
    : null;

  if (comisionSeleccionada) {
    return comisionSeleccionada.activa
      ? new ContextoDeComisionActiva(comisionSeleccionada)
      : new ContextoDeComisionHistorica(comisionSeleccionada, comisionActivaDelSistema);
  }

  return comisionActivaDelSistema
    ? new ContextoDeComisionActiva(comisionActivaDelSistema)
    : new ContextoSinComision();
}

import { Entity, Enum, Index, ManyToOne, PrimaryKey, Property, Unique } from "@mikro-orm/core";
import { randomUUID } from "node:crypto";
import { Alumno } from "./Alumno";

// Única fuente de verdad para los valores de cada enum: el tipo se deriva de
// acá en vez de listarse aparte, para que no puedan desincronizarse entre el
// tipo de TS y los `items` que MikroORM usa para el check constraint.
//
// Agregar un canal nuevo (ej. Discord) implica sumar su nombre acá y una
// migración que ensanche este CHECK — ver README, sección "Canales de
// comunicación".
export const NOMBRES_DE_CANAL = ["google_groups"] as const;
export type NombreDeCanal = (typeof NOMBRES_DE_CANAL)[number];

export const ESTADOS_DE_SUSCRIPCION = [
  "pendiente",
  "sincronizada",
  "fallida",
  "omitida",
] as const;
export type EstadoDeSuscripcion = (typeof ESTADOS_DE_SUSCRIPCION)[number];

/**
 * Estado de la suscripción de un alumno a un canal de comunicación (issue
 * Google Groups → canales polimórficos). Una fila por (alumno, canal): un
 * mismo alumno puede estar `sincronizado` en Google Groups y `pendiente` en
 * un canal futuro sin que se pisen.
 *
 * Sin `@OneToMany` del lado de `Alumno` a propósito: tienta a operar sobre
 * una `Collection` sin cargar. El acceso siempre pasa por
 * los repositorios, que entregan listas cargadas al dominio para consultar
 * pendientes y actualizar datos del alumno sin cargas implícitas.
 */
@Entity({ tableName: "suscripcion_alumno" })
@Unique({
  name: "suscripcion_alumno_alumno_canal_unique",
  properties: ["alumno", "canal"],
})
@Index({
  name: "suscripcion_alumno_canal_estado_idx",
  properties: ["canal", "estado"],
})
export class SuscripcionAlumno {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @ManyToOne(() => Alumno, { deleteRule: "cascade" })
  alumno!: Alumno;

  @Enum({ items: [...NOMBRES_DE_CANAL] })
  canal!: NombreDeCanal;

  @Enum({ items: [...ESTADOS_DE_SUSCRIPCION] })
  estado: EstadoDeSuscripcion = "pendiente";

  // Identidad del alumno en el canal (email, handle, etc.) que quedó de alta
  // la última vez que la sincronización tuvo éxito.
  @Property({ type: "string", nullable: true })
  destinatarioSincronizado: string | null = null;

  // Identidades anteriores todavía no dadas de baja del canal. Se acumulan en
  // cambios sucesivos (ej. el alumno cambia de email varias veces antes de
  // que la baja del primero se complete) y se drenan una por una.
  @Property({ type: "array", defaultRaw: "'{}'" })
  destinatariosPendientesBaja: string[] = [];

  @Property({ type: "text", nullable: true })
  ultimoError: string | null = null;

  @Property({ type: "datetime", nullable: true })
  ultimoIntentoEn: Date | null = null;

  @Property({ type: "datetime", nullable: true })
  sincronizadoEn: Date | null = null;

  estaPendiente(): boolean {
    return this.estado !== "sincronizada";
  }

  marcarPendiente(): void {
    this.estado = "pendiente";
    this.ultimoError = null;
  }

  registrarIntento(fecha: Date = new Date()): void {
    this.ultimoIntentoEn = fecha;
  }

  registrarAlta(destinatario: string): void {
    const anterior = this.destinatarioSincronizado;
    this.destinatariosPendientesBaja = this.destinatariosPendientesBaja.filter(
      (pendiente) => pendiente !== destinatario
    );
    if (
      anterior &&
      anterior !== destinatario &&
      !this.destinatariosPendientesBaja.includes(anterior)
    ) {
      this.destinatariosPendientesBaja.push(anterior);
    }
    this.destinatarioSincronizado = destinatario;
  }

  registrarBaja(destinatario: string): void {
    this.destinatariosPendientesBaja = this.destinatariosPendientesBaja.filter(
      (pendiente) => pendiente !== destinatario
    );
  }

  marcarSincronizada(fecha: Date = new Date()): void {
    this.estado = "sincronizada";
    this.ultimoError = null;
    this.sincronizadoEn = fecha;
  }

  marcarFallida(error: string): void {
    this.estado = "fallida";
    this.ultimoError = error;
  }

  marcarOmitida(): void {
    this.estado = "omitida";
    this.ultimoError = null;
  }
}

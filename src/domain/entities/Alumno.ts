import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { randomUUID } from "crypto";
import { Comision } from "./Comision";
import type { SuscripcionAlumno } from "./SuscripcionAlumno";
import { ALUMNO_LEGAJO_PATTERN, ALUMNO_EMAIL_PATTERN, normalizarGithubUsername } from "./domain-constants";

export interface RegistroInput {
  legajo: string;
  apellido: string;
  nombre: string;
  githubUsername: string;
  email: string;
}

export interface AlumnoData extends RegistroInput {
  comision: Comision;
  registroConfirmadoEn?: Comision;
}

// El legajo es la PK del alumno en la cursada: dos alumnos no pueden
// compartirlo. La UNIQUE constraint de la DB ya lo garantiza, pero se
// lanza este error antes del flush para poder devolverle al cliente un
// mensaje claro y el `field` afectado en vez de un crash genérico del
// driver (Fase 4 de la auditoría de dominio: vivía en `AlumnoRepository.ts`).
export class LegajoConflictError extends Error {
  constructor(
    public readonly legajo: string,
    public readonly otroGithubUsername: string
  ) {
    super(
      `El legajo ${legajo} ya está registrado con el usuario @${otroGithubUsername}. Verificá que sea el tuyo.`
    );
    this.name = "LegajoConflictError";
  }
}

// Regex de email RFC-lite: una arroba, algún dominio, un punto después.
// Suficiente para detectar typos comunes sin sobre-complicar.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function validateRegistro(input: RegistroInput): string | null {
  const { legajo, apellido, nombre, githubUsername, email } = input;

  if (typeof legajo !== "string" || !legajo || !new RegExp(`^${Alumno.LEGAJO_PATTERN}$`).test(legajo.trim()))
    return "El legajo debe tener entre 4 y 8 dígitos";
  if (typeof apellido !== "string" || !apellido.trim()) return "El apellido es obligatorio";
  if (typeof nombre !== "string" || !nombre.trim()) return "El nombre es obligatorio";
  if (typeof githubUsername !== "string")
    return "El usuario de GitHub debe ser un texto";
  if (!githubUsername.trim()) return "El usuario de GitHub es obligatorio";
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(githubUsername.trim()))
    return "El usuario de GitHub no tiene un formato válido";
  if (typeof email !== "string" || !isValidEmail(email)) return "El email no es válido";
  return null;
}

@Entity()
export class Alumno {
  static readonly LEGAJO_PATTERN = ALUMNO_LEGAJO_PATTERN;
  static readonly EMAIL_PATTERN = ALUMNO_EMAIL_PATTERN;

  static normalizarUsername(raw: unknown): string {
    return normalizarGithubUsername(raw);
  }

  static normalizarEmail(raw: unknown): string {
    return String(raw ?? "").trim().toLowerCase();
  }
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property({ type: 'string', unique: true })
  legajo!: string;

  @Property({ type: 'string' })
  nombre!: string;

  @Property({ type: 'string' })
  apellido!: string;

  @Property({ type: 'string', unique: true })
  githubUsername!: string;

  @Property({ type: 'string' })
  email!: string;

  // Todo alumno pertenece a exactamente una comisión. La FK es NOT NULL;
  // borrar una comisión borra sus alumnos en cascada (on delete cascade).
  @ManyToOne(() => Comision, { deleteRule: "cascade" })
  comision!: Comision;

  // Marca la comisión en la que el alumno confirmó sus datos por última vez.
  // Si no coincide con la comisión activa, se le pide re-confirmar en /registro.
  @ManyToOne(() => Comision, { nullable: true })
  registroConfirmadoEn?: Comision;

  // Timestamp del último fallo al sincronizar los grupos del alumno desde la
  // planilla. Se prende cuando `sincronizarGruposDelAlumno` throwea y se limpia
  // cuando un reintento exitoso lo resuelve. Mientras esté prendido, el header
  // muestra un banner persistente y el perfil reintenta la sync al montar.
  @Property({ type: 'datetime', nullable: true })
  gruposSyncFallidoEn: Date | null = null;

  // Análogo a gruposSyncFallidoEn pero para la dirección DB → planilla del
  // alta del alumno: se prende si re-upsertar la fila en Sheets falla.
  @Property({ type: 'datetime', nullable: true })
  alumnoSyncFallidoEn: Date | null = null;

  get usernameCanonico(): string {
    return Alumno.normalizarUsername(this.githubUsername);
  }

  get nombreCompleto(): string {
    return `${this.apellido}, ${this.nombre}`;
  }

  // Aplica solo los campos de RegistroInput (sin comisión ni confirmación).
  // Usado por parseAlumnosRows en sheets.ts, donde los Alumno son transitorios
  // (DTOs de planilla) y la comisión se inyecta en el call site de upsertAlumnos.
  // Para actualizar alumnos persistidos, usar actualizarDatos con sus suscripciones.
  aplicarRegistro(input: RegistroInput): void {
    this.legajo = input.legajo.trim();
    this.nombre = input.nombre.trim();
    this.apellido = input.apellido.trim();
    this.githubUsername = Alumno.normalizarUsername(input.githubUsername);
    this.email = Alumno.normalizarEmail(input.email);
  }

  // Requiere todas las suscripciones del alumno ya cargadas, incluidos canales
  // inactivos. Para un alumno nuevo, pasar []. No realiza cargas implícitas.
  actualizarDatos(data: AlumnoData, suscripciones: readonly SuscripcionAlumno[]): void {
    const emailAnterior = Alumno.normalizarEmail(this.email);
    this.aplicarRegistro(data);
    this.comision = data.comision;
    if (data.registroConfirmadoEn !== undefined) {
      this.registroConfirmadoEn = data.registroConfirmadoEn;
    }
    if (emailAnterior !== this.email) {
      for (const suscripcion of suscripciones) {
        if (suscripcion.alumno.id === this.id) suscripcion.marcarPendiente();
      }
    }
  }

  suscripcionesPendientes(suscripciones: readonly SuscripcionAlumno[]): SuscripcionAlumno[] {
    return suscripciones.filter(
      (suscripcion) => suscripcion.alumno.id === this.id && suscripcion.estaPendiente()
    );
  }

  toRegistroInput(): RegistroInput {
    return {
      legajo: this.legajo,
      apellido: this.apellido,
      nombre: this.nombre,
      githubUsername: this.githubUsername,
      email: this.email,
    };
  }

  confirmarRegistroEn(comision: Comision): void {
    this.registroConfirmadoEn = comision;
  }

  confirmoRegistroEn(comision: Comision | null): boolean {
    if (!comision) return false;
    return this.registroConfirmadoEn?.id === comision.id;
  }

  necesitaConfirmarRegistroPara(comision: Comision | null): boolean {
    return !this.confirmoRegistroEn(comision);
  }

  tieneSyncDeAlumnoFallido(): boolean {
    return this.alumnoSyncFallidoEn !== null;
  }

  marcarSyncDeAlumnoFallido(fecha = new Date()): void {
    this.alumnoSyncFallidoEn = fecha;
  }

  limpiarSyncDeAlumnoFallido(): void {
    this.alumnoSyncFallidoEn = null;
  }

  tieneSyncDeGruposFallido(): boolean {
    return this.gruposSyncFallidoEn !== null;
  }

  marcarSyncDeGruposFallido(fecha = new Date()): void {
    this.gruposSyncFallidoEn = fecha;
  }

  limpiarSyncDeGruposFallido(): void {
    this.gruposSyncFallidoEn = null;
  }

  /**
   * Asuntos de sincronización propios del alumno — datos hacia la planilla y
   * asignación a grupo de TP. No incluye canales de comunicación externos
   * (Google Groups, etc.): esos viven en `SuscripcionAlumno`, una entidad
   * aparte, consultada mediante `suscripcionesPendientes`. `estadoDeSincronizacion.ts`
   * combina esta lista con la de los canales activos para armar el mensaje
   * final — un asunto por feature, enumerados, en vez de una cadena de `if`
   * que enumere combinaciones a mano.
   */
  asuntosDeSyncPendientes(): string[] {
    const asuntos: string[] = [];
    if (this.tieneSyncDeAlumnoFallido()) {
      asuntos.push("reflejar tus datos de alumno en la planilla");
    }
    if (this.tieneSyncDeGruposFallido()) {
      asuntos.push("asignarte a tu grupo de TP desde la planilla");
    }
    return asuntos;
  }
}

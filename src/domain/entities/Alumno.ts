import { Entity, Enum, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { randomUUID } from "crypto";
import { Comision } from "./Comision";
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

export type EstadoGoogleGroup =
  | "pendiente"
  | "sincronizado"
  | "fallido"
  | "omitido";

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
  @ManyToOne(() => Comision)
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

  @Enum({ items: ["pendiente", "sincronizado", "fallido", "omitido"] })
  googleGroupEstado: EstadoGoogleGroup = "pendiente";

  @Property({ type: "string", nullable: true })
  googleGroupEmailSincronizado: string | null = null;

  @Property({ type: "array" })
  googleGroupEmailsPendientesBaja: string[] = [];

  @Property({ type: "text", nullable: true })
  googleGroupUltimoError: string | null = null;

  @Property({ type: "datetime", nullable: true })
  googleGroupUltimoIntentoEn: Date | null = null;

  @Property({ type: "datetime", nullable: true })
  googleGroupSincronizadoEn: Date | null = null;

  get usernameCanonico(): string {
    return Alumno.normalizarUsername(this.githubUsername);
  }

  get nombreCompleto(): string {
    return `${this.apellido}, ${this.nombre}`;
  }

  // Aplica solo los campos de RegistroInput (sin comisión ni confirmación).
  // Usado por parseAlumnosRows en sheets.ts, donde los Alumno son transitorios
  // (DTOs de planilla) y la comisión se inyecta en el call site de upsertAlumnos.
  aplicarRegistro(input: RegistroInput): void {
    this.legajo = input.legajo.trim();
    this.nombre = input.nombre.trim();
    this.apellido = input.apellido.trim();
    this.githubUsername = Alumno.normalizarUsername(input.githubUsername);
    this.email = Alumno.normalizarEmail(input.email);
  }

  actualizarDatos(data: AlumnoData): void {
    const emailAnterior = this.email
      ? Alumno.normalizarEmail(this.email)
      : null;
    this.aplicarRegistro(data);
    this.comision = data.comision;
    if (data.registroConfirmadoEn !== undefined) {
      this.registroConfirmadoEn = data.registroConfirmadoEn;
    }
    if (emailAnterior && emailAnterior !== this.email) {
      this.marcarGoogleGroupPendiente();
    }
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

  tieneGoogleGroupPendiente(integracionHabilitada: boolean): boolean {
    if (!integracionHabilitada) return false;
    return (
      this.googleGroupEstado === "pendiente" ||
      this.googleGroupEstado === "fallido" ||
      this.googleGroupEstado === "omitido"
    );
  }

  marcarGoogleGroupPendiente(): void {
    this.googleGroupEstado = "pendiente";
    this.googleGroupUltimoError = null;
  }

  registrarIntentoGoogleGroup(fecha = new Date()): void {
    this.googleGroupUltimoIntentoEn = fecha;
  }

  registrarEmailAgregadoAGoogleGroup(email: string): void {
    const emailNormalizado = Alumno.normalizarEmail(email);
    const anterior = this.googleGroupEmailSincronizado;
    if (
      anterior &&
      anterior !== emailNormalizado &&
      !this.googleGroupEmailsPendientesBaja.includes(anterior)
    ) {
      this.googleGroupEmailsPendientesBaja.push(anterior);
    }
    this.googleGroupEmailSincronizado = emailNormalizado;
  }

  registrarBajaGoogleGroup(email: string): void {
    const emailNormalizado = Alumno.normalizarEmail(email);
    this.googleGroupEmailsPendientesBaja =
      this.googleGroupEmailsPendientesBaja.filter(
        (pendiente) => pendiente !== emailNormalizado
      );
  }

  marcarGoogleGroupSincronizado(fecha = new Date()): void {
    this.googleGroupEstado = "sincronizado";
    this.googleGroupUltimoError = null;
    this.googleGroupSincronizadoEn = fecha;
  }

  marcarGoogleGroupFallido(error: string): void {
    this.googleGroupEstado = "fallido";
    this.googleGroupUltimoError = error;
  }

  marcarGoogleGroupOmitido(): void {
    this.googleGroupEstado = "omitido";
    this.googleGroupUltimoError = null;
  }

  tieneSyncPendiente(integracionGoogleHabilitada = false): boolean {
    return (
      this.tieneSyncDeAlumnoFallido() ||
      this.tieneSyncDeGruposFallido() ||
      this.tieneGoogleGroupPendiente(integracionGoogleHabilitada)
    );
  }

  mensajeDeSyncPendiente(integracionGoogleHabilitada = false): string {
    const googleGroupPendiente = this.tieneGoogleGroupPendiente(
      integracionGoogleHabilitada
    );
    if (
      googleGroupPendiente &&
      (this.tieneSyncDeGruposFallido() || this.tieneSyncDeAlumnoFallido())
    ) {
      return "Hay sincronizaciones pendientes de tus datos y de tu suscripción al grupo de Google.";
    }
    if (googleGroupPendiente) {
      return "No pudimos completar tu suscripción al grupo de Google.";
    }
    if (this.tieneSyncDeGruposFallido() && this.tieneSyncDeAlumnoFallido()) {
      return "No pudimos sincronizar tus datos ni asignarte a tu grupo de TP desde la planilla.";
    }
    if (this.tieneSyncDeGruposFallido()) {
      return "No pudimos asignarte a tu grupo de TP desde la planilla.";
    }
    if (this.tieneSyncDeAlumnoFallido()) {
      return "No pudimos reflejar tus datos de alumno en la planilla.";
    }
    return "";
  }
}

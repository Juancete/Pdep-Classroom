import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { randomUUID } from "crypto";
import { Comision } from "./Comision";
import { ALUMNO_LEGAJO_PATTERN, ALUMNO_EMAIL_PATTERN, normalizarGithubUsername } from "./domain-constants";

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

  @ManyToOne(() => Comision, { nullable: true })
  comision?: Comision;

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

  tieneSyncDeGruposFallido(): boolean {
    return this.gruposSyncFallidoEn !== null;
  }

  tieneSyncPendiente(): boolean {
    return this.tieneSyncDeAlumnoFallido() || this.tieneSyncDeGruposFallido();
  }

  mensajeDeSyncPendiente(): string {
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

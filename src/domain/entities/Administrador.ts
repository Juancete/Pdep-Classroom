import { Entity, PrimaryKey, Property, Unique } from "@mikro-orm/core";
import { randomUUID } from "node:crypto";
import { normalizarGithubUsername, esGithubUsernameValido } from "./domain-constants";

export interface AltaAdministradorInput {
  githubUsername: string;
  nombre?: string | null;
  porUsuario: string;
}

// Lanzado por `crear()`/`renombrar()` cuando la entidad no puede garantizar
// sus propias invariantes (formato de username, longitud de nombre). Distinto
// de `validarAlta`/`validarNombre`, que devuelven un string para que el
// caller arme un error de campo antes de tocar la DB — esto es la defensa de
// último recurso de la entidad misma.
export class AdministradorInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdministradorInvalidoError";
  }
}

const NOMBRE_MAX_LENGTH = 255;

/**
 * Administrador gestionado desde la aplicación (issue #83): un ayudante con
 * permisos docentes globales, sin necesitar registro académico. Distinto de
 * los responsables de `ADMIN_GITHUB_USERNAMES` (esos no tienen fila acá — ver
 * `resolverRol` en `RolDeUsuario.ts`): sólo ellos pueden dar de alta filas de
 * esta tabla, y esas filas nunca alcanzan `puedeGestionarAdministradores()`.
 *
 * El username es la identidad y es inmutable — `readonly`, fijado una sola
 * vez en el constructor (mismo patrón que `Comision`). Para corregir una
 * cuenta mal cargada, el flujo es desactivar y crear otra (documentado en el
 * issue).
 */
@Entity({ tableName: "administrador" })
@Unique({ name: "administrador_github_username_unique_idx", properties: ["githubUsername"] })
export class Administrador {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property({ type: "string" })
  readonly githubUsername: string;

  @Property({ type: "string", nullable: true })
  nombre: string | null = null;

  @Property({ type: "boolean" })
  activo: boolean = true;

  @Property({ type: "datetime" })
  creadoEn: Date = new Date();

  @Property({ type: "string" })
  creadoPor!: string;

  @Property({ type: "datetime" })
  modificadoEn: Date = new Date();

  @Property({ type: "string" })
  modificadoPor!: string;

  constructor(githubUsername: string) {
    this.githubUsername = normalizarGithubUsername(githubUsername);
  }

  // Valida el alta antes de tocar la DB: mismo criterio que
  // `Alumno.validateRegistro` (un string con el motivo, o null si está bien).
  // El UNIQUE de `githubUsername` sigue siendo la garantía real; esto es sólo
  // para devolver un mensaje de campo útil antes del flush.
  static validarAlta(input: { githubUsername: string; nombre?: string | null }): string | null {
    if (typeof input.githubUsername !== "string" || !input.githubUsername.trim()) {
      return "El usuario de GitHub es obligatorio";
    }
    if (!esGithubUsernameValido(input.githubUsername)) {
      return "El usuario de GitHub no tiene un formato válido";
    }
    return Administrador.validarNombre(input.nombre);
  }

  // Mismo criterio que `validarAlta`: un string con el motivo, o null si está
  // bien. La columna es `varchar(255)` — un texto más largo revienta el
  // flush en vez de devolver un mensaje de campo útil.
  static validarNombre(nombre: string | null | undefined): string | null {
    if (nombre != null && nombre.trim().length > NOMBRE_MAX_LENGTH) {
      return "El nombre no puede superar los 255 caracteres";
    }
    return null;
  }

  static crear({ githubUsername, nombre, porUsuario }: AltaAdministradorInput): Administrador {
    const errorDeValidacion = Administrador.validarAlta({ githubUsername, nombre });
    if (errorDeValidacion) throw new AdministradorInvalidoError(errorDeValidacion);

    const administrador = new Administrador(githubUsername);
    const ahora = new Date();
    administrador.nombre = nombre?.trim() || null;
    administrador.activo = true;
    administrador.creadoEn = ahora;
    administrador.creadoPor = porUsuario;
    administrador.modificadoEn = ahora;
    administrador.modificadoPor = porUsuario;
    return administrador;
  }

  // Editar el nombre no toca la identidad ni los permisos (criterio de
  // aceptación del issue) — sólo el campo de referencia y la auditoría.
  renombrar(nombre: string | null | undefined, porUsuario: string, ahora: Date = new Date()): void {
    const errorDeValidacion = Administrador.validarNombre(nombre);
    if (errorDeValidacion) throw new AdministradorInvalidoError(errorDeValidacion);

    this.nombre = nombre?.trim() || null;
    this.modificadoEn = ahora;
    this.modificadoPor = porUsuario;
  }

  // Idempotente: pedir desactivar algo ya inactivo es un no-op que no
  // resella la auditoría — mismo criterio que `Assignment.transicionarA`.
  desactivar(porUsuario: string, ahora: Date = new Date()): void {
    if (!this.activo) return;
    this.activo = false;
    this.modificadoEn = ahora;
    this.modificadoPor = porUsuario;
  }

  reactivar(porUsuario: string, ahora: Date = new Date()): void {
    if (this.activo) return;
    this.activo = true;
    this.modificadoEn = ahora;
    this.modificadoPor = porUsuario;
  }
}

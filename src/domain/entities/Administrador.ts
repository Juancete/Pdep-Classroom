import { Entity, PrimaryKey, Property, Unique } from "@mikro-orm/core";
import { randomUUID } from "node:crypto";
import { normalizarGithubUsername, esGithubUsernameValido } from "./domain-constants";

export interface AltaAdministradorInput {
  githubUsername: string;
  nombre?: string | null;
  porUsuario: string;
}

/**
 * Administrador gestionado desde la aplicación (issue #83): un ayudante con
 * permisos docentes globales, sin necesitar registro académico. Distinto de
 * los responsables de `ADMIN_GITHUB_USERNAMES` (esos no tienen fila acá — ver
 * `resolverRol` en `RolDeUsuario.ts`): sólo ellos pueden dar de alta filas de
 * esta tabla, y esas filas nunca alcanzan `puedeGestionarAdministradores()`.
 *
 * El username es la identidad y es inmutable — no hay setter. Para corregir
 * una cuenta mal cargada, el flujo es desactivar y crear otra (documentado en
 * el issue).
 */
@Entity({ tableName: "administrador" })
@Unique({ name: "administrador_github_username_unique_idx", properties: ["githubUsername"] })
export class Administrador {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property({ type: "string" })
  githubUsername!: string;

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
    return null;
  }

  static crear({ githubUsername, nombre, porUsuario }: AltaAdministradorInput): Administrador {
    const administrador = new Administrador();
    const ahora = new Date();
    administrador.githubUsername = normalizarGithubUsername(githubUsername);
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

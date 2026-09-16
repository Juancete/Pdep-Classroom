import { getEM } from "@/infrastructure/db";
import { Administrador, type AltaAdministradorInput } from "@/domain/entities";
import { normalizarGithubUsername } from "@/domain/entities/domain-constants";
import { esResponsableDeEntorno } from "@/lib/responsables-de-entorno";
import { extractDbErrorCode, UNIQUE_VIOLATION } from "./db-errors";

const GITHUB_USERNAME_UNIQUE_CONSTRAINT = "administrador_github_username_unique_idx";

export class AdministradorDuplicadoError extends Error {
  constructor(
    public readonly githubUsername: string,
    public readonly existenteInactivo: boolean
  ) {
    super(
      existenteInactivo
        ? `Ya existe un administrador con el usuario @${githubUsername}, pero está desactivado. Reactivalo en vez de crear uno nuevo.`
        : `Ya existe un administrador con el usuario @${githubUsername}.`
    );
    this.name = "AdministradorDuplicadoError";
  }
}

export class AdministradorNoEncontradoError extends Error {
  constructor(public readonly id: string) {
    super("El administrador no existe.");
    this.name = "AdministradorNoEncontradoError";
  }
}

// Un responsable configurado por `ADMIN_GITHUB_USERNAMES` puede agregarse al
// entorno después de que ya exista (o se cree) una fila de `Administrador`
// con el mismo username. Esta es la política única (alta, renombrado, cambio
// de estado pasan por acá) que impide gestionar esa fila desde la app: el
// origen "Entorno" manda.
export class AdministradorProtegidoError extends Error {
  constructor(public readonly githubUsername: string) {
    super(
      `@${githubUsername} es responsable por configuración del entorno (ADMIN_GITHUB_USERNAMES) y no se puede gestionar desde la aplicación.`
    );
    this.name = "AdministradorProtegidoError";
  }
}

function esViolacionDeUsernameUnico(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`;
  return extractDbErrorCode(error) === UNIQUE_VIOLATION && message.includes(GITHUB_USERNAME_UNIQUE_CONSTRAINT);
}

function asegurarQueNoEsResponsableDeEntorno(githubUsername: string): void {
  if (esResponsableDeEntorno(githubUsername)) {
    throw new AdministradorProtegidoError(githubUsername);
  }
}

export async function getAdministradores(): Promise<Administrador[]> {
  const entityManager = await getEM();
  return entityManager.find(Administrador, {}, { orderBy: { githubUsername: "ASC" } });
}

// Hot path: se llama en cada request autenticada (ver
// `src/infrastructure/auth/session.ts`) para todo usuario que no sea
// responsable por entorno. Sin `populate`, sólo cuenta.
export async function hayAdministradorActivo(githubUsername: string): Promise<boolean> {
  const entityManager = await getEM();
  const count = await entityManager.count(Administrador, {
    githubUsername: normalizarGithubUsername(githubUsername),
    activo: true,
  });
  return count > 0;
}

export async function crearAdministrador(data: AltaAdministradorInput): Promise<Administrador> {
  const entityManager = await getEM();
  const administrador = Administrador.crear(data);
  asegurarQueNoEsResponsableDeEntorno(administrador.githubUsername);
  entityManager.persist(administrador);
  try {
    await entityManager.flush();
    return administrador;
  } catch (error) {
    if (!esViolacionDeUsernameUnico(error)) throw error;
    const existente = await entityManager.findOne(Administrador, {
      githubUsername: administrador.githubUsername,
    });
    throw new AdministradorDuplicadoError(administrador.githubUsername, existente ? !existente.activo : false);
  }
}

export async function renombrarAdministrador(
  id: string,
  nombre: string | null | undefined,
  porUsuario: string
): Promise<Administrador> {
  const entityManager = await getEM();
  const administrador = await entityManager.findOne(Administrador, { id });
  if (!administrador) throw new AdministradorNoEncontradoError(id);
  asegurarQueNoEsResponsableDeEntorno(administrador.githubUsername);
  administrador.renombrar(nombre, porUsuario);
  await entityManager.flush();
  return administrador;
}

export async function cambiarEstadoAdministrador(
  id: string,
  activo: boolean,
  porUsuario: string
): Promise<Administrador> {
  const entityManager = await getEM();
  const administrador = await entityManager.findOne(Administrador, { id });
  if (!administrador) throw new AdministradorNoEncontradoError(id);
  asegurarQueNoEsResponsableDeEntorno(administrador.githubUsername);
  if (activo) {
    administrador.reactivar(porUsuario);
  } else {
    administrador.desactivar(porUsuario);
  }
  await entityManager.flush();
  return administrador;
}

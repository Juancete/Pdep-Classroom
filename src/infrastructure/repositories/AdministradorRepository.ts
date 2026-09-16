import { getEM } from "@/infrastructure/db";
import { Administrador, type AltaAdministradorInput } from "@/domain/entities";
import { normalizarGithubUsername } from "@/domain/entities/domain-constants";
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

function esViolacionDeUsernameUnico(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`;
  return extractDbErrorCode(error) === UNIQUE_VIOLATION && message.includes(GITHUB_USERNAME_UNIQUE_CONSTRAINT);
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
  if (activo) {
    administrador.reactivar(porUsuario);
  } else {
    administrador.desactivar(porUsuario);
  }
  await entityManager.flush();
  return administrador;
}

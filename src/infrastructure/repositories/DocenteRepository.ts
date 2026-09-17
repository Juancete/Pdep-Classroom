import { getEM } from "@/infrastructure/db";
import { Docente, type AltaDocenteInput } from "@/domain/entities";
import { normalizarGithubUsername } from "@/domain/entities/domain-constants";
import { esResponsableDeEntorno } from "@/lib/responsables-de-entorno";
import { extractDbErrorCode, UNIQUE_VIOLATION } from "./db-errors";

const GITHUB_USERNAME_UNIQUE_CONSTRAINT = "docente_github_username_unique_idx";

export class DocenteDuplicadoError extends Error {
  constructor(
    public readonly githubUsername: string,
    public readonly existenteInactivo: boolean
  ) {
    super(
      existenteInactivo
        ? `Ya existe un docente con el usuario @${githubUsername}, pero está desactivado. Reactivalo en vez de crear uno nuevo.`
        : `Ya existe un docente con el usuario @${githubUsername}.`
    );
    this.name = "DocenteDuplicadoError";
  }
}

export class DocenteNoEncontradoError extends Error {
  constructor(public readonly id: string) {
    super("El docente no existe.");
    this.name = "DocenteNoEncontradoError";
  }
}

// Un responsable configurado por `ADMIN_GITHUB_USERNAMES` puede agregarse al
// entorno después de que ya exista (o se cree) una fila de `Docente`
// con el mismo username. Esta es la política única (alta, renombrado, cambio
// de estado pasan por acá) que impide gestionar esa fila desde la app: el
// origen "Entorno" manda.
export class DocenteProtegidoError extends Error {
  constructor(public readonly githubUsername: string) {
    super(
      `@${githubUsername} es responsable por configuración del entorno (ADMIN_GITHUB_USERNAMES) y no se puede gestionar desde la aplicación.`
    );
    this.name = "DocenteProtegidoError";
  }
}

function esViolacionDeUsernameUnico(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`;
  return extractDbErrorCode(error) === UNIQUE_VIOLATION && message.includes(GITHUB_USERNAME_UNIQUE_CONSTRAINT);
}

function asegurarQueNoEsResponsableDeEntorno(githubUsername: string): void {
  if (esResponsableDeEntorno(githubUsername)) {
    throw new DocenteProtegidoError(githubUsername);
  }
}

export async function getDocentes(): Promise<Docente[]> {
  const entityManager = await getEM();
  return entityManager.find(Docente, {}, { orderBy: { githubUsername: "ASC" } });
}

// Hot path: se llama en cada request autenticada (ver
// `src/infrastructure/auth/session.ts`) para todo usuario que no sea
// responsable por entorno. Sin `populate`, sólo cuenta.
export async function hayDocenteActivo(githubUsername: string): Promise<boolean> {
  const entityManager = await getEM();
  const count = await entityManager.count(Docente, {
    githubUsername: normalizarGithubUsername(githubUsername),
    activo: true,
  });
  return count > 0;
}

export async function crearDocente(data: AltaDocenteInput): Promise<Docente> {
  const entityManager = await getEM();
  const docente = Docente.crear(data);
  asegurarQueNoEsResponsableDeEntorno(docente.githubUsername);
  entityManager.persist(docente);
  try {
    await entityManager.flush();
    return docente;
  } catch (error) {
    if (!esViolacionDeUsernameUnico(error)) throw error;
    const existente = await entityManager.findOne(Docente, {
      githubUsername: docente.githubUsername,
    });
    throw new DocenteDuplicadoError(docente.githubUsername, existente ? !existente.activo : false);
  }
}

export async function renombrarDocente(
  id: string,
  nombre: string | null | undefined,
  porUsuario: string
): Promise<Docente> {
  const entityManager = await getEM();
  const docente = await entityManager.findOne(Docente, { id });
  if (!docente) throw new DocenteNoEncontradoError(id);
  asegurarQueNoEsResponsableDeEntorno(docente.githubUsername);
  docente.renombrar(nombre, porUsuario);
  await entityManager.flush();
  return docente;
}

export async function cambiarEstadoDocente(
  id: string,
  activo: boolean,
  porUsuario: string
): Promise<Docente> {
  const entityManager = await getEM();
  const docente = await entityManager.findOne(Docente, { id });
  if (!docente) throw new DocenteNoEncontradoError(id);
  asegurarQueNoEsResponsableDeEntorno(docente.githubUsername);
  if (activo) {
    docente.reactivar(porUsuario);
  } else {
    docente.desactivar(porUsuario);
  }
  await entityManager.flush();
  return docente;
}

import { getEM } from "@/lib/db";
import { LockMode } from "@mikro-orm/core";
import {
  Assignment,
  AssignmentNoEncontradoError,
  Comision,
  Entrega,
  Grupo,
  IndividualAssignment,
  GrupalAssignment,
} from "@/domain/entities";
import type { AssignmentFormData } from "@/lib/assignment-schema";
import { slugify } from "@/lib/naming";
import type { NombreEstadoAssignment, Paradigma } from "@/types";

export class ComisionActivaRequeridaError extends Error {
  constructor() {
    super("Necesitás una comisión activa para crear assignments.");
    this.name = "ComisionActivaRequeridaError";
  }
}

export class AssignmentNoEliminableError extends Error {
  constructor(public readonly motivo: "estado" | "entregas" | "grupos") {
    const mensajes = {
      estado: "Sólo se pueden eliminar assignments que todavía están en borrador.",
      entregas: "El assignment tiene entregas y debe conservarse como histórico. Archivá el TP en lugar de eliminarlo.",
      grupos: "El assignment tiene grupos asociados y debe conservarse como histórico.",
    } as const;
    super(mensajes[motivo]);
    this.name = "AssignmentNoEliminableError";
  }
}

export class AssignmentEstructuraInmutableError extends Error {
  constructor(public readonly campos: string[]) {
    super(
      `No se puede cambiar ${campos.join(", ")} en un assignment publicado o archivado.`
    );
    this.name = "AssignmentEstructuraInmutableError";
  }
}

// Estados en los que un assignment puede aparecer en superficies de alumno.
// Borrador nunca; el filtrado fino de "archivado solo si tiene entrega" lo
// hace el caller (dashboard, /api/assignments) con `esVisibleParaAlumno`.
const ESTADOS_VISIBLES_PARA_ALUMNO: NombreEstadoAssignment[] = [
  "publicado",
  "archivado",
];

export async function getAssignments(filtro?: {
  estado?: NombreEstadoAssignment;
}): Promise<Assignment[]> {
  const entityManager = await getEM();
  return entityManager.find(
    Assignment,
    filtro?.estado ? { estadoNombre: filtro.estado } : {},
    { orderBy: { createdAt: "DESC" }, populate: ["comision"] }
  );
}

export async function getAssignmentsDeComision(
  comisionId: string
): Promise<Assignment[]> {
  const entityManager = await getEM();
  return entityManager.find(
    Assignment,
    {
      comision: { id: comisionId },
      estadoNombre: { $in: ESTADOS_VISIBLES_PARA_ALUMNO },
    },
    { orderBy: { createdAt: "DESC" } }
  );
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const entityManager = await getEM();
  return entityManager.findOne(Assignment, { id }, { populate: ["comision"] });
}

export async function createAssignment(
  data: AssignmentFormData
): Promise<Assignment> {
  const entityManager = await getEM();
  const comisionActiva = await entityManager.findOne(Comision, { activa: true });
  if (!comisionActiva) throw new ComisionActivaRequeridaError();

  const slug = data.slug || slugify(data.titulo);

  const assignment: Assignment =
    data.tipo === "grupal" ? new GrupalAssignment() : new IndividualAssignment();
  assignment.aplicarCamposExtra(data);

  assignment.titulo = data.titulo;
  assignment.slug = slug;
  assignment.descripcion = data.descripcion;
  assignment.templateRepo = data.templateRepo;
  assignment.paradigma = data.paradigma as Paradigma;
  assignment.comision = comisionActiva;
  if (data.deadline) assignment.deadline = new Date(data.deadline);

  entityManager.persist(assignment);
  await entityManager.flush();
  return assignment;
}

export async function updateAssignment(
  id: string,
  data: Partial<AssignmentFormData>
): Promise<Assignment | null> {
  const entityManager = await getEM();
  const assignment = await entityManager.findOne(Assignment, { id });
  if (!assignment) return null;

  if (data.tipo !== undefined && data.tipo !== assignment.tipo) {
    throw new AssignmentEstructuraInmutableError(["el tipo"]);
  }
  if (assignment.estadoNombre !== "borrador") {
    const campos: string[] = [];
    const slugNuevo = data.slug === undefined
      ? assignment.slug
      : data.slug || slugify(data.titulo ?? assignment.titulo);
    if (slugNuevo !== assignment.slug) campos.push("el slug");
    if (data.templateRepo !== undefined && data.templateRepo !== assignment.templateRepo) {
      campos.push("el template");
    }
    if (data.paradigma !== undefined && data.paradigma !== assignment.paradigma) {
      campos.push("el paradigma");
    }
    if (
      data.maxIntegrantes !== undefined &&
      assignment instanceof GrupalAssignment &&
      data.maxIntegrantes !== assignment.maxIntegrantes
    ) {
      campos.push("el máximo de integrantes");
    }
    if (campos.length > 0) throw new AssignmentEstructuraInmutableError(campos);
  }

  if (data.titulo !== undefined) assignment.titulo = data.titulo;
  if (data.slug !== undefined)
    assignment.slug = data.slug || slugify(data.titulo ?? assignment.titulo);
  if (data.descripcion !== undefined) assignment.descripcion = data.descripcion;
  if (data.templateRepo !== undefined) assignment.templateRepo = data.templateRepo;
  if (data.paradigma !== undefined)
    assignment.paradigma = data.paradigma as Paradigma;
  if (data.deadline !== undefined)
    assignment.deadline = data.deadline ? new Date(data.deadline) : undefined;

  assignment.aplicarCamposExtra(data);

  await entityManager.flush();
  return assignment;
}

export async function deleteAssignment(id: string): Promise<void> {
  const entityManager = await getEM();
  await entityManager.transactional(async (transaction) => {
    const assignment = await transaction.findOne(
      Assignment,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    );
    if (!assignment) return;
    if (assignment.estadoNombre !== "borrador") {
      throw new AssignmentNoEliminableError("estado");
    }
    if ((await transaction.count(Entrega, { assignment: { id } })) > 0) {
      throw new AssignmentNoEliminableError("entregas");
    }
    if ((await transaction.count(Grupo, { assignment: { id } })) > 0) {
      throw new AssignmentNoEliminableError("grupos");
    }
    transaction.remove(assignment);
    await transaction.flush();
  });
}

export async function setInscripcionesCerradas(
  assignmentId: string,
  cerradas: boolean
): Promise<GrupalAssignment | null> {
  const entityManager = await getEM();
  const assignment = await entityManager.findOne(GrupalAssignment, { id: assignmentId });
  if (!assignment) return null;
  assignment.inscripcionesCerradas = cerradas;
  await entityManager.flush();
  return assignment;
}

/**
 * Aplica una transición de ciclo de vida. Bloquea el assignment
 * (PESSIMISTIC_WRITE) y cuenta sus entregas dentro de la misma transacción
 * para que la guarda de despublicar (bloqueada si hay entregas) vea un
 * estado consistente aunque un alumno esté aceptando el assignment en
 * paralelo — ver `crearEntregaSiAssignmentDisponible`, que toma el mismo
 * lock del otro lado de esa carrera. Lanza `AssignmentNoEncontradoError` si
 * no existe y deja propagar `TransicionDeEstadoInvalidaError` si la
 * transición no está permitida — en ese caso no se persiste ningún cambio.
 */
export async function cambiarEstadoAssignment(
  assignmentId: string,
  destino: NombreEstadoAssignment,
  porUsuario: string
): Promise<Assignment> {
  const entityManager = await getEM();

  return entityManager.transactional(async (transaction) => {
    const assignment = await transaction.findOne(
      Assignment,
      { id: assignmentId },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    );
    if (!assignment) throw new AssignmentNoEncontradoError(assignmentId);

    const tieneEntregas =
      (await transaction.count(Entrega, { assignment: { id: assignmentId } })) > 0;
    assignment.transicionarA(destino, { tieneEntregas }, porUsuario);

    await transaction.flush();
    return assignment;
  });
}

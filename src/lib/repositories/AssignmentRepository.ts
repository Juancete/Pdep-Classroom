import { getEM } from "@/lib/db";
import { LockMode } from "@mikro-orm/core";
import {
  Assignment,
  AssignmentNoEliminableError,
  AssignmentNoEncontradoError,
  ComisionActivaRequeridaError,
  Comision,
  crearAssignment,
  Entrega,
  Grupo,
  GrupalAssignment,
} from "@/domain/entities";
import type { AssignmentFormData } from "@/lib/assignment-schema";
import { slugify } from "@/lib/naming";
import type { NombreEstadoAssignment, Paradigma } from "@/types";

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

// Usado por el bootstrap de grupos desde Sheets (`grupoSync.ts`): sólo los
// `GrupalAssignment` de la comisión que coinciden en paradigma con la fila
// de la planilla — un alumno puede tener grupo en varios paradigmas, cada
// fila de la hoja de grupos es una asignación paradigma→grupo (Fase 4 de
// la auditoría de dominio: antes era un `entityManager.find` directo en el
// servicio).
export async function getGrupalAssignmentsDeComisionYParadigma(
  comisionId: string,
  paradigma: Paradigma
): Promise<GrupalAssignment[]> {
  const entityManager = await getEM();
  return entityManager.find(GrupalAssignment, {
    comision: { id: comisionId },
    paradigma,
  });
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const entityManager = await getEM();
  return entityManager.findOne(Assignment, { id }, { populate: ["comision"] });
}

// Delega en `Assignment.crear` (factory por tipo, Fase 3 de la auditoría de
// dominio) y en `aplicarCamposExtra`; acá sólo queda resolver el slug (con
// el fallback a partir del título — `slugify` es un util puro, no una regla
// de negocio que la entidad deba encapsular) y setear los campos base.
export async function createAssignment(
  data: AssignmentFormData
): Promise<Assignment> {
  const entityManager = await getEM();
  const comisionActiva = await entityManager.findOne(Comision, { activa: true });
  if (!comisionActiva) throw new ComisionActivaRequeridaError();

  const slug = data.slug || slugify(data.titulo);

  const assignment = crearAssignment(data.tipo);
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

// Delega en `Assignment.actualizarEstructura` (Fase 3 de la auditoría de
// dominio) — acá sólo queda cargar, delegar y flushear.
export async function updateAssignment(
  id: string,
  data: Partial<AssignmentFormData>
): Promise<Assignment | null> {
  const entityManager = await getEM();
  const assignment = await entityManager.findOne(Assignment, { id });
  if (!assignment) return null;

  assignment.actualizarEstructura(data);

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

    const tieneEntregas = (await transaction.count(Entrega, { assignment: { id } })) > 0;
    const tieneGrupos = (await transaction.count(Grupo, { assignment: { id } })) > 0;
    const motivo = assignment.razonNoEliminable({ tieneEntregas, tieneGrupos });
    if (motivo) {
      throw new AssignmentNoEliminableError(motivo);
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

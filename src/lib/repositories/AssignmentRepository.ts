import { getEM, deleteEntity } from "@/lib/db";
import {
  Assignment,
  Comision,
  IndividualAssignment,
  GrupalAssignment,
} from "@/domain/entities";
import type { AssignmentFormData } from "@/lib/assignment-schema";
import { slugify } from "@/lib/naming";
import type { Paradigma } from "@/types";

export class ComisionActivaRequeridaError extends Error {
  constructor() {
    super("Necesitás una comisión activa para crear assignments.");
    this.name = "ComisionActivaRequeridaError";
  }
}

export async function getAssignments(): Promise<Assignment[]> {
  const entityManager = await getEM();
  return entityManager.find(
    Assignment,
    {},
    { orderBy: { createdAt: "DESC" }, populate: ["comision"] }
  );
}

export async function getAssignmentsDeComision(
  comisionId: string
): Promise<Assignment[]> {
  const entityManager = await getEM();
  return entityManager.find(
    Assignment,
    { comision: { id: comisionId } },
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
  await deleteEntity(Assignment, id);
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

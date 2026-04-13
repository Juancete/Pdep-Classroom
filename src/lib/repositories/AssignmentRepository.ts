import { getEM, deleteEntity } from "@/lib/db";
import {
  Assignment,
  IndividualAssignment,
  GrupalAssignment,
} from "@/domain/entities";
import type { AssignmentFormData } from "@/lib/assignment-schema";
import { slugify } from "@/lib/naming";
import type { Paradigma } from "@/types";

export async function getAssignments(): Promise<Assignment[]> {
  const em = await getEM();
  return em.find(Assignment, {}, { orderBy: { createdAt: "DESC" } });
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const em = await getEM();
  return em.findOne(Assignment, { id });
}

export async function createAssignment(
  data: AssignmentFormData
): Promise<Assignment> {
  const em = await getEM();
  const slug = data.slug || slugify(data.titulo);

  let assignment: Assignment;

  if (data.tipo === "grupal") {
    const grupal = new GrupalAssignment();
    grupal.maxIntegrantes = data.maxIntegrantes!;
    assignment = grupal;
  } else {
    assignment = new IndividualAssignment();
  }

  assignment.titulo = data.titulo;
  assignment.slug = slug;
  assignment.descripcion = data.descripcion;
  assignment.templateRepo = data.templateRepo;
  assignment.paradigma = data.paradigma as Paradigma;
  if (data.deadline) assignment.deadline = new Date(data.deadline);

  em.persist(assignment);
  await em.flush();
  return assignment;
}

export async function updateAssignment(
  id: string,
  data: Partial<AssignmentFormData>
): Promise<Assignment | null> {
  const em = await getEM();
  const assignment = await em.findOne(Assignment, { id });
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

  if (assignment instanceof GrupalAssignment && data.maxIntegrantes !== undefined) {
    assignment.maxIntegrantes = data.maxIntegrantes;
  }

  await em.flush();
  return assignment;
}

export async function deleteAssignment(id: string): Promise<void> {
  await deleteEntity(Assignment, id);
}

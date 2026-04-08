// Store simple para assignments y entregas.
// Arranca con un JSON en disco para desarrollo local.
// En producción podés migrar a Vercel KV o Postgres con el mismo
// interface sin tocar el resto de la app.

import { readFile, writeFile } from "fs/promises";
import path from "path";
import type { Assignment, Entrega } from "@/types";

const DATA_PATH = path.join(process.cwd(), "data");
const ASSIGNMENTS_FILE = path.join(DATA_PATH, "assignments.json");
const ENTREGAS_FILE = path.join(DATA_PATH, "entregas.json");

// ── Helpers ─────────────────────────────────────────────────

async function readJson<T>(filePath: string): Promise<T[]> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeJson<T>(filePath: string, data: T[]): Promise<void> {
  const { mkdir } = await import("fs/promises");
  await mkdir(DATA_PATH, { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2));
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Assignments ─────────────────────────────────────────────

export async function getAssignments(): Promise<Assignment[]> {
  return readJson<Assignment>(ASSIGNMENTS_FILE);
}

export async function getAssignment(id: string): Promise<Assignment | undefined> {
  const all = await getAssignments();
  return all.find((a) => a.id === id);
}

export async function createAssignment(
  data: Omit<Assignment, "id" | "createdAt">
): Promise<Assignment> {
  const all = await getAssignments();
  const assignment: Assignment = {
    ...data,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  all.push(assignment);
  await writeJson(ASSIGNMENTS_FILE, all);
  return assignment;
}

export async function deleteAssignment(id: string): Promise<void> {
  const all = await getAssignments();
  await writeJson(
    ASSIGNMENTS_FILE,
    all.filter((a) => a.id !== id)
  );
}

export async function updateAssignment(
  id: string,
  data: Partial<Omit<Assignment, "id" | "createdAt">>
): Promise<Assignment | undefined> {
  const all = await getAssignments();
  const idx = all.findIndex((a) => a.id === id);
  if (idx === -1) return undefined;
  all[idx] = { ...all[idx], ...data };
  await writeJson(ASSIGNMENTS_FILE, all);
  return all[idx];
}

// ── Entregas ────────────────────────────────────────────────

export async function getEntregas(assignmentId?: string): Promise<Entrega[]> {
  const all = await readJson<Entrega>(ENTREGAS_FILE);
  if (assignmentId) return all.filter((e) => e.assignmentId === assignmentId);
  return all;
}

export async function getEntregaDeUsuario(
  assignmentId: string,
  githubUsername: string
): Promise<Entrega | undefined> {
  const all = await getEntregas(assignmentId);
  return all.find((e) =>
    e.githubUsernames.some(
      (u) => u.toLowerCase() === githubUsername.toLowerCase()
    )
  );
}

export async function createEntrega(
  data: Omit<Entrega, "id" | "createdAt">
): Promise<Entrega> {
  const all = await readJson<Entrega>(ENTREGAS_FILE);
  const entrega: Entrega = {
    ...data,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  all.push(entrega);
  await writeJson(ENTREGAS_FILE, all);
  return entrega;
}

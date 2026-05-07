import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import {
  getAlumnoByGithub,
  getGruposDeAssignment,
  crearGrupo,
} from "@/lib/repositories";
import {
  AssignmentNoGrupalError,
  InscripcionesCerradasError,
  AlumnoYaEnGrupoDelAssignmentError,
} from "@/domain/entities";
import { internalServerError } from "@/lib/api-errors";
import type { Grupo } from "@/domain/entities";

const CrearGrupoSchema = z.object({
  nombre: z.string().min(1).max(100),
});

function serializarGrupo(grupo: Grupo) {
  return {
    id: grupo.id,
    nombre: grupo.nombre,
    paradigma: grupo.paradigma,
    maxIntegrantes: grupo.maxIntegrantes,
    estaLleno: !grupo.isOpen(),
    miembros: grupo.alumnos.getItems().map((alumno) => alumno.githubUsername),
  };
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireUser();
    const grupos = await getGruposDeAssignment(params.id);
    return NextResponse.json(grupos.map(serializarGrupo));
  } catch (error) {
    return internalServerError("GET /api/assignments/[id]/grupos", error, {
      assignmentId: params.id,
    });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();

    const body = await req.json().catch(() => null);
    const parsed = CrearGrupoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const alumno = await getAlumnoByGithub(user.githubUsername);
    if (!alumno) {
      return NextResponse.json(
        { error: "Alumno no registrado" },
        { status: 404 }
      );
    }

    const grupo = await crearGrupo({
      assignmentId: params.id,
      alumnoId: alumno.id,
      nombre: parsed.data.nombre,
    });

    return NextResponse.json(serializarGrupo(grupo), { status: 201 });
  } catch (error) {
    if (error instanceof AssignmentNoGrupalError) {
      return NextResponse.json(
        { error: "Este assignment no es grupal" },
        { status: 400 }
      );
    }
    if (error instanceof InscripcionesCerradasError) {
      return NextResponse.json(
        { error: "Las inscripciones a grupos están cerradas" },
        { status: 409 }
      );
    }
    if (error instanceof AlumnoYaEnGrupoDelAssignmentError) {
      return NextResponse.json(
        { error: "Ya estás en un grupo para este TP" },
        { status: 409 }
      );
    }
    return internalServerError("POST /api/assignments/[id]/grupos", error, {
      assignmentId: params.id,
    });
  }
}

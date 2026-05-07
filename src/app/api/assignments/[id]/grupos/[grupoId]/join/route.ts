import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getAlumnoByGithub, unirseAGrupo } from "@/lib/repositories";
import {
  InscripcionesCerradasError,
  AlumnoYaEnGrupoDelAssignmentError,
  GrupoLlenoError,
} from "@/domain/entities";
import { internalServerError } from "@/lib/api-errors";
import type { Grupo } from "@/domain/entities";

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

export async function POST(
  _req: Request,
  { params }: { params: { id: string; grupoId: string } }
) {
  try {
    const user = await requireUser();

    const alumno = await getAlumnoByGithub(user.githubUsername);
    if (!alumno) {
      return NextResponse.json(
        { error: "Alumno no registrado" },
        { status: 404 }
      );
    }

    const grupo = await unirseAGrupo({
      grupoId: params.grupoId,
      alumnoId: alumno.id,
    });

    return NextResponse.json(serializarGrupo(grupo));
  } catch (error) {
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
    if (error instanceof GrupoLlenoError) {
      return NextResponse.json(
        { error: "El grupo ya está completo" },
        { status: 409 }
      );
    }
    return internalServerError(
      "POST /api/assignments/[id]/grupos/[grupoId]/join",
      error,
      { assignmentId: params.id, grupoId: params.grupoId }
    );
  }
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getAlumnoByGithub, unirseAGrupo } from "@/lib/repositories";
import {
  InscripcionesCerradasError,
  AlumnoYaEnGrupoDelAssignmentError,
  GrupoLlenoError,
} from "@/domain/entities";
import { internalServerError } from "@/lib/api-errors";
import type { Grupo } from "@/domain/entities";
import {
  AccesoAssignmentProhibidoError,
  AssignmentNoDisponibleError,
  GrupoNoEncontradoError,
} from "@/lib/services/assignmentAuthorization";

function serializarGrupo(grupo: Grupo) {
  return {
    id: grupo.id,
    nombre: grupo.nombre,
    paradigma: grupo.paradigma,
    maxIntegrantes: grupo.maxIntegrantes,
    estaLleno: !grupo.isOpen(),
    miembros: grupo.usernamesDeMiembros(),
  };
}

export async function POST(_req: Request, props: { params: Promise<{ id: string; grupoId: string }> }) {
  const params = await props.params;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const alumno = await getAlumnoByGithub(user.githubUsername, true);
    if (!alumno) {
      return NextResponse.json(
        { error: "No tenés acceso a este assignment" },
        { status: 403 }
      );
    }

    const grupo = await unirseAGrupo({
      assignmentId: params.id,
      grupoId: params.grupoId,
      alumnoId: alumno.id,
      rol: user.rol,
    });

    return NextResponse.json(serializarGrupo(grupo));
  } catch (error) {
    if (error instanceof GrupoNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof AccesoAssignmentProhibidoError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof AssignmentNoDisponibleError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
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

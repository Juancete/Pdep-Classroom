import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import {
  getAlumnoByGithub,
  getAssignment,
  getGruposDeAssignment,
  crearGrupo,
} from "@/lib/repositories";
import {
  AssignmentNoGrupalError,
  InscripcionesCerradasError,
  AlumnoYaEnGrupoDelAssignmentError,
  NombreGrupoDuplicadoError,
  NombreGrupoInvalidoError,
} from "@/domain/entities";
import { internalServerError } from "@/lib/api-errors";
import { NombreRepositorioDemasiadoLargoError } from "@/lib/naming";
import type { Grupo } from "@/domain/entities";
import {
  AccesoAssignmentProhibidoError,
  AssignmentNoDisponibleError,
  AssignmentNoEncontradoError,
  autorizarAccesoAssignment,
} from "@/lib/services/assignmentAuthorization";

const CrearGrupoSchema = z.object({
  nombre: z.string().trim().min(1).max(100),
});

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

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const [assignment, alumno] = await Promise.all([
      getAssignment(params.id),
      user.rol.puedeAdministrar()
        ? Promise.resolve(null)
        : getAlumnoByGithub(user.githubUsername, true),
    ]);
    if (!assignment) throw new AssignmentNoEncontradoError(params.id);
    autorizarAccesoAssignment(user, alumno, assignment);

    const grupos = await getGruposDeAssignment(params.id);
    return NextResponse.json(grupos.map(serializarGrupo));
  } catch (error) {
    if (error instanceof AssignmentNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof AccesoAssignmentProhibidoError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return internalServerError("GET /api/assignments/[id]/grupos", error, {
      assignmentId: params.id,
    });
  }
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = CrearGrupoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const alumno = await getAlumnoByGithub(user.githubUsername, true);
    if (!alumno) {
      return NextResponse.json(
        { error: "No tenés acceso a este assignment" },
        { status: 403 }
      );
    }

    const grupo = await crearGrupo({
      assignmentId: params.id,
      alumnoId: alumno.id,
      nombre: parsed.data.nombre,
      rol: user.rol,
    });

    return NextResponse.json(serializarGrupo(grupo), { status: 201 });
  } catch (error) {
    if (error instanceof AssignmentNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof AccesoAssignmentProhibidoError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof AssignmentNoDisponibleError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
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
    if (error instanceof NombreGrupoDuplicadoError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (
      error instanceof NombreGrupoInvalidoError ||
      error instanceof NombreRepositorioDemasiadoLargoError
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return internalServerError("POST /api/assignments/[id]/grupos", error, {
      assignmentId: params.id,
    });
  }
}

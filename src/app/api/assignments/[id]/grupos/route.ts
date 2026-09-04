import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/infrastructure/auth/session";
import {
  getAlumnoByGithub,
  getAssignment,
  getGruposDeAssignment,
  crearGrupo,
} from "@/infrastructure/repositories";
import { AssignmentNoEncontradoError } from "@/domain/entities";
import { internalServerError, respuestaDeErrorDeDominio } from "@/lib/api-errors";
import { autorizarAccesoAssignment } from "@/application/assignmentAuthorization";

const CrearGrupoSchema = z.object({
  nombre: z.string().trim().min(1).max(100),
});

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
    return NextResponse.json(grupos.map((grupo) => grupo.toResumen()));
  } catch (error) {
    return (
      respuestaDeErrorDeDominio(error) ??
      internalServerError("GET /api/assignments/[id]/grupos", error, {
        assignmentId: params.id,
      })
    );
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

    return NextResponse.json(grupo.toResumen(), { status: 201 });
  } catch (error) {
    return (
      respuestaDeErrorDeDominio(error) ??
      internalServerError("POST /api/assignments/[id]/grupos", error, {
        assignmentId: params.id,
      })
    );
  }
}

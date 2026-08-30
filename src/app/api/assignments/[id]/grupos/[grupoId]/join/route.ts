import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getAlumnoByGithub, unirseAGrupo } from "@/lib/repositories";
import { internalServerError, respuestaDeErrorDeDominio } from "@/lib/api-errors";

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
      usuario: user,
    });

    return NextResponse.json(grupo.toResumen());
  } catch (error) {
    return (
      respuestaDeErrorDeDominio(error) ??
      internalServerError(
        "POST /api/assignments/[id]/grupos/[grupoId]/join",
        error,
        { assignmentId: params.id, grupoId: params.grupoId }
      )
    );
  }
}

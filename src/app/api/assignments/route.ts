import { NextResponse } from "next/server";
import { getCurrentUser } from "@/infrastructure/auth/session";
import {
  getAlumnoByGithub,
  getAssignments,
  getAssignmentsDeComision,
  getEntregasDeUsuario,
} from "@/infrastructure/repositories";
import { internalServerError, respuestaDeErrorDeDominio } from "@/lib/api-errors";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const visibles = await user.rol.assignmentsVisibles({
      todos: () => getAssignments(),
      alumno: () => getAlumnoByGithub(user.githubUsername, true),
      deComision: (comisionId) => getAssignmentsDeComision(comisionId),
      entregasDelUsuario: () => getEntregasDeUsuario(user.githubUsername),
    });
    if (!visibles) {
      return NextResponse.json(
        { error: "No tenés acceso a los assignments" },
        { status: 403 }
      );
    }

    return NextResponse.json(visibles);
  } catch (error) {
    return respuestaDeErrorDeDominio(error) ?? internalServerError("GET /api/assignments", error);
  }
}

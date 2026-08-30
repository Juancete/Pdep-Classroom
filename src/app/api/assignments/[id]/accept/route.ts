import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { GrupoNoAsignadoError } from "@/domain/entities";
import { checkRateLimit } from "@/lib/rate-limit";
import { internalServerError } from "@/lib/api-errors";
import { NombreRepositorioDemasiadoLargoError } from "@/lib/naming";
import {
  aceptarAssignment,
  AlumnoNoRegistradoError,
  RepositorioPreexistenteNoAdministradoError,
  AssignmentNoEncontradoError,
} from "@/lib/services/aceptarAssignment";
import {
  AccesoAssignmentProhibidoError,
  AssignmentNoDisponibleError,
} from "@/lib/services/assignmentAuthorization";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    if (!checkRateLimit(`${user.githubUsername}:${params.id}`)) {
      return NextResponse.json(
        { error: "Demasiadas peticiones, esperá un momento antes de reintentar" },
        { status: 429 }
      );
    }

    const entrega = await aceptarAssignment(params.id, user);
    return NextResponse.json(entrega);
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
    if (error instanceof RepositorioPreexistenteNoAdministradoError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (
      error instanceof GrupoNoAsignadoError ||
      error instanceof AlumnoNoRegistradoError ||
      error instanceof NombreRepositorioDemasiadoLargoError
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return internalServerError(
      "POST /api/assignments/[id]/accept",
      error,
      { assignmentId: params.id }
    );
  }
}

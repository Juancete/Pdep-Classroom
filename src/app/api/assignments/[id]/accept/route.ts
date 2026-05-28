import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { GrupoNoAsignadoError } from "@/domain/entities";
import { checkRateLimit } from "@/lib/rate-limit";
import { internalServerError } from "@/lib/api-errors";
import {
  aceptarAssignment,
  AlumnoNoRegistradoError,
  AssignmentNoEncontradoError,
} from "@/lib/services/aceptarAssignment";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();

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
    if (error instanceof GrupoNoAsignadoError || error instanceof AlumnoNoRegistradoError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return internalServerError(
      "POST /api/assignments/[id]/accept",
      error,
      { assignmentId: params.id }
    );
  }
}

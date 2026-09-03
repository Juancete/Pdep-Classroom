import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin } from "@/lib/api-auth";
import { setInscripcionesCerradas } from "@/infrastructure/repositories";
import { internalServerError } from "@/lib/api-errors";

const InscripcionesSchema = z.object({
  cerrada: z.boolean(),
});

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const unauthorized = await guardAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json().catch(() => null);
    const parsed = InscripcionesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const assignment = await setInscripcionesCerradas(
      params.id,
      parsed.data.cerrada
    );

    if (!assignment) {
      return NextResponse.json(
        { error: "Assignment grupal no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: assignment.id,
      inscripcionesCerradas: assignment.inscripcionesCerradas,
    });
  } catch (error) {
    return internalServerError(
      "PATCH /api/assignments/[id]/inscripciones",
      error,
      { assignmentId: params.id }
    );
  }
}

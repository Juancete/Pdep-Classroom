import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { cambiarEstadoAssignment } from "@/lib/repositories";
import { AssignmentNoEncontradoError } from "@/lib/services/assignmentAuthorization";
import { TransicionDeEstadoInvalidaError } from "@/domain/entities";
import { internalServerError } from "@/lib/api-errors";

const EstadoSchema = z.object({
  estado: z.enum(["borrador", "publicado", "archivado"]),
});

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // No usa guardAdmin(): además de verificar el rol, necesita el
    // githubUsername del admin para sellar la auditoría de la transición
    // (mismo patrón que DELETE /api/assignments/[id]/repos).
    const user = await getCurrentUser();
    if (!user?.rol.puedeAdministrar()) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = EstadoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const assignment = await cambiarEstadoAssignment(
      params.id,
      parsed.data.estado,
      user.githubUsername
    );

    return NextResponse.json({
      id: assignment.id,
      estado: assignment.estadoNombre,
      etiqueta: assignment.estado.etiqueta(),
      publicadoEn: assignment.publicadoEn ?? null,
      publicadoPor: assignment.publicadoPor ?? null,
      archivadoEn: assignment.archivadoEn ?? null,
      archivadoPor: assignment.archivadoPor ?? null,
    });
  } catch (error) {
    if (error instanceof AssignmentNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof TransicionDeEstadoInvalidaError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return internalServerError("PATCH /api/assignments/[id]/estado", error, {
      assignmentId: params.id,
    });
  }
}

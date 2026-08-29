import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { getEntregaPorId } from "@/lib/repositories";
import { reejecutarCIDeEntrega } from "@/lib/services/sincronizarCI";
import { ReejecucionCINoDisponibleError } from "@/domain/entities";
import { internalServerError } from "@/lib/api-errors";

const RerunSchema = z.object({ entregaId: z.string().min(1) });

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getCurrentUser();
    if (!user?.rol.puedeAdministrar()) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = RerunSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const entrega = await getEntregaPorId(parsed.data.entregaId);
    if (!entrega || entrega.assignment.id !== params.id) {
      return NextResponse.json({ error: "Entrega no encontrada" }, { status: 404 });
    }

    if (!entrega.puedeReejecutarCI()) {
      return NextResponse.json(
        { error: "No hay checks previos de CI para reejecutar" },
        { status: 409 }
      );
    }

    await reejecutarCIDeEntrega(entrega);
    return NextResponse.json({ ok: true });
  } catch (error) {
    // `reejecutarCIDeEntrega` puede rechazar con el mismo error tipado que
    // el guard de arriba (ej. un resultado "reejecutable" sin checkSuiteIds
    // guardados) — se traduce a 409 en vez de caer al 500 genérico.
    if (error instanceof ReejecucionCINoDisponibleError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return internalServerError("POST /api/assignments/[id]/ci/rerun", error, {
      assignmentId: params.id,
    });
  }
}

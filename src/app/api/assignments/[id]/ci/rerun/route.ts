import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { getEntregaPorId } from "@/lib/repositories";
import { reejecutarCIDeEntrega } from "@/lib/services/sincronizarCI";
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

    if (!entrega.resultadoCI.permiteReejecucion()) {
      return NextResponse.json(
        { error: "No hay checks previos de CI para reejecutar" },
        { status: 409 }
      );
    }

    await reejecutarCIDeEntrega(entrega);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return internalServerError("POST /api/assignments/[id]/ci/rerun", error, {
      assignmentId: params.id,
    });
  }
}

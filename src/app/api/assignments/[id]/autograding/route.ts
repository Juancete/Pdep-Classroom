import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { getEntregasConRepoActivo, getEntregaDeUsuario } from "@/lib/repositories";
import { sincronizarAutogradingDeEntregas } from "@/lib/services/sincronizarAutograding";
import { internalServerError } from "@/lib/api-errors";

// `forzar` ignora el control de frescura del caché — lo usa el botón
// "Actualizar" explícito. Sin body (o `forzar: false`), respeta la ventana
// de frescura, que es lo que corre el refresh automático al montar la vista.
const AutogradingSyncSchema = z.object({ forzar: z.boolean().optional() });

// Sincroniza el resultado cacheado de autograding contra GitHub. Un admin
// sincroniza todas las entregas con repo activo del assignment; un alumno
// sólo puede refrescar la suya.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = AutogradingSyncSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const entregas = user.rol.puedeAdministrar()
      ? await getEntregasConRepoActivo(params.id)
      : await getEntregaDeUsuario(params.id, user.githubUsername).then((entrega) =>
          entrega ? [entrega] : []
        );

    const resultado = await sincronizarAutogradingDeEntregas(entregas, {
      forzar: parsed.data.forzar,
    });
    return NextResponse.json(resultado);
  } catch (error) {
    return internalServerError("POST /api/assignments/[id]/autograding", error, {
      assignmentId: params.id,
    });
  }
}

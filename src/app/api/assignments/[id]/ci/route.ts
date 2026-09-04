import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/infrastructure/auth/session";
import { getEntregasConRepoActivo, getEntregaDeUsuario } from "@/infrastructure/repositories";
import { sincronizarCIDeEntregas } from "@/application/sincronizarCI";
import { internalServerError } from "@/lib/api-errors";

// `forzar` ignora el control de frescura del caché — lo usa el botón
// "Actualizar" explícito. Sin body (o `forzar: false`), respeta la ventana
// de frescura, que es lo que corre el refresh automático al montar la vista.
const CISyncSchema = z.object({ forzar: z.boolean().optional() });

// Sincroniza el resultado cacheado de CI contra GitHub. Un admin sincroniza
// todas las entregas con repo activo del assignment; un alumno sólo puede
// refrescar la suya.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = CISyncSchema.safeParse(body);
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

    const resultado = await sincronizarCIDeEntregas(entregas, {
      forzar: parsed.data.forzar,
    });
    return NextResponse.json(resultado);
  } catch (error) {
    return internalServerError("POST /api/assignments/[id]/ci", error, {
      assignmentId: params.id,
    });
  }
}

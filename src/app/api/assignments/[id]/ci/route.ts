import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/infrastructure/auth/session";
import { getEntregasConRepoActivo, getEntregaDeUsuario } from "@/infrastructure/repositories";
import { sincronizarCIDeEntregas } from "@/application/sincronizarCI";
import {
  sincronizarParticipacionDeEntregas,
  type SincronizarParticipacionResult,
} from "@/application/sincronizarParticipacion";
import { internalServerError, respuestaDeErrorDeDominio, registrarErrorOperativo } from "@/lib/api-errors";
import {
  mensajeDeFallos,
  mensajeDeFallosDeCI,
  type RespuestaDeSincronizacion,
} from "@/lib/ci-sync-mensajes";

// `forzar` ignora el control de frescura del caché — lo usa el botón
// "Actualizar" explícito. Sin body (o `forzar: false`), respeta la ventana
// de frescura, que es lo que corre el refresh automático al montar la vista.
const CISyncSchema = z.object({ forzar: z.boolean().optional() });

// Un alumno no ve participación (decisión del issue #122: sólo panel
// docente) — no tiene sentido gastar su request en `contributors`.
const SIN_PARTICIPACION: SincronizarParticipacionResult = {
  actualizadas: 0,
  omitidas: 0,
  fallidas: [],
};

// Sincroniza el resultado cacheado de CI y, para un admin, la participación
// por integrante (issue #122) contra GitHub. Un admin sincroniza todas las
// entregas con repo activo del assignment; un alumno sólo puede refrescar
// la suya (y sólo su CI: la participación queda en ceros). Las dos
// sincronizaciones corren secuenciales, no en paralelo, para mantener el
// tope de `MAX_CONCURRENT_GITHUB_SYNC` solicitudes concurrentes a GitHub.
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

    const esAdmin = user.rol.puedeAdministrar();
    const entregas = esAdmin
      ? await getEntregasConRepoActivo(params.id)
      : await getEntregaDeUsuario(params.id, user.githubUsername).then((entrega) =>
          entrega ? [entrega] : []
        );

    const resultado = await sincronizarCIDeEntregas(entregas, {
      forzar: parsed.data.forzar,
    });
    if (resultado.fallidas.length > 0) {
      registrarErrorOperativo(
        "POST /api/assignments/[id]/ci",
        new Error(mensajeDeFallosDeCI(resultado)!),
        { assignmentId: params.id, fallidas: resultado.fallidas.length }
      );
    }

    const participacion = esAdmin
      ? await sincronizarParticipacionDeEntregas(entregas, { forzar: parsed.data.forzar })
      : SIN_PARTICIPACION;
    if (participacion.fallidas.length > 0) {
      registrarErrorOperativo(
        "POST /api/assignments/[id]/ci",
        new Error(mensajeDeFallos(participacion, "la participación")!),
        {
          assignmentId: params.id,
          fallidas: participacion.fallidas.length,
          sincronizacion: "participacion",
        }
      );
    }

    const respuesta: RespuestaDeSincronizacion = { ...resultado, participacion };
    return NextResponse.json(respuesta);
  } catch (error) {
    return (
      respuestaDeErrorDeDominio(error) ??
      internalServerError("POST /api/assignments/[id]/ci", error, {
        assignmentId: params.id,
      })
    );
  }
}

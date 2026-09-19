import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/infrastructure/auth/session";
import { salirDeGrupo, moverAlumnoDeGrupo } from "@/infrastructure/repositories";
import { internalServerError, respuestaDeErrorDeDominio } from "@/lib/api-errors";
import { Alumno, type ActorDeMembresia } from "@/domain/entities";
import type { PdepUser } from "@/types";
import { resolverParticipante } from "@/application/participante";

const CambioDeMembresiaSchema = z.object({
  motivo: z.string().trim().max(280).optional(),
});

type Params = { id: string; grupoId: string; githubUsername: string };

// Sólo el propio interesado o un docente pueden modificar una membresía. No
// usa `guardAdmin()` de `@/lib/api-auth`: hace falta el `githubUsername` del
// usuario para sellar la auditoría (mismo motivo documentado en
// `estado/route.ts`), y además la ruta también sirve al self-service del
// alumno o docente, no sólo al panel admin.
//
// `actor`: si es la propia membresía, el `Participante` resuelto (mismas
// reglas de self-service que crear/unirse a un grupo); si es la de otro,
// `RolDeUsuario.actorSobreMembresiaAjena()` — el docente resuelve siempre,
// un alumno nunca administra a otro (lanza `AccesoAssignmentProhibidoError`).
async function autorizarSolicitante(
  params: Params
): Promise<{ user: PdepUser; actor: ActorDeMembresia } | { error: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }

  const esPropia =
    Alumno.normalizarUsername(params.githubUsername) ===
    Alumno.normalizarUsername(user.githubUsername);

  const actor = esPropia
    ? await resolverParticipante(user)
    : user.rol.actorSobreMembresiaAjena(params.id);

  return { user, actor };
}

async function parseMotivo(req: Request): Promise<{ motivo?: string } | NextResponse> {
  const body = await req.json().catch(() => ({}));
  const parsed = CambioDeMembresiaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", fields: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  return parsed.data;
}

// "Este alumno pertenece a este grupo": alta si no tenía grupo en el
// assignment, cambio si tenía otro, no-op si ya está en este. Idempotente.
export async function PUT(req: Request, props: { params: Promise<Params> }) {
  const params = await props.params;
  try {
    const solicitante = await autorizarSolicitante(params);
    if ("error" in solicitante) return solicitante.error;

    const parsedBody = await parseMotivo(req);
    if (parsedBody instanceof NextResponse) return parsedBody;

    const { grupoDestino, grupoOrigenEliminado } = await moverAlumnoDeGrupo({
      assignmentId: params.id,
      grupoDestinoId: params.grupoId,
      githubUsername: params.githubUsername,
      actor: solicitante.actor,
      realizadoPor: solicitante.user.githubUsername,
      motivo: parsedBody.motivo,
    });

    return NextResponse.json({
      ...grupoDestino.toResumen(),
      grupoOrigenEliminado,
    });
  } catch (error) {
    return (
      respuestaDeErrorDeDominio(error) ??
      internalServerError(
        "PUT /api/assignments/[id]/grupos/[grupoId]/miembros/[githubUsername]",
        error,
        {
          assignmentId: params.id,
          grupoId: params.grupoId,
          githubUsername: params.githubUsername,
        }
      )
    );
  }
}

// Saca al alumno del grupo. Si era el último integrante y el grupo nunca
// tuvo entrega, el grupo se borra en la misma operación.
export async function DELETE(req: Request, props: { params: Promise<Params> }) {
  const params = await props.params;
  try {
    const solicitante = await autorizarSolicitante(params);
    if ("error" in solicitante) return solicitante.error;

    const parsedBody = await parseMotivo(req);
    if (parsedBody instanceof NextResponse) return parsedBody;

    const { grupo, grupoEliminado } = await salirDeGrupo({
      assignmentId: params.id,
      grupoId: params.grupoId,
      githubUsername: params.githubUsername,
      actor: solicitante.actor,
      realizadoPor: solicitante.user.githubUsername,
      motivo: parsedBody.motivo,
    });

    return NextResponse.json({
      ...grupo.toResumen(),
      grupoEliminado,
    });
  } catch (error) {
    return (
      respuestaDeErrorDeDominio(error) ??
      internalServerError(
        "DELETE /api/assignments/[id]/grupos/[grupoId]/miembros/[githubUsername]",
        error,
        {
          assignmentId: params.id,
          grupoId: params.grupoId,
          githubUsername: params.githubUsername,
        }
      )
    );
  }
}

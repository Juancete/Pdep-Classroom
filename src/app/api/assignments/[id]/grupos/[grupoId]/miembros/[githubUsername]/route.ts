import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/infrastructure/auth/session";
import { salirDeGrupo, moverAlumnoDeGrupo } from "@/infrastructure/repositories";
import { internalServerError, respuestaDeErrorDeDominio } from "@/lib/api-errors";
import { Alumno } from "@/domain/entities";

const CambioDeMembresiaSchema = z.object({
  motivo: z.string().trim().max(280).optional(),
});

type Params = { id: string; grupoId: string; githubUsername: string };

// Sólo el propio alumno o un docente pueden modificar una membresía. No usa
// `guardAdmin()` de `@/lib/api-auth`: hace falta el `githubUsername` del
// usuario para sellar la auditoría (mismo motivo documentado en
// `estado/route.ts`), y además la ruta también sirve al self-service del
// alumno, no sólo al panel admin.
async function autorizarSolicitante(params: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }

  const esPropia =
    Alumno.normalizarUsername(params.githubUsername) ===
    Alumno.normalizarUsername(user.githubUsername);
  if (!esPropia && !user.rol.puedeAdministrar()) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Solo podés modificar tu propia membresía" },
        { status: 403 }
      ),
    };
  }

  return { user, error: null };
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
    const { user, error } = await autorizarSolicitante(params);
    if (error) return error;

    const parsedBody = await parseMotivo(req);
    if (parsedBody instanceof NextResponse) return parsedBody;

    const { grupoDestino, grupoOrigenEliminado } = await moverAlumnoDeGrupo({
      assignmentId: params.id,
      grupoDestinoId: params.grupoId,
      githubUsername: params.githubUsername,
      usuario: user!,
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
    const { user, error } = await autorizarSolicitante(params);
    if (error) return error;

    const parsedBody = await parseMotivo(req);
    if (parsedBody instanceof NextResponse) return parsedBody;

    const { grupo, grupoEliminado } = await salirDeGrupo({
      assignmentId: params.id,
      grupoId: params.grupoId,
      githubUsername: params.githubUsername,
      usuario: user!,
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

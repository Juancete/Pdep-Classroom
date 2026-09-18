import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/infrastructure/auth/session";
import { getAssignment, getGruposDeAssignment, crearGrupo } from "@/infrastructure/repositories";
import { AssignmentNoEncontradoError } from "@/domain/entities";
import { internalServerError, respuestaDeErrorDeDominio } from "@/lib/api-errors";
import { resolverParticipante } from "@/application/participante";

const CrearGrupoSchema = z.object({
  nombre: z.string().trim().min(1).max(100),
});

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const [assignment, participante] = await Promise.all([
      getAssignment(params.id),
      resolverParticipante(user),
    ]);
    if (!assignment) throw new AssignmentNoEncontradoError(params.id);
    participante.autorizarAccesoAssignment(assignment);

    // Sólo los grupos del tipo que integra este participante — un alumno no
    // ve grupos de docentes, y viceversa (issue #107/#112).
    const grupos = await getGruposDeAssignment(params.id);
    const gruposVisibles = grupos.filter((grupo) =>
      grupo.admiteIntegrantesDe(participante.tipoDeGrupo())
    );
    return NextResponse.json(gruposVisibles.map((grupo) => grupo.toResumen()));
  } catch (error) {
    return (
      respuestaDeErrorDeDominio(error) ??
      internalServerError("GET /api/assignments/[id]/grupos", error, {
        assignmentId: params.id,
      })
    );
  }
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = CrearGrupoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const participante = await resolverParticipante(user);
    const grupo = await crearGrupo({
      assignmentId: params.id,
      nombre: parsed.data.nombre,
      participante,
    });

    return NextResponse.json(grupo.toResumen(), { status: 201 });
  } catch (error) {
    return (
      respuestaDeErrorDeDominio(error) ??
      internalServerError("POST /api/assignments/[id]/grupos", error, {
        assignmentId: params.id,
      })
    );
  }
}

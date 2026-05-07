import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getAssignment, getEntregaDeUsuario, createEntrega, getGrupoDeAlumnoEnAssignment } from "@/lib/repositories";
import { GrupoNoAsignadoError, type ParticipantesResueltos } from "@/domain/entities";
import { crearEntrega, repoExists, addCollaborators } from "@/lib/github";
import { buildRepoName } from "@/lib/naming";
import { checkRateLimit } from "@/lib/rate-limit";
import { internalServerError } from "@/lib/api-errors";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();

    if (!checkRateLimit(`${user.githubUsername}:${params.id}`)) {
      return NextResponse.json(
        { error: "Demasiadas peticiones, esperá un momento antes de reintentar" },
        { status: 429 }
      );
    }

    const assignment = await getAssignment(params.id);

    if (!assignment) {
      return NextResponse.json({ error: "Assignment no encontrado" }, { status: 404 });
    }

    // ── Ya tiene entrega? ────────────────────────────────────
    const existente = await getEntregaDeUsuario(assignment.id, user.githubUsername);
    if (existente) {
      return NextResponse.json(
        { error: "Ya aceptaste este assignment", repoUrl: existente.repoUrl },
        { status: 409 }
      );
    }

    // ── Determinar quiénes van al repo ───────────────────────
    let participantes: ParticipantesResueltos;
    try {
      participantes = await assignment.resolverParticipantesPara(
        user,
        getGrupoDeAlumnoEnAssignment
      );
    } catch (error) {
      if (error instanceof GrupoNoAsignadoError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
    const { usernames, grupoId } = participantes;

    // ── Extraer nombre del template (sin org) ────────────────
    const templateRepo = assignment.templateRepo.includes("/")
      ? assignment.templateRepo.split("/").pop()!
      : assignment.templateRepo;

    // ── Nombre del repo ──────────────────────────────────────
    const candidateRepoName = buildRepoName({ slug: assignment.slug, usernames, grupoId });

    // Verificar que no exista ya (por si otro miembro del grupo aceptó primero)
    if (await repoExists(candidateRepoName)) {
      // El repo fue creado por otro miembro: agregar al usuario actual como
      // colaborador y registrar la entrega. Sin este addCollaborators el
      // alumno quedaría sin acceso al repo que ya existe en GitHub.
      await addCollaborators(candidateRepoName, [user.githubUsername]);
      const org = process.env.GITHUB_ORG ?? "pdep-mn-utn";
      const entrega = await createEntrega({
        assignmentId: assignment.id,
        repoName: candidateRepoName,
        repoUrl: `https://github.com/${org}/${candidateRepoName}`,
        githubUsernames: usernames,
        grupoId,
      });
      return NextResponse.json(entrega);
    }

    // ── Crear repo y dar acceso ──────────────────────────────
    const resultado = await crearEntrega({
      templateRepo,
      slug: assignment.slug,
      usernames,
      grupoId,
      descripcion: `${assignment.titulo} — PdeP`,
    });

    const entrega = await createEntrega({
      assignmentId: assignment.id,
      repoName: resultado.repoName,
      repoUrl: resultado.repoUrl,
      githubUsernames: usernames,
      grupoId,
    });

    return NextResponse.json(entrega);
  } catch (error) {
    return internalServerError(
      "POST /api/assignments/[id]/accept",
      error,
      { assignmentId: params.id }
    );
  }
}

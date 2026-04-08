import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getAssignment, getEntregaDeUsuario, createEntrega } from "@/lib/store";
import { crearEntrega, repoExists } from "@/lib/github";
import { getGrupoDeAlumno } from "@/lib/sheets";
import { buildRepoName } from "@/lib/naming";
import { checkRateLimit } from "@/lib/rate-limit";

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
      return NextResponse.json(
        { error: "Assignment no encontrado" },
        { status: 404 }
      );
    }

    // ── Ya tiene entrega? ────────────────────────────────────
    const existente = await getEntregaDeUsuario(
      assignment.id,
      user.githubUsername
    );
    if (existente) {
      return NextResponse.json(
        { error: "Ya aceptaste este assignment", repoUrl: existente.repoUrl },
        { status: 409 }
      );
    }

    // ── Determinar quiénes van al repo ───────────────────────
    let usernames: string[];
    let grupoId: string | undefined;

    if (assignment.tipo === "grupal") {
      const grupo = await getGrupoDeAlumno(
        user.githubUsername,
        assignment.paradigma
      );
      if (!grupo) {
        return NextResponse.json(
          {
            error:
              "No tenés grupo asignado para " +
              assignment.paradigma +
              ". Contactá a tu docente.",
          },
          { status: 400 }
        );
      }
      usernames = grupo.miembros;
      grupoId = grupo.id;
    } else {
      usernames = [user.githubUsername];
    }

    // ── Extraer nombre del template (sin org) ────────────────
    const templateRepo = assignment.templateRepo.includes("/")
      ? assignment.templateRepo.split("/").pop()!
      : assignment.templateRepo;

    // ── Nombre del repo ──────────────────────────────────────
    const candidateRepoName = buildRepoName({
      slug: assignment.slug,
      usernames,
      grupoId,
    });

    // Verificar que no exista ya (por si otro miembro del grupo aceptó)
    if (await repoExists(candidateRepoName)) {
      // El repo existe pero no tenemos entrega registrada — registrarla
      const org = process.env.GITHUB_ORG ?? "pdep-mn";
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
      templateRepo: templateRepo,
      slug: assignment.slug,
      usernames,
      grupoId,
      descripcion: `${assignment.titulo} — PdeP`,
    });

    // ── Guardar la entrega ───────────────────────────────────
    const entrega = await createEntrega({
      assignmentId: assignment.id,
      repoName: resultado.repoName,
      repoUrl: resultado.repoUrl,
      githubUsernames: usernames,
      grupoId,
    });

    return NextResponse.json(entrega);
  } catch (e) {
    console.error("Error aceptando assignment:", e);
    const message = e instanceof Error ? e.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

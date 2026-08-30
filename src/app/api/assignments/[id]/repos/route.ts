import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  conLockBorradoReposAssignment,
  getAssignment,
  getEntregasConRepoActivo,
} from "@/lib/repositories";
import { borrarRepositoriosDeAssignment } from "@/lib/services/borrarRepositoriosDeAssignment";
import { internalServerError } from "@/lib/api-errors";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getCurrentUser();
    if (!user?.rol.puedeAdministrar()) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const assignment = await getAssignment(params.id);
    if (!assignment) {
      return NextResponse.json({ error: "Assignment no encontrado" }, { status: 404 });
    }
    const entregas = await getEntregasConRepoActivo(params.id);
    return NextResponse.json({
      assignmentId: assignment.id,
      titulo: assignment.titulo,
      slug: assignment.slug,
      estado: assignment.estadoNombre,
      repos: entregas.map((entrega) => entrega.repoName).filter(Boolean),
    });
  } catch (error) {
    return internalServerError("GET /api/assignments/[id]/repos", error, {
      assignmentId: params.id,
    });
  }
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getCurrentUser();
    if (!user?.rol.puedeAdministrar()) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const assignment = await getAssignment(params.id);
    if (!assignment) {
      return NextResponse.json(
        { error: "Assignment no encontrado" },
        { status: 404 }
      );
    }
    if (!assignment.permiteBorrarRepos()) {
      return NextResponse.json(
        { error: "Archivá el assignment antes de eliminar sus repositorios." },
        { status: 409 }
      );
    }
    const body = await req.json().catch(() => null);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      (body as { confirmation?: unknown }).confirmation !== assignment.slug
    ) {
      return NextResponse.json(
        { error: `Escribí exactamente ${assignment.slug} para confirmar el borrado.` },
        { status: 400 }
      );
    }

    const result = await conLockBorradoReposAssignment(params.id, () =>
      borrarRepositoriosDeAssignment({
        assignmentId: params.id,
        requestedBy: user.githubUsername,
      })
    );

    return NextResponse.json(result);
  } catch (error) {
    return internalServerError("DELETE /api/assignments/[id]/repos", error, {
      assignmentId: params.id,
    });
  }
}

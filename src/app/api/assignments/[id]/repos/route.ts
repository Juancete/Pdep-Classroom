import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/api-auth";
import { getAssignment, getEntregas, clearReposDeAssignment } from "@/lib/repositories";
import { deleteRepo } from "@/lib/github";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const unauthorized = await guardAdmin();
  if (unauthorized) return unauthorized;

  const assignment = await getAssignment(params.id);
  if (!assignment) {
    return NextResponse.json({ error: "Assignment no encontrado" }, { status: 404 });
  }

  const entregas = await getEntregas(params.id);
  const repoNames = entregas.map((entrega) => entrega.repoName).filter(Boolean) as string[];

  if (repoNames.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  await Promise.all(repoNames.map((name) => deleteRepo(name)));
  await clearReposDeAssignment(params.id);

  return NextResponse.json({ ok: true, deleted: repoNames.length });
}

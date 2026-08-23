import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  conLockBorradoReposAssignment,
  getAssignment,
} from "@/lib/repositories";
import { borrarRepositoriosDeAssignment } from "@/lib/services/borrarRepositoriosDeAssignment";
import { internalServerError } from "@/lib/api-errors";

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
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

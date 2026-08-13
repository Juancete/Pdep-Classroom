import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  getAlumnoByGithub,
  getAssignments,
  getAssignmentsDeComision,
} from "@/lib/repositories";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (user.isAdmin) {
    return NextResponse.json(await getAssignments());
  }

  const alumno = await getAlumnoByGithub(user.githubUsername, true);
  if (!alumno) {
    return NextResponse.json(
      { error: "No tenés acceso a los assignments" },
      { status: 403 }
    );
  }

  const assignments = await getAssignmentsDeComision(alumno.comision.id);
  return NextResponse.json(assignments);
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  getAlumnoByGithub,
  getAssignments,
  getAssignmentsDeComision,
  getEntregasDeUsuario,
} from "@/lib/repositories";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (user.rol.puedeAdministrar()) {
    return NextResponse.json(await getAssignments());
  }

  const alumno = await getAlumnoByGithub(user.githubUsername, true);
  if (!alumno) {
    return NextResponse.json(
      { error: "No tenés acceso a los assignments" },
      { status: 403 }
    );
  }

  // getAssignmentsDeComision ya excluye los borradores; acá se resuelve el
  // filtro fino que depende del alumno: un archivado solo se lista si ya
  // tiene entrega (mismo criterio que el dashboard).
  const [assignments, entregasMap] = await Promise.all([
    getAssignmentsDeComision(alumno.comision.id),
    getEntregasDeUsuario(user.githubUsername),
  ]);
  const visibles = assignments.filter((assignment) =>
    assignment.esVisibleParaAlumno(entregasMap.has(assignment.id))
  );

  return NextResponse.json(visibles);
}

import { requireAdmin } from "@/infrastructure/auth/session";
import {
  getAssignment,
  getEntregas,
  getAlumnos,
  getGruposDeAssignment,
} from "@/infrastructure/repositories";
import { redirect } from "next/navigation";
import { Alumno } from "@/domain/entities";
import { AssignmentHeader } from "../assignment-header";
import { GruposPanel } from "../grupos-panel";
import type { AlumnoSinGrupoResumen } from "../grupos-panel";
import { resumirGrupoParaAdmin } from "../../../grupo-resumen";
import type { GrupoAdminResumen } from "../../../grupo-resumen";
import type { Entrega } from "@/domain/entities";
import { VolcarGruposButton } from "../volcar-grupos-button";

export default async function GruposAssignmentPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  await requireAdmin();

  const assignment = await getAssignment(params.id);
  if (!assignment) redirect("/admin/assignments");

  const grupal = assignment.comoGrupal();
  if (!grupal) redirect(`/admin/assignments/${params.id}`);

  const [entregas, alumnos, grupos] = await Promise.all([
    getEntregas(params.id),
    getAlumnos(),
    assignment.cargarGruposCon(getGruposDeAssignment),
  ]);

  const alumnosPorUsername = new Map<string, Alumno>(
    alumnos.map((alumno) => [alumno.usernameCanonico, alumno])
  );

  // Reusa las entregas ya cargadas (con `grupo` populado) en vez de una
  // query nueva.
  const entregasPorGrupo = new Map<string, Entrega>();
  for (const entrega of entregas) {
    if (entrega.grupo) entregasPorGrupo.set(entrega.grupo.id, entrega);
  }

  // Sin `instanceof`/ifs de tipo: `puedeVolcarseAPlanilla()` es polimórfico
  // (default `false` en `Assignment`, `GrupalAssignment` lo pisa) y la
  // columna sale del mismo `extraFormDefaults()` que ya usa el form de
  // edición — ninguno de los dos necesita el narrowing a `GrupalAssignment`.
  const columnaGrupoEnPlanilla = assignment.extraFormDefaults().columnaGrupoEnPlanilla;

  const gruposSerializados: GrupoAdminResumen[] = grupos.map((grupo) =>
    resumirGrupoParaAdmin(grupo, {
      grupos,
      alumnosPorUsername,
      entregasPorGrupo,
      conDetalleDeEntrega: true,
    })
  );

  const alumnosSinGrupoSerializados: AlumnoSinGrupoResumen[] = grupal
    .alumnosSinGrupo(alumnos, grupos)
    .map((alumno) => ({
      username: alumno.githubUsername,
      nombreCompleto: alumno.nombreCompleto,
    }));

  return (
    <div>
      <AssignmentHeader assignment={assignment} activa="grupos" />

      {assignment.puedeVolcarseAPlanilla() && columnaGrupoEnPlanilla !== undefined && (
        <div className="mb-4">
          <VolcarGruposButton
            assignmentId={assignment.id}
            columna={columnaGrupoEnPlanilla}
          />
        </div>
      )}

      <GruposPanel
        assignmentId={params.id}
        grupos={gruposSerializados}
        alumnosSinGrupo={alumnosSinGrupoSerializados}
      />
    </div>
  );
}

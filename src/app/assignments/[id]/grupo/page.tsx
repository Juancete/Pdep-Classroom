import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import {
  getAssignment,
  getAlumnoByGithub,
  getGruposDeAssignment,
  getEntregaLogica,
} from "@/lib/repositories";
import type { GrupalAssignment } from "@/domain/entities";
import { GrupoSelector } from "./grupo-selector";
import { MiGrupo } from "./mi-grupo";
import type { GrupoResumen } from "./mi-grupo";
import { autorizarAccionSobreAssignment } from "@/lib/services/assignmentAuthorization";

export default async function GrupoPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const user = await requireUser();

  const [assignment, alumno] = await Promise.all([
    getAssignment(params.id),
    user.rol.puedeAdministrar()
      ? Promise.resolve(null)
      : getAlumnoByGithub(user.githubUsername, true),
  ]);

  if (!assignment) {
    notFound();
  }

  let grupal: GrupalAssignment;
  try {
    grupal = assignment.exigirGrupal();
    autorizarAccionSobreAssignment(user, alumno, grupal);
  } catch {
    notFound();
  }

  const grupos = await getGruposDeAssignment(params.id);

  const miGrupo = grupos.find((grupo) => grupo.contieneA(user.githubUsername));

  // getEntregaLogica busca por grupoId, no por el snapshot de usernames de
  // la entrega: un alumno agregado al grupo después de aceptar el TP también
  // cuenta como "el grupo ya entregó" (getEntregaDeUsuario no lo vería).
  const entrega = miGrupo
    ? await getEntregaLogica({ assignmentId: assignment.id, grupoId: miGrupo.id })
    : null;

  function serializar(grupo: (typeof grupos)[number]): GrupoResumen {
    // `toResumen()` cubre los campos comunes con las routes de grupos —
    // acá se agrega `etiquetaCupo`, específico de esta pantalla.
    return { ...grupo.toResumen(), etiquetaCupo: grupo.etiquetaCupo() };
  }

  const motivoBloqueo = miGrupo
    ? user.rol.motivoDeBloqueoDeMembresia({
        assignment: grupal,
        grupo: miGrupo,
        grupoTieneEntrega: !!entrega,
      })
    : null;

  const gruposDisponibles = miGrupo
    ? grupos
        .filter((grupo) => grupo.id !== miGrupo.id && !grupo.estaLleno())
        .map((grupo) => ({ id: grupo.id, nombre: grupo.nombre }))
    : [];

  return (
    <div>
      <div className="mb-6">
        <a
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          ← Volver al dashboard
        </a>
        <h1 className="text-2xl font-bold mt-2">{assignment.titulo}</h1>
        <p className="text-gray-500 text-sm mt-1">
          TP grupal · hasta {grupal.maxIntegrantes} integrantes ·{" "}
          {assignment.paradigma}
        </p>
      </div>

      {miGrupo ? (
        <MiGrupo
          grupo={serializar(miGrupo)}
          assignmentId={params.id}
          tieneEntrega={!!entrega}
          githubUsername={user.githubUsername}
          motivoBloqueo={motivoBloqueo}
          esUltimoMiembro={miGrupo.quedaraVacioSiSale(user.githubUsername)}
          gruposDisponibles={gruposDisponibles}
        />
      ) : (
        <GrupoSelector
          assignmentId={params.id}
          grupos={grupos.map(serializar)}
          inscripcionesCerradas={grupal.inscripcionesCerradas}
        />
      )}
    </div>
  );
}

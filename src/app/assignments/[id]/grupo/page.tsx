import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import {
  getAssignment,
  getAlumnoByGithub,
  getGruposDeAssignment,
  getEntregaDeUsuario,
} from "@/lib/repositories";
import { GrupalAssignment } from "@/domain/entities";
import { GrupoSelector } from "./grupo-selector";
import { MiGrupo } from "./mi-grupo";
import type { GrupoResumen } from "./mi-grupo";
import { autorizarAccesoAssignment } from "@/lib/services/assignmentAuthorization";

export default async function GrupoPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const user = await requireUser();

  const [assignment, alumno] = await Promise.all([
    getAssignment(params.id),
    user.isAdmin
      ? Promise.resolve(null)
      : getAlumnoByGithub(user.githubUsername, true),
  ]);

  if (!assignment || !(assignment instanceof GrupalAssignment)) {
    notFound();
  }

  try {
    autorizarAccesoAssignment(user, alumno, assignment);
  } catch {
    notFound();
  }

  const grupos = await getGruposDeAssignment(params.id);

  const miGrupo = grupos.find((grupo) => grupo.contieneA(user.githubUsername));

  const entrega = miGrupo
    ? await getEntregaDeUsuario(assignment.id, user.githubUsername)
    : null;

  function serializar(grupo: (typeof grupos)[number]): GrupoResumen {
    return {
      id: grupo.id,
      nombre: grupo.nombre,
      paradigma: grupo.paradigma,
      maxIntegrantes: grupo.maxIntegrantes,
      estaLleno: grupo.estaLleno(),
      etiquetaCupo: grupo.etiquetaCupo(),
      miembros: grupo.usernamesDeMiembros(),
    };
  }

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
          TP grupal · hasta {assignment.maxIntegrantes} integrantes ·{" "}
          {assignment.paradigma}
        </p>
      </div>

      {miGrupo ? (
        <MiGrupo
          grupo={serializar(miGrupo)}
          assignmentId={params.id}
          tieneEntrega={!!entrega}
        />
      ) : (
        <GrupoSelector
          assignmentId={params.id}
          grupos={grupos.map(serializar)}
          inscripcionesCerradas={assignment.inscripcionesCerradas}
        />
      )}
    </div>
  );
}

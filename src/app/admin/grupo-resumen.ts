import { Alumno } from "@/domain/entities";
import type { Entrega, Grupo, NombreResultadoCI } from "@/domain/entities";
import type { Paradigma, TipoDeIntegrantes } from "@/types";

export type GrupoAdminResumen = {
  id: string;
  nombre: string;
  maxIntegrantes: number;
  estaLleno: boolean;
  etiquetaCupo: string;
  tipoDeIntegrantes: TipoDeIntegrantes;
  miembros: {
    username: string;
    nombreCompleto: string;
    // Issue #122: sólo con detalle de entrega y ya sincronizada.
    participacion?: { commits: number; porcentaje: number };
  }[];
  assignmentTitulo?: string;
  paradigma?: Paradigma;
  destinos: { id: string; nombre: string; conEntrega: boolean }[];
  entrega?: {
    estadoRepo: "activo" | "borrado" | "sin-repo";
    repoUrl?: string;
    ci?: { resultadoNombre: NombreResultadoCI; detalleUrl?: string };
    ultimoPush?: { fecha: string; por: string };
    // Issue #122: sólo con detalle de entrega y ya sincronizada.
    totalCommits?: number;
  };
};

export function resumirGrupoParaAdmin(
  grupo: Grupo,
  contexto: {
    grupos: Grupo[];
    alumnosPorUsername: Map<string, Alumno>;
    entregasPorGrupo: Map<string, Entrega>;
    conDetalleDeEntrega: boolean;
    conContextoDeAssignment?: boolean;
  }
): GrupoAdminResumen {
  const { grupos, alumnosPorUsername, entregasPorGrupo, conDetalleDeEntrega, conContextoDeAssignment } =
    contexto;
  const entrega = entregasPorGrupo.get(grupo.id);

  // Issue #122: matching canónico entre `MiembroDeGrupo.githubUsername` y el
  // login que devolvió GitHub, mismo criterio que `Entrega.perteneceA` — el
  // `Map` evita recorrer el array de participación por cada miembro.
  const participacionPorUsername =
    conDetalleDeEntrega && entrega?.tieneContribucionesSincronizadas()
      ? new Map(
          entrega
            .participacionDe(grupo.usernamesDeMiembros())
            .map((participacion) => [
              Alumno.normalizarUsername(participacion.username),
              participacion,
            ])
        )
      : undefined;

  return {
    id: grupo.id,
    nombre: grupo.nombre,
    maxIntegrantes: grupo.maxIntegrantes,
    estaLleno: grupo.estaLleno(),
    etiquetaCupo: grupo.etiquetaCupo(),
    tipoDeIntegrantes: grupo.tipoDeIntegrantes,
    miembros: grupo.usernamesDeMiembros().map((username) => {
      const participacion = participacionPorUsername?.get(Alumno.normalizarUsername(username));
      return {
        username,
        nombreCompleto:
          alumnosPorUsername.get(Alumno.normalizarUsername(username))?.nombreCompleto ?? username,
        ...(participacion && {
          participacion: { commits: participacion.commits, porcentaje: participacion.porcentaje },
        }),
      };
    }),
    destinos: grupos
      .filter((otro) => otro.esDestinoValidoDeMovimientoDesde(grupo))
      .map((otro) => ({
        id: otro.id,
        nombre: otro.nombre,
        conEntrega: entregasPorGrupo.has(otro.id),
      })),
    ...(conContextoDeAssignment && {
      assignmentTitulo: grupo.assignment.titulo,
      paradigma: grupo.paradigma,
    }),
    ...(entrega && {
      entrega: {
        estadoRepo: entrega.estadoRepo(),
        repoUrl: entrega.repoUrl,
        ...(conDetalleDeEntrega && {
          ci: { resultadoNombre: entrega.ciResultadoNombre, detalleUrl: entrega.ciDetalleUrl },
          ...(entrega.ultimoPushEn && {
            ultimoPush: {
              fecha: new Date(entrega.ultimoPushEn).toLocaleDateString("es-AR"),
              por: entrega.ultimoPushPor ?? "—",
            },
          }),
          ...(entrega.tieneContribucionesSincronizadas() && {
            totalCommits: entrega.totalDeCommits(),
          }),
        }),
      },
    }),
  };
}

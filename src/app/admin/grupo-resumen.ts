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
  miembros: { username: string; nombreCompleto: string }[];
  assignmentTitulo?: string;
  paradigma?: Paradigma;
  destinos: { id: string; nombre: string; conEntrega: boolean }[];
  entrega?: {
    estadoRepo: "activo" | "borrado" | "sin-repo";
    repoUrl?: string;
    ci?: { resultadoNombre: NombreResultadoCI; detalleUrl?: string };
    ultimoPush?: { fecha: string; por: string };
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
  return {
    id: grupo.id,
    nombre: grupo.nombre,
    maxIntegrantes: grupo.maxIntegrantes,
    estaLleno: grupo.estaLleno(),
    etiquetaCupo: grupo.etiquetaCupo(),
    tipoDeIntegrantes: grupo.tipoDeIntegrantes,
    miembros: grupo.usernamesDeMiembros().map((username) => ({
      username,
      nombreCompleto:
        alumnosPorUsername.get(Alumno.normalizarUsername(username))?.nombreCompleto ?? username,
    })),
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
        }),
      },
    }),
  };
}

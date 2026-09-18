import { Collection, Entity, ManyToMany } from "@mikro-orm/core";
import { Alumno } from "./Alumno";
import type { Grupo } from "./Grupo";
import type { Participante } from "./Participante";
import {
  Assignment,
  type ParticipantesResueltos,
  type FuentesDeConteo,
  type BuscadorDeGrupoDelAlumno,
} from "./Assignment";
import { buildRepoName } from "@/lib/naming";

@Entity({ discriminatorValue: "individual" })
export class IndividualAssignment extends Assignment {
  // Alumnos asignados a este TP individual (quiénes deben entregar)
  @ManyToMany(() => Alumno)
  alumnos = new Collection<Alumno>(this);

  etiquetaTotales(): string {
    return "Alumnos";
  }

  async totalEsperado(fuentes: FuentesDeConteo): Promise<number> {
    return (await fuentes.getAlumnosDelCurso()).length;
  }

  async resolverParticipantesPara(
    participante: Participante,
    _buscarGrupoDelAlumno: BuscadorDeGrupoDelAlumno
  ): Promise<ParticipantesResueltos> {
    // Sin exigir un `Alumno` registrado (issue #107/#112): un docente
    // aceptando desde la demo de Mis TPs tampoco tiene fila en `Alumno`.
    return { usernames: [participante.githubUsername] };
  }

  nombreDeRepoPara(participantes: ParticipantesResueltos): string {
    return buildRepoName({ slug: this.slug, githubUsername: participantes.usernames[0]! });
  }

  requiereSeleccionDeGrupo(_grupo: Grupo | null): boolean {
    return false;
  }

  alumnosSinGrupo(_alumnos: Alumno[], _grupos: Grupo[]): Alumno[] {
    return [];
  }

  extraFormDefaults(): Partial<{ maxIntegrantes: number }> {
    return {};
  }

  aplicarCamposExtra(_data: Partial<{ maxIntegrantes: number }>): void {
    // Los assignments individuales no tienen campos extra.
  }

  cargarGruposCon(_loader: (assignmentId: string) => Promise<Grupo[]>): Promise<Grupo[]> {
    return Promise.resolve([]);
  }

  comoGrupal(): null {
    return null;
  }
}

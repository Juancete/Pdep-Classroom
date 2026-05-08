import { Collection, Entity, ManyToMany } from "@mikro-orm/core";
import { Alumno } from "./Alumno";
import type { Grupo } from "./Grupo";
import {
  Assignment,
  type ParticipantesResueltos,
  type FuentesDeConteo,
} from "./Assignment";

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

  async resolverParticipantesPara(user: {
    githubUsername: string;
  }): Promise<ParticipantesResueltos> {
    return { usernames: [user.githubUsername] };
  }

  requiereSeleccionDeGrupo(_user: { isAdmin: boolean }, _grupo: Grupo | null): boolean {
    return false;
  }

  alumnosSinGrupo(_alumnos: Alumno[], _grupos: Grupo[]): Alumno[] {
    return [];
  }

  extraFormDefaults(): Partial<{ maxIntegrantes: number }> {
    return {};
  }

  cargarGruposCon(_loader: (assignmentId: string) => Promise<Grupo[]>): Promise<Grupo[]> {
    return Promise.resolve([]);
  }
}

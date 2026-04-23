import { Collection, Entity, ManyToMany } from "@mikro-orm/core";
import { Alumno } from "./Alumno";
import {
  Assignment,
  type ParticipantesResueltos,
  type TotalEsperadoCtx,
} from "./Assignment";

@Entity({ discriminatorValue: "individual" })
export class IndividualAssignment extends Assignment {
  // Alumnos asignados a este TP individual (quiénes deben entregar)
  @ManyToMany(() => Alumno)
  alumnos = new Collection<Alumno>(this);

  etiquetaTotales(): string {
    return "Alumnos";
  }

  async totalEsperado(ctx: TotalEsperadoCtx): Promise<number> {
    return (await ctx.getAlumnosDelCurso()).length;
  }

  async resolverParticipantesPara(user: {
    githubUsername: string;
  }): Promise<ParticipantesResueltos> {
    return { usernames: [user.githubUsername] };
  }
}

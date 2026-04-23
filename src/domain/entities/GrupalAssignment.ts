import { Collection, Entity, OneToMany, Property } from "@mikro-orm/core";
import {
  Assignment,
  type BuscarGrupoDelAlumno,
  type ParticipantesResueltos,
  type TotalEsperadoCtx,
} from "./Assignment";
import type { Grupo } from "./Grupo";

// Lanzado cuando un alumno intenta aceptar un TP grupal y no figura en
// ningún grupo del assignment. El handler de accept lo traduce a 400 con
// un mensaje amigable — análogo al `LegajoConflictError` de registro.
export class GrupoNoAsignadoError extends Error {
  constructor(
    public readonly assignmentId: string,
    public readonly githubUsername: string
  ) {
    super("No tenés grupo asignado para este TP. Contactá a tu docente.");
    this.name = "GrupoNoAsignadoError";
  }
}

@Entity({ discriminatorValue: "grupal" })
export class GrupalAssignment extends Assignment {
  @Property({ type: 'integer' })
  maxIntegrantes!: number;

  @OneToMany("Grupo", "assignment")
  grupos = new Collection<Grupo>(this);

  etiquetaTotales(): string {
    return "Grupos";
  }

  async totalEsperado(ctx: TotalEsperadoCtx): Promise<number> {
    return (await ctx.getGruposDeAssignment(this.id)).length;
  }

  async resolverParticipantesPara(
    user: { githubUsername: string },
    buscarGrupoDelAlumno: BuscarGrupoDelAlumno
  ): Promise<ParticipantesResueltos> {
    const grupo = await buscarGrupoDelAlumno(this.id, user.githubUsername);
    if (!grupo) {
      throw new GrupoNoAsignadoError(this.id, user.githubUsername);
    }
    return {
      usernames: grupo.alumnos.getItems().map((a) => a.githubUsername),
      grupoId: grupo.id,
    };
  }
}

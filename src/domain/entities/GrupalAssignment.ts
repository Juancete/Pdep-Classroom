import { Collection, Entity, OneToMany, Property } from "@mikro-orm/core";
import {
  Assignment,
  type BuscadorDeGrupoDelAlumno,
  type ParticipantesResueltos,
  type FuentesDeConteo,
} from "./Assignment";
import type { Alumno } from "./Alumno";
import type { Grupo } from "./Grupo";
import { GRUPAL_MIN_MAX_INTEGRANTES } from "./domain-constants";

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
  static readonly MIN_MAX_INTEGRANTES = GRUPAL_MIN_MAX_INTEGRANTES;

  @Property({ type: 'integer' })
  maxIntegrantes!: number;

  // Cerrado por el docente cuando los grupos ya están trabajando y no quiere
  // que se sumen alumnos despistados. Independiente de si los grupos están
  // llenos o no — un grupo con cupo libre tampoco recibe nuevos miembros si
  // este flag está prendido.
  @Property({ type: 'boolean', default: false })
  inscripcionesCerradas: boolean = false;

  @OneToMany("Grupo", "assignment")
  grupos = new Collection<Grupo>(this);

  etiquetaTotales(): string {
    return "Grupos";
  }

  aceptaNuevasInscripciones(): boolean {
    return !this.inscripcionesCerradas;
  }

  async totalEsperado(fuentes: FuentesDeConteo): Promise<number> {
    return (await fuentes.getGruposDeAssignment(this.id)).length;
  }

  async resolverParticipantesPara(
    user: { githubUsername: string },
    buscarGrupoDelAlumno: BuscadorDeGrupoDelAlumno
  ): Promise<ParticipantesResueltos> {
    const grupo = await buscarGrupoDelAlumno(this.id, user.githubUsername);
    if (!grupo) {
      throw new GrupoNoAsignadoError(this.id, user.githubUsername);
    }
    return {
      usernames: grupo.usernamesDeMiembros(),
      grupoId: grupo.id,
      grupoNombreNormalizado: grupo.nombreNormalizado,
    };
  }

  requiereSeleccionDeGrupo(user: { isAdmin: boolean }, grupo: Grupo | null): boolean {
    return !user.isAdmin && !grupo;
  }

  alumnosSinGrupo(alumnos: Alumno[], grupos: Grupo[]): Alumno[] {
    const alumnosConGrupo = new Set(
      grupos.flatMap((grupo) => grupo.usernamesCanonicos())
    );
    return alumnos.filter((alumno) => !alumnosConGrupo.has(alumno.usernameCanonico));
  }

  extraFormDefaults(): Partial<{ maxIntegrantes: number }> {
    return { maxIntegrantes: this.maxIntegrantes };
  }

  aplicarCamposExtra(data: Partial<{ maxIntegrantes: number }>): void {
    if (data.maxIntegrantes !== undefined) this.maxIntegrantes = data.maxIntegrantes;
  }

  cargarGruposCon(loader: (assignmentId: string) => Promise<Grupo[]>): Promise<Grupo[]> {
    return loader(this.id);
  }
}

import { Collection, Entity, ManyToMany } from "@mikro-orm/core";
import { Alumno } from "./Alumno";
import type { Grupo } from "./Grupo";
import type { RolDeUsuario } from "./RolDeUsuario";
import {
  Assignment,
  type ParticipantesResueltos,
  type FuentesDeConteo,
  type BuscadorDeGrupoDelAlumno,
} from "./Assignment";
import { buildRepoName } from "@/lib/naming";

// Lanzado cuando un alumno todavía no completó su registro (falta el
// `Alumno` en la base) e intenta aceptar un TP individual — un TP grupal
// no lo necesita para este chequeo puntual, ahí lo resuelve
// `GrupoNoAsignadoError` si no tiene grupo (Fase 3 de la auditoría de
// dominio: antes vivía en `aceptarAssignment.ts`, un servicio, no en el
// dominio).
export class AlumnoNoRegistradoError extends Error {
  constructor(public readonly githubUsername: string) {
    super("Completá tu registro antes de aceptar este assignment.");
    this.name = "AlumnoNoRegistradoError";
  }
}

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
    user: { githubUsername: string },
    _buscarGrupoDelAlumno: BuscadorDeGrupoDelAlumno,
    alumno: Alumno | null
  ): Promise<ParticipantesResueltos> {
    if (!alumno) throw new AlumnoNoRegistradoError(user.githubUsername);
    return { usernames: [user.githubUsername] };
  }

  nombreDeRepoPara(participantes: ParticipantesResueltos): string {
    return buildRepoName({ slug: this.slug, githubUsername: participantes.usernames[0]! });
  }

  requiereSeleccionDeGrupo(_user: { rol: RolDeUsuario }, _grupo: Grupo | null): boolean {
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

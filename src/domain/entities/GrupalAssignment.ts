import { Collection, Entity, OneToMany, Property } from "@mikro-orm/core";
import {
  Assignment,
  type BuscadorDeGrupoDelAlumno,
  type ParticipantesResueltos,
  type FuentesDeConteo,
  type DatosEstructurales,
} from "./Assignment";
import type { Alumno } from "./Alumno";
import type { Participante } from "./Participante";
import { Grupo, NombreGrupoInvalidoError } from "./Grupo";
import { GRUPAL_MIN_MAX_INTEGRANTES } from "./domain-constants";
import type { TipoDeIntegrantes } from "@/types";
import { buildRepoName, slugify } from "@/lib/naming";

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

// Invariante violada: `resolverParticipantesPara` siempre debería resolver
// un `grupoNombreNormalizado` junto con el `grupoId`, así que llegar acá
// sin uno es un bug, no un caso de negocio esperado — mismo criterio que
// tenía el `throw new Error(...)` genérico en `aceptarAssignment.ts`
// (Fase 3 de la auditoría de dominio: se tipa para que quien lo capture
// pueda distinguirlo).
export class GrupoSinNombreNormalizadoError extends Error {
  constructor(public readonly grupoId: string) {
    super(`El grupo ${grupoId} no tiene un nombre normalizado.`);
    this.name = "GrupoSinNombreNormalizadoError";
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
    return this.permiteAccionesDeAlumno() && !this.inscripcionesCerradas;
  }

  async totalEsperado(fuentes: FuentesDeConteo): Promise<number> {
    return (await fuentes.getGruposDeAssignment(this.id)).length;
  }

  async resolverParticipantesPara(
    participante: Participante,
    buscarGrupoDelAlumno: BuscadorDeGrupoDelAlumno
  ): Promise<ParticipantesResueltos> {
    const grupo = await buscarGrupoDelAlumno(this.id, participante.githubUsername);
    if (!grupo) {
      throw new GrupoNoAsignadoError(this.id, participante.githubUsername);
    }
    return {
      usernames: grupo.usernamesDeMiembros(),
      grupoId: grupo.id,
      grupoNombreNormalizado: grupo.nombreNormalizado,
    };
  }

  nombreDeRepoPara(participantes: ParticipantesResueltos): string {
    if (!participantes.grupoNombreNormalizado) {
      throw new GrupoSinNombreNormalizadoError(participantes.grupoId ?? this.id);
    }
    return buildRepoName({
      slug: this.slug,
      grupoNombreNormalizado: participantes.grupoNombreNormalizado,
    });
  }

  /**
   * Construye un `Grupo` nuevo (en memoria, sin persistir) para este
   * assignment: deriva `nombreNormalizado` de `nombre` (lanza
   * `NombreGrupoInvalidoError` si queda vacío tras normalizar) y valida
   * explícitamente que el nombre del repo resultante no supere el límite
   * de GitHub (`buildRepoName` lanza `NombreRepositorioDemasiadoLargoError`)
   * — antes esta validación de longitud era una llamada "fantasma" a
   * `buildRepoName` cuyo resultado se descartaba, duplicada en los dos
   * sitios de construcción de `GrupoRepository.ts` (Fase 3 de la auditoría
   * de dominio). Fija `paradigma`/`maxIntegrantes`/`assignment` desde este
   * assignment — el caller sólo decide `nombre`, `creadoPor` y, opcional,
   * `tipoDeIntegrantes` ("alumnos" por defecto): un grupo de docentes
   * arrancado desde la demo de Mis TPs lo pasa explícito (issue #107/#112).
   */
  crearGrupo(
    nombre: string,
    creadoPor: string,
    tipoDeIntegrantes: TipoDeIntegrantes = "alumnos"
  ): Grupo {
    const nombreVisible = nombre.trim();
    const nombreNormalizado = slugify(nombreVisible);
    if (!nombreNormalizado) throw new NombreGrupoInvalidoError(nombre);
    buildRepoName({ slug: this.slug, grupoNombreNormalizado: nombreNormalizado });

    const grupo = new Grupo();
    grupo.nombre = nombreVisible;
    grupo.nombreNormalizado = nombreNormalizado;
    grupo.paradigma = this.paradigma;
    grupo.assignment = this;
    grupo.maxIntegrantes = this.maxIntegrantes;
    grupo.creadoPor = creadoPor;
    grupo.tipoDeIntegrantes = tipoDeIntegrantes;
    return grupo;
  }

  requiereSeleccionDeGrupo(grupo: Grupo | null): boolean {
    return !grupo;
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

  protected camposEstructuralesQueCambian(data: DatosEstructurales): string[] {
    if (data.maxIntegrantes !== undefined && data.maxIntegrantes !== this.maxIntegrantes) {
      return ["el máximo de integrantes"];
    }
    return [];
  }

  cargarGruposCon(loader: (assignmentId: string) => Promise<Grupo[]>): Promise<Grupo[]> {
    return loader(this.id);
  }

  comoGrupal(): GrupalAssignment {
    return this;
  }
}

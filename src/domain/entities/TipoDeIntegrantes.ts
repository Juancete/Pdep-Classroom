// Única fuente de verdad para los valores: el tipo se deriva de acá, igual
// que `NOMBRES_RESULTADO_CI` en `ResultadoCI.ts`.
export const NOMBRES_TIPO_DE_INTEGRANTES = ["alumnos", "docentes"] as const;

export type NombreTipoDeIntegrantes = (typeof NOMBRES_TIPO_DE_INTEGRANTES)[number];

/** Valor a persistir en la auditoría de membresías: quién originó el cambio. */
export type OrigenCambioMembresia = "alumno" | "docente";

/**
 * Quién puede integrar un `Grupo` (issue #107/#112): un grupo de alumnos
 * (el caso de siempre) o un grupo de docentes armado para la demo de Mis
 * TPs. Lo fija el creador al crear el grupo (`GrupalAssignment.crearGrupo`)
 * y no cambia después — separa por completo el cupo y el selector de un
 * tipo del otro (`Grupo.admiteIntegrantesDe`).
 *
 * Strategy con instancias únicas: `Grupo.admiteIntegrantesDe` compara por
 * identidad.
 */
export abstract class TipoDeIntegrantes {
  abstract get nombre(): NombreTipoDeIntegrantes;

  /** Un grupo de alumnos sólo integra alumnos registrados; uno de docentes admite miembros sin fila en `Alumno`. */
  abstract exigeVinculoConAlumno(): boolean;

  /** A nombre de quién queda auditado un cambio de membresía hecho por un integrante de este tipo. */
  abstract origenDeAuditoria(): OrigenCambioMembresia;

  /** Badge que distingue al grupo en el panel admin, o `null` si es el caso de siempre. */
  abstract distintivo(): string | null;

  static desdeNombre(nombre: NombreTipoDeIntegrantes): TipoDeIntegrantes {
    return TIPOS_POR_NOMBRE[nombre];
  }
}

class IntegrantesAlumnos extends TipoDeIntegrantes {
  get nombre(): NombreTipoDeIntegrantes {
    return "alumnos";
  }
  exigeVinculoConAlumno(): boolean {
    return true;
  }
  origenDeAuditoria(): OrigenCambioMembresia {
    return "alumno";
  }
  distintivo(): null {
    return null;
  }
}

class IntegrantesDocentes extends TipoDeIntegrantes {
  get nombre(): NombreTipoDeIntegrantes {
    return "docentes";
  }
  exigeVinculoConAlumno(): boolean {
    return false;
  }
  origenDeAuditoria(): OrigenCambioMembresia {
    return "docente";
  }
  distintivo(): string {
    return "Docentes";
  }
}

export const INTEGRANTES_ALUMNOS: TipoDeIntegrantes = new IntegrantesAlumnos();
export const INTEGRANTES_DOCENTES: TipoDeIntegrantes = new IntegrantesDocentes();

const TIPOS_POR_NOMBRE: Record<NombreTipoDeIntegrantes, TipoDeIntegrantes> = {
  alumnos: INTEGRANTES_ALUMNOS,
  docentes: INTEGRANTES_DOCENTES,
};

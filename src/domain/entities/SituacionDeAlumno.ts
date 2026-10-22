import type { NombreResultadoCI } from "./ResultadoCI";

export interface DatosDeRepo {
  repoUrl: string;
  ciResultadoNombre: NombreResultadoCI;
  ciDetalleUrl?: string;
  tieneResultadoAutomatico: boolean;
}

export interface AvisoDeRepoPendiente {
  mensaje: string;
  puedeReintentar: boolean;
}

/**
 * Lo que una vista sabe dibujar para cada situación del alumno frente a un
 * assignment. `Resultado` es lo que devuelve (ReactNode en el dashboard,
 * string en los tests).
 */
export interface PresentacionDeSituacion<Resultado> {
  conRepo(repo: DatosDeRepo): Resultado;
  sinRepo(aviso: AvisoDeRepoPendiente): Resultado;
  elegirGrupo(): Resultado;
  aceptar(): Resultado;
  sinAccion(): Resultado;
}

/**
 * Situación del alumno frente a un assignment en Mis TPs. Double dispatch:
 * la situación llama al método de la presentación que le corresponde, con
 * sus datos; así la vista no pregunta por tipo ni por string.
 */
export interface SituacionDeAlumno {
  presentar<Resultado>(presentacion: PresentacionDeSituacion<Resultado>): Resultado;
}

export class ConRepo implements SituacionDeAlumno {
  constructor(private readonly repo: DatosDeRepo) {}

  presentar<Resultado>(presentacion: PresentacionDeSituacion<Resultado>): Resultado {
    return presentacion.conRepo(this.repo);
  }
}

export class SinRepo implements SituacionDeAlumno {
  constructor(private readonly aviso: AvisoDeRepoPendiente) {}

  presentar<Resultado>(presentacion: PresentacionDeSituacion<Resultado>): Resultado {
    return presentacion.sinRepo(this.aviso);
  }
}

export const ELEGIR_GRUPO: SituacionDeAlumno = {
  presentar: (presentacion) => presentacion.elegirGrupo(),
};

export const ACEPTAR: SituacionDeAlumno = {
  presentar: (presentacion) => presentacion.aceptar(),
};

export const SIN_ACCION: SituacionDeAlumno = {
  presentar: (presentacion) => presentacion.sinAccion(),
};

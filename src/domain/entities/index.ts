export {
  Alumno,
  isValidEmail,
  validateRegistro,
  LegajoConflictError,
  type AlumnoData,
  type RegistroInput,
} from "./Alumno";
export {
  SuscripcionAlumno,
  NOMBRES_DE_CANAL,
  ESTADOS_DE_SUSCRIPCION,
  type NombreDeCanal,
  type EstadoDeSuscripcion,
} from "./SuscripcionAlumno";
export {
  Comision,
  VENTANA_IMPORTACION_GRUPOS_MS,
  INTERVALO_HEARTBEAT_IMPORTACION_GRUPOS_MS,
} from "./Comision";
export {
  Assignment,
  AssignmentNoEncontradoError,
  AssignmentNoDisponibleError,
  AssignmentNoEliminableError,
  ComisionActivaRequeridaError,
  AssignmentEstructuraInmutableError,
  AssignmentTipoInmutableError,
} from "./Assignment";
export type {
  FuentesDeConteo,
  ParticipantesResueltos,
  BuscadorDeGrupoDelAlumno,
  MotivoNoEliminable,
  DatosEstructurales,
} from "./Assignment";
export {
  EstadoAssignment,
  TransicionDeEstadoInvalidaError,
  transicionesDisponibles,
  NOMBRES_ESTADO_ASSIGNMENT,
  type NombreEstadoAssignment,
  type ContextoTransicionEstado,
} from "./EstadoAssignment";
export {
  IndividualAssignment,
  AlumnoNoRegistradoError,
} from "./IndividualAssignment";
export {
  GrupalAssignment,
  GrupoNoAsignadoError,
  GrupoSinNombreNormalizadoError,
} from "./GrupalAssignment";

// Factory por tipo (Fase 3 de la auditoría de dominio) — reemplaza el
// `data.tipo === "grupal" ? new GrupalAssignment() : new IndividualAssignment()`
// que vivía en `AssignmentRepository.createAssignment`. Vive en el barrel
// (no como `Assignment.crear` estático) porque `Assignment.ts` no puede
// importar sus propias subclases sin un ciclo de módulos (`Assignment.ts`
// → `IndividualAssignment.ts`/`GrupalAssignment.ts` → `Assignment.ts`,
// que rompe en runtime con "Class extends value undefined").
import { IndividualAssignment as IndividualAssignmentCtor } from "./IndividualAssignment";
import { GrupalAssignment as GrupalAssignmentCtor } from "./GrupalAssignment";
import type { Assignment as AssignmentType } from "./Assignment";
import type { TipoAssignment } from "@/types";

export function crearAssignment(tipo: TipoAssignment): AssignmentType {
  const constructores: Record<TipoAssignment, () => AssignmentType> = {
    individual: () => new IndividualAssignmentCtor(),
    grupal: () => new GrupalAssignmentCtor(),
  };
  return constructores[tipo]();
}
export {
  Grupo,
  InscripcionesCerradasError,
  AlumnoYaEnGrupoDelAssignmentError,
  NombreGrupoDuplicadoError,
  NombreGrupoInvalidoError,
  GrupoLlenoError,
  AssignmentNoGrupalError,
  GrupoNoEncontradoError,
  AlumnoNoEsMiembroDelGrupoError,
  GrupoConEntregaError,
} from "./Grupo";
export { Entrega, FRESCURA_CI_MS } from "./Entrega";
export {
  ResultadoCI,
  resultadoDesdeCheckRuns,
  ReejecucionCINoDisponibleError,
  NOMBRES_RESULTADO_CI,
  type NombreResultadoCI,
  type CheckRunResumen,
} from "./ResultadoCI";
export {
  RepoDeletionAttempt,
  type RepoDeletionStatus,
} from "./RepoDeletionAttempt";
export {
  EstadoDelivery,
  NOMBRES_ESTADO_DELIVERY,
  type NombreEstadoDelivery,
} from "./EstadoDelivery";
export {
  GithubWebhookDelivery,
  VENTANA_PROCESANDO_HUERFANO_MS,
} from "./GithubWebhookDelivery";
export { ErrorLog } from "./ErrorLog";
export {
  CambioDeMembresia,
  type AccionCambioMembresia,
} from "./CambioDeMembresia";
export {
  RolDeUsuario,
  DOCENTE,
  ESTUDIANTE,
  resolverRol,
  rolDesdeNombre,
  AccesoAssignmentProhibidoError,
  type ItemDeNavegacion,
  type ContextoDeMembresia,
  type OrigenCambioMembresia,
  type NombreRolDeUsuario,
} from "./RolDeUsuario";

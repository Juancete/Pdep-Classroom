export {
  getAlumnos,
  getAlumnoByGithub,
  getAlumnosByGithubUsernames,
  getAlumnoByLegajo,
  createAlumno,
  upsertAlumno,
  upsertAlumnos,
  marcarRegistroConfirmado,
  marcarGruposSyncFallido,
  marcarGruposSyncOk,
  marcarAlumnoSyncFallido,
  marcarAlumnoSyncOk,
  getAlumnosByComision,
  getAlumnosConGruposSyncPendiente,
  countAlumnos,
  LegajoConflictError,
} from "./AlumnoRepository";
export type { AlumnoData } from "./AlumnoRepository";

export {
  actualizarSuscripcion,
  getSuscripcionesPendientesDeComision,
  getSuscripcionesDeAlumno,
  crearSuscripcionesFaltantes,
} from "./SuscripcionAlumnoRepository";

export {
  getAssignments,
  getAssignmentsDeComision,
  getGrupalAssignmentsDeComisionYParadigma,
  getAssignment,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  setInscripcionesCerradas,
  cambiarEstadoAssignment,
} from "./AssignmentRepository";
// Errores de dominio de `Assignment` (viven en `Assignment.ts`, no en el
// repositorio — B4/Fase 3 de la auditoría de dominio): se reexportan acá
// para no romper a los callers que ya los importan desde
// `@/infrastructure/repositories` (ej. `api/assignments/[id]/route.ts`).
export {
  AssignmentNoEliminableError,
  ComisionActivaRequeridaError,
  AssignmentEstructuraInmutableError,
  AssignmentTipoInmutableError,
} from "@/domain/entities";

export {
  getEntregas,
  getEntregasDeUsuario,
  getEntregaDeUsuario,
  getEntregaPorId,
  getEntregaByRepoName,
  getEntregaPorRepoGithubId,
  asegurarRepoGithubId,
  getEntregaLogica,
  getEntregaCountsByAssignment,
  getActiveRepoCountsByAssignment,
  getEntregasConRepoActivo,
  contarEntregasDeAssignment,
  createEntrega,
  createOrGetEntrega,
  crearEntregaSiAssignmentDisponible,
  iniciarProvisionEntrega,
  marcarCreacionGithubIniciada,
  completarProvisionEntrega,
  fallarProvisionEntrega,
  actualizarCIDeEntrega,
  conLockDeEntrega,
  actualizarActividadDeEntrega,
  marcarRepoBorrado,
  renombrarRepoDeEntrega,
  actualizarColaboradoresDeEntrega,
} from "./EntregaRepository";

export {
  iniciarIntentoBorradoRepo,
  completarIntentoBorradoRepo,
  fallarIntentoBorradoRepo,
  getRepoDeletionHistory,
  conLockBorradoReposAssignment,
  type RepoDeletionHistoryPage,
} from "./RepoDeletionAttemptRepository";

export {
  getGrupos,
  getGruposDeAlumno,
  getGruposDeAssignment,
  getGrupoCountsByAssignment,
  getGrupoDeAlumnoEnAssignment,
  crearGrupo,
  unirseAGrupo,
  upsertGrupoConMiembro,
  salirDeGrupo,
  moverAlumnoDeGrupo,
} from "./GrupoRepository";

export {
  getComisiones,
  getComision,
  getComisionActiva,
  createComision,
  updateComision,
  deleteComision,
  reclamarImportacionGrupos,
  renovarImportacionGrupos,
  completarImportacionGrupos,
  liberarImportacionGrupos,
  ComisionActivaDuplicadaError,
  ComisionNoEliminableError,
} from "./ComisionRepository";
export type { ComisionFormData } from "./ComisionRepository";
export type { ReclamoImportacionGrupos } from "./ComisionRepository";
// `INTERVALO_HEARTBEAT_IMPORTACION_GRUPOS_MS` es una constante de dominio
// (vive en `Comision.ts` junto con `VENTANA_IMPORTACION_GRUPOS_MS` — Fase 2
// de la auditoría de dominio): se reexporta acá para no romper a los
// callers que ya la importan desde `@/infrastructure/repositories`.
export { INTERVALO_HEARTBEAT_IMPORTACION_GRUPOS_MS } from "@/domain/entities";

export {
  registrarErrorInesperado,
  getErrorLogsPage,
  getUnreadErrorLogCount,
  acknowledgeErrorLog,
  acknowledgeAllErrorLogs,
  purgeAcknowledgedErrorLogs,
  ERROR_LOG_RETENTION_DAYS,
  ERROR_LOG_PAGE_SIZE,
  type ErrorLogPage,
} from "./ErrorLogRepository";

export {
  registrarCambioDeMembresia,
  getHistorialDeMembresias,
  type HistorialDeMembresiasPage,
} from "./CambioDeMembresiaRepository";

export {
  registrarDelivery,
  reclamarDeliveryPorId,
  reclamarDeliveryPorDeliveryId,
  cerrarDelivery,
  fallarDelivery,
  getDeliveriesReprocesables,
  getWebhookDeliveryOverview,
  DeliveryDuplicadoError,
  type DeliveryReclamado,
  type WebhookDeliveryOverview,
} from "./GithubWebhookDeliveryRepository";

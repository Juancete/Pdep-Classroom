import {
  Entity,
  Enum,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/core";
import { randomUUID } from "crypto";
import { Alumno } from "./Alumno";
import { Assignment } from "./Assignment";
import { Grupo } from "./Grupo";
import {
  ResultadoCI,
  NOMBRES_RESULTADO_CI,
  type NombreResultadoCI,
} from "./ResultadoCI";

// Evita martillar la API de GitHub cuando varias personas abren la misma
// vista casi al mismo tiempo: si ya consultamos hace menos de este umbral,
// no se vuelve a consultar salvo `forzar: true`. Única fuente: la usan tanto
// `tieneCIFresco()` acá como `sincronizarCI.sincronizarCIDeEntregas` (antes
// vivía sólo en el servicio, como función `esReciente` aparte).
export const FRESCURA_CI_MS = 60_000;

// Issue #122: cachea la participación de cada integrante en el repo con la
// misma ventana de frescura que el CI (mismo mecanismo que `FRESCURA_CI_MS`,
// se sincroniza sólo con el botón "Actualizar" y nunca desde un webhook).
export const FRESCURA_CONTRIBUCIONES_MS = FRESCURA_CI_MS;

// Una fila de `octokit.repos.listContributors`, ya traducida a los nombres
// del dominio (ver `src/infrastructure/github.ts`).
export type Contribucion = { login: string; commits: number };

// Salida de `Entrega.participacionDe`: `username` viaja tal como se pasó
// (sin normalizar) para que la UI lo muestre como lo conoce.
export type ParticipacionDeIntegrante = {
  username: string;
  commits: number;
  porcentaje: number;
};

// Subconjunto estructural mínimo de `RepoInfo` (lib/github.ts) que necesita
// `reconoceComoPropio` — se declara acá en vez de importar ese tipo para
// que la entidad no dependa de `lib/github.ts` (Fase 3 de la auditoría de
// dominio).
export interface RepoInfoMinimo {
  repoGithubId?: string;
  description?: string | null;
  createdAt?: Date | null;
}

// Issue #107: la borra puntual desde admin (`borrarEntrega.ts`) necesita
// distinguir "no existe" de "no pertenece a este assignment" del resto de
// errores inesperados — mismo criterio que `AssignmentNoEncontradoError`.
export class EntregaNoEncontradaError extends Error {
  constructor(public readonly entregaId: string) {
    super("Entrega no encontrada");
    this.name = "EntregaNoEncontradaError";
  }
}

// Un intento abandonado se puede reclamar de nuevo pasados dos minutos —
// única fuente, la usan tanto `provisionEnCurso()` acá como
// `EntregaRepository.iniciarProvisionEntrega`.
export const VENTANA_PROVISION_EN_VUELO_MS = 120_000;

// Issue #107 (revisión de code review): borrar una entrega con la provisión
// en vuelo (otra request ya reclamó el aprovisionamiento y todavía puede
// terminar de crear el repo) deja a esa request en curso escribiendo sobre
// una fila que ya no existe. `borrarEntrega.ts` usa esto para rechazar el
// borrado mientras dure la ventana.
export class EntregaConProvisionEnCursoError extends Error {
  constructor(public readonly entregaId: string) {
    super("El aprovisionamiento del repositorio está en curso. Reintentá en unos minutos.");
    this.name = "EntregaConProvisionEnCursoError";
  }
}

// Issue #123: GitHub respondió 404 al invitar a un integrante — el 404 no
// distingue "el usuario no existe" de "el repo no existe", así que el mensaje
// cubre ambos casos.
export class ColaboradorNoInvitableError extends Error {
  constructor(public readonly githubUsername: string) {
    super(
      `No pudimos dar acceso al repositorio a @${githubUsername}: GitHub no encontró al usuario o al repositorio. Verificá el usuario de GitHub o avisale a un docente.`
    );
    this.name = "ColaboradorNoInvitableError";
  }
}

@Entity()
export class Entrega {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @ManyToOne(() => Assignment, { deleteRule: "cascade" })
  assignment!: Assignment;

  // Individual: alumno que entrega
  @ManyToOne(() => Alumno, { nullable: true })
  alumno?: Alumno;

  // Grupal: grupo al que pertenece la entrega. `deleteRule: "set null"`
  // explícito (era el default implícito de MikroORM para un `@ManyToOne`
  // nullable, ya vigente en la base) — un grupo puede borrarse sin arrastrar
  // la entrega: el registro histórico se preserva con `grupo` en null.
  @ManyToOne(() => Grupo, { nullable: true, deleteRule: "set null" })
  grupo?: Grupo;

  // Todos los usernames con acceso al repo (denormalizado para queries rápidas)
  @Property({ type: "array" })
  githubUsernames: string[] = [];

  @Property({ type: 'string', nullable: true })
  repoName?: string;

  @Property({ type: 'string', nullable: true })
  repoUrl?: string;

  @Property({ type: 'boolean', default: false })
  repoDeleted: boolean = false;

  @Property({ type: 'datetime' })
  createdAt: Date = new Date();

  // Saga de aprovisionamiento GitHub. La fila se crea antes de llamar a
  // GitHub para que un timeout o una carrera nunca deje un repo sin dueño
  // lógico recuperable en Classroom.
  @Enum({ items: ["pendiente", "activa", "fallida"], default: "activa" })
  provisionEstado: "pendiente" | "activa" | "fallida" = "activa";

  @Property({ type: "text", nullable: true })
  provisionUltimoError?: string;

  @Property({ type: "integer", default: 0 })
  provisionIntentos: number = 0;

  @Property({ type: "datetime", nullable: true })
  provisionCreacionIniciadaEn?: Date;

  @Property({ type: "datetime", nullable: true })
  provisionActualizadoEn?: Date;

  // CI (issue #58): estado combinado de los checks del último commit del
  // branch por defecto del repo de esta entrega — mismo mecanismo que un
  // badge de CI en un README, no depende de un workflow con nombre fijo.
  // Sólo se guarda el último resultado — no un historial completo (ver
  // `RepoDeletionAttempt` para el molde de auditoría si más adelante hace
  // falta la serie completa).
  @Enum({ items: [...NOMBRES_RESULTADO_CI], default: "sin_consultar" })
  ciResultadoNombre: NombreResultadoCI = "sin_consultar";

  // Check suites del último commit consultado — se usan para pedir el
  // rerequest al reejecutar. Pueden ser varios si el repo tiene más de un
  // workflow (ej. lint + tests).
  @Property({ type: "array", defaultRaw: "'{}'" })
  ciCheckSuiteIds: string[] = [];

  @Property({ type: 'string', nullable: true })
  ciCommitSha?: string;

  // Link a la pestaña de checks del commit en GitHub (agrega todos los
  // checks, no uno solo).
  @Property({ type: 'string', nullable: true })
  ciDetalleUrl?: string;

  @Property({ type: 'datetime', nullable: true })
  ciEjecutadoEn?: Date; // cuándo corrieron los checks (según GitHub)

  @Property({ type: 'datetime', nullable: true })
  ciActualizadoEn?: Date; // cuándo los consultamos nosotros (frescura del caché)

  // Contribuciones por login del repo (issue #122), cacheadas con la misma
  // ventana de frescura que el CI. Nullable para distinguir "nunca se
  // sincronizó" (`undefined`) de "se sincronizó y el repo no tiene commits"
  // (`[]`) — mismo criterio que `ciActualizadoEn`.
  @Property({ type: "json", nullable: true })
  contribuciones?: Contribucion[];

  @Property({ type: "datetime", nullable: true })
  contribucionesActualizadoEn?: Date; // cuándo las consultamos nosotros (frescura del caché)

  // Actividad reciente del repo (issue #60) — la escribe el webhook de
  // `push` cuando llega un commit nuevo al branch por defecto.
  @Property({ type: 'datetime', nullable: true })
  ultimoPushEn?: Date;

  @Property({ type: 'string', nullable: true })
  ultimoPushSha?: string;

  @Property({ type: 'string', nullable: true })
  ultimoPushPor?: string; // sender.login del payload de GitHub

  // Id numérico de GitHub del repo (issue #60) — a diferencia de `repoName`,
  // no cambia con un rename. Resolver los eventos `repository.deleted`/
  // `renamed` por acá (en vez de por nombre) evita perderlos cuando GitHub
  // entrega los webhooks desordenados: un `renamed` A→B procesado después
  // de un `renamed` B→C ya aplicado seguiría encontrando la entrega por id,
  // aunque el nombre actual ya no coincida con lo que ese evento espera. Se
  // autocompleta ("self-heal") la primera vez que llega cualquier webhook
  // para el repo — no hace falta poblarlo al crear la entrega.
  @Property({ type: 'string', nullable: true, unique: true })
  repoGithubId?: string;

  // `repository.updated_at` del último evento `repository` aplicado — guard
  // de orden: un `deleted`/`renamed` viejo que llega tarde no debe pisar uno
  // más nuevo ya aplicado (GitHub no garantiza el orden de entrega).
  @Property({ type: 'datetime', nullable: true })
  repoEventoActualizadoEn?: Date;

  get resultadoCI(): ResultadoCI {
    return ResultadoCI.desdeNombre(this.ciResultadoNombre);
  }

  /**
   * Única fuente para habilitar el botón/endpoint de reejecución de CI
   * (B1 de la auditoría de dominio): antes `ci/rerun/route.ts` sólo miraba
   * `resultadoCI.permiteReejecucion()` y `sincronizarCI.reejecutarCIDeEntrega`
   * volvía a chequear `repoName`/`ciCheckSuiteIds` con un `Error` genérico —
   * un resultado "reejecutable" (ej. `passing`) sin checks guardados pasaba
   * el guard de la route y recién ahí explotaba. Acá se combinan las dos
   * condiciones en un solo lugar.
   */
  puedeReejecutarCI(): boolean {
    return this.resultadoCI.permiteReejecucion() && !!this.repoName && this.ciCheckSuiteIds.length > 0;
  }

  /** `true` si el último resultado de CI se consultó hace menos de `FRESCURA_CI_MS`. */
  tieneCIFresco(ahora: Date): boolean {
    if (!this.ciActualizadoEn) return false;
    return ahora.getTime() - this.ciActualizadoEn.getTime() < FRESCURA_CI_MS;
  }

  /**
   * Persiste el resultado de una consulta de CI (issue #58). Cada campo es
   * tri-estado: omitido/`undefined` conserva el valor ya guardado (ej. al
   * pasar a "pendiente" tras pedir un rerun, sin tener todavía un check
   * nuevo que reporte), `null` lo limpia explícitamente (ej. al pasar a
   * "sin_ci"). Antes vivía como asignación directa de campos en
   * `EntregaRepository.actualizarCIDeEntrega` (Fase 2 de la auditoría de
   * dominio).
   */
  registrarResultadoCI(data: {
    resultadoNombre: NombreResultadoCI;
    checkSuiteIds?: string[] | null;
    commitSha?: string | null;
    detalleUrl?: string | null;
    ejecutadoEn?: Date | null;
  }): void {
    this.ciResultadoNombre = data.resultadoNombre;
    if (data.checkSuiteIds !== undefined) this.ciCheckSuiteIds = data.checkSuiteIds ?? [];
    if (data.commitSha !== undefined) this.ciCommitSha = data.commitSha ?? undefined;
    if (data.detalleUrl !== undefined) this.ciDetalleUrl = data.detalleUrl ?? undefined;
    if (data.ejecutadoEn !== undefined) this.ciEjecutadoEn = data.ejecutadoEn ?? undefined;
    this.ciActualizadoEn = new Date();
  }

  /** `true` si las contribuciones se consultaron hace menos de `FRESCURA_CONTRIBUCIONES_MS`. */
  tieneContribucionesFrescas(ahora: Date): boolean {
    if (!this.contribucionesActualizadoEn) return false;
    return (
      ahora.getTime() - this.contribucionesActualizadoEn.getTime() <
      FRESCURA_CONTRIBUCIONES_MS
    );
  }

  /**
   * `true` si ya se sincronizaron contribuciones alguna vez, aunque el repo
   * no tenga commits — distingue "nunca sincronizado" (no mostrar nada en
   * la UI) de "sincronizado, repo sin commits" (mostrar en 0). `!= null`
   * (no `!== undefined`): MikroORM hidrata una columna nullable como `null`,
   * no como `undefined` (no hay `forceUndefined` en la config), y una
   * entrega recién cargada de la base con la comparación estricta se leería
   * como "sincronizada".
   */
  tieneContribucionesSincronizadas(): boolean {
    return this.contribucionesActualizadoEn != null;
  }

  /**
   * Persiste las contribuciones consultadas a GitHub (issue #122) y sella
   * la fecha de sincronización — mismo patrón que `registrarResultadoCI`.
   */
  registrarContribuciones(contribuciones: Contribucion[]): void {
    this.contribuciones = [...contribuciones];
    this.contribucionesActualizadoEn = new Date();
  }

  /**
   * Total de commits del repo, sumando todos los logins (issue #122,
   * decisión de denominador: incluye bot, docentes y ex integrantes). 0 si
   * nunca se sincronizó.
   */
  totalDeCommits(): number {
    if (!this.contribuciones) return 0;
    return this.contribuciones.reduce(
      (acumulado, contribucion) => acumulado + contribucion.commits,
      0
    );
  }

  /**
   * Porcentaje de participación de cada `username` sobre el total de
   * commits del repo (issue #122). El matching es canónico
   * (`Alumno.normalizarUsername` de ambos lados, mismo criterio que
   * `perteneceA`); un username sin contribución registrada entra con
   * `commits: 0`. El denominador incluye logins que no son integrantes, así
   * que la suma de los porcentajes devueltos puede no dar 100 — esos logins
   * no se muestran (decisión del issue #122). Devuelve `[]` si nunca se
   * sincronizó.
   */
  participacionDe(usernames: string[]): ParticipacionDeIntegrante[] {
    const contribuciones = this.contribuciones;
    if (!contribuciones) return [];
    const total = this.totalDeCommits();
    return usernames.map((username) => {
      const normalizado = Alumno.normalizarUsername(username);
      const contribucion = contribuciones.find(
        (candidata) => Alumno.normalizarUsername(candidata.login) === normalizado
      );
      const commits = contribucion?.commits ?? 0;
      const porcentaje = total === 0 ? 0 : Math.round((commits * 100) / total);
      return { username, commits, porcentaje };
    });
  }

  /** Participación de los colaboradores actuales del repo (`githubUsernames`) — la usa la tabla de entregas. */
  participacionDeColaboradores(): ParticipacionDeIntegrante[] {
    return this.participacionDe(this.githubUsernames);
  }

  /**
   * Registra la actividad reciente del repo (issue #60, webhook de `push`).
   * Guard de orden adentro: un redelivery tardío de un push viejo no puede
   * pisar uno más nuevo, así que se compara contra lo ya guardado antes de
   * aplicar. Devuelve `true` si se aplicó (para que el caller sepa si hace
   * falta flushear).
   */
  registrarPush(data: { pusheadoEn: Date; commitSha: string; por: string }): boolean {
    if (this.ultimoPushEn && this.ultimoPushEn >= data.pusheadoEn) return false;
    this.ultimoPushEn = data.pusheadoEn;
    this.ultimoPushSha = data.commitSha;
    this.ultimoPushPor = data.por;
    return true;
  }

  /**
   * `true` si un evento `repository` con fecha `eventoActualizadoEn` es
   * ESTRICTAMENTE más viejo que el último ya aplicado — GitHub no garantiza
   * el orden de entrega, así que un `deleted`/`renamed` demorado no puede
   * pisar uno más nuevo que ya se procesó. Sin fecha (payload sin
   * `updated_at`), nunca se considera viejo — se aplica igual, mismo
   * criterio defensivo que el fallback de `push` cuando falta el timestamp.
   *
   * Comparación estricta (`>`, no `>=`): `repository.updated_at` viaja en
   * segundos, así que dos operaciones sobre el mismo repo dentro del mismo
   * segundo (ej. un rename seguido de inmediato por un delete) comparten
   * timestamp. Con `>=`, si el rename se procesa primero, el delete
   * "empatado" se rechazaría por viejo y el repo quedaría marcado como
   * activo pese a haberse borrado — un resultado peor que simplemente dejar
   * ganar al que se procesó último en un empate genuino.
   */
  private esEventoRepositoryViejo(eventoActualizadoEn?: Date): boolean {
    return Boolean(
      eventoActualizadoEn &&
        this.repoEventoActualizadoEn &&
        this.repoEventoActualizadoEn > eventoActualizadoEn
    );
  }

  /**
   * El webhook de `repository.deleted` (issue #60) — mismo campo que
   * `completarIntentoBorradoRepo` cuando el borrado lo inicia Classroom, así
   * que la grilla de entregas no necesita distinguir el origen. Devuelve
   * `true` si se aplicó (el caller decide si flushear).
   */
  marcarRepoBorrado(eventoActualizadoEn?: Date): boolean {
    if (this.esEventoRepositoryViejo(eventoActualizadoEn)) return false;
    this.repoDeleted = true;
    if (eventoActualizadoEn) this.repoEventoActualizadoEn = eventoActualizadoEn;
    return true;
  }

  /**
   * El webhook de `repository.renamed` (issue #60): el repo sigue siendo el
   * mismo, sólo cambia de nombre/URL. Mismo guard de orden que
   * `marcarRepoBorrado`. Devuelve `true` si se aplicó.
   */
  aplicarEventoRepository(
    data: { repoName: string; repoUrl: string },
    eventoActualizadoEn?: Date
  ): boolean {
    if (this.esEventoRepositoryViejo(eventoActualizadoEn)) return false;
    this.repoName = data.repoName;
    this.repoUrl = data.repoUrl;
    if (eventoActualizadoEn) this.repoEventoActualizadoEn = eventoActualizadoEn;
    return true;
  }

  /**
   * Autocompleta ("self-heal") `repoGithubId` la primera vez que se conoce —
   * no hace falta poblarlo al crear la entrega. Idempotente: si ya está
   * seteado, no hace nada. Devuelve `true` si lo aplicó.
   */
  autocompletarRepoGithubId(repoGithubId: string): boolean {
    if (this.repoGithubId) return false;
    this.repoGithubId = repoGithubId;
    return true;
  }

  /**
   * Compara `repoGithubId` (el que trae un evento o una consulta a GitHub)
   * contra el guardado en esta entrega. Única fuente de esta comparación —
   * antes estaba escrita tres veces: acá como desigualdad cruda, en
   * `reconoceComoPropio` y como guard en `procesarEventoGithub.resolverEntrega`.
   * "desconocido" cuando no hay id de alguno de los dos lados para comparar
   * (no es ni coincidencia ni conflicto).
   */
  compararRepoGithubId(repoGithubId?: string): "coincide" | "conflicto" | "desconocido" {
    if (!repoGithubId || !this.repoGithubId) return "desconocido";
    return this.repoGithubId === repoGithubId ? "coincide" : "conflicto";
  }

  tieneConflictoDeRepoGithubId(repoGithubId?: string): boolean {
    return this.compararRepoGithubId(repoGithubId) === "conflicto";
  }

  /**
   * `true` si `githubUsername` ya tiene acceso al repo de esta entrega —
   * comparando ambos lados normalizados (`Alumno.normalizarUsername`: trim,
   * sin `@` inicial, case-insensitive). Antes el matching se hacía a mano
   * con `.toLowerCase()` en varios repositorios, sin quitar el `@` (Fase 2
   * de la auditoría de dominio).
   */
  perteneceA(githubUsername: string): boolean {
    const normalizado = Alumno.normalizarUsername(githubUsername);
    return this.githubUsernames.some(
      (existente) => Alumno.normalizarUsername(existente) === normalizado
    );
  }

  /**
   * Suma un colaborador con acceso al repo (webhook `member.added`).
   * No duplica si ya estaba (comparación normalizada, ver `perteneceA`).
   * Devuelve `true` si lo agregó.
   */
  agregarColaborador(githubUsername: string): boolean {
    if (this.perteneceA(githubUsername)) return false;
    this.githubUsernames = [...this.githubUsernames, githubUsername];
    return true;
  }

  /**
   * Quita un colaborador (webhook `member.removed`). Devuelve `true` si
   * había alguno que coincidiera (comparación normalizada) y lo quitó.
   */
  quitarColaborador(githubUsername: string): boolean {
    const normalizado = Alumno.normalizarUsername(githubUsername);
    const actualizados = this.githubUsernames.filter(
      (existente) => Alumno.normalizarUsername(existente) !== normalizado
    );
    if (actualizados.length === this.githubUsernames.length) return false;
    this.githubUsernames = actualizados;
    return true;
  }

  /**
   * Marcador embebido en la descripción del repo de GitHub al crearlo —
   * `reconoceComoPropio` lo usa para reconocer un repo preexistente como
   * "el que corresponde a esta entrega" cuando no hay `repoGithubId` para
   * comparar (creación anterior interrumpida antes de guardarlo).
   */
  marcadorDeRepo(): string {
    return `[pdep-entrega:${this.id}]`;
  }

  /**
   * `true` si `repo` (resultado de una consulta a GitHub) corresponde
   * efectivamente al intento de aprovisionamiento en curso de esta entrega
   * — antes vivía como `repoCompatibleConIntento` en `aceptarAssignment.ts`
   * (Fase 3 de la auditoría de dominio). Reconoce por `repoGithubId` si ya
   * se conoce, o por el marcador embebido en la descripción si no. GitHub
   * informa `createdAt` con precisión de segundos, así que se tolera 5
   * segundos hacia atrás respecto de cuándo se inició la creación.
   */
  reconoceComoPropio(repo: RepoInfoMinimo): boolean {
    const inicio = this.provisionCreacionIniciadaEn;
    if (!inicio || !repo.createdAt) return false;
    return (
      (this.compararRepoGithubId(repo.repoGithubId) === "coincide" ||
        repo.description?.includes(this.marcadorDeRepo()) === true) &&
      repo.createdAt.getTime() >= inicio.getTime() - 5_000
    );
  }

  // Única fuente de "esta entrega tiene un repo activo": antes existía
  // duplicado byte a byte como `provisionEstaActiva()`, y además había otras
  // dos variantes en repositorio/UI que sólo miraban `repoDeleted`/`repoName`
  // sin el filtro de `provisionEstado` (ver `EntregaRepository.ts` y
  // `admin/assignments/[id]/page.tsx` — B2 de la auditoría de dominio).
  hasRepo(): boolean {
    return this.provisionEstado === "activa" && !!this.repoUrl && !this.repoDeleted;
  }

  /**
   * `hasRepo()` mira `repoUrl`, pero quien invita o revoca colaboradores
   * necesita `repoName`: centraliza "¿este repo está activo y cuál es su nombre?".
   */
  nombreDeRepoActivo(): string | undefined {
    return this.hasRepo() ? this.repoName : undefined;
  }

  /**
   * Una provisión pendiente o fallida no tiene repo activo, pero si la
   * creación en GitHub llegó a iniciarse el repo puede existir con algunos
   * colaboradores ya invitados (`crearEntrega` invita en paralelo y puede
   * fallar a mitad; issue #123). Este nombre es sólo un candidato: hay que
   * confirmar contra GitHub que el repo es propio (`reconoceComoPropio`)
   * antes de tocarlo.
   */
  nombreDeRepoParcial(): string | undefined {
    return !this.hasRepo() && !this.repoDeleted && !!this.provisionCreacionIniciadaEn
      ? this.repoName
      : undefined;
  }

  /**
   * `true` si otra request ya reclamó el aprovisionamiento y todavía está
   * dentro de la ventana en la que puede seguir corriendo (issue #107) —
   * misma lógica que antes vivía inline en
   * `EntregaRepository.iniciarProvisionEntrega`, movida acá para que
   * `borrarEntrega.ts` también pueda consultarla sin duplicarla.
   */
  provisionEnCurso(ahora: Date = new Date()): boolean {
    return (
      this.provisionEstado === "pendiente" &&
      this.provisionIntentos > 0 &&
      this.provisionActualizadoEn !== undefined &&
      this.provisionActualizadoEn.getTime() > ahora.getTime() - VENTANA_PROVISION_EN_VUELO_MS
    );
  }

  iniciarProvision(): void {
    this.provisionEstado = "pendiente";
    this.provisionUltimoError = undefined;
    this.provisionIntentos += 1;
    this.provisionActualizadoEn = new Date();
  }

  marcarCreacionGithubIniciada(): void {
    this.provisionCreacionIniciadaEn ??= new Date();
    this.provisionActualizadoEn = new Date();
  }

  completarProvision(data: { repoName: string; repoUrl: string; repoGithubId?: string }): void {
    this.repoName = data.repoName;
    this.repoUrl = data.repoUrl;
    this.repoGithubId = data.repoGithubId;
    this.repoDeleted = false;
    this.provisionEstado = "activa";
    this.provisionUltimoError = undefined;
    this.provisionActualizadoEn = new Date();
  }

  fallarProvision(error: string): void {
    this.provisionEstado = "fallida";
    this.provisionUltimoError = error;
    this.provisionActualizadoEn = new Date();
  }

  repoFueBorrado(): boolean {
    return !!this.repoName && this.repoDeleted;
  }

  noTieneRepo(): boolean {
    return !this.repoName;
  }

  estadoRepo(): "borrado" | "activo" | "sin-repo" {
    if (this.repoFueBorrado()) return "borrado";
    if (this.hasRepo()) return "activo";
    return "sin-repo";
  }
}

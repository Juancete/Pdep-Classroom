// Se lanza cuando no se pudo verificar el rol del usuario (típicamente, la
// consulta a `Administrador` falló). A propósito no se atrapa acá ni en
// `getCurrentUser()`: el issue #83 pide rechazar la operación con un error
// controlado en vez de reutilizar un rol anterior, así que cada consumidor
// decide cómo mostrarlo (ver `guardAdmin`/`guardUser` en `api-auth.ts` para
// el canal HTTP; las páginas dejan que llegue al error boundary de Next).
//
// Vive en su propio módulo, sin imports, para que `api-errors.ts` pueda
// sumarla a `getRespuestasPorError()` sin importar `session.ts`: todos los
// tests de rutas hacen `vi.mock("@/infrastructure/auth/session", ...)`
// parcial, y si `api-errors.ts` importara la clase desde `session.ts` esos
// mocks romperían. `session.ts` la importa desde acá y la re-exporta para
// que `api-auth.ts` y su test sigan funcionando sin cambios.
export class PermisosNoVerificablesError extends Error {
  constructor(cause: unknown) {
    super("No se pudieron verificar tus permisos. Reintentá en unos segundos.");
    this.name = "PermisosNoVerificablesError";
    this.cause = cause;
  }
}

/**
 * Sólo comprueba autenticación — no autorización. Hasta #83 esta función
 * también rebotaba a un alumno fuera de `/admin` mirando el `rolNombre` que
 * viajaba en el JWT. Ese rol dejó de existir en la sesión: a partir de #83 un
 * docente puede desactivarse entre una request y la siguiente, y este
 * proxy corre en el Edge runtime, que no puede consultar la tabla
 * `Docente` (arrastraría MikroORM al bundle Edge — ver el comentario en
 * `src/infrastructure/auth/auth.ts`).
 *
 * La autorización por rol sigue existiendo, sólo que más adentro, donde sí
 * hay acceso a la DB: `requireAdmin()`/`requireResponsable()` en cada página
 * y server action de `/admin/*`, y `guardAdmin()` en cada route handler. No
 * queda ninguna ruta administrativa sin su propio guard — ver el listado en
 * el plan del issue #83.
 */
export function getProxyRedirectPath({ session }: { session: unknown }): "/login" | null {
  return session ? null : "/login";
}

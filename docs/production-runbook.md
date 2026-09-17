# Runbook de producción

Este procedimiento es obligatorio para una versión que agrega migraciones. El build de Vercel no
modifica la base de datos: el release (migración + deploy) lo hace el workflow **Deploy
production** al hacer push o mergear a `master`.

## Antes del release

1. Confirmar CI verde y revisar las migraciones nuevas. Confirmar también que los secrets del
   environment `production` existen (`DATABASE_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
   `VERCEL_PROJECT_ID`), cargados con `gh secret set <NOMBRE> --env production`. Restringir el
   environment `production` de GitHub a la rama `master` (Settings → Environments → production →
   Deployment branches → Selected branches → `master`), para que ni siquiera un run manual pueda
   desplegar otra rama.
2. Crear un restore point o snapshot en Neon y verificar que el equipo sabe restaurarlo.
3. Verificar en Vercel las variables de producción. El arranque exige base, GitHub OAuth, secreto
   de NextAuth, admins, GitHub App, secreto de webhook y Google Sheets. Los canales de comunicación
   (ej. Google Groups) son opcionales — sin sus env vars, el canal simplemente no hace nada. No debe
   existir `ENABLE_DEV_LOGIN`.
4. Verificar en GitHub la callback OAuth y el webhook del dominio definitivo. La App debe estar
   instalada en la organización y suscripta a `Check suite`, `Push`, `Repository` y `Member`.

## Release

1. Mergear el PR `development → master` (o pushear a `master`). Eso dispara **Deploy
   production**: `verificar` → `build` (deployment de producción staged en Vercel, sin dominio) →
   `migrate` → `promote`. Seguirlo en Actions.
   - Si `build` falla, la base no se toca.
   - Si `migrate` falla, no se promueve y producción sigue con el código anterior sobre el schema
     anterior (o parcialmente migrado: revisar el log).
   - Si `promote` falla con la migración ya aplicada, promover a mano desde el dashboard de Vercel
     (Deployments → el deployment staged → Promote) o hacer rollback de la migración según el paso
     de "Incidente y rollback".
2. Consultar `GET /api/health`; debe responder `200` con `{"ok":true,"database":"ok",...}` y
   `version` igual al SHA corto del commit de `master`.
3. Para aplicar migraciones sin desplegar (por ejemplo, para adelantar una migración aditiva),
   correr **Deploy production** desde Actions → Run workflow con `solo_migrar` marcado. Si falla en
   el step "Verificar secret DATABASE_URL", recargar el secret con `gh secret set DATABASE_URL
   --env production` (el valor no está en Vercel: ahí la variable es sensitive). El deployment
   staged que generó el job `build` de ese run queda sin promover.
4. Entrar como docente a `/admin/operaciones`. GitHub y Sheets (lectura y escritura) deben estar en
   verde; cada canal de comunicación configurado también — uno apagado a propósito aparece como "Revisar" y no bloquea.
   No debe haber deliveries fallidos sin explicar.
5. Hacer el canary con un assignment descartable:
   - un docente lo crea y publica;
   - un alumno de prueba completa registro y acepta un TP individual;
   - dos alumnos forman un grupo y aceptan un TP grupal;
   - se confirma repo, colaboradores, suscripción a los canales configurados y actualización de CI
     por webhook.
6. Si la comisión ya tenía grupos en Sheets, ejecutar una sola vez **Importar grupos desde
   Sheets**. Desde ese momento Classroom es la fuente de verdad.
7. Release que agrega la tabla `administrador` (issue #83): la migración no copia
   `ADMIN_GITHUB_USERNAMES` a la tabla, así que arranca vacía — nadie pierde ni gana acceso por sí
   sola. Verificar que un responsable ve **Docentes** en el menú y puede dar de alta un
   docente de prueba desde `/admin/docentes`. Al terminar, desactivar ese docente y,
   con su sesión todavía abierta, confirmar que una nueva solicitud a `/admin/assignments` y
   a una API administrativa ya no permite acceso administrativo. La baja no elimina su cuenta
   ni revoca los accesos que pudiera tener como alumno.
8. Release que renombra la tabla `administrador` a `docente` (issue #90): correr la migración
   (`release:migrate`) **antes** de desplegar el código, porque la entidad nueva (`Docente`)
   apunta a la tabla `docente` — si el código nuevo arranca contra la tabla vieja, cualquier
   consulta a docentes revienta. Después del deploy, verificar que los docentes ya cargados
   siguen apareciendo en `/admin/docentes` (alta, edición de nombre y cambio de estado
   siguen funcionando sobre las filas migradas). Este fue el caso que motivó que la migración
   corra en el mismo workflow y antes del deploy.

Regla: las migraciones tienen que ser compatibles con el deploy anterior (expand/contract), porque
entre `migrate` y `promote` el código anterior corre contra el schema nuevo y, si `promote` falla,
esa situación dura hasta la intervención manual. Un rename o drop de columna/tabla se hace en dos
releases: primero el código que tolera ambos, después la migración destructiva.

## Operación habitual

- `/admin/operaciones` muestra el estado de integraciones, el último webhook y permite reprocesar
  deliveries recibidos o fallidos.
- Una entrega cuya creación de repo falló queda visible como fallida y el alumno puede reintentar.
  Una colisión con un repo ajeno se detiene y requiere intervención docente; nunca se adopta ese
  repo silenciosamente.
- Sólo se elimina un assignment borrador sin entregas ni grupos. Sólo se elimina una comisión
  inactiva y vacía.
- Los repos sólo se borran para assignments archivados, después de previsualizar la lista y
  escribir el slug exacto. Esta acción sigue siendo irreversible: antes de usarla conservar los
  repos o exportarlos según la política de la materia.
- Las altas masivas de alumnos y las suscripciones a canales de comunicación se procesan en lotes
  acotados; repetir la acción admin hasta que no queden pendientes.

## Incidente y rollback

1. Si falla el smoke test, detener nuevas aceptaciones archivando el assignment afectado o
   revirtiendo el deploy de Vercel. Revertir desde el dashboard de Vercel (Instant Rollback) sigue
   funcionando: los deployments que crea el job `build` y promueve `promote` aparecen ahí igual que
   los que hacía la integración Git.
2. No ejecutar `migration:down` a ciegas. Primero revisar si el código anterior es compatible con
   las columnas nuevas; las migraciones aditivas de este release sí permiten volver al deploy
   anterior conservando columnas.
3. Si hubo corrupción o pérdida de datos, restaurar el restore point de Neon en una rama nueva,
   validar conteos de alumnos/assignments/entregas y recién entonces promover la restauración.
4. Reprocesar deliveries fallidos desde `/admin/operaciones` cuando GitHub y la base vuelvan a
   estar estables.

## Pendientes que no bloquean este release

- Rate limiting distribuido para despliegues con varias instancias.
- Deadlines aplicadas por servidor, notificaciones de publicación y export de entregas.
- Backup/ZIP previo al borrado de repos y prueba periódica automatizada de restore.
- Optimización de consultas para comisiones de gran tamaño.

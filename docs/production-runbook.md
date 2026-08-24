# Runbook de producción

Este procedimiento es obligatorio para una versión que agrega migraciones. El build de Vercel no
modifica la base de datos.

## Antes del release

1. Confirmar CI verde y revisar las migraciones nuevas.
2. Crear un restore point o snapshot en Neon y verificar que el equipo sabe restaurarlo.
3. Verificar en Vercel las variables de producción. El arranque exige base, GitHub OAuth, secreto
   de NextAuth, admins, GitHub App, secreto de webhook, Google Sheets y Google Groups. No debe
   existir `ENABLE_DEV_LOGIN`.
4. Verificar en GitHub la callback OAuth y el webhook del dominio definitivo. La App debe estar
   instalada en la organización y suscripta a `Check suite`, `Push`, `Repository` y `Member`.
5. Evitar que un auto-deploy de producción se adelante a la migración. Usar promoción manual o
   pausar temporalmente ese auto-deploy.

## Release

1. Ejecutar **Actions → Migrate production database → Run workflow**. El environment protegido
   `production` necesita el secret `DATABASE_URL` de Neon.
2. Esperar el resultado exitoso y recién entonces promover el mismo commit en Vercel.
3. Consultar `GET /api/health`; debe responder `200` y `{"ok":true,"database":"ok",...}`.
4. Entrar como docente a `/admin/operaciones`. GitHub, Sheets y Groups deben estar en verde y no
   debe haber deliveries fallidos sin explicar.
5. Hacer el canary con un assignment descartable:
   - un docente lo crea y publica;
   - un alumno de prueba completa registro y acepta un TP individual;
   - dos alumnos forman un grupo y aceptan un TP grupal;
   - se confirma repo, colaboradores, email en Google Groups y actualización de CI por webhook.
6. Si la comisión ya tenía grupos en Sheets, ejecutar una sola vez **Importar grupos desde
   Sheets**. Desde ese momento Classroom es la fuente de verdad.

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
- Las altas masivas de alumnos y miembros de Google Groups se procesan en lotes acotados; repetir
  la acción admin hasta que no queden pendientes.

## Incidente y rollback

1. Si falla el smoke test, detener nuevas aceptaciones archivando el assignment afectado o
   revirtiendo el deploy de Vercel.
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

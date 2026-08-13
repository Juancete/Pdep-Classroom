# Seguridad de dependencias

El CI ejecuta `pnpm audit --prod --audit-level high` sobre cada push y pull
request. Una vulnerabilidad de severidad alta o crítica bloquea el pipeline; no
se mantienen excepciones para esas severidades.

Para reproducir el control localmente:

```bash
pnpm install --frozen-lockfile
pnpm audit:prod
```

## Vulnerabilidades moderadas aceptadas

Revisión realizada el 13 de agosto de 2026. El árbol de producción conserva
tres advisories moderados transitivos sin una actualización compatible
disponible desde las dependencias directas actuales:

| Advisory | Dependencia de origen | Motivo de aceptación |
| --- | --- | --- |
| `GHSA-2g4f-4pwh-qvx6` (`ajv`) | `@mikro-orm/migrations` | Afecta validaciones con la opción `$data`; la aplicación no procesa schemas AJV ni patrones controlados por requests. El paquete se usa para ejecutar migraciones. |
| `GHSA-q8mj-m7cp-5q26` (`qs`) | `googleapis` | Requiere combinar opciones no predeterminadas de serialización con arrays que contienen `null` o `undefined`; la aplicación no expone esa configuración a entradas de usuario. |
| `GHSA-w5hq-g745-h8pq` (`uuid`) | `googleapis` | Afecta escrituras de UUID v3/v5/v6 sobre buffers y offsets externos; la aplicación no utiliza esas APIs. |

Estas aceptaciones no se convierten en una allowlist: el audit seguirá
informándolas y cualquier nuevo hallazgo alto o crítico hará fallar CI. Deben
revisarse cuando se actualicen MikroORM o Google APIs, o si cambia el uso de
esas dependencias.

# PdeP Classroom
[![CI](https://github.com/Juancete/Pdep-Classroom/actions/workflows/ci.yml/badge.svg)](https://github.com/Juancete/Pdep-Classroom/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/Juancete/Pdep-Classroom/graph/badge.svg)](https://codecov.io/gh/Juancete/Pdep-Classroom)

Reemplazo liviano de GitHub Classroom para la cátedra de Paradigmas de Programación (UTN FRBA).

Centraliza el alta de alumnos, la suscripción al grupo de correo, la creación de TPs individuales y
grupales y el mantenimiento de los repositorios de la organización. Los repos se crean desde
templates en `pdep-mn-utn`, con colaboradores, CI y actividad sincronizados desde GitHub, sin
depender de GitHub Classroom.

Funciones principales:

- registro con GitHub, persistencia en PostgreSQL y espejo en Google Sheets;
- suscripción y reconciliación por lotes a canales de comunicación (Google Groups hoy, extensible);
- assignments en borrador, publicados y archivados, individuales o grupales;
- autogestión de grupos con invariantes de cupo y auditoría de membresías;
- aprovisionamiento reintentable e idempotente de repositorios;
- estado de CI y actividad actualizado mediante webhooks firmados;
- paneles docentes para entregas, errores, integraciones y mantenimiento seguro;
- importación única de grupos desde Sheets cuando la cursada ya está en marcha.

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **NextAuth v5** con GitHub OAuth
- **Octokit** + **GitHub App** para repos, colaboradores, CI y webhooks
- **Google Sheets API** para padrón, registro y bootstrap de grupos
- **Google Admin SDK** para suscribir y reconciliar el grupo de correo
- **MikroORM 6** + PostgreSQL para persistencia (assignments, grupos, entregas, comisiones)
- **Vercel** + **Neon** para deploy

## Setup rápido

### 1. Clonar e instalar

```bash
git clone <este-repo>
cd pdep-classroom
pnpm install
cp .env.example .env.local
```

### 2. Crear GitHub OAuth App

Ir a https://github.com/settings/applications/new

| Campo | Valor |
|---|---|
| Application name | PdeP Classroom |
| Homepage URL | `http://localhost:3000` (después cambiar al dominio de Vercel) |
| Callback URL | `http://localhost:3000/api/auth/callback/github` |

Copiar Client ID y Client Secret a `.env.local`.

### 3. Crear GitHub App en la org pdep-mn-utn

Ir a https://github.com/organizations/pdep-mn-utn/settings/apps/new

Completar el formulario con estos valores:

| Campo | Valor |
|---|---|
| GitHub App name | `PdeP Classroom` |
| Homepage URL | `http://localhost:3000` (después cambiar al dominio de Vercel) |

**Identifying and authorizing users** — dejar todo sin marcar:
- Callback URL: vacío
- Expire user authorization tokens: desmarcar
- Request user authorization (OAuth) during installation: desmarcar
- Enable Device Flow: desmarcar

**Post installation** — dejar vacío (no se necesita Setup URL).

**Webhook** — marcar "Active" (issue #60):
- Webhook URL: `https://tu-dominio.vercel.app/api/webhooks/github` (en local, la URL de un túnel —
  ver [Webhooks de GitHub](#webhooks-de-github) más abajo).
- Secret: el mismo valor que `GITHUB_WEBHOOK_SECRET` en `.env.local`/Vercel.

**Permissions:**

| Sección | Permiso | Nivel |
|---|---|---|
| Repository | Administration | Read & Write |
| Repository | Contents | Read & Write |
| Repository | Checks | Read & Write |
| Organization | Members | Read only |

`Checks` es para el estado de CI (ver [más abajo](#ci-en-classroom)): `Read` alcanza para mostrar el
estado combinado de los checks del último commit, `Write` hace falta sólo para el botón de
reejecución administrativa. **No hace falta `Actions`** — no se lee ningún workflow run puntual, se
lee el estado combinado de checks del commit, igual que un badge de CI en un README.

**Subscribe to events** — tildar `Check suite`, `Push`, `Repository`, `Member` (issue #60, ver
[Webhooks de GitHub](#webhooks-de-github)). Los cuatro entran con los permisos ya listados arriba
— `check_suite` con `Checks`, `push` con `Contents`, `member` con `Members`, `repository` con
`Metadata` (que toda GitHub App tiene de forma implícita) — **no hace falta agregar ningún permiso
nuevo** sólo para habilitar el webhook.

Todo lo demás (Account permissions) dejarlo sin seleccionar.

> Si la App ya estaba instalada antes de agregar el permiso `Checks`, hay que aceptar el permiso
> nuevo desde la org (`Settings → GitHub Apps → PdeP Classroom → Review request` o reinstalar la
> app) antes de que la vista de CI funcione — GitHub no lo aplica retroactivamente solo.

**Where can this GitHub App be installed?** → seleccionar **Only on this account**.

---

Después de crear la app:

**1. Anotar el App ID**

En la página de configuración de la app (donde estás ahora), en la sección "About", figura el **App ID** — un número entero. Copiarlo en `GITHUB_APP_ID`.

**2. Generar y convertir la private key**

Bajar en la misma página hasta "Private keys" → click en **Generate a private key** → se descarga un `.pem`.

```bash
# Convertir el .pem a base64 para el env (una sola línea, sin saltos)
cat tu-app.pem | base64 -w 0          # Linux
cat tu-app.pem | base64 | tr -d '\n'  # Mac
```

Pegar el resultado en `GITHUB_APP_PRIVATE_KEY`. Es importante que sea **una sola línea sin saltos** — si el valor queda partido en varias líneas el JWT falla con error 401.

**3. Instalar la app en la org y obtener el Installation ID**

> Para instalar una app en una org necesitás ser **Owner** de esa org. Si en el paso de instalación solo aparece tu usuario personal y no la org, es porque aún no tenés ese rol — pedíselo a quien administre la org.

Si sos Owner, hay dos formas de instalarla:

- **Opción A:** En la página de la app → **Install App** (barra lateral izquierda) → seleccionar `pdep-mn-utn` → **Install**
- **Opción B (más directa):** Ir a `https://github.com/organizations/pdep-mn-utn/settings/apps` → buscar la app → **Install**

En ambos casos, elegir **All repositories** o los repos necesarios → confirmar.

Una vez instalada, ir a:
```
https://github.com/organizations/pdep-mn-utn/settings/installations
```
Click en **Configure** de la app recién instalada. La URL del navegador cambia a algo como:
```
https://github.com/organizations/pdep-mn-utn/settings/installations/12345678
```
Ese número al final (`12345678`) es el **Installation ID**. Copiarlo en `GITHUB_APP_INSTALLATION_ID`.

**Alternativa rápida para dev:** en vez de una GitHub App, podés usar un Personal Access Token (classic) con scope `repo` y `admin:org`. Poné el token en `GITHUB_PAT` en el `.env.local`.

### 4. Configurar Google Sheets

#### 4.1 Crear proyecto en Google Cloud

1. Ir a https://console.cloud.google.com
2. En el selector de proyectos (arriba a la izquierda) → **New Project**
3. Darle un nombre (ej: `pdep-classroom`) → **Create**
4. Asegurarse de que el nuevo proyecto quede seleccionado en el selector

#### 4.2 Habilitar la API de Google Sheets

1. Ir al menú → **APIs & Services** → **Library**
2. Buscar `Google Sheets API`
3. Hacer click en el resultado → **Enable**

#### 4.3 Crear Service Account

1. Ir a **APIs & Services** → **Credentials**
2. Click en **+ Create Credentials** → **Service Account**
3. Completar:
   | Campo | Valor |
   |---|---|
   | Service account name | `pdep-classroom` |
   | Service account ID | se completa automático |
   | Description | (opcional) |
4. Click en **Create and Continue**
5. En "Grant this service account access to project": omitir (click **Continue**)
6. En "Grant users access to this service account": omitir (click **Done**)

#### 4.4 Descargar la clave JSON

1. En la lista de service accounts, hacer click en la que recién se creó
2. Ir a la pestaña **Keys**
3. Click en **Add Key** → **Create new key**
4. Seleccionar formato **JSON** → **Create**
5. Se descarga automáticamente un archivo `*.json` — guardarlo, es el único momento en que se puede descargar

#### 4.5 Convertir la clave a base64 y configurar el env

```bash
# En Mac/Linux
cat service-account.json | base64 -w 0

# En Mac (si -w 0 no funciona)
cat service-account.json | base64
```

Pegar el resultado en `GOOGLE_SERVICE_ACCOUNT_KEY` en el `.env.local`.

#### 4.6 Compartir la planilla con la Service Account

1. Abrir la planilla de Google Sheets con los alumnos
2. Botón **Compartir** (arriba a la derecha)
3. En el campo de email, pegar el email de la service account — tiene la forma `pdep-classroom@<project-id>.iam.gserviceaccount.com` (se ve en la pantalla de Credentials o en el JSON descargado, campo `client_email`)
4. Rol: **Viewer** (si solo se va a leer) o **Editor** (si la app también escribe el registro de alumnos)
5. Desmarcar "Notify people" → **Share**

#### 4.7 Configurar el ID de la planilla

Copiar el ID de la URL de la planilla:

```
https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit
```

A diferencia del resto de la config de Google, el ID de la planilla **no es una variable de
entorno**: es un dato por comisión, se guarda en `Comision.spreadsheetId` y se carga desde
`/admin/comisiones` al crear o editar la comisión (ver §9.5). Cada comisión puede apuntar a una
planilla distinta.

**Formato esperado de la planilla de alumnos (hoja principal):**

| Legajo | Apellido | Nombre | GitHub | Email | Comisión |
|---|---|---|---|---|---|
| 12345 | García | Juan | juangarcia | juan@gmail.com | miércoles noche |

**Formato esperado de la hoja "Grupos":** una fila por alumno, con su `githubUsername` y una
columna de nombre de grupo **por paradigma** (no una columna `Paradigma` separada) — se configura
por comisión al mapear las columnas de esa hoja:

| GithubUsername | GrupoFuncional | GrupoLogico | GrupoObjetos |
|---|---|---|---|
| juangarcia | Los Lambdas | Los Hechos | |
| mariaperez | Los Lambdas | | |
| pedrolopez | | Los Hechos | |

Un alumno puede figurar en un grupo distinto por cada paradigma; si una celda queda vacía, no
sincroniza grupo para ese paradigma.

La hoja es sólo la fuente de **carga inicial**. Después de ejecutar “Importar grupos desde Sheets”
para una comisión, la base de Classroom pasa a ser la fuente de verdad: las altas, bajas y cambios
se hacen desde la aplicación y una sincronización posterior no vuelve a agregar miembros quitados
manualmente. La fecha de esa importación queda visible en la edición de la comisión.

### 5. Configurar la base de datos

La app usa PostgreSQL via MikroORM. El esquema se crea con migraciones.

#### 5.1 Local (desarrollo)

Necesitás PostgreSQL corriendo localmente. El proyecto incluye un `docker-compose.yml` que levanta PostgreSQL 16 y pgAdmin juntos:

```bash
docker compose up -d
```

Esto levanta:
- **PostgreSQL** en `localhost:5433` (user: `postgres`, password: `postgres`, db: `pdep_classroom`)
  — puerto de host no estándar a propósito, para no chocar con otro Postgres local en el 5432
- **pgAdmin** en http://localhost:5050 (email: `admin@pdep.com`, password: `admin`)
  — ya viene pre-configurado apuntando a la instancia de Postgres, no hay que configurar nada

Si el 5433 también está ocupado, se puede pisar con una variable de entorno:

```bash
POSTGRES_HOST_PORT=5555 docker compose up -d
```

(y actualizar `DATABASE_URL` en `.env.local` con el mismo puerto). El puerto interno del container sigue siendo 5432 siempre, así que pgAdmin —que se conecta por la red de Docker— no necesita cambios.

Para bajar todo:

```bash
docker compose down          # baja los containers, preserva los datos
docker compose down -v       # baja todo y borra el volumen (reset total)
```

La `DATABASE_URL` en `.env.local` ya está configurada para esta instancia:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pdep_classroom
```

El repo ya trae las migraciones commiteadas (`migrations/`) — para un clone nuevo alcanza con
aplicarlas:

```bash
pnpm db:migration:up       # aplica las migraciones pendientes
```

`migration:up` aplica los archivos que todavía no figuran en la tabla `mikro_orm_migrations`. **No
hace falta correr `migration:create` en un setup nuevo** — ese comando diffea las entidades contra
el estado actual de la DB, así que corrido contra una base vacía genera una migración espuria con
todo el schema de una. Es sólo para cuando vos mismo estás agregando un cambio de schema nuevo (ver
"Agregar una migración nueva" abajo).

**Agregar una migración nueva:** las migraciones de este proyecto están escritas a mano (SQL
explícito, backfills, guards de concurrencia) en vez de generadas por diff — mirá cualquier archivo
reciente en `migrations/` como referencia de estilo. Después de escribir la migración y correr
`pnpm db:migration:up` localmente, hay que **regenerar y commitear el snapshot**
(`migrations/.snapshot-pdep_classroom.json`) en el mismo commit — MikroORM lo usa para calcular
diffs futuros, y si queda desactualizado nadie se entera hasta la próxima migración (pasó una vez
real: el snapshot quedó dos PRs sin actualizarse). Verificalo con:

```bash
pnpm test:migrations   # corre las migraciones contra Postgres real (requiere MIGRATION_TEST_DATABASE_URL)
```

y con las aserciones de `src/infrastructure/migrations.test.ts`, que leen el snapshot commiteado.

#### 5.2 Producción (Neon + Vercel)

**Neon** es el proveedor de PostgreSQL recomendado para Vercel. Tiene integración nativa, free tier generoso y maneja bien las conexiones serverless.

**Crear la base en Neon:**

1. Ir a https://neon.tech → **New Project**
2. Completar:
   | Campo | Valor |
   |---|---|
   | Project name | `pdep-classroom` |
   | Database name | `pdep_classroom` |
   | Region | elegir la más cercana (ej: `aws-us-east-1`) |
3. Una vez creado, copiar la connection string desde **Dashboard → Connection Details**
   - Seleccionar **Pooled connection** para producción (usa PgBouncer)
   - Tiene la forma: `postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/pdep_classroom?sslmode=require`

**Conectar con Vercel:**

```bash
vercel env add DATABASE_URL
# Pegar la connection string de Neon cuando lo pida
# Seleccionar los entornos: Production, Preview
```

O desde el dashboard de Vercel: **Settings → Environment Variables → Add**.

**Migraciones en producción:**

Las migraciones están separadas del build: `vercel-build` sólo compila. Esto evita que dos builds
de Vercel intenten modificar el schema en paralelo. Antes de promover una versión que requiere un
schema nuevo hay que ejecutar manualmente el workflow **Migrate production database** de GitHub
Actions, configurado con el secret `DATABASE_URL` en el environment protegido `Production`. Ese
secret es independiente de la variable homónima de Vercel: hay que configurar ambos.

```bash
# Alternativa equivalente desde una terminal autorizada
DATABASE_URL="postgresql://..." pnpm release:migrate
```

La secuencia de release es: preparar el PR `development → master`, pausar el auto-deploy, crear un
restore point, mergear, migrar el commit resultante, promover exactamente ese commit y hacer el
smoke test. El detalle y el procedimiento de recuperación están en
[`docs/production-runbook.md`](docs/production-runbook.md).

#### Scripts de DB disponibles

```bash
pnpm db:migration:create   # Autoría de una migración NUEVA (diffea contra el estado actual de la DB)
pnpm db:migration:up       # Aplicar migraciones pendientes — esto es lo que corrés casi siempre
pnpm db:migration:down     # Revertir la última migración
pnpm db:schema:fresh       # DROP y recrear todo el schema desde las entidades (solo dev, destructivo)
pnpm test:migrations       # Correr las migraciones + invariantes contra Postgres real
```

### 6. Configurar admins

En `ADMIN_GITHUB_USERNAMES` poné los usernames de GitHub de los docentes, separados por coma:

```
ADMIN_GITHUB_USERNAMES=juancontardo,fdodino,nsicolo,dsquivel
```

### 7. Generar secret de NextAuth

```bash
npx auth secret
```

Copiar el valor generado a `NEXTAUTH_SECRET`.

### 8. Correr en local

```bash
pnpm dev
```

Abrir http://localhost:3000.

#### 8.1 Login sin pasar por GitHub (opcional)

Para no depender del OAuth real de GitHub en cada prueba local, hay un login
de desarrollo: entrar tipeando cualquier username. Requiere **dos**
condiciones a la vez (a propósito, para que no se filtre a producción por
accidente):

```bash
# .env.local
ENABLE_DEV_LOGIN=true
```

La otra condición (`NODE_ENV=development`) ya la pone `next dev` solo. Con
ambas, `/login` muestra un panel extra: un botón directo por cada username
en `ADMIN_GITHUB_USERNAMES` (entra como docente) y un campo de texto libre
para entrar como cualquier alumno.

### 9. Deploy a Vercel

#### 9.1 Primer deploy

```bash
pnpm i -g vercel
vercel          # vincula el proyecto y crea un preview
```

No ejecutar `vercel --prod` hasta haber configurado las variables, aplicado las migraciones y
completado los controles de las secciones siguientes. En este repositorio `development` es la rama
de integración y `master` es la rama de producción; cada release se prepara con un PR
`development → master`.

#### 9.2 Configurar variables de entorno

Cada variable se agrega con `vercel env add`. El CLI pregunta el valor y en qué entornos aplicarlo (Production / Preview / Development).

En producción todas las integraciones listadas abajo son obligatorias. Cuando
`VERCEL_ENV=production`, [`src/instrumentation.ts`](src/instrumentation.ts) cancela el arranque si
falta alguna variable requerida o si existe `ENABLE_DEV_LOGIN`.

```bash
# Base de datos (Neon — connection string pooled)
vercel env add DATABASE_URL

# GitHub OAuth App — sin esto el login con GitHub no funciona
vercel env add GITHUB_CLIENT_ID
vercel env add GITHUB_CLIENT_SECRET

# NextAuth
vercel env add NEXTAUTH_SECRET               # npx auth secret

# Admins — sin esto, nadie entra como docente
vercel env add ADMIN_GITHUB_USERNAMES        # usernames separados por coma
```

**Acceso a GitHub para crear/borrar repos** — en producción se exige la GitHub App. El PAT queda
sólo como fallback de desarrollo local:

```bash
# GitHub App instalada en la org
vercel env add GITHUB_APP_ID
vercel env add GITHUB_APP_PRIVATE_KEY        # base64 del .pem, sin saltos de línea
vercel env add GITHUB_APP_INSTALLATION_ID

vercel env add GITHUB_ORG                    # opcional, default "pdep-mn-utn" si se omite
```

**Google Sheets** — requerida en producción para el registro/sincronización de alumnos:

```bash
vercel env add GOOGLE_SERVICE_ACCOUNT_KEY    # base64 del JSON
```

**Canal de comunicación: Google Groups** — opcional. Sin estas dos variables el canal simplemente no
existe (ver sección "Canales de comunicación" más abajo); si seteás sólo una de las dos, la
validación de arranque rompe el boot (misconfig, no falta de config):

```bash
vercel env add GOOGLE_GROUP_EMAIL
vercel env add GOOGLE_WORKSPACE_ADMIN_EMAIL
```

**Webhook de GitHub** — obligatorio en producción y debe coincidir con el secret configurado en la
GitHub App. Admite varios valores separados por coma durante una rotación:

```bash
vercel env add GITHUB_WEBHOOK_SECRET
```

**Nunca en producción** — sólo para local, y sólo además de `NODE_ENV=development` (que `next dev`
ya pone solo):

```bash
# NO correr esto contra Vercel — ver §8.1 (login de desarrollo)
# ENABLE_DEV_LOGIN=true
```

Para verificar qué está cargado:

```bash
vercel env ls
```

Para actualizar un valor existente:

```bash
vercel env rm NOMBRE_VARIABLE
vercel env add NOMBRE_VARIABLE
```

#### 9.3 Migraciones en producción

El workflow sólo puede despacharse cuando existe en la rama por defecto (`master`). Para una
promoción con migraciones, seguir este orden:

1. Abrir el PR `development → master` y confirmar CI verde.
2. Pausar los deploys automáticos de Vercel con `vercel git disconnect`. Esto corta producción y
   también los previews; en este repo los previews ya se cancelan por el `ignoreCommand` de
   `vercel.json`, así que en la práctica no se pierde nada.
3. Crear un restore point en Neon y anotar qué commit se va a promover.
4. Configurar `DATABASE_URL` en GitHub → **Settings → Environments → Production**. Verificar con
   `gh secret list --env production` que existe: un secret con valor vacío también pasa ese
   listado, pero hace fallar el workflow en el step "Verificar secret DATABASE_URL".
5. Mergear el PR y anotar el SHA resultante de `master`.
6. Ejecutar **Actions → Migrate production database → Run workflow** sobre `master` y esperar el
   resultado exitoso.
7. Promover o redesplegar en Vercel exactamente el SHA migrado; no otro commit más nuevo.
8. Consultar `GET /api/health` en el dominio de producción; debe responder `200` y
   `{"ok":true,"database":"ok",...}`.
9. Recién entonces reactivar el auto-deploy con `vercel git connect` y verificar con
   `vercel project inspect pdep-classroom` (repo conectado) y `vercel inspect
   https://tu-dominio.vercel.app` (debe listar el SHA migrado). El canary y el resto de las
   verificaciones siguen en `docs/production-runbook.md`.

Desde una terminal autenticada, los pasos 6 y el seguimiento pueden iniciarse con:

```bash
gh workflow run migrate-production.yml --ref master
gh run list --workflow migrate-production.yml --limit 1
gh run watch RUN_ID --exit-status
```

El environment `Production` puede requerir aprobación docente. Como alternativa de emergencia se
puede ejecutar el mismo comando desde una terminal autorizada, aunque el workflow deja una mejor
auditoría:

```bash
DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/pdep_classroom?sslmode=require" \
  pnpm release:migrate
```

No reactivar el auto-deploy hasta que la migración y el primer smoke test hayan terminado (pasos
8 y 9). El build no toca la base y no reemplaza este procedimiento.

#### 9.4 Actualizar URLs de callback

Después del deploy, actualizar la GitHub OAuth App con la URL real de Vercel:

- Homepage URL: `https://tu-dominio.vercel.app`
- Callback URL: `https://tu-dominio.vercel.app/api/auth/callback/github`

#### 9.5 Crear la primera comisión

Una vez en producción, entrar como admin y crear al menos una comisión activa en `/admin/comisiones` con el ID de la planilla de Google Sheets. Sin una comisión activa, las páginas de alumnos, registro y perfil no funcionan.

#### 9.6 Smoke test y bootstrap de una cursada existente

Después de promover el deploy:

1. Consultar `GET /api/health`: debe responder HTTP 200 con `ok: true`, `database: "ok"` y el SHA
   desplegado en `version`.
2. Entrar como docente al tablero **Diagnóstico** (`/admin/operaciones`): base, GitHub App, Sheets y
   cada canal de comunicación configurado deben estar en verde. Un canal sin configurar aparece
   como "Revisar" — es esperable si todavía no armaste su infraestructura, no bloquea el deploy.
   Revisar cualquier delivery fallido antes de habilitar alumnos reales.
3. Hacer un canary con datos descartables: registrar un alumno, publicar y aceptar un TP individual
   y formar un grupo de dos alumnos para aceptar uno grupal. Confirmar repos, colaboradores,
   suscripción a los canales configurados, webhook y CI.
4. Si la materia ya empezó, sincronizar el padrón desde Sheets y procesar las suscripciones a
   canales de comunicación por lotes hasta que no queden pendientes.
5. Si ya existían grupos en la planilla, ejecutar **Importar grupos desde Sheets** una sola vez por
   comisión. La operación usa un lease renovable para impedir dos importaciones concurrentes; al
   completarse, Classroom pasa a ser la única fuente de verdad de grupos.

No importar grupos reales antes de que el canary termine correctamente.

## Cómo funciona

### Para docentes

1. Crear o seleccionar la comisión activa y sincronizar el padrón inicial.
2. Crear un assignment en borrador: elegir template, paradigma y tipo individual o grupal. El tipo
   es el discriminador persistido y no se puede convertir después de crear el assignment.
3. Revisar su configuración y publicarlo para habilitar acciones de alumnos.
4. Compartir el link de la app; los alumnos registrados se suscriben a los canales de comunicación
   que estén configurados (ej. Google Groups).
5. Al finalizar, archivarlo para impedir nuevas aceptaciones y conservar sus entregas como
   histórico.

### Para alumnos

1. Entrar con GitHub → ver dashboard con TPs pendientes
2. Para TPs grupales: crear un grupo o unirse a uno existente en `/assignments/[id]/grupo`. Se
   puede salir o cambiarse de grupo mientras las inscripciones sigan abiertas y el grupo no tenga
   entrega todavía; el docente puede administrar integrantes manualmente en cualquier momento desde
   el panel admin.
3. Clickear **Aceptar** → se crea el repo en `pdep-mn-utn` con el alumno (o todo el grupo, si es
   grupal) como collaborator. Si GitHub falla después de iniciar la creación, la entrega queda
   visible y se puede reintentar sin crear repos duplicados.

### Repos creados

Los repos se crean con la convención:
- Individual: `{slug}-{github-username}` → `kata-funcional-juangarcia`
- Grupal: `{slug}-{nombre-grupo-normalizado}` → `tp-funcional-los-lambdas`

El nombre grupal se normaliza a minúsculas, sin acentos y con guiones en
lugar de espacios o caracteres especiales. Por ejemplo, `Los Lógicos ++`
genera `los-logicos`. Dos nombres del mismo assignment que generen el mismo
identificador se consideran duplicados.

GitHub limita el nombre de un repo a 100 caracteres — un `slug` de assignment largo combinado con
un username o nombre de grupo largo puede superarlo. En ese caso, aceptar el TP (o crear/unirse al
grupo) falla con un error explícito en vez de crear un repo con el nombre truncado.

Cada repo nuevo incluye un marcador estable de la entrega y guarda el `repoGithubId`. Eso permite
reconciliar reintentos aunque cambie el título del TP, y evita adoptar silenciosamente un repo ajeno
que tenga el mismo nombre.

### Ciclo de vida y mantenimiento

- **Borrador:** editable y eliminable sólo mientras no tenga entregas ni grupos. Los campos
  estructurales se sellan al publicar; el tipo queda fijo desde la creación por ser el discriminador
  STI de la entidad.
- **Publicado:** visible y aceptable por alumnos. Puede archivarse, pero no eliminarse como atajo.
- **Archivado:** conserva el acceso a repos ya creados e impide nuevas acciones de alumnos. Un
  docente todavía puede diagnosticar o reintentar una provisión fallida.
- El borrado masivo de repos sólo está disponible para assignments archivados, muestra primero la
  lista afectada y exige escribir el slug exacto. La operación es irreversible y deja auditoría.
- Una comisión sólo puede eliminarse si está inactiva y no tiene alumnos ni assignments asociados.

### Diagnóstico y recuperación

`/admin/operaciones` concentra el diagnóstico de base de datos, GitHub App, Google Sheets, Google
Groups y webhooks. También muestra deliveries recientes y permite reprocesar los que quedaron
recibidos o fallidos. Los errores inesperados sanitizados se consultan en `/admin/errores`, con un
badge para pendientes.

El aprovisionamiento de repositorios persiste estado, cantidad de intentos y último error. Una
entrega fallida puede retomarse; antes de asociar un repo preexistente se valida su id o el marcador
estable y la ventana temporal de creación. Las colisiones requieren intervención docente.

## CI en Classroom

Classroom puede mostrar el estado combinado de CI del último commit de cada repo de entrega, con
link al detalle en GitHub, y ofrecer una reejecución administrativa. El estado se cachea en la
propia `Entrega` (sin historial completo). Con el webhook de `check_suite` configurado ([issue #60](https://github.com/Juancete/Pdep-Classroom/issues/60),
ver [Webhooks de GitHub](#webhooks-de-github)), la actualización es push: en cuanto termina una
ejecución de CI en GitHub, la vista queda al día sin que nadie tenga que abrir nada. El polling
sigue existiendo como fallback — el botón "Actualizar CI" fuerza una consulta manual para cuando el
webhook no llegó (App sin webhook configurado, entorno local sin túnel, un delivery perdido).

### Cualquier workflow cuenta, no hay nombre de archivo obligatorio

No hace falta un `.yml` con nombre fijo. Classroom lee el **estado combinado de los checks del
último commit del branch por defecto** — el mismo mecanismo que usa un badge de CI en un README, o
la vista de checks de un PR en GitHub — así que **cualquier workflow en
`.github/workflows/*.yml` que declare jobs cuenta**, sin importar cómo se llame. Un template puede
tener uno solo (`test.yml`, `ci.yml`, lo que sea) o varios (por ejemplo un workflow de lint y otro
de tests): si hay más de uno, el estado combinado ya refleja si alguno falló — no hace falta
elegir cuál mostrar.

```yaml
# .github/workflows/ci.yml — el nombre de archivo es libre
name: CI
on: [push, workflow_dispatch]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # ... setup + comando de tests del paradigma correspondiente
      # el job debe terminar con exit code != 0 si los tests fallan
```

Como los repos se crean con `repos.createUsingTemplate`, si el template tiene workflows el repo
generado los hereda solo — no hace falta ningún paso extra al aceptar el TP.

> Los repos se crean con el token de instalación de la GitHub App, y GitHub no dispara workflows
> para pushes hechos por una GitHub App salvo que el workflow declare `workflow_dispatch` o el
> evento sea uno explícitamente soportado — en la práctica, el primer push real del alumno es el
> que dispara la primera ejecución, no el commit inicial del template.

### Mapeo de estado

Se agregan todos los check runs del commit con el criterio "peor estado gana" (igual que la vista
de checks combinados de GitHub):

| Checks del commit | Resultado en Classroom |
|---|---|
| ningún check run | Sin CI |
| algún check con `status` distinto de `completed` | Pendiente |
| alguno con `conclusion: failure` | Failing |
| si no, alguno con `conclusion: action_required` o `null` | Error de infraestructura |
| si no, alguno con `conclusion: cancelled` / `timed_out` | Cancelado |
| resto (`success` / `neutral` / `skipped`) | Passing |

Un repo sin ningún check configurado no rompe nada más de la vista — se degrada a un badge gris
"Sin CI" (`src/application/sincronizarCI.ts`, `src/domain/entities/ResultadoCI.ts`).

### Frescura y reejecución

- La sincronización (`POST /api/assignments/[id]/ci`) respeta una ventana de 60 segundos por
  entrega para no martillar la API de GitHub. El panel admin **no** sincroniza automáticamente al
  abrir la vista (issue #60: con el webhook andando, no hace falta) — el botón "Actualizar CI" la
  fuerza a pedido.
- La reejecución (`POST /api/assignments/[id]/ci/rerun`, sólo admin) pide el `rerequest` de cada
  check suite conocido del commit (`POST /check-suites/{check_suite_id}/rerequest`) — si hay varios
  workflows, se reejecutan todos. Si nunca corrió ningún check, el botón queda deshabilitado — no
  hay nada que reejecutar.

### Resultado automático, no calificación

El badge siempre se muestra junto a la leyenda "Resultado automático — no es la nota final", tanto
en el panel admin como en el dashboard del alumno. No hay ninguna opción para presentarlo como
calificación definitiva.

## Webhooks de GitHub

Classroom recibe eventos push de GitHub en `POST /api/webhooks/github` (issue #60) para mantener
información operativa al día sin depender exclusivamente de que alguien abra una pantalla. Cada
delivery se autentica, deduplica y persiste dentro del mismo request; el efecto (que para
`check_suite` implica llamar de nuevo a la API de GitHub) se aplica después de responder — no hay
cola ni cron de fondo, el proyecto no tiene infraestructura de ese tipo.

| Evento | Efecto en Classroom |
|---|---|
| `check_suite` (`requested`, `rerequested`, `completed`) | Resincroniza el estado de CI de la entrega (ver [CI en Classroom](#ci-en-classroom)) |
| `push` | Actualiza el último push conocido del repo (fecha, commit, autor) |
| `repository` (`deleted`, `renamed`) | Marca el repo como borrado, o reescribe su nombre/URL |
| `member` (`added`, `removed`) | Reconcilia la lista de colaboradores contra el estado real de GitHub — sólo agrega si además es un alumno conocido |

Cualquier otro evento o `action` que GitHub mande se ignora de forma segura (no rompe, no se
persiste como error).

GitHub no garantiza el orden de entrega de los webhooks, así que ningún handler confía ciegamente
en el payload de un único evento:

- `push` guarda `repository.pushed_at` (lo que GitHub actualiza en cada push) como fecha de
  actividad, no la hora en que Classroom procesó el evento ni `head_commit.timestamp` (fecha de
  autoría del commit, no de cuándo se pusheó) — así un push viejo que llega después de uno nuevo no
  puede pisar el más reciente. Sin un `pushed_at` interpretable no hay señal de orden confiable, así
  que el evento se rechaza (el delivery queda `fallido`, reprocesable) en vez de aplicarse con una
  fecha que no significa lo que dice significar.
- `member` no aplica el `added`/`removed` del payload tal cual: consulta "¿es colaborador ahora
  mismo?" contra la API de GitHub y reconcilia el array de colaboradores a esa respuesta — mismo
  criterio que `check_suite` (invalidar y refrescar, no confiar en el delta). Así, un `removed` que
  llegó después de un `added` más reciente (o viceversa) converge al estado real sin importar el
  orden de llegada.
- `repository` (`deleted`/`renamed`) resuelve la entrega dueña por `repository.id` primero — a
  diferencia del nombre, no cambia con un rename — y recién si no hay match cae al lookup por
  nombre. Sin esto, dos renames seguidos entregados fuera de orden (ej. B→C antes que A→B) pueden
  perder el primero: buscar por el nombre viejo ("B") no encuentra nada porque la entrega todavía
  dice "A" en la DB. Por eso `repoGithubId` se captura al crear la entrega (desde la respuesta de
  `createUsingTemplate`, no hace falta esperar a un webhook) — depender sólo del "self-heal" del
  primer evento deja una ventana real: si el doble rename ocurre antes de que llegue cualquier otro
  webhook, todavía no hay id guardado en absoluto. Para entregas viejas (creadas antes de esto) el
  self-heal sigue aplicando como red de respaldo. El fallback por nombre además rechaza una entrega
  cuyo `repoGithubId` ya está seteado a un id *distinto* del que trae el evento — un repo borrado y
  recreado con el mismo nombre es un repo distinto, sus eventos no pueden aplicarse sobre la entrega
  vieja sólo porque el nombre coincide. La escritura en sí se guarda con un guard contra
  `repository.updated_at`: un `deleted`/`renamed` estrictamente más viejo que el último ya aplicado
  no lo pisa — la comparación es estricta (no rechaza empates) porque el timestamp viaja en
  segundos, y un rename seguido de un delete del mismo repo dentro del mismo segundo comparten
  timestamp; con un guard no estricto, el delete "empatado" se rechazaría por viejo y el repo
  quedaría marcado como activo pese a haberse borrado.

### Endpoint público a propósito

`/api/webhooks/github` **no** requiere sesión — GitHub no manda cookies. No está en el `matcher` de
`src/proxy.ts` (que sólo cubre `/api/assignments`, `/api/registro`, `/api/perfil` y las páginas
protegidas) y no hay que agregarlo ahí: si estuviera, la falta de sesión produciría un redirect 307
a `/login`, que GitHub registraría como delivery fallido en vez de un 401 limpio. La autenticación
real es la firma HMAC del header `X-Hub-Signature-256`, verificada contra `GITHUB_WEBHOOK_SECRET`.

### Respuesta rápida, procesamiento diferido

GitHub espera una respuesta 2xx dentro de 10 segundos — si se excede, considera el delivery
fallido. `check_suite` implica dos llamadas a la API de GitHub (`repos.get` + `checks.listForRef`,
vía `getEstadoCI`) más la escritura del resultado; bajo latencia de GitHub o carga, eso puede
acercarse al límite. Por eso el endpoint no espera a que termine todo eso antes de responder: valida
la firma, deduplica y reclama el delivery (que es sólo una escritura a la DB), y recién ahí responde
`202`. El efecto real corre después, dentro de la misma invocación, con
[`after()`](https://nextjs.org/docs/app/api-reference/functions/after) de Next.js — sin sumar cola
ni cron nuevos.

La contrapartida: como GitHub ya recibió un `202` antes de que el procesamiento termine, **no**
reintenta automáticamente si ese procesamiento falla después — eso sólo pasa ante un timeout real
(la respuesta tardando más de 10s) o un error antes de reclamar el delivery. Un fallo post-respuesta
queda registrado como `fallido` en `github_webhook_delivery`, visible para un admin (tabla + logs),
pero **no** aparece como delivery rojo en la UI de GitHub. El endpoint de reproceso
(`POST /api/webhooks/github/reprocesar`, ver más abajo) es la vía de recuperación para esos casos,
no el "Redeliver" automático de GitHub.

### Deduplicación, reclamo atómico y estados

Cada delivery se identifica por su `X-GitHub-Delivery` (único por entrega de GitHub, incluida una
reentrega manual desde "Redeliver" — GitHub conserva el mismo id). Se inserta en la tabla
`github_webhook_delivery` con un índice único sobre ese id.

Un choque contra ese índice **no** significa automáticamente "ya se manejó, no hacer nada": un
"Redeliver" llega con el mismo `X-GitHub-Delivery` que el intento original, así que si ese intento
había quedado `fallido` (o abandonado a mitad de camino), el redelivery es la oportunidad real de
reprocesarlo. Por eso, antes de aplicar cualquier efecto, la fila se **reclama atómicamente** con un
único `UPDATE ... WHERE estado IN (...) RETURNING ...`: sólo transiciona (y devuelve la fila) si
sigue en un estado reprocesable en ese instante. Un `SELECT` seguido de un `UPDATE` separado no da
esta garantía — dos llamadas concurrentes (un redelivery cruzándose con un reproceso admin, o dos
reprocesos admin en simultáneo) podrían ver la misma fila como candidata y reaplicar el efecto dos
veces; con el reclamo atómico, sólo una de las dos gana.

Cada fila pasa por uno de cinco estados:

| Estado | Significa |
|---|---|
| `recibido` | Persistido, todavía sin reclamar |
| `procesando` | Reclamado — hay un intento en vuelo aplicando el efecto |
| `procesado` | El efecto se aplicó correctamente |
| `ignorado` | Evento/acción sin efecto en Classroom, o repo sin entrega asociada |
| `fallido` | El procesamiento tiró una excepción (timeout de GitHub, DB caída, etc.) |

`procesado` e `ignorado` limpian el payload guardado (ya no hace falta — acota el crecimiento de la
tabla y la retención de PII, un payload de `push` trae emails de committers). `recibido` y `fallido`
lo conservan, porque son los estados reprocesables — y también un `procesando` que quedó huérfano
(la lambda que lo reclamó murió a mitad de camino sin cerrar la fila): pasados 2 minutos sin
cerrarse, vuelve a ofrecerse para reclamo igual que `fallido`.

Ese vencimiento se mide contra `reclamado_en` (cuándo se ganó el último reclamo), no contra
`recibido_en` (cuándo se insertó la fila la primera vez): un delivery `fallido` puede tener
`recibido_en` de hace horas — si el lease se midiera contra esa fecha, un `procesando` recién
reclamado quedaría "vencido" desde el instante cero y disponible para un segundo reclamo de
inmediato, rompiendo la exclusión mutua justo en el caso que el reproceso existe para resolver.

### Reintentos

Un delivery `fallido` (o `recibido`/`procesando` abandonado) se puede reprocesar desde la pantalla
admin **Diagnóstico** o con
`POST /api/webhooks/github/reprocesar` (sólo admin), con `{ "deliveryId": "..." }` para uno puntual
o sin body para tomar hasta 50 candidatos en orden de llegada — cada uno se reclama atómicamente
antes de procesarse. El schema es estricto: un typo en la clave (`deliverId` en vez de
`deliveryId`) o un JSON malformado devuelven 400 en vez de interpretarse silenciosamente como "sin
filtro" y disparar el lote completo por error. El botón "Redeliver" de la propia GitHub App
(`Settings → GitHub Apps → PdeP Classroom → Advanced`) también funciona como vía de reproceso — el
redelivery llega con el mismo `X-GitHub-Delivery` y el reclamo lo recupera igual — pero, a
diferencia de un timeout real, GitHub no lo dispara solo ante un fallo de procesamiento posterior a
la respuesta (ver arriba): hay que ir a buscarlo, ya sea desde la propia UI de GitHub o desde el
endpoint de reproceso. Ambos caminos son atómicos, así que da lo mismo cuál se use, incluso si se
cruzan entre sí.

### Probar en local

GitHub necesita una URL pública para entregar webhooks. Con `pnpm dev` corriendo, exponer
`localhost:3000` con un túnel (`gh webhook forward --repo pdep-mn-utn/<algún-repo> --url http://localhost:3000/api/webhooks/github`,
o `cloudflared`/`ngrok`) y usar esa URL como "Webhook URL" de la GitHub App mientras se prueba.

### Rotación del secreto

`GITHUB_WEBHOOK_SECRET` admite una lista separada por comas para rotar sin perder deliveries en la
transición (GitHub sólo guarda un secreto a la vez):

1. Agregar el secreto nuevo a la env var, sin sacar el viejo: `GITHUB_WEBHOOK_SECRET=viejo,nuevo`.
2. Cambiar el secreto en GitHub (`Settings → GitHub Apps → PdeP Classroom → Webhook`) al valor nuevo.
3. Una vez confirmado que los deliveries llegan bien, sacar el viejo de la env var.

## Estructura del proyecto

```
docker-compose.yml                             # Postgres + pgAdmin para desarrollo local
mikro-orm.config.ts                            # Config de MikroORM (CLI + runtime)
migrations/                                    # Migraciones commiteadas + snapshot del schema
tests/migrations/                              # Tests de integración contra Postgres real
src/
├── instrumentation.ts                         # Validaciones de arranque (ej. misconfig de un canal)
├── proxy.ts                                   # Auth proxy (protege rutas /admin, /dashboard, etc.)
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts        # OAuth flow (GitHub)
│   │   ├── registro/route.ts                  # POST registro alumno → DB + Sheets
│   │   ├── perfil/route.ts                    # PATCH actualizar datos alumno
│   │   ├── assignments/
│   │   │   ├── route.ts                       # GET assignments de la comisión activa
│   │   │   └── [id]/
│   │   │       ├── route.ts                   # GET / DELETE assignment
│   │   │       ├── accept/route.ts            # POST crear repo en GitHub
│   │   │       ├── repos/route.ts             # GET/DELETE repos activos del assignment
│   │   │       ├── estado/route.ts            # PATCH ciclo de vida (borrador/publicado/archivado)
│   │   │       ├── inscripciones/route.ts     # PATCH abrir/cerrar inscripciones a grupos
│   │   │       ├── ci/route.ts                 # POST sincronizar estado de CI
│   │   │       ├── ci/rerun/route.ts           # POST reejecutar CI (admin)
│   │   │       └── grupos/                    # POST crear grupo; join, mover y quitar integrantes
│   │   ├── comisiones/[id]/route.ts           # PATCH comisión
│   │   └── webhooks/github/
│   │       ├── route.ts                       # POST recibir webhook de GitHub (público, firma HMAC)
│   │       └── reprocesar/route.ts            # POST reintentar deliveries fallidos (admin)
│   ├── admin/
│   │   ├── assignments/
│   │   │   ├── page.tsx                       # Listar assignments
│   │   │   ├── new/page.tsx                   # Crear assignment
│   │   │   ├── [id]/page.tsx                  # Detalle: entregas, estadísticas, ciclo de vida
│   │   │   │   ├── entregas-table.tsx         # Tabla de entregas con filtro (client)
│   │   │   │   ├── ci-sync-button.tsx         # Sincronizar CI del assignment (client)
│   │   │   │   ├── ci-rerun-button.tsx        # Reejecutar CI de una entrega (client)
│   │   │   │   ├── grupos-panel.tsx           # Administrar integrantes de grupos (client)
│   │   │   │   └── historial-membresias.tsx   # Auditoría de altas/bajas/cambios de grupo
│   │   │   ├── [id]/edit/page.tsx             # Editar assignment
│   │   │   ├── actions.ts                     # Server actions CRUD
│   │   │   ├── assignment-form.tsx            # Form compartido crear/editar
│   │   │   ├── delete-button.tsx              # Eliminar assignment
│   │   │   └── delete-repos-button.tsx        # Eliminar repos del assignment en GitHub
│   │   ├── comisiones/
│   │   │   ├── page.tsx                       # Listar comisiones
│   │   │   ├── new/page.tsx                   # Crear comisión
│   │   │   ├── [id]/edit/page.tsx             # Editar comisión (con config de columnas)
│   │   │   ├── actions.ts                     # Server actions CRUD + sincronizar alumnos/grupos
│   │   │   ├── comision-form.tsx              # Form compartido crear/editar
│   │   │   ├── delete-button.tsx              # Eliminar comisión
│   │   │   └── sync-button.tsx                # Sincronizar alumnos desde Sheets → DB
│   │   ├── alumnos/page.tsx                   # Ver alumnos (desde comisión activa)
│   │   ├── grupos/page.tsx                    # Ver grupos (DB)
│   │   ├── delete-button.tsx                  # Componente genérico de eliminar
│   │   └── ui.tsx                             # Componentes UI compartidos del panel admin
│   ├── assignments/[id]/grupo/                # UI del alumno: crear/unirse/salir/cambiar de grupo
│   │   ├── page.tsx
│   │   ├── grupo-selector.tsx                 # Elegir o crear grupo (client)
│   │   ├── mi-grupo.tsx                       # Ver el grupo actual y sus integrantes
│   │   └── acciones-de-membresia.tsx          # Salir / cambiarse de grupo (client)
│   ├── dashboard/
│   │   ├── page.tsx                           # Dashboard alumno: TPs pendientes y estado
│   │   ├── accept-button.tsx                  # Botón aceptar TP (client)
│   │   └── ci-refresh-button.tsx              # Actualizar el CI de la propia entrega (client)
│   ├── registro/page.tsx                      # Registro de alumno (con AlumnoForm)
│   ├── perfil/page.tsx                        # Editar perfil alumno (con AlumnoForm)
│   ├── login/page.tsx                         # Página de login (GitHub + login de desarrollo opcional)
│   ├── error.tsx                              # Boundary de error global
│   ├── layout.tsx                             # Layout raíz con nav y sesión
│   └── page.tsx                               # Landing
├── components/
│   ├── AlumnoForm.tsx                         # Form reutilizable registro/edición alumno
│   ├── CIBadge.tsx                            # Badge de resultado de CI (server)
│   ├── ci-ui.tsx                              # Tabla de presentación (etiqueta/color/ícono) por resultado
│   ├── PageSkeleton.tsx                       # Skeleton de carga genérico
│   └── layout/
│       ├── nav.tsx                            # Barra de navegación (server component)
│       └── logout-button.tsx                  # Botón de logout (client)
├── hooks/
│   └── useApiCall.ts                          # Hook genérico para llamadas a la API REST
├── domain/
│   └── entities/                              # Entidades MikroORM + lógica de dominio
│       ├── Assignment.ts                      # Base abstracta
│       ├── IndividualAssignment.ts
│       ├── GrupalAssignment.ts
│       ├── EstadoAssignment.ts                # Ciclo de vida (borrador/publicado/archivado) como Strategy
│       ├── ResultadoCI.ts                     # Estado combinado de CI del último commit, como Strategy
│       ├── RolDeUsuario.ts                    # Docente/alumno como Strategy (reemplaza un booleano isAdmin)
│       ├── Comision.ts                        # Incluye columnConfig para la planilla
│       ├── Entrega.ts
│       ├── Alumno.ts
│       ├── SuscripcionAlumno.ts               # Estado de suscripción de un alumno a un canal (1 fila por canal)
│       ├── Grupo.ts
│       ├── CambioDeMembresia.ts               # Auditoría de altas/bajas/cambios de integrantes
│       ├── RepoDeletionAttempt.ts             # Auditoría de borrado de repos
│       ├── EstadoDelivery.ts                  # Estado de un delivery de webhook, como Strategy
│       └── GithubWebhookDelivery.ts           # Auditoría de deliveries de webhook (dedup por delivery id)
├── application/                                # Casos de uso — acá vive la lógica de negocio
│   ├── aceptarAssignment.ts                   # Aceptar un TP: crea entrega + repo
│   ├── assignmentAuthorization.ts             # Quién puede ver/operar sobre un assignment
│   ├── alumnoRegistro.ts                      # Alta de alumno (DB primero, después Sheets)
│   ├── importarAlumnosDeComision.ts           # Sheets → DB, bulk por comisión
│   ├── grupoSync.ts                           # Sheets → DB, membresía de grupos (sólo aditivo)
│   ├── intentarSincronizarGrupos.ts           # Wrapper con retry/flag de falla de grupoSync
│   ├── estadoDeSincronizacion.ts              # Combina asuntos pendientes (alumno + canales) en un mensaje
│   ├── hooksPostConfirmacion.ts               # Orquesta los sync post-registro
│   ├── verificarConsistenciaAlumno.ts         # Chequeos de consistencia DB↔Sheets
│   ├── borrarRepositoriosDeAssignment.ts      # Borrado auditado de repos de un assignment
│   ├── sincronizarCI.ts                       # Consulta y cachea el estado de CI
│   ├── recibirWebhookGithub.ts                # Dedup + estado de un delivery entrante, reproceso
│   └── procesarEventoGithub.ts                # Router evento → efecto sobre la entrega correspondiente
├── infrastructure/
│   ├── db.ts                                  # Singleton MikroORM (getOrm / getEM)
│   ├── auth/
│   │   ├── auth.ts / auth.config.ts / auth.events.ts   # NextAuth: config, providers (GitHub + login de desarrollo), eventos
│   │   └── session.ts                         # requireUser / requireAdmin
│   ├── repositories/                          # Acceso a datos por entidad
│   │   ├── AlumnoRepository.ts
│   │   ├── SuscripcionAlumnoRepository.ts     # Estado de suscripción por (alumno, canal)
│   │   ├── AssignmentRepository.ts
│   │   ├── ComisionRepository.ts
│   │   ├── EntregaRepository.ts
│   │   ├── GrupoRepository.ts
│   │   ├── CambioDeMembresiaRepository.ts
│   │   ├── RepoDeletionAttemptRepository.ts
│   │   └── GithubWebhookDeliveryRepository.ts
│   ├── canales/                               # Canales de comunicación como Template Method — ver más abajo
│   │   ├── CanalDeComunicacion.ts             # Clase abstracta: algoritmo de reconciliación
│   │   ├── GoogleGroupsCanal.ts               # Único canal concreto hoy
│   │   └── index.ts                           # Registro: CANALES_DE_COMUNICACION, canalesActivos()
│   ├── github.ts                              # Octokit: crear/eliminar repos, collaborators, templates
│   ├── github-errors.ts                       # Tipado y manejo de errores de la API de GitHub
│   ├── sheets.ts                              # Google Sheets: leer/escribir alumnos y grupos
│   └── googleGroups.ts                        # Cliente de la Admin SDK Directory API (alta/baja de miembros)
├── lib/                                        # Glue de Next/HTTP y utilidades puras
│   ├── proxy-authorization.ts                 # Reglas de redirect que usa proxy.ts
│   ├── api-auth.ts                            # Middleware de auth para API routes
│   ├── api-errors.ts                          # Traducción de errores de dominio a respuestas HTTP
│   ├── assignment-schema.ts                   # Schemas Zod para assignments
│   ├── rate-limit.ts                          # Rate limiting por usuario + assignment (evita double-click)
│   ├── entrega-query.ts                       # Helpers de consulta sobre entregas
│   ├── webhook-firma.ts                       # Verifica X-Hub-Signature-256 (con rotación de secreto)
│   ├── logger.ts                              # Logging estructurado (pino)
│   ├── naming.ts                              # Funciones puras: slugify, buildRepoName, enumerar
│   ├── concurrencia.ts                        # mapConConcurrenciaLimitada (pool de workers genérico)
│   └── mensaje-operativo.ts                   # Redacta secretos de un mensaje de error antes de mostrarlo/persistirlo
└── types/index.ts                             # ColumnConfig, PdepUser, tipos del dominio
```

### Regla de dependencias entre capas

- `domain/` sólo importa de `domain/`, `types/` y utilidades puras de `lib/` (`naming`, `concurrencia`).
- `application/` importa de `domain/`, `infrastructure/` y `lib/`.
- `infrastructure/` importa de `domain/` y `lib/`. Excepción documentada: `infrastructure/auth/auth.events.ts` dispara un caso de uso de `application/` al reaccionar al login.
- `lib/` importa de `domain/` y `types/`. Dos excepciones de glue HTTP: `api-auth.ts` usa `infrastructure/auth/session` y `api-errors.ts` carga perezosamente `infrastructure/repositories/ErrorLogRepository` para persistir errores.

## Tests

```bash
pnpm test              # watch mode
pnpm test:run          # una sola corrida (~110 archivos hoy)
pnpm test:coverage
pnpm lint
pnpm test:migrations   # migraciones + invariantes contra Postgres real (requiere MIGRATION_TEST_DATABASE_URL)
```

La mayoría son tests puros (dominio, servicios) o de componentes con las dependencias externas
mockeadas — `infrastructure/github.test.ts` y `infrastructure/googleGroups.test.ts`, por ejemplo, sí mockean Octokit y la
Admin SDK. Una muestra representativa:

- **lib/naming.test.ts** — `buildRepoName`, `slugify`, `extractTemplateName`
- **infrastructure/sheets.test.ts** — `parseAlumnosRows`, `parseAsignacionesGrupos`, `validateRegistro`
- **infrastructure/github-errors.test.ts** — manejo y tipado de errores de GitHub
- **lib/rate-limit.test.ts** — lógica de rate limiting
- **domain/entities/\*.test.ts** — reglas de dominio (ciclo de vida, roles, membresía de grupos)
- **application/\*.test.ts** — casos de uso (aceptar TP, registro, sync de Sheets)
- **admin/assignments/actions.test.ts** — server actions CRUD de assignments
- **admin/comisiones/actions.test.ts** — server actions CRUD de comisiones
- **api/assignments/[id]/\*.test.ts** — rutas de aceptación, estado, grupos e inscripciones
- **app/\*\*/page.test.tsx** — rendering de páginas admin y dashboard
- **tests/migrations/\*.integration.test.ts** — invariantes de concurrencia contra Postgres real

## Registro de alumnos

El flujo de registro reemplaza la carga manual en la planilla:

1. Alumno entra → login con GitHub
2. Si no está registrado en la DB → redirige a `/registro`
3. Completa: legajo (PK), apellido, nombre, email, comisión
4. El `githubUsername` se toma de la sesión (no se puede impersonar)
5. Se persiste en la **DB primero**: ahí se valida atómicamente que no haya duplicado por legajo ni
   por GitHub user (evita una carrera entre chequear contra Sheets y escribir)
6. Recién si la DB aceptó el alta, se hace un upsert del alumno en la hoja "Alumnos" de la
   spreadsheet — y si esto falla, el registro en la DB **no se revierte** (el alumno igual entra al
   dashboard; el alta en Sheets se puede reintentar después)
7. Se intenta suscribir al alumno a cada canal de comunicación configurado (opcional; ver
   "Canales de comunicación" más abajo)
8. Redirige al dashboard

La **DB es la autoridad** para la coherencia legajo↔GitHub (ahí se valida y se rechazan
duplicados); la planilla se mantiene como espejo para uso de los docentes. La sincronización de
grupos desde Sheets es una carga inicial por comisión; una vez importada, los grupos se administran
en Classroom y la DB queda como autoridad.

## Canales de comunicación

Al completarse el alta (o la edición) de un alumno, la app lo suscribe a cada **canal de
comunicación** que esté configurado — hoy, Google Groups. La idea es que el docente no tenga que
agregar a nadie a mano y el alumno reciba los avisos del curso desde el primer día.

La suscripción se modela como **Template Method** (`src/infrastructure/canales/CanalDeComunicacion.ts`): el
algoritmo de reconciliación — registrar el intento, dar de alta el destinatario actual, drenar
identidades anteriores pendientes de baja, marcar sincronizado — vive una sola vez en la clase
abstracta. Cada canal concreto sólo aporta:

- `estaConfigurado()` — si sus env vars están completas.
- `destinatarioDe(alumno)` — la identidad del alumno en ese canal (un email para Google Groups; el
  ID de una cuenta de Discord si algún día se agrega ese canal), o `null` si el alumno todavía no la
  tiene.
- `darDeAlta` / `darDeBaja` — cómo hablar con el servicio externo.

El estado de cada suscripción (pendiente/sincronizada/fallida/omitida, último error, identidades
pendientes de baja) se persiste una fila por `(alumno, canal)` en `suscripcion_alumno` —
`src/domain/entities/SuscripcionAlumno.ts`.

**Un canal sin configurar no existe para el alumno.** No hay error, no hay banner, no se acumula
estado "fallido" — `canalesActivos()` (`src/infrastructure/canales/index.ts`) lo filtra antes de tocarlo. El
docente sí lo ve: `/admin/operaciones` marca "Revisar" para cada canal apagado.

Si un alumno ya era miembro del canal (se registró, lo dieron de baja y se vuelve a registrar), se
trata como éxito idempotente — la UI no le muestra nada especial.

### Agregar un canal nuevo

1. Escribir la subclase en `src/infrastructure/canales/` con las cinco primitivas (`nombre`, `etiqueta`,
   `estaConfigurado`, `asuntoPendiente`, `destinatarioDe`, `darDeAlta`, `darDeBaja`).
2. Sumar su nombre a `NOMBRES_DE_CANAL` en `src/domain/entities/SuscripcionAlumno.ts`.
3. Registrar la instancia en `CANALES_DE_COMUNICACION` (`src/infrastructure/canales/index.ts`).
4. Migración que ensancha el `CHECK` de `suscripcion_alumno.canal` y backfillea una fila
   `pendiente` por alumno existente — molde: `Migration20260827120000_suscripcion_alumno.ts`.

Nada en `hooksPostConfirmacion.ts`, las rutas API, `AlumnoForm.tsx` ni la action de sincronización
admin necesita tocarse: todos recorren `canalesActivos()` sin ramificar por tipo.

### Google Groups — variables de entorno

| Variable | Rol |
|---|---|
| `GOOGLE_GROUP_EMAIL` | Email del grupo al que suscribimos a los alumnos. |
| `GOOGLE_WORKSPACE_ADMIN_EMAIL` | Usuario admin del Workspace que la service account impersona para poder agregar miembros al grupo. |

Ambas son **opcionales**: sin ellas, el canal de Google Groups no hace nada. Si seteás
`GOOGLE_GROUP_EMAIL` sin `GOOGLE_WORKSPACE_ADMIN_EMAIL`, el server falla al arrancar (ver
[`src/instrumentation.ts`](src/instrumentation.ts)) — preferimos romper el boot antes que dejar que
la misconfig le caiga al alumno en la cara.

**Requisito real, no obvio:** el grupo tiene que estar creado **dentro de un dominio Google
Workspace** (Google Admin Console → Directorio → Grupos, o "Groups for Business"), en el **mismo
dominio** que el admin impersonado. Un grupo de consumidor (`algo@googlegroups.com`) **no sirve**:
la Admin SDK Directory API sólo administra grupos del dominio Workspace que autorizó la
domain-wide delegation de la service account — impersonar un admin de Workspace contra un grupo de
`@googlegroups.com` falla con `401 unauthorized_client` antes de siquiera consultar el grupo. No
hace falta pagar Google Workspace para esto: **Cloud Identity Free** (gratis, hasta 50 usuarios)
incluye administración de grupos y alcanza con verificar un dominio propio.

### Setup en Google (primera vez)

Reutilizamos la service account que ya está en `GOOGLE_SERVICE_ACCOUNT_KEY` — no hace falta crear una nueva. Lo que sí hay que hacer:

1. **Habilitar la Admin SDK API** en el proyecto de Google Cloud donde vive la service account.
   - Google Cloud Console → APIs & Services → Library → "Admin SDK API" → Enable.

2. **Habilitar Domain-Wide Delegation** para la service account.
   - Google Cloud Console → IAM & Admin → Service Accounts → click en la SA → pestaña "Details" → "Show domain-wide delegation" → habilitar → copiar el **Client ID** numérico que aparece.

3. **Autorizar el scope en el Workspace**.
   - Google Admin Console (`admin.google.com`) → Security → API controls → Domain-wide Delegation → Add new.
   - Pegar el Client ID de la service account.
   - Scope: `https://www.googleapis.com/auth/admin.directory.group.member`.
   - Authorize.

4. **Crear (o elegir) el grupo dentro del Workspace** y **elegir el admin a impersonar**.
   - El grupo tiene que vivir en el dominio del Workspace — ver el requisito de arriba.
   - Cualquier usuario del Workspace con permisos para administrar el grupo (típicamente un docente con rol de admin). Ese email va en `GOOGLE_WORKSPACE_ADMIN_EMAIL`.

5. **Setear las env vars** en `.env.local` (desarrollo) y en el panel de Vercel (producción):
   ```bash
   GOOGLE_GROUP_EMAIL=pdep@tudominio.edu.ar
   GOOGLE_WORKSPACE_ADMIN_EMAIL=docente-admin@tudominio.edu.ar
   ```
   (Ambas tienen que estar en el **mismo dominio** — ver el requisito real más arriba.)

6. **Reiniciar el server**. Si la config quedó bien, el boot pasa sin ruido y el próximo registro va a suscribir al alumno.

### Troubleshooting

- **El server no arranca con error "GOOGLE_WORKSPACE_ADMIN_EMAIL no está configurada"** → setea la variable o vacía `GOOGLE_GROUP_EMAIL` para desactivar el canal.
- **`401 unauthorized_client`** → el grupo o el admin no viven en un dominio Google Workspace real (por ejemplo, el grupo es `@googlegroups.com`), o el admin impersonado no es una cuenta de ese Workspace. Ver "Requisito real" más arriba.
- **El registro completa OK pero el alumno ve el aviso ámbar** → buscá el log con el prefijo `Error al sincronizar el canal google_groups` **en Vercel → Project → Deployments → el deploy activo → Runtime Logs** (en local, aparece en la terminal donde corrés `next dev`). El log incluye `githubUsername` del alumno y el detalle devuelto por la API. Causas típicas: falta habilitar la Admin SDK API, el scope no está autorizado, o el admin impersonado no tiene permiso sobre el grupo.
- **La API devuelve 403 "Not Authorized to access this resource/api"** → típicamente el scope no está autorizado en el Workspace, o la Domain-Wide Delegation quedó con el Client ID equivocado.

## TODOs sugeridos

- [x] Migrar persistencia de JSON a PostgreSQL + MikroORM
- [x] Agregar delete/edit de assignments
- [x] Vista de entregas por assignment (quién entregó, quién no, con estadísticas)
- [x] Rate limiting en el endpoint de accept (para evitar duplicados por double-click)
- [x] Registro de alumnos desde la app (sin editar la planilla manualmente)
- [x] Edición de perfil por parte del alumno
- [x] Sincronización de alumnos desde Sheets a la DB por comisión
- [x] Configuración de columnas de la planilla por comisión
- [x] Eliminar repos de un assignment desde el panel admin
- [ ] Cuando elimina repos de un assignment dar la posibilidad de hacer un backup y descargar un zip
- [ ] Notificaciones por mail cuando se publica un assignment
- [x] Integrar CI mediante GitHub Actions en los templates — ver [CI en Classroom](#ci-en-classroom)
- [ ] Export de estado de entregas a Google Sheets (cerrar el loop con la planilla)
- [x] Suscribir a los alumnos al grupo de Google Groups automáticamente
- [x] Ciclo de vida de assignments (borrador/publicado/archivado) con auditoría de quién publicó o archivó
- [x] Auto-gestión de grupos: crear, unirse, salir y cambiarse, con administración manual desde el panel docente
- [x] Procesar eventos de GitHub mediante webhooks ([#60](https://github.com/Juancete/Pdep-Classroom/issues/60)) — ver [Webhooks de GitHub](#webhooks-de-github); cubre `check_suite`, `push`, `repository` y `member`
- [x] Observabilidad ([#18](https://github.com/Juancete/Pdep-Classroom/issues/18)) — tabla `error_log`, pantalla `/admin/errores`, badge de pendientes y diagnóstico de integraciones/webhooks en `/admin/operaciones`
- [x] Definir autoridad de grupos ([#28](https://github.com/Juancete/Pdep-Classroom/issues/28)) — Sheets se importa una sola vez por comisión y luego Classroom es la fuente de verdad

## API de GitHub — Estabilidad

La REST API v3 de GitHub tiene política de versionado conservadora. Todos los endpoints que usa esta app existen desde 2019+ y no van a cambiar:

| Endpoint | Uso |
|---|---|
| `POST /repos/{template_owner}/{template_repo}/generate` | Crear repo desde template |
| `PUT /repos/{owner}/{repo}/collaborators/{username}` | Dar acceso push al alumno |
| `GET /repos/{owner}/{repo}` | Verificar si el repo ya existe |
| `GET /orgs/{org}/repos` | Listar repos de la org (para entregas y templates) |
| `DELETE /repos/{owner}/{repo}` | Eliminar repo (limpieza de assignments) |
| `GET /repos/{owner}/{repo}/commits/{ref}/check-runs` | Estado combinado de CI del commit |
| `POST /repos/{owner}/{repo}/check-suites/{check_suite_id}/rerequest` | Reejecutar CI (admin) |

La autenticación usa una **GitHub App** instalada en la org (no un PAT personal), lo que da permisos de admin sobre los repos sin depender de un usuario específico. Como fallback para desarrollo local se puede usar un PAT clásico con scopes `repo` y `admin:org`.

Es más estable que depender de GitHub Classroom, que es un producto con mantenimiento errático.

Esta tabla es sólo API **saliente** (Classroom consultando a GitHub). El webhook de
`check_suite`/`push`/`repository`/`member` (issue #60, ver [Webhooks de GitHub](#webhooks-de-github))
es API **entrante** — no agrega ningún endpoint REST nuevo de los de arriba, GitHub es quien llama.

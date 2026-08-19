# PdeP Classroom
[![CI](https://github.com/Juancete/Pdep-Classroom/actions/workflows/ci.yml/badge.svg)](https://github.com/Juancete/Pdep-Classroom/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/Juancete/Pdep-Classroom/graph/badge.svg)](https://codecov.io/gh/Juancete/Pdep-Classroom)

Reemplazo liviano de GitHub Classroom para la cátedra de Paradigmas de Programación (UTN FRBA).

Crea repos desde templates en la org `pdep-mn-utn` y da acceso a los alumnos, sin depender de GitHub Classroom.

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **NextAuth v5** con GitHub OAuth
- **Octokit** para la API de GitHub
- **Google Sheets API** para leer alumnos (padrón, notas, registro)
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

**Webhook** — desmarcar "Active". Esta app no usa webhooks.

**Permissions:**

| Sección | Permiso | Nivel |
|---|---|---|
| Repository | Administration | Read & Write |
| Repository | Contents | Read & Write |
| Repository | Actions | Read & Write |
| Organization | Members | Read only |

`Actions` es para el autograding (ver [más abajo](#autograding-con-github-actions)): `Read` alcanza
para mostrar el estado de las ejecuciones, `Write` hace falta sólo para el botón de reejecución
administrativa. **No hace falta `Checks`** — se usa la API de workflow runs, no de check runs.

Todo lo demás (Account permissions, Subscribe to events) dejarlo sin seleccionar.

> Si la App ya estaba instalada antes de agregar el permiso `Actions`, hay que aceptar el permiso
> nuevo desde la org (`Settings → GitHub Apps → PdeP Classroom → Review request` o reinstalar la
> app) antes de que el autograding funcione — GitHub no lo aplica retroactivamente solo.

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

y con las aserciones de `src/lib/migrations.test.ts`, que leen el snapshot commiteado.

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

El script `vercel-build` (`package.json`) corre `pnpm db:migration:up` **antes** de cada build:

```json
"vercel-build": "npm run db:migration:up && npm run build"
```

Es decir, las migraciones pendientes se aplican solas en cada deploy — no hace falta correrlas a
mano contra Neon. La implicancia: toda migración nueva tiene que ser segura de correr desatendida
en producción (idempotente, sin downtime largo, sin asumir que alguien va a mirar la salida).

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
vercel          # vincula el proyecto, hace el primer deploy a preview
vercel --prod   # promueve a producción
```

#### 9.2 Configurar variables de entorno

Cada variable se agrega con `vercel env add`. El CLI pregunta el valor y en qué entornos aplicarlo (Production / Preview / Development).

**Obligatorias** (sin ellas, login o el acceso a GitHub no funcionan):

```bash
# Base de datos (Neon — connection string pooled). Sin ella cae a localhost:5432 en silencio.
vercel env add DATABASE_URL

# GitHub OAuth App — sin esto el login con GitHub no funciona
vercel env add GITHUB_CLIENT_ID
vercel env add GITHUB_CLIENT_SECRET

# NextAuth
vercel env add NEXTAUTH_SECRET               # npx auth secret

# Admins — sin esto, nadie entra como docente
vercel env add ADMIN_GITHUB_USERNAMES        # usernames separados por coma
```

**Acceso a GitHub para crear/borrar repos** — usar la GitHub App (recomendado) o el PAT, no ambos:

```bash
# Opción A: GitHub App instalada en la org (recomendado)
vercel env add GITHUB_APP_ID
vercel env add GITHUB_APP_PRIVATE_KEY        # base64 del .pem, sin saltos de línea
vercel env add GITHUB_APP_INSTALLATION_ID

# Opción B: PAT clásico (fallback, ver §3) — si falta el trío de arriba, se usa este
vercel env add GITHUB_PAT

vercel env add GITHUB_ORG                    # opcional, default "pdep-mn-utn" si se omite
```

**Google Sheets** — requerida sólo si usás el registro/sincronización de alumnos desde planilla:

```bash
vercel env add GOOGLE_SERVICE_ACCOUNT_KEY    # base64 del JSON
```

**Google Groups (opcional)** — si se omiten ambas, el feature queda desactivado sin romper nada;
si se setea sólo `GOOGLE_GROUP_EMAIL` sin la otra, el server **no arranca** (ver §"Suscripción
automática a Google Group" más abajo):

```bash
vercel env add GOOGLE_GROUP_EMAIL
vercel env add GOOGLE_WORKSPACE_ADMIN_EMAIL
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

No hace falta correrlas a mano: `vercel-build` ejecuta `pnpm db:migration:up` antes de cada build
(ver §5.2). Si igual necesitás aplicarlas manualmente contra Neon (por ejemplo, para probar una
migración antes de deployar), apuntá `DATABASE_URL` a la connection string de Neon:

```bash
DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/pdep_classroom?sslmode=require" \
  pnpm db:migration:up
```

#### 9.4 Actualizar URLs de callback

Después del deploy, actualizar la GitHub OAuth App con la URL real de Vercel:

- Homepage URL: `https://tu-dominio.vercel.app`
- Callback URL: `https://tu-dominio.vercel.app/api/auth/callback/github`

#### 9.5 Crear la primera comisión

Una vez en producción, entrar como admin y crear al menos una comisión activa en `/admin/comisiones` con el ID de la planilla de Google Sheets. Sin una comisión activa, las páginas de alumnos, registro y perfil no funcionan.

## Cómo funciona

### Para docentes

1. Entrar como admin → ir a **Assignments**
2. Crear assignment: elegir template, paradigma, tipo (individual/grupal)
3. Compartir el link de la app con los alumnos (por mail, Google Groups, etc.)

### Para alumnos

1. Entrar con GitHub → ver dashboard con TPs pendientes
2. Para TPs grupales: crear un grupo o unirse a uno existente en `/assignments/[id]/grupo`. Se
   puede salir o cambiarse de grupo mientras las inscripciones sigan abiertas y el grupo no tenga
   entrega todavía; el docente puede administrar integrantes manualmente en cualquier momento desde
   el panel admin.
3. Clickear **Aceptar** → se crea el repo en `pdep-mn-utn` con el alumno (o todo el grupo, si es
   grupal) como collaborator

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

## Autograding con GitHub Actions

Classroom puede mostrar el resultado de la última ejecución de Actions de cada repo de entrega,
con link al detalle en GitHub, y ofrecer una reejecución administrativa. Es **pull, no push**: se
consulta la API bajo demanda y se cachea la última ejecución en la propia `Entrega` (sin historial
completo) — cuando se implemente el webhook de `workflow_run` ([#60](https://github.com/Juancete/Pdep-Classroom/issues/60)),
va a escribir en el mismo lugar y esta pantalla no cambia.

### Contrato del template

Un template habilita autograding agregando, en su branch por defecto:

```yaml
# .github/workflows/autograding.yml
name: Autograding
on: [push, workflow_dispatch]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # ... setup + comando de tests del paradigma correspondiente
      # el job debe terminar con exit code != 0 si los tests fallan
```

Classroom identifica el workflow por **nombre de archivo fijo** (`autograding.yml`), no por el
`name:` de adentro. Como los repos se crean con `repos.createUsingTemplate`, si el template tiene
ese archivo el repo generado lo hereda solo — no hace falta ningún paso extra al aceptar el TP.

> Los repos se crean con el token de instalación de la GitHub App, y GitHub no dispara workflows
> para pushes hechos por una GitHub App salvo que el workflow declare `workflow_dispatch` o el
> evento sea uno explícitamente soportado — en la práctica, el primer push real del alumno es el
> que dispara la primera ejecución, no el commit inicial del template.

### Mapeo de estado

| `status` / `conclusion` de la run | Resultado en Classroom |
|---|---|
| repo sin `autograding.yml` (404) | Sin autograding |
| workflow existe, `total_count: 0` | Sin ejecuciones |
| `status` distinto de `completed` | Pendiente |
| `conclusion: success` | Aprobado |
| `conclusion: failure` | Tests fallidos |
| `conclusion: cancelled` / `timed_out` | Cancelado |
| `conclusion: startup_failure` / `action_required` / `stale` / `neutral` / `skipped` / desconocida | Error de infraestructura |

Un repo sin el workflow no rompe nada más de la vista — se degrada a un badge gris "Sin
autograding" (`src/lib/services/sincronizarAutograding.ts`, `src/domain/entities/ResultadoAutograding.ts`).

### Frescura y reejecución

- La sincronización (`POST /api/assignments/[id]/autograding`) respeta una ventana de 60 segundos
  por entrega para no martillar la API de GitHub — un botón "Actualizar" explícito la puede forzar.
- La reejecución (`POST /api/assignments/[id]/autograding/rerun`, sólo admin) pide un `rerun` de la
  última run conocida (`POST /actions/runs/{run_id}/rerun`). Si nunca corrió ninguna, el botón queda
  deshabilitado — no hay nada que reejecutar.

### Resultado automático, no calificación

El badge siempre se muestra junto a la leyenda "Resultado automático — no es la nota final", tanto
en el panel admin como en el dashboard del alumno. No hay ninguna opción para presentarlo como
calificación definitiva.

## Estructura del proyecto

```
docker-compose.yml                             # Postgres + pgAdmin para desarrollo local
mikro-orm.config.ts                            # Config de MikroORM (CLI + runtime)
migrations/                                    # Migraciones commiteadas + snapshot del schema
tests/migrations/                              # Tests de integración contra Postgres real
src/
├── instrumentation.ts                         # Validaciones de arranque (ej. config de Google Groups)
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
│   │   │       ├── autograding/route.ts       # POST sincronizar resultado de autograding
│   │   │       ├── autograding/rerun/route.ts # POST reejecutar autograding (admin)
│   │   │       └── grupos/                    # POST crear grupo; join, mover y quitar integrantes
│   │   └── comisiones/[id]/route.ts           # PATCH comisión
│   ├── admin/
│   │   ├── assignments/
│   │   │   ├── page.tsx                       # Listar assignments
│   │   │   ├── new/page.tsx                   # Crear assignment
│   │   │   ├── [id]/page.tsx                  # Detalle: entregas, estadísticas, ciclo de vida
│   │   │   │   ├── entregas-table.tsx         # Tabla de entregas con filtro (client)
│   │   │   │   ├── autograding-sync-button.tsx # Sincronizar autograding del assignment (client)
│   │   │   │   ├── autograding-rerun-button.tsx # Reejecutar autograding de una entrega (client)
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
│   ├── components/
│   │   ├── AlumnoForm.tsx                     # Form reutilizable registro/edición alumno
│   │   ├── AutogradingBadge.tsx               # Badge de resultado de autograding (server)
│   │   ├── autograding-ui.tsx                 # Tabla de presentación (etiqueta/color/ícono) por resultado
│   │   └── PageSkeleton.tsx                   # Skeleton de carga genérico
│   ├── hooks/
│   │   └── useApiCall.ts                      # Hook genérico para llamadas a la API REST
│   ├── dashboard/
│   │   ├── page.tsx                           # Dashboard alumno: TPs pendientes y estado
│   │   ├── accept-button.tsx                  # Botón aceptar TP (client)
│   │   └── autograding-refresh-button.tsx     # Actualizar el autograding de la propia entrega (client)
│   ├── registro/page.tsx                      # Registro de alumno (con AlumnoForm)
│   ├── perfil/page.tsx                        # Editar perfil alumno (con AlumnoForm)
│   ├── login/page.tsx                         # Página de login (GitHub + login de desarrollo opcional)
│   ├── nav.tsx                                # Barra de navegación (server component)
│   ├── logout-button.tsx                      # Botón de logout (client)
│   ├── error.tsx                              # Boundary de error global
│   ├── layout.tsx                             # Layout raíz con nav y sesión
│   └── page.tsx                               # Landing
├── domain/
│   └── entities/                              # Entidades MikroORM + lógica de dominio
│       ├── Assignment.ts                      # Base abstracta
│       ├── IndividualAssignment.ts
│       ├── GrupalAssignment.ts
│       ├── EstadoAssignment.ts                # Ciclo de vida (borrador/publicado/archivado) como Strategy
│       ├── ResultadoAutograding.ts            # Resultado de la última ejecución de autograding, como Strategy
│       ├── RolDeUsuario.ts                    # Docente/alumno como Strategy (reemplaza un booleano isAdmin)
│       ├── Comision.ts                        # Incluye columnConfig para la planilla
│       ├── Entrega.ts
│       ├── Alumno.ts
│       ├── Grupo.ts
│       ├── CambioDeMembresia.ts               # Auditoría de altas/bajas/cambios de integrantes
│       └── RepoDeletionAttempt.ts             # Auditoría de borrado de repos
├── lib/
│   ├── auth.ts / auth.config.ts / auth.events.ts   # NextAuth: config, providers (GitHub + login de desarrollo), eventos
│   ├── github.ts                              # Octokit: crear/eliminar repos, collaborators, templates
│   ├── github-errors.ts                       # Tipado y manejo de errores de la API de GitHub
│   ├── naming.ts                              # Funciones puras: slugify, buildRepoName
│   ├── sheets.ts                              # Google Sheets: leer/escribir alumnos y grupos
│   ├── googleGroups.ts                        # Alta/baja en Google Groups (opcional, ver más abajo)
│   ├── session.ts                             # requireUser / requireAdmin
│   ├── proxy-authorization.ts                 # Reglas de redirect que usa proxy.ts
│   ├── api-auth.ts                            # Middleware de auth para API routes
│   ├── api-errors.ts                          # Traducción de errores de dominio a respuestas HTTP
│   ├── assignment-schema.ts                   # Schemas Zod para assignments
│   ├── rate-limit.ts                          # Rate limiting por usuario + assignment (evita double-click)
│   ├── entrega-query.ts                       # Helpers de consulta sobre entregas
│   ├── logger.ts                              # Logging estructurado (pino)
│   ├── db.ts                                  # Singleton MikroORM (getOrm / getEM)
│   ├── services/                              # Casos de uso — acá vive la lógica de negocio
│   │   ├── aceptarAssignment.ts               # Aceptar un TP: crea entrega + repo
│   │   ├── assignmentAuthorization.ts         # Quién puede ver/operar sobre un assignment
│   │   ├── alumnoRegistro.ts                  # Alta de alumno (DB primero, después Sheets)
│   │   ├── importarAlumnosDeComision.ts       # Sheets → DB, bulk por comisión
│   │   ├── grupoSync.ts                       # Sheets → DB, membresía de grupos (sólo aditivo)
│   │   ├── intentarSincronizarGrupos.ts       # Wrapper con retry/flag de falla de grupoSync
│   │   ├── intentarSincronizarGoogleGroup.ts  # Wrapper con retry/flag de falla de Google Groups
│   │   ├── hooksPostConfirmacion.ts           # Orquesta los sync post-registro
│   │   ├── verificarConsistenciaAlumno.ts     # Chequeos de consistencia DB↔Sheets
│   │   ├── borrarRepositoriosDeAssignment.ts  # Borrado auditado de repos de un assignment
│   │   └── sincronizarAutograding.ts          # Consulta y cachea el resultado de autograding
│   ├── concurrencia.ts                        # mapConConcurrenciaLimitada (pool de workers genérico)
│   ├── mensaje-operativo.ts                   # Redacta secretos de un mensaje de error antes de mostrarlo/persistirlo
│   └── repositories/                          # Acceso a datos por entidad
│       ├── AlumnoRepository.ts
│       ├── AssignmentRepository.ts
│       ├── ComisionRepository.ts
│       ├── EntregaRepository.ts
│       ├── GrupoRepository.ts
│       ├── CambioDeMembresiaRepository.ts
│       └── RepoDeletionAttemptRepository.ts
└── types/index.ts                             # ColumnConfig, PdepUser, tipos del dominio
```

## Tests

```bash
pnpm test              # watch mode
pnpm test:run          # una sola corrida (~95 archivos hoy)
pnpm test:coverage
pnpm lint
pnpm test:migrations   # migraciones + invariantes contra Postgres real (requiere MIGRATION_TEST_DATABASE_URL)
```

La mayoría son tests puros (dominio, servicios) o de componentes con las dependencias externas
mockeadas — `lib/github.test.ts` y `lib/googleGroups.test.ts`, por ejemplo, sí mockean Octokit y la
Admin SDK. Una muestra representativa:

- **lib/naming.test.ts** — `buildRepoName`, `slugify`, `extractTemplateName`
- **lib/sheets.test.ts** — `parseAlumnosRows`, `parseAsignacionesGrupos`, `validateRegistro`
- **lib/github-errors.test.ts** — manejo y tipado de errores de GitHub
- **lib/rate-limit.test.ts** — lógica de rate limiting
- **domain/entities/\*.test.ts** — reglas de dominio (ciclo de vida, roles, membresía de grupos)
- **lib/services/\*.test.ts** — casos de uso (aceptar TP, registro, sync de Sheets)
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
7. Se intenta suscribir al alumno al Google Group de la materia (opcional, ver más abajo)
8. Redirige al dashboard

La **DB es la autoridad** para la coherencia legajo↔GitHub (ahí se valida y se rechazan
duplicados); la planilla se mantiene como espejo para uso de los docentes. La sincronización de
grupos desde Sheets es la excepción: ahí la planilla sigue siendo la entrada, aunque sólo agrega
membresías, nunca las saca (ver [issue #28](https://github.com/Juancete/Pdep-Classroom/issues/28)).

## Suscripción automática a Google Group

Al completarse el alta de un alumno, lo suscribimos al Google Group de la materia — así el docente no tiene que agregarlo a mano y el alumno empieza a recibir los mails del grupo desde el primer día.

El feature es **opcional**: si las variables de entorno no están configuradas, el endpoint de registro no hace nada con Groups. Si están configuradas y la suscripción falla (permisos, red, etc.), el alta del alumno **igual se completa** y se le muestra un aviso al alumno para que avise al docente. El detalle del error queda en los logs del server.

Si un alumno ya era miembro del grupo (por ejemplo, se registró, lo dieron de baja y se vuelve a registrar), la API de Google responde 409 y tratamos ese caso como éxito silencioso — la UI no le muestra nada especial.

### Variables de entorno

| Variable | Rol |
|---|---|
| `GOOGLE_GROUP_EMAIL` | Email del grupo al que suscribimos a los alumnos (ej: `pdep-2026@googlegroups.com`). Dejalo vacío para desactivar el feature. |
| `GOOGLE_WORKSPACE_ADMIN_EMAIL` | Usuario admin del Workspace que la service account impersona para poder agregar miembros al grupo. Obligatorio si `GOOGLE_GROUP_EMAIL` está seteada. |

Si seteás `GOOGLE_GROUP_EMAIL` sin `GOOGLE_WORKSPACE_ADMIN_EMAIL`, el server falla al arrancar (ver [`src/instrumentation.ts`](src/instrumentation.ts)) — preferimos romper el boot antes que dejar que la misconfig le caiga al alumno en la cara.

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

4. **Elegir el admin a impersonar**.
   - Cualquier usuario del Workspace con permisos para administrar el grupo (típicamente un docente con rol de admin). Ese email va en `GOOGLE_WORKSPACE_ADMIN_EMAIL`.

5. **Setear las env vars** en `.env.local` (desarrollo) y en el panel de Vercel (producción):
   ```bash
   GOOGLE_GROUP_EMAIL=pdep-2026@googlegroups.com
   GOOGLE_WORKSPACE_ADMIN_EMAIL=docente-admin@utn.edu.ar
   ```

6. **Reiniciar el server**. Si la config quedó bien, el boot pasa sin ruido y el próximo registro va a suscribir al alumno.

### Troubleshooting

- **El server no arranca con error "GOOGLE_WORKSPACE_ADMIN_EMAIL no está configurada"** → setea la variable o vacía `GOOGLE_GROUP_EMAIL` para desactivar el feature.
- **El registro completa OK pero el alumno ve el aviso ámbar** → buscá el log con el prefijo `Error al suscribir al Google Group` **en Vercel → Project → Deployments → el deploy activo → Runtime Logs** (en local, aparece en la terminal donde corrés `next dev`). El log incluye `github=<handle>` del alumno y el detalle devuelto por la API. Causas típicas: falta habilitar la Admin SDK API, el scope no está autorizado, o el admin impersonado no tiene permiso sobre el grupo.
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
- [x] Autograding con GitHub Actions en los templates — ver [Autograding con GitHub Actions](#autograding-con-github-actions); queda pendiente que [#60](https://github.com/Juancete/Pdep-Classroom/issues/60) reemplace el polling por un webhook de `workflow_run`
- [ ] Export de estado de entregas a Google Sheets (cerrar el loop con la planilla)
- [x] Suscribir a los alumnos al grupo de Google Groups automáticamente
- [x] Ciclo de vida de assignments (borrador/publicado/archivado) con auditoría de quién publicó o archivó
- [x] Auto-gestión de grupos: crear, unirse, salir y cambiarse, con administración manual desde el panel docente
- [ ] Observabilidad ([#18](https://github.com/Juancete/Pdep-Classroom/issues/18)) — tabla `error_log` + pantalla `/admin/errores` + badge en el header con no leídos (PR 2 del refactor de logging, hoy los 500 solo logguean por pino a Vercel)
- [ ] Reconciliar grupos importados desde Sheets en vez de sólo acumular miembros ([#28](https://github.com/Juancete/Pdep-Classroom/issues/28)) — hoy la sync es puramente aditiva y puede pisar una baja o un cambio hecho a mano (ver "Registro de alumnos" más arriba)

## API de GitHub — Estabilidad

La REST API v3 de GitHub tiene política de versionado conservadora. Todos los endpoints que usa esta app existen desde 2019+ y no van a cambiar:

| Endpoint | Uso |
|---|---|
| `POST /repos/{template_owner}/{template_repo}/generate` | Crear repo desde template |
| `PUT /repos/{owner}/{repo}/collaborators/{username}` | Dar acceso push al alumno |
| `GET /repos/{owner}/{repo}` | Verificar si el repo ya existe |
| `GET /orgs/{org}/repos` | Listar repos de la org (para entregas y templates) |
| `DELETE /repos/{owner}/{repo}` | Eliminar repo (limpieza de assignments) |
| `GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs` | Última ejecución de autograding |
| `POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun` | Reejecutar autograding (admin) |

La autenticación usa una **GitHub App** instalada en la org (no un PAT personal), lo que da permisos de admin sobre los repos sin depender de un usuario específico. Como fallback para desarrollo local se puede usar un PAT clásico con scopes `repo` y `admin:org`.

Es más estable que depender de GitHub Classroom, que es un producto con mantenimiento errático.

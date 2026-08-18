# PdeP Classroom
[![CI](https://github.com/Juancete/Pdep-Classroom/actions/workflows/ci.yml/badge.svg)](https://github.com/Juancete/Pdep-Classroom/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/Juancete/Pdep-Classroom/graph/badge.svg)](https://codecov.io/gh/Juancete/Pdep-Classroom)

Reemplazo liviano de GitHub Classroom para la cátedra de Paradigmas de Programación (UTN FRBA).

Crea repos desde templates en la org `pdep-mn-utn` y da acceso a los alumnos, sin depender de GitHub Classroom.

## Stack

- **Next.js 14** (App Router) + TypeScript
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
npm install
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
| Organization | Members | Read only |

Todo lo demás (Account permissions, Subscribe to events) dejarlo sin seleccionar.

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

Pegarlo en `GOOGLE_SPREADSHEET_ID` en el `.env.local`.

**Formato esperado de la planilla de alumnos (hoja principal):**

| Legajo | Apellido | Nombre | GitHub | Email | Comisión |
|---|---|---|---|---|---|
| 12345 | García | Juan | juangarcia | juan@gmail.com | miércoles noche |

**Formato esperado de la hoja "Grupos":**

| NombreGrupo | Paradigma | Miembro1 | Miembro2 | Miembro3 | Miembro4 |
|---|---|---|---|---|---|
| Los Lambdas | funcional | juangarcia | mariaperez | | |
| Los Hechos | logico | juangarcia | pedrolopez | | |

Los grupos pueden cambiar por paradigma — cada fila tiene su paradigma asociado.

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

Crear y aplicar las migraciones para generar el schema:

```bash
pnpm db:migration:create   # genera el SQL a partir de las entidades (solo si no hay migraciones ya)
pnpm db:migration:up       # aplica las migraciones pendientes
```

> `migration:create` lee las entidades de dominio y genera un archivo `.ts` en `migrations/`.
> `migration:up` aplica los archivos pendientes que aún no figuran en la tabla `mikro_orm_migrations`.
> Si corrés `migration:up` sin haber generado migraciones primero, la DB queda sin tablas.

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

**Aplicar migraciones en producción:**

Las migraciones se corren una vez desde local apuntando a la DB de Neon:

```bash
DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/pdep_classroom?sslmode=require" \
  pnpm db:migration:up
```

> No incluir este comando en el build de Vercel — las migraciones se corren manualmente para tener control explícito.

#### Scripts de DB disponibles

```bash
pnpm db:migration:create   # Crear nueva migración (tras cambiar entidades)
pnpm db:migration:up       # Aplicar migraciones pendientes
pnpm db:migration:down     # Revertir la última migración
pnpm db:schema:fresh       # DROP y recrear todo el schema (solo dev)
```

### 6. Configurar admins


En `ADMIN_GITHUB_USERNAMES` poné los usernames de GitHub de los docentes, separados por coma:

```
ADMIN_GITHUB_USERNAMES=juancontardo,fdodino,nsicolo,dsquivel
```

### 6. Generar secret de NextAuth

```bash
npx auth secret
```

Copiar el valor generado a `NEXTAUTH_SECRET`.

### 7. Correr en local

```bash
pnpm dev
```

Abrir http://localhost:3000.

#### 7.1 Login sin pasar por GitHub (opcional)

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

### 8. Deploy a Vercel

#### 8.1 Primer deploy

```bash
pnpm i -g vercel
vercel          # vincula el proyecto, hace el primer deploy a preview
vercel --prod   # promueve a producción
```

#### 8.2 Configurar variables de entorno

Cada variable se agrega con `vercel env add`. El CLI pregunta el valor y en qué entornos aplicarlo (Production / Preview / Development).

```bash
# Base de datos (Neon — connection string pooled)
vercel env add DATABASE_URL

# GitHub OAuth App
vercel env add GITHUB_CLIENT_ID
vercel env add GITHUB_CLIENT_SECRET

# GitHub App (instalada en la org)
vercel env add GITHUB_APP_ID
vercel env add GITHUB_APP_PRIVATE_KEY        # base64 del .pem, sin saltos de línea
vercel env add GITHUB_APP_INSTALLATION_ID

# Org de GitHub
vercel env add GITHUB_ORG                    # valor: pdep-mn-utn

# Google Sheets — service account
vercel env add GOOGLE_SERVICE_ACCOUNT_KEY    # base64 del JSON

# NextAuth
vercel env add NEXTAUTH_SECRET               # npx auth secret

# Admins
vercel env add ADMIN_GITHUB_USERNAMES        # usernames separados por coma
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

#### 8.3 Aplicar migraciones en producción

Después del primer deploy (o cada vez que haya migraciones nuevas), aplicarlas desde local apuntando a la DB de Neon:

```bash
DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/pdep_classroom?sslmode=require" \
  pnpm db:migration:up
```

O con el `.env.local` apuntando a Neon directamente:

```bash
pnpm db:migration:up
```

#### 8.4 Actualizar URLs de callback

Después del deploy, actualizar la GitHub OAuth App con la URL real de Vercel:

- Homepage URL: `https://tu-dominio.vercel.app`
- Callback URL: `https://tu-dominio.vercel.app/api/auth/callback/github`

#### 8.5 Crear la primera comisión

Una vez en producción, entrar como admin y crear al menos una comisión activa en `/admin/comisiones` con el ID de la planilla de Google Sheets. Sin una comisión activa, las páginas de alumnos, registro y perfil no funcionan.

## Cómo funciona

### Para docentes

1. Entrar como admin → ir a **Assignments**
2. Crear assignment: elegir template, paradigma, tipo (individual/grupal)
3. Compartir el link de la app con los alumnos (por mail, Google Groups, etc.)

### Para alumnos

1. Entrar con GitHub → ver dashboard con TPs pendientes
2. Clickear **Aceptar** → se crea el repo en `pdep-mn-utn` con su usuario como collaborator
3. Para TPs grupales, se agregan todos los miembros del grupo automáticamente

### Repos creados

Los repos se crean con la convención:
- Individual: `{slug}-{github-username}` → `kata-funcional-juangarcia`
- Grupal: `{slug}-{nombre-grupo-normalizado}` → `tp-funcional-los-lambdas`

El nombre grupal se normaliza a minúsculas, sin acentos y con guiones en
lugar de espacios o caracteres especiales. Por ejemplo, `Los Lógicos ++`
genera `los-logicos`. Dos nombres del mismo assignment que generen el mismo
identificador se consideran duplicados.

## Estructura del proyecto

```
src/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts        # OAuth flow (GitHub)
│   │   ├── registro/route.ts                  # POST registro alumno → Sheets + DB
│   │   ├── perfil/route.ts                    # PATCH actualizar datos alumno
│   │   ├── assignments/
│   │   │   ├── route.ts                       # GET assignments de la comisión activa
│   │   │   └── [id]/
│   │   │       ├── route.ts                   # GET / DELETE assignment
│   │   │       ├── accept/route.ts            # POST crear repo en GitHub
│   │   │       └── repos/route.ts             # GET repos activos del assignment
│   │   └── comisiones/[id]/route.ts           # PATCH comisión
│   ├── admin/
│   │   ├── assignments/
│   │   │   ├── page.tsx                       # Listar assignments
│   │   │   ├── new/page.tsx                   # Crear assignment
│   │   │   ├── [id]/page.tsx                  # Detalle: entregas, estadísticas
│   │   │   │   └── entregas-table.tsx         # Tabla de entregas con filtro (client)
│   │   │   ├── [id]/edit/page.tsx             # Editar assignment
│   │   │   ├── actions.ts                     # Server actions CRUD
│   │   │   ├── assignment-form.tsx            # Form compartido crear/editar
│   │   │   ├── delete-button.tsx              # Eliminar assignment
│   │   │   └── delete-repos-button.tsx        # Eliminar repos del assignment en GitHub
│   │   ├── comisiones/
│   │   │   ├── page.tsx                       # Listar comisiones
│   │   │   ├── new/page.tsx                   # Crear comisión
│   │   │   ├── [id]/edit/page.tsx             # Editar comisión (con config de columnas)
│   │   │   ├── actions.ts                     # Server actions CRUD + sincronizar alumnos
│   │   │   ├── comision-form.tsx              # Form compartido crear/editar
│   │   │   ├── delete-button.tsx              # Eliminar comisión
│   │   │   └── sync-button.tsx                # Sincronizar alumnos desde Sheets → DB
│   │   ├── alumnos/page.tsx                   # Ver alumnos (desde comisión activa)
│   │   ├── grupos/page.tsx                    # Ver grupos (de Sheets)
│   │   ├── delete-button.tsx                  # Componente genérico de eliminar
│   │   └── ui.tsx                             # Componentes UI compartidos del panel admin
│   ├── components/
│   │   ├── AlumnoForm.tsx                     # Form reutilizable registro/edición alumno
│   │   └── PageSkeleton.tsx                   # Skeleton de carga genérico
│   ├── hooks/
│   │   └── useApiCall.ts                      # Hook genérico para llamadas a la API REST
│   ├── dashboard/
│   │   ├── page.tsx                           # Dashboard alumno: TPs pendientes y estado
│   │   └── accept-button.tsx                  # Botón aceptar TP (client)
│   ├── registro/page.tsx                      # Registro de alumno (con AlumnoForm)
│   ├── perfil/page.tsx                        # Editar perfil alumno (con AlumnoForm)
│   ├── login/page.tsx                         # Página de login con GitHub
│   ├── nav.tsx                                # Barra de navegación (server component)
│   ├── logout-button.tsx                      # Botón de logout (client)
│   ├── error.tsx                              # Boundary de error global
│   ├── layout.tsx                             # Layout raíz con nav y sesión
│   └── page.tsx                               # Landing
├── domain/
│   └── entities/                              # Entidades MikroORM
│       ├── Assignment.ts                      # Base abstracta
│       ├── IndividualAssignment.ts
│       ├── GrupalAssignment.ts
│       ├── Comision.ts                        # Incluye columnConfig para la planilla
│       ├── Entrega.ts
│       ├── Alumno.ts
│       └── Grupo.ts
├── lib/
│   ├── auth.ts                                # NextAuth config (GitHub OAuth)
│   ├── github.ts                              # Octokit: crear/eliminar repos, collaborators, templates
│   ├── github-errors.ts                       # Tipado y manejo de errores de la API de GitHub
│   ├── naming.ts                              # Funciones puras: slugify, buildRepoName
│   ├── sheets.ts                              # Google Sheets: leer/escribir alumnos
│   ├── session.ts                             # requireUser / requireAdmin
│   ├── api-auth.ts                            # Middleware de auth para API routes
│   ├── assignment-schema.ts                   # Schemas Zod para assignments
│   ├── rate-limit.ts                          # Rate limiting por IP
│   ├── db.ts                                  # Singleton MikroORM (getOrm / getEM)
│   └── repositories/                          # Acceso a datos por entidad
│       ├── AlumnoRepository.ts
│       ├── AssignmentRepository.ts
│       ├── ComisionRepository.ts
│       ├── EntregaRepository.ts
│       └── GrupoRepository.ts
├── types/index.ts                             # ColumnConfig, PdepUser, tipos del dominio
└── proxy.ts                                   # Auth proxy (protege rutas /admin, /dashboard)
```

## Tests

```bash
pnpm test          # watch mode
pnpm test:run      # una sola corrida
pnpm test:coverage
```

Los tests cubren lógica pura y server actions (sin mocks de APIs externas):

- **lib/naming.test.ts** — `buildRepoName`, `slugify`, `extractTemplateName`
- **lib/sheets.test.ts** — `parseAlumnosRows`, `parseGruposRows`, `validateRegistro`
- **lib/github-errors.test.ts** — manejo y tipado de errores de GitHub
- **lib/rate-limit.test.ts** — lógica de rate limiting
- **admin/assignments/actions.test.ts** — server actions CRUD de assignments
- **admin/comisiones/actions.test.ts** — server actions CRUD de comisiones
- **api/assignments/[id]/\*.test.ts** — rutas de aceptación y consulta de repos
- **app/\*\*/page.test.tsx** — rendering de páginas admin y dashboard

## Registro de alumnos

El flujo de registro reemplaza la carga manual en la planilla:

1. Alumno entra → login con GitHub
2. Si no está en la planilla → redirige a `/registro`
3. Completa: legajo (PK), apellido, nombre, email, comisión
4. El `githubUsername` se toma de la sesión (no se puede impersonar)
5. Se valida que no exista duplicado por legajo ni por GitHub user
6. Se escribe una fila nueva en la hoja "Alumnos" de la spreadsheet
7. Redirige al dashboard

La planilla sigue siendo la fuente de verdad — la app solo escribe ahí.

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
- [ ] Autograding con GitHub Actions en los templates
- [ ] Export de estado de entregas a Google Sheets (cerrar el loop con la planilla)
- [x] Suscribir a los alumnos al grupo de Google Groups automáticamente
- [ ] Observabilidad ([#18](https://github.com/Juancete/Pdep-Classroom/issues/18)) — tabla `error_log` + pantalla `/admin/errores` + badge en el header con no leídos (PR 2 del refactor de logging, hoy los 500 solo logguean por pino a Vercel)
- [ ] Vista admin detallada de alumnos con `gruposSyncFallidoEn` pendiente ([#21](https://github.com/Juancete/Pdep-Classroom/issues/21)) — listar quiénes son, desde cuándo, y permitir reintento por alumno. Hoy hay un badge + botón "Resincronizar grupos" masivo en `/admin/comisiones/[id]/edit`, pero no se ve el detalle individual.

## Refactor en curso

- [x] **Fase 4** ([#11](https://github.com/Juancete/Pdep-Classroom/issues/11)) — `upsertarAlumnoEnSheets` no debe quejarse al editar + coherencia legajo↔github
- [x] **Fase 2** ([#13](https://github.com/Juancete/Pdep-Classroom/issues/13)) — Validación de `githubUsername` en registro/perfil con error inline en el form
- [x] **Fase 1** ([#9](https://github.com/Juancete/Pdep-Classroom/issues/9)) — Reificar polimorfismo de `Assignment` (individual/grupal) para eliminar los IFs
- [x] **Fase 3** ([#10](https://github.com/Juancete/Pdep-Classroom/issues/10)) — Unificar registro y perfil en un servicio común
- [ ] **Fase 5** ([#14](https://github.com/Juancete/Pdep-Classroom/issues/14)) — Upsert de grupos desde planilla, modelado genérico (no atado a paradigma)
- [ ] **Fase 6** ([#12](https://github.com/Juancete/Pdep-Classroom/issues/12)) — Renombrar/comentar `DEFAULT_COLUMN_CONFIG` como sugerencia de UX

## API de GitHub — Estabilidad

La REST API v3 de GitHub tiene política de versionado conservadora. Todos los endpoints que usa esta app existen desde 2019+ y no van a cambiar:

| Endpoint | Uso |
|---|---|
| `POST /repos/{template_owner}/{template_repo}/generate` | Crear repo desde template |
| `PUT /repos/{owner}/{repo}/collaborators/{username}` | Dar acceso push al alumno |
| `GET /repos/{owner}/{repo}` | Verificar si el repo ya existe |
| `GET /orgs/{org}/repos` | Listar repos de la org (para entregas y templates) |
| `DELETE /repos/{owner}/{repo}` | Eliminar repo (limpieza de assignments) |

La autenticación usa una **GitHub App** instalada en la org (no un PAT personal), lo que da permisos de admin sobre los repos sin depender de un usuario específico. Como fallback para desarrollo local se puede usar un PAT clásico con scopes `repo` y `admin:org`.

Es más estable que depender de GitHub Classroom, que es un producto con mantenimiento errático.

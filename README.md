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
- **PostgreSQL** en `localhost:5432` (user: `postgres`, password: `postgres`, db: `pdep_classroom`)
- **pgAdmin** en http://localhost:5050 (email: `admin@pdep.com`, password: `admin`)
  — ya viene pre-configurado apuntando a la instancia de Postgres, no hay que configurar nada

Para bajar todo:

```bash
docker compose down          # baja los containers, preserva los datos
docker compose down -v       # baja todo y borra el volumen (reset total)
```

La `DATABASE_URL` en `.env.local` ya está configurada para esta instancia:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pdep_classroom
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

### 8. Deploy a Vercel

```bash
pnpm i -g vercel
vercel
```

Variables de entorno a configurar en Vercel:

| Variable | Dónde obtenerla |
|---|---|
| `DATABASE_URL` | Neon → Connection Details (pooled) |
| `GITHUB_CLIENT_ID` | GitHub OAuth App |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App |
| `GITHUB_APP_ID` | GitHub App → About |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App → Private Keys (base64) |
| `GITHUB_APP_INSTALLATION_ID` | URL de instalación de la app |
| `GITHUB_ORG` | `pdep-mn-utn` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Google Cloud → Credentials (base64) |
| `GOOGLE_SHEET_ALUMNOS_ID` | ID de la planilla en la URL |
| `NEXTAUTH_URL` | URL del deploy (ej: `https://pdep.vercel.app`) |
| `NEXTAUTH_SECRET` | `npx auth secret` |
| `ADMIN_GITHUB_USERNAMES` | usernames separados por coma |

Después del deploy, actualizar las URLs de callback en la GitHub OAuth App:
- Homepage URL: `https://tu-dominio.vercel.app`
- Callback URL: `https://tu-dominio.vercel.app/api/auth/callback/github`

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
- Grupal: `{slug}-{grupo-id}` → `tp-funcional-los-lambdas`

## Estructura del proyecto

```
src/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts   # OAuth flow
│   │   ├── registro/route.ts             # POST registro → Sheets
│   │   └── assignments/
│   │       ├── route.ts                   # GET assignments
│   │       └── [id]/accept/route.ts       # POST crear repo
│   ├── admin/
│   │   ├── assignments/
│   │   │   ├── page.tsx                   # Listar assignments
│   │   │   └── new/page.tsx               # Crear assignment
│   │   ├── grupos/page.tsx                # Ver grupos (de Sheets)
│   │   └── alumnos/page.tsx               # Ver alumnos (de Sheets)
│   ├── dashboard/
│   │   ├── page.tsx                       # Dashboard (redirige a /registro si no está)
│   │   └── accept-button.tsx              # Botón de aceptar (client)
│   ├── registro/
│   │   ├── page.tsx                       # Registro de alumno
│   │   └── registro-form.tsx              # Form client component
│   ├── login/page.tsx
│   ├── layout.tsx                         # Layout con nav
│   └── page.tsx                           # Landing
├── lib/
│   ├── auth.ts                            # NextAuth config
│   ├── github.ts                          # Octokit: crear repos, permisos
│   ├── naming.ts                          # Funciones puras: slugify, buildRepoName
│   ├── naming.test.ts                     # Tests de naming
│   ├── sheets.ts                          # Google Sheets: leer y escribir alumnos/grupos
│   ├── sheets.test.ts                     # Tests de parsing y validación
│   ├── store.ts                           # Persistencia assignments/entregas
│   ├── store.test.ts                      # Tests de CRUD
│   └── session.ts                         # Helpers getCurrentUser/requireAdmin
├── types/index.ts                         # Tipos del dominio
└── middleware.ts                          # Auth middleware
```

## Tests

```bash
npm test          # watch mode
npm run test:run  # una sola corrida
npm run test:coverage
```

Los tests cubren las 3 capas de lógica pura (sin mocks de APIs externas):

- **naming.test.ts** — `buildRepoName`, `slugify`, `extractTemplateName`
- **sheets.test.ts** — `parseAlumnosRows`, `parseGruposRows`, `validateRegistro`
- **store.test.ts** — CRUD de assignments y entregas

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

## TODOs sugeridos

- [x] Migrar persistencia de JSON a PostgreSQL + MikroORM
- [x] Agregar delete/edit de assignments
- [ ] Vista de entregas por assignment (quién entregó, quién no)
- [ ] Notificaciones por mail cuando se publica un assignment
- [ ] Autograding con GitHub Actions en los templates
- [x] Rate limiting en el endpoint de accept (para evitar duplicados por double-click)
- [ ] Export de estado de entregas a Google Sheets (cerrar el loop con la planilla)
- [ ] Suscribir a los alumnos al grupo de google groups automáticamente.

## API de GitHub — Estabilidad

La REST API v3 de GitHub tiene política de versionado conservadora. Los 3 endpoints que usa esta app existen desde 2019+ y no van a cambiar:

- `POST /repos/{template_owner}/{template_repo}/generate` — crear desde template
- `PUT /repos/{owner}/{repo}/collaborators/{username}` — dar acceso
- `GET /repos/{owner}/{repo}` — verificar existencia

Es más estable que depender de GitHub Classroom, que es un producto con mantenimiento errático.

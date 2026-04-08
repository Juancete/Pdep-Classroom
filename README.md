# PdeP Classroom

Reemplazo liviano de GitHub Classroom para la cátedra de Paradigmas de Programación (UTN FRBA).

Crea repos desde templates en la org `pdep-mn` y da acceso a los alumnos, sin depender de GitHub Classroom.

## Stack

- **Next.js 14** (App Router) + TypeScript
- **NextAuth v5** con GitHub OAuth
- **Octokit** para la API de GitHub
- **Google Sheets API** para leer alumnos y grupos
- **Vercel** para deploy

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

### 3. Crear GitHub App en la org pdep-mn

Ir a https://github.com/organizations/pdep-mn/settings/apps/new

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
1. Generar private key → descargar el `.pem`
2. Instalar la app en la org pdep-mn
3. Anotar el App ID y el Installation ID

```bash
# Convertir el .pem a base64 para el env
cat tu-app.pem | base64 -w 0
```

Pegar en `GITHUB_APP_PRIVATE_KEY`.

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

### 5. Configurar admins

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
npm run dev
```

Abrir http://localhost:3000.

### 8. Deploy a Vercel

```bash
npm i -g vercel
vercel
```

Configurar las variables de entorno en el dashboard de Vercel.
Actualizar las URLs de callback en la GitHub OAuth App.

## Cómo funciona

### Para docentes

1. Entrar como admin → ir a **Assignments**
2. Crear assignment: elegir template, paradigma, tipo (individual/grupal)
3. Compartir el link de la app con los alumnos (por mail, Google Groups, etc.)

### Para alumnos

1. Entrar con GitHub → ver dashboard con TPs pendientes
2. Clickear **Aceptar** → se crea el repo en `pdep-mn` con su usuario como collaborator
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

- [ ] Migrar `store.ts` de JSON a Vercel Postgres/KV para producción
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

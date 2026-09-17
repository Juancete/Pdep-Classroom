import { requireResponsable } from "@/infrastructure/auth/session";
import { getDocentes } from "@/infrastructure/repositories";
import { responsablesDeEntorno } from "@/lib/responsables-de-entorno";
import { DocenteForm } from "./docente-form";
import { NombreEditable, EstadoToggle } from "./docente-acciones";
import {
  crearDocenteAction,
  renombrarDocenteAction,
  cambiarEstadoDocenteAction,
} from "./actions";
import {
  DataTable,
  DataHeader,
  DataHeaderCell,
  DataBody,
  DataRow,
  DataCell,
  DataEmpty,
} from "@/components/DataTable";

// Las dos píldoras de estado ("Activo"/"Inactivo") se repetían idénticas en
// la fila de entorno (siempre activa) y en la de aplicación — server
// component, no necesita estado propio.
function EstadoBadge({ activo }: { activo: boolean }) {
  return activo ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      Activo
    </span>
  ) : (
    <span className="text-xs font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
      Inactivo
    </span>
  );
}

export default async function AdminDocentesPage() {
  await requireResponsable();
  const docentes = await getDocentes();
  const entorno = responsablesDeEntorno();
  // Un docente de base puede agregarse después a
  // `ADMIN_GITHUB_USERNAMES`: sin este filtro aparecería dos veces (fila
  // "Entorno" protegida + fila "Aplicación" editable). La política de fondo
  // (bloquear la mutación) vive en el repositorio; acá sólo se evita el
  // duplicado visual.
  const usernamesDeEntorno = new Set(entorno);
  const docentesDeAplicacion = docentes.filter(
    (docente) => !usernamesDeEntorno.has(docente.githubUsername)
  );
  const hayFilas = docentesDeAplicacion.length > 0 || entorno.length > 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Docentes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Los docentes dados de alta acá tienen los mismos permisos que un responsable, pero no
          pueden gestionar este panel. Los responsables configurados por entorno no pueden
          editarse ni desactivarse desde acá.
        </p>
      </div>

      {/* Las tres actions se importan acá (server component) y se pasan por
          props, igual que `ComisionForm` en comisiones — no las importa
          directamente ningún client component. Si `docente-form.tsx`
          o `docente-acciones.tsx` volvieran a importar valores de
          `./actions`, Next compilaría ese módulo `"use server"` en la layer
          `action-browser` (porque sólo lo importaría un client component) en
          vez de `rsc`, con lo que `src/infrastructure/db.ts` y las entidades
          se duplican en el bundle y el ORM cacheado en `globalThis` queda
          con los prototipos de una copia mientras la otra hace `persist()`
          → "not discovered entity" (issue #90). */}
      <DocenteForm action={crearDocenteAction} />

      {!hayFilas ? (
        <DataEmpty>No hay nadie configurado todavía.</DataEmpty>
      ) : (
      <DataTable columns="1fr 1fr 110px 110px 140px">
        <DataHeader>
          <DataHeaderCell>Usuario</DataHeaderCell>
          <DataHeaderCell>Nombre</DataHeaderCell>
          <DataHeaderCell>Estado</DataHeaderCell>
          <DataHeaderCell>Origen</DataHeaderCell>
          <DataHeaderCell>Acciones</DataHeaderCell>
        </DataHeader>
        <DataBody>
          {entorno.map((githubUsername) => (
            <DataRow key={`entorno-${githubUsername}`}>
              <DataCell label="Usuario" heading>
                @{githubUsername}
              </DataCell>
              <DataCell label="Nombre">
                <span className="text-gray-400">—</span>
              </DataCell>
              <DataCell label="Estado">
                <EstadoBadge activo={true} />
              </DataCell>
              <DataCell label="Origen">
                <span
                  title="Configurado por ADMIN_GITHUB_USERNAMES: no se puede editar ni desactivar desde acá."
                  className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                >
                  Entorno
                </span>
              </DataCell>
              <DataCell label="Acciones">
                <span className="text-xs text-gray-400">Protegido</span>
              </DataCell>
            </DataRow>
          ))}

          {docentesDeAplicacion.map((docente) => (
            <DataRow key={docente.id}>
              <DataCell label="Usuario" heading>
                @{docente.githubUsername}
              </DataCell>
              <DataCell label="Nombre">
                <NombreEditable
                  id={docente.id}
                  nombre={docente.nombre}
                  action={renombrarDocenteAction}
                />
              </DataCell>
              <DataCell label="Estado">
                <EstadoBadge activo={docente.activo} />
              </DataCell>
              <DataCell label="Origen">
                <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                  Aplicación
                </span>
              </DataCell>
              <DataCell label="Acciones">
                <EstadoToggle
                  id={docente.id}
                  activo={docente.activo}
                  action={cambiarEstadoDocenteAction}
                />
              </DataCell>
            </DataRow>
          ))}
        </DataBody>
      </DataTable>
      )}
    </div>
  );
}

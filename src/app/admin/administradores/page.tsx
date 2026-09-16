import { requireResponsable } from "@/infrastructure/auth/session";
import { getAdministradores } from "@/infrastructure/repositories";
import { responsablesDeEntorno } from "@/lib/responsables-de-entorno";
import { AdministradorForm } from "./administrador-form";
import { NombreEditable, EstadoToggle } from "./administrador-acciones";
import {
  DataTable,
  DataHeader,
  DataHeaderCell,
  DataBody,
  DataRow,
  DataCell,
  DataEmpty,
} from "@/components/DataTable";

export default async function AdminAdministradoresPage() {
  await requireResponsable();
  const administradores = await getAdministradores();
  const entorno = responsablesDeEntorno();
  // Un administrador de base puede agregarse después a
  // `ADMIN_GITHUB_USERNAMES`: sin este filtro aparecería dos veces (fila
  // "Entorno" protegida + fila "Aplicación" editable). La política de fondo
  // (bloquear la mutación) vive en el repositorio; acá sólo se evita el
  // duplicado visual.
  const usernamesDeEntorno = new Set(entorno);
  const administradoresDeAplicacion = administradores.filter(
    (administrador) => !usernamesDeEntorno.has(administrador.githubUsername)
  );
  const hayFilas = administradoresDeAplicacion.length > 0 || entorno.length > 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Administradores</h1>
        <p className="text-sm text-gray-500 mt-1">
          Los ayudantes dados de alta acá reciben los mismos permisos docentes que un responsable,
          pero no pueden gestionar este panel. Los responsables configurados por entorno no pueden
          editarse ni desactivarse desde acá.
        </p>
      </div>

      <AdministradorForm />

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
                <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Activo
                </span>
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

          {administradoresDeAplicacion.map((administrador) => (
            <DataRow key={administrador.id}>
              <DataCell label="Usuario" heading>
                @{administrador.githubUsername}
              </DataCell>
              <DataCell label="Nombre">
                <NombreEditable id={administrador.id} nombre={administrador.nombre} />
              </DataCell>
              <DataCell label="Estado">
                {administrador.activo ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    Activo
                  </span>
                ) : (
                  <span className="text-xs font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    Inactivo
                  </span>
                )}
              </DataCell>
              <DataCell label="Origen">
                <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                  Aplicación
                </span>
              </DataCell>
              <DataCell label="Acciones">
                <EstadoToggle id={administrador.id} activo={administrador.activo} />
              </DataCell>
            </DataRow>
          ))}
        </DataBody>
      </DataTable>
      )}
    </div>
  );
}

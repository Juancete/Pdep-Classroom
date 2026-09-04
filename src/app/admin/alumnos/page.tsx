import { requireAdmin } from "@/infrastructure/auth/session";
import { getAlumnos } from "@/infrastructure/sheets";
import { getComisionActiva } from "@/infrastructure/repositories";
import Link from "next/link";
import {
  DataTable,
  DataHeader,
  DataHeaderCell,
  DataBody,
  DataRow,
  DataCell,
  DataEmpty,
} from "@/components/DataTable";

export default async function AdminAlumnosPage() {
  await requireAdmin();

  const comision = await getComisionActiva();
  if (!comision) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Alumnos</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center text-yellow-800">
          No hay ninguna comisión activa configurada.{" "}
          <Link href="/admin/comisiones/new" className="underline font-medium">
            Crear una comisión
          </Link>{" "}
          para poder ver los alumnos.
        </div>
      </div>
    );
  }

  const alumnos = await getAlumnos(comision.spreadsheetId, comision.columnConfig);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Alumnos</h1>
      <p className="text-gray-500 text-sm mb-6">
        Se leen de la planilla de Google Sheets.{" "}
        <span className="font-mono text-xs">{alumnos.length} alumnos</span>
      </p>

      {alumnos.length === 0 ? (
        <DataEmpty>No hay alumnos ingresados.</DataEmpty>
      ) : (
        <DataTable columns="1.5fr 100px 1.2fr 2fr">
          <DataHeader>
            <DataHeaderCell>Nombre</DataHeaderCell>
            <DataHeaderCell>Legajo</DataHeaderCell>
            <DataHeaderCell>GitHub</DataHeaderCell>
            <DataHeaderCell>Email</DataHeaderCell>
          </DataHeader>
          <DataBody>
            {alumnos.map((alumno) => (
              <DataRow key={alumno.legajo}>
                <DataCell label="Nombre" heading>
                  {alumno.nombreCompleto}
                </DataCell>
                <DataCell label="Legajo">
                  <span className="font-mono text-xs">{alumno.legajo}</span>
                </DataCell>
                <DataCell label="GitHub">
                  <a
                    href={`https://github.com/${alumno.githubUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-pdep-600 hover:underline break-all"
                  >
                    {alumno.githubUsername}
                  </a>
                </DataCell>
                <DataCell label="Email">
                  <span className="text-gray-500 text-xs break-all">
                    {alumno.email}
                  </span>
                </DataCell>
              </DataRow>
            ))}
          </DataBody>
        </DataTable>
      )}
    </div>
  );
}

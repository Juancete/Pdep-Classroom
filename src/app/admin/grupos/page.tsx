import { requireAdmin } from "@/lib/session";
import { getGrupos } from "@/lib/sheets";
import { PARADIGMAS } from "@/types";
import type { Paradigma } from "@/types";

export default async function AdminGruposPage({
  searchParams,
}: {
  searchParams: { paradigma?: string };
}) {
  await requireAdmin();

  const paradigmaFilter = PARADIGMAS.includes(
    searchParams.paradigma as Paradigma
  )
    ? (searchParams.paradigma as Paradigma)
    : undefined;

  const grupos = await getGrupos(paradigmaFilter);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Grupos</h1>
      <p className="text-gray-500 text-sm mb-6">
        Se leen de la hoja &quot;Grupos&quot; de la planilla de alumnos. Columnas:
        NombreGrupo | Paradigma | Miembro1 | Miembro2 | …
      </p>

      {/* Filtro por paradigma */}
      <div className="flex gap-2 mb-6">
        <a
          href="/admin/grupos"
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
            !paradigmaFilter
              ? "bg-pdep-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Todos
        </a>
        {PARADIGMAS.map((p) => (
          <a
            key={p}
            href={`/admin/grupos?paradigma=${p}`}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              paradigmaFilter === p
                ? "bg-pdep-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </a>
        ))}
      </div>

      {grupos.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          {paradigmaFilter
            ? `No hay grupos para ${paradigmaFilter}.`
            : "No hay grupos ingresados."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {grupos.map((grupo) => (
            <div
              key={grupo.id}
              className="bg-white border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold">{grupo.nombre}</h3>
                <span className="text-xs bg-pdep-100 text-pdep-700 px-2 py-0.5 rounded-full">
                  {grupo.paradigma}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {grupo.miembros.map((m) => (
                  <span
                    key={m}
                    className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-1 rounded"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { requireAdmin } from "@/lib/session";
import { getGrupos } from "@/lib/repositories";
import { PARADIGMAS } from "@/types";
import type { Paradigma } from "@/types";

export default async function AdminGruposPage(
  props: {
    searchParams: Promise<{ paradigma?: string }>;
  }
) {
  const searchParams = await props.searchParams;
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
        Grupos registrados por assignment. Cada grupo pertenece al TP para el
        que fue formado.
      </p>

      {/* Filtro por paradigma */}
      <div className="flex flex-wrap gap-2 mb-6">
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
        {PARADIGMAS.map((paradigma) => (
          <a
            key={paradigma}
            href={`/admin/grupos?paradigma=${paradigma}`}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              paradigmaFilter === paradigma
                ? "bg-pdep-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {paradigma.charAt(0).toUpperCase() + paradigma.slice(1)}
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
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold">{grupo.nombre}</h3>
                <span className="text-xs bg-pdep-100 text-pdep-700 px-2 py-0.5 rounded-full">
                  {grupo.paradigma}
                </span>
              </div>
              <p className="text-xs text-gray-400 mb-2">
                {grupo.assignment.titulo}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {grupo.usernamesDeMiembros().map((username) => (
                  <span
                    key={username}
                    className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-1 rounded"
                  >
                    {username}
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

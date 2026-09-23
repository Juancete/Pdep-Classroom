import { requireAdmin } from "@/infrastructure/auth/session";
import {
  getGrupos,
  getAlumnosByComision,
  getEntregasDeGrupos,
} from "@/infrastructure/repositories";
import { obtenerContextoDeComision } from "@/application/comisionConsultada";
import { AvisoSinComision } from "../aviso-sin-comision";
import { BarraDeComision } from "../barra-de-comision";
import { GrupoCard } from "../grupo-card";
import { resumirGrupoParaAdmin } from "../grupo-resumen";
import { PARADIGMAS } from "@/types";
import type { Paradigma } from "@/types";

export default async function AdminGruposPage(
  props: {
    searchParams: Promise<{ paradigma?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  await requireAdmin();

  // issue #114: la comisión consultada (activa u histórica) reemplaza a
  // "todas las comisiones a la vez" — sin comisión, ni se consulta el repo.
  const { contexto, comisiones } = await obtenerContextoDeComision();
  const comision = contexto.comisionConsultada();
  if (!comision) {
    return (
      <div>
        <BarraDeComision contexto={contexto} comisiones={comisiones} />
        <h1 className="text-2xl font-bold mb-1">Grupos</h1>
        <AvisoSinComision />
      </div>
    );
  }

  const paradigmaFilter = PARADIGMAS.includes(
    searchParams.paradigma as Paradigma
  )
    ? (searchParams.paradigma as Paradigma)
    : undefined;

  const [grupos, alumnos, entregasPorGrupo] = await Promise.all([
    getGrupos({ comisionId: comision.id, paradigma: paradigmaFilter }),
    getAlumnosByComision(comision.id),
    getEntregasDeGrupos({ comisionId: comision.id, paradigma: paradigmaFilter }),
  ]);
  const alumnosPorUsername = new Map(alumnos.map((alumno) => [alumno.usernameCanonico, alumno]));

  return (
    <div>
      <BarraDeComision contexto={contexto} comisiones={comisiones} />
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
        <div className="grid gap-3 grid-cols-1 xl:grid-cols-2">
          {grupos.map((grupo) => (
            <div key={grupo.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <GrupoCard
                assignmentId={grupo.assignment.id}
                conAcciones={false}
                grupo={resumirGrupoParaAdmin(grupo, {
                  grupos,
                  alumnosPorUsername,
                  entregasPorGrupo,
                  conDetalleDeEntrega: false,
                  conContextoDeAssignment: true,
                })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

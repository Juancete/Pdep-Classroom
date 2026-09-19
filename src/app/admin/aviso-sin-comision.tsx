import Link from "next/link";

// Bloque compartido por grupos/assignments/alumnos (issue #114) cuando el
// contexto de comisión no tiene ninguna comisión que consultar — ni una
// seleccionada ni una activa (`ContextoSinComision`). Antes vivía sólo en
// `alumnos/page.tsx`, específico para esa lista; ahora es el mismo aviso
// para las tres, sin llamar al repo correspondiente.
export function AvisoSinComision() {
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center text-yellow-800">
      No hay ninguna comisión activa configurada.{" "}
      <Link href="/admin/comisiones/new" className="underline font-medium">
        Crear una comisión
      </Link>{" "}
      para continuar.
    </div>
  );
}

type Props = {
  comision?: { anio: number; activa: boolean };
};

// Año + badge Activa/Histórica de un assignment, o "Sin comisión" si quedó
// huérfano (issue #114). Extraído de la columna "Comisión" de
// `admin/assignments/page.tsx` para reusarlo también en el encabezado del
// detalle (`admin/assignments/[id]/page.tsx`), donde antes no se indicaba a
// qué comisión pertenece el TP que se está viendo.
export function EtiquetaDeComision({ comision }: Props) {
  if (!comision) {
    return <span className="text-xs text-gray-400">Sin comisión</span>;
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
      {comision.anio}
      <span
        className={`rounded-full px-2 py-0.5 ${
          comision.activa ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
        }`}
      >
        {comision.activa ? "Activa" : "Histórica"}
      </span>
    </span>
  );
}

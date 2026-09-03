import type { NombreEstadoAssignment } from "@/types";

// Tabla de presentación por estado, no una cadena de ifs: cada fila es un
// dato (etiqueta + clases), no una rama de lógica.
const ESTILOS_POR_ESTADO: Record<
  NombreEstadoAssignment,
  { etiqueta: string; className: string }
> = {
  borrador: {
    etiqueta: "Borrador",
    className: "bg-gray-100 text-gray-600",
  },
  publicado: {
    etiqueta: "Publicado",
    className: "bg-green-50 text-green-700",
  },
  archivado: {
    etiqueta: "Archivado",
    className: "bg-amber-50 text-amber-700",
  },
};

export function EstadoAssignmentBadge({
  estado,
}: {
  estado: NombreEstadoAssignment;
}) {
  const { etiqueta, className } = ESTILOS_POR_ESTADO[estado];
  return (
    <span
      data-testid="estado-badge"
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${className}`}
    >
      {etiqueta}
    </span>
  );
}

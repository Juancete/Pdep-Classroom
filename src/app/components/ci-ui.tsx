import type { NombreResultadoCI } from "@/domain/entities";
import {
  CheckCircleIcon,
  XCircleIcon,
  SpinnerIcon,
  RefreshIcon,
} from "@/app/components/icons";
import type { ComponentType } from "react";

// Presentación por resultado de CI: etiqueta, detalle, color e ícono son
// dato de UI, no comportamiento de dominio — `ResultadoCI` (dominio) sabe
// las reglas (`permiteReejecucion()`, etc.), esta tabla sólo sabe mostrarlo.
// El texto se duplica a propósito respecto a
// `ResultadoCI.etiqueta()/detalle()`: importar la clase acá arrastraría
// `@/domain/entities` (y con ella MikroORM) al bundle del cliente, porque
// este componente se renderiza también desde `entregas-table.tsx` (client).
// Mismo motivo por el que `EstadoAssignmentBadge` no llama a
// `EstadoAssignment.etiqueta()`.
export const CI_UI: Record<
  NombreResultadoCI,
  {
    etiqueta: string;
    detalle: string;
    className: string;
    Icon: ComponentType<{ className?: string }>;
  }
> = {
  sin_consultar: {
    etiqueta: "Sin consultar",
    detalle: "Todavía no se consultó el estado de CI de este repo.",
    className: "bg-gray-50 text-gray-500 border-gray-200",
    Icon: RefreshIcon,
  },
  sin_ci: {
    etiqueta: "Sin CI",
    detalle: "El repo no tiene checks de CI configurados (o todavía no corrieron ninguno).",
    className: "bg-gray-50 text-gray-400 border-gray-200",
    Icon: RefreshIcon,
  },
  pendiente: {
    etiqueta: "Pendiente",
    detalle: "La ejecución de CI está encolada o corriendo.",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    Icon: SpinnerIcon,
  },
  passing: {
    etiqueta: "Passing",
    detalle: "CI passing. Resultado automático — no es la nota final.",
    className: "bg-green-50 text-green-700 border-green-200",
    Icon: CheckCircleIcon,
  },
  failing: {
    etiqueta: "Failing",
    detalle: "CI failing. Resultado automático — no es la nota final.",
    className: "bg-red-50 text-red-700 border-red-200",
    Icon: XCircleIcon,
  },
  cancelado: {
    etiqueta: "Cancelado",
    detalle: "La ejecución de CI fue cancelada o superó el tiempo máximo.",
    className: "bg-amber-50 text-amber-800 border-amber-200",
    Icon: XCircleIcon,
  },
  error_infra: {
    etiqueta: "Error de infraestructura",
    detalle:
      "La ejecución de CI requiere intervención manual o no llegó a correr los tests (fallo de infraestructura).",
    className: "bg-amber-50 text-amber-800 border-amber-200",
    Icon: XCircleIcon,
  },
};

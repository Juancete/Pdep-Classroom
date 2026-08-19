// Sólo tipo — se borra en compilación, así que no arrastra `@/domain/entities`
// (y con ella MikroORM) al bundle del cliente cuando este componente se
// renderiza desde un client component (`entregas-table.tsx`).
import type { NombreResultadoAutograding } from "@/domain/entities";
import { AUTOGRADING_UI } from "@/app/components/autograding-ui";

export function AutogradingBadge({
  resultadoNombre,
  runUrl,
}: {
  resultadoNombre: NombreResultadoAutograding;
  runUrl?: string;
}) {
  const { etiqueta, detalle, className, Icon } = AUTOGRADING_UI[resultadoNombre];

  const pill = (
    <span
      title={detalle}
      aria-label={detalle}
      className={`inline-flex items-center gap-1.5 text-xs border px-2.5 py-1 rounded-full font-medium ${className}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {etiqueta}
    </span>
  );

  if (!runUrl) return pill;

  return (
    <a
      href={runUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={`${detalle} Ver detalle en GitHub.`}
      className="hover:opacity-80 transition-opacity"
    >
      {pill}
    </a>
  );
}

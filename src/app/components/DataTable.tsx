import type { CSSProperties, ReactNode } from "react";

type Align = "left" | "right" | "center";

function alignClass(align: Align, prefix = "") {
  if (align === "right") return `${prefix}text-right`;
  if (align === "center") return `${prefix}text-center`;
  return "";
}

interface DataTableProps {
  /**
   * grid-template-columns aplicado en md+; ej: "2fr 1fr 1fr 100px 180px".
   * Evitá `auto`: el header y las filas son grids separados, y `auto` se
   * resuelve distinto en cada uno, desalineando las columnas.
   */
  columns: string;
  children: ReactNode;
  className?: string;
  /** Si true, no aplica el contenedor (bg/borde/rounded). Usalo cuando el padre envuelve. */
  bare?: boolean;
  /**
   * Ancho mínimo del grid (ej. "1100px") para tablas con muchas columnas:
   * en vez de aplastar cada columna hasta amontonar el contenido, el
   * contenedor scrollea horizontalmente a partir de ese ancho.
   */
  minWidth?: string;
}

export function DataTable({
  columns,
  children,
  className = "",
  bare = false,
  minWidth,
}: DataTableProps) {
  const style = {
    ["--data-cols" as string]: columns,
    ...(minWidth ? { ["--data-min-w" as string]: minWidth } : {}),
  } as CSSProperties;
  const baseClass = bare ? "" : "bg-white border border-gray-200 rounded-lg";
  const overflowClass = minWidth ? "overflow-x-auto" : bare ? "" : "overflow-hidden";
  const containerClass = [baseClass, overflowClass].filter(Boolean).join(" ");
  return (
    <div role="table" className={`${containerClass} ${className}`} style={style}>
      {children}
    </div>
  );
}

const ROW_TEMPLATE = {
  gridTemplateColumns: "var(--data-cols)",
} as CSSProperties;

// `md:min-w-[...]` en vez de un `minWidth` fijo en el style: en mobile la fila
// es `block` (no grid, ver DataRow) y no necesita ningún ancho mínimo — forzarlo
// ahí sólo produciría scroll horizontal en una tarjeta que ya apila su
// contenido. El mínimo únicamente tiene sentido a partir de md, cuando la fila
// pasa a ser un grid de verdad.
const MIN_WIDTH_DESDE_MD = "md:min-w-[var(--data-min-w,auto)]";

export function DataHeader({ children }: { children: ReactNode }) {
  return (
    <div role="rowgroup" className="hidden md:block">
      <div
        role="row"
        className={`grid gap-3 bg-gray-50 border-b border-gray-200 px-4 py-3 text-xs font-medium text-gray-600 uppercase tracking-wide items-center ${MIN_WIDTH_DESDE_MD}`}
        style={ROW_TEMPLATE}
      >
        {children}
      </div>
    </div>
  );
}

export function DataHeaderCell({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: Align;
}) {
  return (
    <div role="columnheader" className={`min-w-0 ${alignClass(align)}`}>
      {children}
    </div>
  );
}

export function DataBody({ children }: { children: ReactNode }) {
  return (
    <div role="rowgroup" className="divide-y divide-gray-100">
      {children}
    </div>
  );
}

export function DataRow({ children }: { children: ReactNode }) {
  return (
    <div
      role="row"
      className={`block md:grid md:gap-3 md:items-center px-4 py-4 md:py-3 hover:bg-gray-50 space-y-3 md:space-y-0 text-sm ${MIN_WIDTH_DESDE_MD}`}
      style={ROW_TEMPLATE}
    >
      {children}
    </div>
  );
}

interface DataCellProps {
  /** Prefijo del valor en mobile (oculto en md+). Vacío = no se muestra. */
  label: string;
  children: ReactNode;
  align?: Align;
  className?: string;
  /**
   * En mobile, destaca el valor como título de la card (más grande, bold)
   * y oculta el label. En desktop se comporta como una celda normal.
   */
  heading?: boolean;
}

export function DataCell({
  label,
  children,
  align = "left",
  className = "",
  heading = false,
}: DataCellProps) {
  const showLabel = label && !heading;
  const valueClass = heading
    ? "text-base font-semibold text-gray-900 md:text-sm md:font-medium"
    : "";
  return (
    <div role="cell" className={`min-w-0 ${alignClass(align, "md:")} ${className}`}>
      {showLabel && (
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5 md:hidden">
          {label}
        </div>
      )}
      <div className={valueClass}>{children}</div>
    </div>
  );
}

export function DataEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
      {children}
    </div>
  );
}

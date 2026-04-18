import type { CSSProperties, ReactNode } from "react";

type Align = "left" | "right" | "center";

function alignClass(align: Align, prefix = "") {
  if (align === "right") return `${prefix}text-right`;
  if (align === "center") return `${prefix}text-center`;
  return "";
}

interface DataTableProps {
  /** grid-template-columns aplicado en md+; ej: "2fr 1fr 1fr 100px auto" */
  columns: string;
  children: ReactNode;
  className?: string;
}

export function DataTable({ columns, children, className = "" }: DataTableProps) {
  const style = { ["--data-cols" as string]: columns } as CSSProperties;
  return (
    <div
      className={`bg-white border border-gray-200 rounded-lg overflow-hidden ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

const ROW_TEMPLATE = { gridTemplateColumns: "var(--data-cols)" } as CSSProperties;

export function DataHeader({ children }: { children: ReactNode }) {
  return (
    <div
      className="hidden md:grid gap-3 bg-gray-50 border-b border-gray-200 px-4 py-3 text-xs font-medium text-gray-600 uppercase tracking-wide items-center"
      style={ROW_TEMPLATE}
    >
      {children}
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
  return <div className={alignClass(align)}>{children}</div>;
}

export function DataBody({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-gray-100">{children}</div>;
}

export function DataRow({ children }: { children: ReactNode }) {
  return (
    <div
      className="block md:grid md:gap-3 md:items-center px-4 py-4 md:py-3 hover:bg-gray-50 space-y-3 md:space-y-0 text-sm"
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
    <div className={`min-w-0 ${alignClass(align, "md:")} ${className}`}>
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

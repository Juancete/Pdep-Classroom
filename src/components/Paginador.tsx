import Link from "next/link";

interface PaginadorProps {
  page: number;
  totalPages: number;
  hrefDePagina: (page: number) => string;
  ariaLabel: string;
}

export function Paginador({ page, totalPages, hrefDePagina, ariaLabel }: PaginadorProps) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label={ariaLabel} className="mt-4 flex items-center justify-between text-sm">
      {page > 1 ? (
        <Link className="text-pdep-600 hover:text-pdep-800" href={hrefDePagina(page - 1)}>← Anterior</Link>
      ) : (
        <span className="text-gray-300">← Anterior</span>
      )}
      <span className="text-gray-500">Página {page} de {totalPages}</span>
      {page < totalPages ? (
        <Link className="text-pdep-600 hover:text-pdep-800" href={hrefDePagina(page + 1)}>Siguiente →</Link>
      ) : (
        <span className="text-gray-300">Siguiente →</span>
      )}
    </nav>
  );
}

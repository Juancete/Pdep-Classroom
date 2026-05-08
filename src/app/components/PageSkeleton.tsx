// Skeleton que replica la card del dashboard (título + badges + botón)
export function DashboardSkeleton() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Mis Trabajos Prácticos</h1>
      <div className="h-5 bg-gray-200 rounded w-72 mb-6 animate-pulse" />
      <div className="space-y-3">
        {[...Array(3)].map((_, index) => (
          <div
            key={index}
            className="bg-white border border-gray-200 rounded-lg p-5 flex items-center justify-between animate-pulse"
          >
            <div className="flex-1 space-y-2">
              {/* Título + badges */}
              <div className="flex items-center gap-2">
                <div className="h-5 bg-gray-200 rounded w-48" />
                <div className="h-5 bg-gray-100 rounded-full w-16" />
                <div className="h-5 bg-gray-100 rounded-full w-16" />
              </div>
              {/* Descripción */}
              <div className="h-4 bg-gray-100 rounded w-64" />
              {/* Deadline */}
              <div className="h-3 bg-gray-100 rounded w-36" />
            </div>
            {/* Botón */}
            <div className="h-8 bg-gray-200 rounded-lg w-24 ml-4 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Skeleton que replica la tabla de assignments del admin
export function AssignmentsTableSkeleton() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Assignments</h1>
        <div className="h-9 bg-gray-200 rounded-lg w-36 animate-pulse" />
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden animate-pulse">
        {/* Header */}
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex gap-6">
          {[140, 80, 60, 120, 60, 80, 80].map((width, index) => (
            <div key={index} className="h-4 bg-gray-200 rounded" style={{ width }} />
          ))}
        </div>
        {/* Filas */}
        {[...Array(4)].map((_, index) => (
          <div key={index} className="px-4 py-3 border-b border-gray-100 flex gap-6 items-center">
            <div className="h-4 bg-gray-100 rounded w-36" />
            <div className="h-5 bg-gray-100 rounded-full w-20" />
            <div className="h-4 bg-gray-100 rounded w-16" />
            <div className="h-4 bg-gray-100 rounded w-28 font-mono" />
            <div className="h-4 bg-gray-100 rounded w-8" />
            <div className="h-4 bg-gray-100 rounded w-20" />
            <div className="flex gap-3">
              <div className="h-4 bg-gray-100 rounded w-10" />
              <div className="h-4 bg-gray-100 rounded w-14" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Skeleton genérico para páginas de lista simple (alumnos, grupos)
export function ListSkeleton({ title, rows = 6 }: { title: string; rows?: number }) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{title}</h1>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden animate-pulse">
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex gap-6">
          {[120, 100, 140, 80].map((width, index) => (
            <div key={index} className="h-4 bg-gray-200 rounded" style={{ width }} />
          ))}
        </div>
        {[...Array(rows)].map((_, index) => (
          <div key={index} className="px-4 py-3 border-b border-gray-100 flex gap-6 items-center">
            <div className="h-4 bg-gray-100 rounded w-28" />
            <div className="h-4 bg-gray-100 rounded w-24" />
            <div className="h-4 bg-gray-100 rounded w-36" />
            <div className="h-4 bg-gray-100 rounded w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

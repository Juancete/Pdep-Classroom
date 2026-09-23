export function RepoDeEntrega({
  estadoRepo,
  repoUrl,
}: {
  estadoRepo: "borrado" | "activo" | "sin-repo";
  repoUrl?: string;
}) {
  return (
    <>
      {estadoRepo === "borrado" && (
        <span className="text-red-400 text-xs">Repositorio borrado</span>
      )}
      {estadoRepo === "activo" && (
        <a
          href={repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg font-medium hover:bg-green-100 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
          Ir al repo
        </a>
      )}
      {estadoRepo === "sin-repo" && (
        <span className="text-gray-400 text-xs">Sin repo</span>
      )}
    </>
  );
}

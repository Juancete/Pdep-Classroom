import type { ReactNode } from "react";

export type EstadoRepo = "borrado" | "activo" | "sin-repo";

export function LinkAlRepo({ repoUrl, className }: { repoUrl: string; className?: string }) {
  return (
    <a
      href={repoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-sm bg-green-50 text-green-700 border border-green-200 px-3 rounded-lg font-medium hover:bg-green-100 transition-colors ${className ?? ""}`}
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
  );
}

const VISTA_POR_ESTADO_REPO: Record<EstadoRepo, (repoUrl?: string) => ReactNode> = {
  borrado: () => <span className="text-red-400 text-xs">Repositorio borrado</span>,
  activo: (repoUrl) => (repoUrl ? <LinkAlRepo repoUrl={repoUrl} className="py-1.5" /> : null),
  "sin-repo": () => <span className="text-gray-400 text-xs">Sin repo</span>,
};

export function RepoDeEntrega({
  estadoRepo,
  repoUrl,
}: {
  estadoRepo: EstadoRepo;
  repoUrl?: string;
}) {
  return <>{VISTA_POR_ESTADO_REPO[estadoRepo](repoUrl)}</>;
}

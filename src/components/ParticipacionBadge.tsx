// Sin "use client" y sin imports de dominio (issue #122): se renderiza
// desde `entregas-table.tsx` y `grupo-card.tsx` (ambos client), y no debe
// arrastrar `@/domain/entities` (y con ella MikroORM) al bundle del cliente
// — mismo motivo que `CIBadge`/`ci-ui.tsx`. No hace falta: los tres datos
// que necesita ya vienen resueltos por el caller (`Entrega.participacionDe`).
export const PARTICIPACION_AYUDA =
  "Porcentaje de commits del integrante sobre los commits de los integrantes, según GitHub (puede tener unas horas de atraso). Es un indicador orientativo para saber por dónde empezar a preguntar, no una nota: el pair programming en una sola máquina concentra los commits en un solo usuario.";

// Estilo por caso (tabla, no ternario anidado en el JSX): sin commits es
// justamente el caso "por dónde empezar a preguntar" de la ayuda de arriba,
// así que se resalta en ámbar — sin llegar a rojo/verde, tono de indicador
// y no de nota.
const ESTILO_POR_CASO: Record<"conCommits" | "sinCommits", string> = {
  conCommits: "bg-gray-50 text-gray-600 border-gray-200",
  sinCommits: "bg-amber-50 text-amber-700 border-amber-200",
};

// Única fuente de la pluralización "N commit(s)" — la usan el badge acá y
// las dos vistas que muestran el total del repo (`entregas-table.tsx`,
// `grupo-card.tsx`), antes duplicada como `commits === 1 ? "commit" : "commits"`
// en los tres lugares.
export function etiquetaDeCommits(cantidad: number): string {
  return `${cantidad} commit${cantidad === 1 ? "" : "s"}`;
}

export function ParticipacionBadge({
  username,
  commits,
  porcentaje,
}: {
  username?: string;
  commits: number;
  porcentaje: number;
}) {
  const className = ESTILO_POR_CASO[commits === 0 ? "sinCommits" : "conCommits"];
  // Nombre accesible corto: sólo el resumen puntual (quién, cuánto) — un
  // lector de pantalla no debe escuchar `PARTICIPACION_AYUDA` completa por
  // cada integrante. La ayuda larga queda sólo en `title`.
  const resumen = `Participación${username ? ` de @${username}` : ""}: ${porcentaje}% (${etiquetaDeCommits(commits)})`;

  return (
    <span
      title={PARTICIPACION_AYUDA}
      aria-label={resumen}
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${className}`}
    >
      {username && <span className="font-mono">@{username}</span>}
      <span>
        {porcentaje}% · {etiquetaDeCommits(commits)}
      </span>
    </span>
  );
}

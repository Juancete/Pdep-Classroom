// Sin "use client": issue #138. `import type` para no arrastrar
// `@/domain/entities` (y con ella MikroORM) al bundle del cliente cuando
// este componente se renderiza desde un client component — mismo
// precedente que `CIBadge`/`ParticipacionBadge`.
import type { IntegranteResumen } from "@/domain/entities";

// Estilo y texto por caso (tabla, no ternario anidado en el JSX) — molde
// `ESTILO_POR_CASO` de `ParticipacionBadge.tsx`. El chip "sin acceso" lleva
// además un `title` que explica por qué: el integrante se sumó al grupo
// después de que se aceptó el TP y todavía tiene que pedir el acceso desde
// la página del grupo (issue #123).
const ESTILO_POR_CASO: Record<
  "conAcceso" | "sinAcceso",
  { className: string; texto: string; title?: string }
> = {
  conAcceso: {
    className: "bg-green-50 text-green-700 border-green-200",
    texto: "Con acceso al repo",
  },
  sinAcceso: {
    className: "bg-amber-50 text-amber-700 border-amber-200",
    texto: "Sin acceso al repo",
    title:
      "Todavía no tiene acceso al repositorio: tiene que pedirlo desde la página del grupo.",
  },
};

function ChipDeAcceso({ tieneAcceso }: { tieneAcceso: boolean }) {
  const caso = tieneAcceso ? "conAcceso" : "sinAcceso";
  const { className, texto, title } = ESTILO_POR_CASO[caso];
  return (
    <span
      title={title}
      className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border ${className}`}
    >
      {texto}
    </span>
  );
}

/**
 * Lista de integrantes de un grupo (issue #138): nombre completo + username,
 * y si el grupo tiene repo (`tieneRepo`), un chip de acceso por integrante.
 * `integrantes` ya trae `tieneAccesoAlRepo` resuelto por
 * `Grupo.resumenDeIntegrantes` — este componente sólo lo pinta. Sin
 * `tieneRepo`, no tiene sentido mostrar chips (todavía no hay repo del que
 * tener o no acceso). La usan la tarjeta de Mis TPs y la página de grupo
 * (`MiGrupo`).
 */
export function ListaDeIntegrantes({
  integrantes,
  tieneRepo,
}: {
  integrantes: IntegranteResumen[];
  tieneRepo: boolean;
}) {
  return (
    <ul className="space-y-1">
      {integrantes.map((integrante) => (
        <li key={integrante.username} className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-700">
            {integrante.nombreCompleto && <>{integrante.nombreCompleto} </>}
            <span className={`font-mono ${integrante.nombreCompleto ? "text-gray-400" : ""}`}>
              @{integrante.username}
            </span>
          </span>
          {tieneRepo && <ChipDeAcceso tieneAcceso={integrante.tieneAccesoAlRepo} />}
        </li>
      ))}
    </ul>
  );
}

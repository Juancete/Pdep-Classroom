import type { GrupoAdminResumen } from "./grupo-resumen";

// Config por acción: texto del botón, confirmación base y estilo — dato, no
// rama de lógica. Mismo idioma que `estado-panel.tsx`.
export const ACCIONES: Record<
  "quitar" | "mover" | "agregar",
  { etiquetaBoton: string; confirmacion: string; className: string }
> = {
  quitar: {
    etiquetaBoton: "Quitar",
    confirmacion: "¿Seguro que querés quitar a este alumno del grupo?",
    className: "text-red-600 hover:text-red-800",
  },
  mover: {
    etiquetaBoton: "Mover",
    confirmacion: "¿Seguro que querés mover a este alumno de grupo?",
    className: "text-pdep-600 hover:text-pdep-800",
  },
  agregar: {
    etiquetaBoton: "Agregar",
    confirmacion: "¿Seguro que querés agregar a este alumno al grupo?",
    className: "text-pdep-600 hover:text-pdep-800",
  },
};

// Advertencias que se agregan a la confirmación según el estado del grupo
// afectado — también dato, para no meter ifs en el render.
export const ADVERTENCIAS: {
  aplica: (grupo: GrupoAdminResumen) => boolean;
  texto: (accion: "quitar" | "mover" | "agregar") => string;
}[] = [
  {
    aplica: (grupo) => grupo.entrega !== undefined,
    texto: (accion) =>
      accion === "agregar"
        ? "El grupo ya aceptó el TP: se le va a dar acceso al repositorio. Si GitHub falla, el cambio no se aplica."
        : "El grupo ya aceptó el TP: se le va a revocar el acceso al repositorio. Si GitHub falla, el cambio no se aplica.",
  },
  {
    aplica: (grupo) => grupo.miembros.length === 1 && grupo.entrega === undefined,
    texto: () => "Es el último integrante: el grupo se va a eliminar y su nombre queda libre.",
  },
];

export function confirmacionPara(
  accion: "quitar" | "mover" | "agregar",
  grupoAfectado: GrupoAdminResumen
): string {
  const advertencias = ADVERTENCIAS.filter((item) => item.aplica(grupoAfectado)).map(
    (item) => item.texto(accion)
  );
  return [ACCIONES[accion].confirmacion, ...advertencias].join(" ");
}

// Aparte de ADVERTENCIAS: "último integrante" no tiene sentido evaluado
// sobre el destino de un movimiento (gana un integrante, no lo pierde), así
// que el destino sólo suma esta advertencia puntual sobre el acceso al repo.
export function advertenciaEntregaDestino(grupoDestino: { conEntrega: boolean }): string | null {
  return grupoDestino.conEntrega
    ? "El grupo destino ya aceptó el TP: se le va a dar acceso al repositorio del grupo destino. Si GitHub falla, el cambio no se aplica."
    : null;
}

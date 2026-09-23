import type { GrupoAdminResumen } from "./grupo-resumen";

export type AlumnoAfectado = { username: string; nombreCompleto: string };

// La confirmación nombra al alumno y al grupo para que el docente vea sobre
// quién está actuando: en una card con varios integrantes "este alumno" no
// alcanza para distinguir a cuál le tocó el botón.
export function etiquetaDeAlumno(alumno: AlumnoAfectado): string {
  return `${alumno.nombreCompleto} (@${alumno.username})`;
}

// Config por acción: texto del botón, confirmación base y estilo — dato, no
// rama de lógica. Mismo idioma que `estado-panel.tsx`.
export const ACCIONES: Record<
  "quitar" | "mover" | "agregar",
  {
    etiquetaBoton: string;
    confirmacion: (alumno: string, grupo: string, grupoDestino?: string) => string;
    className: string;
  }
> = {
  quitar: {
    etiquetaBoton: "Quitar",
    confirmacion: (alumno, grupo) =>
      `¿Seguro que querés quitar a ${alumno} del grupo "${grupo}"?`,
    className: "text-red-600 hover:text-red-800",
  },
  mover: {
    etiquetaBoton: "Mover",
    confirmacion: (alumno, grupo, grupoDestino) =>
      `¿Seguro que querés mover a ${alumno} del grupo "${grupo}" al grupo "${grupoDestino}"?`,
    className: "text-pdep-600 hover:text-pdep-800",
  },
  agregar: {
    etiquetaBoton: "Agregar",
    confirmacion: (alumno, grupo) =>
      `¿Seguro que querés agregar a ${alumno} al grupo "${grupo}"?`,
    className: "text-pdep-600 hover:text-pdep-800",
  },
};

// Advertencias que se agregan a la confirmación según el estado del grupo
// afectado — también dato, para no meter ifs en el render.
export const ADVERTENCIAS: {
  aplica: (grupo: GrupoAdminResumen, accion: "quitar" | "mover" | "agregar") => boolean;
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
    aplica: (grupo, accion) =>
      accion !== "agregar" && grupo.miembros.length === 1 && grupo.entrega === undefined,
    texto: () => "Es el último integrante: el grupo se va a eliminar y su nombre queda libre.",
  },
];

// `grupoAfectado` es el que pierde o gana al alumno y del que salen las
// advertencias; `grupoDestino` sólo aplica a "mover" y se usa en el texto.
export function confirmacionPara(
  accion: "quitar" | "mover" | "agregar",
  grupoAfectado: GrupoAdminResumen,
  alumno: AlumnoAfectado,
  grupoDestino?: { nombre: string }
): string {
  const advertencias = ADVERTENCIAS.filter((item) => item.aplica(grupoAfectado, accion)).map(
    (item) => item.texto(accion)
  );
  const base = ACCIONES[accion].confirmacion(
    etiquetaDeAlumno(alumno),
    grupoAfectado.nombre,
    grupoDestino?.nombre
  );
  return [base, ...advertencias].join(" ");
}

// Aparte de ADVERTENCIAS: "último integrante" no tiene sentido evaluado
// sobre el destino de un movimiento (gana un integrante, no lo pierde), así
// que el destino sólo suma esta advertencia puntual sobre el acceso al repo.
export function advertenciaEntregaDestino(grupoDestino: { conEntrega: boolean }): string | null {
  return grupoDestino.conEntrega
    ? "El grupo destino ya aceptó el TP: se le va a dar acceso al repositorio del grupo destino. Si GitHub falla, el cambio no se aplica."
    : null;
}

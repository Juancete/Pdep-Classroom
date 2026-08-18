import type { NombreEstadoAssignment } from "@/types";
import { PublishIcon, ArchiveIcon, UndoIcon } from "@/app/components/icons";
import type { ComponentType } from "react";

// Config por transición: texto del botón, ícono, consecuencia explicada en
// el confirm() y estilo — dato, no rama de lógica. Compartido entre el panel
// completo (`EstadoPanel`) y las acciones rápidas de la grilla
// (`EstadoQuickActions`), para que ambos lugares digan siempre lo mismo.
export const ACCIONES_ESTADO: Record<
  NombreEstadoAssignment,
  {
    etiquetaBoton: string;
    confirmacion: string;
    className: string;
    Icon: ComponentType<{ className?: string }>;
  }
> = {
  borrador: {
    etiquetaBoton: "Volver a borrador",
    confirmacion:
      "El TP deja de estar visible para los alumnos. Solo se puede porque todavía no tiene entregas.",
    className: "bg-gray-600 text-white hover:bg-gray-700",
    Icon: UndoIcon,
  },
  publicado: {
    etiquetaBoton: "Publicar",
    confirmacion:
      "El TP va a quedar visible para los alumnos de la comisión, que van a poder aceptarlo y crear sus repos.",
    className: "bg-green-600 text-white hover:bg-green-700",
    Icon: PublishIcon,
  },
  archivado: {
    etiquetaBoton: "Archivar",
    confirmacion:
      "Los alumnos sin entrega dejan de ver el TP. Los que ya entregaron lo siguen viendo, archivado, con acceso a su repo. No se borran repos ni entregas. Una vez archivado, ya no se puede despublicar.",
    className: "bg-amber-600 text-white hover:bg-amber-700",
    Icon: ArchiveIcon,
  },
};

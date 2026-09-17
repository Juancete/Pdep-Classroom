"use client";

import { useActionState } from "react";
import type { DocenteFormState } from "./actions";
import { INPUT_CLASS, INPUT_ERROR_CLASS, FieldError, SubmitButton } from "../ui";

const INITIAL_STATE: DocenteFormState = null;

type Props = {
  // Recibida por prop desde el server component (`page.tsx`): ver el
  // comentario ahí sobre por qué este client component no importa la action
  // directamente (issue #90).
  action: (
    prevState: DocenteFormState,
    formData: FormData
  ) => Promise<DocenteFormState>;
};

export function DocenteForm({ action }: Props) {
  const [state, formAction] = useActionState(action, INITIAL_STATE);
  const errors = state && !state.ok ? state.errors : {};

  // React 19 resetea automáticamente los inputs no controlados de un
  // `<form action={...}>` cuando la action termina, con éxito o sin él (no
  // hace falta un `useEffect` + `formRef.reset()` para eso). Como ese reset
  // vuelve a aplicar los `defaultValue` del render nuevo, alcanza con que la
  // action devuelva lo que el usuario tipeó: se repone ante error y queda
  // vacío ante éxito (la fila nueva ya está en la tabla gracias a
  // `revalidatePath`, no hay a dónde redirigir — pantalla única, issue #83).
  const valores = state && !state.ok ? (state.valores ?? {}) : {};

  return (
    <form action={formAction} className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Nuevo docente</h2>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-start">
        <div className="flex-1">
          <label htmlFor="docente-githubUsername" className="block text-xs font-medium text-gray-600 mb-1">Usuario de GitHub *</label>
          <input
            id="docente-githubUsername"
            name="githubUsername"
            type="text"
            placeholder="ej: docente1"
            required
            defaultValue={valores.githubUsername ?? ""}
            className={errors.githubUsername ? INPUT_ERROR_CLASS : INPUT_CLASS}
          />
          <FieldError message={errors.githubUsername?.[0]} />
        </div>
        <div className="flex-1">
          <label htmlFor="docente-nombre" className="block text-xs font-medium text-gray-600 mb-1">Nombre de referencia</label>
          <input
            id="docente-nombre"
            name="nombre"
            type="text"
            placeholder="opcional"
            defaultValue={valores.nombre ?? ""}
            className={errors.nombre ? INPUT_ERROR_CLASS : INPUT_CLASS}
          />
          <FieldError message={errors.nombre?.[0]} />
        </div>
        <div className="sm:pt-6">
          <SubmitButton label="Agregar" />
        </div>
      </div>
    </form>
  );
}

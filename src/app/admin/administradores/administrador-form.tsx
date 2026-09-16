"use client";

import { useActionState, useEffect, useRef } from "react";
import { crearAdministradorAction, type AdministradorFormState } from "./actions";
import { INPUT_CLASS, INPUT_ERROR_CLASS, FieldError, SubmitButton } from "../ui";

const INITIAL_STATE: AdministradorFormState = null;

export function AdministradorForm() {
  const [state, formAction] = useActionState(crearAdministradorAction, INITIAL_STATE);
  const errors = state && !state.ok ? state.errors : {};
  const formRef = useRef<HTMLFormElement>(null);

  // Alta exitosa: la fila nueva ya está en la tabla gracias a
  // `revalidatePath`, así que el form sólo necesita limpiarse para el
  // próximo alta — no hay a dónde redirigir (pantalla única, issue #83).
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Nuevo administrador</h2>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-start">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">Usuario de GitHub *</label>
          <input
            name="githubUsername"
            type="text"
            placeholder="ej: ayudante1"
            required
            className={errors.githubUsername ? INPUT_ERROR_CLASS : INPUT_CLASS}
          />
          <FieldError message={errors.githubUsername?.[0]} />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de referencia</label>
          <input
            name="nombre"
            type="text"
            placeholder="opcional"
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

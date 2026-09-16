"use client";

import { useState } from "react";
import { renombrarAdministradorAction, cambiarEstadoAdministradorAction } from "./actions";
import { INPUT_CLASS, FieldError, SubmitButton } from "../ui";
import { PencilIcon, SpinnerIcon } from "@/components/icons";

export function NombreEditable({ id, nombre }: { id: string; nombre: string | null }) {
  const [editando, setEditando] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  // Lo que el usuario tipeó en un intento rechazado — React resetea el
  // input no controlado al terminar el submit, así que se repone como
  // `defaultValue` en el próximo render (mismo patrón que
  // `administrador-form.tsx`); se limpia en éxito y al cancelar.
  const [nombreEnviado, setNombreEnviado] = useState<string | null>(null);

  // Llamada directa a la server action (no `useActionState`): así el cierre
  // del modo edición queda en el handler que lo dispara, no en un efecto que
  // reaccione al cambio de estado — evita el set-state-en-efecto que dispara
  // un render en cascada. Sólo se cierra en éxito: si la validación falla,
  // se queda abierto mostrando el error en vez de perderlo.
  async function handleSubmit(formData: FormData) {
    const resultado = await renombrarAdministradorAction(null, formData);
    if (resultado?.ok) {
      setEditando(false);
      setErrors({});
      setNombreEnviado(null);
    } else if (resultado) {
      setErrors(resultado.errors);
      setNombreEnviado(String(formData.get("nombre") ?? ""));
    }
  }

  if (!editando) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={nombre ? "" : "text-gray-400 italic"}>{nombre ?? "sin nombre"}</span>
        <button
          type="button"
          onClick={() => setEditando(true)}
          title="Editar nombre"
          aria-label="Editar nombre"
          className="text-gray-400 hover:text-gray-700 transition-colors"
        >
          <PencilIcon className="w-3.5 h-3.5" />
        </button>
      </span>
    );
  }

  return (
    <form action={handleSubmit} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="nombre"
        aria-label="Nombre de referencia"
        type="text"
        defaultValue={nombreEnviado ?? nombre ?? ""}
        placeholder="opcional"
        autoFocus
        className={`${INPUT_CLASS} py-1 text-xs`}
      />
      <SubmitButton label="Guardar" />
      <button
        type="button"
        onClick={() => {
          setEditando(false);
          setErrors({});
          setNombreEnviado(null);
        }}
        className="text-xs text-gray-500 hover:text-gray-700"
      >
        Cancelar
      </button>
      <FieldError message={errors.nombre?.[0]} />
    </form>
  );
}

export function EstadoToggle({ id, activo }: { id: string; activo: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Llamada directa a la server action, sin `useApiCall`: esa versión
  // convertía el `{ ok: false, error }` de la action en un `throw` sólo para
  // que `useApiCall` lo volviera a capturar como string — acá se maneja
  // directo, sin la vuelta.
  async function handleClick() {
    if (activo) {
      const confirmado = confirm(
        "¿Desactivar este docente? Sólo se revocan sus permisos administrativos desde la " +
          "próxima solicitud — no se borra su cuenta, sus datos académicos ni sus accesos a " +
          "repositorios de GitHub. Podés reactivarlo cuando quieras."
      );
      if (!confirmado) return;
    }
    setLoading(true);
    setError(null);
    try {
      const resultado = await cambiarEstadoAdministradorAction(id, !activo);
      if (!resultado.ok) setError(resultado.error);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className={`text-xs font-medium disabled:opacity-50 ${
          activo ? "text-red-600 hover:text-red-800" : "text-pdep-600 hover:text-pdep-800"
        }`}
      >
        {loading ? (
          <span className="inline-flex items-center gap-1">
            <SpinnerIcon className="w-3.5 h-3.5" /> {activo ? "Desactivando…" : "Reactivando…"}
          </span>
        ) : activo ? (
          "Desactivar"
        ) : (
          "Reactivar"
        )}
      </button>
      {error && <span className="text-red-600 text-xs">{error}</span>}
    </span>
  );
}

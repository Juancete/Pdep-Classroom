"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useApiCall } from "@/app/hooks/useApiCall";

const INPUT_CLASS =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none";
const READONLY_CLASS =
  "w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm font-mono text-gray-500";

export interface AlumnoFormValues {
  githubUsername: string;
  legajo?: string;
  apellido?: string;
  nombre?: string;
  email?: string;
}

type Props = {
  defaultValues: AlumnoFormValues;
  apiEndpoint: string;
  method: "POST" | "PATCH";
  /** Campos adicionales a mergear en el body (ej: githubUsername para registro) */
  extraBody?: Record<string, string>;
  /** Si se indica, redirige a esta URL tras el éxito */
  onSuccessRedirect?: string;
  submitLabel: string;
  successMessage: string;
};

export function AlumnoForm({
  defaultValues,
  apiEndpoint,
  method,
  extraBody,
  onSuccessRedirect,
  submitLabel,
  successMessage,
}: Props) {
  const { loading, error, call } = useApiCall();
  const [success, setSuccess] = useState(false);
  const [groupWarning, setGroupWarning] = useState(false);
  const [fieldError, setFieldError] = useState<{ message: string; field: string } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldError(null);
    const form = new FormData(e.currentTarget);
    await call(async () => {
      const body = {
        legajo: form.get("legajo") as string,
        apellido: form.get("apellido") as string,
        nombre: form.get("nombre") as string,
        email: form.get("email") as string,
        ...extraBody,
      };
      const res = await fetch(apiEndpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        if (typeof json.field === "string") {
          setFieldError({ message: json.error, field: json.field });
        }
        throw new Error(json.error ?? "Error al guardar");
      }
      const hasGroupWarning = json.groupSubscription === "error";
      setGroupWarning(hasGroupWarning);
      setSuccess(true);
      // Damos más tiempo antes de redirigir si hay que mostrar el warning
      // para que el alumno alcance a leerlo.
      if (onSuccessRedirect) {
        const delay = hasGroupWarning ? 5000 : 1500;
        setTimeout(() => { window.location.href = onSuccessRedirect; }, delay);
      }
    });
  }

  if (success) {
    return (
      <div className="space-y-3">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <p className="text-green-700 font-medium">{successMessage}</p>
        </div>
        {groupWarning && (
          <div
            role="alert"
            className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800"
          >
            No pudimos suscribirte al grupo del curso. Avisale a un docente para que te agregue manualmente.
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Usuario de GitHub
        </label>
        <input value={defaultValues.githubUsername} disabled className={READONLY_CLASS} />
        {fieldError?.field === "githubUsername" && (
          <div className="mt-1 text-xs text-red-700 space-y-1">
            <p role="alert">{fieldError.message}</p>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="underline font-medium hover:text-red-900"
            >
              Cerrar sesión y entrar con otra cuenta
            </button>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Legajo <span className="text-red-500">*</span>
        </label>
        <input
          name="legajo"
          required
          pattern="\d{4,8}"
          inputMode="numeric"
          placeholder="12345678"
          defaultValue={defaultValues.legajo}
          className={INPUT_CLASS}
        />
        {fieldError?.field === "legajo" && (
          <p role="alert" className="mt-1 text-xs text-red-700">
            {fieldError.message}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Apellido <span className="text-red-500">*</span>
        </label>
        <input
          name="apellido"
          required
          defaultValue={defaultValues.apellido}
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Nombre <span className="text-red-500">*</span>
        </label>
        <input
          name="nombre"
          required
          defaultValue={defaultValues.nombre}
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          name="email"
          type="email"
          required
          pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
          title="Ingresá un email con formato válido (usuario@dominio.com)"
          defaultValue={defaultValues.email}
          className={INPUT_CLASS}
        />
        <p className="text-xs text-gray-500 mt-1">
          Ingresá un email que leas asiduamente — por este canal mandamos
          avisos importantes del curso.
        </p>
      </div>

      {error && !fieldError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-pdep-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-pdep-700 transition-colors disabled:opacity-50"
      >
        {loading ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useApiCall } from "@/app/hooks/useApiCall";
import { ALUMNO_LEGAJO_PATTERN, ALUMNO_EMAIL_PATTERN } from "@/domain/entities/domain-constants";
import { enumerar } from "@/lib/naming";

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
  const router = useRouter();
  const { loading, error, call } = useApiCall();
  const [success, setSuccess] = useState(false);
  const [canalesConError, setCanalesConError] = useState<string[]>([]);
  const [gruposSyncWarning, setGruposSyncWarning] = useState(false);
  const [fieldError, setFieldError] = useState<{ message: string; field: string } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    const form = new FormData(event.currentTarget);
    await call(async () => {
      const body = {
        legajo: form.get("legajo") as string,
        apellido: form.get("apellido") as string,
        nombre: form.get("nombre") as string,
        email: form.get("email") as string,
        ...extraBody,
      };
      const response = await fetch(apiEndpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok) {
        if (typeof json.field === "string") {
          setFieldError({ message: json.error, field: json.field });
        }
        throw new Error(json.error ?? "Error al guardar");
      }
      const canalesFallidos: string[] = Array.isArray(json.canalesConError)
        ? json.canalesConError
        : [];
      const hasGruposSyncWarning = json.gruposSync === "error";
      setCanalesConError(canalesFallidos);
      setGruposSyncWarning(hasGruposSyncWarning);
      setSuccess(true);
      // Revalidamos el árbol server para que el banner global
      // `SyncPendingBanner` refleje el estado actualizado del flag
      // (lo limpiamos si la sync funcionó, lo prendemos si falló).
      router.refresh();
      // Damos más tiempo antes de redirigir si hay que mostrar un warning
      // para que el alumno alcance a leerlo.
      if (onSuccessRedirect) {
        const delay = canalesFallidos.length > 0 || hasGruposSyncWarning ? 5000 : 1500;
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
        {canalesConError.length > 0 && (
          <div
            role="alert"
            className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800"
          >
            No pudimos {enumerar(canalesConError)}. Avisale a un docente para que lo resuelva.
          </div>
        )}
        {gruposSyncWarning && (
          <div
            role="alert"
            className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800"
          >
            Tus datos quedaron guardados, pero no pudimos asignarte al grupo de TP. Guardá de nuevo para reintentar; si persiste, avisale a un docente.
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
          pattern={ALUMNO_LEGAJO_PATTERN}
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
          pattern={ALUMNO_EMAIL_PATTERN}
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

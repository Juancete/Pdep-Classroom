"use client";

import { useFormState, useFormStatus } from "react-dom";
import { PARADIGMAS } from "@/types";
import type { AssignmentFormState } from "@/lib/assignment-schema";

type Template = { name: string; fullName: string; description: string };

type DefaultValues = {
  titulo?: string;
  slug?: string;
  descripcion?: string;
  templateRepo?: string;
  tipo?: string;
  paradigma?: string;
  deadline?: string;
};

type Props = {
  action: (
    prevState: AssignmentFormState,
    formData: FormData
  ) => Promise<AssignmentFormState>;
  templates: Template[];
  defaultValues?: DefaultValues;
  submitLabel: string;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-red-600 text-xs mt-1">{message}</p>;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-pdep-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-pdep-700 transition-colors disabled:opacity-60"
    >
      {pending ? "Guardando…" : label}
    </button>
  );
}

const INPUT_CLASS =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none";

const INPUT_ERROR_CLASS =
  "w-full border border-red-400 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none";

export function AssignmentForm({
  action,
  templates,
  defaultValues = {},
  submitLabel,
}: Props) {
  const [state, formAction] = useFormState(action, null);
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      {/* Título */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Título
        </label>
        <input
          name="titulo"
          required
          defaultValue={defaultValues.titulo}
          placeholder="Kata funcional — Rompecabezas"
          className={errors.titulo ? INPUT_ERROR_CLASS : INPUT_CLASS}
        />
        <FieldError message={errors.titulo?.[0]} />
      </div>

      {/* Slug */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Slug{" "}
          <span className="font-normal text-gray-400">
            (nombre base del repo, se auto-genera si lo dejás vacío)
          </span>
        </label>
        <input
          name="slug"
          defaultValue={defaultValues.slug}
          placeholder="kata-funcional-rompecabezas"
          className={`${errors.slug ? INPUT_ERROR_CLASS : INPUT_CLASS} font-mono`}
        />
        <FieldError message={errors.slug?.[0]} />
      </div>

      {/* Descripción */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Descripción
        </label>
        <textarea
          name="descripcion"
          rows={2}
          defaultValue={defaultValues.descripcion}
          placeholder="Opcional"
          className={INPUT_CLASS}
        />
      </div>

      {/* Template repo */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Template Repo
        </label>
        {templates.length > 0 ? (
          <select
            name="templateRepo"
            required
            defaultValue={defaultValues.templateRepo}
            className={errors.templateRepo ? INPUT_ERROR_CLASS : INPUT_CLASS}
          >
            <option value="">Elegí un template…</option>
            {templates.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
                {t.description ? ` — ${t.description}` : ""}
              </option>
            ))}
          </select>
        ) : (
          <input
            name="templateRepo"
            required
            defaultValue={defaultValues.templateRepo}
            placeholder="nombre-del-template (debe estar en pdep-mn y ser template)"
            className={`${errors.templateRepo ? INPUT_ERROR_CLASS : INPUT_CLASS} font-mono`}
          />
        )}
        <FieldError message={errors.templateRepo?.[0]} />
      </div>

      {/* Paradigma y Tipo en fila */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Paradigma
          </label>
          <select
            name="paradigma"
            required
            defaultValue={defaultValues.paradigma ?? "funcional"}
            className={INPUT_CLASS}
          >
            {PARADIGMAS.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tipo
          </label>
          <select
            name="tipo"
            required
            defaultValue={defaultValues.tipo ?? "individual"}
            className={INPUT_CLASS}
          >
            <option value="individual">Individual</option>
            <option value="grupal">Grupal</option>
          </select>
        </div>
      </div>

      {/* Deadline */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Deadline
        </label>
        <input
          name="deadline"
          type="date"
          defaultValue={defaultValues.deadline}
          className={INPUT_CLASS}
        />
      </div>

      {/* Submit */}
      <div className="flex gap-3 pt-2">
        <SubmitButton label={submitLabel} />
        <a
          href="/admin/assignments"
          className="px-5 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}

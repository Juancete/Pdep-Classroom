"use client";

import { useState, useRef, useEffect } from "react";
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

function TemplateRepoCombobox({
  templates,
  defaultValue,
  hasError,
}: {
  templates: Template[];
  defaultValue?: string;
  hasError: boolean;
}) {
  const [query, setQuery] = useState(defaultValue ?? "");
  const [selected, setSelected] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = query
    ? templates.filter((t) =>
        t.name.toLowerCase().includes(query.toLowerCase()) ||
        t.description.toLowerCase().includes(query.toLowerCase())
      )
    : templates;

  // Cerrar al hacer click fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // Si el query no coincide con ningún template, restaurar el seleccionado
        if (!templates.find((t) => t.name === query)) {
          setQuery(selected);
        }
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [query, selected, templates]);

  function handleSelect(name: string) {
    setSelected(name);
    setQuery(name);
    setOpen(false);
  }

  const borderClass = hasError
    ? "border-red-400 focus:ring-red-400 focus:border-red-400"
    : "border-gray-300 focus:ring-pdep-500 focus:border-pdep-500";

  return (
    <div ref={containerRef} className="relative">
      {/* Hidden input que va al FormData */}
      <input type="hidden" name="templateRepo" value={selected} />

      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected("");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Buscá por nombre o descripción…"
        autoComplete="off"
        className={`w-full border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 ${borderClass}`}
      />

      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm">
          {filtered.map((t) => (
            <li
              key={t.name}
              onMouseDown={(e) => {
                e.preventDefault(); // evitar que el blur cierre antes
                handleSelect(t.name);
              }}
              className={`cursor-pointer px-3 py-2 hover:bg-pdep-50 ${
                selected === t.name ? "bg-pdep-50 font-medium" : ""
              }`}
            >
              <span className="font-mono">{t.name}</span>
              {t.description && (
                <span className="text-gray-400 ml-2">— {t.description}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && query.length > 0 && filtered.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg px-3 py-2 text-sm text-gray-400">
          Sin resultados
        </div>
      )}
    </div>
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
          <TemplateRepoCombobox
            templates={templates}
            defaultValue={defaultValues.templateRepo}
            hasError={!!errors.templateRepo}
          />
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

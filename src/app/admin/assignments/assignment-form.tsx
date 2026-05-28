"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { PARADIGMAS } from "@/types";
import { GRUPAL_MIN_MAX_INTEGRANTES } from "@/domain/entities/domain-constants";
import type { AssignmentFormState } from "@/lib/assignment-schema";
import { slugify } from "@/lib/naming";
import { INPUT_CLASS, INPUT_ERROR_CLASS, FieldError, SubmitButton } from "../ui";

type Template = { name: string; fullName: string; description: string };

type DefaultValues = {
  id?: string;
  titulo?: string;
  slug?: string;
  descripcion?: string;
  templateRepo?: string;
  tipo?: string;
  paradigma?: string;
  deadline?: string;
  maxIntegrantes?: number;
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

  const filtered = query
    ? templates.filter((template) =>
        template.name.toLowerCase().includes(query.toLowerCase()) ||
        template.description.toLowerCase().includes(query.toLowerCase())
      )
    : templates;

  function handleSelect(name: string) {
    setSelected(name);
    setQuery(name);
    setOpen(false);
  }

  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setOpen(false);
      if (!templates.find((template) => template.name === query)) {
        setQuery(selected);
      }
    }
  }

  const borderClass = hasError
    ? "border-red-400 focus:ring-red-400 focus:border-red-400"
    : "border-gray-300 focus:ring-pdep-500 focus:border-pdep-500";

  return (
    <div onBlur={handleBlur} className="relative">
      {/* Hidden input que va al FormData */}
      <input type="hidden" name="templateRepo" value={selected} />

      <input
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected("");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Buscá por nombre o descripción…"
        autoComplete="new-password"
        className={`w-full border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 ${borderClass}`}
      />

      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm">
          {filtered.map((template) => (
            <li
              key={template.name}
              onMouseDown={(event) => {
                event.preventDefault();
                handleSelect(template.name);
              }}
              className={`cursor-pointer px-3 py-2 hover:bg-pdep-50 ${
                selected === template.name ? "bg-pdep-50 font-medium" : ""
              }`}
            >
              <span className="font-mono">{template.name}</span>
              {template.description && (
                <span className="text-gray-400 ml-2">— {template.description}</span>
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


export function AssignmentForm({
  action,
  templates,
  defaultValues = {},
  submitLabel,
}: Props) {
  const [state, formAction] = useFormState(action, null);
  const errors = state?.errors ?? {};

  const [tipo, setTipo] = useState(defaultValues.tipo ?? "individual");
  const [slug, setSlug] = useState(defaultValues.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(!!defaultValues.slug);

  function handleTituloChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (!slugEdited) {
      setSlug(slugify(event.target.value));
    }
  }

  function handleSlugChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSlug(event.target.value);
    setSlugEdited(event.target.value !== "");
  }

  return (
    <form action={formAction} className="space-y-5" data-template-count={templates.length}>
      {state?.formError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.formError}
        </div>
      )}
      {defaultValues.id && <input type="hidden" name="id" value={defaultValues.id} />}
      {/* Título */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Título *
        </label>
        <input
          name="titulo"
          required
          defaultValue={defaultValues.titulo}
          placeholder="Kata funcional — Rompecabezas"
          className={errors.titulo ? INPUT_ERROR_CLASS : INPUT_CLASS}
          onChange={handleTituloChange}
        />
        <FieldError message={errors.titulo?.[0]} />
      </div>

      {/* Slug */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Slug *{" "}
          <span className="font-normal text-gray-400">
            (nombre base del repo, se auto-genera si lo dejás vacío)
          </span>
        </label>
        <input
          name="slug"
          value={slug}
          placeholder="kata-funcional-rompecabezas"
          className={`${errors.slug ? INPUT_ERROR_CLASS : INPUT_CLASS} font-mono`}
          onChange={handleSlugChange}
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
          Template Repo *
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
            placeholder="nombre-del-template (debe estar en pdep-mn-utn y ser template)"
            autoComplete="new-password"
            className={`${errors.templateRepo ? INPUT_ERROR_CLASS : INPUT_CLASS} font-mono`}
          />
        )}
        <FieldError message={errors.templateRepo?.[0]} />
      </div>

      {/* Paradigma y Tipo en fila */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Paradigma *
          </label>
          <div className="relative">
            <select
              name="paradigma"
              required
              defaultValue={defaultValues.paradigma ?? "funcional"}
              className={`${INPUT_CLASS} appearance-none pr-8`}
            >
              {PARADIGMAS.map((paradigma) => (
                <option key={paradigma} value={paradigma}>
                  {paradigma.charAt(0).toUpperCase() + paradigma.slice(1)}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-gray-400">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tipo *
          </label>
          <div className="relative">
            <select
              name="tipo"
              required
              value={tipo}
              onChange={(event) => setTipo(event.target.value)}
              className={`${INPUT_CLASS} appearance-none pr-8`}
            >
              <option value="individual">Individual</option>
              <option value="grupal">Grupal</option>
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-gray-400">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </span>
          </div>
        </div>
      </div>

      {/* Max integrantes (solo grupal) */}
      {tipo === "grupal" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Máximo de integrantes *
          </label>
          <input
            name="maxIntegrantes"
            type="number"
            min={GRUPAL_MIN_MAX_INTEGRANTES}
            defaultValue={defaultValues.maxIntegrantes}
            placeholder="Ej: 3"
            className={errors.maxIntegrantes ? INPUT_ERROR_CLASS : INPUT_CLASS}
          />
          <FieldError message={errors.maxIntegrantes?.[0]} />
        </div>
      )}

      {/* Deadline */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Deadline *
        </label>
        <input
          name="deadline"
          type="date"
          defaultValue={defaultValues.deadline}
          className={INPUT_CLASS}

        />
      </div>

      {/* Submit */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <SubmitButton label={submitLabel} />
        <a
          href="/admin/assignments"
          className="px-5 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors text-center"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}

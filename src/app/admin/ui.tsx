"use client";

import { useFormStatus } from "react-dom";
import { colLetter } from "@/lib/sheets-columns";

export const INPUT_CLASS =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none";

export const INPUT_ERROR_CLASS =
  "w-full border border-red-400 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none";

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-red-600 text-xs mt-1">{message}</p>;
}

export function SubmitButton({ label }: { label: string }) {
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

// A=0, B=1, … ZZ=701 — el legajo de una cursada en marcha puede caer bien
// pasada la Z, después de los bloques de notas de los tres paradigmas.
// Compartido por el form de comisiones (columnas de alumnos/grupos) y el de
// assignments (columna de destino del grupo en la planilla, issue #109).
export const COL_OPTIONS = Array.from({ length: 702 }, (_, colIndex) => ({
  value: colIndex,
  label: colLetter(colIndex),
}));

export function ColSelect({
  name,
  label,
  defaultValue,
  error,
  optional = false,
}: {
  name: string;
  label: string;
  defaultValue: number | undefined;
  error?: string;
  optional?: boolean;
}) {
  const selectId = `col-select-${name}`;
  return (
    <div>
      <label htmlFor={selectId} className="block text-xs font-medium text-gray-600 mb-1">
        {label}
      </label>
      <select
        id={selectId}
        name={name}
        defaultValue={defaultValue ?? ""}
        className={`w-full rounded-md border px-2 py-1.5 text-sm font-mono ${error ? "border-red-400 bg-red-50" : "border-gray-300 bg-white"} focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none`}
      >
        {optional && <option value="">(sin columna)</option>}
        {COL_OPTIONS.map(({ value, label: letra }) => (
          <option key={value} value={value}>
            {letra} (col {value + 1})
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </div>
  );
}

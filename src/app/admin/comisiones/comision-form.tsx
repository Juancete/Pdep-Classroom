"use client";

import { useFormState } from "react-dom";
import type { ComisionFormState } from "./actions";
import { INPUT_CLASS, INPUT_ERROR_CLASS, FieldError, SubmitButton } from "../ui";
import { DEFAULT_COLUMN_CONFIG, type ColumnConfig } from "@/types";

// A=0, B=1, … Z=25
const COL_OPTIONS = Array.from({ length: 26 }, (_, i) => ({
  value: i,
  label: String.fromCharCode(65 + i),
}));

type DefaultValues = {
  id?: string;
  anio?: number;
  spreadsheetId?: string;
  activa?: boolean;
  columnConfig?: ColumnConfig;
};

type Props = {
  action: (prevState: ComisionFormState, formData: FormData) => Promise<ComisionFormState>;
  defaultValues?: DefaultValues;
  submitLabel: string;
};

function ColSelect({
  name,
  label,
  defaultValue,
  error,
}: {
  name: string;
  label: string;
  defaultValue: number;
  error?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select
        name={name}
        defaultValue={defaultValue}
        className={`w-full rounded-md border px-2 py-1.5 text-sm font-mono ${error ? "border-red-400 bg-red-50" : "border-gray-300 bg-white"} focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none`}
      >
        {COL_OPTIONS.map(({ value, label: lbl }) => (
          <option key={value} value={value}>
            {lbl} (col {value + 1})
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </div>
  );
}

export function ComisionForm({ action, defaultValues = {}, submitLabel }: Props) {
  const [state, formAction] = useFormState(action, null);
  const errors = state?.errors ?? {};
  const cfg = defaultValues.columnConfig ?? DEFAULT_COLUMN_CONFIG;

  return (
    <form action={formAction} className="space-y-5">
      {defaultValues.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {/* Año */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Año *</label>
        <input
          name="anio"
          type="number"
          min={2020}
          max={2100}
          required
          defaultValue={defaultValues.anio ?? new Date().getFullYear()}
          className={errors.anio ? INPUT_ERROR_CLASS : INPUT_CLASS}
        />
        <FieldError message={errors.anio?.[0]} />
      </div>

      {/* Spreadsheet ID */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          ID de la planilla de Google Sheets *
        </label>
        <input
          name="spreadsheetId"
          required
          defaultValue={defaultValues.spreadsheetId}
          placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
          className={`${errors.spreadsheetId ? INPUT_ERROR_CLASS : INPUT_CLASS} font-mono text-xs`}
        />
        <p className="text-gray-400 text-xs mt-1">
          Se encuentra en la URL: docs.google.com/spreadsheets/d/<strong>ID</strong>/edit
        </p>
        <FieldError message={errors.spreadsheetId?.[0]} />
      </div>

      {/* Activa */}
      <div className="flex items-center gap-3">
        <input
          id="activa"
          name="activa"
          type="checkbox"
          defaultChecked={defaultValues.activa ?? false}
          className="h-4 w-4 rounded border-gray-300 text-pdep-600 focus:ring-pdep-500"
        />
        <label htmlFor="activa" className="text-sm font-medium text-gray-700">
          Comisión activa
        </label>
      </div>
      <p className="text-gray-400 text-xs -mt-3">
        Solo puede haber una comisión activa a la vez.
      </p>

      {/* Configuración de columnas */}
      <fieldset className="border border-gray-200 rounded-lg p-4 space-y-4">
        <legend className="text-sm font-semibold text-gray-700 px-1">
          Configuración de columnas del spreadsheet
        </legend>
        <p className="text-xs text-gray-500">
          Indicá qué columna de la planilla corresponde a cada dato del alumno.
          Útil cuando pre-cargás alumnos con un formato propio.
        </p>

        {/* Nombre de la hoja y filas de encabezado */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nombre de la hoja
            </label>
            <input
              name="sheetName"
              defaultValue={cfg.sheetName}
              placeholder="Alumnos"
              className={`${INPUT_CLASS} text-sm font-mono`}
            />
            <FieldError message={errors.sheetName?.[0]} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Filas de encabezado
            </label>
            <input
              name="headerRows"
              type="number"
              min={0}
              max={10}
              defaultValue={cfg.headerRows}
              className={`${INPUT_CLASS} text-sm`}
            />
            <FieldError message={errors.headerRows?.[0]} />
          </div>
        </div>

        {/* Selectores de columna */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ColSelect name="col_legajo" label="Legajo" defaultValue={cfg.legajo} error={errors.col_legajo?.[0]} />
          <ColSelect name="col_apellido" label="Apellido" defaultValue={cfg.apellido} error={errors.col_apellido?.[0]} />
          <ColSelect name="col_nombre" label="Nombre" defaultValue={cfg.nombre} error={errors.col_nombre?.[0]} />
          <ColSelect name="col_githubUsername" label="Usuario GitHub" defaultValue={cfg.githubUsername} error={errors.col_githubUsername?.[0]} />
          <ColSelect name="col_email" label="Email" defaultValue={cfg.email} error={errors.col_email?.[0]} />
          <ColSelect name="col_comision" label="Comisión" defaultValue={cfg.comision} error={errors.col_comision?.[0]} />
        </div>
      </fieldset>

      {/* Submit */}
      <div className="flex gap-3 pt-2">
        <SubmitButton label={submitLabel} />
        <a
          href="/admin/comisiones"
          className="px-5 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}

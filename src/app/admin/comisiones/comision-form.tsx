"use client";

import { useFormState } from "react-dom";
import type { ComisionFormState } from "./actions";
import { INPUT_CLASS, INPUT_ERROR_CLASS, FieldError, SubmitButton } from "../ui";

type DefaultValues = {
  id?: string;
  anio?: number;
  spreadsheetId?: string;
  activa?: boolean;
};

type Props = {
  action: (prevState: ComisionFormState, formData: FormData) => Promise<ComisionFormState>;
  defaultValues?: DefaultValues;
  submitLabel: string;
};


export function ComisionForm({ action, defaultValues = {}, submitLabel }: Props) {
  const [state, formAction] = useFormState(action, null);
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      {defaultValues.id && <input type="hidden" name="id" value={defaultValues.id} />}
      {/* Año */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Año *
        </label>
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
          Se encuentra en la URL de la planilla: docs.google.com/spreadsheets/d/<strong>ID</strong>/edit
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
        Solo puede haber una comisión activa a la vez. Activar esta desactivará las demás.
      </p>

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

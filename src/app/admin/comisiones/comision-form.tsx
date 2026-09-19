"use client";

import { useActionState, useState, useRef } from "react";
import type { ComisionFormState } from "./actions";
import { fetchSheetNames } from "./actions";
import { INPUT_CLASS, INPUT_ERROR_CLASS, FieldError, SubmitButton, ColSelect } from "../ui";
import { DEFAULT_COLUMN_CONFIG, type ColumnConfig, type ModoNombre } from "@/types";
import { COMISION_ANIO_MIN, COMISION_ANIO_MAX } from "@/domain/entities/domain-constants";

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
  initialSheetNames?: string[];
};

// Resuelve qué hoja queda seleccionada en el combo: el valor guardado si
// sigue existiendo en la planilla, o la primera hoja real en caso contrario
// (hoja renombrada/borrada, o alta nueva sin valor guardado).
export function hojaSeleccionada(
  valorGuardado: string | undefined,
  sheetNames: string[]
): string | undefined {
  if (valorGuardado !== undefined && sheetNames.includes(valorGuardado)) {
    return valorGuardado;
  }
  return sheetNames[0];
}

function SheetNameSelect({
  name,
  label,
  defaultValue,
  valorGuardado,
  error,
  sheetNames,
}: {
  name: string;
  label: string;
  defaultValue: string | undefined;
  valorGuardado: string | undefined;
  error?: string;
  sheetNames: string[] | null;
}) {
  if (sheetNames === null || sheetNames.length === 0) {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
        <input
          name={name}
          defaultValue={defaultValue}
          placeholder="Nombre de la hoja"
          className={`${error ? INPUT_ERROR_CLASS : INPUT_CLASS} text-sm font-mono`}
        />
        <FieldError message={error} />
      </div>
    );
  }

  const seleccionada = hojaSeleccionada(valorGuardado, sheetNames);
  // El aviso sólo tiene sentido si había un valor guardado que se perdió; en
  // el alta (sin valor guardado) "Alumnos" es sólo un default de UI, no una
  // hoja inexistente reemplazada.
  const huboReemplazo = valorGuardado !== undefined && seleccionada !== valorGuardado;

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select
        key={sheetNames.join("|")}
        name={name}
        defaultValue={seleccionada}
        className={`w-full rounded-md border px-2 py-1.5 text-sm font-mono ${
          error ? "border-red-400 bg-red-50" : "border-gray-300 bg-white"
        } focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none`}
      >
        {sheetNames.map((sheetName) => (
          <option key={sheetName} value={sheetName}>
            {sheetName}
          </option>
        ))}
      </select>
      {huboReemplazo && (
        <p className="text-amber-600 text-xs mt-1">
          La hoja &quot;{valorGuardado}&quot; no existe en la planilla; se
          seleccionó &quot;{seleccionada}&quot;.
        </p>
      )}
      <FieldError message={error} />
    </div>
  );
}

export function ComisionForm({ action, defaultValues = {}, submitLabel, initialSheetNames }: Props) {
  const [state, formAction] = useActionState(action, null);
  const errors = state?.errors ?? {};
  const config = defaultValues.columnConfig ?? DEFAULT_COLUMN_CONFIG;
  const grupos = config.grupos;
  const [gruposEnabled, setGruposEnabled] = useState(Boolean(grupos));
  const [modoNombre, setModoNombre] = useState<ModoNombre>(config.modoNombre ?? "separado");
  const [sheetNames, setSheetNames] = useState<string[] | null>(initialSheetNames ?? null);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [loadSheetsError, setLoadSheetsError] = useState<string | null>(null);
  const spreadsheetIdRef = useRef<HTMLInputElement>(null);

  // Valor realmente guardado para el combo de hojas de alumnos: en el alta
  // (sin columnConfig) "Alumnos" es sólo un default de UI, no un valor
  // guardado, así que no debe disparar el aviso de reemplazo.
  const sheetNameGuardado = defaultValues.columnConfig ? config.sheetName : undefined;
  // Para el combo de grupos el "guardado" es sólo grupos?.sheetName (nunca
  // config.sheetName). Si no hay hoja de grupos guardada, preferimos la
  // hoja de alumnos ya resuelta contra la lista real, sin disparar aviso.
  const gruposSheetNameGuardado =
    grupos?.sheetName ?? (sheetNames ? hojaSeleccionada(sheetNameGuardado, sheetNames) : undefined);

  async function handleLoadSheets() {
    const spreadsheetId = spreadsheetIdRef.current?.value ?? "";
    if (!spreadsheetId.trim()) {
      setLoadSheetsError("Ingresá el ID de la planilla primero");
      return;
    }
    setLoadingSheets(true);
    setLoadSheetsError(null);
    try {
      const result = await fetchSheetNames(spreadsheetId);
      if ("error" in result) {
        setLoadSheetsError(result.error);
      } else {
        setSheetNames(result);
      }
    } catch (error) {
      setLoadSheetsError(String(error));
    } finally {
      setLoadingSheets(false);
    }
  }

  return (
    <form action={formAction} className="space-y-5">
      {defaultValues.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {/* Año */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Año *</label>
        <input
          name="anio"
          type="number"
          min={COMISION_ANIO_MIN}
          max={COMISION_ANIO_MAX}
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
        <div className="flex gap-2">
          <input
            ref={spreadsheetIdRef}
            name="spreadsheetId"
            required
            defaultValue={defaultValues.spreadsheetId}
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            className={`flex-1 ${errors.spreadsheetId ? INPUT_ERROR_CLASS : INPUT_CLASS} font-mono text-xs`}
          />
          <button
            type="button"
            onClick={handleLoadSheets}
            disabled={loadingSheets}
            className="shrink-0 px-3 py-2 text-xs font-medium rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {loadingSheets ? "Cargando…" : sheetNames ? "Recargar hojas" : "Cargar hojas"}
          </button>
        </div>
        <p className="text-gray-400 text-xs mt-1">
          Se encuentra en la URL: docs.google.com/spreadsheets/d/<strong>ID</strong>/edit
        </p>
        {loadSheetsError && (
          <p className="text-red-500 text-xs mt-1">{loadSheetsError}</p>
        )}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SheetNameSelect
            name="sheetName"
            label="Nombre de la hoja"
            defaultValue={config.sheetName}
            valorGuardado={sheetNameGuardado}
            error={errors.sheetName?.[0]}
            sheetNames={sheetNames}
          />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Filas de encabezado
            </label>
            <input
              name="headerRows"
              type="number"
              min={0}
              max={10}
              defaultValue={config.headerRows}
              className={`${INPUT_CLASS} text-sm`}
            />
            <FieldError message={errors.headerRows?.[0]} />
          </div>
        </div>

        {/* Modo de nombre */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Modo de nombre</label>
          <select
            name="modoNombre"
            value={modoNombre}
            onChange={(changeEvent) => setModoNombre(changeEvent.target.value as ModoNombre)}
            className="w-full rounded-md border px-2 py-1.5 text-sm border-gray-300 bg-white focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none"
          >
            <option value="separado">Apellido y nombre en columnas separadas</option>
            <option value="completo">Nombre completo en una sola columna (&quot;Apellido, Nombre&quot;)</option>
          </select>
          <FieldError message={errors.modoNombre?.[0]} />
        </div>

        {/* Selectores de columna */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <ColSelect name="col_legajo" label="Legajo" defaultValue={config.legajo} error={errors.col_legajo?.[0]} />
          {modoNombre === "separado" ? (
            <>
              <ColSelect name="col_apellido" label="Apellido" defaultValue={config.apellido} error={errors.col_apellido?.[0]} />
              <ColSelect name="col_nombre" label="Nombre" defaultValue={config.nombre} error={errors.col_nombre?.[0]} />
            </>
          ) : (
            <ColSelect
              name="col_nombreCompleto"
              label="Nombre completo"
              defaultValue={config.nombreCompleto}
              error={errors.col_nombreCompleto?.[0]}
            />
          )}
          <ColSelect name="col_githubUsername" label="Usuario GitHub" defaultValue={config.githubUsername} error={errors.col_githubUsername?.[0]} />
          <ColSelect name="col_email" label="Email" defaultValue={config.email} error={errors.col_email?.[0]} />
        </div>

        {/* Precarga sin legajo (cursada en marcha) */}
        <div className="flex items-center gap-3">
          <input
            id="permitir_precarga_sin_legajo"
            name="permitir_precarga_sin_legajo"
            type="checkbox"
            defaultChecked={config.permitirPrecargaSinLegajo ?? false}
            className="h-4 w-4 rounded border-gray-300 text-pdep-600 focus:ring-pdep-500"
          />
          <label htmlFor="permitir_precarga_sin_legajo" className="text-sm font-medium text-gray-700">
            Permitir precarga sin legajo
          </label>
        </div>
        <p className="text-gray-400 text-xs -mt-3">
          Activalo para incorporar una cursada en marcha: un alumno que ya figura en la
          planilla pero todavía no tiene legajo va a poder precargar sus datos igual.
        </p>
      </fieldset>

      {/* Configuración de hoja de grupos (opcional) */}
      <fieldset className="border border-gray-200 rounded-lg p-4 space-y-4">
        <legend className="text-sm font-semibold text-gray-700 px-1">
          Hoja de grupos (opcional)
        </legend>
        <p className="text-xs text-gray-500">
          Si la planilla tiene columnas con el nombre del grupo por paradigma, al
          registrarse un alumno se materializan automáticamente los grupos en la DB
          (uno por cada TP grupal ya creado del paradigma correspondiente).
        </p>

        <div className="flex items-center gap-3">
          <input
            id="grupos_enabled"
            name="grupos_enabled"
            type="checkbox"
            checked={gruposEnabled}
            onChange={(changeEvent) => setGruposEnabled(changeEvent.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-pdep-600 focus:ring-pdep-500"
          />
          <label htmlFor="grupos_enabled" className="text-sm font-medium text-gray-700">
            Hay hoja de grupos en la planilla
          </label>
        </div>

        {gruposEnabled && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SheetNameSelect
                name="grupos_sheetName"
                label="Nombre de la hoja (grupos)"
                defaultValue={grupos?.sheetName ?? config.sheetName}
                valorGuardado={gruposSheetNameGuardado}
                error={errors.grupos_sheetName?.[0]}
                sheetNames={sheetNames}
              />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Filas de encabezado (grupos)
                </label>
                <input
                  name="grupos_headerRows"
                  type="number"
                  min={0}
                  max={10}
                  defaultValue={grupos?.headerRows ?? config.headerRows}
                  className={`${INPUT_CLASS} text-sm`}
                />
                <FieldError message={errors.grupos_headerRows?.[0]} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <ColSelect
                name="grupos_col_githubUsername"
                label="Usuario GitHub"
                defaultValue={grupos?.githubUsername ?? config.githubUsername}
                error={errors.grupos_col_githubUsername?.[0]}
              />
              <ColSelect
                name="grupos_col_funcional"
                label="Grupo funcional"
                defaultValue={grupos?.nombreGrupoPorParadigma.funcional}
                error={errors.grupos_col_funcional?.[0]}
                optional
              />
              <ColSelect
                name="grupos_col_logico"
                label="Grupo lógico"
                defaultValue={grupos?.nombreGrupoPorParadigma.logico}
                error={errors.grupos_col_logico?.[0]}
                optional
              />
              <ColSelect
                name="grupos_col_objetos"
                label="Grupo objetos"
                defaultValue={grupos?.nombreGrupoPorParadigma.objetos}
                error={errors.grupos_col_objetos?.[0]}
                optional
              />
            </div>
          </>
        )}
      </fieldset>

      {/* Submit */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <SubmitButton label={submitLabel} />
        <a
          href="/admin/comisiones"
          className="px-5 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors text-center"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}

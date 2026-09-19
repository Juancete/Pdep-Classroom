"use client";

import { useRef } from "react";
import { cambiarComisionConsultada } from "./comision-consultada/actions";
import { INPUT_CLASS } from "./ui";

// Datos planos de cada opción — nunca la entidad `Comision` de MikroORM
// (issue #114, sección de serialización server→client component).
export interface OpcionDeComision {
  id: string;
  anio: number;
  activa: boolean;
}

type Props = {
  comisiones: OpcionDeComision[];
  idSeleccionado: string | null;
};

// Client mínimo: un `<select>` que dispara la comisión consultada apenas el
// docente elige, sin botón "Aplicar" aparte. `cambiarComisionConsultada` es
// una server action — pasarla directo como `action` del form funciona igual
// en un client component.
export function SelectorDeComision({ comisiones, idSeleccionado }: Props) {
  const formularioRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formularioRef}
      action={cambiarComisionConsultada}
      className="flex items-center gap-2"
    >
      <label
        htmlFor="selector-comision-consultada"
        className="text-sm font-medium text-gray-600 whitespace-nowrap"
      >
        Comisión
      </label>
      <select
        id="selector-comision-consultada"
        name="comisionId"
        defaultValue={idSeleccionado ?? ""}
        onChange={() => formularioRef.current?.requestSubmit()}
        className={INPUT_CLASS}
      >
        {!idSeleccionado && (
          <option value="" disabled>
            Seleccioná una comisión
          </option>
        )}
        {comisiones.map((comision) => (
          <option key={comision.id} value={comision.id}>
            {comision.anio}
            {comision.activa ? " (activa)" : ""}
          </option>
        ))}
      </select>
    </form>
  );
}

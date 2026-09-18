import { ContextoDeComision, type Comision } from "@/domain/entities";
import { cambiarComisionConsultada } from "./comision-consultada/actions";
import { SelectorDeComision } from "./selector-de-comision";

type Props = {
  contexto: ContextoDeComision;
  comisiones: Comision[];
};

// Header del panel admin con la comisión que se está consultando (issue
// #114). Server component: sólo le pregunta al `contexto` (polimórfico —
// nunca `instanceof` acá) y arma datos planos para el selector, que sí es
// client. Sin badge activa/histórica aparte: `contexto.descripcion()` ya
// distingue "(activa)"/"(histórica)" en el propio texto, un badge al lado
// sólo repetía la misma pregunta con otro if.
export function BarraDeComision({ contexto, comisiones }: Props) {
  const comisionConsultada = contexto.comisionConsultada();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-white border border-gray-200 rounded-lg px-4 py-3">
      <span className="text-sm text-gray-700">{contexto.descripcion()}</span>

      <div className="flex items-center gap-3">
        {contexto.ofreceVolverALaActiva() && (
          <form action={cambiarComisionConsultada}>
            <button
              type="submit"
              className="text-sm text-pdep-600 hover:text-pdep-800 underline"
            >
              Volver a la activa
            </button>
          </form>
        )}
        {comisiones.length > 0 && (
          <SelectorDeComision
            // Se remonta cuando cambia la comisión consultada (por el botón
            // «Volver a la activa» o porque la que se estaba viendo dejó de
            // existir) — el `<select>` es no controlado (`defaultValue`), así
            // que sin `key` distinta React no vuelve a aplicar el valor por
            // defecto y puede seguir mostrando la opción vieja aunque el
            // header ya diga otra cosa.
            key={comisionConsultada?.id ?? "sin-comision"}
            comisiones={comisiones.map((comision) => ({
              id: comision.id,
              anio: comision.anio,
              activa: comision.activa,
            }))}
            idSeleccionado={comisionConsultada?.id ?? null}
          />
        )}
      </div>
    </div>
  );
}

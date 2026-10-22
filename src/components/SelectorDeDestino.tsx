// Par "elegir un grupo destino + confirmar" que comparten admin (mover y
// agregar alumnos) y el alumno (cambiarse de grupo). Es controlado: el valor
// elegido vive en el consumidor, que además decide cómo se ve cada pieza.
export function SelectorDeDestino({
  destinos,
  valor,
  onCambio,
  disabled = false,
  textoVacio,
  ariaLabel,
  claseDelSelect,
  accion,
}: {
  destinos: { id: string; nombre: string }[];
  valor: string;
  onCambio: (id: string) => void;
  disabled?: boolean;
  /** Texto de la opción sin selección ("Mover a…", "Elegir grupo…"). */
  textoVacio: string;
  ariaLabel: string;
  claseDelSelect: string;
  accion: { etiquetaBoton: string; className: string; onConfirmar: () => void };
}) {
  return (
    <>
      <select
        value={valor}
        onChange={(event) => onCambio(event.target.value)}
        disabled={disabled}
        aria-label={ariaLabel}
        className={claseDelSelect}
      >
        <option value="">{textoVacio}</option>
        {destinos.map((destino) => (
          <option key={destino.id} value={destino.id}>
            {destino.nombre}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={accion.onConfirmar}
        disabled={disabled || !valor}
        className={accion.className}
      >
        {accion.etiquetaBoton}
      </button>
    </>
  );
}

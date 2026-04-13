import { DeleteButton } from "../delete-button";

export function DeleteComisionButton({ id, anio }: { id: string; anio: number }) {
  return (
    <DeleteButton
      confirmMessage={`¿Eliminar la comisión ${anio}? Esta acción no se puede deshacer.`}
      endpoint={`/api/comisiones/${id}`}
    />
  );
}

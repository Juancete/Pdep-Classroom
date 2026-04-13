import { DeleteButton } from "../delete-button";

export function DeleteAssignmentButton({ id, titulo }: { id: string; titulo: string }) {
  return (
    <DeleteButton
      confirmMessage={`¿Eliminar "${titulo}"? Esta acción no se puede deshacer.`}
      endpoint={`/api/assignments/${id}`}
    />
  );
}

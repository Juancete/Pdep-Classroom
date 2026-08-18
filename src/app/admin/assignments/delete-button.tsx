import { DeleteButton } from "../delete-button";

export function DeleteAssignmentButton({
  id,
  titulo,
  compact = false,
}: {
  id: string;
  titulo: string;
  compact?: boolean;
}) {
  return (
    <DeleteButton
      confirmMessage={`¿Eliminar "${titulo}"? Esta acción no se puede deshacer.`}
      endpoint={`/api/assignments/${id}`}
      compact={compact}
    />
  );
}

import { requireAdmin } from "@/infrastructure/auth/session";
import { ComisionForm } from "../comision-form";
import { crearComision } from "../actions";

export default async function NewComisionPage() {
  await requireAdmin();

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">Nueva Comisión</h1>
      <ComisionForm action={crearComision} submitLabel="Crear Comisión" />
    </div>
  );
}

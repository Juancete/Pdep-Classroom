import { QueryOrder, type EntityManager } from "@mikro-orm/core";
import { getEM } from "@/infrastructure/db";
import { CambioDeMembresia, type AccionCambioMembresia, type OrigenCambioMembresia } from "@/domain/entities";

export type HistorialDeMembresiasPage = {
  items: CambioDeMembresia[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/**
 * Persiste un registro de auditoría de membresía. A diferencia de
 * `iniciarIntentoBorradoRepo` (que abre su propio EntityManager porque audita
 * una operación externa a la DB), acá el `transaction` es obligatorio: el
 * registro tiene que compartir la misma transacción que el cambio de
 * membresía — si esa transacción hace rollback, la auditoría también.
 */
export async function registrarCambioDeMembresia(
  transaction: EntityManager,
  data: {
    assignmentId: string;
    alumnoId: string;
    alumnoUsername: string;
    grupoOrigenId?: string;
    grupoOrigenNombre?: string;
    grupoDestinoId?: string;
    grupoDestinoNombre?: string;
    accion: AccionCambioMembresia;
    origen: OrigenCambioMembresia;
    realizadoPor: string;
    grupoOrigenTeniaEntrega: boolean;
    grupoOrigenEliminado: boolean;
    motivo?: string;
  }
): Promise<CambioDeMembresia> {
  const cambio = new CambioDeMembresia();
  Object.assign(cambio, data);
  transaction.persist(cambio);
  return cambio;
}

export async function getHistorialDeMembresias(
  assignmentId: string,
  requestedPage: number,
  pageSize = 25
): Promise<HistorialDeMembresiasPage> {
  const entityManager = await getEM();
  const total = await entityManager.count(CambioDeMembresia, { assignmentId });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const items = await entityManager.find(
    CambioDeMembresia,
    { assignmentId },
    {
      orderBy: { creadoEn: QueryOrder.DESC, id: QueryOrder.DESC },
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }
  );
  return { items, page, pageSize, total, totalPages };
}

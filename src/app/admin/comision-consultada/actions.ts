"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/infrastructure/auth/session";
import { getComision } from "@/infrastructure/repositories";
import {
  guardarComisionConsultadaId,
  borrarComisionConsultadaId,
} from "@/infrastructure/navegacion/comisionConsultadaCookie";

// Cambia (o limpia) la comisión que el docente está consultando en el panel
// admin (issue #114). No toca `Comision.activa` ni ninguna otra fila —
// `createAssignment` sigue creando siempre en la activa, sin cambios de
// regla de negocio; esto es sólo una preferencia de navegación por cookie.
//
// `<form action={cambiarComisionConsultada}>` la usa tanto el selector
// (con `comisionId`) como el botón «Volver a la activa» (sin `comisionId`
// — mismo efecto que elegir un id inexistente).
export async function cambiarComisionConsultada(formData: FormData): Promise<void> {
  await requireAdmin();

  const valorComisionId = formData.get("comisionId");
  const comisionId = typeof valorComisionId === "string" ? valorComisionId.trim() : "";
  const comisionElegida = comisionId ? await getComision(comisionId) : null;

  // Vacío, inexistente o ya es la activa → borrar la cookie en vez de
  // guardar el id de la activa: así el default sigue automáticamente a la
  // activa cuando ésta cambie, sin depender de que la cookie quede
  // sincronizada con `Comision.activa`.
  if (!comisionId || !comisionElegida || comisionElegida.activa) {
    await borrarComisionConsultadaId();
  } else {
    await guardarComisionConsultadaId(comisionId);
  }

  revalidatePath("/admin", "layout");
}

import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/api-auth";
import { getCurrentUser } from "@/infrastructure/auth/session";
import { borrarEntrega } from "@/application/borrarEntrega";
import { RepositorioPreexistenteNoAdministradoError } from "@/application/aceptarAssignment";
import { internalServerError, respuestaDeErrorDeDominio } from "@/lib/api-errors";

type Params = { id: string; entregaId: string };

// Borrado puntual de una entrega desde admin (issue #107) — pensado para
// rehacer la demo (aceptar de nuevo el TP) sin tener que archivar el
// assignment primero. `guardAdmin()` alcanza para autorizar, pero
// `borrarEntrega` también necesita el `githubUsername` de quien pide el
// borrado para sellar la auditoría del repo (mismo dato que
// `borrarRepositoriosDeAssignment`) — de ahí el `getCurrentUser()` extra.
export async function DELETE(
  _req: Request,
  props: { params: Promise<Params> }
) {
  const params = await props.params;
  const unauthorized = await guardAdmin();
  if (unauthorized) return unauthorized;

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const resultado = await borrarEntrega({
      assignmentId: params.id,
      entregaId: params.entregaId,
      requestedBy: user.githubUsername,
    });

    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: 502 });
    }

    return NextResponse.json({ ok: true, repo: resultado.repo });
  } catch (error) {
    if (error instanceof RepositorioPreexistenteNoAdministradoError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return (
      respuestaDeErrorDeDominio(error) ??
      internalServerError(
        "DELETE /api/assignments/[id]/entregas/[entregaId]",
        error,
        { assignmentId: params.id, entregaId: params.entregaId }
      )
    );
  }
}

import { NextResponse } from "next/server";
import { requireUser } from "@/infrastructure/auth/session";
import { type RegistroInput } from "@/infrastructure/sheets";
import { internalServerError, parseJsonObjectBody, respuestaDeErrorDeDominio } from "@/lib/api-errors";
import { confirmarYProcesarAlumno } from "@/application/alumnoRegistro";

type PerfilInput = Omit<RegistroInput, "githubUsername">;

const ROUTE = "PATCH /api/perfil";

export async function PATCH(req: Request) {
  // Visibles en el `catch` para que un error inesperado (incluido
  // `PlanillaNoDisponibleError`) se registre con contexto útil para el
  // admin, sin depender de en qué línea del try haya fallado.
  let githubUsername: string | undefined;
  let legajo: string | undefined;
  try {
    const user = await requireUser();
    githubUsername = user.githubUsername;
    const body = await parseJsonObjectBody(req);
    if (body instanceof NextResponse) return body;
    if (typeof body.legajo === "string") legajo = body.legajo;

    const resultado = await confirmarYProcesarAlumno({
      ...(body as PerfilInput),
      githubUsername: user.githubUsername,
    });
    if (!resultado.ok) {
      return NextResponse.json(
        resultado.field
          ? { error: resultado.error, field: resultado.field }
          : { error: resultado.error },
        { status: resultado.status }
      );
    }

    return NextResponse.json({
      ok: true,
      canalesConError: resultado.hooks.canalesConError ?? [],
      ...(resultado.hooks.gruposSync === "error" && { gruposSync: "error" }),
    });
  } catch (error) {
    const context = { githubUsername, legajo };
    return (
      respuestaDeErrorDeDominio(error, { route: ROUTE, context }) ??
      internalServerError(ROUTE, error, context)
    );
  }
}

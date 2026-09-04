import { NextResponse } from "next/server";
import { requireUser } from "@/infrastructure/auth/session";
import { type RegistroInput } from "@/infrastructure/sheets";
import { internalServerError, parseJsonObjectBody } from "@/lib/api-errors";
import { confirmarYProcesarAlumno } from "@/application/alumnoRegistro";

type PerfilInput = Omit<RegistroInput, "githubUsername">;

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = await parseJsonObjectBody(req);
    if (body instanceof NextResponse) return body;

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
    return internalServerError("PATCH /api/perfil", error);
  }
}

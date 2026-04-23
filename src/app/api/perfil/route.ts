import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { type RegistroInput } from "@/lib/sheets";
import { internalServerError } from "@/lib/api-errors";
import { confirmarDatosAlumno } from "@/lib/services/alumnoRegistro";

type PerfilInput = Omit<RegistroInput, "githubUsername">;

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as PerfilInput;

    const resultado = await confirmarDatosAlumno({
      ...body,
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    return internalServerError("PATCH /api/perfil", error);
  }
}

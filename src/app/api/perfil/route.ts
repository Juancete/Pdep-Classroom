import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { type RegistroInput } from "@/lib/sheets";
import { internalServerError } from "@/lib/api-errors";
import { confirmarDatosAlumno } from "@/lib/services/alumnoRegistro";
import { intentarSincronizarGrupos } from "@/lib/services/intentarSincronizarGrupos";

type PerfilInput = Omit<RegistroInput, "githubUsername">;

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: "No pudimos leer los datos enviados. Volvé a intentar." },
        { status: 400 }
      );
    }

    const resultado = await confirmarDatosAlumno({
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

    const gruposSyncFallida = await intentarSincronizarGrupos(
      user.githubUsername,
      resultado.comision
    );

    return NextResponse.json({
      ok: true,
      ...(gruposSyncFallida && { gruposSync: "error" }),
    });
  } catch (error) {
    return internalServerError("PATCH /api/perfil", error);
  }
}

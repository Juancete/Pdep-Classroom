import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { type RegistroInput } from "@/lib/sheets";
import { Alumno } from "@/domain/entities";
import { usernameCanonicoDe } from "@/types";
import { internalServerError, parseJsonObjectBody } from "@/lib/api-errors";
import { confirmarYProcesarAlumno } from "@/lib/services/alumnoRegistro";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await parseJsonObjectBody(req);
    if (body instanceof NextResponse) return body;

    // Si el form envió un githubUsername distinto al de la sesión, devolvemos
    // error con `field` para que el form lo pinte inline y pueda ofrecer el
    // cierre de sesión. Antes lo pisábamos silenciosamente — el alumno se
    // iba sin enterarse de que había usado una cuenta ajena.
    if (body.githubUsername !== undefined && typeof body.githubUsername !== "string") {
      return NextResponse.json(
        { error: "El usuario de GitHub debe ser un texto", field: "githubUsername" },
        { status: 400 }
      );
    }
    const githubDelForm = Alumno.normalizarUsername(body.githubUsername ?? "");
    if (githubDelForm && githubDelForm !== usernameCanonicoDe(user)) {
      return NextResponse.json(
        {
          error: `Iniciaste sesión como @${user.githubUsername} pero completaste @${body.githubUsername}. Cerrá sesión y volvé a entrar con la cuenta correcta.`,
          field: "githubUsername",
        },
        { status: 400 }
      );
    }
    const resultado = await confirmarYProcesarAlumno({
      ...(body as Omit<RegistroInput, "githubUsername">),
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
      groupSubscription: resultado.hooks.groupSubscription,
      ...(resultado.hooks.gruposSync === "error" && { gruposSync: "error" }),
    });
  } catch (error) {
    return internalServerError("POST /api/registro", error);
  }
}

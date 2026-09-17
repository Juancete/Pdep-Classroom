import { NextResponse } from "next/server";
import { requireUser } from "@/infrastructure/auth/session";
import { type RegistroInput } from "@/infrastructure/sheets";
import { Alumno } from "@/domain/entities";
import { usernameCanonicoDe } from "@/types";
import { internalServerError, parseJsonObjectBody, respuestaDeErrorDeDominio } from "@/lib/api-errors";
import { confirmarYProcesarAlumno } from "@/application/alumnoRegistro";

const ROUTE = "POST /api/registro";

export async function POST(req: Request) {
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

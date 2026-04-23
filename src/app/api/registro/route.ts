import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { type RegistroInput } from "@/lib/sheets";
import { agregarMiembroAGrupo } from "@/lib/googleGroups";
import { internalServerError } from "@/lib/api-errors";
import { confirmarDatosAlumno } from "@/lib/services/alumnoRegistro";
import { intentarSincronizarGrupos } from "@/lib/services/intentarSincronizarGrupos";
import { logger } from "@/lib/logger";

// Enmascara la parte local del email para no escupir PII a los logs,
// preservando dominio y primeras 2 letras para que un admin pueda
// reconocer al alumno (combinado con el githubUsername del log).
function maskEmail(correo: string): string {
  return correo.replace(/^([^@]{1,2})([^@]*)(@.+)$/, "$1xxxxxx$3");
}

// Enmascara cualquier email embebido en un texto libre (p. ej. el
// `message` de un error de googleapis, que suele citar el email del
// miembro que se intentó agregar).
function maskEmailsEnTexto(texto: string): string {
  return texto.replace(/([\w.+-]{1,2})([\w.+-]*)(@[\w.-]+\.\w+)/g, "$1xxxxxx$3");
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as RegistroInput;

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
    const githubDelForm = body.githubUsername?.trim().toLowerCase();
    if (githubDelForm && githubDelForm !== user.githubUsername.toLowerCase()) {
      return NextResponse.json(
        {
          error: `Iniciaste sesión como @${user.githubUsername} pero completaste @${body.githubUsername}. Cerrá sesión y volvé a entrar con la cuenta correcta.`,
          field: "githubUsername",
        },
        { status: 400 }
      );
    }
    body.githubUsername = user.githubUsername;

    const resultado = await confirmarDatosAlumno(body);
    if (!resultado.ok) {
      return NextResponse.json(
        resultado.field
          ? { error: resultado.error, field: resultado.field }
          : { error: resultado.error },
        { status: resultado.status }
      );
    }

    // Hooks accesorios: el alta ya está persistida. Cada uno puede fallar sin
    // abortar el registro; la respuesta incluye un status por hook para que el
    // form muestre el warning correspondiente.
    const groupSubscription = await agregarMiembroAGrupo(body.email);
    if (groupSubscription.status === "error") {
      logger.error(
        {
          githubUsername: body.githubUsername,
          maskedEmail: maskEmail(body.email),
          err: maskEmailsEnTexto(groupSubscription.error),
        },
        "Error al suscribir al Google Group"
      );
    }

    // Hook accesorio: el alta ya está persistida. Si el sync falla, el wrapper
    // marca el flag en DB para disparar el retry automático en /perfil — solo
    // degradamos la respuesta a `gruposSync: "error"` para que el form muestre
    // el warning inmediato.
    let gruposSyncFallida = false;
    try {
      await intentarSincronizarGrupos(body.githubUsername, resultado.comision);
    } catch {
      gruposSyncFallida = true;
    }

    return NextResponse.json({
      ok: true,
      groupSubscription: groupSubscription.status,
      ...(gruposSyncFallida && { gruposSync: "error" }),
    });
  } catch (error) {
    return internalServerError("POST /api/registro", error);
  }
}

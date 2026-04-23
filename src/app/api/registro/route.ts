import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { upsertarAlumnoEnSheets, validateRegistro, type RegistroInput } from "@/lib/sheets";
import { getComisionActiva, upsertAlumno, LegajoConflictError } from "@/lib/repositories";
import { agregarMiembroAGrupo } from "@/lib/googleGroups";

// Enmascara la parte local del email para no escupir PII a los logs,
// preservando dominio y primeras 2 letras para que un admin pueda
// reconocer al alumno (combinado con el githubUsername del log).
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const user = email.slice(0, at);
  const domain = email.slice(at);
  const visible = user.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(user.length - 2, 1))}${domain}`;
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

    const comisionActiva = await getComisionActiva();
    if (!comisionActiva) {
      return NextResponse.json(
        { error: "No hay una comisión activa con planilla configurada. Pedile a un admin que configure una en /admin/comisiones." },
        { status: 409 }
      );
    }

    // Validar inputs antes de tocar DB o Sheets.
    const validationError = validateRegistro(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // DB primero: valida legajo↔github atómicamente. Si falla, Sheets no
    // se toca — evita el TOCTOU del check previo contra Sheets.
    try {
      await upsertAlumno({
        legajo: body.legajo,
        nombre: body.nombre,
        apellido: body.apellido,
        githubUsername: body.githubUsername,
        email: body.email,
        comision: comisionActiva,
        registroConfirmadoEn: comisionActiva,
      });
    } catch (e) {
      if (e instanceof LegajoConflictError) {
        return NextResponse.json(
          { error: e.message, field: "legajo" },
          { status: 400 }
        );
      }
      throw e;
    }

    const result = await upsertarAlumnoEnSheets(
      body,
      comisionActiva.spreadsheetId,
      comisionActiva.columnConfig
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    // El alta ya quedó persistida — una falla al suscribir al grupo no
    // debe romper el registro. Informamos el resultado para que la UI lo
    // muestre si corresponde y logueamos el detalle server-side.
    const groupSubscription = await agregarMiembroAGrupo(body.email);
    if (groupSubscription.status === "error") {
      console.error(
        `Error al suscribir al Google Group: github=${body.githubUsername} email=${maskEmail(body.email)} — ${groupSubscription.error}`
      );
    }

    return NextResponse.json({ ok: true, groupSubscription: groupSubscription.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

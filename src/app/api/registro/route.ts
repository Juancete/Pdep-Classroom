import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { upsertarAlumnoEnSheets, type RegistroInput } from "@/lib/sheets";
import { getComisionActiva, upsertAlumno } from "@/lib/repositories";
import { agregarMiembroAGrupo } from "@/lib/googleGroups";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as RegistroInput;

    // Forzar el githubUsername del usuario autenticado (no confiar en el body)
    body.githubUsername = user.githubUsername;

    const comisionActiva = await getComisionActiva();
    if (!comisionActiva) {
      return NextResponse.json(
        { error: "No hay una comisión activa con planilla configurada. Pedile a un admin que configure una en /admin/comisiones." },
        { status: 409 }
      );
    }

    const result = await upsertarAlumnoEnSheets(
      body,
      comisionActiva.spreadsheetId,
      comisionActiva.columnConfig
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await upsertAlumno({
      legajo: body.legajo,
      nombre: body.nombre,
      apellido: body.apellido,
      githubUsername: body.githubUsername,
      email: body.email,
      comision: comisionActiva,
      registroConfirmadoEn: comisionActiva,
    });

    // El alta ya quedó persistida — una falla al suscribir al grupo no
    // debe romper el registro. Informamos el resultado para que la UI lo
    // muestre si corresponde y logueamos el detalle server-side.
    const groupSubscription = await agregarMiembroAGrupo(body.email);
    if (groupSubscription.status === "error") {
      console.error(
        `Error al suscribir ${body.email} al Google Group: ${groupSubscription.error}`
      );
    }

    return NextResponse.json({ ok: true, groupSubscription: groupSubscription.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

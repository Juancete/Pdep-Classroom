import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { upsertarAlumnoEnSheets, type RegistroInput } from "@/lib/sheets";
import { getComisionActiva, upsertAlumno } from "@/lib/repositories";

type PerfilInput = Omit<RegistroInput, "githubUsername">;

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as PerfilInput;

    const input: RegistroInput = {
      ...body,
      githubUsername: user.githubUsername,
    };

    const comisionActiva = await getComisionActiva();
    if (!comisionActiva) {
      return NextResponse.json(
        { error: "No hay una comisión activa con planilla configurada. Pedile a un admin que configure una en /admin/comisiones." },
        { status: 409 }
      );
    }

    const result = await upsertarAlumnoEnSheets(
      input,
      comisionActiva.spreadsheetId,
      comisionActiva.columnConfig
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await upsertAlumno({
      legajo: input.legajo,
      nombre: input.nombre,
      apellido: input.apellido,
      githubUsername: input.githubUsername,
      email: input.email,
      comision: comisionActiva,
      registroConfirmadoEn: comisionActiva,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

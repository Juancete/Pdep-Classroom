import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { upsertarAlumnoEnSheets, type RegistroInput } from "@/lib/sheets";
import { getComisionActiva, upsertAlumno } from "@/lib/repositories";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as RegistroInput;

    // Forzar el githubUsername del usuario autenticado (no confiar en el body)
    body.githubUsername = user.githubUsername;

    const comisionActiva = await getComisionActiva();
    const result = await upsertarAlumnoEnSheets(
      body,
      comisionActiva?.spreadsheetId,
      comisionActiva?.columnConfig
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
      comision: comisionActiva ?? undefined,
      registroConfirmadoEn: comisionActiva ?? undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

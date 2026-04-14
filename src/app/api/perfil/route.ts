import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { actualizarAlumno, type ActualizarInput } from "@/lib/sheets";
import { getComisionActiva } from "@/lib/repositories";

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as ActualizarInput;

    const comisionActiva = await getComisionActiva();
    const result = await actualizarAlumno(
      user.githubUsername,
      body,
      comisionActiva?.spreadsheetId,
      comisionActiva?.columnConfig
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

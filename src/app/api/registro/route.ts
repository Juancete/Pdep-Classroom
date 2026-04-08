import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { registrarAlumno, type RegistroInput } from "@/lib/sheets";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as RegistroInput;

    // Forzar el githubUsername del usuario autenticado (no confiar en el body)
    body.githubUsername = user.githubUsername;

    const result = await registrarAlumno(body);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

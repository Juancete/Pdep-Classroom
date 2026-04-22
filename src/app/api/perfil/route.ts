import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { upsertarAlumnoEnSheets, type RegistroInput } from "@/lib/sheets";
import { getComisionActiva, upsertAlumno, LegajoConflictError } from "@/lib/repositories";

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
      return NextResponse.json(
        { error: result.error, field: result.field },
        { status: 400 }
      );
    }

    try {
      await upsertAlumno({
        legajo: input.legajo,
        nombre: input.nombre,
        apellido: input.apellido,
        githubUsername: input.githubUsername,
        email: input.email,
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

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

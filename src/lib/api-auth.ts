import { NextResponse } from "next/server";
import { getCurrentUser, requireUser, PermisosNoVerificablesError } from "@/infrastructure/auth/session";

const UNAUTHORIZED = { error: "No autorizado" };
const PERMISOS_NO_VERIFICABLES = {
  error: "No se pudieron verificar tus permisos. Reintentá en unos segundos.",
};

export async function guardAdmin(): Promise<NextResponse | null> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(UNAUTHORIZED, { status: 401 });
    }
    if (!user.rol.puedeAdministrar()) {
      return NextResponse.json({ error: "Acceso prohibido" }, { status: 403 });
    }
    return null;
  } catch (error) {
    if (error instanceof PermisosNoVerificablesError) {
      return NextResponse.json(PERMISOS_NO_VERIFICABLES, { status: 503 });
    }
    throw error;
  }
}

export async function guardUser(): Promise<NextResponse | null> {
  try {
    await requireUser();
    return null;
  } catch (error) {
    if (error instanceof PermisosNoVerificablesError) {
      return NextResponse.json(PERMISOS_NO_VERIFICABLES, { status: 503 });
    }
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }
}

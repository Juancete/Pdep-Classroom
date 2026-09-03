import { NextResponse } from "next/server";
import { getCurrentUser, requireUser } from "@/infrastructure/auth/session";

const UNAUTHORIZED = { error: "No autorizado" };

export async function guardAdmin(): Promise<NextResponse | null> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }
  if (!user.rol.puedeAdministrar()) {
    return NextResponse.json({ error: "Acceso prohibido" }, { status: 403 });
  }
  return null;
}

export async function guardUser(): Promise<NextResponse | null> {
  try {
    await requireUser();
    return null;
  } catch {
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }
}

import { NextResponse } from "next/server";
import { requireAdmin, requireUser } from "@/lib/session";

const UNAUTHORIZED = { error: "No autorizado" };

export async function guardAdmin(): Promise<NextResponse | null> {
  try {
    await requireAdmin();
    return null;
  } catch {
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }
}

export async function guardUser(): Promise<NextResponse | null> {
  try {
    await requireUser();
    return null;
  } catch {
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }
}

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getAssignments } from "@/lib/store";

export async function GET() {
  try {
    await requireUser();
    const assignments = await getAssignments();
    return NextResponse.json(assignments);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

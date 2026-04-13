import { NextResponse } from "next/server";
import { guardUser } from "@/lib/api-auth";
import { getAssignments } from "@/lib/repositories";

export async function GET() {
  const unauthorized = await guardUser();
  if (unauthorized) return unauthorized;

  const assignments = await getAssignments();
  return NextResponse.json(assignments);
}

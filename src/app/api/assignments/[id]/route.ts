import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/api-auth";
import {
  AssignmentNoEliminableError,
  AssignmentEstructuraInmutableError,
  getAssignment,
  deleteAssignment,
  updateAssignment,
} from "@/infrastructure/repositories";
import { internalServerError } from "@/lib/api-errors";
import { AssignmentBaseSchema } from "@/lib/assignment-schema";

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const unauthorized = await guardAdmin();
  if (unauthorized) return unauthorized;

  const existing = await getAssignment(params.id);
  if (!existing) {
    return NextResponse.json({ error: "Assignment no encontrado" }, { status: 404 });
  }

  try {
    await deleteAssignment(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AssignmentNoEliminableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return internalServerError("DELETE /api/assignments/[id]", error, {
      assignmentId: params.id,
    });
  }
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const unauthorized = await guardAdmin();
  if (unauthorized) return unauthorized;

  const existing = await getAssignment(params.id);
  if (!existing) {
    return NextResponse.json({ error: "Assignment no encontrado" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = AssignmentBaseSchema.partial().safeParse(body);
  if (!parsed.success) {
    const { fieldErrors, formErrors } = parsed.error.flatten();
    return NextResponse.json(
      { error: "Datos inválidos", fields: fieldErrors, formErrors },
      { status: 400 }
    );
  }

  try {
    const updated = await updateAssignment(params.id, parsed.data);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof AssignmentEstructuraInmutableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return internalServerError("PATCH /api/assignments/[id]", error, {
      assignmentId: params.id,
    });
  }
}

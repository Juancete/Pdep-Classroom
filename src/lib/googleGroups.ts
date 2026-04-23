import { google } from "googleapis";

// ── Config desde env ────────────────────────────────────────

function getGroupEmail(): string | null {
  return process.env.GOOGLE_GROUP_EMAIL?.trim() || null;
}

function getAdminSubject(): string | null {
  return process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL?.trim() || null;
}

// ── Cliente de Admin Directory API ──────────────────────────
// Agregar miembros a un Google Group requiere Domain-Wide Delegation:
// el service account impersona a un admin del workspace.

function getDirectoryClient() {
  const subject = getAdminSubject();
  if (!subject) {
    throw new Error("GOOGLE_WORKSPACE_ADMIN_EMAIL no está configurada");
  }

  const keyJson = Buffer.from(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "",
    "base64"
  ).toString("utf-8");
  const credentials = JSON.parse(keyJson);

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/admin.directory.group.member"],
    subject,
  });

  return google.admin({ version: "directory_v1", auth });
}

// ── Suscribir alumno al grupo ───────────────────────────────

export type AgregarMiembroResult =
  | { status: "added" }
  | { status: "already_member" }
  | { status: "skipped" }
  | { status: "error"; error: string };

// Detecta el caso "el miembro ya existía en el grupo" a partir de la respuesta
// de la API. Google devuelve 409 + reason "duplicate" para este caso, pero
// googleapis expone el status por varias rutas (err.code, err.status) y los
// errores detallados pueden venir top-level o anidados en response.data.error.
function isDuplicateError(e: unknown): boolean {
  const err = e as {
    code?: number;
    status?: number;
    errors?: { reason?: string }[];
    response?: { data?: { error?: { errors?: { reason?: string }[] } } };
  };
  if (err.code === 409 || err.status === 409) return true;
  const hasDuplicateReason = (errors?: { reason?: string }[]) =>
    Boolean(errors?.some((x) => x.reason === "duplicate"));
  return (
    hasDuplicateReason(err.errors) ||
    hasDuplicateReason(err.response?.data?.error?.errors)
  );
}

export async function agregarMiembroAGrupo(
  memberEmail: string
): Promise<AgregarMiembroResult> {
  const groupEmail = getGroupEmail();
  if (!groupEmail) return { status: "skipped" };

  try {
    const admin = getDirectoryClient();
    await admin.members.insert(
      {
        groupKey: groupEmail,
        requestBody: { email: memberEmail, role: "MEMBER" },
      },
      { signal: AbortSignal.timeout(10_000) }
    );
    return { status: "added" };
  } catch (e) {
    if (isDuplicateError(e)) return { status: "already_member" };
    const msg = e instanceof Error ? e.message : "Error al suscribir al grupo";
    return { status: "error", error: msg };
  }
}

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
function isDuplicateError(error: unknown): boolean {
  const apiError = error as {
    code?: number;
    status?: number;
    errors?: { reason?: string }[];
    response?: { data?: { error?: { errors?: { reason?: string }[] } } };
  };
  if (apiError.code === 409 || apiError.status === 409) return true;
  const hasDuplicateReason = (errors?: { reason?: string }[]) =>
    Boolean(errors?.some((errorEntry) => errorEntry.reason === "duplicate"));
  return (
    hasDuplicateReason(apiError.errors) ||
    hasDuplicateReason(apiError.response?.data?.error?.errors)
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
  } catch (error) {
    if (isDuplicateError(error)) return { status: "already_member" };
    const message = error instanceof Error ? error.message : "Error al suscribir al grupo";
    return { status: "error", error: message };
  }
}

// ── Des-suscribir alumno del grupo ──────────────────────────

// Detecta "el miembro no estaba en el grupo": la baja es idempotente, así que
// un 404 (o reason notFound/resourceNotFound) lo tratamos como éxito silencioso.
// Mismo enfoque defensivo que `isDuplicateError`: el status puede venir por
// err.code, err.status o anidado en response.data.error.errors.
function isNotFoundError(error: unknown): boolean {
  const apiError = error as {
    code?: number;
    status?: number;
    errors?: { reason?: string }[];
    response?: { data?: { error?: { errors?: { reason?: string }[] } } };
  };
  if (apiError.code === 404 || apiError.status === 404) return true;
  const hasNotFoundReason = (errors?: { reason?: string }[]) =>
    Boolean(
      errors?.some(
        (errorEntry) =>
          errorEntry.reason === "notFound" || errorEntry.reason === "resourceNotFound"
      )
    );
  return (
    hasNotFoundReason(apiError.errors) ||
    hasNotFoundReason(apiError.response?.data?.error?.errors)
  );
}

export type QuitarMiembroResult =
  | { status: "removed" }
  | { status: "not_member" }
  | { status: "skipped" }
  | { status: "error"; error: string };

export async function quitarMiembroDeGrupo(
  memberEmail: string
): Promise<QuitarMiembroResult> {
  const groupEmail = getGroupEmail();
  if (!groupEmail) return { status: "skipped" };

  try {
    const admin = getDirectoryClient();
    await admin.members.delete(
      { groupKey: groupEmail, memberKey: memberEmail },
      { signal: AbortSignal.timeout(10_000) }
    );
    return { status: "removed" };
  } catch (error) {
    if (isNotFoundError(error)) return { status: "not_member" };
    const message = error instanceof Error ? error.message : "Error al quitar del grupo";
    return { status: "error", error: message };
  }
}

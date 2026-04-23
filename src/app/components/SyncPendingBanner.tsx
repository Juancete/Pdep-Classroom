import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { getAlumnoByGithub } from "@/lib/repositories";

/**
 * Banner global que avisa al alumno que su sincronización con los grupos de
 * la planilla quedó en error. Es persistente: mientras `gruposSyncFallidoEn`
 * siga prendido en la DB, se muestra en todas las páginas logueadas.
 *
 * El flag se limpia solo cuando un reintento de sync funciona (ya sea al
 * entrar a `/perfil` o al guardar desde el form); cuando eso pasa, este
 * banner desaparece en el próximo render.
 */
export async function SyncPendingBanner() {
  const user = await getCurrentUser();
  if (!user || user.isAdmin) return null;

  const alumno = await getAlumnoByGithub(user.githubUsername);
  if (!alumno?.gruposSyncFallidoEn) return null;

  return (
    <div
      role="alert"
      className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm"
    >
      <div className="max-w-5xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          No pudimos asignarte a tu grupo de TP desde la planilla.
        </span>
        <Link href="/perfil" className="underline font-medium hover:text-amber-950">
          Reintentar desde tu perfil
        </Link>
      </div>
    </div>
  );
}

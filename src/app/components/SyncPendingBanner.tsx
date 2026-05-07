import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { getAlumnoByGithub } from "@/lib/repositories";

/**
 * Banner global que avisa al alumno que algo en la sincronización con la
 * planilla quedó en error. Es persistente: mientras `gruposSyncFallidoEn` o
 * `alumnoSyncFallidoEn` estén prendidos, se muestra en todas las páginas
 * logueadas.
 *
 * Los flags se limpian cuando un reintento de sync funciona (events.signIn,
 * /api/registro, /api/perfil, import admin, o reintento manual desde /perfil).
 * Cuando eso pasa, este banner desaparece en el próximo render.
 */
export async function SyncPendingBanner() {
  const user = await getCurrentUser();
  if (!user || user.isAdmin) return null;

  const alumno = await getAlumnoByGithub(user.githubUsername);
  if (!alumno) return null;

  if (!alumno.tieneSyncPendiente()) return null;

  const mensaje = alumno.mensajeDeSyncPendiente();

  return (
    <div
      role="alert"
      className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm"
    >
      <div className="max-w-5xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{mensaje}</span>
        <Link href="/perfil" className="underline font-medium hover:text-amber-950">
          Reintentar desde tu perfil
        </Link>
      </div>
    </div>
  );
}

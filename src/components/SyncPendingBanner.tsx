import Link from "next/link";
import { getCurrentUser } from "@/infrastructure/auth/session";
import { getAlumnoByGithub } from "@/infrastructure/repositories";
import { resolverEstadoDeSincronizacion } from "@/application/estadoDeSincronizacion";

/**
 * Banner global que avisa al alumno que algo en la sincronización con la
 * planilla o con algún canal de comunicación quedó en error. Es persistente
 * mientras alguno de los estados de sincronización requiera atención.
 *
 * Los estados se limpian cuando un reintento funciona. Cuando eso pasa, este
 * banner desaparece en el próximo render.
 */
export async function SyncPendingBanner() {
  const user = await getCurrentUser();
  if (!user || !user.rol.veBannerDeSincronizacion()) return null;

  const alumno = await getAlumnoByGithub(user.githubUsername);
  if (!alumno) return null;

  const estado = await resolverEstadoDeSincronizacion(alumno);
  if (!estado.hayPendientes) return null;

  const mensaje = estado.mensaje;

  return (
    <div
      role="alert"
      className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm"
    >
      <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{mensaje}</span>
        <Link href="/perfil" className="underline font-medium hover:text-amber-950">
          Reintentar desde tu perfil
        </Link>
      </div>
    </div>
  );
}

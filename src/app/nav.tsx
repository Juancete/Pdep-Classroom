import { getCurrentUser } from "@/lib/session";
import { getAlumnoByGithub } from "@/lib/repositories";
import { isGoogleGroupsConfigured } from "@/lib/googleGroups";
import Link from "next/link";
import { NavMenu, type NavLink } from "./nav-menu";

export async function Nav() {
  const user = await getCurrentUser();
  const alumno =
    user && user.rol.veBannerDeSincronizacion()
      ? await getAlumnoByGithub(user.githubUsername).catch(() => null)
      : null;
  const hasPendingSync = Boolean(
    alumno?.tieneSyncPendiente(isGoogleGroupsConfigured())
  );

  const links: NavLink[] = user
    ? [{ href: "/dashboard", label: "Mis TPs" }, ...user.rol.itemsDeNavegacion()]
    : [];

  return (
    <nav className="bg-pdep-900 text-white">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg tracking-tight">
          PdeP <span className="font-light text-pdep-200">Classroom</span>
        </Link>

        {user && (
          <NavMenu
            links={links}
            username={user.githubUsername}
            image={user.image}
            isAdmin={user.rol.puedeAdministrar()}
            hasPendingSync={hasPendingSync}
          />
        )}
      </div>
    </nav>
  );
}

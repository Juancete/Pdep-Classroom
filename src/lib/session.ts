import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { PdepUser, SessionPdepUser } from "@/types";
import { rolDesdeNombre } from "@/domain/entities/RolDeUsuario";

export async function getCurrentUser(): Promise<PdepUser | null> {
  const session = await auth();
  if (!session) return null;
  const raw = (session as unknown as { pdepUser?: SessionPdepUser }).pdepUser;
  if (!raw) return null;
  return {
    githubUsername: raw.githubUsername,
    name: raw.name,
    image: raw.image,
    rol: rolDesdeNombre(raw.rolNombre),
  };
}

export async function requireUser(): Promise<PdepUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<PdepUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.rol.puedeAdministrar()) redirect("/dashboard");
  return user;
}

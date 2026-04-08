import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { PdepUser } from "@/types";

export async function getCurrentUser(): Promise<PdepUser | null> {
  const session = await auth();
  if (!session) return null;
  return (session as unknown as { pdepUser: PdepUser }).pdepUser ?? null;
}

export async function requireUser(): Promise<PdepUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<PdepUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/dashboard");
  return user;
}

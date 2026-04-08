import { auth } from "@/lib/auth";
import { getAlumnoByGithub } from "@/lib/sheets";
import { redirect } from "next/navigation";
import { RegistroForm } from "./registro-form";
import type { PdepUser } from "@/types";

export default async function RegistroPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const pdepUser = (session as unknown as { pdepUser: PdepUser }).pdepUser;
  const githubUsername = pdepUser.githubUsername;

  // Si ya está registrado, mandar al dashboard
  const existente = await getAlumnoByGithub(githubUsername);
  if (existente) redirect("/dashboard");

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-2">Registro</h1>
      <p className="text-gray-500 text-sm mb-6">
        Completá tus datos para registrarte en el curso. Tu usuario de GitHub
        ya está vinculado:{" "}
        <span className="font-mono font-medium text-gray-700">
          {githubUsername}
        </span>
      </p>

      <RegistroForm
        githubUsername={githubUsername}
        email={session.user?.email ?? ""}
        nombre={session.user?.name ?? ""}
      />
    </div>
  );
}

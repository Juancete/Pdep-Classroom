import { auth } from "@/lib/auth";
import { getAlumnoByGithub } from "@/lib/sheets";
import { getComisionActiva } from "@/lib/repositories";
import { redirect } from "next/navigation";
import { AlumnoForm } from "@/app/components/AlumnoForm";
import { upsertAlumno } from "@/lib/repositories";
import type { PdepUser } from "@/types";

export default async function RegistroPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const pdepUser = (session as unknown as { pdepUser: PdepUser }).pdepUser;
  const githubUsername = pdepUser.githubUsername;

  const comisionActiva = await getComisionActiva();

  const existente = await getAlumnoByGithub(
    githubUsername,
    comisionActiva?.spreadsheetId,
    comisionActiva?.columnConfig
  );
  if (existente) {
    await upsertAlumno({ ...existente, comision: comisionActiva ?? undefined });
    redirect("/dashboard");
  }

  // Split del nombre de GitHub en nombre/apellido como sugerencia
  const parts = (session.user?.name ?? "").split(" ");
  const defaultNombre = parts.slice(0, -1).join(" ") || parts[0] || "";
  const defaultApellido = parts.length > 1 ? parts[parts.length - 1] : "";

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

      <AlumnoForm
        defaultValues={{
          githubUsername,
          email: session.user?.email ?? "",
          nombre: defaultNombre,
          apellido: defaultApellido,
        }}
        apiEndpoint="/api/registro"
        method="POST"
        extraBody={{ githubUsername }}
        onSuccessRedirect="/dashboard"
        submitLabel="Registrarme"
        successMessage="¡Registro exitoso! Redirigiendo al dashboard…"
      />
    </div>
  );
}

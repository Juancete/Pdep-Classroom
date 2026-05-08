import { auth } from "@/lib/auth";
import { getAlumnoByGithub as getAlumnoDeSheets } from "@/lib/sheets";
import {
  getAlumnoByGithub as getAlumnoDeDB,
  getComisionActiva,
} from "@/lib/repositories";
import { redirect } from "next/navigation";
import { AlumnoForm } from "@/app/components/AlumnoForm";
import type { PdepUser } from "@/types";

export default async function RegistroPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const pdepUser = (session as unknown as { pdepUser: PdepUser }).pdepUser;
  const githubUsername = pdepUser.githubUsername;

  const comisionActiva = await getComisionActiva();
  const alumnoDB = await getAlumnoDeDB(githubUsername);

  // Si ya confirmó los datos para esta comisión, no tiene nada que hacer acá.
  if (alumnoDB && alumnoDB.confirmoRegistroEn(comisionActiva)) {
    redirect("/dashboard");
  }

  // Prefill: gana lo que el alumno confirmó alguna vez (DB); si no, lo que
  // pre-cargó el admin en la planilla (Sheets); y como último recurso, lo que
  // viene del perfil de GitHub de la sesión.
  // Sin comisión activa no hay planilla que leer; caemos al prefill de DB/sesión.
  const alumnoSheets = comisionActiva
    ? await getAlumnoDeSheets(
        githubUsername,
        comisionActiva.spreadsheetId,
        comisionActiva.columnConfig
      )
    : undefined;

  const nameParts = (session.user?.name ?? "").split(" ").filter(Boolean);
  const defaultNombre = nameParts.slice(0, -1).join(" ") || nameParts[0] || "";
  const defaultApellido = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";

  const defaultValues = {
    githubUsername,
    legajo: alumnoDB?.legajo ?? alumnoSheets?.legajo ?? "",
    apellido: alumnoDB?.apellido ?? alumnoSheets?.apellido ?? defaultApellido,
    nombre: alumnoDB?.nombre ?? alumnoSheets?.nombre ?? defaultNombre,
    email: alumnoDB?.email ?? alumnoSheets?.email ?? session.user?.email ?? "",
  };

  // Alumno registrado en la DB pero no en la comisión... Entonces le saco los datos 
  // para confirmar nuevamente los datos de la nueva cursada
  // pudo haber cambiado email, etc
  const esRecursante = Boolean(alumnoDB);

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-2">Registro</h1>
      <p className="text-gray-500 text-sm mb-6">
        {esRecursante
          ? "Confirmá tus datos para esta cursada. "
          : "Completá tus datos para registrarte en el curso. "}
        Tu usuario de GitHub ya está vinculado:{" "}
        <span className="font-mono font-medium text-gray-700">
          {githubUsername}
        </span>
      </p>

      <AlumnoForm
        defaultValues={defaultValues}
        apiEndpoint="/api/registro"
        method="POST"
        extraBody={{ githubUsername }}
        onSuccessRedirect="/dashboard"
        submitLabel={esRecursante ? "Confirmar datos" : "Registrarme"}
        successMessage="¡Listo! Redirigiendo al dashboard…"
      />
    </div>
  );
}

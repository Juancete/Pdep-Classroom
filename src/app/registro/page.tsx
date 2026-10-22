import { auth } from "@/infrastructure/auth/auth";
import { requireUser } from "@/infrastructure/auth/session";
import { getDatosPrecargaByGithub } from "@/infrastructure/sheets";
import {
  getAlumnoByGithub as getAlumnoDeDB,
  getComisionActiva,
} from "@/infrastructure/repositories";
import { redirect } from "next/navigation";
import { AlumnoForm } from "@/components/AlumnoForm";
import { separarNombreYApellido } from "@/lib/naming";

export default async function RegistroPage() {
  const { githubUsername } = await requireUser();
  // `requireUser` ya redirige sin sesión; acá sólo se leen nombre y email de
  // GitHub para el prefill.
  const session = await auth();

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
  const datosPrecarga = comisionActiva
    ? await getDatosPrecargaByGithub(
        githubUsername,
        comisionActiva.spreadsheetId,
        comisionActiva.columnConfig
      )
    : undefined;

  const { nombre: defaultNombre, apellido: defaultApellido } = separarNombreYApellido(
    session?.user?.name ?? ""
  );

  const defaultValues = {
    githubUsername,
    legajo: alumnoDB?.legajo ?? datosPrecarga?.legajo ?? "",
    apellido: alumnoDB?.apellido ?? datosPrecarga?.apellido ?? defaultApellido,
    nombre: alumnoDB?.nombre ?? datosPrecarga?.nombre ?? defaultNombre,
    email: alumnoDB?.email ?? datosPrecarga?.email ?? session?.user?.email ?? "",
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
        referenciaNombre={datosPrecarga?.nombreCrudo}
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

import { auth } from "@/lib/auth";
import { getAlumnoByGithub } from "@/lib/repositories";
import { redirect } from "next/navigation";
import { AlumnoForm } from "@/app/components/AlumnoForm";
import type { PdepUser } from "@/types";

export default async function PerfilPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const pdepUser = (session as unknown as { pdepUser: PdepUser }).pdepUser;
  const githubUsername = pdepUser.githubUsername;

  const alumno = await getAlumnoByGithub(githubUsername);
  if (!alumno) redirect("/registro");

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-2">Mi perfil</h1>
      <p className="text-gray-500 text-sm mb-6">
        Podés editar tus datos de registro. Tu usuario de GitHub no se puede cambiar.
      </p>

      <AlumnoForm
        defaultValues={{
          githubUsername: alumno.githubUsername,
          legajo: alumno.legajo,
          apellido: alumno.apellido,
          nombre: alumno.nombre,
          email: alumno.email,
        }}
        apiEndpoint="/api/perfil"
        method="PATCH"
        submitLabel="Guardar cambios"
        successMessage="Datos actualizados correctamente."
      />
    </div>
  );
}

import { auth } from "@/lib/auth";
import { getAlumnoByGithub, getComisionActiva } from "@/lib/repositories";
import { redirect } from "next/navigation";
import { AlumnoForm } from "@/app/components/AlumnoForm";
import { verificarConsistenciaAlumno } from "@/lib/services/verificarConsistenciaAlumno";
import { intentarSincronizarGrupos } from "@/lib/services/intentarSincronizarGrupos";
import type { PdepUser } from "@/types";

export default async function PerfilPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const pdepUser = (session as unknown as { pdepUser: PdepUser }).pdepUser;
  const githubUsername = pdepUser.githubUsername;

  const alumno = await getAlumnoByGithub(githubUsername);
  if (!alumno) redirect("/registro");

  // Reintento on-demand: si alguno de los flags de sync está prendido,
  // el alumno probablemente entró acá específicamente para resolverlo.
  // Las dos llamadas son independientes y se invocan solo si su flag está activo.
  // Protegemos defensivamente: una excepción inesperada no debe romper el render.
  if (alumno.alumnoSyncFallidoEn || alumno.gruposSyncFallidoEn) {
    try {
      const comisionActiva = await getComisionActiva();
      if (comisionActiva) {
        const tareas: Promise<unknown>[] = [];
        if (alumno.alumnoSyncFallidoEn) tareas.push(verificarConsistenciaAlumno(githubUsername, comisionActiva));
        if (alumno.gruposSyncFallidoEn) tareas.push(intentarSincronizarGrupos(githubUsername, comisionActiva));
        await Promise.allSettled(tareas);
      }
    } catch {
      // Flags persistentes en DB se encargan del banner.
    }
  }

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

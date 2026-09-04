import { auth } from "@/infrastructure/auth/auth";
import { getAlumnoByGithub, getComisionActiva } from "@/infrastructure/repositories";
import { redirect } from "next/navigation";
import { AlumnoForm } from "@/components/AlumnoForm";
import { verificarConsistenciaAlumno } from "@/application/verificarConsistenciaAlumno";
import { intentarSincronizarGrupos } from "@/application/intentarSincronizarGrupos";
import { resolverEstadoDeSincronizacion } from "@/application/estadoDeSincronizacion";
import type { SessionPdepUser } from "@/types";

export default async function PerfilPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const pdepUser = (session as unknown as { pdepUser: SessionPdepUser }).pdepUser;
  const githubUsername = pdepUser.githubUsername;

  const alumno = await getAlumnoByGithub(githubUsername);
  if (!alumno) redirect("/registro");

  // Reintento on-demand: si alguno de los asuntos de sync está pendiente,
  // el alumno probablemente entró acá específicamente para resolverlo.
  // Las sincronizaciones son independientes y se invocan solo si su estado
  // persistido indica que necesitan reintento.
  // Protegemos defensivamente: una excepción inesperada no debe romper el render.
  const estadoDeSincronizacion = await resolverEstadoDeSincronizacion(alumno);
  if (estadoDeSincronizacion.hayPendientes) {
    const tareas: Promise<unknown>[] = [];
    if (alumno.tieneSyncDeAlumnoFallido() || alumno.tieneSyncDeGruposFallido()) {
      tareas.push(
        (async () => {
          const comisionActiva = await getComisionActiva();
          if (!comisionActiva) return;

          const tareasDeComision: Promise<unknown>[] = [];
          if (alumno.tieneSyncDeAlumnoFallido()) {
            tareasDeComision.push(
              verificarConsistenciaAlumno(
                githubUsername,
                comisionActiva
              )
            );
          }
          if (alumno.tieneSyncDeGruposFallido() && !comisionActiva.gruposYaImportados()) {
            tareasDeComision.push(
              intentarSincronizarGrupos(githubUsername, comisionActiva)
            );
          }
          await Promise.allSettled(tareasDeComision);
        })()
      );
    }
    for (const canal of estadoDeSincronizacion.canalesPendientes) {
      tareas.push(canal.sincronizar(githubUsername));
    }
    await Promise.allSettled(tareas);
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

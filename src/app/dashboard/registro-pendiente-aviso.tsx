import Link from "next/link";

/**
 * Aviso que ve un docente en Mis TPs cuando no figura como alumno
 * registrado de la comisión activa (o confirmó en otra). Vive únicamente
 * en esta vista — no en el layout ni como banner global: en el resto de la
 * app el docente no ve nada nuevo (`SyncPendingBanner` sigue sin mostrarse
 * para su rol). Sirve para que un docente pueda mostrar en clase el flujo
 * de aceptación del alumno sin que le falle con `AlumnoNoRegistradoError` o
 * un 403 al crear/unirse a un grupo.
 */
export function RegistroPendienteAviso() {
  return (
    <div
      role="status"
      data-testid="aviso-registro-pendiente"
      className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-lg p-4 mb-6"
    >
      <p>
        Estás entrando como docente y no figurás como alumno de la comisión
        activa. Para aceptar TPs desde acá, registrate primero: tus datos se
        cargan en la planilla.
      </p>
      <Link href="/registro" className="underline font-medium hover:text-amber-950">
        Registrarme como alumno
      </Link>
    </div>
  );
}

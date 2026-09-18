import { cookies } from "next/headers";

// Cookie httpOnly por navegador — issue #114. No hay tabla de preferencias
// ni `searchParams` disponibles en los layouts, así que la comisión que un
// docente está consultando en el panel admin se persiste acá; el dominio
// (`resolverContextoDeComision`) no sabe nada de cookies, sólo recibe el id
// crudo.
const NOMBRE_COOKIE = "comision_consultada";

// ~180 días. La cookie sobrevive entre sesiones (no es una preferencia
// efímera), pero no indefinidamente.
const MAX_AGE_EN_SEGUNDOS = 60 * 60 * 24 * 180;

// Restringida a `/admin`: es una preferencia del panel docente, no debe
// viajar en requests fuera de esa sección.
const PATH_COOKIE = "/admin";

export async function leerComisionConsultadaId(): Promise<string | undefined> {
  const almacenDeCookies = await cookies();
  return almacenDeCookies.get(NOMBRE_COOKIE)?.value;
}

export async function guardarComisionConsultadaId(id: string): Promise<void> {
  const almacenDeCookies = await cookies();
  almacenDeCookies.set(NOMBRE_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: PATH_COOKIE,
    maxAge: MAX_AGE_EN_SEGUNDOS,
  });
}

export async function borrarComisionConsultadaId(): Promise<void> {
  const almacenDeCookies = await cookies();
  // Mismo `path` que en `guardarComisionConsultadaId`: un `delete` con un
  // path distinto no borra la cookie, agrega una nueva que no coincide.
  almacenDeCookies.delete({ name: NOMBRE_COOKIE, path: PATH_COOKIE });
}

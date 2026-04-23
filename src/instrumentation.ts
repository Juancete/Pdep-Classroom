// Next.js ejecuta `register()` una única vez cuando el server arranca.
// Lo usamos para validar combinaciones de env vars que si están rotas
// preferimos que el deploy falle ahora y no en la primera request.
//
// Importante: este archivo NO puede importar módulos que dependan de
// googleapis (u otros paquetes Node-only). Next bundlea instrumentation
// también para el Edge runtime, que no tiene los módulos nativos
// `https`/`net`/`http` que esas librerías usan — y webpack analiza los
// imports estáticamente aunque el código esté detrás de un guard de
// runtime. Por eso la validación vive inline acá.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  assertGoogleGroupsConfig();
}

export function assertGoogleGroupsConfig(): void {
  const groupEmail = process.env.GOOGLE_GROUP_EMAIL?.trim();
  const adminEmail = process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL?.trim();
  if (groupEmail && !adminEmail) {
    throw new Error(
      "Configuración inválida: GOOGLE_GROUP_EMAIL está seteada pero GOOGLE_WORKSPACE_ADMIN_EMAIL no. " +
        "La suscripción al grupo requiere domain-wide delegation — configurá ambas o ninguna."
    );
  }
}

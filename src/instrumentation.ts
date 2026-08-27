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
  assertProductionConfig();
}

// GOOGLE_GROUP_EMAIL / GOOGLE_WORKSPACE_ADMIN_EMAIL NO están acá a propósito:
// el canal de Google Groups (ver src/lib/canales/) es opcional — sin esas
// vars simplemente no hace nada, no rompe el boot. GOOGLE_SERVICE_ACCOUNT_KEY
// sí es obligatoria: la usa Google Sheets, que no es opcional.
const REQUIRED_PRODUCTION_ENV = [
  "DATABASE_URL",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "NEXTAUTH_SECRET",
  "ADMIN_GITHUB_USERNAMES",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_APP_INSTALLATION_ID",
  "GITHUB_WEBHOOK_SECRET",
  "GOOGLE_SERVICE_ACCOUNT_KEY",
] as const;

export function assertProductionConfig(): void {
  // Vercel expone esta variable durante build y runtime. No usamos NODE_ENV:
  // un build local de producción tiene que seguir siendo reproducible sin
  // credenciales reales.
  if (process.env.VERCEL_ENV !== "production") return;
  const faltantes = REQUIRED_PRODUCTION_ENV.filter(
    (nombre) => !process.env[nombre]?.trim()
  );
  if (faltantes.length > 0) {
    throw new Error(
      `Configuración productiva incompleta. Faltan: ${faltantes.join(", ")}`
    );
  }
  if (process.env.ENABLE_DEV_LOGIN) {
    throw new Error("ENABLE_DEV_LOGIN no debe estar configurada en producción.");
  }
}

// Queda inline y sin cambios tras el refactor a canales de comunicación
// (ver src/lib/canales/): sigue siendo la única validación de Google Groups
// que corre acá — a propósito NO se la reemplaza por algo que itere el
// registro de canales, porque `src/lib/canales/index.ts` importa
// `GoogleGroupsCanal`, que arrastra `googleapis`, y esta función corre en
// `register()` (ver comentario de arriba sobre el bundle Edge).
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

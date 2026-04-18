// Next.js ejecuta `register()` una única vez cuando el server arranca.
// Lo usamos para validar combinaciones de env vars que si están rotas
// preferimos que el deploy falle ahora y no en la primera request.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertGoogleGroupsConfig } = await import("@/lib/googleGroups");
  assertGoogleGroupsConfig();
}

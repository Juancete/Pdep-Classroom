import { signIn } from "@/lib/auth";

export default function LoginPage() {
  const adminUsernames = (process.env.ADMIN_GITHUB_USERNAMES ?? "")
    .split(",")
    .map((username) => username.trim())
    .filter(Boolean);
  // Mismas dos condiciones que registran el provider en auth.config.ts: si
  // acá se mostrara el panel sin que el provider exista, el login fallaría
  // silenciosamente al tocar cualquiera de los botones.
  const devLoginHabilitado =
    process.env.NODE_ENV === "development" && process.env.ENABLE_DEV_LOGIN === "true";

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <h2 className="text-xl font-bold text-center mb-6">Iniciar sesión</h2>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Continuar con GitHub
          </button>
        </form>
        <p className="text-xs text-gray-500 text-center mt-4">
          Usá la misma cuenta de GitHub que registraste en la planilla.
        </p>
      </div>

      {devLoginHabilitado && (
        <div
          className="bg-amber-50 border border-amber-200 rounded-xl p-6 w-full max-w-sm"
          data-testid="dev-login"
        >
          <h3 className="text-sm font-semibold text-amber-900 mb-1">
            Modo desarrollo
          </h3>
          <p className="text-xs text-amber-700 mb-4">
            Entrar sin pasar por GitHub. Sólo visible en local.
          </p>

          {adminUsernames.length > 0 && (
            <div className="space-y-2 mb-4">
              {adminUsernames.map((username) => (
                <form
                  key={username}
                  action={async () => {
                    "use server";
                    await signIn("dev-login", {
                      githubUsername: username,
                      redirectTo: "/dashboard",
                    });
                  }}
                >
                  <button
                    type="submit"
                    className="w-full text-sm bg-amber-600 text-white px-3 py-2 rounded-lg font-medium hover:bg-amber-700 transition-colors"
                  >
                    Entrar como {username} (docente)
                  </button>
                </form>
              ))}
            </div>
          )}

          <form
            action={async (formData: FormData) => {
              "use server";
              const githubUsername = String(formData.get("githubUsername") ?? "").trim();
              if (!githubUsername) return;
              await signIn("dev-login", { githubUsername, redirectTo: "/dashboard" });
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              name="githubUsername"
              placeholder="username de alumno"
              aria-label="GitHub username para entrar como alumno"
              className="flex-1 border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              type="submit"
              className="text-sm bg-white border border-amber-600 text-amber-700 px-3 py-2 rounded-lg font-medium hover:bg-amber-100 transition-colors"
            >
              Entrar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getProxyRedirectPath } from "./proxy-authorization";

function session(isAdmin: boolean) {
  return {
    pdepUser: {
      githubUsername: isAdmin ? "docente" : "alumno",
      name: "Usuario",
      image: "",
      rolNombre: isAdmin ? "docente" : "alumno",
    },
  };
}

describe("proxy authorization", () => {
  it("redirige una sesión ausente al login", () => {
    expect(
      getProxyRedirectPath({ session: null, pathname: "/dashboard" })
    ).toBe("/login");
  });

  it("redirige un alumno fuera de las rutas administrativas", () => {
    expect(
      getProxyRedirectPath({ session: session(false), pathname: "/admin/assignments" })
    ).toBe("/dashboard");
  });

  it("permite a un administrador acceder a rutas administrativas", () => {
    expect(
      getProxyRedirectPath({ session: session(true), pathname: "/admin/assignments" })
    ).toBeNull();
  });

  it("permite a un alumno acceder a una ruta protegida no administrativa", () => {
    expect(
      getProxyRedirectPath({ session: session(false), pathname: "/dashboard" })
    ).toBeNull();
  });

  it("redirige a /dashboard (sin romper) si la sesión tiene pdepUser pero sin rolNombre", () => {
    const sessionSinRol = { pdepUser: { githubUsername: "alumno", name: "Usuario", image: "" } };
    expect(
      getProxyRedirectPath({ session: sessionSinRol, pathname: "/admin/assignments" })
    ).toBe("/dashboard");
  });

  // El matcher de `src/proxy.ts` es una allowlist explícita — si alguien
  // agregara `/api/webhooks/:path*` ahí, `getProxyRedirectPath` devolvería
  // un 307 a `/login` ante la falta de sesión (GitHub no manda cookie), y
  // el webhook de GitHub (issue #60) dejaría de recibir deliveries sin que
  // ningún test unitario de la ruta lo note. Este test es el guard.
  it("el matcher del proxy no cubre /api/webhooks (es pública a propósito, issue #60)", () => {
    const proxySource = readFileSync(join(process.cwd(), "src", "proxy.ts"), "utf8");
    expect(proxySource).not.toContain("/api/webhooks");
  });
});

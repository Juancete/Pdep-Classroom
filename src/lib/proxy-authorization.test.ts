import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getProxyRedirectPath } from "./proxy-authorization";

function session() {
  return { pdepUser: { githubUsername: "alumno", name: "Usuario", image: "" } };
}

describe("proxy authorization", () => {
  it("redirige una sesión ausente al login", () => {
    expect(getProxyRedirectPath({ session: null })).toBe("/login");
  });

  it("permite a cualquier usuario autenticado pasar (la autorización por rol vive más adentro, no en el edge)", () => {
    expect(getProxyRedirectPath({ session: session() })).toBeNull();
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

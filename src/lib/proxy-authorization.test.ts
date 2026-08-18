import { getProxyRedirectPath } from "./proxy-authorization";
import { DOCENTE, ESTUDIANTE } from "@/domain/entities/RolDeUsuario";

function session(isAdmin: boolean) {
  return {
    pdepUser: {
      githubUsername: isAdmin ? "docente" : "alumno",
      name: "Usuario",
      image: "",
      rol: isAdmin ? DOCENTE : ESTUDIANTE,
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
});

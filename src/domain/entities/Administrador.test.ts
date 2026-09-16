import { describe, it, expect } from "vitest";
import { Administrador } from "./Administrador";

describe("Administrador.validarAlta", () => {
  it("rechaza username vacío", () => {
    expect(Administrador.validarAlta({ githubUsername: "" })).toBe(
      "El usuario de GitHub es obligatorio"
    );
  });

  it("rechaza username con espacios solamente", () => {
    expect(Administrador.validarAlta({ githubUsername: "   " })).toBe(
      "El usuario de GitHub es obligatorio"
    );
  });

  it("rechaza un formato inválido", () => {
    expect(Administrador.validarAlta({ githubUsername: "-invalido" })).toBe(
      "El usuario de GitHub no tiene un formato válido"
    );
  });

  it("acepta un username válido sin nombre", () => {
    expect(Administrador.validarAlta({ githubUsername: "ayudante1" })).toBeNull();
  });

  it("acepta un username válido con nombre", () => {
    expect(Administrador.validarAlta({ githubUsername: "ayudante1", nombre: "Ana" })).toBeNull();
  });
});

describe("Administrador.crear", () => {
  it("normaliza el username (trim, @, minúsculas)", () => {
    const administrador = Administrador.crear({
      githubUsername: " @Ayudante1 ",
      porUsuario: "juancete",
    });
    expect(administrador.githubUsername).toBe("ayudante1");
  });

  it("queda activo por default", () => {
    const administrador = Administrador.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
    expect(administrador.activo).toBe(true);
  });

  it("sella la auditoría de alta en creadoPor/modificadoPor", () => {
    const administrador = Administrador.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
    expect(administrador.creadoPor).toBe("juancete");
    expect(administrador.modificadoPor).toBe("juancete");
    expect(administrador.creadoEn).toBeInstanceOf(Date);
    expect(administrador.modificadoEn).toBeInstanceOf(Date);
  });

  it("nombre vacío o ausente queda en null", () => {
    expect(Administrador.crear({ githubUsername: "a1", porUsuario: "x" }).nombre).toBeNull();
    expect(
      Administrador.crear({ githubUsername: "a1", nombre: "   ", porUsuario: "x" }).nombre
    ).toBeNull();
  });

  it("hace trim del nombre", () => {
    const administrador = Administrador.crear({
      githubUsername: "a1",
      nombre: "  Ana García  ",
      porUsuario: "x",
    });
    expect(administrador.nombre).toBe("Ana García");
  });
});

describe("Administrador.renombrar", () => {
  it("cambia el nombre y sella modificadoPor/modificadoEn, sin tocar la identidad ni el estado", () => {
    const administrador = Administrador.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
    const ahora = new Date("2026-09-16T10:00:00Z");

    administrador.renombrar("Nuevo Nombre", "otro-responsable", ahora);

    expect(administrador.nombre).toBe("Nuevo Nombre");
    expect(administrador.modificadoPor).toBe("otro-responsable");
    expect(administrador.modificadoEn).toBe(ahora);
    expect(administrador.githubUsername).toBe("ayudante1");
    expect(administrador.activo).toBe(true);
  });

  it("nombre vacío limpia el campo a null", () => {
    const administrador = Administrador.crear({
      githubUsername: "ayudante1",
      nombre: "Algo",
      porUsuario: "juancete",
    });
    administrador.renombrar("", "juancete");
    expect(administrador.nombre).toBeNull();
  });
});

describe("Administrador.desactivar / reactivar", () => {
  it("desactivar pone activo en false y sella la auditoría", () => {
    const administrador = Administrador.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
    const ahora = new Date("2026-09-16T10:00:00Z");

    administrador.desactivar("juancete", ahora);

    expect(administrador.activo).toBe(false);
    expect(administrador.modificadoPor).toBe("juancete");
    expect(administrador.modificadoEn).toBe(ahora);
  });

  it("reactivar pone activo en true y sella la auditoría", () => {
    const administrador = Administrador.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
    administrador.desactivar("juancete");
    const ahora = new Date("2026-09-16T11:00:00Z");

    administrador.reactivar("fdodino", ahora);

    expect(administrador.activo).toBe(true);
    expect(administrador.modificadoPor).toBe("fdodino");
    expect(administrador.modificadoEn).toBe(ahora);
  });

  it("desactivar es idempotente: no resella la auditoría si ya estaba inactivo", () => {
    const administrador = Administrador.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
    const primeraDesactivacion = new Date("2026-09-16T10:00:00Z");
    administrador.desactivar("juancete", primeraDesactivacion);

    administrador.desactivar("otro-responsable", new Date("2026-09-16T12:00:00Z"));

    expect(administrador.modificadoPor).toBe("juancete");
    expect(administrador.modificadoEn).toBe(primeraDesactivacion);
  });

  it("reactivar es idempotente: no resella la auditoría si ya estaba activo", () => {
    const administrador = Administrador.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
    const creadoEn = administrador.modificadoEn;

    administrador.reactivar("otro-responsable", new Date("2026-09-16T12:00:00Z"));

    expect(administrador.modificadoPor).toBe("juancete");
    expect(administrador.modificadoEn).toBe(creadoEn);
  });
});

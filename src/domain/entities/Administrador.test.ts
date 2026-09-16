import { describe, it, expect } from "vitest";
import { Administrador, AdministradorInvalidoError } from "./Administrador";

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

  it("acepta un username con '@' inicial, validando sobre el valor normalizado", () => {
    expect(Administrador.validarAlta({ githubUsername: "@Ayudante1" })).toBeNull();
  });

  it("rechaza un '@' solo: queda vacío tras normalizar, es obligatorio y no formato inválido", () => {
    expect(Administrador.validarAlta({ githubUsername: "@" })).toBe(
      "El usuario de GitHub es obligatorio"
    );
  });

  it("rechaza un username de 40 caracteres con el mensaje de tope", () => {
    expect(
      Administrador.validarAlta({ githubUsername: "a".repeat(40) })
    ).toBe("El usuario de GitHub no puede superar los 39 caracteres");
  });

  it("acepta un username de 39 caracteres (el tope real de GitHub)", () => {
    expect(Administrador.validarAlta({ githubUsername: "a".repeat(39) })).toBeNull();
  });

  it("rechaza un nombre de 256 caracteres", () => {
    const nombreDemasiadoLargo = "a".repeat(256);
    expect(
      Administrador.validarAlta({ githubUsername: "ayudante1", nombre: nombreDemasiadoLargo })
    ).toBe("El nombre no puede superar los 255 caracteres");
  });

  it("acepta un nombre de 255 caracteres", () => {
    const nombreAlLimite = "a".repeat(255);
    expect(
      Administrador.validarAlta({ githubUsername: "ayudante1", nombre: nombreAlLimite })
    ).toBeNull();
  });
});

describe("Administrador.crear", () => {
  // `crear()` corre `validarAlta` primero, que ya normaliza el username
  // antes de validar el formato (ver el describe de `validarAlta` más
  // arriba) — así que un "@ayudante1" con espacios pasa la validación igual
  // que "ayudante1", y el constructor aplica la misma normalización final.
  it("normaliza el username (trim, minúsculas)", () => {
    const administrador = Administrador.crear({
      githubUsername: " Ayudante1 ",
      porUsuario: "juancete",
    });
    expect(administrador.githubUsername).toBe("ayudante1");
  });

  it("normaliza el username con '@' inicial y espacios", () => {
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

  it("lanza AdministradorInvalidoError con un username inválido", () => {
    expect(() =>
      Administrador.crear({ githubUsername: "-invalido", porUsuario: "juancete" })
    ).toThrow(AdministradorInvalidoError);
  });

  it("lanza AdministradorInvalidoError con un username de 256 caracteres", () => {
    expect(() =>
      Administrador.crear({ githubUsername: "a".repeat(256), porUsuario: "juancete" })
    ).toThrow(AdministradorInvalidoError);
  });

  it("lanza AdministradorInvalidoError con un nombre de 256 caracteres", () => {
    expect(() =>
      Administrador.crear({
        githubUsername: "ayudante1",
        nombre: "a".repeat(256),
        porUsuario: "juancete",
      })
    ).toThrow(AdministradorInvalidoError);
  });
});

describe("Administrador constructor", () => {
  it("normaliza el username (trim, @, minúsculas)", () => {
    const administrador = new Administrador(" @Ayudante1 ");
    expect(administrador.githubUsername).toBe("ayudante1");
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

  it("lanza AdministradorInvalidoError con un nombre de 256 caracteres, sin tocar el nombre anterior", () => {
    const administrador = Administrador.crear({
      githubUsername: "ayudante1",
      nombre: "Nombre original",
      porUsuario: "juancete",
    });

    expect(() => administrador.renombrar("a".repeat(256), "otro-responsable")).toThrow(
      AdministradorInvalidoError
    );
    expect(administrador.nombre).toBe("Nombre original");
  });
});

describe("Administrador — identidad inmutable", () => {
  it("githubUsername no cambia tras renombrar, desactivar ni reactivar", () => {
    const administrador = Administrador.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });

    administrador.renombrar("Nuevo Nombre", "otro-responsable");
    expect(administrador.githubUsername).toBe("ayudante1");

    administrador.desactivar("otro-responsable");
    expect(administrador.githubUsername).toBe("ayudante1");

    administrador.reactivar("otro-responsable");
    expect(administrador.githubUsername).toBe("ayudante1");
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

import { describe, it, expect } from "vitest";
import { Docente, DocenteInvalidoError } from "./Docente";

describe("Docente.validarAlta", () => {
  it("rechaza username vacío", () => {
    expect(Docente.validarAlta({ githubUsername: "" })).toBe(
      "El usuario de GitHub es obligatorio"
    );
  });

  it("rechaza username con espacios solamente", () => {
    expect(Docente.validarAlta({ githubUsername: "   " })).toBe(
      "El usuario de GitHub es obligatorio"
    );
  });

  it("rechaza un formato inválido", () => {
    expect(Docente.validarAlta({ githubUsername: "-invalido" })).toBe(
      "El usuario de GitHub no tiene un formato válido"
    );
  });

  it("acepta un username válido sin nombre", () => {
    expect(Docente.validarAlta({ githubUsername: "ayudante1" })).toBeNull();
  });

  it("acepta un username válido con nombre", () => {
    expect(Docente.validarAlta({ githubUsername: "ayudante1", nombre: "Ana" })).toBeNull();
  });

  it("acepta un username con '@' inicial, validando sobre el valor normalizado", () => {
    expect(Docente.validarAlta({ githubUsername: "@Ayudante1" })).toBeNull();
  });

  it("rechaza un '@' solo: queda vacío tras normalizar, es obligatorio y no formato inválido", () => {
    expect(Docente.validarAlta({ githubUsername: "@" })).toBe(
      "El usuario de GitHub es obligatorio"
    );
  });

  it("rechaza un username de 40 caracteres con el mensaje de tope", () => {
    expect(
      Docente.validarAlta({ githubUsername: "a".repeat(40) })
    ).toBe("El usuario de GitHub no puede superar los 39 caracteres");
  });

  it("acepta un username de 39 caracteres (el tope real de GitHub)", () => {
    expect(Docente.validarAlta({ githubUsername: "a".repeat(39) })).toBeNull();
  });

  it("rechaza un nombre de 256 caracteres", () => {
    const nombreDemasiadoLargo = "a".repeat(256);
    expect(
      Docente.validarAlta({ githubUsername: "ayudante1", nombre: nombreDemasiadoLargo })
    ).toBe("El nombre no puede superar los 255 caracteres");
  });

  it("acepta un nombre de 255 caracteres", () => {
    const nombreAlLimite = "a".repeat(255);
    expect(
      Docente.validarAlta({ githubUsername: "ayudante1", nombre: nombreAlLimite })
    ).toBeNull();
  });
});

describe("Docente.crear", () => {
  // `crear()` corre `validarAlta` primero, que ya normaliza el username
  // antes de validar el formato (ver el describe de `validarAlta` más
  // arriba) — así que un "@ayudante1" con espacios pasa la validación igual
  // que "ayudante1", y el constructor aplica la misma normalización final.
  it("normaliza el username (trim, minúsculas)", () => {
    const docente = Docente.crear({
      githubUsername: " Ayudante1 ",
      porUsuario: "juancete",
    });
    expect(docente.githubUsername).toBe("ayudante1");
  });

  it("normaliza el username con '@' inicial y espacios", () => {
    const docente = Docente.crear({
      githubUsername: " @Ayudante1 ",
      porUsuario: "juancete",
    });
    expect(docente.githubUsername).toBe("ayudante1");
  });

  it("queda activo por default", () => {
    const docente = Docente.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
    expect(docente.activo).toBe(true);
  });

  it("sella la auditoría de alta en creadoPor/modificadoPor", () => {
    const docente = Docente.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
    expect(docente.creadoPor).toBe("juancete");
    expect(docente.modificadoPor).toBe("juancete");
    expect(docente.creadoEn).toBeInstanceOf(Date);
    expect(docente.modificadoEn).toBeInstanceOf(Date);
  });

  it("nombre vacío o ausente queda en null", () => {
    expect(Docente.crear({ githubUsername: "a1", porUsuario: "x" }).nombre).toBeNull();
    expect(
      Docente.crear({ githubUsername: "a1", nombre: "   ", porUsuario: "x" }).nombre
    ).toBeNull();
  });

  it("hace trim del nombre", () => {
    const docente = Docente.crear({
      githubUsername: "a1",
      nombre: "  Ana García  ",
      porUsuario: "x",
    });
    expect(docente.nombre).toBe("Ana García");
  });

  it("lanza DocenteInvalidoError con un username inválido", () => {
    expect(() =>
      Docente.crear({ githubUsername: "-invalido", porUsuario: "juancete" })
    ).toThrow(DocenteInvalidoError);
  });

  it("lanza DocenteInvalidoError con un username de 256 caracteres", () => {
    expect(() =>
      Docente.crear({ githubUsername: "a".repeat(256), porUsuario: "juancete" })
    ).toThrow(DocenteInvalidoError);
  });

  it("lanza DocenteInvalidoError con un nombre de 256 caracteres", () => {
    expect(() =>
      Docente.crear({
        githubUsername: "ayudante1",
        nombre: "a".repeat(256),
        porUsuario: "juancete",
      })
    ).toThrow(DocenteInvalidoError);
  });
});

describe("Docente constructor", () => {
  it("normaliza el username (trim, @, minúsculas)", () => {
    const docente = new Docente(" @Ayudante1 ");
    expect(docente.githubUsername).toBe("ayudante1");
  });
});

describe("Docente.renombrar", () => {
  it("cambia el nombre y sella modificadoPor/modificadoEn, sin tocar la identidad ni el estado", () => {
    const docente = Docente.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
    const ahora = new Date("2026-09-16T10:00:00Z");

    docente.renombrar("Nuevo Nombre", "otro-responsable", ahora);

    expect(docente.nombre).toBe("Nuevo Nombre");
    expect(docente.modificadoPor).toBe("otro-responsable");
    expect(docente.modificadoEn).toBe(ahora);
    expect(docente.githubUsername).toBe("ayudante1");
    expect(docente.activo).toBe(true);
  });

  it("nombre vacío limpia el campo a null", () => {
    const docente = Docente.crear({
      githubUsername: "ayudante1",
      nombre: "Algo",
      porUsuario: "juancete",
    });
    docente.renombrar("", "juancete");
    expect(docente.nombre).toBeNull();
  });

  it("lanza DocenteInvalidoError con un nombre de 256 caracteres, sin tocar el nombre anterior", () => {
    const docente = Docente.crear({
      githubUsername: "ayudante1",
      nombre: "Nombre original",
      porUsuario: "juancete",
    });

    expect(() => docente.renombrar("a".repeat(256), "otro-responsable")).toThrow(
      DocenteInvalidoError
    );
    expect(docente.nombre).toBe("Nombre original");
  });
});

describe("Docente — identidad inmutable", () => {
  it("githubUsername no cambia tras renombrar, desactivar ni reactivar", () => {
    const docente = Docente.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });

    docente.renombrar("Nuevo Nombre", "otro-responsable");
    expect(docente.githubUsername).toBe("ayudante1");

    docente.desactivar("otro-responsable");
    expect(docente.githubUsername).toBe("ayudante1");

    docente.reactivar("otro-responsable");
    expect(docente.githubUsername).toBe("ayudante1");
  });
});

describe("Docente.desactivar / reactivar", () => {
  it("desactivar pone activo en false y sella la auditoría", () => {
    const docente = Docente.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
    const ahora = new Date("2026-09-16T10:00:00Z");

    docente.desactivar("juancete", ahora);

    expect(docente.activo).toBe(false);
    expect(docente.modificadoPor).toBe("juancete");
    expect(docente.modificadoEn).toBe(ahora);
  });

  it("reactivar pone activo en true y sella la auditoría", () => {
    const docente = Docente.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
    docente.desactivar("juancete");
    const ahora = new Date("2026-09-16T11:00:00Z");

    docente.reactivar("fdodino", ahora);

    expect(docente.activo).toBe(true);
    expect(docente.modificadoPor).toBe("fdodino");
    expect(docente.modificadoEn).toBe(ahora);
  });

  it("desactivar es idempotente: no resella la auditoría si ya estaba inactivo", () => {
    const docente = Docente.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
    const primeraDesactivacion = new Date("2026-09-16T10:00:00Z");
    docente.desactivar("juancete", primeraDesactivacion);

    docente.desactivar("otro-responsable", new Date("2026-09-16T12:00:00Z"));

    expect(docente.modificadoPor).toBe("juancete");
    expect(docente.modificadoEn).toBe(primeraDesactivacion);
  });

  it("reactivar es idempotente: no resella la auditoría si ya estaba activo", () => {
    const docente = Docente.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
    const creadoEn = docente.modificadoEn;

    docente.reactivar("otro-responsable", new Date("2026-09-16T12:00:00Z"));

    expect(docente.modificadoPor).toBe("juancete");
    expect(docente.modificadoEn).toBe(creadoEn);
  });
});

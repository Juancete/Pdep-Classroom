import { describe, it, expect } from "vitest";
import {
  parseAlumnosRows,
  validateRegistro,
  colLetter,
  isValidEmail,
  upsertarAlumnoEnSheets,
} from "./sheets";

// ── parseAlumnosRows ────────────────────────────────────────

describe("parseAlumnosRows", () => {
  it("parsea filas válidas", () => {
    const rows = [
      ["12345", "García", "Juan", "juangarcia", "juan@mail.com", "miércoles noche"],
      ["67890", "Pérez", "María", "@mariaperez", "maria@mail.com", "lunes mañana"],
    ];

    const result = parseAlumnosRows(rows);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      legajo: "12345",
      apellido: "García",
      nombre: "Juan",
      githubUsername: "juangarcia",
      email: "juan@mail.com",
    });
    // comision es una relación ManyToOne, no se resuelve desde la planilla
    expect(result[0].comision).toBeUndefined();
  });

  it("quita @ del username de GitHub", () => {
    const rows = [["111", "A", "B", "@user1", "a@b.com", "c"]];
    expect(parseAlumnosRows(rows)[0].githubUsername).toBe("user1");
  });

  it("normaliza username a lowercase", () => {
    const rows = [["111", "A", "B", "JuanGarcia", "a@b.com", "c"]];
    expect(parseAlumnosRows(rows)[0].githubUsername).toBe("juangarcia");
  });

  it("descarta filas sin legajo", () => {
    const rows = [
      ["", "García", "Juan", "juangarcia", "j@m.com", "c"],
      ["123", "Pérez", "María", "maria", "m@m.com", "c"],
    ];
    expect(parseAlumnosRows(rows)).toHaveLength(1);
  });

  it("descarta filas sin github username", () => {
    const rows = [
      ["123", "García", "Juan", "", "j@m.com", "c"],
      ["456", "Pérez", "María", "maria", "m@m.com", "c"],
    ];
    expect(parseAlumnosRows(rows)).toHaveLength(1);
  });

  it("comisión siempre queda undefined (es una relación, no un string)", () => {
    const rows = [["123", "A", "B", "user", "a@b.com", "miércoles noche"]];
    expect(parseAlumnosRows(rows)[0].comision).toBeUndefined();
  });

  it("maneja filas con celdas faltantes (undefined)", () => {
    // Google Sheets puede devolver filas más cortas
    const rows = [["123", "García", "Juan", "juangarcia"]];
    const result = parseAlumnosRows(rows);
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("");
    expect(result[0].comision).toBeUndefined();
  });

  it("devuelve vacío para filas vacías", () => {
    expect(parseAlumnosRows([])).toEqual([]);
  });

  it("maneja valores numéricos (legajo como number)", () => {
    const rows = [[12345, "A", "B", "user", "a@b.com", "c"]];
    expect(parseAlumnosRows(rows)[0].legajo).toBe("12345");
  });
});

// ── validateRegistro ────────────────────────────────────────

describe("validateRegistro", () => {
  const valid = {
    legajo: "12345",
    apellido: "García",
    nombre: "Juan",
    githubUsername: "juangarcia",
    email: "juan@gmail.com",
  };

  it("acepta input válido", () => {
    expect(validateRegistro(valid)).toBeNull();
  });

  it("rechaza legajo vacío", () => {
    expect(validateRegistro({ ...valid, legajo: "" })).toContain("legajo");
  });

  it("rechaza legajo con letras", () => {
    expect(validateRegistro({ ...valid, legajo: "abc" })).toContain("legajo");
  });

  it("rechaza legajo demasiado corto", () => {
    expect(validateRegistro({ ...valid, legajo: "12" })).toContain("legajo");
  });

  it("rechaza legajo demasiado largo", () => {
    expect(validateRegistro({ ...valid, legajo: "123456789" })).toContain("legajo");
  });

  it("acepta legajo de 4 dígitos", () => {
    expect(validateRegistro({ ...valid, legajo: "1234" })).toBeNull();
  });

  it("acepta legajo de 8 dígitos", () => {
    expect(validateRegistro({ ...valid, legajo: "12345678" })).toBeNull();
  });

  it("rechaza apellido vacío", () => {
    expect(validateRegistro({ ...valid, apellido: "" })).toContain("apellido");
  });

  it("rechaza nombre vacío", () => {
    expect(validateRegistro({ ...valid, nombre: "  " })).toContain("nombre");
  });

  it("rechaza github username vacío", () => {
    expect(validateRegistro({ ...valid, githubUsername: "" })).toContain("GitHub");
  });

  it("rechaza github username con caracteres inválidos", () => {
    expect(validateRegistro({ ...valid, githubUsername: "user name" })).toContain("GitHub");
    expect(validateRegistro({ ...valid, githubUsername: "user@name" })).toContain("GitHub");
    expect(validateRegistro({ ...valid, githubUsername: "-user" })).toContain("GitHub");
    expect(validateRegistro({ ...valid, githubUsername: "user-" })).toContain("GitHub");
  });

  it("acepta github username con guiones intermedios", () => {
    expect(validateRegistro({ ...valid, githubUsername: "juan-garcia" })).toBeNull();
  });

  it("rechaza email sin @", () => {
    expect(validateRegistro({ ...valid, email: "juangmail.com" })).toContain("email");
  });

  it("rechaza email vacío", () => {
    expect(validateRegistro({ ...valid, email: "" })).toContain("email");
  });

  it("rechaza email sin dominio con punto", () => {
    expect(validateRegistro({ ...valid, email: "juan@gmail" })).toContain("email");
  });

  it("rechaza email con espacios", () => {
    expect(validateRegistro({ ...valid, email: "juan @gmail.com" })).toContain("email");
  });

  it("acepta emails con subdominios", () => {
    expect(validateRegistro({ ...valid, email: "juan@mail.frba.utn.edu.ar" })).toBeNull();
  });

  it("acepta emails con + en la parte local", () => {
    expect(validateRegistro({ ...valid, email: "juan+curso@gmail.com" })).toBeNull();
  });

});

// ── isValidEmail (helper) ────────────────────────────────────

describe("isValidEmail", () => {
  it("acepta email estándar", () => {
    expect(isValidEmail("juan@gmail.com")).toBe(true);
  });

  it("acepta email con subdominios", () => {
    expect(isValidEmail("juan@mail.utn.edu.ar")).toBe(true);
  });

  it("rechaza email sin arroba", () => {
    expect(isValidEmail("juangmail.com")).toBe(false);
  });

  it("rechaza email sin dominio con punto", () => {
    expect(isValidEmail("juan@gmail")).toBe(false);
  });

  it("rechaza string vacío", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("rechaza email con espacios", () => {
    expect(isValidEmail("juan @gmail.com")).toBe(false);
  });

  it("ignora whitespace al borde (trim)", () => {
    expect(isValidEmail("  juan@gmail.com  ")).toBe(true);
  });
});

// ── colLetter ────────────────────────────────────────────────

describe("colLetter", () => {
  it("0 → A", () => expect(colLetter(0)).toBe("A"));
  it("1 → B", () => expect(colLetter(1)).toBe("B"));
  it("25 → Z", () => expect(colLetter(25)).toBe("Z"));
  it("26 → AA", () => expect(colLetter(26)).toBe("AA"));
  it("27 → AB", () => expect(colLetter(27)).toBe("AB"));
  it("51 → AZ", () => expect(colLetter(51)).toBe("AZ"));
  it("52 → BA", () => expect(colLetter(52)).toBe("BA"));
});

// ── upsertarAlumnoEnSheets – validaciones síncronas ──────────

describe("upsertarAlumnoEnSheets – validaciones", () => {
  const valid = {
    legajo: "12345",
    apellido: "García",
    nombre: "Juan",
    githubUsername: "juangarcia",
    email: "juan@gmail.com",
  };

  it("rechaza apellido vacío", async () => {
    const r = await upsertarAlumnoEnSheets({ ...valid, apellido: "" });
    expect(r).toEqual({ ok: false, error: "El apellido es obligatorio" });
  });

  it("rechaza apellido con solo espacios", async () => {
    const r = await upsertarAlumnoEnSheets({ ...valid, apellido: "   " });
    expect(r).toEqual({ ok: false, error: "El apellido es obligatorio" });
  });

  it("rechaza nombre vacío", async () => {
    const r = await upsertarAlumnoEnSheets({ ...valid, nombre: "" });
    expect(r).toEqual({ ok: false, error: "El nombre es obligatorio" });
  });

  it("rechaza legajo vacío", async () => {
    const r = await upsertarAlumnoEnSheets({ ...valid, legajo: "" });
    expect(r).toEqual({ ok: false, error: "El legajo debe tener entre 4 y 8 dígitos" });
  });

  it("rechaza legajo con letras", async () => {
    const r = await upsertarAlumnoEnSheets({ ...valid, legajo: "abc12" });
    expect(r).toEqual({ ok: false, error: "El legajo debe tener entre 4 y 8 dígitos" });
  });

  it("rechaza email sin @", async () => {
    const r = await upsertarAlumnoEnSheets({ ...valid, email: "juangmail.com" });
    expect(r).toEqual({ ok: false, error: "El email no es válido" });
  });

  it("rechaza email sin punto en el dominio", async () => {
    const r = await upsertarAlumnoEnSheets({ ...valid, email: "juan@gmail" });
    expect(r).toEqual({ ok: false, error: "El email no es válido" });
  });

  it("rechaza email vacío", async () => {
    const r = await upsertarAlumnoEnSheets({ ...valid, email: "" });
    expect(r).toEqual({ ok: false, error: "El email no es válido" });
  });

  it("rechaza github vacío", async () => {
    const r = await upsertarAlumnoEnSheets({ ...valid, githubUsername: "" });
    expect(r).toEqual({ ok: false, error: "El usuario de GitHub es obligatorio" });
  });

  it("devuelve {ok:false} si no hay spreadsheetId configurado (input válido)", async () => {
    const r = await upsertarAlumnoEnSheets(valid, undefined);
    expect(r).toEqual(
      expect.objectContaining({ ok: false, error: expect.stringMatching(/comisión activa/i) })
    );
  });
});
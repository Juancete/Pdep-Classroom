import { describe, it, expect } from "vitest";
import { parseAlumnosRows, parseGruposRows, validateRegistro } from "./sheets";

// ── parseAlumnosRows ────────────────────────────────────────

describe("parseAlumnosRows", () => {
  it("parsea filas válidas", () => {
    const rows = [
      ["12345", "García", "Juan", "juangarcia", "juan@mail.com", "miércoles noche"],
      ["67890", "Pérez", "María", "@mariaperez", "maria@mail.com", "lunes mañana"],
    ];

    const result = parseAlumnosRows(rows);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      legajo: "12345",
      apellido: "García",
      nombre: "Juan",
      githubUsername: "juangarcia",
      email: "juan@mail.com",
      comision: "miércoles noche",
    });
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

  it("comisión queda undefined si está vacía en la planilla", () => {
    const rows = [["123", "A", "B", "user", "a@b.com", ""]];
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

// ── parseGruposRows ─────────────────────────────────────────

describe("parseGruposRows", () => {
  const rows = [
    ["Los Lambdas", "funcional", "juangarcia", "mariaperez", "", ""],
    ["Los Hechos", "logico", "pedrolopez", "anaruiz", "carlitos", ""],
    ["Los Objetos", "objetos", "luisito", "pepe", "", ""],
  ];

  it("parsea todos los grupos", () => {
    const result = parseGruposRows(rows);
    expect(result).toHaveLength(3);
  });

  it("filtra por paradigma", () => {
    const funcionales = parseGruposRows(rows, "funcional");
    expect(funcionales).toHaveLength(1);
    expect(funcionales[0].nombre).toBe("Los Lambdas");
  });

  it("genera id desde el nombre (lowercase, guiones)", () => {
    const result = parseGruposRows(rows);
    expect(result[0].id).toBe("los-lambdas");
  });

  it("filtra miembros vacíos", () => {
    const result = parseGruposRows(rows);
    expect(result[0].miembros).toEqual(["juangarcia", "mariaperez"]);
    expect(result[1].miembros).toEqual(["pedrolopez", "anaruiz", "carlitos"]);
  });

  it("normaliza miembros a lowercase y quita @", () => {
    const rows = [["G1", "funcional", "@JuanGarcia", "MARIA"]];
    const result = parseGruposRows(rows);
    expect(result[0].miembros).toEqual(["juangarcia", "maria"]);
  });

  it("descarta filas sin nombre o paradigma", () => {
    const rows = [
      ["", "funcional", "user1"],
      ["Grupo", "", "user2"],
      ["OK", "logico", "user3"],
    ];
    expect(parseGruposRows(rows)).toHaveLength(1);
  });

  it("devuelve vacío si no hay match de paradigma", () => {
    expect(parseGruposRows(rows, "objetos")).toHaveLength(1);
    // No hay paradigma "cuantico"
    expect(parseGruposRows(rows, "funcional")).toHaveLength(1);
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
    comision: "miércoles noche",
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

  it("rechaza comisión vacía", () => {
    expect(validateRegistro({ ...valid, comision: "" })).toContain("comisión");
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock de googleapis (sólo lo usan los tests de escritura en Sheets) ──

const mockValuesGet = vi.fn();
const mockValuesUpdate = vi.fn();
const mockValuesAppend = vi.fn();
const mockValuesBatchUpdate = vi.fn();
const mockDriveFilesGet = vi.fn();
const mockGoogleAuth = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: function (...args: unknown[]) {
        mockGoogleAuth(...args);
        return args;
      },
    },
    drive: () => ({
      files: {
        get: (...args: unknown[]) => mockDriveFilesGet(...args),
      },
    }),
    sheets: () => ({
      spreadsheets: {
        values: {
          get: (...args: unknown[]) => mockValuesGet(...args),
          update: (...args: unknown[]) => mockValuesUpdate(...args),
          append: (...args: unknown[]) => mockValuesAppend(...args),
          batchUpdate: (...args: unknown[]) => mockValuesBatchUpdate(...args),
        },
      },
    }),
  },
}));

import {
  parseAlumnosRows,
  parseAsignacionesGrupos,
  validateRegistro,
  colLetter,
  isValidEmail,
  upsertarAlumnoEnSheets,
  getSheetNames,
  getDatosPrecargaByGithub,
  getPermisoDePlanilla,
} from "./sheets";
import type { ColumnConfig, GruposColumnConfig } from "@/types";
import { PlanillaNoDisponibleError } from "@/infrastructure/PlanillaNoDisponibleError";

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

// ── parseAlumnosRows – modo completo ─────────────────────────

describe("parseAlumnosRows – modoNombre 'completo'", () => {
  const configCompleto: ColumnConfig = {
    sheetName: "Alumnos",
    headerRows: 1,
    legajo: 0,
    apellido: 1,
    nombre: 2,
    githubUsername: 3,
    email: 4,
    modoNombre: "completo",
    nombreCompleto: 5,
  };

  it("separa apellido y nombre de la columna consolidada", () => {
    const rows = [["12345", "", "", "juangarcia", "j@m.com", "García, Juan"]];
    const result = parseAlumnosRows(rows, configCompleto);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ apellido: "García", nombre: "Juan" });
  });

  it("sin coma en el nombre completo, guarda apellido y nombre vacíos", () => {
    const rows = [["12345", "", "", "juangarcia", "j@m.com", "Juan García"]];
    const result = parseAlumnosRows(rows, configCompleto);
    expect(result[0]).toMatchObject({ apellido: "", nombre: "" });
  });
});

// ── parseAsignacionesGrupos ─────────────────────────────────

describe("parseAsignacionesGrupos", () => {
  // Hoja típica: A..E columnas de alumno, F=grupo funcional, G=grupo lógico, H=grupo objetos
  const config: GruposColumnConfig = {
    sheetName: "Alumnos",
    headerRows: 1,
    githubUsername: 3,
    nombreGrupoPorParadigma: {
      funcional: 5,
      logico: 6,
      objetos: 7,
    },
  };

  it("genera una asignación por paradigma en el que el alumno tiene grupo", () => {
    const rows = [
      ["12345", "García", "Juan", "juangarcia", "j@m.com", "Los Lambdas", "Prolog Pros", "OO Masters"],
    ];
    const result = parseAsignacionesGrupos(rows, config);
    expect(result).toEqual([
      { githubUsername: "juangarcia", paradigma: "funcional", nombreGrupo: "Los Lambdas" },
      { githubUsername: "juangarcia", paradigma: "logico", nombreGrupo: "Prolog Pros" },
      { githubUsername: "juangarcia", paradigma: "objetos", nombreGrupo: "OO Masters" },
    ]);
  });

  it("ignora paradigmas con celda vacía", () => {
    const rows = [
      ["12345", "García", "Juan", "juangarcia", "j@m.com", "Los Lambdas", "", ""],
    ];
    const result = parseAsignacionesGrupos(rows, config);
    expect(result).toEqual([
      { githubUsername: "juangarcia", paradigma: "funcional", nombreGrupo: "Los Lambdas" },
    ]);
  });

  it("descarta filas sin github username", () => {
    const rows = [
      ["12345", "García", "Juan", "", "j@m.com", "Los Lambdas", "", ""],
      ["67890", "Pérez", "María", "mariaperez", "m@m.com", "Otro", "", ""],
    ];
    const result = parseAsignacionesGrupos(rows, config);
    expect(result).toHaveLength(1);
    expect(result[0].githubUsername).toBe("mariaperez");
  });

  it("normaliza el github username (lowercase + sin @)", () => {
    const rows = [
      ["12345", "García", "Juan", "@JuanGarcia", "j@m.com", "Los Lambdas", "", ""],
    ];
    const result = parseAsignacionesGrupos(rows, config);
    expect(result[0].githubUsername).toBe("juangarcia");
  });

  it("solo mapea los paradigmas presentes en la config", () => {
    const configSoloFuncional: GruposColumnConfig = {
      sheetName: "Alumnos",
      headerRows: 1,
      githubUsername: 3,
      nombreGrupoPorParadigma: { funcional: 5 },
    };
    const rows = [
      ["12345", "García", "Juan", "juangarcia", "j@m.com", "Los Lambdas", "Prolog Pros", "OO Masters"],
    ];
    const result = parseAsignacionesGrupos(rows, configSoloFuncional);
    expect(result).toEqual([
      { githubUsername: "juangarcia", paradigma: "funcional", nombreGrupo: "Los Lambdas" },
    ]);
  });

  it("maneja filas más cortas que las columnas configuradas", () => {
    const rows = [
      ["12345", "García", "Juan", "juangarcia", "j@m.com"],
    ];
    expect(parseAsignacionesGrupos(rows, config)).toEqual([]);
  });

  it("devuelve vacío para filas vacías", () => {
    expect(parseAsignacionesGrupos([], config)).toEqual([]);
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
    const result = await upsertarAlumnoEnSheets({ ...valid, apellido: "" });
    expect(result).toEqual({ ok: false, error: "El apellido es obligatorio" });
  });

  it("rechaza apellido con solo espacios", async () => {
    const result = await upsertarAlumnoEnSheets({ ...valid, apellido: "   " });
    expect(result).toEqual({ ok: false, error: "El apellido es obligatorio" });
  });

  it("rechaza nombre vacío", async () => {
    const result = await upsertarAlumnoEnSheets({ ...valid, nombre: "" });
    expect(result).toEqual({ ok: false, error: "El nombre es obligatorio" });
  });

  it("rechaza legajo vacío", async () => {
    const result = await upsertarAlumnoEnSheets({ ...valid, legajo: "" });
    expect(result).toEqual({ ok: false, error: "El legajo debe tener entre 4 y 8 dígitos" });
  });

  it("rechaza legajo con letras", async () => {
    const result = await upsertarAlumnoEnSheets({ ...valid, legajo: "abc12" });
    expect(result).toEqual({ ok: false, error: "El legajo debe tener entre 4 y 8 dígitos" });
  });

  it("rechaza email sin @", async () => {
    const result = await upsertarAlumnoEnSheets({ ...valid, email: "juangmail.com" });
    expect(result).toEqual({ ok: false, error: "El email no es válido" });
  });

  it("rechaza email sin punto en el dominio", async () => {
    const result = await upsertarAlumnoEnSheets({ ...valid, email: "juan@gmail" });
    expect(result).toEqual({ ok: false, error: "El email no es válido" });
  });

  it("rechaza email vacío", async () => {
    const result = await upsertarAlumnoEnSheets({ ...valid, email: "" });
    expect(result).toEqual({ ok: false, error: "El email no es válido" });
  });

  it("rechaza github vacío", async () => {
    const result = await upsertarAlumnoEnSheets({ ...valid, githubUsername: "" });
    expect(result).toEqual({ ok: false, error: "El usuario de GitHub es obligatorio" });
  });

  it("lanza error si no hay spreadsheetId configurado (input válido)", async () => {
    await expect(upsertarAlumnoEnSheets(valid, undefined)).rejects.toThrow(
      "No hay una comisión activa"
    );
  });

  // La validación es un dato inválido del alumno, no una falla operativa de
  // la planilla: no debe envolverse en PlanillaNoDisponibleError (issue #92).
  it("un input inválido sigue devolviendo { ok:false, error } sin envolverlo en PlanillaNoDisponibleError", async () => {
    const resultado = await upsertarAlumnoEnSheets({ ...valid, apellido: "" }, "sheet-1");
    expect(resultado).toEqual({ ok: false, error: "El apellido es obligatorio" });
    expect(mockValuesGet).not.toHaveBeenCalled();
    expect(mockValuesAppend).not.toHaveBeenCalled();
    expect(mockValuesBatchUpdate).not.toHaveBeenCalled();
  });
});

// Fase 3 del issue #82: el update de fila completa (values.get + values.update)
// se reemplaza por un batchUpdate de una celda por dato personal mapeado.
// Ya no se lee la fila entera, así que no hace falta preservar columnas
// ajenas explícitamente: nunca se las toca.
describe("upsertarAlumnoEnSheets – actualiza una fila existente", () => {
  const SA_KEY = Buffer.from(
    JSON.stringify({
      client_email: "sa@proyecto.iam.gserviceaccount.com",
      private_key: "FAKE_PRIVATE_KEY",
    })
  ).toString("base64");
  const ENV_BACKUP = { ...process.env };

  const valid = {
    legajo: "12345",
    apellido: "García",
    nombre: "Juan",
    githubUsername: "juangarcia",
    email: "juan@gmail.com",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = SA_KEY;
  });

  afterEach(() => {
    process.env = { ...ENV_BACKUP };
  });

  // Fase 4 de la auditoría de dominio (pre-batchUpdate): el camino de update
  // no escribía la columna `githubUsername` normalizada — sólo lo hacía el
  // camino de append (alta nueva). Sigue cubierto acá con el batchUpdate.
  it("normaliza y escribe githubUsername en la fila existente, igual que el alta", async () => {
    // findAlumnoRowIndex ahora sólo lee la columna D (github); el username
    // sin normalizar (mayúsculas) igual matchea porque compara normalizado.
    mockValuesGet.mockResolvedValueOnce({ data: { values: [["JuanGarcia"]] } });
    mockValuesBatchUpdate.mockResolvedValue({ data: {} });

    const result = await upsertarAlumnoEnSheets(valid, "sheet-1");

    expect(result).toEqual({ ok: true });
    expect(mockValuesGet).toHaveBeenCalledWith(
      expect.objectContaining({ range: "'Alumnos'!D2:D500" })
    );
    expect(mockValuesBatchUpdate).toHaveBeenCalledWith({
      spreadsheetId: "sheet-1",
      requestBody: {
        valueInputOption: "RAW",
        data: [
          { range: "'Alumnos'!A2", values: [["12345"]] },
          { range: "'Alumnos'!D2", values: [["juangarcia"]] },
          { range: "'Alumnos'!E2", values: [["juan@gmail.com"]] },
          { range: "'Alumnos'!B2", values: [["García"]] },
          { range: "'Alumnos'!C2", values: [["Juan"]] },
        ],
      },
    });
    expect(mockValuesUpdate).not.toHaveBeenCalled();
    expect(mockValuesAppend).not.toHaveBeenCalled();
  });

  it("no lee ni escribe columnas intermedias no mapeadas (fórmulas de notas)", async () => {
    // Cursada en marcha: apellido/nombre/github/email al principio, notas
    // de los tres bloques en las columnas D..J, legajo al final (K).
    const configConLegajoAlFinal: ColumnConfig = {
      sheetName: "Alumnos",
      headerRows: 1,
      apellido: 0,
      nombre: 1,
      githubUsername: 2,
      email: 3,
      legajo: 10,
    };
    mockValuesGet.mockResolvedValueOnce({ data: { values: [["juangarcia"]] } });
    mockValuesBatchUpdate.mockResolvedValue({ data: {} });

    await upsertarAlumnoEnSheets(valid, "sheet-1", configConLegajoAlFinal);

    // La búsqueda de fila sólo pide la columna de github, nunca A:K.
    expect(mockValuesGet).toHaveBeenCalledTimes(1);
    expect(mockValuesGet).toHaveBeenCalledWith(
      expect.objectContaining({ range: "'Alumnos'!C2:C500" })
    );

    const [{ requestBody }] = mockValuesBatchUpdate.mock.calls[0];
    const rangosEscritos: string[] = requestBody.data.map(
      (celda: { range: string }) => celda.range
    );
    expect(rangosEscritos.sort()).toEqual(
      ["'Alumnos'!A2", "'Alumnos'!B2", "'Alumnos'!C2", "'Alumnos'!D2", "'Alumnos'!K2"].sort()
    );
    // Ninguna columna de notas (E..J) aparece en el batchUpdate.
    for (const columnaDeNotas of ["E", "F", "G", "H", "I", "J"]) {
      expect(rangosEscritos).not.toContain(`'Alumnos'!${columnaDeNotas}2`);
    }
  });

  it("conserva el legajo con ceros iniciales como texto (RAW) al actualizar", async () => {
    mockValuesGet.mockResolvedValueOnce({ data: { values: [["juangarcia"]] } });
    mockValuesBatchUpdate.mockResolvedValue({ data: {} });

    await upsertarAlumnoEnSheets({ ...valid, legajo: "0123" }, "sheet-1");

    const [{ requestBody }] = mockValuesBatchUpdate.mock.calls[0];
    expect(requestBody.valueInputOption).toBe("RAW");
    expect(requestBody.data).toContainEqual({
      range: "'Alumnos'!A2",
      values: [["0123"]],
    });
  });
});

describe("upsertarAlumnoEnSheets – alta nueva", () => {
  const SA_KEY = Buffer.from(
    JSON.stringify({
      client_email: "sa@proyecto.iam.gserviceaccount.com",
      private_key: "FAKE_PRIVATE_KEY",
    })
  ).toString("base64");
  const ENV_BACKUP = { ...process.env };

  const valid = {
    legajo: "12345",
    apellido: "García",
    nombre: "Juan",
    githubUsername: "juangarcia",
    email: "juan@gmail.com",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = SA_KEY;
  });

  afterEach(() => {
    process.env = { ...ENV_BACKUP };
  });

  it("agrega una fila nueva con RAW cuando no encuentra el github", async () => {
    mockValuesGet.mockResolvedValueOnce({ data: { values: [] } });
    mockValuesAppend.mockResolvedValue({ data: {} });

    const result = await upsertarAlumnoEnSheets(valid, "sheet-1");

    expect(result).toEqual({ ok: true });
    expect(mockValuesAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        valueInputOption: "RAW",
        requestBody: {
          values: [["12345", "García", "Juan", "juangarcia", "juan@gmail.com"]],
        },
      })
    );
    expect(mockValuesBatchUpdate).not.toHaveBeenCalled();
    expect(mockValuesUpdate).not.toHaveBeenCalled();
  });

  it("conserva el legajo con ceros iniciales como texto (RAW) en el alta", async () => {
    mockValuesGet.mockResolvedValueOnce({ data: { values: [] } });
    mockValuesAppend.mockResolvedValue({ data: {} });

    await upsertarAlumnoEnSheets({ ...valid, legajo: "0123" }, "sheet-1");

    const [{ valueInputOption, requestBody }] = mockValuesAppend.mock.calls[0];
    expect(valueInputOption).toBe("RAW");
    expect(requestBody.values[0][0]).toBe("0123");
  });
});

// Issue #92: un 403 de la API de Sheets (service account con rol Viewer en
// vez de Editor) llegaba crudo al handler. Ahora, cualquier falla de la API
// al buscar o escribir la fila sale como PlanillaNoDisponibleError, con el
// error original del SDK como `cause` — el caller (DB) ya persistió, así que
// esto es una falla operativa de la planilla, no un 400 de validación.
describe("upsertarAlumnoEnSheets – error de la API de Sheets (PlanillaNoDisponibleError)", () => {
  const SA_KEY = Buffer.from(
    JSON.stringify({
      client_email: "sa@proyecto.iam.gserviceaccount.com",
      private_key: "FAKE_PRIVATE_KEY",
    })
  ).toString("base64");
  const ENV_BACKUP = { ...process.env };

  const valid = {
    legajo: "12345",
    apellido: "García",
    nombre: "Juan",
    githubUsername: "juangarcia",
    email: "juan@gmail.com",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = SA_KEY;
  });

  afterEach(() => {
    process.env = { ...ENV_BACKUP };
  });

  it("si values.append rechaza con un error de permisos, rechaza con PlanillaNoDisponibleError", async () => {
    const errorDelSdk = new Error("The caller does not have permission");
    mockValuesGet.mockResolvedValueOnce({ data: { values: [] } });
    mockValuesAppend.mockRejectedValueOnce(errorDelSdk);

    expect.assertions(4);
    try {
      await upsertarAlumnoEnSheets(valid, "sheet-1");
    } catch (error) {
      expect(error).toBeInstanceOf(PlanillaNoDisponibleError);
      const errorEnvuelto = error as PlanillaNoDisponibleError;
      expect(errorEnvuelto.message).toContain("The caller does not have permission");
      expect(errorEnvuelto.message).toContain("Editor");
      expect(errorEnvuelto.cause).toBe(errorDelSdk);
    }
  });

  it("si values.batchUpdate rechaza con un error de permisos (fila existente), rechaza con PlanillaNoDisponibleError", async () => {
    const errorDelSdk = new Error("The caller does not have permission");
    mockValuesGet.mockResolvedValueOnce({ data: { values: [["juangarcia"]] } });
    mockValuesBatchUpdate.mockRejectedValueOnce(errorDelSdk);

    expect.assertions(4);
    try {
      await upsertarAlumnoEnSheets(valid, "sheet-1");
    } catch (error) {
      expect(error).toBeInstanceOf(PlanillaNoDisponibleError);
      const errorEnvuelto = error as PlanillaNoDisponibleError;
      expect(errorEnvuelto.message).toContain("The caller does not have permission");
      expect(errorEnvuelto.message).toContain("Editor");
      expect(errorEnvuelto.cause).toBe(errorDelSdk);
    }
  });

  it("si la lectura previa (values.get de findAlumnoRowIndex) rechaza con un error de permisos, rechaza con PlanillaNoDisponibleError", async () => {
    const errorDelSdk = new Error("The caller does not have permission");
    mockValuesGet.mockRejectedValueOnce(errorDelSdk);

    expect.assertions(6);
    try {
      await upsertarAlumnoEnSheets(valid, "sheet-1");
    } catch (error) {
      expect(error).toBeInstanceOf(PlanillaNoDisponibleError);
      const errorEnvuelto = error as PlanillaNoDisponibleError;
      expect(errorEnvuelto.message).toContain("The caller does not have permission");
      expect(errorEnvuelto.message).toContain("Editor");
      expect(errorEnvuelto.cause).toBe(errorDelSdk);
    }
    expect(mockValuesAppend).not.toHaveBeenCalled();
    expect(mockValuesBatchUpdate).not.toHaveBeenCalled();
  });
});

// ── getDatosPrecargaByGithub ─────────────────────────────────

describe("getDatosPrecargaByGithub", () => {
  const SA_KEY = Buffer.from(
    JSON.stringify({
      client_email: "sa@proyecto.iam.gserviceaccount.com",
      private_key: "FAKE_PRIVATE_KEY",
    })
  ).toString("base64");
  const ENV_BACKUP = { ...process.env };

  const configSeparado: ColumnConfig = {
    sheetName: "Alumnos",
    headerRows: 1,
    legajo: 0,
    apellido: 1,
    nombre: 2,
    githubUsername: 3,
    email: 4,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = SA_KEY;
  });

  afterEach(() => {
    process.env = { ...ENV_BACKUP };
  });

  it("devuelve los datos parciales de la fila encontrada por github normalizado", async () => {
    mockValuesGet.mockResolvedValue({
      data: { values: [["12345", "García", "Juan", "JuanGarcia", "juan@mail.com"]] },
    });

    const resultado = await getDatosPrecargaByGithub("@JuanGarcia", "sheet-1", configSeparado);

    expect(resultado).toEqual({
      legajo: "12345",
      apellido: "García",
      nombre: "Juan",
      email: "juan@mail.com",
      nombreCrudo: undefined,
    });
  });

  it("no persiste nada: nunca llama a update ni a append", async () => {
    mockValuesGet.mockResolvedValue({
      data: { values: [["12345", "García", "Juan", "juangarcia", "juan@mail.com"]] },
    });

    await getDatosPrecargaByGithub("juangarcia", "sheet-1", configSeparado);

    expect(mockValuesUpdate).not.toHaveBeenCalled();
    expect(mockValuesAppend).not.toHaveBeenCalled();
  });

  it("devuelve undefined si no encuentra el github en ninguna fila", async () => {
    mockValuesGet.mockResolvedValue({
      data: { values: [["12345", "García", "Juan", "otrousuario", "juan@mail.com"]] },
    });

    const resultado = await getDatosPrecargaByGithub("juangarcia", "sheet-1", configSeparado);

    expect(resultado).toBeUndefined();
  });

  it("sin legajo y sin permitirPrecargaSinLegajo, devuelve undefined", async () => {
    mockValuesGet.mockResolvedValue({
      data: { values: [["", "García", "Juan", "juangarcia", "juan@mail.com"]] },
    });

    const resultado = await getDatosPrecargaByGithub("juangarcia", "sheet-1", configSeparado);

    expect(resultado).toBeUndefined();
  });

  it("sin legajo pero con permitirPrecargaSinLegajo, devuelve los datos disponibles sin inventar el legajo", async () => {
    mockValuesGet.mockResolvedValue({
      data: { values: [["", "García", "Juan", "juangarcia", "juan@mail.com"]] },
    });

    const resultado = await getDatosPrecargaByGithub("juangarcia", "sheet-1", {
      ...configSeparado,
      permitirPrecargaSinLegajo: true,
    });

    expect(resultado).toEqual({
      legajo: undefined,
      apellido: "García",
      nombre: "Juan",
      email: "juan@mail.com",
      nombreCrudo: undefined,
    });
  });

  it("modo completo con nombre sin coma: devuelve nombreCrudo y apellido/nombre indefinidos", async () => {
    const configCompleto: ColumnConfig = {
      ...configSeparado,
      modoNombre: "completo",
      nombreCompleto: 5,
    };
    mockValuesGet.mockResolvedValue({
      data: { values: [["12345", "", "", "juangarcia", "juan@mail.com", "Juan García"]] },
    });

    const resultado = await getDatosPrecargaByGithub("juangarcia", "sheet-1", configCompleto);

    expect(resultado).toEqual({
      legajo: "12345",
      apellido: undefined,
      nombre: undefined,
      email: "juan@mail.com",
      nombreCrudo: "Juan García",
    });
  });

  it("lanza error si no hay spreadsheetId configurado", async () => {
    await expect(getDatosPrecargaByGithub("juangarcia", undefined)).rejects.toThrow(
      "No hay una comisión activa"
    );
  });
});

// ── getSheetNames – validación de spreadsheetId ──────────────

describe("getSheetNames – validación de spreadsheetId", () => {
  it("lanza error de dominio si el spreadsheetId está vacío", async () => {
    await expect(getSheetNames("")).rejects.toThrow("No hay una comisión activa");
  });
});

// ── getPermisoDePlanilla – permiso de escritura vía Drive (issue #95) ──

describe("getPermisoDePlanilla", () => {
  const CLIENT_EMAIL = "sa@proyecto.iam.gserviceaccount.com";
  const SA_KEY = Buffer.from(
    JSON.stringify({
      client_email: CLIENT_EMAIL,
      project_id: "proyecto",
      private_key: "FAKE_PRIVATE_KEY",
    })
  ).toString("base64");
  const ENV_BACKUP = { ...process.env };

  function errorDeGoogleApi(code: number, message: string, reason?: string) {
    const error = new Error(message) as Error & { code: number; errors?: { reason: string }[] };
    error.code = code;
    if (reason) error.errors = [{ reason }];
    return error;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = SA_KEY;
  });

  afterEach(() => {
    process.env = { ...ENV_BACKUP };
  });

  it("lanza error de dominio si el spreadsheetId está vacío", async () => {
    await expect(getPermisoDePlanilla("")).rejects.toThrow("No hay una comisión activa");
    expect(mockDriveFilesGet).not.toHaveBeenCalled();
  });

  it("consulta capabilities.canEdit con el scope de metadata de Drive y soporte de unidades compartidas", async () => {
    mockDriveFilesGet.mockResolvedValueOnce({ data: { capabilities: { canEdit: true } } });

    const permiso = await getPermisoDePlanilla("sheet-123");

    expect(permiso).toEqual({ puedeEditar: true, clientEmail: CLIENT_EMAIL });
    expect(mockDriveFilesGet).toHaveBeenCalledWith({
      fileId: "sheet-123",
      fields: "capabilities/canEdit",
      supportsAllDrives: true,
    });
    expect(mockGoogleAuth).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: ["https://www.googleapis.com/auth/drive.metadata.readonly"] })
    );
  });

  it("puedeEditar es false con rol Viewer (canEdit false)", async () => {
    mockDriveFilesGet.mockResolvedValueOnce({ data: { capabilities: { canEdit: false } } });

    await expect(getPermisoDePlanilla("sheet-123")).resolves.toEqual({
      puedeEditar: false,
      clientEmail: CLIENT_EMAIL,
    });
  });

  it("puedeEditar es false si Drive no devuelve capabilities", async () => {
    mockDriveFilesGet.mockResolvedValueOnce({ data: {} });

    await expect(getPermisoDePlanilla("sheet-123")).resolves.toMatchObject({ puedeEditar: false });
  });

  it("explica cómo habilitar la Drive API cuando el proyecto no la tiene activa (403 accessNotConfigured)", async () => {
    mockDriveFilesGet.mockRejectedValueOnce(
      errorDeGoogleApi(403, "Google Drive API has not been used in project 123 before or it is disabled", "accessNotConfigured")
    );

    await expect(getPermisoDePlanilla("sheet-123")).rejects.toThrow(
      "La Drive API no está habilitada en el proyecto proyecto de la service account"
    );
  });

  it("pide compartir la planilla cuando la service account no la ve (404)", async () => {
    mockDriveFilesGet.mockRejectedValueOnce(errorDeGoogleApi(404, "File not found: sheet-123"));

    await expect(getPermisoDePlanilla("sheet-123")).rejects.toThrow(
      `La service account ${CLIENT_EMAIL} no tiene acceso a la planilla: compartirla como Editor`
    );
  });

  it("cualquier otro error sale con prefijo y el mensaje original", async () => {
    mockDriveFilesGet.mockRejectedValueOnce(errorDeGoogleApi(500, "Backend Error"));

    await expect(getPermisoDePlanilla("sheet-123")).rejects.toThrow(
      "No se pudo consultar el permiso sobre la planilla: Backend Error"
    );
  });

  it("un 403 que no es accessNotConfigured no se confunde con la Drive API deshabilitada", async () => {
    mockDriveFilesGet.mockRejectedValueOnce(errorDeGoogleApi(403, "The caller does not have permission", "forbidden"));

    await expect(getPermisoDePlanilla("sheet-123")).rejects.toThrow(
      "No se pudo consultar el permiso sobre la planilla: The caller does not have permission"
    );
  });
});

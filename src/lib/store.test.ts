import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getAssignments,
  getAssignment,
  createAssignment,
  deleteAssignment,
  updateAssignment,
  getEntregas,
  getEntregaDeUsuario,
  createEntrega,
} from "./store";
import { writeFile, mkdir, rm } from "fs/promises";
import path from "path";

// Redirigir el store a un directorio temporal
const TEST_DATA_PATH = path.join(process.cwd(), "data-test");
const ASSIGNMENTS_FILE = path.join(TEST_DATA_PATH, "assignments.json");
const ENTREGAS_FILE = path.join(TEST_DATA_PATH, "entregas.json");

// Monkey-patch el módulo para usar data-test
vi.mock("fs/promises", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("fs/promises");
  return {
    ...actual,
    readFile: vi.fn(async (filePath: string, encoding: string) => {
      const redirected = (filePath as string).replace("/data/", "/data-test/");
      return actual.readFile(redirected, encoding as BufferEncoding);
    }),
    writeFile: vi.fn(async (filePath: string, data: string) => {
      const redirected = (filePath as string).replace("/data/", "/data-test/");
      return actual.writeFile(redirected, data);
    }),
    mkdir: vi.fn(async (dirPath: string, opts?: { recursive?: boolean }) => {
      const redirected = (dirPath as string).replace("/data/", "/data-test/");
      return actual.mkdir(redirected, opts);
    }),
  };
});

beforeEach(async () => {
  const { mkdir: realMkdir, writeFile: realWrite } = await vi.importActual<
    typeof import("fs/promises")
  >("fs/promises");
  await realMkdir(TEST_DATA_PATH, { recursive: true });
  await realWrite(ASSIGNMENTS_FILE, "[]");
  await realWrite(ENTREGAS_FILE, "[]");
});

// Cleanup
import { afterAll } from "vitest";
afterAll(async () => {
  const { rm: realRm } = await vi.importActual<typeof import("fs/promises")>(
    "fs/promises"
  );
  await realRm(TEST_DATA_PATH, { recursive: true, force: true });
});

// ── Assignments ─────────────────────────────────────────────

describe("assignments CRUD", () => {
  it("empieza vacío", async () => {
    const all = await getAssignments();
    expect(all).toEqual([]);
  });

  it("crea un assignment y lo recupera", async () => {
    const created = await createAssignment({
      titulo: "Kata Funcional",
      slug: "kata-funcional",
      descripcion: "Primera kata",
      templateRepo: "kata-template",
      tipo: "individual",
      paradigma: "funcional",
      deadline: "2026-04-15",
    });

    expect(created.id).toBeDefined();
    expect(created.titulo).toBe("Kata Funcional");
    expect(created.createdAt).toBeDefined();

    const found = await getAssignment(created.id);
    expect(found).toEqual(created);
  });

  it("crea múltiples y los lista", async () => {
    await createAssignment({
      titulo: "TP 1",
      slug: "tp-1",
      descripcion: "",
      templateRepo: "t1",
      tipo: "individual",
      paradigma: "funcional",
      deadline: "",
    });
    await createAssignment({
      titulo: "TP 2",
      slug: "tp-2",
      descripcion: "",
      templateRepo: "t2",
      tipo: "grupal",
      paradigma: "logico",
      deadline: "",
    });

    const all = await getAssignments();
    expect(all).toHaveLength(2);
  });

  it("elimina un assignment", async () => {
    const a1 = await createAssignment({
      titulo: "A borrar",
      slug: "a-borrar",
      descripcion: "",
      templateRepo: "t",
      tipo: "individual",
      paradigma: "funcional",
      deadline: "",
    });
    const a2 = await createAssignment({
      titulo: "A mantener",
      slug: "a-mantener",
      descripcion: "",
      templateRepo: "t",
      tipo: "individual",
      paradigma: "funcional",
      deadline: "",
    });

    await deleteAssignment(a1.id);

    const all = await getAssignments();
    expect(all).toHaveLength(1);
    expect(all[0].titulo).toBe("A mantener");
  });

  it("getAssignment devuelve undefined para id inexistente", async () => {
    const found = await getAssignment("no-existe");
    expect(found).toBeUndefined();
  });
});

describe("updateAssignment", () => {
  const base = {
    titulo: "Original",
    slug: "original",
    descripcion: "desc",
    templateRepo: "t",
    tipo: "individual" as const,
    paradigma: "funcional" as const,
    deadline: "2026-06-01",
  };

  it("actualiza un campo sin tocar los demás", async () => {
    const created = await createAssignment(base);
    const updated = await updateAssignment(created.id, { titulo: "Actualizado" });
    expect(updated?.titulo).toBe("Actualizado");
    expect(updated?.slug).toBe("original");
    expect(updated?.paradigma).toBe("funcional");
  });

  it("persiste los cambios", async () => {
    const created = await createAssignment(base);
    await updateAssignment(created.id, { titulo: "Nuevo título" });
    const found = await getAssignment(created.id);
    expect(found?.titulo).toBe("Nuevo título");
  });

  it("no modifica id ni createdAt", async () => {
    const created = await createAssignment(base);
    const updated = await updateAssignment(created.id, { titulo: "X" });
    expect(updated?.id).toBe(created.id);
    expect(updated?.createdAt).toBe(created.createdAt);
  });

  it("devuelve undefined para id inexistente", async () => {
    const result = await updateAssignment("no-existe", { titulo: "X" });
    expect(result).toBeUndefined();
  });

  it("actualiza múltiples campos a la vez", async () => {
    const created = await createAssignment(base);
    const updated = await updateAssignment(created.id, {
      titulo: "Nuevo",
      paradigma: "logico",
      deadline: "2026-12-31",
    });
    expect(updated?.titulo).toBe("Nuevo");
    expect(updated?.paradigma).toBe("logico");
    expect(updated?.deadline).toBe("2026-12-31");
  });
});

// ── Entregas ────────────────────────────────────────────────

describe("entregas CRUD", () => {
  it("empieza vacío", async () => {
    expect(await getEntregas()).toEqual([]);
  });

  it("crea una entrega", async () => {
    const entrega = await createEntrega({
      assignmentId: "a1",
      repoName: "kata-funcional-juangarcia",
      repoUrl: "https://github.com/pdep-mn-utn/kata-funcional-juangarcia",
      githubUsernames: ["juangarcia"],
    });

    expect(entrega.id).toBeDefined();
    expect(entrega.repoName).toBe("kata-funcional-juangarcia");
    expect(entrega.createdAt).toBeDefined();
  });

  it("filtra entregas por assignmentId", async () => {
    await createEntrega({
      assignmentId: "a1",
      repoName: "r1",
      repoUrl: "u1",
      githubUsernames: ["user1"],
    });
    await createEntrega({
      assignmentId: "a2",
      repoName: "r2",
      repoUrl: "u2",
      githubUsernames: ["user2"],
    });
    await createEntrega({
      assignmentId: "a1",
      repoName: "r3",
      repoUrl: "u3",
      githubUsernames: ["user3"],
    });

    const deA1 = await getEntregas("a1");
    expect(deA1).toHaveLength(2);

    const deA2 = await getEntregas("a2");
    expect(deA2).toHaveLength(1);
  });

  it("busca entrega de un usuario en un assignment", async () => {
    await createEntrega({
      assignmentId: "a1",
      repoName: "r1",
      repoUrl: "u1",
      githubUsernames: ["juangarcia", "mariaperez"],
      grupoId: "los-lambdas",
    });

    // Buscar por cualquiera de los miembros
    const e1 = await getEntregaDeUsuario("a1", "juangarcia");
    expect(e1).toBeDefined();
    expect(e1!.repoName).toBe("r1");

    const e2 = await getEntregaDeUsuario("a1", "mariaperez");
    expect(e2).toBeDefined();
    expect(e2!.repoName).toBe("r1");

    // Buscar usuario que no está
    const e3 = await getEntregaDeUsuario("a1", "otrapersona");
    expect(e3).toBeUndefined();
  });

  it("busca case-insensitive por username", async () => {
    await createEntrega({
      assignmentId: "a1",
      repoName: "r1",
      repoUrl: "u1",
      githubUsernames: ["JuanGarcia"],
    });

    const found = await getEntregaDeUsuario("a1", "juangarcia");
    expect(found).toBeDefined();
  });
});

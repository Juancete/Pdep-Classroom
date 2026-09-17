import { describe, it, expect, vi, beforeEach } from "vitest";

// `MikroORM.init` se mockea a nivel de módulo: acá no interesa conectarse a
// una base real, sólo ejercitar `getOrm()` (el singleton en `globalThis` y
// el guard de `asegurarMismaCopiaDeEntidades`).
const mockInit = vi.fn();
const mockClose = vi.fn();
const emFake = { fork: vi.fn() };

vi.mock("@mikro-orm/postgresql", () => ({
  MikroORM: {
    init: (...args: unknown[]) => mockInit(...args),
  },
}));

// Dos clases de prueba con nombres distintos entre sí, pero con las que se
// simula el escenario real del issue #90 pisando, en cada test, qué "clase
// registrada" devuelve `getMetadata().find(nombre)` para uno de esos
// nombres — así se puede representar tanto "misma clase" como "otra copia
// de webpack trajo una clase distinta con el mismo nombre" sin tener que
// duplicar el módulo de verdad.
class EntidadA {}
class EntidadB {}

vi.mock("../../mikro-orm.config", () => ({
  default: { entities: [EntidadA, EntidadB] },
}));

// Mapa mutable de "nombre de entidad" -> "clase que el ORM tiene
// registrada". Cada test lo arranca en sync con `config.entities` y lo
// pisa cuando quiere simular una copia distinta.
let entidadesRegistradas: Record<string, { class: unknown }>;

function crearOrmFake() {
  return {
    getMetadata: () => ({
      find: (nombre: string) => entidadesRegistradas[nombre],
    }),
    em: { fork: () => emFake },
    close: mockClose,
  };
}

describe("db.ts getOrm", () => {
  // Cada test evalúa una copia fresca del módulo: `getOrm()` cachea el ORM
  // en `globalThis`, así que sin resetear eso y sin `vi.resetModules()` un
  // test contaminaría al siguiente.
  let getOrm: typeof import("./db").getOrm;

  beforeEach(async () => {
    vi.clearAllMocks();
    global.__mikro_orm__ = undefined;
    global.__mikro_orm_init__ = undefined;
    entidadesRegistradas = {
      EntidadA: { class: EntidadA },
      EntidadB: { class: EntidadB },
    };
    mockInit.mockResolvedValue(crearOrmFake());

    vi.resetModules();
    ({ getOrm } = await import("./db"));
  });

  it("con la misma clase registrada, devuelve el ORM cacheado sin volver a inicializar", async () => {
    const orm1 = await getOrm();
    mockInit.mockClear();

    const orm2 = await getOrm();

    expect(orm2).toBe(orm1);
    expect(mockInit).not.toHaveBeenCalled();
  });

  it("con una clase distinta registrada bajo el mismo nombre, rechaza con el error descriptivo", async () => {
    await getOrm();

    // Otra "copia" de webpack reemplazó la clase que el ORM tiene
    // registrada para "EntidadA" por una clase distinta con el mismo
    // nombre — el mismo síntoma que dos bundles con su propio
    // `Docente`.
    class OtraEntidadA {}
    entidadesRegistradas.EntidadA = { class: OtraEntidadA };

    await expect(getOrm()).rejects.toThrow(/otra copia de las entidades/);
  });

  it("con dos llamadas concurrentes antes de resolver init, MikroORM.init se llama una sola vez", async () => {
    let resolverInit!: (orm: ReturnType<typeof crearOrmFake>) => void;
    mockInit.mockReturnValue(
      new Promise((resolve) => {
        resolverInit = resolve;
      })
    );

    const [promesa1, promesa2] = [getOrm(), getOrm()];
    resolverInit(crearOrmFake());
    const [orm1, orm2] = await Promise.all([promesa1, promesa2]);

    expect(orm1).toBe(orm2);
    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  it("con una clase distinta registrada mientras la init compartida sigue pendiente, la segunda llamada rechaza con el error descriptivo", async () => {
    let resolverInit!: (orm: ReturnType<typeof crearOrmFake>) => void;
    mockInit.mockReturnValue(
      new Promise((resolve) => {
        resolverInit = resolve;
      })
    );

    const [promesa1, promesa2] = [getOrm(), getOrm()];
    // El guard corre sobre todas las llamadas que comparten la promesa
    // pendiente, así que la primera también puede rechazar; lo que importa
    // acá es la segunda, y evitamos que quede como "unhandled rejection".
    promesa1.catch(() => {});

    // Otra "copia" de webpack pisa, mientras la init compartida todavía no
    // resolvió, la clase que se va a registrar para "EntidadA" por una
    // distinta con el mismo nombre.
    class OtraEntidadA {}
    entidadesRegistradas.EntidadA = { class: OtraEntidadA };

    resolverInit(crearOrmFake());

    await expect(promesa2).rejects.toThrow(/otra copia de las entidades/);
    expect(mockInit).toHaveBeenCalledTimes(1);
  });
});

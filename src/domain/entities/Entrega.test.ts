import { describe, it, expect } from "vitest";
import { Entrega } from "./Entrega";

function nuevaEntrega(overrides: Partial<Entrega> = {}): Entrega {
  const entrega = new Entrega();
  entrega.githubUsernames = ["ana-garcia"];
  entrega.repoDeleted = false;
  return Object.assign(entrega, overrides);
}

describe("Entrega.compararRepoGithubId", () => {
  it.each([
    ["123", "123", "coincide"],
    ["123", "456", "conflicto"],
    [undefined, "123", "desconocido"],
    ["123", undefined, "desconocido"],
    [undefined, undefined, "desconocido"],
  ] as const)("ID guardado %s e ID recibido %s: %s", (guardado, recibido, resultado) => {
    expect(nuevaEntrega({ repoGithubId: guardado }).compararRepoGithubId(recibido)).toBe(resultado);
  });
});

describe("Entrega.tieneConflictoDeRepoGithubId", () => {
  it.each([
    ["123", "456", true],
    ["123", "123", false],
    [undefined, "123", false],
    ["123", undefined, false],
    [undefined, undefined, false],
  ] as const)("ID guardado %s e ID recibido %s: conflicto %s", (guardado, recibido, conflicto) => {
    expect(nuevaEntrega({ repoGithubId: guardado }).tieneConflictoDeRepoGithubId(recibido)).toBe(conflicto);
  });
});

describe("Entrega.hasRepo", () => {
  it("devuelve true cuando hay repoUrl y no fue borrado", () => {
    const entrega = nuevaEntrega({ repoUrl: "https://github.com/org/repo", repoDeleted: false });
    expect(entrega.hasRepo()).toBe(true);
  });

  it("devuelve false cuando no hay repoUrl", () => {
    const entrega = nuevaEntrega({ repoUrl: undefined });
    expect(entrega.hasRepo()).toBe(false);
  });

  it("devuelve false cuando el repo fue borrado", () => {
    const entrega = nuevaEntrega({ repoUrl: "https://github.com/org/repo", repoDeleted: true });
    expect(entrega.hasRepo()).toBe(false);
  });
});

describe("Entrega.nombreDeRepoActivo", () => {
  it("devuelve el nombre del repo cuando la entrega está activa", () => {
    const entrega = nuevaEntrega({
      provisionEstado: "activa",
      repoName: "org-repo",
      repoUrl: "https://github.com/org/org-repo",
    });
    expect(entrega.nombreDeRepoActivo()).toBe("org-repo");
  });

  it("no devuelve nada cuando la provisión quedó pendiente", () => {
    const entrega = nuevaEntrega({
      provisionEstado: "pendiente",
      repoName: "org-repo",
      repoUrl: undefined,
    });
    expect(entrega.nombreDeRepoActivo()).toBeUndefined();
  });

  it("no devuelve nada cuando el repo fue borrado", () => {
    const entrega = nuevaEntrega({
      provisionEstado: "activa",
      repoName: "org-repo",
      repoUrl: "https://github.com/org/org-repo",
      repoDeleted: true,
    });
    expect(entrega.nombreDeRepoActivo()).toBeUndefined();
  });
});

describe("Entrega.nombreDeRepoParcial", () => {
  const inicio = new Date("2026-08-23T12:00:00Z");

  it("devuelve el nombre del repo cuando la provisión quedó fallida después de iniciar la creación", () => {
    const entrega = nuevaEntrega({
      provisionEstado: "fallida",
      repoName: "org-repo",
      repoUrl: undefined,
      provisionCreacionIniciadaEn: inicio,
    });
    expect(entrega.nombreDeRepoParcial()).toBe("org-repo");
  });

  it("devuelve el nombre del repo cuando la provisión quedó pendiente después de iniciar la creación", () => {
    const entrega = nuevaEntrega({
      provisionEstado: "pendiente",
      repoName: "org-repo",
      repoUrl: undefined,
      provisionCreacionIniciadaEn: inicio,
    });
    expect(entrega.nombreDeRepoParcial()).toBe("org-repo");
  });

  it("no devuelve nada cuando la creación del repo nunca llegó a iniciarse", () => {
    const entrega = nuevaEntrega({
      provisionEstado: "fallida",
      repoName: "org-repo",
      repoUrl: undefined,
      provisionCreacionIniciadaEn: undefined,
    });
    expect(entrega.nombreDeRepoParcial()).toBeUndefined();
  });

  it("no devuelve nada cuando el repo fue borrado", () => {
    const entrega = nuevaEntrega({
      provisionEstado: "fallida",
      repoName: "org-repo",
      repoUrl: undefined,
      provisionCreacionIniciadaEn: inicio,
      repoDeleted: true,
    });
    expect(entrega.nombreDeRepoParcial()).toBeUndefined();
  });

  it("no devuelve nada cuando la entrega tiene el repo activo", () => {
    const entrega = nuevaEntrega({
      provisionEstado: "activa",
      repoName: "org-repo",
      repoUrl: "https://github.com/org/org-repo",
      provisionCreacionIniciadaEn: inicio,
    });
    expect(entrega.nombreDeRepoParcial()).toBeUndefined();
    expect(entrega.nombreDeRepoActivo()).toBe("org-repo");
  });
});

// Issue #107 (revisión de code review): la ventana de "en vuelo" vivía
// duplicada en `EntregaRepository.iniciarProvisionEntrega` — se mueve acá
// para que `borrarEntrega.ts` la consulte sin repetirla.
describe("Entrega.provisionEnCurso", () => {
  it("devuelve true cuando el intento está pendiente, con intentos y actualizado hace 10 segundos", () => {
    const ahora = new Date("2026-01-01T00:02:00.000Z");
    const entrega = nuevaEntrega({
      provisionEstado: "pendiente",
      provisionIntentos: 1,
      provisionActualizadoEn: new Date("2026-01-01T00:01:50.000Z"),
    });
    expect(entrega.provisionEnCurso(ahora)).toBe(true);
  });

  it("devuelve false cuando ya pasó la ventana de dos minutos", () => {
    const ahora = new Date("2026-01-01T00:05:00.000Z");
    const entrega = nuevaEntrega({
      provisionEstado: "pendiente",
      provisionIntentos: 1,
      provisionActualizadoEn: new Date("2026-01-01T00:01:00.000Z"),
    });
    expect(entrega.provisionEnCurso(ahora)).toBe(false);
  });

  it("devuelve false cuando todavía no hubo ningún intento", () => {
    const ahora = new Date("2026-01-01T00:02:00.000Z");
    const entrega = nuevaEntrega({
      provisionEstado: "pendiente",
      provisionIntentos: 0,
      provisionActualizadoEn: new Date("2026-01-01T00:01:50.000Z"),
    });
    expect(entrega.provisionEnCurso(ahora)).toBe(false);
  });

  it("devuelve false cuando la provisión está activa", () => {
    const entrega = nuevaEntrega({
      provisionEstado: "activa",
      provisionIntentos: 1,
      provisionActualizadoEn: new Date(),
    });
    expect(entrega.provisionEnCurso()).toBe(false);
  });

  it("devuelve false cuando la provisión falló", () => {
    const entrega = nuevaEntrega({
      provisionEstado: "fallida",
      provisionIntentos: 1,
      provisionActualizadoEn: new Date(),
    });
    expect(entrega.provisionEnCurso()).toBe(false);
  });
});

// B1 de la auditoría de dominio: antes esta condición vivía duplicada en
// `ci/rerun/route.ts` (sólo `resultadoCI.permiteReejecucion()`) y en
// `sincronizarCI.reejecutarCIDeEntrega` (esa misma condición + repoName +
// ciCheckSuiteIds, con un `Error` genérico) — un resultado "reejecutable"
// (ej. "passing") sin checks guardados pasaba el guard de la route y recién
// ahí explotaba como 500 en vez de 409.
describe("Entrega.puedeReejecutarCI", () => {
  it("permite reejecutar cuando el resultado lo habilita y hay repoName y check suites guardados", () => {
    const entrega = nuevaEntrega({
      ciResultadoNombre: "passing",
      repoName: "org-repo",
      ciCheckSuiteIds: ["111"],
    });
    expect(entrega.puedeReejecutarCI()).toBe(true);
  });

  it("no permite reejecutar cuando el resultado no lo habilita (ej. pendiente)", () => {
    const entrega = nuevaEntrega({
      ciResultadoNombre: "pendiente",
      repoName: "org-repo",
      ciCheckSuiteIds: ["111"],
    });
    expect(entrega.puedeReejecutarCI()).toBe(false);
  });

  it("no permite reejecutar un resultado reejecutable sin repoName", () => {
    const entrega = nuevaEntrega({
      ciResultadoNombre: "passing",
      repoName: undefined,
      ciCheckSuiteIds: ["111"],
    });
    expect(entrega.puedeReejecutarCI()).toBe(false);
  });

  it("no permite reejecutar un resultado reejecutable sin check suites guardados", () => {
    const entrega = nuevaEntrega({
      ciResultadoNombre: "passing",
      repoName: "org-repo",
      ciCheckSuiteIds: [],
    });
    expect(entrega.puedeReejecutarCI()).toBe(false);
  });
});

describe("aprovisionamiento de Entrega", () => {
  it("no considera activa una entrega cuyo repo fue borrado", () => {
    const entrega = nuevaEntrega({
      repoUrl: "https://github.com/org/repo",
      provisionEstado: "activa",
      repoDeleted: true,
    });

    expect(entrega.hasRepo()).toBe(false);
  });

  it("registra intentos, error y recuperación", () => {
    const entrega = nuevaEntrega({ provisionEstado: "fallida" });

    entrega.iniciarProvision();
    expect(entrega.provisionEstado).toBe("pendiente");
    expect(entrega.provisionIntentos).toBe(1);

    entrega.fallarProvision("GitHub no respondió");
    expect(entrega.provisionEstado).toBe("fallida");
    expect(entrega.provisionUltimoError).toBe("GitHub no respondió");

    entrega.completarProvision({
      repoName: "kata-ana",
      repoUrl: "https://github.com/org/kata-ana",
      repoGithubId: "123",
    });
    expect(entrega.hasRepo()).toBe(true);
    expect(entrega.provisionUltimoError).toBeUndefined();
    expect(entrega.repoGithubId).toBe("123");
  });
});

describe("Entrega.repoFueBorrado", () => {
  it("devuelve true cuando hay repoName y repoDeleted es true", () => {
    const entrega = nuevaEntrega({ repoName: "org-repo", repoDeleted: true });
    expect(entrega.repoFueBorrado()).toBe(true);
  });

  it("devuelve false cuando repoDeleted es false", () => {
    const entrega = nuevaEntrega({ repoName: "org-repo", repoDeleted: false });
    expect(entrega.repoFueBorrado()).toBe(false);
  });

  it("devuelve false cuando no hay repoName", () => {
    const entrega = nuevaEntrega({ repoName: undefined, repoDeleted: true });
    expect(entrega.repoFueBorrado()).toBe(false);
  });
});

describe("Entrega.estadoRepo", () => {
  it("devuelve 'activo' cuando tiene repo y no fue borrado", () => {
    const entrega = nuevaEntrega({
      repoName: "repo",
      repoUrl: "https://github.com/org/repo",
      repoDeleted: false,
    });
    expect(entrega.estadoRepo()).toBe("activo");
  });

  it("devuelve 'borrado' cuando el repo fue borrado", () => {
    const entrega = nuevaEntrega({ repoName: "repo", repoUrl: "https://github.com/org/repo", repoDeleted: true });
    expect(entrega.estadoRepo()).toBe("borrado");
  });

  it("devuelve 'sin-repo' cuando nunca tuvo repo", () => {
    const entrega = nuevaEntrega({ repoName: undefined, repoUrl: undefined });
    expect(entrega.estadoRepo()).toBe("sin-repo");
  });
});

describe("Entrega.tieneCIFresco", () => {
  it("es fresco cuando se consultó hace menos de FRESCURA_CI_MS", () => {
    const ahora = new Date("2026-08-19T10:01:00Z");
    const entrega = nuevaEntrega({ ciActualizadoEn: new Date("2026-08-19T10:00:30Z") });
    expect(entrega.tieneCIFresco(ahora)).toBe(true);
  });

  it("no es fresco cuando pasó más de FRESCURA_CI_MS", () => {
    const ahora = new Date("2026-08-19T10:05:00Z");
    const entrega = nuevaEntrega({ ciActualizadoEn: new Date("2026-08-19T10:00:00Z") });
    expect(entrega.tieneCIFresco(ahora)).toBe(false);
  });

  it("no es fresco cuando nunca se consultó", () => {
    const entrega = nuevaEntrega({ ciActualizadoEn: undefined });
    expect(entrega.tieneCIFresco(new Date())).toBe(false);
  });
});

// Fase 2 de la auditoría de dominio: antes `EntregaRepository.actualizarCIDeEntrega`
// asignaba los campos de CI directamente. `registrarResultadoCI` es la
// única fuente, con la semántica tri-estado documentada en cada campo.
describe("Entrega.registrarResultadoCI", () => {
  it("actualiza el resultado y todos los campos provistos", () => {
    const entrega = nuevaEntrega();
    const ejecutadoEn = new Date("2026-08-19T10:00:00Z");

    entrega.registrarResultadoCI({
      resultadoNombre: "passing",
      checkSuiteIds: ["111", "222"],
      commitSha: "abc123",
      detalleUrl: "https://github.com/org/repo/commit/abc123/checks",
      ejecutadoEn,
    });

    expect(entrega.ciResultadoNombre).toBe("passing");
    expect(entrega.ciCheckSuiteIds).toEqual(["111", "222"]);
    expect(entrega.ciCommitSha).toBe("abc123");
    expect(entrega.ciDetalleUrl).toBe("https://github.com/org/repo/commit/abc123/checks");
    expect(entrega.ciEjecutadoEn).toBe(ejecutadoEn);
    expect(entrega.ciActualizadoEn).toBeInstanceOf(Date);
  });

  it("un campo omitido (undefined) conserva el valor ya guardado", () => {
    const entrega = nuevaEntrega({
      ciCheckSuiteIds: ["111"],
      ciCommitSha: "abc123",
    });

    entrega.registrarResultadoCI({ resultadoNombre: "pendiente" });

    expect(entrega.ciResultadoNombre).toBe("pendiente");
    expect(entrega.ciCheckSuiteIds).toEqual(["111"]);
    expect(entrega.ciCommitSha).toBe("abc123");
  });

  it("un campo en null lo limpia explícitamente", () => {
    const entrega = nuevaEntrega({
      ciCheckSuiteIds: ["111"],
      ciCommitSha: "abc123",
      ciDetalleUrl: "https://github.com/org/repo/checks",
      ciEjecutadoEn: new Date("2026-08-19T10:00:00Z"),
    });

    entrega.registrarResultadoCI({
      resultadoNombre: "sin_ci",
      checkSuiteIds: null,
      commitSha: null,
      detalleUrl: null,
      ejecutadoEn: null,
    });

    expect(entrega.ciCheckSuiteIds).toEqual([]);
    expect(entrega.ciCommitSha).toBeUndefined();
    expect(entrega.ciDetalleUrl).toBeUndefined();
    expect(entrega.ciEjecutadoEn).toBeUndefined();
  });
});

describe("Entrega.tieneContribucionesFrescas", () => {
  it("son frescas cuando se sincronizaron hace menos de FRESCURA_CONTRIBUCIONES_MS", () => {
    const ahora = new Date("2026-09-22T10:01:00Z");
    const entrega = nuevaEntrega({
      contribucionesActualizadoEn: new Date("2026-09-22T10:00:30Z"),
    });
    expect(entrega.tieneContribucionesFrescas(ahora)).toBe(true);
  });

  it("no son frescas cuando pasó más de FRESCURA_CONTRIBUCIONES_MS", () => {
    const ahora = new Date("2026-09-22T10:05:00Z");
    const entrega = nuevaEntrega({
      contribucionesActualizadoEn: new Date("2026-09-22T10:00:00Z"),
    });
    expect(entrega.tieneContribucionesFrescas(ahora)).toBe(false);
  });

  it("no son frescas cuando nunca se sincronizaron", () => {
    const entrega = nuevaEntrega({ contribucionesActualizadoEn: undefined });
    expect(entrega.tieneContribucionesFrescas(new Date())).toBe(false);
  });
});

describe("Entrega.tieneContribucionesSincronizadas", () => {
  it("es false cuando nunca se sincronizaron", () => {
    const entrega = nuevaEntrega({ contribucionesActualizadoEn: undefined });
    expect(entrega.tieneContribucionesSincronizadas()).toBe(false);
  });

  it("es true una vez sincronizadas, aunque el repo no tenga commits", () => {
    const entrega = nuevaEntrega({
      contribuciones: [],
      contribucionesActualizadoEn: new Date("2026-09-22T10:00:00Z"),
    });
    expect(entrega.tieneContribucionesSincronizadas()).toBe(true);
  });

  // Regresión: el proyecto no configura `forceUndefined` en MikroORM, así
  // que una entrega hidratada desde la DB sin sincronizar trae
  // `contribucionesActualizadoEn === null` (y `contribuciones === null`),
  // no `undefined` — se simula asignando `null` directo (cast, igual que
  // haría el hydrator del ORM), mismo patrón que en `Assignment.test.ts`.
  // Con `!== undefined` esto daba `true` para cualquier entrega existente.
  it("null (hidratado desde la DB) se trata igual que 'nunca sincronizado'", () => {
    const entrega = nuevaEntrega({
      contribuciones: null as unknown as undefined,
      contribucionesActualizadoEn: null as unknown as undefined,
    });

    expect(entrega.tieneContribucionesSincronizadas()).toBe(false);
    expect(entrega.tieneContribucionesFrescas(new Date())).toBe(false);
    expect(entrega.participacionDe(["ana"])).toEqual([]);
    expect(entrega.totalDeCommits()).toBe(0);
  });
});

describe("Entrega.registrarContribuciones", () => {
  it("copia la lista recibida y sella la fecha de sincronización", () => {
    const entrega = nuevaEntrega();
    const contribuciones = [{ login: "ana", commits: 10 }];

    entrega.registrarContribuciones(contribuciones);

    expect(entrega.contribuciones).toEqual(contribuciones);
    expect(entrega.contribuciones).not.toBe(contribuciones);
    expect(entrega.contribucionesActualizadoEn).toBeInstanceOf(Date);
  });
});

describe("Entrega.totalDeCommits", () => {
  it("suma los commits de todos los logins, incluyendo no integrantes", () => {
    const entrega = nuevaEntrega({
      contribuciones: [
        { login: "ana-garcia", commits: 5 },
        { login: "dependabot[bot]", commits: 3 },
      ],
    });
    expect(entrega.totalDeCommits()).toBe(8);
  });

  it("es 0 cuando nunca se sincronizó", () => {
    const entrega = nuevaEntrega({ contribuciones: undefined });
    expect(entrega.totalDeCommits()).toBe(0);
  });
});

describe("Entrega.participacionDe", () => {
  it("redondea el porcentaje sobre el total del repo", () => {
    const entrega = nuevaEntrega({
      contribuciones: [
        { login: "ana", commits: 1 },
        { login: "bob", commits: 2 },
      ],
    });

    expect(entrega.participacionDe(["ana", "bob"])).toEqual([
      { username: "ana", commits: 1, porcentaje: 33 },
      { username: "bob", commits: 2, porcentaje: 67 },
    ]);
  });

  it("matchea logins en forma canónica (case-insensitive, con o sin '@')", () => {
    const entrega = nuevaEntrega({
      contribuciones: [{ login: "Ana-Garcia", commits: 4 }],
    });

    expect(entrega.participacionDe(["@ana-garcia"])).toEqual([
      { username: "@ana-garcia", commits: 4, porcentaje: 100 },
    ]);
  });

  it("un integrante sin commits en el repo entra en 0/0", () => {
    const entrega = nuevaEntrega({
      contribuciones: [{ login: "ana", commits: 4 }],
    });

    expect(entrega.participacionDe(["bob"])).toEqual([
      { username: "bob", commits: 0, porcentaje: 0 },
    ]);
  });

  it("los logins que no son integrantes bajan el porcentaje pero no aparecen", () => {
    const entrega = nuevaEntrega({
      contribuciones: [
        { login: "ana", commits: 5 },
        { login: "dependabot[bot]", commits: 5 },
      ],
    });

    expect(entrega.participacionDe(["ana"])).toEqual([
      { username: "ana", commits: 5, porcentaje: 50 },
    ]);
  });

  it("con total 0 devuelve 0% sin NaN", () => {
    const entrega = nuevaEntrega({ contribuciones: [] });
    expect(entrega.participacionDe(["ana"])).toEqual([
      { username: "ana", commits: 0, porcentaje: 0 },
    ]);
  });

  it("respeta el orden de la lista recibida", () => {
    const entrega = nuevaEntrega({
      contribuciones: [
        { login: "ana", commits: 1 },
        { login: "bob", commits: 1 },
      ],
    });

    expect(entrega.participacionDe(["bob", "ana"]).map((integrante) => integrante.username)).toEqual([
      "bob",
      "ana",
    ]);
  });

  it("devuelve [] cuando nunca se sincronizó", () => {
    const entrega = nuevaEntrega({ contribuciones: undefined });
    expect(entrega.participacionDe(["ana"])).toEqual([]);
  });

  it("una contribución anónima (sin login) cuenta en el total pero no se le puede asignar a nadie", () => {
    const entrega = nuevaEntrega({
      contribuciones: [{ login: "ana", commits: 5 }, { commits: 5 }],
    });

    expect(entrega.participacionDe(["ana"])).toEqual([
      { username: "ana", commits: 5, porcentaje: 50 },
    ]);
    expect(entrega.totalDeCommits()).toBe(10);
  });

  it("una contribución anónima nunca matchea, ni con un username vacío o literal 'undefined'", () => {
    const entrega = nuevaEntrega({
      contribuciones: [{ commits: 7 }],
    });

    expect(entrega.participacionDe([""])).toEqual([
      { username: "", commits: 0, porcentaje: 0 },
    ]);
    expect(entrega.participacionDe(["undefined"])).toEqual([
      { username: "undefined", commits: 0, porcentaje: 0 },
    ]);
  });
});

describe("Entrega.participacionDeColaboradores", () => {
  it("usa githubUsernames como lista de integrantes", () => {
    const entrega = nuevaEntrega({
      githubUsernames: ["ana", "bob"],
      contribuciones: [
        { login: "ana", commits: 3 },
        { login: "bob", commits: 1 },
      ],
    });

    expect(entrega.participacionDeColaboradores()).toEqual([
      { username: "ana", commits: 3, porcentaje: 75 },
      { username: "bob", commits: 1, porcentaje: 25 },
    ]);
  });
});

describe("Entrega.registrarPush", () => {
  it("registra la actividad cuando no había ningún push previo", () => {
    const entrega = nuevaEntrega();
    const pusheadoEn = new Date("2026-08-19T10:00:00Z");

    const aplicado = entrega.registrarPush({ pusheadoEn, commitSha: "abc123", por: "juancito" });

    expect(aplicado).toBe(true);
    expect(entrega.ultimoPushEn).toBe(pusheadoEn);
    expect(entrega.ultimoPushSha).toBe("abc123");
    expect(entrega.ultimoPushPor).toBe("juancito");
  });

  it("no pisa un push más nuevo con uno más viejo (redelivery tardío)", () => {
    const entrega = nuevaEntrega({
      ultimoPushEn: new Date("2026-08-19T12:00:00Z"),
      ultimoPushSha: "nuevo123",
      ultimoPushPor: "ana",
    });

    const aplicado = entrega.registrarPush({
      pusheadoEn: new Date("2026-08-19T10:00:00Z"),
      commitSha: "viejo123",
      por: "juancito",
    });

    expect(aplicado).toBe(false);
    expect(entrega.ultimoPushSha).toBe("nuevo123");
  });
});

describe("Entrega.marcarRepoBorrado", () => {
  it("marca repoDeleted en true y sella repoEventoActualizadoEn", () => {
    const entrega = nuevaEntrega({ repoDeleted: false });
    const eventoActualizadoEn = new Date("2026-08-19T10:00:00Z");

    const aplicado = entrega.marcarRepoBorrado(eventoActualizadoEn);

    expect(aplicado).toBe(true);
    expect(entrega.repoDeleted).toBe(true);
    expect(entrega.repoEventoActualizadoEn).toBe(eventoActualizadoEn);
  });

  it("no aplica un evento repository más viejo que el último ya aplicado (guard de orden)", () => {
    const entrega = nuevaEntrega({
      repoDeleted: false,
      repoEventoActualizadoEn: new Date("2026-08-19T12:00:00Z"),
    });

    const aplicado = entrega.marcarRepoBorrado(new Date("2026-08-19T10:00:00Z"));

    expect(aplicado).toBe(false);
    expect(entrega.repoDeleted).toBe(false);
  });

  it("SÍ aplica un delete con el mismo timestamp que el último rename ya aplicado (empate, no lo rechaza)", () => {
    const mismoInstante = new Date("2026-08-19T12:00:00Z");
    const entrega = nuevaEntrega({
      repoDeleted: false,
      repoEventoActualizadoEn: mismoInstante,
    });

    expect(entrega.marcarRepoBorrado(mismoInstante)).toBe(true);
    expect(entrega.repoDeleted).toBe(true);
  });

  it("sin fecha de guard (payload sin updated_at), aplica igual", () => {
    const entrega = nuevaEntrega({ repoEventoActualizadoEn: new Date("2026-08-19T12:00:00Z") });

    expect(entrega.marcarRepoBorrado(undefined)).toBe(true);
    expect(entrega.repoDeleted).toBe(true);
  });
});

describe("Entrega.aplicarEventoRepository", () => {
  it("reescribe repoName y repoUrl", () => {
    const entrega = nuevaEntrega({
      repoName: "kata-juan-viejo",
      repoUrl: "https://github.com/org/kata-juan-viejo",
    });

    const aplicado = entrega.aplicarEventoRepository({
      repoName: "kata-juan-nuevo",
      repoUrl: "https://github.com/org/kata-juan-nuevo",
    });

    expect(aplicado).toBe(true);
    expect(entrega.repoName).toBe("kata-juan-nuevo");
    expect(entrega.repoUrl).toBe("https://github.com/org/kata-juan-nuevo");
  });

  it("no aplica un rename más viejo que el último evento repository ya aplicado (guard de orden)", () => {
    const entrega = nuevaEntrega({
      repoName: "C",
      repoEventoActualizadoEn: new Date("2026-08-19T12:00:00Z"),
    });

    const aplicado = entrega.aplicarEventoRepository(
      { repoName: "B", repoUrl: "https://github.com/org/B" },
      new Date("2026-08-19T10:00:00Z")
    );

    expect(aplicado).toBe(false);
    expect(entrega.repoName).toBe("C");
  });
});

describe("Entrega.autocompletarRepoGithubId", () => {
  it("lo setea cuando todavía no estaba (self-heal)", () => {
    const entrega = nuevaEntrega({ repoGithubId: undefined });

    expect(entrega.autocompletarRepoGithubId("555")).toBe(true);
    expect(entrega.repoGithubId).toBe("555");
  });

  it("no toca nada si ya estaba seteado", () => {
    const entrega = nuevaEntrega({ repoGithubId: "555" });

    expect(entrega.autocompletarRepoGithubId("999")).toBe(false);
    expect(entrega.repoGithubId).toBe("555");
  });
});

// Fase 2 de la auditoría de dominio: antes el matching se hacía a mano con
// `.toLowerCase()` en varios repositorios, sin quitar el `@` inicial —
// `perteneceA` usa `Alumno.normalizarUsername` en los dos lados.
describe("Entrega.perteneceA", () => {
  it("encuentra un match case-insensitive", () => {
    const entrega = nuevaEntrega({ githubUsernames: ["Juan-Garcia"] });
    expect(entrega.perteneceA("juan-garcia")).toBe(true);
  });

  it("ignora un '@' inicial en cualquiera de los dos lados", () => {
    const entrega = nuevaEntrega({ githubUsernames: ["@juan-garcia"] });
    expect(entrega.perteneceA("juan-garcia")).toBe(true);

    const otra = nuevaEntrega({ githubUsernames: ["juan-garcia"] });
    expect(otra.perteneceA("@juan-garcia")).toBe(true);
  });

  it("devuelve false si no hay match", () => {
    const entrega = nuevaEntrega({ githubUsernames: ["ana"] });
    expect(entrega.perteneceA("juan")).toBe(false);
  });
});

describe("Entrega.agregarColaborador", () => {
  it("agrega un colaborador nuevo", () => {
    const entrega = nuevaEntrega({ githubUsernames: ["juan"] });

    expect(entrega.agregarColaborador("ana")).toBe(true);
    expect(entrega.githubUsernames).toEqual(["juan", "ana"]);
  });

  it("no duplica un colaborador que ya estaba (case insensitive, con o sin '@')", () => {
    const entrega = nuevaEntrega({ githubUsernames: ["Juan"] });

    expect(entrega.agregarColaborador("@juan")).toBe(false);
    expect(entrega.githubUsernames).toEqual(["Juan"]);
  });
});

describe("Entrega.quitarColaborador", () => {
  it("quita un colaborador existente (case insensitive)", () => {
    const entrega = nuevaEntrega({ githubUsernames: ["Juan", "ana"] });

    expect(entrega.quitarColaborador("juan")).toBe(true);
    expect(entrega.githubUsernames).toEqual(["ana"]);
  });

  it("quitar un username que no está no rompe nada", () => {
    const entrega = nuevaEntrega({ githubUsernames: ["ana"] });

    expect(entrega.quitarColaborador("juan")).toBe(false);
    expect(entrega.githubUsernames).toEqual(["ana"]);
  });
});

describe("Entrega.marcadorDeRepo", () => {
  it("devuelve el marcador embebido en la descripción del repo", () => {
    const entrega = nuevaEntrega({ id: "00000000-0000-4000-8000-000000000001" });
    expect(entrega.marcadorDeRepo()).toBe(
      "[pdep-entrega:00000000-0000-4000-8000-000000000001]"
    );
  });
});

// Fase 3 de la auditoría de dominio: antes vivía como `repoCompatibleConIntento`
// en `aceptarAssignment.ts`.
describe("Entrega.reconoceComoPropio", () => {
  const ahora = new Date("2026-08-19T10:00:05Z");

  it("reconoce por repoGithubId aunque la descripción no tenga el marcador", () => {
    const entrega = nuevaEntrega({
      id: "00000000-0000-4000-8000-000000000001",
      repoGithubId: "555",
      provisionCreacionIniciadaEn: new Date("2026-08-19T10:00:00Z"),
    });

    expect(
      entrega.reconoceComoPropio({ repoGithubId: "555", description: "otra cosa", createdAt: ahora })
    ).toBe(true);
  });

  it("reconoce por el marcador en la descripción cuando no hay repoGithubId para comparar", () => {
    const entrega = nuevaEntrega({
      id: "00000000-0000-4000-8000-000000000001",
      repoGithubId: undefined,
      provisionCreacionIniciadaEn: new Date("2026-08-19T10:00:00Z"),
    });

    expect(
      entrega.reconoceComoPropio({
        description: `Kata — PdeP ${entrega.marcadorDeRepo()}`,
        createdAt: ahora,
      })
    ).toBe(true);
  });

  it("no reconoce si ni el id ni el marcador coinciden", () => {
    const entrega = nuevaEntrega({
      id: "00000000-0000-4000-8000-000000000001",
      repoGithubId: "555",
      provisionCreacionIniciadaEn: new Date("2026-08-19T10:00:00Z"),
    });

    expect(
      entrega.reconoceComoPropio({ repoGithubId: "999", description: "otra cosa", createdAt: ahora })
    ).toBe(false);
  });

  it("no reconoce un repo creado antes de iniciar la provisión (tolerancia de 5s)", () => {
    const entrega = nuevaEntrega({
      id: "00000000-0000-4000-8000-000000000001",
      repoGithubId: "555",
      provisionCreacionIniciadaEn: new Date("2026-08-19T10:00:00Z"),
    });

    expect(
      entrega.reconoceComoPropio({
        repoGithubId: "555",
        createdAt: new Date("2026-08-19T09:59:00Z"),
      })
    ).toBe(false);
  });

  it("no reconoce si nunca se inició una provisión", () => {
    const entrega = nuevaEntrega({ provisionCreacionIniciadaEn: undefined });

    expect(
      entrega.reconoceComoPropio({ repoGithubId: "555", createdAt: ahora })
    ).toBe(false);
  });

  it("no reconoce si el repo no tiene createdAt", () => {
    const entrega = nuevaEntrega({
      provisionCreacionIniciadaEn: new Date("2026-08-19T10:00:00Z"),
    });

    expect(
      entrega.reconoceComoPropio({ repoGithubId: "555", createdAt: null })
    ).toBe(false);
  });
});

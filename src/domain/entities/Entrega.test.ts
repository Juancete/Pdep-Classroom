import { describe, it, expect } from "vitest";
import { Entrega } from "./Entrega";

function nuevaEntrega(overrides: Partial<Entrega> = {}): Entrega {
  const entrega = new Entrega();
  entrega.githubUsernames = ["ana-garcia"];
  entrega.repoDeleted = false;
  return Object.assign(entrega, overrides);
}

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

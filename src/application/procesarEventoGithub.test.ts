import { beforeEach, describe, expect, it, vi } from "vitest";
import { Entrega } from "@/domain/entities";

const mockGetEntregaByRepoName = vi.fn();
const mockGetEntregaPorRepoGithubId = vi.fn();
const mockAsegurarRepoGithubId = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockConLockDeEntrega = vi.fn();
const mockActualizarActividad = vi.fn();
const mockMarcarRepoBorrado = vi.fn();
const mockRenombrarRepo = vi.fn();
const mockActualizarColaboradores = vi.fn();
const mockSincronizarCI = vi.fn();
const mockEsColaborador = vi.fn();
const mockGetRepoInfoPorId = vi.fn();
const mockTransaction = { nombre: "transaction-em" };

vi.mock("@/infrastructure/github", () => ({
  ORG: "pdep-mn-utn",
  esColaborador: (...args: unknown[]) => mockEsColaborador(...args),
  getRepoInfoPorId: (...args: unknown[]) => mockGetRepoInfoPorId(...args),
}));

vi.mock("./sincronizarCI", () => ({
  sincronizarCIDeEntregas: (...args: unknown[]) => mockSincronizarCI(...args),
}));

vi.mock("@/infrastructure/repositories", () => ({
  getEntregaByRepoName: (...args: unknown[]) => mockGetEntregaByRepoName(...args),
  getEntregaPorRepoGithubId: (...args: unknown[]) => mockGetEntregaPorRepoGithubId(...args),
  asegurarRepoGithubId: (...args: unknown[]) => mockAsegurarRepoGithubId(...args),
  getAlumnoByGithub: (...args: unknown[]) => mockGetAlumnoByGithub(...args),
  conLockDeEntrega: (...args: unknown[]) => mockConLockDeEntrega(...args),
  actualizarActividadDeEntrega: (...args: unknown[]) => mockActualizarActividad(...args),
  marcarRepoBorrado: (...args: unknown[]) => mockMarcarRepoBorrado(...args),
  renombrarRepoDeEntrega: (...args: unknown[]) => mockRenombrarRepo(...args),
  actualizarColaboradoresDeEntrega: (...args: unknown[]) => mockActualizarColaboradores(...args),
}));

import { procesarEventoGithub } from "./procesarEventoGithub";

function entregaConId(id: string): Entrega {
  const entrega = new Entrega();
  entrega.id = id;
  return entrega;
}

const REPO_BASE = { name: "kata-juan", owner: { login: "pdep-mn-utn" } };

describe("procesarEventoGithub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConLockDeEntrega.mockImplementation(
      (_id: string, operation: (transaction: unknown) => unknown) => operation(mockTransaction)
    );
    mockGetEntregaPorRepoGithubId.mockResolvedValue(null);
    mockGetRepoInfoPorId.mockResolvedValue(null);
  });

  it("ignora un evento sin manejador registrado", async () => {
    const resultado = await procesarEventoGithub("ping", { repository: REPO_BASE });
    expect(resultado).toEqual({ estado: "ignorado" });
    expect(mockGetEntregaByRepoName).not.toHaveBeenCalled();
  });

  it("ignora un payload sin la forma mínima esperada", async () => {
    const resultado = await procesarEventoGithub("push", { foo: "bar" });
    expect(resultado).toEqual({ estado: "ignorado" });
  });

  it("ignora un repo fuera de la org configurada", async () => {
    const resultado = await procesarEventoGithub("push", {
      repository: { name: "otro-repo", owner: { login: "otra-org" } },
      after: "abc123",
      sender: { login: "juan" },
    });
    expect(resultado).toEqual({ estado: "ignorado" });
    expect(mockGetEntregaByRepoName).not.toHaveBeenCalled();
  });

  it("ignora un repo que no corresponde a ninguna entrega", async () => {
    mockGetEntregaByRepoName.mockResolvedValue(null);
    const resultado = await procesarEventoGithub("check_suite", {
      action: "completed",
      repository: REPO_BASE,
    });
    expect(resultado).toEqual({ estado: "ignorado" });
  });

  describe("check_suite", () => {
    it("sincroniza la CI de la entrega bajo lock y devuelve procesado", async () => {
      const entrega = entregaConId("e1");
      mockGetEntregaByRepoName.mockResolvedValue(entrega);
      mockSincronizarCI.mockResolvedValue({ actualizadas: 1, omitidas: 0, fallidas: [] });

      const resultado = await procesarEventoGithub("check_suite", {
        action: "completed",
        repository: REPO_BASE,
      });

      expect(resultado).toEqual({ estado: "procesado", entregaId: "e1" });
      expect(mockConLockDeEntrega).toHaveBeenCalledWith("e1", expect.any(Function));
      expect(mockSincronizarCI).toHaveBeenCalledWith([entrega], {
        forzar: true,
        em: mockTransaction,
      });
    });

    it.each(["requested", "rerequested", "completed"])(
      "procesa la action '%s'",
      async (action) => {
        const entrega = entregaConId("e1");
        mockGetEntregaByRepoName.mockResolvedValue(entrega);
        mockSincronizarCI.mockResolvedValue({ actualizadas: 1, omitidas: 0, fallidas: [] });

        const resultado = await procesarEventoGithub("check_suite", { action, repository: REPO_BASE });
        expect(resultado.estado).toBe("procesado");
      }
    );

    it("ignora una action que no es requested/rerequested/completed", async () => {
      const resultado = await procesarEventoGithub("check_suite", {
        action: "otra",
        repository: REPO_BASE,
      });
      expect(resultado).toEqual({ estado: "ignorado" });
      expect(mockGetEntregaByRepoName).not.toHaveBeenCalled();
    });

    it("propaga el fallo si sincronizarCIDeEntregas reporta una entrega fallida", async () => {
      const entrega = entregaConId("e1");
      mockGetEntregaByRepoName.mockResolvedValue(entrega);
      mockSincronizarCI.mockResolvedValue({
        actualizadas: 0,
        omitidas: 0,
        fallidas: [{ repoName: "kata-juan", error: "timeout" }],
      });

      await expect(
        procesarEventoGithub("check_suite", { action: "completed", repository: REPO_BASE })
      ).rejects.toThrow("timeout");
    });
  });

  describe("push", () => {
    it("persiste la actividad reciente usando repository.pushed_at (epoch en segundos)", async () => {
      const entrega = entregaConId("e1");
      mockGetEntregaByRepoName.mockResolvedValue(entrega);

      const resultado = await procesarEventoGithub("push", {
        repository: { ...REPO_BASE, pushed_at: 1_700_000_000 },
        after: "abc123",
        sender: { login: "juancito" },
      });

      expect(resultado).toEqual({ estado: "procesado", entregaId: "e1" });
      expect(mockActualizarActividad).toHaveBeenCalledWith("e1", {
        pusheadoEn: new Date(1_700_000_000 * 1000),
        commitSha: "abc123",
        por: "juancito",
      }, mockTransaction);
    });

    it("acepta repository.pushed_at como string ISO", async () => {
      const entrega = entregaConId("e1");
      mockGetEntregaByRepoName.mockResolvedValue(entrega);

      await procesarEventoGithub("push", {
        repository: { ...REPO_BASE, pushed_at: "2026-08-19T10:00:00Z" },
        after: "abc123",
        sender: { login: "juancito" },
      });

      expect(mockActualizarActividad).toHaveBeenCalledWith(
        "e1",
        expect.objectContaining({ pusheadoEn: new Date("2026-08-19T10:00:00Z") }),
        mockTransaction
      );
    });

    it("sin pushed_at interpretable, rechaza el evento en vez de caer a la hora de procesamiento", async () => {
      const entrega = entregaConId("e1");
      mockGetEntregaByRepoName.mockResolvedValue(entrega);

      // Caer a `new Date()` acá reabriría el problema de orden que
      // `pushed_at` vino a resolver — un push viejo demorado ganaría por
      // procesarse último. Se rechaza (el delivery queda `fallido`,
      // reprocesable) en vez de aplicarse en silencio con una fecha que no
      // es la real.
      await expect(
        procesarEventoGithub("push", {
          repository: REPO_BASE,
          after: "abc123",
          sender: { login: "juan" },
        })
      ).rejects.toThrow(/pushed_at/);
      expect(mockActualizarActividad).not.toHaveBeenCalled();
    });

    it("un pushed_at no interpretable (string inválido) también rechaza el evento", async () => {
      const entrega = entregaConId("e1");
      mockGetEntregaByRepoName.mockResolvedValue(entrega);

      await expect(
        procesarEventoGithub("push", {
          repository: { ...REPO_BASE, pushed_at: "no-es-una-fecha" },
          after: "abc123",
          sender: { login: "juan" },
        })
      ).rejects.toThrow(/pushed_at/);
    });

    it("un pushed_at numérico fuera del rango de Date también rechaza el evento", async () => {
      const entrega = entregaConId("e1");
      mockGetEntregaByRepoName.mockResolvedValue(entrega);

      await expect(
        procesarEventoGithub("push", {
          repository: { ...REPO_BASE, pushed_at: Number.MAX_VALUE },
          after: "abc123",
          sender: { login: "juan" },
        })
      ).rejects.toThrow(/pushed_at/);
      expect(mockActualizarActividad).not.toHaveBeenCalled();
    });

    it("no confía en head_commit.timestamp (fecha de autoría, no de push) para la actividad", async () => {
      const entrega = entregaConId("e1");
      mockGetEntregaByRepoName.mockResolvedValue(entrega);

      // Un commit rebaseado/cherry-pickeado puede traer un `head_commit`
      // arbitrariamente viejo — no forma parte del schema, así que no puede
      // influir en la fecha de actividad aunque venga en el payload.
      await procesarEventoGithub("push", {
        repository: { ...REPO_BASE, pushed_at: 1_700_000_000 },
        after: "abc123",
        sender: { login: "juancito" },
        head_commit: { timestamp: "2020-01-01T00:00:00Z" },
      });

      expect(mockActualizarActividad).toHaveBeenCalledWith(
        "e1",
        expect.objectContaining({ pusheadoEn: new Date(1_700_000_000 * 1000) }),
        mockTransaction
      );
    });

    it("serializa la escritura bajo el lock de la entrega", async () => {
      const entrega = entregaConId("e1");
      mockGetEntregaByRepoName.mockResolvedValue(entrega);

      await procesarEventoGithub("push", {
        repository: { ...REPO_BASE, pushed_at: 1_700_000_000 },
        after: "abc123",
        sender: { login: "juancito" },
      });

      expect(mockConLockDeEntrega).toHaveBeenCalledWith("e1", expect.any(Function));
    });

    it("ignora un push que borra un branch", async () => {
      const resultado = await procesarEventoGithub("push", {
        repository: REPO_BASE,
        deleted: true,
        after: "abc123",
        sender: { login: "juan" },
      });
      expect(resultado).toEqual({ estado: "ignorado" });
      expect(mockGetEntregaByRepoName).not.toHaveBeenCalled();
    });

    it("ignora un push con after en ceros (payload de borrado de branch)", async () => {
      const resultado = await procesarEventoGithub("push", {
        repository: REPO_BASE,
        after: "0000000000000000000000000000000000000000",
        sender: { login: "juan" },
      });
      expect(resultado).toEqual({ estado: "ignorado" });
      expect(mockGetEntregaByRepoName).not.toHaveBeenCalled();
    });
  });

  describe("repository", () => {
    it("marca el repo como borrado en repository.deleted", async () => {
      const entrega = entregaConId("e1");
      mockGetEntregaByRepoName.mockResolvedValue(entrega);

      const resultado = await procesarEventoGithub("repository", {
        action: "deleted",
        repository: REPO_BASE,
      });

      expect(resultado).toEqual({ estado: "procesado", entregaId: "e1" });
      expect(mockMarcarRepoBorrado).toHaveBeenCalledWith(
        "e1",
        undefined,
        mockTransaction
      );
    });

    it("pasa repository.updated_at como guard de orden a marcarRepoBorrado", async () => {
      const entrega = entregaConId("e1");
      mockGetEntregaByRepoName.mockResolvedValue(entrega);

      await procesarEventoGithub("repository", {
        action: "deleted",
        repository: { ...REPO_BASE, updated_at: 1_700_000_000 },
      });

      expect(mockMarcarRepoBorrado).toHaveBeenCalledWith(
        "e1",
        new Date(1_700_000_000 * 1000),
        mockTransaction
      );
    });

    it("busca por el nombre anterior en repository.renamed y reescribe repoName/repoUrl", async () => {
      const entrega = entregaConId("e1");
      mockGetEntregaByRepoName.mockResolvedValue(entrega);

      const resultado = await procesarEventoGithub("repository", {
        action: "renamed",
        repository: {
          name: "kata-juan-nuevo",
          owner: { login: "pdep-mn-utn" },
          html_url: "https://github.com/pdep-mn-utn/kata-juan-nuevo",
        },
        changes: { repository: { name: { from: "kata-juan-viejo" } } },
      });

      expect(mockGetEntregaByRepoName).toHaveBeenCalledWith("kata-juan-viejo");
      expect(mockRenombrarRepo).toHaveBeenCalledWith("e1", {
        repoName: "kata-juan-nuevo",
        repoUrl: "https://github.com/pdep-mn-utn/kata-juan-nuevo",
        eventoActualizadoEn: undefined,
      }, mockTransaction);
      expect(resultado).toEqual({ estado: "procesado", entregaId: "e1" });
    });

    it("ignora un renamed sin el nombre anterior y sin repository.id conocido en el payload", async () => {
      const resultado = await procesarEventoGithub("repository", {
        action: "renamed",
        repository: REPO_BASE,
      });
      expect(resultado).toEqual({ estado: "ignorado" });
      expect(mockGetEntregaByRepoName).not.toHaveBeenCalled();
    });

    it("ignora otras acciones (created, archived, etc.)", async () => {
      const resultado = await procesarEventoGithub("repository", {
        action: "archived",
        repository: REPO_BASE,
      });
      expect(resultado).toEqual({ estado: "ignorado" });
      expect(mockGetEntregaByRepoName).not.toHaveBeenCalled();
    });

    describe("resolución por repository.id (issue #60: robusta al orden de renames)", () => {
      it("con repoGithubId conocido, resuelve por id y ni siquiera necesita el nombre anterior", async () => {
        const entrega = entregaConId("e1");
        mockGetEntregaPorRepoGithubId.mockResolvedValue(entrega);

        // Simula exactamente el escenario reportado: un rename B→C llega
        // ANTES que A→B. Si sólo buscáramos por `changes...from` ("B") y la
        // entrega en DB todavía dijera "A", este evento se perdería. Con el
        // id ya conocido (self-healed por un webhook anterior), se
        // encuentra igual.
        const resultado = await procesarEventoGithub("repository", {
          action: "renamed",
          repository: {
            name: "C",
            owner: { login: "pdep-mn-utn" },
            id: 555,
          },
          changes: { repository: { name: { from: "B" } } },
        });

        expect(mockGetEntregaPorRepoGithubId).toHaveBeenCalledWith("555");
        expect(mockGetEntregaByRepoName).not.toHaveBeenCalled();
        expect(mockRenombrarRepo).toHaveBeenCalledWith(
          "e1",
          expect.objectContaining({ repoName: "C" }),
          mockTransaction
        );
        expect(resultado).toEqual({ estado: "procesado", entregaId: "e1" });
      });

      it("reconcilia el nombre/URL actuales por id en vez de confiar en el payload — corrige renames desordenados con el mismo updated_at", async () => {
        const entrega = entregaConId("e1");
        mockGetEntregaPorRepoGithubId.mockResolvedValue(entrega);
        // El payload de este renamed dice "B" (sería el evento A→B, entregado
        // DESPUÉS del B→C real pero con el mismo updated_at de resolución de
        // un segundo). GitHub ya está en "C" — reconciliar por id evita que
        // este evento, más viejo en la realidad pero procesado último, pise
        // el nombre correcto con uno desactualizado.
        mockGetRepoInfoPorId.mockResolvedValue({
          repoName: "C",
          repoUrl: "https://github.com/pdep-mn-utn/C",
        });

        await procesarEventoGithub("repository", {
          action: "renamed",
          repository: {
            name: "B",
            owner: { login: "pdep-mn-utn" },
            id: 555,
            html_url: "https://github.com/pdep-mn-utn/B",
          },
          changes: { repository: { name: { from: "A" } } },
        });

        expect(mockGetRepoInfoPorId).toHaveBeenCalledWith("555");
        expect(mockRenombrarRepo).toHaveBeenCalledWith(
          "e1",
          expect.objectContaining({
            repoName: "C",
            repoUrl: "https://github.com/pdep-mn-utn/C",
          }),
          mockTransaction
        );
      });

      it("sin dato de reconciliación (getRepoInfoPorId devuelve null), usa el nombre/URL del propio payload", async () => {
        const entrega = entregaConId("e1");
        mockGetEntregaPorRepoGithubId.mockResolvedValue(entrega);
        mockGetRepoInfoPorId.mockResolvedValue(null);

        await procesarEventoGithub("repository", {
          action: "renamed",
          repository: {
            name: "kata-juan-nuevo",
            owner: { login: "pdep-mn-utn" },
            id: 555,
            html_url: "https://github.com/pdep-mn-utn/kata-juan-nuevo",
          },
          changes: { repository: { name: { from: "kata-juan-viejo" } } },
        });

        expect(mockRenombrarRepo).toHaveBeenCalledWith(
          "e1",
          expect.objectContaining({
            repoName: "kata-juan-nuevo",
            repoUrl: "https://github.com/pdep-mn-utn/kata-juan-nuevo",
          }),
          mockTransaction
        );
      });

      it("si el id todavía no se conoce, cae al lookup por nombre anterior", async () => {
        const entrega = entregaConId("e1");
        mockGetEntregaPorRepoGithubId.mockResolvedValue(null);
        mockGetEntregaByRepoName.mockResolvedValue(entrega);

        await procesarEventoGithub("repository", {
          action: "renamed",
          repository: { name: "kata-juan-nuevo", owner: { login: "pdep-mn-utn" }, id: 555 },
          changes: { repository: { name: { from: "kata-juan-viejo" } } },
        });

        expect(mockGetEntregaPorRepoGithubId).toHaveBeenCalledWith("555");
        expect(mockGetEntregaByRepoName).toHaveBeenCalledWith("kata-juan-viejo");
      });

      it("autocompleta (self-heal) repoGithubId la primera vez que se conoce", async () => {
        const entrega = entregaConId("e1");
        entrega.repoGithubId = undefined;
        mockGetEntregaByRepoName.mockResolvedValue(entrega);

        await procesarEventoGithub("repository", {
          action: "deleted",
          repository: { ...REPO_BASE, id: 555 },
        });

        expect(mockAsegurarRepoGithubId).toHaveBeenCalledWith("e1", "555");
      });

      it("no reescribe repoGithubId si la entrega ya lo tenía (self-heal es idempotente/no redundante)", async () => {
        const entrega = entregaConId("e1");
        entrega.repoGithubId = "555";
        mockGetEntregaByRepoName.mockResolvedValue(entrega);

        await procesarEventoGithub("repository", {
          action: "deleted",
          repository: { ...REPO_BASE, id: 555 },
        });

        expect(mockAsegurarRepoGithubId).not.toHaveBeenCalled();
      });

      it("check_suite/push/member también autocompletan repoGithubId al resolver por nombre", async () => {
        const entrega = entregaConId("e1");
        mockGetEntregaByRepoName.mockResolvedValue(entrega);
        mockSincronizarCI.mockResolvedValue({ actualizadas: 1, omitidas: 0, fallidas: [] });

        await procesarEventoGithub("check_suite", {
          action: "completed",
          repository: { ...REPO_BASE, id: 777 },
        });

        expect(mockAsegurarRepoGithubId).toHaveBeenCalledWith("e1", "777");
      });

      it("rechaza el fallback por nombre si la entrega encontrada ya tiene un repoGithubId distinto (repo borrado y recreado con el mismo nombre)", async () => {
        // La entrega vieja quedó con el nombre "kata-juan" (repoDeleted true
        // o no, da igual acá) y su repoGithubId original ya seteado. Llega
        // un evento de un repo NUEVO, con otro id, que casualmente se llama
        // igual — no es el mismo repo, no debe tocar la entrega vieja.
        const entregaVieja = entregaConId("e1");
        entregaVieja.repoGithubId = "111";
        mockGetEntregaPorRepoGithubId.mockResolvedValue(null); // el id nuevo (999) no se conoce
        mockGetEntregaByRepoName.mockResolvedValue(entregaVieja);

        const resultado = await procesarEventoGithub("check_suite", {
          action: "completed",
          repository: { ...REPO_BASE, id: 999 },
        });

        expect(resultado).toEqual({ estado: "ignorado" });
        expect(mockAsegurarRepoGithubId).not.toHaveBeenCalled();
        expect(mockSincronizarCI).not.toHaveBeenCalled();
      });

      it("si la entrega encontrada por nombre no tiene repoGithubId todavía, la adopta igual (self-heal normal)", async () => {
        const entrega = entregaConId("e1");
        entrega.repoGithubId = undefined;
        mockGetEntregaPorRepoGithubId.mockResolvedValue(null);
        mockGetEntregaByRepoName.mockResolvedValue(entrega);
        mockSincronizarCI.mockResolvedValue({ actualizadas: 1, omitidas: 0, fallidas: [] });

        const resultado = await procesarEventoGithub("check_suite", {
          action: "completed",
          repository: { ...REPO_BASE, id: 999 },
        });

        expect(resultado).toEqual({ estado: "procesado", entregaId: "e1" });
        expect(mockAsegurarRepoGithubId).toHaveBeenCalledWith("e1", "999");
      });
    });
  });

  describe("member", () => {
    it("agrega el colaborador si GitHub confirma que lo es ahora y es un alumno conocido", async () => {
      const entrega = entregaConId("e1");
      mockGetEntregaByRepoName.mockResolvedValue(entrega);
      mockEsColaborador.mockResolvedValue(true);
      mockGetAlumnoByGithub.mockResolvedValue({ id: "a1" });

      const resultado = await procesarEventoGithub("member", {
        action: "added",
        member: { login: "juancito" },
        repository: REPO_BASE,
      });

      expect(mockEsColaborador).toHaveBeenCalledWith("kata-juan", "juancito");
      expect(mockActualizarColaboradores).toHaveBeenCalledWith(
        "e1",
        { agregar: "juancito" },
        mockTransaction
      );
      expect(mockGetAlumnoByGithub).toHaveBeenCalledWith(
        "juancito",
        false,
        mockTransaction
      );
      expect(resultado).toEqual({ estado: "procesado", entregaId: "e1" });
    });

    it("no agrega si el colaborador no es un alumno conocido (ej. un docente)", async () => {
      const entrega = entregaConId("e1");
      mockGetEntregaByRepoName.mockResolvedValue(entrega);
      mockEsColaborador.mockResolvedValue(true);
      mockGetAlumnoByGithub.mockResolvedValue(null);

      const resultado = await procesarEventoGithub("member", {
        action: "added",
        member: { login: "docente" },
        repository: REPO_BASE,
      });

      expect(mockActualizarColaboradores).not.toHaveBeenCalled();
      expect(resultado).toEqual({ estado: "ignorado", entregaId: "e1" });
    });

    it("quita el colaborador cuando GitHub confirma que ya no lo es, sin necesitar chequear si es alumno", async () => {
      const entrega = entregaConId("e1");
      mockGetEntregaByRepoName.mockResolvedValue(entrega);
      mockEsColaborador.mockResolvedValue(false);

      const resultado = await procesarEventoGithub("member", {
        action: "removed",
        member: { login: "juancito" },
        repository: REPO_BASE,
      });

      expect(mockActualizarColaboradores).toHaveBeenCalledWith(
        "e1",
        { quitar: "juancito" },
        mockTransaction
      );
      expect(mockGetAlumnoByGithub).not.toHaveBeenCalled();
      expect(resultado).toEqual({ estado: "procesado", entregaId: "e1" });
    });

    it("un 'removed' fuera de orden que llegó después de un alta más reciente termina agregando (reconcilia, no confía en el delta)", async () => {
      const entrega = entregaConId("e1");
      mockGetEntregaByRepoName.mockResolvedValue(entrega);
      // GitHub dice que sigue siendo colaborador — el payload dice "removed",
      // pero llegó desordenado respecto de un `added` posterior real.
      mockEsColaborador.mockResolvedValue(true);
      mockGetAlumnoByGithub.mockResolvedValue({ id: "a1" });

      const resultado = await procesarEventoGithub("member", {
        action: "removed",
        member: { login: "juancito" },
        repository: REPO_BASE,
      });

      expect(mockActualizarColaboradores).toHaveBeenCalledWith(
        "e1",
        { agregar: "juancito" },
        mockTransaction
      );
      expect(resultado).toEqual({ estado: "procesado", entregaId: "e1" });
    });

    it("un 'added' fuera de orden que llegó después de una baja más reciente termina quitando (reconcilia, no confía en el delta)", async () => {
      const entrega = entregaConId("e1");
      mockGetEntregaByRepoName.mockResolvedValue(entrega);
      // GitHub dice que ya no es colaborador — el payload dice "added", pero
      // llegó desordenado respecto de un `removed` posterior real.
      mockEsColaborador.mockResolvedValue(false);

      const resultado = await procesarEventoGithub("member", {
        action: "added",
        member: { login: "juancito" },
        repository: REPO_BASE,
      });

      expect(mockActualizarColaboradores).toHaveBeenCalledWith(
        "e1",
        { quitar: "juancito" },
        mockTransaction
      );
      expect(mockGetAlumnoByGithub).not.toHaveBeenCalled();
      expect(resultado).toEqual({ estado: "procesado", entregaId: "e1" });
    });

    it("ignora otras acciones (ej. edited)", async () => {
      const resultado = await procesarEventoGithub("member", {
        action: "edited",
        member: { login: "juancito" },
        repository: REPO_BASE,
      });
      expect(resultado).toEqual({ estado: "ignorado" });
      expect(mockGetEntregaByRepoName).not.toHaveBeenCalled();
      expect(mockEsColaborador).not.toHaveBeenCalled();
    });

    it("serializa la reconciliación bajo el lock de la entrega", async () => {
      const entrega = entregaConId("e1");
      mockGetEntregaByRepoName.mockResolvedValue(entrega);
      mockEsColaborador.mockResolvedValue(true);
      mockGetAlumnoByGithub.mockResolvedValue({ id: "a1" });

      await procesarEventoGithub("member", {
        action: "added",
        member: { login: "juancito" },
        repository: REPO_BASE,
      });

      expect(mockConLockDeEntrega).toHaveBeenCalledWith("e1", expect.any(Function));
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEm = {
  find: vi.fn(),
  findOne: vi.fn(),
  count: vi.fn(),
  persist: vi.fn(),
  flush: vi.fn(),
};

const mockEsResponsableDeEntorno = vi.fn();

vi.mock("@/infrastructure/db", () => ({
  getEM: vi.fn(async () => mockEm),
}));

// Por default nadie es responsable de entorno — cada test que necesite el
// caso protegido lo pisa con mockReturnValue(true).
vi.mock("@/lib/responsables-de-entorno", () => ({
  esResponsableDeEntorno: (githubUsername: string) => mockEsResponsableDeEntorno(githubUsername),
}));

import {
  getDocentes,
  hayDocenteActivo,
  crearDocente,
  renombrarDocente,
  cambiarEstadoDocente,
  DocenteDuplicadoError,
  DocenteNoEncontradoError,
  DocenteProtegidoError,
} from "./DocenteRepository";
import { Docente, DocenteInvalidoError } from "@/domain/entities";

function usernameUniqueViolation(): Error {
  return Object.assign(
    new Error(
      'duplicate key value violates unique constraint "docente_github_username_unique_idx"'
    ),
    { code: "23505" }
  );
}

describe("DocenteRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEsResponsableDeEntorno.mockReturnValue(false);
  });

  describe("getDocentes", () => {
    it("consulta ordenado por githubUsername ascendente", async () => {
      mockEm.find.mockResolvedValue([]);
      await getDocentes();
      expect(mockEm.find).toHaveBeenCalledWith(
        Docente,
        {},
        { orderBy: { githubUsername: "ASC" } }
      );
    });
  });

  describe("hayDocenteActivo", () => {
    it("normaliza el username y filtra por activo=true", async () => {
      mockEm.count.mockResolvedValue(1);
      const resultado = await hayDocenteActivo(" @Ayudante1 ");
      expect(mockEm.count).toHaveBeenCalledWith(Docente, {
        githubUsername: "ayudante1",
        activo: true,
      });
      expect(resultado).toBe(true);
    });

    it("devuelve false si count es 0", async () => {
      mockEm.count.mockResolvedValue(0);
      expect(await hayDocenteActivo("ayudante1")).toBe(false);
    });
  });

  describe("crearDocente", () => {
    it("persiste y flushea un docente nuevo", async () => {
      mockEm.flush.mockResolvedValue(undefined);

      const docente = await crearDocente({
        githubUsername: "ayudante1",
        nombre: "Ana",
        porUsuario: "juancete",
      });

      expect(mockEm.persist).toHaveBeenCalledWith(docente);
      expect(mockEm.flush).toHaveBeenCalled();
      expect(docente.githubUsername).toBe("ayudante1");
    });

    // Regresión del parche de `em.create` (issue #90): esa versión salteaba
    // `Docente.crear` y con eso `validarAlta` y el trim de nombre.
    // Acá se cubre que la instancia persistida vuelve a salir del factory de
    // dominio.
    it("construye la instancia con Docente.crear (no con entityManager.create)", async () => {
      mockEm.flush.mockResolvedValue(undefined);

      const docente = await crearDocente({
        githubUsername: "ayudante1",
        nombre: "  Ana  ",
        porUsuario: "juancete",
      });

      expect(docente).toBeInstanceOf(Docente);
      expect(docente.nombre).toBe("Ana");
      expect(docente.activo).toBe(true);
      expect(docente.creadoPor).toBe("juancete");
      expect(docente.modificadoPor).toBe("juancete");
    });

    it("un nombre vacío o sólo espacios queda como null (no como string vacío)", async () => {
      mockEm.flush.mockResolvedValue(undefined);

      const docente = await crearDocente({
        githubUsername: "ayudante2",
        nombre: "   ",
        porUsuario: "juancete",
      });

      expect(docente.nombre).toBeNull();
    });

    it("lanza DocenteInvalidoError si el username no tiene un formato válido, sin persistir ni flushear", async () => {
      await expect(
        crearDocente({ githubUsername: "", porUsuario: "juancete" })
      ).rejects.toBeInstanceOf(DocenteInvalidoError);
      expect(mockEm.persist).not.toHaveBeenCalled();
      expect(mockEm.flush).not.toHaveBeenCalled();
    });

    it("traduce la violación única a DocenteDuplicadoError (existente activo)", async () => {
      mockEm.flush.mockRejectedValueOnce(usernameUniqueViolation());
      mockEm.findOne.mockResolvedValue(Object.assign(new Docente("ayudante1"), { activo: true }));

      const error = await crearDocente({
        githubUsername: "ayudante1",
        porUsuario: "juancete",
      }).catch((caught) => caught);

      expect(error).toBeInstanceOf(DocenteDuplicadoError);
      expect((error as InstanceType<typeof DocenteDuplicadoError>).existenteInactivo).toBe(false);
    });

    it("señala en el error si el existente está inactivo (para que la UI ofrezca reactivar)", async () => {
      mockEm.flush.mockRejectedValueOnce(usernameUniqueViolation());
      mockEm.findOne.mockResolvedValue(Object.assign(new Docente("ayudante1"), { activo: false }));

      const error = await crearDocente({
        githubUsername: "ayudante1",
        porUsuario: "juancete",
      }).catch((caught) => caught);

      expect(error).toBeInstanceOf(DocenteDuplicadoError);
      expect((error as InstanceType<typeof DocenteDuplicadoError>).existenteInactivo).toBe(true);
    });

    it("propaga cualquier otro error sin traducirlo", async () => {
      mockEm.flush.mockRejectedValueOnce(new Error("otra falla"));
      await expect(
        crearDocente({ githubUsername: "ayudante1", porUsuario: "juancete" })
      ).rejects.toThrow("otra falla");
    });

    it("lanza DocenteProtegidoError si el username ya es responsable de entorno, sin persistir ni flushear", async () => {
      mockEsResponsableDeEntorno.mockReturnValue(true);

      await expect(
        crearDocente({ githubUsername: "juancete", porUsuario: "otro-responsable" })
      ).rejects.toBeInstanceOf(DocenteProtegidoError);
      expect(mockEm.persist).not.toHaveBeenCalled();
      expect(mockEm.flush).not.toHaveBeenCalled();
    });
  });

  describe("renombrarDocente", () => {
    it("lanza DocenteNoEncontradoError si no existe", async () => {
      mockEm.findOne.mockResolvedValue(null);
      await expect(renombrarDocente("id-x", "Nuevo", "juancete")).rejects.toBeInstanceOf(
        DocenteNoEncontradoError
      );
    });

    it("delega en docente.renombrar y flushea", async () => {
      const docente = Docente.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
      mockEm.findOne.mockResolvedValue(docente);

      await renombrarDocente(docente.id, "Nuevo Nombre", "otro-responsable");

      expect(docente.nombre).toBe("Nuevo Nombre");
      expect(docente.modificadoPor).toBe("otro-responsable");
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it("lanza DocenteProtegidoError si el docente ahora es responsable de entorno, sin flushear", async () => {
      const docente = Docente.crear({ githubUsername: "juancete", porUsuario: "juancete" });
      mockEm.findOne.mockResolvedValue(docente);
      mockEsResponsableDeEntorno.mockReturnValue(true);

      await expect(
        renombrarDocente(docente.id, "Nuevo Nombre", "otro-responsable")
      ).rejects.toBeInstanceOf(DocenteProtegidoError);
      expect(mockEm.flush).not.toHaveBeenCalled();
    });
  });

  describe("cambiarEstadoDocente", () => {
    it("lanza DocenteNoEncontradoError si no existe", async () => {
      mockEm.findOne.mockResolvedValue(null);
      await expect(
        cambiarEstadoDocente("id-x", false, "juancete")
      ).rejects.toBeInstanceOf(DocenteNoEncontradoError);
    });

    it("desactiva cuando activo=false", async () => {
      const docente = Docente.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
      mockEm.findOne.mockResolvedValue(docente);

      await cambiarEstadoDocente(docente.id, false, "otro-responsable");

      expect(docente.activo).toBe(false);
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it("reactiva cuando activo=true", async () => {
      const docente = Docente.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
      docente.desactivar("juancete");
      mockEm.findOne.mockResolvedValue(docente);

      await cambiarEstadoDocente(docente.id, true, "otro-responsable");

      expect(docente.activo).toBe(true);
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it("lanza DocenteProtegidoError si el docente ahora es responsable de entorno, sin flushear", async () => {
      const docente = Docente.crear({ githubUsername: "juancete", porUsuario: "juancete" });
      mockEm.findOne.mockResolvedValue(docente);
      mockEsResponsableDeEntorno.mockReturnValue(true);

      await expect(
        cambiarEstadoDocente(docente.id, false, "otro-responsable")
      ).rejects.toBeInstanceOf(DocenteProtegidoError);
      expect(mockEm.flush).not.toHaveBeenCalled();
    });
  });
});

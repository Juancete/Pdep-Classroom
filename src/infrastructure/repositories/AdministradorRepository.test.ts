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
  getAdministradores,
  hayAdministradorActivo,
  crearAdministrador,
  renombrarAdministrador,
  cambiarEstadoAdministrador,
  AdministradorDuplicadoError,
  AdministradorNoEncontradoError,
  AdministradorProtegidoError,
} from "./AdministradorRepository";
import { Administrador } from "@/domain/entities";

function usernameUniqueViolation(): Error {
  return Object.assign(
    new Error(
      'duplicate key value violates unique constraint "administrador_github_username_unique_idx"'
    ),
    { code: "23505" }
  );
}

describe("AdministradorRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEsResponsableDeEntorno.mockReturnValue(false);
  });

  describe("getAdministradores", () => {
    it("consulta ordenado por githubUsername ascendente", async () => {
      mockEm.find.mockResolvedValue([]);
      await getAdministradores();
      expect(mockEm.find).toHaveBeenCalledWith(
        Administrador,
        {},
        { orderBy: { githubUsername: "ASC" } }
      );
    });
  });

  describe("hayAdministradorActivo", () => {
    it("normaliza el username y filtra por activo=true", async () => {
      mockEm.count.mockResolvedValue(1);
      const resultado = await hayAdministradorActivo(" @Ayudante1 ");
      expect(mockEm.count).toHaveBeenCalledWith(Administrador, {
        githubUsername: "ayudante1",
        activo: true,
      });
      expect(resultado).toBe(true);
    });

    it("devuelve false si count es 0", async () => {
      mockEm.count.mockResolvedValue(0);
      expect(await hayAdministradorActivo("ayudante1")).toBe(false);
    });
  });

  describe("crearAdministrador", () => {
    it("persiste y flushea un administrador nuevo", async () => {
      mockEm.flush.mockResolvedValue(undefined);

      const administrador = await crearAdministrador({
        githubUsername: "ayudante1",
        nombre: "Ana",
        porUsuario: "juancete",
      });

      expect(mockEm.persist).toHaveBeenCalledWith(administrador);
      expect(mockEm.flush).toHaveBeenCalled();
      expect(administrador.githubUsername).toBe("ayudante1");
    });

    it("traduce la violación única a AdministradorDuplicadoError (existente activo)", async () => {
      mockEm.flush.mockRejectedValueOnce(usernameUniqueViolation());
      mockEm.findOne.mockResolvedValue(Object.assign(new Administrador("ayudante1"), { activo: true }));

      const error = await crearAdministrador({
        githubUsername: "ayudante1",
        porUsuario: "juancete",
      }).catch((caught) => caught);

      expect(error).toBeInstanceOf(AdministradorDuplicadoError);
      expect((error as InstanceType<typeof AdministradorDuplicadoError>).existenteInactivo).toBe(false);
    });

    it("señala en el error si el existente está inactivo (para que la UI ofrezca reactivar)", async () => {
      mockEm.flush.mockRejectedValueOnce(usernameUniqueViolation());
      mockEm.findOne.mockResolvedValue(Object.assign(new Administrador("ayudante1"), { activo: false }));

      const error = await crearAdministrador({
        githubUsername: "ayudante1",
        porUsuario: "juancete",
      }).catch((caught) => caught);

      expect(error).toBeInstanceOf(AdministradorDuplicadoError);
      expect((error as InstanceType<typeof AdministradorDuplicadoError>).existenteInactivo).toBe(true);
    });

    it("propaga cualquier otro error sin traducirlo", async () => {
      mockEm.flush.mockRejectedValueOnce(new Error("otra falla"));
      await expect(
        crearAdministrador({ githubUsername: "ayudante1", porUsuario: "juancete" })
      ).rejects.toThrow("otra falla");
    });

    it("lanza AdministradorProtegidoError si el username ya es responsable de entorno, sin persistir ni flushear", async () => {
      mockEsResponsableDeEntorno.mockReturnValue(true);

      await expect(
        crearAdministrador({ githubUsername: "juancete", porUsuario: "otro-responsable" })
      ).rejects.toBeInstanceOf(AdministradorProtegidoError);
      expect(mockEm.persist).not.toHaveBeenCalled();
      expect(mockEm.flush).not.toHaveBeenCalled();
    });
  });

  describe("renombrarAdministrador", () => {
    it("lanza AdministradorNoEncontradoError si no existe", async () => {
      mockEm.findOne.mockResolvedValue(null);
      await expect(renombrarAdministrador("id-x", "Nuevo", "juancete")).rejects.toBeInstanceOf(
        AdministradorNoEncontradoError
      );
    });

    it("delega en administrador.renombrar y flushea", async () => {
      const administrador = Administrador.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
      mockEm.findOne.mockResolvedValue(administrador);

      await renombrarAdministrador(administrador.id, "Nuevo Nombre", "otro-responsable");

      expect(administrador.nombre).toBe("Nuevo Nombre");
      expect(administrador.modificadoPor).toBe("otro-responsable");
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it("lanza AdministradorProtegidoError si el administrador ahora es responsable de entorno, sin flushear", async () => {
      const administrador = Administrador.crear({ githubUsername: "juancete", porUsuario: "juancete" });
      mockEm.findOne.mockResolvedValue(administrador);
      mockEsResponsableDeEntorno.mockReturnValue(true);

      await expect(
        renombrarAdministrador(administrador.id, "Nuevo Nombre", "otro-responsable")
      ).rejects.toBeInstanceOf(AdministradorProtegidoError);
      expect(mockEm.flush).not.toHaveBeenCalled();
    });
  });

  describe("cambiarEstadoAdministrador", () => {
    it("lanza AdministradorNoEncontradoError si no existe", async () => {
      mockEm.findOne.mockResolvedValue(null);
      await expect(
        cambiarEstadoAdministrador("id-x", false, "juancete")
      ).rejects.toBeInstanceOf(AdministradorNoEncontradoError);
    });

    it("desactiva cuando activo=false", async () => {
      const administrador = Administrador.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
      mockEm.findOne.mockResolvedValue(administrador);

      await cambiarEstadoAdministrador(administrador.id, false, "otro-responsable");

      expect(administrador.activo).toBe(false);
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it("reactiva cuando activo=true", async () => {
      const administrador = Administrador.crear({ githubUsername: "ayudante1", porUsuario: "juancete" });
      administrador.desactivar("juancete");
      mockEm.findOne.mockResolvedValue(administrador);

      await cambiarEstadoAdministrador(administrador.id, true, "otro-responsable");

      expect(administrador.activo).toBe(true);
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it("lanza AdministradorProtegidoError si el administrador ahora es responsable de entorno, sin flushear", async () => {
      const administrador = Administrador.crear({ githubUsername: "juancete", porUsuario: "juancete" });
      mockEm.findOne.mockResolvedValue(administrador);
      mockEsResponsableDeEntorno.mockReturnValue(true);

      await expect(
        cambiarEstadoAdministrador(administrador.id, false, "otro-responsable")
      ).rejects.toBeInstanceOf(AdministradorProtegidoError);
      expect(mockEm.flush).not.toHaveBeenCalled();
    });
  });
});

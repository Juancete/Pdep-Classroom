import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PdepUser } from "@/types";
import { Alumno, ESTUDIANTE } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockAuth = vi.fn();
const mockGetAlumnoDeSheets = vi.fn();
const mockGetAlumnoDeDB = vi.fn();
const mockGetComisionActiva = vi.fn();
const mockRedirect = vi.fn().mockImplementation((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/sheets", () => ({
  getAlumnoByGithub: (...args: unknown[]) => mockGetAlumnoDeSheets(...args),
}));

vi.mock("@/lib/repositories", () => ({
  getAlumnoByGithub: (...args: unknown[]) => mockGetAlumnoDeDB(...args),
  getComisionActiva: () => mockGetComisionActiva(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock("@/app/components/AlumnoForm", () => ({
  AlumnoForm: ({
    defaultValues,
    submitLabel,
  }: {
    defaultValues: { githubUsername: string; email: string; nombre: string; apellido: string; legajo?: string };
    submitLabel: string;
  }) => (
    <div
      data-testid="alumno-form"
      data-github={defaultValues.githubUsername}
      data-email={defaultValues.email}
      data-nombre={defaultValues.nombre}
      data-apellido={defaultValues.apellido}
      data-legajo={defaultValues.legajo ?? ""}
      data-submit-label={submitLabel}
    />
  ),
}));

import RegistroPage from "./page";

// ── Helpers ──────────────────────────────────────────────────

function makeAlumnoDB(overrides: Partial<Alumno> = {}): Alumno {
  const alumno = new Alumno();
  alumno.legajo = "12345";
  alumno.nombre = "Juan";
  alumno.apellido = "G";
  alumno.githubUsername = "juan";
  alumno.email = "juan@mail.com";
  alumno.gruposSyncFallidoEn = null;
  alumno.alumnoSyncFallidoEn = null;
  return Object.assign(alumno, overrides);
}

function makeSession(githubUsername: string, overrides?: Partial<PdepUser>) {
  const pdepUser: PdepUser = {
    githubUsername,
    name: "Test User",
    image: "",
    rol: ESTUDIANTE,
    ...overrides,
  };
  return {
    pdepUser,
    user: { email: "test@example.com", name: "Test User" },
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("Registro page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
    mockGetComisionActiva.mockResolvedValue(null);
    mockGetAlumnoDeDB.mockResolvedValue(null);
    mockGetAlumnoDeSheets.mockResolvedValue(null);
  });

  describe("redirecciones", () => {
    it("redirige a /login si no hay sesión", async () => {
      mockAuth.mockResolvedValue(null);

      await expect(RegistroPage()).rejects.toThrow("REDIRECT:/login");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("redirige a /dashboard si el alumno ya confirmó sus datos para la comisión activa", async () => {
      const comision = { id: "c1", spreadsheetId: "s1", columnConfig: null };
      mockGetComisionActiva.mockResolvedValue(comision);
      mockAuth.mockResolvedValue(makeSession("juan"));
      mockGetAlumnoDeDB.mockResolvedValue(
        makeAlumnoDB({ registroConfirmadoEn: { id: "c1" } as any })
      );

      await expect(RegistroPage()).rejects.toThrow("REDIRECT:/dashboard");
    });

    it("NO redirige a /dashboard si el alumno confirmó en una comisión distinta (recursante)", async () => {
      const comision = { id: "c2", spreadsheetId: "s1", columnConfig: null };
      mockGetComisionActiva.mockResolvedValue(comision);
      mockAuth.mockResolvedValue(makeSession("juan"));
      mockGetAlumnoDeDB.mockResolvedValue(
        makeAlumnoDB({ registroConfirmadoEn: { id: "c1" } as any })
      );

      await RegistroPage();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("NO redirige a /dashboard si el alumno nunca confirmó (registroConfirmadoEn null)", async () => {
      const comision = { id: "c1", spreadsheetId: "s1", columnConfig: null };
      mockGetComisionActiva.mockResolvedValue(comision);
      mockAuth.mockResolvedValue(makeSession("juan"));
      mockGetAlumnoDeDB.mockResolvedValue(
        makeAlumnoDB({ registroConfirmadoEn: undefined })
      );

      await RegistroPage();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("NO redirige si no hay comisión activa aunque el alumno exista en DB", async () => {
      mockGetComisionActiva.mockResolvedValue(null);
      mockAuth.mockResolvedValue(makeSession("juan"));
      mockGetAlumnoDeDB.mockResolvedValue(makeAlumnoDB());

      await RegistroPage();
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });

  describe("prefill del formulario", () => {
    it("usa los datos de DB cuando el alumno existe (recursante — gana DB)", async () => {
      const comision = { id: "c2", spreadsheetId: "s1", columnConfig: null };
      mockGetComisionActiva.mockResolvedValue(comision);
      mockAuth.mockResolvedValue(makeSession("juan"));
      mockGetAlumnoDeDB.mockResolvedValue(
        makeAlumnoDB({
          legajo: "99999",
          nombre: "Juan Carlos",
          apellido: "García",
          githubUsername: "juan",
          email: "personal@gmail.com",
          registroConfirmadoEn: { id: "c1" } as any,
        })
      );
      // Sheets tiene otro email y otro legajo (el admin rearmó la planilla) — debe ganar DB
      mockGetAlumnoDeSheets.mockResolvedValue({
        legajo: "11111",
        nombre: "Juan",
        apellido: "G",
        githubUsername: "juan",
        email: "institucional@utn.edu.ar",
      });

      const element = await RegistroPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-legajo="99999"');
      expect(html).toContain('data-email="personal@gmail.com"');
      expect(html).toContain('data-nombre="Juan Carlos"');
      expect(html).toContain('data-apellido="García"');
    });

    it("usa los datos de Sheets cuando no hay DB (nuevo alumno pre-cargado por admin)", async () => {
      const comision = { id: "c1", spreadsheetId: "s1", columnConfig: null };
      mockGetComisionActiva.mockResolvedValue(comision);
      mockAuth.mockResolvedValue(makeSession("nuevo"));
      mockGetAlumnoDeDB.mockResolvedValue(null);
      mockGetAlumnoDeSheets.mockResolvedValue({
        legajo: "54321",
        nombre: "María",
        apellido: "Pérez",
        githubUsername: "nuevo",
        email: "maria@utn.edu.ar",
      });

      const element = await RegistroPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-legajo="54321"');
      expect(html).toContain('data-email="maria@utn.edu.ar"');
      expect(html).toContain('data-nombre="María"');
      expect(html).toContain('data-apellido="Pérez"');
    });

    it("cae a la sesión cuando no hay DB ni Sheets (nuevo sin pre-carga)", async () => {
      mockGetComisionActiva.mockResolvedValue(null);
      mockAuth.mockResolvedValue(makeSession("nuevouser"));
      mockGetAlumnoDeDB.mockResolvedValue(null);
      mockGetAlumnoDeSheets.mockResolvedValue(null);

      const element = await RegistroPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-github="nuevouser"');
      expect(html).toContain('data-email="test@example.com"');
      expect(html).toContain('data-nombre="Test"');
      expect(html).toContain('data-apellido="User"');
      expect(html).toContain('data-legajo=""');
    });

    it("no crashea si el nombre de sesión está vacío", async () => {
      const session = makeSession("nuevouser");
      session.user.name = "";
      mockAuth.mockResolvedValue(session);
      mockGetAlumnoDeDB.mockResolvedValue(null);
      mockGetAlumnoDeSheets.mockResolvedValue(null);

      const element = await RegistroPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-nombre=""');
      expect(html).toContain('data-apellido=""');
    });
  });

  describe("copy y submit label", () => {
    it("muestra 'Registrarme' para alumno nuevo", async () => {
      mockAuth.mockResolvedValue(makeSession("nuevo"));
      mockGetAlumnoDeDB.mockResolvedValue(null);

      const element = await RegistroPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-submit-label="Registrarme"');
      expect(html).toContain("Completá tus datos");
    });

    it("muestra 'Confirmar datos' para recursante (ya está en DB pero no confirmó esta comisión)", async () => {
      const comision = { id: "c2", spreadsheetId: "s1", columnConfig: null };
      mockGetComisionActiva.mockResolvedValue(comision);
      mockAuth.mockResolvedValue(makeSession("juan"));
      mockGetAlumnoDeDB.mockResolvedValue(
        makeAlumnoDB({ registroConfirmadoEn: { id: "c1" } as any })
      );

      const element = await RegistroPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-submit-label="Confirmar datos"');
      expect(html).toContain("Confirmá tus datos");
    });
  });

  describe("consulta a Sheets", () => {
    it("consulta Sheets con el spreadsheetId y columnConfig de la comisión activa", async () => {
      const comision = {
        id: "c1",
        spreadsheetId: "sheet-xyz",
        columnConfig: { sheetName: "Alumnos", headerRows: 1, legajo: 0, apellido: 1, nombre: 2, githubUsername: 3, email: 4 },
      };
      mockGetComisionActiva.mockResolvedValue(comision);
      mockAuth.mockResolvedValue(makeSession("nuevouser"));

      await RegistroPage();

      expect(mockGetAlumnoDeSheets).toHaveBeenCalledWith(
        "nuevouser",
        "sheet-xyz",
        comision.columnConfig
      );
    });

    it("consulta la DB con el username de la sesión", async () => {
      mockAuth.mockResolvedValue(makeSession("miuser"));

      await RegistroPage();
      expect(mockGetAlumnoDeDB).toHaveBeenCalledWith("miuser");
    });
  });
});

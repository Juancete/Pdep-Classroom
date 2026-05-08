import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockGetComisionActiva = vi.fn();
const mockVerificarConsistenciaAlumno = vi.fn();

vi.mock("./repositories", () => ({
  getComisionActiva: () => mockGetComisionActiva(),
}));

vi.mock("./services/verificarConsistenciaAlumno", () => ({
  verificarConsistenciaAlumno: (...args: unknown[]) =>
    mockVerificarConsistenciaAlumno(...args),
}));

import { onSignIn } from "./auth.events";

const comision = { id: "c1", spreadsheetId: "sheet-xyz" };

// ── Tests ────────────────────────────────────────────────────

describe("auth events — onSignIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetComisionActiva.mockResolvedValue(comision);
    mockVerificarConsistenciaAlumno.mockResolvedValue(undefined);
  });

  it("no hace nada si el profile no trae login", async () => {
    await onSignIn({ name: "Sin login" });

    expect(mockGetComisionActiva).not.toHaveBeenCalled();
    expect(mockVerificarConsistenciaAlumno).not.toHaveBeenCalled();
  });

  it("no hace nada si profile es null/undefined", async () => {
    await onSignIn(null);
    await onSignIn(undefined);

    expect(mockGetComisionActiva).not.toHaveBeenCalled();
    expect(mockVerificarConsistenciaAlumno).not.toHaveBeenCalled();
  });

  it("no dispara verificarConsistenciaAlumno si no hay comisión activa", async () => {
    mockGetComisionActiva.mockResolvedValue(null);

    await onSignIn({ login: "juangarcia" });

    expect(mockVerificarConsistenciaAlumno).not.toHaveBeenCalled();
  });

  it("dispara verificarConsistenciaAlumno con el login y la comisión activa", async () => {
    await onSignIn({ login: "juangarcia" });
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockVerificarConsistenciaAlumno).toHaveBeenCalledWith(
      "juangarcia",
      comision
    );
  });

  it("no throwea ni bloquea si verificarConsistenciaAlumno rejecta (fire-and-forget)", async () => {
    mockVerificarConsistenciaAlumno.mockRejectedValue(new Error("Sheets caído"));

    await expect(onSignIn({ login: "juangarcia" })).resolves.toBeUndefined();
  });

  it("no throwea si getComisionActiva falla", async () => {
    mockGetComisionActiva.mockRejectedValue(new Error("DB hipada"));

    await expect(onSignIn({ login: "juangarcia" })).resolves.toBeUndefined();
    expect(mockVerificarConsistenciaAlumno).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAlmacenDeCookies = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockAlmacenDeCookies),
}));

import {
  leerComisionConsultadaId,
  guardarComisionConsultadaId,
  borrarComisionConsultadaId,
} from "./comisionConsultadaCookie";

describe("leerComisionConsultadaId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve el valor de la cookie cuando está presente", async () => {
    mockAlmacenDeCookies.get.mockReturnValue({ value: "comision-1" });

    const id = await leerComisionConsultadaId();

    expect(id).toBe("comision-1");
    expect(mockAlmacenDeCookies.get).toHaveBeenCalledWith("comision_consultada");
  });

  it("devuelve undefined cuando no hay cookie", async () => {
    mockAlmacenDeCookies.get.mockReturnValue(undefined);

    expect(await leerComisionConsultadaId()).toBeUndefined();
  });
});

describe("guardarComisionConsultadaId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("setea la cookie httpOnly, sameSite lax, con path /admin y ~180 días", async () => {
    await guardarComisionConsultadaId("comision-2");

    expect(mockAlmacenDeCookies.set).toHaveBeenCalledWith(
      "comision_consultada",
      "comision-2",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/admin",
        maxAge: 60 * 60 * 24 * 180,
      })
    );
  });

  it("marca la cookie como secure sólo en producción", async () => {
    const entornoOriginal = process.env.NODE_ENV;
    Object.assign(process.env, { NODE_ENV: "production" });

    await guardarComisionConsultadaId("comision-3");

    expect(mockAlmacenDeCookies.set).toHaveBeenCalledWith(
      "comision_consultada",
      "comision-3",
      expect.objectContaining({ secure: true })
    );

    Object.assign(process.env, { NODE_ENV: entornoOriginal });
  });
});

describe("borrarComisionConsultadaId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("borra la cookie con el mismo path con el que se guardó", async () => {
    await borrarComisionConsultadaId();

    expect(mockAlmacenDeCookies.delete).toHaveBeenCalledWith({
      name: "comision_consultada",
      path: "/admin",
    });
  });
});

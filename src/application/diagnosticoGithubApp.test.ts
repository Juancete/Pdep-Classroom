import { describe, expect, it } from "vitest";
import { evaluarConfiguracionDeApp } from "./diagnosticoGithubApp";
import type { ConfiguracionDeApp } from "@/infrastructure/github";

const CONFIG_COMPLETA: ConfiguracionDeApp = {
  permisos: { administration: "write", contents: "write", members: "read", checks: "write" },
  eventos: ["check_suite", "push", "repository", "member"],
  webhook: { url: "https://classroom/api/webhooks/github" },
};

describe("evaluarConfiguracionDeApp", () => {
  it("ok cuando permisos, eventos y webhook están completos", () => {
    expect(evaluarConfiguracionDeApp(CONFIG_COMPLETA)).toEqual({
      ok: true,
      detalle: "Permisos, eventos y webhook completos",
    });
  });

  it("falta el permiso checks cuando no está presente en absoluto", () => {
    const resultado = evaluarConfiguracionDeApp({
      ...CONFIG_COMPLETA,
      permisos: { administration: "write", contents: "write", members: "read" },
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.detalle).toContain("permiso checks");
  });

  it("ok con nota cuando checks sólo tiene read (alcanza el mínimo, pero deshabilita la reejecución)", () => {
    const resultado = evaluarConfiguracionDeApp({
      ...CONFIG_COMPLETA,
      permisos: { ...CONFIG_COMPLETA.permisos, checks: "read" },
    });
    expect(resultado).toEqual({
      ok: true,
      detalle: "Permisos, eventos y webhook completos · checks sólo read: reejecución de CI deshabilitada",
    });
  });

  it("falta el permiso contents (write) cuando sólo tiene read", () => {
    const resultado = evaluarConfiguracionDeApp({
      ...CONFIG_COMPLETA,
      permisos: { ...CONFIG_COMPLETA.permisos, contents: "read" },
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.detalle).toContain("permiso contents (write)");
  });

  it("lista los eventos faltantes cuando no hay ninguno suscripto", () => {
    const resultado = evaluarConfiguracionDeApp({ ...CONFIG_COMPLETA, eventos: [] });
    expect(resultado.ok).toBe(false);
    expect(resultado.detalle).toContain("eventos check_suite/push/repository/member");
  });

  it("falta el webhook cuando es null", () => {
    const resultado = evaluarConfiguracionDeApp({ ...CONFIG_COMPLETA, webhook: null });
    expect(resultado.ok).toBe(false);
    expect(resultado.detalle).toContain("webhook");
  });

  it("caso real de producción: sin checks, sin eventos suscriptos y sin webhook", () => {
    const resultado = evaluarConfiguracionDeApp({
      permisos: { administration: "write", contents: "write", members: "read", metadata: "read" },
      eventos: [],
      webhook: null,
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.detalle).toContain("permiso checks");
    expect(resultado.detalle).toContain("check_suite");
    expect(resultado.detalle).toContain("webhook");
  });
});

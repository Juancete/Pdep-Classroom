import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verificarFirmaGithub } from "./webhook-firma";

function firmar(raw: string, secreto: string): string {
  return "sha256=" + createHmac("sha256", secreto).update(raw, "utf8").digest("hex");
}

const RAW = JSON.stringify({ action: "completed", repository: { name: "kata-juan" } });

describe("verificarFirmaGithub", () => {
  const envOriginal = process.env.GITHUB_WEBHOOK_SECRET;

  afterEach(() => {
    if (envOriginal === undefined) {
      delete process.env.GITHUB_WEBHOOK_SECRET;
    } else {
      process.env.GITHUB_WEBHOOK_SECRET = envOriginal;
    }
  });

  it("acepta una firma válida", () => {
    process.env.GITHUB_WEBHOOK_SECRET = "el-secreto";
    expect(verificarFirmaGithub(RAW, firmar(RAW, "el-secreto"))).toBe(true);
  });

  it("rechaza una firma con el secreto equivocado", () => {
    process.env.GITHUB_WEBHOOK_SECRET = "el-secreto";
    expect(verificarFirmaGithub(RAW, firmar(RAW, "otro-secreto"))).toBe(false);
  });

  it("rechaza una firma calculada sobre un body distinto", () => {
    process.env.GITHUB_WEBHOOK_SECRET = "el-secreto";
    expect(verificarFirmaGithub(RAW, firmar(RAW + "x", "el-secreto"))).toBe(false);
  });

  it("rechaza cuando el header de firma está ausente", () => {
    process.env.GITHUB_WEBHOOK_SECRET = "el-secreto";
    expect(verificarFirmaGithub(RAW, null)).toBe(false);
  });

  it("rechaza una firma sin el prefijo sha256=", () => {
    process.env.GITHUB_WEBHOOK_SECRET = "el-secreto";
    const firmaSinPrefijo = firmar(RAW, "el-secreto").replace("sha256=", "");
    expect(verificarFirmaGithub(RAW, firmaSinPrefijo)).toBe(false);
  });

  it("rechaza una firma de largo distinto sin explotar", () => {
    process.env.GITHUB_WEBHOOK_SECRET = "el-secreto";
    expect(verificarFirmaGithub(RAW, "sha256=corta")).toBe(false);
  });

  it("sin ningún secreto configurado, siempre rechaza", () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    expect(verificarFirmaGithub(RAW, firmar(RAW, "cualquiera"))).toBe(false);
  });

  it("con un secreto vacío o de sólo espacios, siempre rechaza", () => {
    process.env.GITHUB_WEBHOOK_SECRET = "   ";
    expect(verificarFirmaGithub(RAW, firmar(RAW, ""))).toBe(false);
  });

  describe("rotación con varios secretos separados por coma", () => {
    beforeEach(() => {
      process.env.GITHUB_WEBHOOK_SECRET = "viejo,nuevo";
    });

    it("acepta una firma hecha con el primer secreto de la lista", () => {
      expect(verificarFirmaGithub(RAW, firmar(RAW, "viejo"))).toBe(true);
    });

    it("acepta una firma hecha con el segundo secreto de la lista", () => {
      expect(verificarFirmaGithub(RAW, firmar(RAW, "nuevo"))).toBe(true);
    });

    it("rechaza una firma hecha con un secreto que ya no está en la lista", () => {
      expect(verificarFirmaGithub(RAW, firmar(RAW, "retirado"))).toBe(false);
    });
  });
});

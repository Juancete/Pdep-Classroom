import { describe, it, expect } from "vitest";
import { GithubRecursoNoEncontradoError, handleOctokitError } from "./github-errors";

function makeRequestError(status: number, message: string): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

describe("handleOctokitError", () => {
  describe("errores de configuración", () => {
    it("private key inválida", () => {
      expect(() => handleOctokitError(new Error("Invalid keyData"))).toThrow(
        "GITHUB_APP_PRIVATE_KEY inválida"
      );
    });

    it("installationId faltante", () => {
      expect(() =>
        handleOctokitError(new Error("installationId option is required for installation authentication"))
      ).toThrow("Falta GITHUB_APP_INSTALLATION_ID");
    });

    it("JWT no verificable por GitHub", () => {
      expect(() =>
        handleOctokitError(new Error("A JSON web token could not be decoded"))
      ).toThrow("GITHUB_APP_ID o GITHUB_APP_PRIVATE_KEY no coinciden");
    });
  });

  describe("errores HTTP", () => {
    it("401 autenticación fallida", () => {
      expect(() =>
        handleOctokitError(makeRequestError(401, "Unauthorized"))
      ).toThrow("Autenticación fallida con GitHub (401)");
    });

    it("403 permisos insuficientes", () => {
      expect(() =>
        handleOctokitError(makeRequestError(403, "Forbidden"))
      ).toThrow("La GitHub App no tiene permisos suficientes (403)");
    });

    it("404 en access_tokens → installation ID incorrecto", () => {
      expect(() =>
        handleOctokitError(makeRequestError(404, "Not Found - /app/installations/123/access_tokens"))
      ).toThrow("GITHUB_APP_INSTALLATION_ID incorrecto (404)");
    });

    it("lanza un error tipado con el mismo mensaje operativo ante un 404 genérico", () => {
      const lanzar = () => handleOctokitError(makeRequestError(404, "Not Found"));

      expect(lanzar).toThrow(GithubRecursoNoEncontradoError);
      expect(lanzar).toThrow(
        "Recurso no encontrado en GitHub (404): verificá GITHUB_ORG y que la app tenga acceso a los repos"
      );
    });

    it("el 404 de access_tokens no es el error tipado", () => {
      try {
        handleOctokitError(makeRequestError(404, "Not Found - /app/installations/123/access_tokens"));
        expect.unreachable();
      } catch (error) {
        expect(error).not.toBeInstanceOf(GithubRecursoNoEncontradoError);
      }
    });

    it("404 genérico → org o repo no encontrado", () => {
      expect(() =>
        handleOctokitError(makeRequestError(404, "Not Found"))
      ).toThrow("Recurso no encontrado en GitHub (404)");
    });

    it("429 rate limit", () => {
      expect(() =>
        handleOctokitError(makeRequestError(429, "Too Many Requests"))
      ).toThrow("Rate limit de GitHub alcanzado (429)");
    });
  });

  describe("errores desconocidos", () => {
    it("relanza el error original si no lo reconoce", () => {
      const original = new Error("algún error raro");
      expect(() => handleOctokitError(original)).toThrow(original);
    });

    it("relanza si no es un Error", () => {
      const original = "string error";
      expect(() => handleOctokitError(original)).toThrow();
    });
  });
});

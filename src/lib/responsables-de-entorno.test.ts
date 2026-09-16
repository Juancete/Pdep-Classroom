import { describe, it, expect, afterEach, vi } from "vitest";
import { responsablesDeEntorno, esResponsableDeEntorno } from "./responsables-de-entorno";

describe("responsablesDeEntorno", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("devuelve lista vacía si la env var no está seteada", () => {
    vi.stubEnv("ADMIN_GITHUB_USERNAMES", "");
    expect(responsablesDeEntorno()).toEqual([]);
  });

  it("separa por coma y hace trim de espacios", () => {
    vi.stubEnv("ADMIN_GITHUB_USERNAMES", " juancete , fdodino ");
    expect(responsablesDeEntorno()).toEqual(["juancete", "fdodino"]);
  });

  it("normaliza a minúsculas", () => {
    vi.stubEnv("ADMIN_GITHUB_USERNAMES", "JuanCete");
    expect(responsablesDeEntorno()).toEqual(["juancete"]);
  });

  it("saca el @ inicial (regresión: antes sólo auth.config.ts hacía toLowerCase, y ninguno sacaba el @)", () => {
    vi.stubEnv("ADMIN_GITHUB_USERNAMES", "@juancete");
    expect(responsablesDeEntorno()).toEqual(["juancete"]);
  });

  it("descarta entradas vacías (comas de más)", () => {
    vi.stubEnv("ADMIN_GITHUB_USERNAMES", "juancete,,fdodino,");
    expect(responsablesDeEntorno()).toEqual(["juancete", "fdodino"]);
  });

  it("deduplica después de normalizar y conserva el orden y el filtrado de vacíos", () => {
    vi.stubEnv("ADMIN_GITHUB_USERNAMES", "juancete, @JuanCete, ,fdodino,@, FDODINO,");
    expect(responsablesDeEntorno()).toEqual(["juancete", "fdodino"]);
  });
});

describe("esResponsableDeEntorno", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("true si el username normalizado está en la lista", () => {
    vi.stubEnv("ADMIN_GITHUB_USERNAMES", "juancete");
    expect(esResponsableDeEntorno("JuanCete")).toBe(true);
    expect(esResponsableDeEntorno("@juancete")).toBe(true);
    expect(esResponsableDeEntorno(" juancete ")).toBe(true);
  });

  it("false si el username no está en la lista", () => {
    vi.stubEnv("ADMIN_GITHUB_USERNAMES", "juancete");
    expect(esResponsableDeEntorno("ana")).toBe(false);
  });

  it("false con lista vacía", () => {
    vi.stubEnv("ADMIN_GITHUB_USERNAMES", "");
    expect(esResponsableDeEntorno("juancete")).toBe(false);
  });
});

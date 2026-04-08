import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { checkRateLimit, _resetRateLimits } from "./rate-limit";

beforeEach(() => {
  _resetRateLimits();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("permite la primera request para una clave nueva", () => {
    expect(checkRateLimit("user:a1")).toBe(true);
  });

  it("bloquea una segunda request inmediata dentro de la ventana", () => {
    checkRateLimit("user:a1", 5000);
    expect(checkRateLimit("user:a1", 5000)).toBe(false);
  });

  it("permite la request después de que expira la ventana", () => {
    vi.useFakeTimers();
    checkRateLimit("user:a1", 1000);
    vi.advanceTimersByTime(1001);
    expect(checkRateLimit("user:a1", 1000)).toBe(true);
  });

  it("bloquea exactamente dentro del límite (999ms < 1000ms)", () => {
    vi.useFakeTimers();
    checkRateLimit("user:a1", 1000);
    vi.advanceTimersByTime(999);
    expect(checkRateLimit("user:a1", 1000)).toBe(false);
  });

  it("claves distintas no interfieren entre sí", () => {
    checkRateLimit("user1:a1", 5000);
    expect(checkRateLimit("user2:a1", 5000)).toBe(true);
    expect(checkRateLimit("user1:a2", 5000)).toBe(true);
  });

  it("el mismo usuario en assignments distintos no se bloquea", () => {
    checkRateLimit("juan:kata-1", 5000);
    expect(checkRateLimit("juan:kata-2", 5000)).toBe(true);
  });

  it("usa 3000ms como ventana por defecto", () => {
    vi.useFakeTimers();
    checkRateLimit("user:a1");
    vi.advanceTimersByTime(2999);
    expect(checkRateLimit("user:a1")).toBe(false);
    vi.advanceTimersByTime(2);
    expect(checkRateLimit("user:a1")).toBe(true);
  });

  it("después de expirar, actualiza el timestamp de la última request", () => {
    vi.useFakeTimers();
    checkRateLimit("user:a1", 1000);
    vi.advanceTimersByTime(1100);
    expect(checkRateLimit("user:a1", 1000)).toBe(true); // permitida, actualiza timestamp
    vi.advanceTimersByTime(500);
    expect(checkRateLimit("user:a1", 1000)).toBe(false); // bloqueada por nuevo timestamp
  });
});

import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { parseJsonObjectBody } from "./api-errors";

function makeRequest(body: unknown, contentType = "application/json"): Request {
  return new Request("http://test.local/api/test", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("parseJsonObjectBody", () => {
  it("devuelve el objeto cuando el body es un objeto plano válido", async () => {
    const request = makeRequest({ legajo: "12345", nombre: "Juan" });
    const result = await parseJsonObjectBody(request);
    expect(result).not.toBeInstanceOf(NextResponse);
    expect(result).toEqual({ legajo: "12345", nombre: "Juan" });
  });

  it("devuelve NextResponse 400 cuando el body es null JSON", async () => {
    const request = makeRequest(null);
    const result = await parseJsonObjectBody(request);
    expect(result).toBeInstanceOf(NextResponse);
    const response = result as NextResponse;
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("No pudimos leer los datos enviados");
  });

  it("devuelve NextResponse 400 cuando el body es un array JSON", async () => {
    const request = makeRequest([1, 2, 3]);
    const result = await parseJsonObjectBody(request);
    expect(result).toBeInstanceOf(NextResponse);
    const response = result as NextResponse;
    expect(response.status).toBe(400);
  });

  it("devuelve NextResponse 400 cuando el body no es JSON válido", async () => {
    const request = new Request("http://test.local/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "esto-no-es-json",
    });
    const result = await parseJsonObjectBody(request);
    expect(result).toBeInstanceOf(NextResponse);
    const response = result as NextResponse;
    // El bug original devolvía 500 porque req.json() tiraba excepción sin .catch().
    // Con el helper, un body mal formado devuelve 400.
    expect(response.status).toBe(400);
  });

  it("devuelve NextResponse 400 cuando el body es un string JSON", async () => {
    const request = new Request("http://test.local/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify("un string"),
    });
    const result = await parseJsonObjectBody(request);
    expect(result).toBeInstanceOf(NextResponse);
    const response = result as NextResponse;
    expect(response.status).toBe(400);
  });

  it("devuelve NextResponse 400 cuando el body es un número JSON", async () => {
    const request = new Request("http://test.local/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(42),
    });
    const result = await parseJsonObjectBody(request);
    expect(result).toBeInstanceOf(NextResponse);
    const response = result as NextResponse;
    expect(response.status).toBe(400);
  });
});

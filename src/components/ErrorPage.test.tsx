import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorPage } from "./ErrorPage";

// Política única de los dos boundaries del proyecto (`src/app/error.tsx` y
// `src/app/global-error.tsx`): el mensaje del error sólo se muestra si Next
// no lo sanitizó Y estamos en desarrollo — en cualquier otro caso, un
// mensaje genérico. El digest, en cambio, siempre se muestra si existe.
describe("ErrorPage", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("en desarrollo muestra el mensaje real del error", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(<ErrorPage error={new Error("Connection refused")} />);
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
  });

  it("en producción oculta el mensaje real y muestra el genérico", () => {
    vi.stubEnv("NODE_ENV", "production");
    render(<ErrorPage error={new Error("SQL private-db.internal password=secret")} />);
    expect(screen.queryByText(/private-db\.internal/)).not.toBeInTheDocument();
    expect(
      screen.getByText("El servidor encontró un error. Revisá los logs para más detalles.")
    ).toBeInTheDocument();
  });

  it("en producción conserva el digest aunque oculte el mensaje", () => {
    vi.stubEnv("NODE_ENV", "production");
    const error = Object.assign(new Error("detalle sensible"), { digest: "abc123" });
    render(<ErrorPage error={error} />);
    expect(screen.queryByText("detalle sensible")).not.toBeInTheDocument();
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });

  it("un mensaje sanitizado por Next se muestra genérico incluso en desarrollo", () => {
    vi.stubEnv("NODE_ENV", "development");
    const sanitized = Object.assign(
      new Error("An error occurred in the Server Components render but no message was provided"),
      { digest: "827364775" }
    );
    render(<ErrorPage error={sanitized} />);
    expect(
      screen.getByText("El servidor encontró un error. Revisá los logs para más detalles.")
    ).toBeInTheDocument();
    expect(screen.getByText(/827364775/)).toBeInTheDocument();
  });

  it("muestra el título genérico y el texto de recarga", () => {
    render(<ErrorPage error={new Error("x")} />);
    expect(screen.getByText("Algo salió mal")).toBeInTheDocument();
    expect(screen.getByText(/Podés intentar recargar la página/)).toBeInTheDocument();
  });

  it("no muestra sección de código si no hay digest", () => {
    render(<ErrorPage error={new Error("falla sin digest")} />);
    expect(screen.queryByText(/código:/)).not.toBeInTheDocument();
  });
});

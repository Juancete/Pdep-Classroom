import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import GlobalError from "./error";

// `GlobalError` (este archivo, no `global-error.tsx`) es sólo el wrapper de
// segmento: delega toda la política de qué mensaje mostrar en `ErrorPage`
// (ver `src/components/ErrorPage.test.tsx` para esa política en detalle:
// requiere `NODE_ENV=development` además de que Next no haya sanitizado el
// mensaje). Estos tests stubean el env donde hace falta ver el mensaje real.
describe("GlobalError", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("muestra el título genérico de error", () => {
    render(<GlobalError error={new Error("cualquier cosa")} />);
    expect(screen.getByText("Algo salió mal")).toBeInTheDocument();
  });

  it("muestra el mensaje del error recibido (en desarrollo)", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(<GlobalError error={new Error("Connection refused")} />);
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
  });

  it("muestra el texto de recarga", () => {
    render(<GlobalError error={new Error("x")} />);
    expect(
      screen.getByText(/Podés intentar recargar la página/)
    ).toBeInTheDocument();
  });

  it("renderiza el mensaje con estilo mono rojo (en desarrollo)", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(<GlobalError error={new Error("DB timeout")} />);
    const msg = screen.getByText("DB timeout");
    expect(msg).toHaveClass("font-mono");
    expect(msg).toHaveClass("text-red-500");
  });

  it("muestra fallback cuando Next.js sanitiza el mensaje", () => {
    const sanitized = Object.assign(
      new Error(
        "An error occurred in the Server Components render but no message was provided"
      ),
      { digest: "827364775" }
    );
    render(<GlobalError error={sanitized} />);
    expect(
      screen.getByText(/El servidor encontró un error/)
    ).toBeInTheDocument();
    expect(screen.getByText(/827364775/)).toBeInTheDocument();
  });

  it("muestra el digest como código de referencia cuando está presente", () => {
    const errorWithDigest = Object.assign(new Error("falla"), {
      digest: "123456789",
    });
    render(<GlobalError error={errorWithDigest} />);
    expect(screen.getByText(/123456789/)).toBeInTheDocument();
  });

  it("no muestra sección de código si no hay digest", () => {
    render(<GlobalError error={new Error("falla sin digest")} />);
    expect(screen.queryByText(/código:/)).not.toBeInTheDocument();
  });
});

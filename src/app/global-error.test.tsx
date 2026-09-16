import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GlobalError from "./global-error";

describe("GlobalError (global-error.tsx)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("renderiza <html lang='es'>, el título genérico, el mensaje del error y el botón Reintentar", () => {
    vi.stubEnv("NODE_ENV", "development");
    const html = renderToStaticMarkup(
      <GlobalError error={new Error("Connection refused")} reset={vi.fn()} />
    );
    expect(html).toContain('<html lang="es"');
    expect(html).toContain("Algo salió mal");
    expect(html).toContain("Connection refused");
    expect(html).toContain("Reintentar");
  });

  it("en producción oculta detalles incluso de errores no sanitizados y conserva el digest", () => {
    vi.stubEnv("NODE_ENV", "production");
    const error = Object.assign(new Error("SQL private-db.internal password=secret"), { digest: "abc123" });
    const html = renderToStaticMarkup(<GlobalError error={error} reset={vi.fn()} />);
    expect(html).not.toContain(error.message);
    expect(html).not.toContain("private-db.internal");
    expect(html).toContain("El servidor encontró un error");
    expect(html).toContain("abc123");
  });

  it("el click en Reintentar llama a reset", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<GlobalError error={new Error("falla")} reset={reset} />, {
      container: document.documentElement,
    });
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});

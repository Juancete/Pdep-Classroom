import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GlobalError from "./global-error";

describe("GlobalError (global-error.tsx)", () => {
  it("renderiza <html lang='es'>, el título genérico, el mensaje del error y el botón Reintentar", () => {
    const html = renderToStaticMarkup(
      <GlobalError error={new Error("Connection refused")} reset={vi.fn()} />
    );
    expect(html).toContain('<html lang="es"');
    expect(html).toContain("Algo salió mal");
    expect(html).toContain("Connection refused");
    expect(html).toContain("Reintentar");
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

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AlumnoForm } from "./AlumnoForm";

const DEFAULT_VALUES = {
  githubUsername: "juangarcia",
  legajo: "12345",
  apellido: "Garcia",
  nombre: "Juan",
  email: "juan@example.com",
};

function renderForm(overrides: Partial<Parameters<typeof AlumnoForm>[0]> = {}) {
  return render(
    <AlumnoForm
      defaultValues={DEFAULT_VALUES}
      apiEndpoint="/api/test"
      method="POST"
      submitLabel="Guardar"
      successMessage="¡Guardado!"
      {...overrides}
    />
  );
}

describe("AlumnoForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("campos renderizados", () => {
    it("muestra el usuario de GitHub como campo deshabilitado", () => {
      renderForm();
      expect(screen.getByDisplayValue("juangarcia")).toBeDisabled();
    });

    it("pre-carga el legajo", () => {
      renderForm();
      expect(screen.getByDisplayValue("12345")).toBeInTheDocument();
    });

    it("pre-carga el apellido", () => {
      renderForm();
      expect(screen.getByDisplayValue("Garcia")).toBeInTheDocument();
    });

    it("pre-carga el nombre", () => {
      renderForm();
      expect(screen.getByDisplayValue("Juan")).toBeInTheDocument();
    });

    it("pre-carga el email", () => {
      renderForm();
      expect(screen.getByDisplayValue("juan@example.com")).toBeInTheDocument();
    });

    it("muestra el label del botón de submit", () => {
      renderForm({ submitLabel: "Registrarme" });
      expect(screen.getByRole("button", { name: "Registrarme" })).toBeInTheDocument();
    });
  });

  describe("submit exitoso", () => {
    beforeEach(() => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );
    });

    it("llama a fetch con el endpoint y método correctos", async () => {
      renderForm({ apiEndpoint: "/api/registro", method: "POST" });
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/registro", expect.objectContaining({ method: "POST" })));
    });

    it("incluye los campos del formulario en el body", async () => {
      renderForm();
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      await waitFor(() => {
        const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
        expect(body).toMatchObject({ legajo: "12345", apellido: "Garcia", nombre: "Juan", email: "juan@example.com" });
      });
    });

    it("incluye el extraBody en el body del request", async () => {
      renderForm({ extraBody: { githubUsername: "juangarcia" } });
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      await waitFor(() => {
        const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
        expect(body.githubUsername).toBe("juangarcia");
      });
    });

    it("muestra el mensaje de éxito y oculta el formulario", async () => {
      renderForm({ successMessage: "¡Datos actualizados!" });
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      await waitFor(() => expect(screen.getByText("¡Datos actualizados!")).toBeInTheDocument());
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("submit con error del servidor", () => {
    it("muestra el mensaje de error de la API", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ error: "Legajo ya registrado" }), { status: 400 })
      );
      renderForm();
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      await waitFor(() => expect(screen.getByText("Legajo ya registrado")).toBeInTheDocument());
    });

    it("no muestra el mensaje de éxito si la API falla", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ error: "error" }), { status: 400 })
      );
      renderForm({ successMessage: "OK" });
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      await waitFor(() => screen.getByText("error"));
      expect(screen.queryByText("OK")).not.toBeInTheDocument();
    });
  });
});

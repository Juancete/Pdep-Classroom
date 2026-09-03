import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AlumnoForm } from "./AlumnoForm";

const mockSignOut = vi.fn();
vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

const mockRouterRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

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

    it("muestra la explicación sobre el email leído asiduamente", () => {
      renderForm();
      expect(
        screen.getByText(/email que leas asiduamente/i)
      ).toBeInTheDocument();
    });

    it("el input de email tiene pattern RFC-lite para validar en el cliente", () => {
      renderForm();
      const emailInput = screen.getByDisplayValue("juan@example.com");
      expect(emailInput).toHaveAttribute("pattern", "[^\\s@]+@[^\\s@]+\\.[^\\s@]+");
      expect(emailInput).toHaveAttribute("type", "email");
      expect(emailInput).toBeRequired();
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

    it("llama a router.refresh() post-submit OK para re-renderizar el banner global", async () => {
      mockRouterRefresh.mockClear();
      renderForm();
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
    });
  });

  describe("warning de canales de comunicación", () => {
    function mockRegistroOk(canalesConError?: string[]) {
      const body = canalesConError
        ? { ok: true, canalesConError }
        : { ok: true };
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify(body), { status: 200 })
      );
    }

    it("muestra el warning con el asunto del canal que falló", async () => {
      mockRegistroOk(["suscribirte al grupo de Google del curso"]);
      renderForm();
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          "No pudimos suscribirte al grupo de Google del curso."
        )
      );
    });

    it("enumera varios canales fallidos en un solo warning", async () => {
      mockRegistroOk(["hacer A", "hacer B"]);
      renderForm();
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          "No pudimos hacer A ni hacer B."
        )
      );
    });

    it("no muestra el warning cuando canalesConError viene vacío", async () => {
      mockRegistroOk([]);
      renderForm({ successMessage: "Listo" });
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      await waitFor(() => screen.getByText("Listo"));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("no muestra el warning cuando la respuesta no trae canalesConError", async () => {
      mockRegistroOk();
      renderForm({ successMessage: "Listo" });
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      await waitFor(() => screen.getByText("Listo"));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("warning de sincronización de grupos", () => {
    function mockOkConBody(body: Record<string, unknown>) {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ ok: true, ...body }), { status: 200 })
      );
    }

    const SYNC_WARNING_PATTERN = /no pudimos asignarte al grupo de tp/i;

    it("muestra el warning cuando gruposSync === 'error'", async () => {
      mockOkConBody({ gruposSync: "error" });
      renderForm();
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(SYNC_WARNING_PATTERN)
      );
    });

    it("no muestra el warning cuando el body no trae gruposSync", async () => {
      mockOkConBody({});
      renderForm({ successMessage: "Listo" });
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      await waitFor(() => screen.getByText("Listo"));
      expect(screen.queryByText(SYNC_WARNING_PATTERN)).not.toBeInTheDocument();
    });

    it("muestra ambos warnings cuando falla un canal y la sync de grupos", async () => {
      mockOkConBody({
        canalesConError: ["suscribirte al grupo de Google del curso"],
        gruposSync: "error",
      });
      renderForm();
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      await waitFor(() => {
        const alerts = screen.getAllByRole("alert");
        expect(alerts).toHaveLength(2);
      });
      expect(screen.getByText(/no pudimos suscribirte al grupo de google/i)).toBeInTheDocument();
      expect(screen.getByText(SYNC_WARNING_PATTERN)).toBeInTheDocument();
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

  describe("error inline por field", () => {
    beforeEach(() => {
      mockSignOut.mockClear();
    });

    function mockApiError(body: Record<string, unknown>, status = 400) {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify(body), { status })
      );
    }

    it("pinta el error inline junto al input cuando field === 'legajo'", async () => {
      mockApiError({ error: "El legajo ya pertenece a otro", field: "legajo" });
      renderForm();
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      await waitFor(() => screen.getByRole("alert"));
      const alerta = screen.getByRole("alert");
      expect(alerta).toHaveTextContent("El legajo ya pertenece a otro");
      // El input de legajo queda como sibling del mensaje inline
      expect(alerta.previousElementSibling?.getAttribute("name")).toBe("legajo");
    });

    it("no muestra el banner genérico cuando hay fieldError (evita duplicar)", async () => {
      mockApiError({ error: "El legajo ya pertenece a otro", field: "legajo" });
      renderForm();
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      await waitFor(() => screen.getByRole("alert"));
      // Solo aparece una vez (el inline). El banner general no se suma.
      expect(screen.getAllByText("El legajo ya pertenece a otro")).toHaveLength(1);
    });

    it("muestra CTA de cerrar sesión cuando field === 'githubUsername'", async () => {
      mockApiError({
        error: "Iniciaste sesión como @juangarcia pero completaste @attacker. Cerrá sesión y volvé a entrar con la cuenta correcta.",
        field: "githubUsername",
      });
      renderForm();
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      const cta = await screen.findByRole("button", { name: /cerrar sesión/i });
      fireEvent.click(cta);
      expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/" });
    });

    it("cae al banner genérico cuando la API devuelve error sin field", async () => {
      mockApiError({ error: "Error interno" });
      renderForm();
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      await waitFor(() => screen.getByText("Error interno"));
      // El CTA de signOut no debe aparecer si no vino field=githubUsername
      expect(screen.queryByRole("button", { name: /cerrar sesión/i })).not.toBeInTheDocument();
    });

    it("limpia el error inline al reenviar el formulario", async () => {
      mockApiError({ error: "El legajo ya pertenece a otro", field: "legajo" });
      renderForm();
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      await waitFor(() => screen.getByRole("alert"));

      // Segundo submit responde OK: el error inline debe desaparecer
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );
      fireEvent.submit(screen.getByRole("button").closest("form")!);
      await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    });
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AssignmentFormState } from "@/lib/assignment-schema";

// ── Mocks ────────────────────────────────────────────────────

const mockUseActionState = vi.fn();

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: (...args: unknown[]) => mockUseActionState(...args),
  };
});

import { AssignmentForm } from "./assignment-form";

// ── Helpers ──────────────────────────────────────────────────

const noop = vi.fn();

function noErrorState() {
  mockUseActionState.mockImplementation(
    (_action: unknown, initial: AssignmentFormState) => [initial, noop]
  );
}

function errorState(errors: Record<string, string[]>) {
  mockUseActionState.mockReturnValue([{ ok: false, errors }, noop]);
}

function formErrorState(formError: string) {
  mockUseActionState.mockReturnValue([{ ok: false, errors: {}, formError }, noop]);
}

const TEMPLATES = [
  { name: "kata-template", fullName: "org/kata-template", description: "Kata base" },
  { name: "tp-objetos", fullName: "org/tp-objetos", description: "TP de objetos" },
];

// Los labels del form no tienen htmlFor, usamos placeholder y name para los selectores
function getTituloInput(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('[name="titulo"]')!;
}
function getSlugInput(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('[name="slug"]')!;
}
function getTipoSelect(container: HTMLElement) {
  return container.querySelector<HTMLSelectElement>('[name="tipo"]')!;
}
function getDeadlineInput(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('[name="deadline"]')!;
}
function getMaxIntegrantesInput(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('[name="maxIntegrantes"]')!;
}

// ── Tests ────────────────────────────────────────────────────

describe("AssignmentForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    noErrorState();
  });

  describe("campos obligatorios", () => {
    it("renderiza el campo Título", () => {
      const { container } = render(
        <AssignmentForm action={noop} templates={[]} submitLabel="Crear" />
      );
      expect(getTituloInput(container)).toBeInTheDocument();
    });

    it("renderiza el campo Slug", () => {
      const { container } = render(
        <AssignmentForm action={noop} templates={[]} submitLabel="Crear" />
      );
      expect(getSlugInput(container)).toBeInTheDocument();
    });

    it("renderiza el selector de Paradigma", () => {
      const { container } = render(
        <AssignmentForm action={noop} templates={[]} submitLabel="Crear" />
      );
      expect(container.querySelector('[name="paradigma"]')).toBeInTheDocument();
    });

    it("renderiza el selector de Tipo", () => {
      const { container } = render(
        <AssignmentForm action={noop} templates={[]} submitLabel="Crear" />
      );
      expect(getTipoSelect(container)).toBeInTheDocument();
    });

    it("renderiza el campo Deadline", () => {
      const { container } = render(
        <AssignmentForm action={noop} templates={[]} submitLabel="Crear" />
      );
      expect(getDeadlineInput(container)).toBeInTheDocument();
    });

    it("muestra el label del botón de submit", () => {
      render(<AssignmentForm action={noop} templates={[]} submitLabel="Crear assignment" />);
      expect(screen.getByRole("button", { name: "Crear assignment" })).toBeInTheDocument();
    });
  });

  describe("auto-generación de slug", () => {
    it("genera el slug automáticamente al escribir el título", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <AssignmentForm action={noop} templates={[]} submitLabel="Crear" />
      );

      await user.type(getTituloInput(container), "Kata Funcional");

      expect(getSlugInput(container).value).toBe("kata-funcional");
    });

    it("no sobreescribe el slug si el usuario lo editó manualmente", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <AssignmentForm action={noop} templates={[]} submitLabel="Crear" />
      );

      await user.type(getSlugInput(container), "mi-slug-custom");
      await user.type(getTituloInput(container), "Nuevo Título");

      expect(getSlugInput(container).value).toBe("mi-slug-custom");
    });
  });

  describe("campo maxIntegrantes (tipo grupal)", () => {
    it("no muestra el campo maxIntegrantes cuando tipo=individual (default)", () => {
      const { container } = render(
        <AssignmentForm action={noop} templates={[]} submitLabel="Crear" />
      );
      expect(getMaxIntegrantesInput(container)).toBeNull();
    });

    it("muestra maxIntegrantes al cambiar tipo a 'grupal'", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <AssignmentForm action={noop} templates={[]} submitLabel="Crear" />
      );

      await user.selectOptions(getTipoSelect(container), "grupal");

      expect(getMaxIntegrantesInput(container)).toBeInTheDocument();
    });

    it("oculta maxIntegrantes al volver a 'individual'", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <AssignmentForm action={noop} templates={[]} submitLabel="Crear" />
      );

      await user.selectOptions(getTipoSelect(container), "grupal");
      await user.selectOptions(getTipoSelect(container), "individual");

      expect(getMaxIntegrantesInput(container)).toBeNull();
    });
  });

  describe("valores iniciales", () => {
    it("pre-carga el tipo desde defaultValues", () => {
      const { container } = render(
        <AssignmentForm
          action={noop}
          templates={[]}
          submitLabel="Guardar"
          defaultValues={{ tipo: "grupal", maxIntegrantes: 4 }}
        />
      );
      expect(getTipoSelect(container).value).toBe("grupal");
    });

    it("pre-carga el slug desde defaultValues sin auto-generarlo", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <AssignmentForm
          action={noop}
          templates={[]}
          submitLabel="Guardar"
          defaultValues={{ slug: "mi-slug-existente" }}
        />
      );

      await user.type(getTituloInput(container), "Otro Título");

      expect(getSlugInput(container).value).toBe("mi-slug-existente");
    });
  });

  describe("bloqueo estructural", () => {
    it("mantiene bloqueado el tipo STI de un borrador existente", () => {
      const { container } = render(
        <AssignmentForm
          action={noop}
          templates={[]}
          submitLabel="Guardar"
          defaultValues={{ id: "a1", tipo: "individual" }}
          structuralLocked={false}
        />
      );

      expect(getTipoSelect(container)).toBeDisabled();
      expect(container.querySelector<HTMLInputElement>('input[type="hidden"][name="tipo"]')?.value).toBe("individual");
    });

    it("preserva el tipo enviado cuando la estructura está bloqueada", () => {
      const { container } = render(
        <AssignmentForm
          action={noop}
          templates={[]}
          submitLabel="Guardar"
          defaultValues={{ id: "a1", tipo: "grupal" }}
          structuralLocked
        />
      );

      expect(getTipoSelect(container)).toBeDisabled();
      expect(container.querySelector<HTMLInputElement>('input[type="hidden"][name="tipo"]')?.value).toBe("grupal");
    });
  });

  describe("mensajes de error del servidor", () => {
    it("muestra error de título", () => {
      errorState({ titulo: ["El título es requerido"] });
      render(<AssignmentForm action={noop} templates={[]} submitLabel="Crear" />);
      expect(screen.getByText("El título es requerido")).toBeInTheDocument();
    });

    it("muestra error de slug", () => {
      errorState({ slug: ["Slug inválido"] });
      render(<AssignmentForm action={noop} templates={[]} submitLabel="Crear" />);
      expect(screen.getByText("Slug inválido")).toBeInTheDocument();
    });

    it("muestra error de templateRepo", () => {
      errorState({ templateRepo: ["El template es requerido"] });
      render(<AssignmentForm action={noop} templates={[]} submitLabel="Crear" />);
      expect(screen.getByText("El template es requerido")).toBeInTheDocument();
    });

    it("muestra error de maxIntegrantes en modo grupal", () => {
      mockUseActionState.mockReturnValue([
        { ok: false, errors: { maxIntegrantes: ["Debe ser al menos 2"] } },
        noop,
      ]);
      render(
        <AssignmentForm
          action={noop}
          templates={[]}
          submitLabel="Crear"
          defaultValues={{ tipo: "grupal" }}
        />
      );
      expect(screen.getByText("Debe ser al menos 2")).toBeInTheDocument();
    });

    it("muestra error global del formulario", () => {
      formErrorState("Necesitás una comisión activa para crear assignments.");

      render(<AssignmentForm action={noop} templates={[]} submitLabel="Crear" />);

      expect(
        screen.getByText("Necesitás una comisión activa para crear assignments.")
      ).toBeInTheDocument();
    });
  });

  describe("combobox de templates", () => {
    it("muestra input directo cuando no hay templates", () => {
      const { container } = render(
        <AssignmentForm action={noop} templates={[]} submitLabel="Crear" />
      );
      expect(
        container.querySelector('[name="templateRepo"]')
      ).toBeInTheDocument();
    });

    it("muestra los templates al hacer focus en el combobox", async () => {
      const user = userEvent.setup();
      render(<AssignmentForm action={noop} templates={TEMPLATES} submitLabel="Crear" />);

      await user.click(screen.getByPlaceholderText(/buscá por nombre/i));

      expect(screen.getByText("kata-template")).toBeInTheDocument();
      expect(screen.getByText("tp-objetos")).toBeInTheDocument();
    });

    it("filtra templates por nombre al escribir", async () => {
      const user = userEvent.setup();
      render(<AssignmentForm action={noop} templates={TEMPLATES} submitLabel="Crear" />);

      await user.type(screen.getByPlaceholderText(/buscá por nombre/i), "kata");

      expect(screen.getByText("kata-template")).toBeInTheDocument();
      expect(screen.queryByText("tp-objetos")).not.toBeInTheDocument();
    });

    it("muestra 'Sin resultados' cuando no hay coincidencias", async () => {
      const user = userEvent.setup();
      render(<AssignmentForm action={noop} templates={TEMPLATES} submitLabel="Crear" />);

      await user.type(screen.getByPlaceholderText(/buscá por nombre/i), "xxxxxxxxx");

      expect(screen.getByText("Sin resultados")).toBeInTheDocument();
    });

    it("selecciona el template al hacer click y actualiza el input hidden", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <AssignmentForm action={noop} templates={TEMPLATES} submitLabel="Crear" />
      );

      await user.click(screen.getByPlaceholderText(/buscá por nombre/i));
      await user.click(screen.getByText("kata-template"));

      const hidden = container.querySelector(
        'input[type="hidden"][name="templateRepo"]'
      ) as HTMLInputElement;
      expect(hidden?.value).toBe("kata-template");
    });
  });
});

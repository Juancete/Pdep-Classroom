import { render, screen } from "@testing-library/react";
import {
  DataTable,
  DataHeader,
  DataHeaderCell,
  DataBody,
  DataRow,
  DataCell,
  DataEmpty,
} from "./DataTable";

describe("DataTable", () => {
  it("propaga la definición de columnas al estilo CSS del container", () => {
    const { container } = render(
      <DataTable columns="2fr 1fr 100px">
        <div>x</div>
      </DataTable>
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.getPropertyValue("--data-cols")).toBe("2fr 1fr 100px");
  });

  it("DataCell muestra el label y el valor", () => {
    render(
      <DataTable columns="1fr">
        <DataRow>
          <DataCell label="Paradigma">Funcional</DataCell>
        </DataRow>
      </DataTable>
    );
    expect(screen.getByText("Paradigma")).toBeInTheDocument();
    expect(screen.getByText("Funcional")).toBeInTheDocument();
  });

  it("DataCell sin label no renderiza el prefijo", () => {
    render(
      <DataTable columns="1fr">
        <DataRow>
          <DataCell label="">Acciones</DataCell>
        </DataRow>
      </DataTable>
    );
    expect(screen.queryByText(/:/)).not.toBeInTheDocument();
    expect(screen.getByText("Acciones")).toBeInTheDocument();
  });

  it("el label de DataCell se oculta en md+ (md:hidden)", () => {
    render(
      <DataTable columns="1fr">
        <DataRow>
          <DataCell label="Tipo">grupal</DataCell>
        </DataRow>
      </DataTable>
    );
    expect(screen.getByText("Tipo")).toHaveClass("md:hidden");
  });

  it("DataHeader solo se muestra en md+", () => {
    const { container } = render(
      <DataTable columns="1fr 1fr">
        <DataHeader>
          <DataHeaderCell>Título</DataHeaderCell>
          <DataHeaderCell align="right">Entregas</DataHeaderCell>
        </DataHeader>
      </DataTable>
    );
    const header = container.querySelector(".hidden.md\\:block");
    expect(header).toBeInTheDocument();
    expect(screen.getByText("Título")).toBeInTheDocument();
    expect(screen.getByText("Entregas")).toHaveClass("text-right");
  });

  it("DataCell con heading oculta el label y destaca el valor", () => {
    render(
      <DataTable columns="1fr">
        <DataRow>
          <DataCell label="Título" heading>
            Mi TP
          </DataCell>
        </DataRow>
      </DataTable>
    );
    expect(screen.queryByText("Título")).not.toBeInTheDocument();
    expect(screen.getByText("Mi TP").className).toContain("font-semibold");
  });

  it("expone roles ARIA tabulares para screen readers", () => {
    render(
      <DataTable columns="1fr 1fr">
        <DataHeader>
          <DataHeaderCell>A</DataHeaderCell>
          <DataHeaderCell>B</DataHeaderCell>
        </DataHeader>
        <DataBody>
          <DataRow>
            <DataCell label="A">a1</DataCell>
            <DataCell label="B">b1</DataCell>
          </DataRow>
        </DataBody>
      </DataTable>
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("rowgroup")).toHaveLength(2);
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(screen.getAllByRole("cell")).toHaveLength(2);
  });

  it("DataEmpty muestra el mensaje vacío", () => {
    render(<DataEmpty>No hay nada todavía</DataEmpty>);
    expect(screen.getByText("No hay nada todavía")).toBeInTheDocument();
  });

  it("sin minWidth mantiene overflow-hidden y no fija --data-min-w", () => {
    const { container } = render(
      <DataTable columns="1fr 1fr">
        <div>x</div>
      </DataTable>
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("overflow-hidden");
    expect(root.className).not.toContain("overflow-x-auto");
    expect(root.style.getPropertyValue("--data-min-w")).toBe("");
  });

  it("con minWidth scrollea horizontal en vez de aplastar columnas", () => {
    const { container } = render(
      <DataTable columns="2fr 1fr 1fr" minWidth="900px">
        <div>x</div>
      </DataTable>
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("overflow-x-auto");
    expect(root.className).not.toContain("overflow-hidden");
    expect(root.style.getPropertyValue("--data-min-w")).toBe("900px");
  });

  it("el ancho mínimo de la fila sólo aplica desde md (mobile no scrollea horizontal)", () => {
    const { container } = render(
      <DataTable columns="2fr 1fr 1fr" minWidth="900px">
        <DataHeader>
          <DataHeaderCell>A</DataHeaderCell>
        </DataHeader>
        <DataBody>
          <DataRow>
            <DataCell label="A">a1</DataCell>
          </DataRow>
        </DataBody>
      </DataTable>
    );

    const row = screen.getByText("a1").closest('[role="row"]') as HTMLElement;
    expect(row).toBeInTheDocument();
    // La fila es `block` en mobile: ninguna clase de min-width sin el
    // prefijo `md:` — el ancho mínimo sólo puede venir de esa variante.
    const clasesMinWidthSinMd = row.className
      .split(/\s+/)
      .filter((clase) => clase.includes("min-w-") && !clase.startsWith("md:"));
    expect(clasesMinWidthSinMd).toEqual([]);
    expect(row.className).toContain("md:min-w-[var(--data-min-w,auto)]");
    expect(row.style.minWidth).toBe("");

    const headerRow = container.querySelector('[role="columnheader"]')!
      .parentElement as HTMLElement;
    expect(headerRow.className).toContain("md:min-w-[var(--data-min-w,auto)]");
    expect(headerRow.style.minWidth).toBe("");
  });

  it("DataBody envuelve las filas", () => {
    render(
      <DataTable columns="1fr">
        <DataBody>
          <DataRow>
            <DataCell label="X">a</DataCell>
          </DataRow>
          <DataRow>
            <DataCell label="X">b</DataCell>
          </DataRow>
        </DataBody>
      </DataTable>
    );
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import {
  DashboardSkeleton,
  AssignmentsTableSkeleton,
  ListSkeleton,
} from "./PageSkeleton";

describe("DashboardSkeleton", () => {
  it("renderiza el título de TPs", () => {
    render(<DashboardSkeleton />);
    expect(screen.getByText("Mis Trabajos Prácticos")).toBeInTheDocument();
  });

  it("renderiza 3 cards skeleton", () => {
    const { container } = render(<DashboardSkeleton />);
    const cards = container.querySelectorAll(
      ".bg-white.border.border-gray-200.rounded-lg"
    );
    expect(cards).toHaveLength(3);
  });
});

describe("AssignmentsTableSkeleton", () => {
  it("renderiza el título Assignments", () => {
    render(<AssignmentsTableSkeleton />);
    expect(screen.getByText("Assignments")).toBeInTheDocument();
  });

  it("renderiza 4 filas skeleton", () => {
    const { container } = render(<AssignmentsTableSkeleton />);
    // cada fila tiene border-b border-gray-100
    const rows = container.querySelectorAll(
      ".border-b.border-gray-100.flex.gap-6.items-center"
    );
    expect(rows).toHaveLength(4);
  });
});

describe("ListSkeleton", () => {
  it("renderiza el título recibido", () => {
    render(<ListSkeleton title="Alumnos" />);
    expect(screen.getByRole("heading", { name: "Alumnos" })).toBeInTheDocument();
  });

  it("renderiza el número de filas indicado", () => {
    const { container } = render(<ListSkeleton title="Test" rows={4} />);
    const rows = container.querySelectorAll(
      ".border-b.border-gray-100.flex.gap-6.items-center"
    );
    expect(rows).toHaveLength(4);
  });

  it("usa 6 filas por defecto", () => {
    const { container } = render(<ListSkeleton title="Test" />);
    const rows = container.querySelectorAll(
      ".border-b.border-gray-100.flex.gap-6.items-center"
    );
    expect(rows).toHaveLength(6);
  });
});

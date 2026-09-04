import { render, screen } from "@testing-library/react";
import {
  DashboardLoading,
  AssignmentsLoading,
  AssignmentNuevoLoading,
  AssignmentEditarLoading,
  ComisionesLoading,
  ComisionNuevaLoading,
  ComisionEditarLoading,
  AlumnosLoading,
  GruposLoading,
} from "./RouteLoadingStates";

describe("RouteLoadingStates", () => {
  it("DashboardLoading renderiza el skeleton de dashboard", () => {
    render(<DashboardLoading />);
    expect(screen.getByText("Mis Trabajos Prácticos")).toBeInTheDocument();
  });

  it("AssignmentsLoading renderiza el skeleton de tabla de assignments", () => {
    render(<AssignmentsLoading />);
    expect(screen.getByText("Assignments")).toBeInTheDocument();
  });

  it("AssignmentNuevoLoading renderiza el formulario con el título correcto", () => {
    render(<AssignmentNuevoLoading />);
    expect(
      screen.getByRole("heading", { name: "Nuevo Assignment" })
    ).toBeInTheDocument();
  });

  it("AssignmentEditarLoading renderiza el formulario con el título correcto", () => {
    render(<AssignmentEditarLoading />);
    expect(
      screen.getByRole("heading", { name: "Editar Assignment" })
    ).toBeInTheDocument();
  });

  it("ComisionesLoading renderiza el skeleton de tabla de assignments", () => {
    render(<ComisionesLoading />);
    expect(screen.getByText("Assignments")).toBeInTheDocument();
  });

  it("ComisionNuevaLoading renderiza la lista con el título correcto", () => {
    render(<ComisionNuevaLoading />);
    expect(
      screen.getByRole("heading", { name: "Nueva Comisión" })
    ).toBeInTheDocument();
  });

  it("ComisionEditarLoading renderiza la lista con el título correcto", () => {
    render(<ComisionEditarLoading />);
    expect(
      screen.getByRole("heading", { name: "Editar Comisión" })
    ).toBeInTheDocument();
  });

  it("AlumnosLoading renderiza la lista con el título correcto", () => {
    render(<AlumnosLoading />);
    expect(screen.getByRole("heading", { name: "Alumnos" })).toBeInTheDocument();
  });

  it("GruposLoading renderiza la lista con el título correcto", () => {
    render(<GruposLoading />);
    expect(screen.getByRole("heading", { name: "Grupos" })).toBeInTheDocument();
  });
});

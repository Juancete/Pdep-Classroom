import { render, screen } from "@testing-library/react";
import { ParticipacionBadge, etiquetaDeCommits } from "./ParticipacionBadge";

describe("ParticipacionBadge", () => {
  it("muestra el porcentaje y los commits", () => {
    render(<ParticipacionBadge commits={12} porcentaje={60} />);
    expect(screen.getByText("60% · 12 commits")).toBeInTheDocument();
  });

  it("usa el singular 'commit' cuando hay uno solo", () => {
    render(<ParticipacionBadge commits={1} porcentaje={100} />);
    expect(screen.getByText("100% · 1 commit")).toBeInTheDocument();
  });

  it("muestra @username sólo si viene", () => {
    render(<ParticipacionBadge username="ana-garcia" commits={5} porcentaje={50} />);
    expect(screen.getByText("@ana-garcia")).toBeInTheDocument();
  });

  it("no muestra ningún username si no viene", () => {
    render(<ParticipacionBadge commits={5} porcentaje={50} />);
    expect(screen.queryByText(/^@/)).not.toBeInTheDocument();
  });

  it("el title menciona que es un indicador y no una nota", () => {
    render(<ParticipacionBadge username="ana" commits={5} porcentaje={50} />);
    const badge = screen.getByText("@ana").closest("span[title]");
    expect(badge).toHaveAttribute("title", expect.stringContaining("indicador"));
    expect(badge).toHaveAttribute("title", expect.stringContaining("no una nota"));
  });

  // El nombre accesible es corto (issue #122): un lector de pantalla no debe
  // escuchar el párrafo entero de `PARTICIPACION_AYUDA` por cada integrante.
  it("el aria-label es sólo el resumen puntual, sin la ayuda larga", () => {
    render(<ParticipacionBadge username="ana" commits={5} porcentaje={50} />);
    const badge = screen.getByText("@ana").closest("span[title]");
    expect(badge).toHaveAttribute("aria-label", "Participación de @ana: 50% (5 commits)");
  });

  it("el aria-label omite '@user' si no viene username", () => {
    render(<ParticipacionBadge commits={5} porcentaje={50} />);
    const badge = screen.getByText("50% · 5 commits").closest("span[title]");
    expect(badge).toHaveAttribute("aria-label", "Participación: 50% (5 commits)");
  });

  it("con 0 commits usa la clase ámbar", () => {
    render(<ParticipacionBadge commits={0} porcentaje={0} />);
    const badge = screen.getByText("0% · 0 commits").closest("span[title]");
    expect(badge?.className).toContain("bg-amber-50");
  });

  it("con más de 0 commits usa la clase gris (neutra)", () => {
    render(<ParticipacionBadge commits={3} porcentaje={30} />);
    const badge = screen.getByText("30% · 3 commits").closest("span[title]");
    expect(badge?.className).toContain("bg-gray-50");
  });
});

describe("etiquetaDeCommits", () => {
  it("usa el singular con 1", () => {
    expect(etiquetaDeCommits(1)).toBe("1 commit");
  });

  it("usa el plural con 0", () => {
    expect(etiquetaDeCommits(0)).toBe("0 commits");
  });

  it("usa el plural con más de 1", () => {
    expect(etiquetaDeCommits(12)).toBe("12 commits");
  });
});

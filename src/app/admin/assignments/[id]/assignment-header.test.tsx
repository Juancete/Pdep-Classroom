import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IndividualAssignment, GrupalAssignment } from "@/domain/entities";
import { AssignmentHeader } from "./assignment-header";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

function makeIndividualAssignment(): IndividualAssignment {
  const assignment = new IndividualAssignment();
  assignment.id = "a1";
  assignment.titulo = "Kata Funcional";
  assignment.tipo = "individual";
  assignment.slug = "kata-funcional";
  return assignment;
}

function makeGrupalAssignment(): GrupalAssignment {
  const assignment = new GrupalAssignment();
  assignment.id = "a2";
  assignment.titulo = "TP Objetos";
  assignment.tipo = "grupal";
  assignment.slug = "tp-objetos";
  assignment.maxIntegrantes = 3;
  return assignment;
}

describe("AssignmentHeader", () => {
  it("muestra el título, el link de volver y el de editar", () => {
    const markup = renderToStaticMarkup(
      <AssignmentHeader assignment={makeIndividualAssignment()} activa="detalle" />
    );
    expect(markup).toContain("Kata Funcional");
    expect(markup).toContain('href="/admin/assignments"');
    expect(markup).toContain('href="/admin/assignments/a1/edit"');
  });

  it("renderiza el slot de acciones", () => {
    const markup = renderToStaticMarkup(
      <AssignmentHeader
        assignment={makeIndividualAssignment()}
        activa="detalle"
        acciones={<button data-testid="accion-extra" />}
      />
    );
    expect(markup).toContain('data-testid="accion-extra"');
  });

  describe("pestañas de un TP individual", () => {
    const markup = renderToStaticMarkup(
      <AssignmentHeader assignment={makeIndividualAssignment()} activa="detalle" />
    );

    it("sólo muestra Detalle y Repos borrados", () => {
      expect(markup).toContain(">Detalle<");
      expect(markup).toContain(">Repos borrados<");
      expect(markup).not.toContain(">Grupos<");
      expect(markup).not.toContain(">Integrantes<");
    });
  });

  describe("pestañas de un TP grupal", () => {
    const markup = renderToStaticMarkup(
      <AssignmentHeader assignment={makeGrupalAssignment()} activa="detalle" />
    );

    it("muestra las cuatro con sus hrefs", () => {
      expect(markup).toContain('href="/admin/assignments/a2"');
      expect(markup).toContain('href="/admin/assignments/a2/grupos"');
      expect(markup).toContain('href="/admin/assignments/a2/historial-integrantes"');
      expect(markup).toContain('href="/admin/assignments/a2/historial-repos"');
      expect(markup).toContain(">Grupos<");
      expect(markup).toContain(">Integrantes<");
    });
  });

  it.each([
    ["detalle", "Detalle"],
    ["grupos", "Grupos"],
    ["integrantes", "Integrantes"],
    ["repos", "Repos borrados"],
  ] as const)("marca sólo la pestaña %s con aria-current", (activa, etiqueta) => {
    const markup = renderToStaticMarkup(
      <AssignmentHeader assignment={makeGrupalAssignment()} activa={activa} />
    );
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(markup).toMatch(new RegExp(`aria-current="page"[^>]*>${etiqueta}<`));
  });
});

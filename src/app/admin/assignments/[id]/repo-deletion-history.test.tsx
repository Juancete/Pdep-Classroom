import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RepoDeletionAttempt } from "@/domain/entities";
import { RepoDeletionHistory } from "./repo-deletion-history";

function attempt(overrides: Partial<RepoDeletionAttempt> = {}) {
  const item = new RepoDeletionAttempt();
  item.id = "attempt-1";
  item.operationId = "00000000-0000-4000-8000-000000000001";
  item.assignmentId = "a1";
  item.entregaId = "e1";
  item.repoName = "tp-ana";
  item.requestedBy = "docente";
  item.startedAt = new Date("2026-08-14T12:00:00Z");
  return Object.assign(item, overrides);
}

function history(items: RepoDeletionAttempt[], overrides = {}) {
  return {
    items,
    page: 1,
    pageSize: 25,
    total: items.length,
    totalPages: 1,
    ...overrides,
  };
}

describe("RepoDeletionHistory", () => {
  it("muestra el estado vacío", () => {
    const html = renderToStaticMarkup(
      <RepoDeletionHistory assignmentId="a1" history={history([])} />
    );

    expect(html).toContain("Todavía no hay intentos");
  });

  it("muestra actor, repo, operación, estado y error", () => {
    const html = renderToStaticMarkup(
      <RepoDeletionHistory
        assignmentId="a1"
        history={history([
          attempt({ status: "failed", error: "GitHub no disponible" }),
        ])}
      />
    );

    expect(html).toContain("tp-ana");
    expect(html).toContain("docente");
    expect(html).toContain("00000000");
    expect(html).toContain("Fallido");
    expect(html).toContain("GitHub no disponible");
  });

  it("incluye navegación paginada completa", () => {
    const html = renderToStaticMarkup(
      <RepoDeletionHistory
        assignmentId="a1"
        history={history([attempt()], { page: 2, total: 60, totalPages: 3 })}
      />
    );

    expect(html).toContain("Página 2 de 3");
    expect(html).toContain("repoDeletionPage=1");
    expect(html).toContain("repoDeletionPage=3");
  });
});

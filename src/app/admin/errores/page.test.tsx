import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorLog } from "@/domain/entities";

const mockRequireAdmin = vi.fn();
const mockGetPage = vi.fn();
const mockGetUnread = vi.fn();

vi.mock("@/lib/session", () => ({ requireAdmin: () => mockRequireAdmin() }));
vi.mock("@/lib/repositories", () => ({
  getErrorLogsPage: (...args: unknown[]) => mockGetPage(...args),
  getUnreadErrorLogCount: () => mockGetUnread(),
}));
vi.mock("./error-log-actions", () => ({
  ErrorLogBulkActions: ({ unread }: { unread: number }) => <div>bulk-{unread}</div>,
  AcknowledgeErrorButton: ({ id }: { id: string }) => <button>ack-{id}</button>,
}));

import AdminErroresPage from "./page";

function errorLog(): ErrorLog {
  return Object.assign(new ErrorLog(), {
    id: "e1",
    route: "POST /api/test",
    message: "DB caída",
    context: { assignmentId: "a1" },
    fingerprint: "f".repeat(64),
    count: 3,
    firstSeenAt: new Date("2026-08-20T10:00:00Z"),
    lastSeenAt: new Date("2026-08-21T10:00:00Z"),
  });
}

describe("AdminErroresPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUnread.mockResolvedValue(1);
    mockGetPage.mockResolvedValue({
      items: [errorLog()], page: 1, pageSize: 25, total: 1, totalPages: 1,
      routes: ["POST /api/test"],
    });
  });

  it("protege la página y renderiza tabla, contexto y acciones", async () => {
    const html = renderToStaticMarkup(await AdminErroresPage({ searchParams: Promise.resolve({}) }));
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
    expect(html).toContain("Errores");
    expect(html).toContain("POST /api/test");
    expect(html).toContain("DB caída");
    expect(html).toContain("assignmentId");
    expect(html).toContain("No leído");
    expect(html).toContain("ack-e1");
  });

  it("normaliza página y aplica filtro exacto", async () => {
    await AdminErroresPage({ searchParams: Promise.resolve({ page: "no", route: "POST /api/test" }) });
    expect(mockGetPage).toHaveBeenCalledWith({ page: 1, route: "POST /api/test" });
  });

  it("distingue el vacío filtrado", async () => {
    mockGetPage.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0, totalPages: 1, routes: [] });
    const html = renderToStaticMarkup(await AdminErroresPage({ searchParams: Promise.resolve({ route: "GET /x" }) }));
    expect(html).toContain("No hay errores para esta ruta");
  });

  it("muestra el estado vacío general cuando todavía no hay registros", async () => {
    mockGetPage.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0, totalPages: 1, routes: [] });
    const html = renderToStaticMarkup(await AdminErroresPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Todavía no hay errores registrados");
  });
});

import { describe, it, expect } from "vitest";
import { RepoDeletionAttempt } from "./RepoDeletionAttempt";

function nuevoIntento(overrides: Partial<RepoDeletionAttempt> = {}): RepoDeletionAttempt {
  const attempt = new RepoDeletionAttempt();
  attempt.operationId = "op-1";
  attempt.assignmentId = "a1";
  attempt.entregaId = "e1";
  attempt.repoName = "org-repo";
  attempt.requestedBy = "docente1";
  return Object.assign(attempt, overrides);
}

// Fase 2 de la auditoría de dominio: antes `status`/`completedAt`/`error`
// se mutaban directamente en `RepoDeletionAttemptRepository.ts` en tres
// lugares con leve divergencia entre ellos (el camino exitoso limpiaba
// `error`, el de fallo no tocaba nada más) — estos métodos son la única
// fuente de esa coherencia.
describe("RepoDeletionAttempt.marcarBorrado", () => {
  it("pasa a 'deleted', sella completedAt y limpia error", () => {
    const attempt = nuevoIntento({ status: "pending", error: "algo previo" });

    attempt.marcarBorrado();

    expect(attempt.status).toBe("deleted");
    expect(attempt.completedAt).toBeInstanceOf(Date);
    expect(attempt.error).toBeUndefined();
  });
});

describe("RepoDeletionAttempt.marcarYaAusente", () => {
  it("pasa a 'already_absent', sella completedAt y limpia error", () => {
    const attempt = nuevoIntento({ status: "pending", error: "algo previo" });

    attempt.marcarYaAusente();

    expect(attempt.status).toBe("already_absent");
    expect(attempt.completedAt).toBeInstanceOf(Date);
    expect(attempt.error).toBeUndefined();
  });
});

describe("RepoDeletionAttempt.marcarFallido", () => {
  it("pasa a 'failed', sella completedAt y conserva el motivo", () => {
    const attempt = nuevoIntento({ status: "pending" });

    attempt.marcarFallido("GitHub no respondió");

    expect(attempt.status).toBe("failed");
    expect(attempt.completedAt).toBeInstanceOf(Date);
    expect(attempt.error).toBe("GitHub no respondió");
  });
});

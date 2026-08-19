import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

type SnapshotTable = {
  name: string;
  columns: Record<string, { default?: string; nullable?: boolean }>;
  indexes: Array<{ keyName: string }>;
  foreignKeys: Record<string, { deleteRule?: string }>;
};

describe("migrations", () => {
  it("garantiza una única comisión activa con un índice único parcial", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "migrations",
        "Migration20260527120000_add_unique_active_comision_index.ts"
      ),
      "utf8"
    );

    expect(migration).toContain('create unique index "comision_unica_activa_idx"');
    expect(migration).toContain('on "comision" ("activa") where "activa" is true');
    expect(migration).toContain('drop index if exists "comision_unica_activa_idx"');
    expect(migration).toContain("hay mas de una comision activa");
  });

  it("garantiza unicidad de entregas por repo, alumno y grupo", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "migrations",
        "Migration20260528123000_unique_entrega_logica.ts"
      ),
      "utf8"
    );

    expect(migration).toContain('create unique index "entrega_repo_name_unique_idx"');
    expect(migration).toContain('on "entrega" (lower("repo_name"))');
    expect(migration).toContain('group by lower("repo_name")');
    expect(migration).toContain('create unique index "entrega_assignment_alumno_unique_idx"');
    expect(migration).toContain('create unique index "entrega_assignment_grupo_unique_idx"');
    expect(migration).toContain("hay repo_name duplicados");
    expect(migration).toContain("hay entregas individuales duplicadas");
    expect(migration).toContain("hay entregas grupales duplicadas");
  });

  it("agrega el estado persistente de Google Groups con default pendiente", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "migrations",
        "Migration20260610120000_add_google_group_state_to_alumno.ts"
      ),
      "utf8"
    );

    expect(migration).toContain('"google_group_estado"');
    expect(migration).toContain("default 'pendiente'");
    expect(migration).toContain('"google_group_email_sincronizado"');
    expect(migration).toContain('"google_group_emails_pendientes_baja"');
    expect(migration).toContain(
      '"google_group_emails_pendientes_baja" text[] not null default \'{}\''
    );
    expect(migration).toContain('"google_group_ultimo_error"');
  });

  it("garantiza membresía única por assignment y prepara el locking de cupos", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "migrations",
        "Migration20260813190000_group_membership_invariants.ts"
      ),
      "utf8"
    );

    expect(migration).toContain(
      'create unique index "grupo_alumnos_assignment_alumno_unique_idx"'
    );
    expect(migration).toContain(
      'constraint "grupo_assignment_nombre_paradigma_unique_idx" unique ("assignment_id", "nombre", "paradigma")'
    );
    expect(migration).toContain(
      'constraint "grupo_alumnos_grupo_assignment_foreign"'
    );
    expect(migration).toContain(
      'create trigger "grupo_alumnos_completar_assignment"'
    );
    expect(migration).toContain("hay alumnos en mas de un grupo");
    expect(migration).toContain("hay grupos con mas alumnos");
    expect(migration).toContain("hay nombres y paradigmas duplicados");
  });

  it("crea una auditoría durable para cada intento de borrado de repos", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "migrations",
        "Migration20260814140000_repo_deletion_audit.ts"
      ),
      "utf8"
    );

    expect(migration).toContain('create table "repo_deletion_attempt"');
    expect(migration).toContain('"operation_id" uuid not null');
    expect(migration).toContain("'pending', 'deleted', 'already_absent', 'failed'");
    expect(migration).toContain(
      'repo_deletion_attempt_assignment_started_idx'
    );
    expect(migration).not.toContain("foreign key");
  });

  it("persiste y garantiza el nombre normalizado de cada grupo", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "migrations",
        "Migration20260814160000_group_repo_name.ts"
      ),
      "utf8"
    );

    expect(migration).toContain('add column "nombre_normalizado"');
    expect(migration).toContain(
      'constraint "grupo_assignment_nombre_normalizado_unique_idx"'
    );
    expect(migration).toContain("no contiene letras ni números");
    expect(migration).toContain("hay nombres que generan el mismo identificador");
  });

  it("crea una auditoría durable para cada cambio de integrantes de un grupo", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "migrations",
        "Migration20260818120000_membership_audit.ts"
      ),
      "utf8"
    );

    expect(migration).toContain('create table "cambio_membresia"');
    expect(migration).toContain(
      "'alta', 'baja', 'cambio'"
    );
    expect(migration).toContain("'alumno', 'docente'");
    expect(migration).toContain(
      'cambio_membresia_assignment_creado_idx'
    );
    expect(migration).toContain(
      'cambio_membresia_alumno_creado_idx'
    );
    expect(migration).toContain('drop table if exists "cambio_membresia"');
    expect(migration).not.toContain("foreign key");
  });

  it("agrega el resultado cacheado de autograding a entrega", () => {
    const migration = readFileSync(
      join(process.cwd(), "migrations", "Migration20260819120000_autograding.ts"),
      "utf8"
    );

    expect(migration).toContain('add column "autograding_resultado_nombre"');
    expect(migration).toContain("'sin_consultar'");
    expect(migration).toContain("'sin_autograding'");
    expect(migration).toContain("'sin_ejecuciones'");
    expect(migration).toContain("'pendiente'");
    expect(migration).toContain("'aprobado'");
    expect(migration).toContain("'fallido'");
    expect(migration).toContain("'cancelado'");
    expect(migration).toContain("'error_infra'");
    expect(migration).toContain("default 'sin_consultar'");
    expect(migration).toContain('"autograding_run_id" varchar(255) null');
    expect(migration).toContain('"autograding_run_url" varchar(255) null');
    expect(migration).toContain('"autograding_commit_sha" varchar(255) null');
    expect(migration).toContain('"autograding_ejecutado_en" timestamptz null');
    expect(migration).toContain('"autograding_actualizado_en" timestamptz null');
    expect(migration).toContain('create index "entrega_autograding_resultado_idx"');
    expect(migration).toContain(
      'drop column "autograding_resultado_nombre"'
    );
    expect(migration).not.toContain("foreign key");
  });

  it("mantiene el snapshot alineado con Google Groups y las cascadas", () => {
    const snapshot = JSON.parse(
      readFileSync(
        join(process.cwd(), "migrations", ".snapshot-pdep_classroom.json"),
        "utf8"
      )
    ) as { tables: SnapshotTable[] };
    const alumno = snapshot.tables.find((table) => table.name === "alumno");
    const assignment = snapshot.tables.find(
      (table) => table.name === "assignment"
    );
    const grupo = snapshot.tables.find((table) => table.name === "grupo");
    const grupoAlumnos = snapshot.tables.find(
      (table) => table.name === "grupo_alumnos"
    );
    const repoDeletionAttempt = snapshot.tables.find(
      (table) => table.name === "repo_deletion_attempt"
    );
    const entrega = snapshot.tables.find((table) => table.name === "entrega");
    const cambioMembresia = snapshot.tables.find(
      (table) => table.name === "cambio_membresia"
    );

    expect(alumno?.columns.google_group_emails_pendientes_baja).toMatchObject({
      nullable: false,
      default: "'{}'",
    });
    expect(alumno?.columns).toHaveProperty("google_group_estado");
    expect(alumno?.columns).toHaveProperty("google_group_email_sincronizado");
    expect(alumno?.columns).toHaveProperty("google_group_ultimo_error");
    expect(alumno?.columns).toHaveProperty("google_group_ultimo_intento_en");
    expect(alumno?.columns).toHaveProperty("google_group_sincronizado_en");
    expect(
      alumno?.foreignKeys.alumno_comision_id_foreign.deleteRule
    ).toBe("cascade");
    expect(
      assignment?.foreignKeys.assignment_comision_id_foreign.deleteRule
    ).toBe("cascade");
    expect(grupo?.indexes).toContainEqual(
      expect.objectContaining({ keyName: "grupo_id_assignment_unique" })
    );
    expect(grupo?.indexes).toContainEqual(
      expect.objectContaining({
        keyName: "grupo_assignment_nombre_normalizado_unique_idx",
      })
    );
    expect(grupo?.columns).toHaveProperty("nombre_normalizado");
    expect(grupoAlumnos?.columns).toHaveProperty("assignment_id");
    expect(grupoAlumnos?.indexes).toContainEqual(
      expect.objectContaining({
        keyName: "grupo_alumnos_assignment_alumno_unique_idx",
      })
    );
    expect(grupoAlumnos?.foreignKeys).toHaveProperty(
      "grupo_alumnos_grupo_assignment_foreign"
    );
    expect(repoDeletionAttempt?.columns).toHaveProperty("operation_id");
    expect(repoDeletionAttempt?.columns).toHaveProperty("requested_by");
    expect(repoDeletionAttempt?.foreignKeys).toEqual({});
    expect(
      entrega?.foreignKeys.entrega_grupo_id_foreign.deleteRule
    ).toBe("set null");
    expect(cambioMembresia?.columns).toHaveProperty("assignment_id");
    expect(cambioMembresia?.columns).toHaveProperty("alumno_id");
    expect(cambioMembresia?.columns).toHaveProperty("grupo_origen_id");
    expect(cambioMembresia?.columns).toHaveProperty("grupo_destino_id");
    expect(cambioMembresia?.indexes).toContainEqual(
      expect.objectContaining({
        keyName: "cambio_membresia_assignment_creado_idx",
      })
    );
    expect(cambioMembresia?.indexes).toContainEqual(
      expect.objectContaining({
        keyName: "cambio_membresia_alumno_creado_idx",
      })
    );
    expect(cambioMembresia?.foreignKeys).toEqual({});
    expect(entrega?.columns).toHaveProperty("autograding_resultado_nombre");
    expect(entrega?.columns.autograding_resultado_nombre).toMatchObject({
      nullable: false,
      default: "'sin_consultar'",
    });
    expect(entrega?.columns).toHaveProperty("autograding_run_id");
    expect(entrega?.columns).toHaveProperty("autograding_run_url");
    expect(entrega?.columns).toHaveProperty("autograding_commit_sha");
    expect(entrega?.columns).toHaveProperty("autograding_ejecutado_en");
    expect(entrega?.columns).toHaveProperty("autograding_actualizado_en");
    expect(entrega?.indexes).toContainEqual(
      expect.objectContaining({ keyName: "entrega_autograding_resultado_idx" })
    );
  });
});

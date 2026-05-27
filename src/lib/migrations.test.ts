import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

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
});

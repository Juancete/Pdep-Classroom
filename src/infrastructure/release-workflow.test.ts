import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Guard sobre el pipeline de release: el deploy a producción se hace desde
// GitHub Actions y sólo después de migrar la base. Estas aserciones evitan
// que alguien reordene los jobs o vuelva a encender el auto-deploy de Vercel.

function leerWorkflowDeRelease(): string {
  return readFileSync(
    join(process.cwd(), ".github", "workflows", "deploy-production.yml"),
    "utf8"
  );
}

describe("release a producción", () => {
  it("el deploy sólo corre después de migrar, y migrar después de verificar", () => {
    const workflow = leerWorkflowDeRelease();

    expect(workflow).toContain("needs: verificar");
    expect(workflow).toContain("needs: migrate");
    expect(workflow.indexOf("needs: verificar")).toBeLessThan(
      workflow.indexOf("needs: migrate")
    );
  });

  it("la migración usa el script release:migrate", () => {
    expect(leerWorkflowDeRelease()).toContain("pnpm release:migrate");
  });

  it("el deploy usa el build prebuilt de producción", () => {
    expect(leerWorkflowDeRelease()).toContain("--prebuilt --prod");
  });

  it("el workflow se dispara con push a master", () => {
    expect(leerWorkflowDeRelease()).toContain("branches: [master]");
  });

  it("la integración Git de Vercel no buildea", () => {
    const vercelConfig = JSON.parse(
      readFileSync(join(process.cwd(), "vercel.json"), "utf8")
    ) as { ignoreCommand?: string };

    expect(vercelConfig.ignoreCommand).toBe("exit 0");
  });
});

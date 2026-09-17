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
  it("el build, la migración y la promoción corren en ese orden", () => {
    const workflow = leerWorkflowDeRelease();

    expect(workflow).toContain("needs: verificar");
    expect(workflow).toContain("needs: build");
    expect(workflow).toContain("needs: [build, migrate]");
    expect(workflow.indexOf("needs: verificar")).toBeLessThan(
      workflow.indexOf("needs: build")
    );
    expect(workflow.indexOf("needs: build")).toBeLessThan(
      workflow.indexOf("needs: [build, migrate]")
    );
  });

  it("la migración usa el script release:migrate", () => {
    expect(leerWorkflowDeRelease()).toContain("pnpm release:migrate");
  });

  it("el build es un deployment de producción staged, sin dominio", () => {
    expect(leerWorkflowDeRelease()).toContain("vercel deploy --prod --skip-domain");
  });

  it("la promoción no reconstruye: usa vercel promote", () => {
    expect(leerWorkflowDeRelease()).toContain("vercel promote");
  });

  it("el workflow se dispara con push a master", () => {
    expect(leerWorkflowDeRelease()).toContain("branches: [master]");
  });

  it("no se puede desplegar otra rama por workflow_dispatch", () => {
    expect(leerWorkflowDeRelease()).toContain("github.ref != 'refs/heads/master'");
  });

  it("la integración Git de Vercel no despliega", () => {
    const vercelConfig = JSON.parse(
      readFileSync(join(process.cwd(), "vercel.json"), "utf8")
    ) as { git?: { deploymentEnabled?: boolean } };

    expect(vercelConfig.git?.deploymentEnabled).toBe(false);
  });
});

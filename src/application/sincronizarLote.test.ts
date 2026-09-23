import { describe, expect, it } from "vitest";
import { Entrega } from "@/domain/entities";
import { sincronizarLoteDeEntregas } from "./sincronizarLote";

function entregaConRepo(
  index: number,
  overrides?: Partial<Pick<Entrega, "repoName" | "repoDeleted">>
): Entrega {
  const item = new Entrega();
  item.id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  item.repoName = `tp-alumno-${index}`;
  item.repoUrl = `https://github.com/org/tp-alumno-${index}`;
  Object.assign(item, overrides);
  return item;
}

describe("sincronizarLoteDeEntregas", () => {
  it("omite una entrega sin repo", async () => {
    const sinRepo = new Entrega();
    sinRepo.id = "sin-repo";

    const resultado = await sincronizarLoteDeEntregas([sinRepo], {
      forzar: false,
      estaFresca: () => false,
      sincronizarUna: async () => "actualizada",
    });

    expect(resultado).toEqual({ actualizadas: 0, omitidas: 1, fallidas: [] });
  });

  it("omite una entrega con el repo borrado", async () => {
    const borrada = entregaConRepo(1, { repoDeleted: true });

    const resultado = await sincronizarLoteDeEntregas([borrada], {
      forzar: false,
      estaFresca: () => false,
      sincronizarUna: async () => "actualizada",
    });

    expect(resultado).toEqual({ actualizadas: 0, omitidas: 1, fallidas: [] });
  });

  it("respeta estaFresca y omite lo que ya está fresco", async () => {
    const entrega = entregaConRepo(1);
    let llamadas = 0;

    const resultado = await sincronizarLoteDeEntregas([entrega], {
      forzar: false,
      estaFresca: () => true,
      sincronizarUna: async () => {
        llamadas++;
        return "actualizada";
      },
    });

    expect(resultado).toEqual({ actualizadas: 0, omitidas: 1, fallidas: [] });
    expect(llamadas).toBe(0);
  });

  it("forzar ignora estaFresca", async () => {
    const entrega = entregaConRepo(1);

    const resultado = await sincronizarLoteDeEntregas([entrega], {
      forzar: true,
      estaFresca: () => true,
      sincronizarUna: async () => "actualizada",
    });

    expect(resultado).toEqual({ actualizadas: 1, omitidas: 0, fallidas: [] });
  });

  it("un fallo no aborta el lote y queda en fallidas con el repoName", async () => {
    const falla = entregaConRepo(1);
    const ok = entregaConRepo(2);

    const resultado = await sincronizarLoteDeEntregas([falla, ok], {
      forzar: false,
      estaFresca: () => false,
      sincronizarUna: async (entrega) =>
        entrega.id === falla.id ? { error: "timeout de GitHub" } : "actualizada",
    });

    expect(resultado.actualizadas).toBe(1);
    expect(resultado.omitidas).toBe(0);
    expect(resultado.fallidas).toEqual([
      { repoName: "tp-alumno-1", error: "timeout de GitHub" },
    ]);
  });

  it("cuenta bien actualizadas y omitidas mezcladas en el mismo lote", async () => {
    const fresca = entregaConRepo(1);
    const pendienteUno = entregaConRepo(2);
    const pendienteDos = entregaConRepo(3);

    const resultado = await sincronizarLoteDeEntregas(
      [fresca, pendienteUno, pendienteDos],
      {
        forzar: false,
        estaFresca: (entrega) => entrega.id === fresca.id,
        sincronizarUna: async () => "actualizada",
      }
    );

    expect(resultado).toEqual({ actualizadas: 2, omitidas: 1, fallidas: [] });
  });
});

import { describe, it, expect } from "vitest";
import { Collection } from "@mikro-orm/core";
import { Alumno, Entrega, Grupo, GrupalAssignment, MiembroDeGrupo } from "@/domain/entities";
import { resumirGrupoParaAdmin } from "./grupo-resumen";

function makeGrupo(
  id: string,
  usernames: string[],
  overrides: { assignmentId?: string; maxIntegrantes?: number } = {}
): Grupo {
  const grupo = new Grupo();
  grupo.id = id;
  grupo.nombre = `Grupo ${id}`;
  grupo.paradigma = "funcional";
  grupo.maxIntegrantes = overrides.maxIntegrantes ?? 3;
  grupo.assignment = Object.assign(new GrupalAssignment(), {
    id: overrides.assignmentId ?? "a1",
    titulo: "TP Funcional",
  });
  const items = usernames.map((githubUsername) =>
    Object.assign(new MiembroDeGrupo(), { githubUsername })
  );
  grupo.miembros = {
    getItems: () => items,
    get length() {
      return items.length;
    },
  } as unknown as Collection<MiembroDeGrupo>;
  return grupo;
}

function makeEntrega(overrides: Partial<Entrega> = {}): Entrega {
  return Object.assign(new Entrega(), {
    repoUrl: "https://github.com/org/repo",
    repoName: "repo",
    provisionEstado: "activa",
    repoDeleted: false,
    ciResultadoNombre: "passing",
    ciDetalleUrl: "https://ci/1",
    ...overrides,
  });
}

const SIN_ALUMNOS = new Map<string, Alumno>();

describe("resumirGrupoParaAdmin", () => {
  it("copia los datos básicos del grupo", () => {
    const grupo = makeGrupo("g1", ["ana"]);
    const resumen = resumirGrupoParaAdmin(grupo, {
      grupos: [grupo],
      alumnosPorUsername: SIN_ALUMNOS,
      entregasPorGrupo: new Map(),
      conDetalleDeEntrega: false,
    });

    expect(resumen).toMatchObject({
      id: "g1",
      nombre: "Grupo g1",
      maxIntegrantes: 3,
      estaLleno: false,
      etiquetaCupo: "1/3 integrantes",
      tipoDeIntegrantes: "alumnos",
    });
  });

  it("calcula los destinos: mismo TP, con cupo, sin incluirse ni otros TPs", () => {
    const origen = makeGrupo("g1", ["ana"]);
    const conCupo = makeGrupo("g2", ["bob"]);
    const lleno = makeGrupo("g3", ["cora"], { maxIntegrantes: 1 });
    const otroTp = makeGrupo("g4", ["dan"], { assignmentId: "a2" });

    const resumen = resumirGrupoParaAdmin(origen, {
      grupos: [origen, conCupo, lleno, otroTp],
      alumnosPorUsername: SIN_ALUMNOS,
      entregasPorGrupo: new Map(),
      conDetalleDeEntrega: false,
    });

    expect(resumen.destinos).toEqual([{ id: "g2", nombre: "Grupo g2", conEntrega: false }]);
  });

  it("cada destino indica si su grupo tiene entrega", () => {
    const origen = makeGrupo("g1", ["ana"]);
    const conEntrega = makeGrupo("g2", ["bob"]);
    const sinEntrega = makeGrupo("g3", ["cora"]);

    const resumen = resumirGrupoParaAdmin(origen, {
      grupos: [origen, conEntrega, sinEntrega],
      alumnosPorUsername: SIN_ALUMNOS,
      entregasPorGrupo: new Map([["g2", makeEntrega()]]),
      conDetalleDeEntrega: false,
    });

    expect(resumen.destinos).toEqual([
      { id: "g2", nombre: "Grupo g2", conEntrega: true },
      { id: "g3", nombre: "Grupo g3", conEntrega: false },
    ]);
  });

  it("usa el nombre completo del alumno y cae al username si no hay alumno", () => {
    const grupo = makeGrupo("g1", ["Ana", "profe"]);
    const alumnosPorUsername = new Map([
      ["ana", Object.assign(new Alumno(), { githubUsername: "ana", apellido: "García", nombre: "Ana" })],
    ]);

    const resumen = resumirGrupoParaAdmin(grupo, {
      grupos: [grupo],
      alumnosPorUsername,
      entregasPorGrupo: new Map(),
      conDetalleDeEntrega: false,
    });

    expect(resumen.miembros).toEqual([
      { username: "Ana", nombreCompleto: "García, Ana" },
      { username: "profe", nombreCompleto: "profe" },
    ]);
  });

  it("sin entrega no trae el campo entrega", () => {
    const grupo = makeGrupo("g1", ["ana"]);
    const resumen = resumirGrupoParaAdmin(grupo, {
      grupos: [grupo],
      alumnosPorUsername: SIN_ALUMNOS,
      entregasPorGrupo: new Map(),
      conDetalleDeEntrega: true,
    });

    expect(resumen.entrega).toBeUndefined();
  });

  it("sin detalle la entrega trae sólo el repo, sin CI ni último push", () => {
    const grupo = makeGrupo("g1", ["ana"]);
    const resumen = resumirGrupoParaAdmin(grupo, {
      grupos: [grupo],
      alumnosPorUsername: SIN_ALUMNOS,
      entregasPorGrupo: new Map([["g1", makeEntrega({ ultimoPushEn: new Date("2026-03-15T12:00:00Z"), ultimoPushPor: "ana" })]]),
      conDetalleDeEntrega: false,
    });

    expect(resumen.entrega).toEqual({
      estadoRepo: "activo",
      repoUrl: "https://github.com/org/repo",
    });
  });

  it("con detalle suma CI y último push", () => {
    const grupo = makeGrupo("g1", ["ana"]);
    const pushEn = new Date("2026-03-15T12:00:00Z");
    const resumen = resumirGrupoParaAdmin(grupo, {
      grupos: [grupo],
      alumnosPorUsername: SIN_ALUMNOS,
      entregasPorGrupo: new Map([["g1", makeEntrega({ ultimoPushEn: pushEn, ultimoPushPor: "ana" })]]),
      conDetalleDeEntrega: true,
    });

    expect(resumen.entrega?.ci).toEqual({ resultadoNombre: "passing", detalleUrl: "https://ci/1" });
    expect(resumen.entrega?.ultimoPush).toEqual({
      fecha: pushEn.toLocaleDateString("es-AR"),
      por: "ana",
    });
  });

  it("con detalle pero sin push registrado omite ultimoPush, y sin autor usa un guion", () => {
    const grupo = makeGrupo("g1", ["ana"]);
    const sinPush = resumirGrupoParaAdmin(grupo, {
      grupos: [grupo],
      alumnosPorUsername: SIN_ALUMNOS,
      entregasPorGrupo: new Map([["g1", makeEntrega()]]),
      conDetalleDeEntrega: true,
    });
    const sinAutor = resumirGrupoParaAdmin(grupo, {
      grupos: [grupo],
      alumnosPorUsername: SIN_ALUMNOS,
      entregasPorGrupo: new Map([["g1", makeEntrega({ ultimoPushEn: new Date("2026-03-15T12:00:00Z") })]]),
      conDetalleDeEntrega: true,
    });

    expect(sinPush.entrega?.ultimoPush).toBeUndefined();
    expect(sinAutor.entrega?.ultimoPush?.por).toBe("—");
  });

  it("con contexto de assignment suma título y paradigma; sin él no", () => {
    const grupo = makeGrupo("g1", ["ana"]);
    const base = {
      grupos: [grupo],
      alumnosPorUsername: SIN_ALUMNOS,
      entregasPorGrupo: new Map<string, Entrega>(),
      conDetalleDeEntrega: false,
    };

    const con = resumirGrupoParaAdmin(grupo, { ...base, conContextoDeAssignment: true });
    const sin = resumirGrupoParaAdmin(grupo, base);

    expect(con.assignmentTitulo).toBe("TP Funcional");
    expect(con.paradigma).toBe("funcional");
    expect(sin.assignmentTitulo).toBeUndefined();
    expect(sin.paradigma).toBeUndefined();
  });
});

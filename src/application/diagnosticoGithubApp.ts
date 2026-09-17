import type { ConfiguracionDeApp } from "@/infrastructure/github";

export type DiagnosticoDeApp = { ok: boolean; detalle: string };

type NivelDePermiso = "read" | "write";

type PermisoRequerido = { nombre: string; minimo: NivelDePermiso };

// Lo que Classroom necesita de la GitHub App para operar completo (issue
// #98): crear/borrar repos y agregar colaboradores (`administration`,
// `contents`), leer colaboradores (`members`) y leer/reejecutar CI
// (`checks`). `checks` alcanza con `read` para *ver* el estado — sólo la
// reejecución (`POST .../rerun`) necesita `write`, así que ese caso se
// señala aparte en vez de contar como permiso faltante (ver más abajo).
const PERMISOS_REQUERIDOS: PermisoRequerido[] = [
  { nombre: "administration", minimo: "write" },
  { nombre: "contents", minimo: "write" },
  { nombre: "members", minimo: "read" },
  { nombre: "checks", minimo: "read" },
];

// Eventos de los que depende cada webhook handler (ver "CI en Classroom" y
// "Webhooks de GitHub" en el README): `check_suite` resincroniza CI,
// `push` actualiza el último push conocido, `repository` sigue
// renames/deletes y `member` reconcilia colaboradores.
const EVENTOS_REQUERIDOS = ["check_suite", "push", "repository", "member"];

function cumplePermiso(permisos: Record<string, string>, requerido: PermisoRequerido): boolean {
  const valor = permisos[requerido.nombre];
  if (!valor) return false;
  return requerido.minimo === "read" || valor === "write";
}

function describirPermisoFaltante(requerido: PermisoRequerido): string {
  return requerido.minimo === "write"
    ? `permiso ${requerido.nombre} (write)`
    : `permiso ${requerido.nombre}`;
}

/**
 * Compara la configuración real de la GitHub App (`getConfiguracionDeApp`)
 * contra lo que Classroom necesita y arma el diagnóstico que se muestra en
 * `/admin/operaciones`. `config.permisos`/`config.eventos` son los de la
 * *instalación* en la org (lo que el token realmente tiene), no los
 * configurados en la App — por eso también se chequea
 * `config.aprobacionPendiente`, que indica que la App pide algo que la
 * instalación todavía no aprobó. Sin cadenas de `if` por tipo: itera las
 * tablas de requisitos y acumula lo que falta.
 */
export function evaluarConfiguracionDeApp(config: ConfiguracionDeApp): DiagnosticoDeApp {
  const faltantes: string[] = [];

  for (const requerido of PERMISOS_REQUERIDOS) {
    if (!cumplePermiso(config.permisos, requerido)) {
      faltantes.push(describirPermisoFaltante(requerido));
    }
  }

  const eventosFaltantes = EVENTOS_REQUERIDOS.filter(
    (evento) => !config.eventos.includes(evento)
  );
  if (eventosFaltantes.length > 0) {
    faltantes.push(`eventos ${eventosFaltantes.join("/")}`);
  }

  if (config.webhook === null || config.webhook.url.trim() === "") {
    faltantes.push("webhook");
  }

  if (config.aprobacionPendiente) {
    faltantes.push("aprobar los permisos nuevos en la instalación de la org");
  }

  if (faltantes.length > 0) {
    return { ok: false, detalle: `Faltan: ${faltantes.join(", ")}` };
  }

  // `checks` cumple el mínimo requerido (`read`) pero no llega a `write`: la
  // App puede leer el estado de CI, pero la reejecución manual va a fallar.
  // No es un "falta" (el mínimo está cubierto) — es una advertencia aparte.
  const checksSoloRead = config.permisos.checks !== "write";
  const detalle = checksSoloRead
    ? "Permisos, eventos y webhook completos · checks sólo read: reejecución de CI deshabilitada"
    : "Permisos, eventos y webhook completos";

  return { ok: true, detalle };
}

import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIJO_FIRMA = "sha256=";

function getSecretos(): string[] {
  return (process.env.GITHUB_WEBHOOK_SECRET ?? "")
    .split(",")
    .map((secreto) => secreto.trim())
    .filter((secreto) => secreto.length > 0);
}

function firmaParaSecreto(raw: string, secreto: string): string {
  return PREFIJO_FIRMA + createHmac("sha256", secreto).update(raw, "utf8").digest("hex");
}

function coincideConFirmaEsperada(firmaRecibida: string, firmaEsperada: string): boolean {
  const bufferRecibido = Buffer.from(firmaRecibida, "utf8");
  const bufferEsperado = Buffer.from(firmaEsperada, "utf8");
  // `timingSafeEqual` tira si los buffers tienen largo distinto — se
  // verifica antes, sin que ese chequeo filtre nada del secreto: el largo
  // de una firma válida es siempre fijo (prefijo + 64 hex de sha256).
  if (bufferRecibido.length !== bufferEsperado.length) return false;
  return timingSafeEqual(bufferRecibido, bufferEsperado);
}

/**
 * Verifica la firma `X-Hub-Signature-256` de un webhook de GitHub contra
 * `GITHUB_WEBHOOK_SECRET`. Admite una lista de secretos separados por coma
 * para poder rotar sin downtime: se agrega el secreto nuevo a la env var
 * junto al viejo, se cambia en GitHub, y recién después se saca el viejo de
 * la env var — mientras tanto, cualquiera de los dos firma un delivery
 * válido.
 *
 * Sin ningún secreto configurado, siempre devuelve `false` — la feature es
 * opt-in (igual que Google Groups), pero nunca se acepta un payload sin
 * firma válida.
 */
export function verificarFirmaGithub(raw: string, firmaRecibida: string | null): boolean {
  if (!firmaRecibida || !firmaRecibida.startsWith(PREFIJO_FIRMA)) return false;

  const secretos = getSecretos();
  if (secretos.length === 0) return false;

  return secretos.some((secreto) =>
    coincideConFirmaEsperada(firmaRecibida, firmaParaSecreto(raw, secreto))
  );
}

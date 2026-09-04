import { NextResponse, after } from "next/server";
import { logger } from "@/lib/logger";
import { internalServerError } from "@/lib/api-errors";
import { verificarFirmaGithub } from "@/lib/webhook-firma";
import {
  reclamarDeliveryEntrante,
  procesarDeliveryReclamado,
  MAX_WEBHOOK_BODY_BYTES,
} from "@/application/recibirWebhookGithub";

/**
 * Lee el body como texto, cortando apenas se supera `maxBytes` en vez de
 * bufferear todo con `req.text()` y recién ahí medir. `content-length` es
 * un header que el cliente declara — una request pública puede mentirlo, o
 * mandar el body con transfer-encoding chunked (sin `content-length`), así
 * que el único límite real tiene que aplicarse mientras se consume el
 * stream. Cuenta bytes (`Uint8Array.byteLength`), no `string.length`: un
 * payload con caracteres multi-byte UTF-8 tiene menos unidades UTF-16 que
 * bytes reales, así que medir sobre el string ya decodificado subestima el
 * tamaño.
 */
async function leerBodyLimitado(req: Request, maxBytes: number): Promise<string | null> {
  const reader = req.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

// Público a propósito (issue #60): GitHub no manda cookie de sesión, así que
// esta ruta no puede pasar por `getCurrentUser()`. No está en el matcher de
// `src/proxy.ts` (que sólo cubre `/api/assignments`, `/api/registro` y
// `/api/perfil`) y no hay que agregarla ahí: si estuviera,
// `getProxyRedirectPath` devolvería un 307 a `/login` ante la falta de
// sesión, que GitHub registraría como delivery fallido en vez de un 401
// limpio. La autenticación acá es la firma `X-Hub-Signature-256`, no una
// sesión — ver `src/lib/webhook-firma.ts`.
export async function POST(req: Request) {
  if (!process.env.GITHUB_WEBHOOK_SECRET?.trim()) {
    logger.error(
      { route: "POST /api/webhooks/github" },
      "GITHUB_WEBHOOK_SECRET no está configurada — se rechaza el delivery"
    );
    return NextResponse.json({ error: "Webhook no configurado" }, { status: 503 });
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: "Payload demasiado grande" }, { status: 413 });
  }

  // El body se lee como texto plano, no con `req.json()` como el resto de
  // las routes (`parseJsonObjectBody` de `api-errors.ts`): la firma se
  // calcula sobre los bytes exactos que mandó GitHub, así que hay que
  // verificarla antes de parsear.
  const raw = await leerBodyLimitado(req, MAX_WEBHOOK_BODY_BYTES);
  if (raw === null) {
    return NextResponse.json({ error: "Payload demasiado grande" }, { status: 413 });
  }

  const firmaValida = verificarFirmaGithub(raw, req.headers.get("x-hub-signature-256"));
  if (!firmaValida) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  const deliveryId = req.headers.get("x-github-delivery");
  if (!deliveryId) {
    return NextResponse.json({ error: "Falta el header x-github-delivery" }, { status: 400 });
  }

  const evento = req.headers.get("x-github-event") ?? "desconocido";

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const reclamo = await reclamarDeliveryEntrante({ deliveryId, evento, payload });
    if (reclamo.tipo === "duplicado") {
      return NextResponse.json({ duplicado: true });
    }

    // El delivery ya está reclamado (columna `procesando`) — lo que puede
    // implicar llamadas a la API de GitHub (`check_suite`) se difiere con
    // `after()` para no arriesgar el límite de 10s de GitHub: la respuesta
    // sale apenas termina el reclamo, que es sólo una escritura a la DB.
    // Como consecuencia, GitHub ve esta entrega como exitosa aunque el
    // procesamiento falle después — el estado real queda en
    // `github_webhook_delivery` y se recupera con
    // `POST /api/webhooks/github/reprocesar`, no con el "Redeliver" que
    // dispara GitHub automáticamente ante un fallo (ver README).
    after(() => procesarDeliveryReclamado(reclamo.delivery));

    return NextResponse.json({ aceptado: true }, { status: 202 });
  } catch (error) {
    return internalServerError("POST /api/webhooks/github", error, { deliveryId, evento });
  }
}

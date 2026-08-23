import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin } from "@/lib/api-auth";
import { internalServerError } from "@/lib/api-errors";
import { reprocesarDeliveries } from "@/lib/services/recibirWebhookGithub";

// `deliveryId` opcional: sin body (o sin ese campo), reprocesa el lote de
// deliveries reprocesables más viejos; con `deliveryId`, sólo ese.
// `.min(1)`: un `deliveryId` vacío es falsy en JS — sin este mínimo,
// `{ "deliveryId": "" }` pasaría el schema y `getDeliveriesReprocesables`
// lo trataría como "sin filtro", disparando el lote completo por error.
// `.strict()`: por default, zod ignora silenciosamente claves desconocidas
// — un typo como `{ "deliverId": "x" }` (falta la "y") se convertiría en
// `{}` y dispararía el lote completo de 50 en vez de fallar con 400.
const ReprocesarSchema = z.object({ deliveryId: z.string().min(1).optional() }).strict();

// Sólo admin (issue #60) — auto-protegida como `/api/comisiones/[id]`, que
// tampoco está en el matcher de `src/proxy.ts`.
export async function POST(req: Request) {
  const unauthorized = await guardAdmin();
  if (unauthorized) return unauthorized;

  try {
    // Sin body (o body vacío) es válido a propósito — es la forma de pedir
    // el lote completo. Pero un body presente y mal formado es un error del
    // caller: a diferencia de `req.json().catch(() => ({}))`, acá NO se
    // lo traduce silenciosamente a "sin filtro" (eso dispararía el lote
    // completo por un typo en vez de fallar con 400).
    const rawBody = await req.text();
    let body: unknown = {};
    if (rawBody.trim().length > 0) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
      }
    }

    const parsed = ReprocesarSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const resultado = await reprocesarDeliveries(parsed.data.deliveryId);
    return NextResponse.json(resultado);
  } catch (error) {
    return internalServerError("POST /api/webhooks/github/reprocesar", error);
  }
}

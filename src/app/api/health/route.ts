import { NextResponse } from "next/server";
import { getEM } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    const em = await getEM();
    await em.getConnection().execute("select 1");
    return NextResponse.json({
      ok: true,
      database: "ok",
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local",
      elapsedMs: Date.now() - startedAt,
    });
  } catch {
    return NextResponse.json(
      { ok: false, database: "error", elapsedMs: Date.now() - startedAt },
      { status: 503 }
    );
  }
}

import { Check, Entity, Index, PrimaryKey, Property } from "@mikro-orm/core";
import { randomUUID } from "node:crypto";

@Check({ name: "error_log_count_positive", expression: '"count" > 0' })
@Entity({ tableName: "error_log" })
@Index({
  name: "error_log_route_last_seen_idx",
  properties: ["route", "lastSeenAt", "id"],
})
export class ErrorLog {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property({ type: "string" })
  route!: string;

  @Property({ type: "text" })
  message!: string;

  @Property({ type: "json", nullable: true })
  context: Record<string, unknown> | null = null;

  @Property({ type: "string", unique: true, length: 64 })
  fingerprint!: string;

  @Property({ type: "integer", default: 1 })
  count: number = 1;

  @Property({ type: "datetime" })
  firstSeenAt: Date = new Date();

  @Property({ type: "datetime" })
  lastSeenAt: Date = new Date();

  @Property({ type: "datetime", nullable: true })
  acknowledgedAt: Date | null = null;
}

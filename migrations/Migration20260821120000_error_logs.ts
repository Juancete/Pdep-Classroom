import { Migration } from "@mikro-orm/migrations";

export class Migration20260821120000_error_logs extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "error_log" (
        "id" uuid not null,
        "route" varchar(255) not null,
        "message" text not null,
        "context" jsonb null,
        "fingerprint" varchar(64) not null,
        "count" int not null default 1,
        "first_seen_at" timestamptz not null,
        "last_seen_at" timestamptz not null,
        "acknowledged_at" timestamptz null,
        constraint "error_log_pkey" primary key ("id"),
        constraint "error_log_fingerprint_unique" unique ("fingerprint"),
        constraint "error_log_count_positive" check ("count" > 0)
      );
    `);
    this.addSql(`create index "error_log_route_last_seen_idx" on "error_log" ("route", "last_seen_at" desc, "id" desc);`);
    this.addSql(`create index "error_log_unread_last_seen_idx" on "error_log" ("last_seen_at" desc, "id" desc) where "acknowledged_at" is null;`);
    this.addSql(`create index "error_log_acknowledged_retention_idx" on "error_log" ("last_seen_at") where "acknowledged_at" is not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "error_log";`);
  }
}

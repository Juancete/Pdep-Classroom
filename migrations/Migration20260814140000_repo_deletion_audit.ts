import { Migration } from "@mikro-orm/migrations";

export class Migration20260814140000_repo_deletion_audit extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "repo_deletion_attempt" (
        "id" uuid not null,
        "operation_id" uuid not null,
        "assignment_id" uuid not null,
        "entrega_id" uuid not null,
        "repo_name" varchar(255) not null,
        "requested_by" varchar(255) not null,
        "status" text check ("status" in ('pending', 'deleted', 'already_absent', 'failed')) not null default 'pending',
        "started_at" timestamptz not null,
        "completed_at" timestamptz null,
        "error" text null,
        constraint "repo_deletion_attempt_pkey" primary key ("id")
      );
    `);
    this.addSql(`create index "repo_deletion_attempt_assignment_started_idx" on "repo_deletion_attempt" ("assignment_id", "started_at");`);
    this.addSql(`create index "repo_deletion_attempt_operation_idx" on "repo_deletion_attempt" ("operation_id");`);
    this.addSql(`create index "repo_deletion_attempt_entrega_started_idx" on "repo_deletion_attempt" ("entrega_id", "started_at");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "repo_deletion_attempt";`);
  }
}

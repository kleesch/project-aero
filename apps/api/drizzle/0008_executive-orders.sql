CREATE TYPE "public"."eo_status" AS ENUM('active', 'repealed', 'superseded');--> statement-breakpoint
CREATE TABLE "executive_orders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "executive_orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"eo_number" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"status" "eo_status" DEFAULT 'active' NOT NULL,
	"issued_by" bigint NOT NULL,
	"effective_date" date NOT NULL,
	"expires_at" timestamp with time zone,
	"document_id" uuid NOT NULL,
	"repealed_by_eo_id" integer,
	"superseded_by_eo_id" integer,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "executive_orders" ADD CONSTRAINT "executive_orders_issued_by_users_roblox_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_orders" ADD CONSTRAINT "executive_orders_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_orders" ADD CONSTRAINT "executive_orders_repealed_by_eo_id_executive_orders_id_fk" FOREIGN KEY ("repealed_by_eo_id") REFERENCES "public"."executive_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_orders" ADD CONSTRAINT "executive_orders_superseded_by_eo_id_executive_orders_id_fk" FOREIGN KEY ("superseded_by_eo_id") REFERENCES "public"."executive_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_orders" ADD CONSTRAINT "executive_orders_created_by_users_roblox_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "executive_orders_eo_number_unique" ON "executive_orders" USING btree ("eo_number");--> statement-breakpoint
CREATE INDEX "executive_orders_status_idx" ON "executive_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "executive_orders_issued_by_idx" ON "executive_orders" USING btree ("issued_by");--> statement-breakpoint
CREATE INDEX "executive_orders_effective_date_idx" ON "executive_orders" USING btree ("effective_date");--> statement-breakpoint

-- Seed the eo:manage claim definition (mirrors packages/shared/src/claims.ts;
-- see 0002_seed-claims.sql — the claim registry and this table stay in sync).
INSERT INTO "claim_definitions" ("key", "description") VALUES
  ('eo:manage', 'Issue, edit, and correct the status of Executive Orders.')
ON CONFLICT ("key") DO NOTHING;

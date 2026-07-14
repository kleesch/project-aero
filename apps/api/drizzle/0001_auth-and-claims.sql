CREATE TYPE "public"."rank_comparison" AS ENUM('>=', '==', '<=');--> statement-breakpoint
CREATE TABLE "claim_definitions" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "direct_claim_grants" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "direct_claim_grants_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"claim_key" text NOT NULL,
	"is_negative" boolean DEFAULT false NOT NULL,
	"reason" text NOT NULL,
	"granted_by" bigint,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" bigint,
	"revoke_reason" text
);
--> statement-breakpoint
CREATE TABLE "group_claim_mappings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "group_claim_mappings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"claim_key" text NOT NULL,
	"group_id" bigint NOT NULL,
	"comparison" "rank_comparison" NOT NULL,
	"rank_value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_group_cache" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"groups" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "direct_claim_grants" ADD CONSTRAINT "direct_claim_grants_user_id_users_roblox_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_claim_grants" ADD CONSTRAINT "direct_claim_grants_claim_key_claim_definitions_key_fk" FOREIGN KEY ("claim_key") REFERENCES "public"."claim_definitions"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_claim_grants" ADD CONSTRAINT "direct_claim_grants_granted_by_users_roblox_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_claim_grants" ADD CONSTRAINT "direct_claim_grants_revoked_by_users_roblox_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_claim_mappings" ADD CONSTRAINT "group_claim_mappings_claim_key_claim_definitions_key_fk" FOREIGN KEY ("claim_key") REFERENCES "public"."claim_definitions"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_roblox_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_group_cache" ADD CONSTRAINT "user_group_cache_user_id_users_roblox_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "direct_claim_grants_user_id_idx" ON "direct_claim_grants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "direct_claim_grants_active_unique" ON "direct_claim_grants" USING btree ("user_id","claim_key","is_negative") WHERE "direct_claim_grants"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "group_claim_mappings_claim_key_idx" ON "group_claim_mappings" USING btree ("claim_key");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_group_cache_fetched_at_idx" ON "user_group_cache" USING btree ("fetched_at");
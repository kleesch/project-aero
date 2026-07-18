CREATE TYPE "public"."ruling_party_side" AS ENUM('plaintiff', 'defendant');--> statement-breakpoint
CREATE TYPE "public"."ruling_party_type" AS ENUM('user', 'business', 'government');--> statement-breakpoint
CREATE TYPE "public"."ruling_status" AS ENUM('active', 'expunged', 'pardoned');--> statement-breakpoint
CREATE TABLE "appeal_outcome_links" (
	"appeal_id" integer NOT NULL,
	"outcome_id" integer NOT NULL,
	CONSTRAINT "appeal_outcome_links_appeal_id_outcome_id_pk" PRIMARY KEY("appeal_id","outcome_id")
);
--> statement-breakpoint
CREATE TABLE "appeals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "appeals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ruling_id" integer NOT NULL,
	"document_id" uuid NOT NULL,
	"entered_by" bigint NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "businesses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"owner_user_id" bigint NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ruling_outcome_links" (
	"ruling_id" integer NOT NULL,
	"outcome_id" integer NOT NULL,
	CONSTRAINT "ruling_outcome_links_ruling_id_outcome_id_pk" PRIMARY KEY("ruling_id","outcome_id")
);
--> statement-breakpoint
CREATE TABLE "ruling_outcomes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ruling_outcomes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ruling_outcomes_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ruling_parties" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ruling_parties_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ruling_id" integer NOT NULL,
	"side" "ruling_party_side" NOT NULL,
	"party_type" "ruling_party_type" NOT NULL,
	"roblox_user_id" bigint,
	"business_id" integer,
	CONSTRAINT "ruling_parties_ref_matches_type" CHECK (("ruling_parties"."party_type" = 'user' AND "ruling_parties"."roblox_user_id" IS NOT NULL AND "ruling_parties"."business_id" IS NULL)
        OR ("ruling_parties"."party_type" = 'business' AND "ruling_parties"."business_id" IS NOT NULL AND "ruling_parties"."roblox_user_id" IS NULL)
        OR ("ruling_parties"."party_type" = 'government' AND "ruling_parties"."roblox_user_id" IS NULL AND "ruling_parties"."business_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "rulings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rulings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ruling_date" date NOT NULL,
	"status" "ruling_status" DEFAULT 'active' NOT NULL,
	"entered_by" bigint NOT NULL,
	"document_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appeal_outcome_links" ADD CONSTRAINT "appeal_outcome_links_appeal_id_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "public"."appeals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeal_outcome_links" ADD CONSTRAINT "appeal_outcome_links_outcome_id_ruling_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."ruling_outcomes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_ruling_id_rulings_id_fk" FOREIGN KEY ("ruling_id") REFERENCES "public"."rulings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_entered_by_users_roblox_user_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_user_id_users_roblox_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_created_by_users_roblox_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruling_outcome_links" ADD CONSTRAINT "ruling_outcome_links_ruling_id_rulings_id_fk" FOREIGN KEY ("ruling_id") REFERENCES "public"."rulings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruling_outcome_links" ADD CONSTRAINT "ruling_outcome_links_outcome_id_ruling_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."ruling_outcomes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruling_parties" ADD CONSTRAINT "ruling_parties_ruling_id_rulings_id_fk" FOREIGN KEY ("ruling_id") REFERENCES "public"."rulings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruling_parties" ADD CONSTRAINT "ruling_parties_roblox_user_id_users_roblox_user_id_fk" FOREIGN KEY ("roblox_user_id") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruling_parties" ADD CONSTRAINT "ruling_parties_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rulings" ADD CONSTRAINT "rulings_entered_by_users_roblox_user_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rulings" ADD CONSTRAINT "rulings_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appeals_ruling_id_unique" ON "appeals" USING btree ("ruling_id");--> statement-breakpoint
CREATE INDEX "businesses_name_idx" ON "businesses" USING btree ("name");--> statement-breakpoint
CREATE INDEX "businesses_owner_user_id_idx" ON "businesses" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "ruling_parties_ruling_id_idx" ON "ruling_parties" USING btree ("ruling_id");--> statement-breakpoint
CREATE INDEX "ruling_parties_roblox_user_id_idx" ON "ruling_parties" USING btree ("roblox_user_id");--> statement-breakpoint
CREATE INDEX "ruling_parties_business_id_idx" ON "ruling_parties" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "rulings_status_idx" ON "rulings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rulings_ruling_date_idx" ON "rulings" USING btree ("ruling_date");--> statement-breakpoint
CREATE INDEX "rulings_entered_by_idx" ON "rulings" USING btree ("entered_by");
CREATE TYPE "public"."license_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TABLE "business_license_types" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "business_license_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_license_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "business_licenses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "business_licenses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"business_id" integer NOT NULL,
	"license_type_id" integer NOT NULL,
	"status" "license_status" DEFAULT 'active' NOT NULL,
	"granted_by" bigint NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" bigint,
	"revoke_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_ownership_transfers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "business_ownership_transfers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"business_id" integer NOT NULL,
	"from_user_id" bigint NOT NULL,
	"to_user_id" bigint NOT NULL,
	"initiated_by" bigint NOT NULL,
	"reason" text,
	"transferred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_licenses" ADD CONSTRAINT "business_licenses_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_licenses" ADD CONSTRAINT "business_licenses_license_type_id_business_license_types_id_fk" FOREIGN KEY ("license_type_id") REFERENCES "public"."business_license_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_licenses" ADD CONSTRAINT "business_licenses_granted_by_users_roblox_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_licenses" ADD CONSTRAINT "business_licenses_revoked_by_users_roblox_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_ownership_transfers" ADD CONSTRAINT "business_ownership_transfers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_ownership_transfers" ADD CONSTRAINT "business_ownership_transfers_from_user_id_users_roblox_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_ownership_transfers" ADD CONSTRAINT "business_ownership_transfers_to_user_id_users_roblox_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_ownership_transfers" ADD CONSTRAINT "business_ownership_transfers_initiated_by_users_roblox_user_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_licenses_business_id_idx" ON "business_licenses" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "business_licenses_status_idx" ON "business_licenses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "business_ownership_transfers_business_id_idx" ON "business_ownership_transfers" USING btree ("business_id");
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uploader_user_id" bigint NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"mime" text NOT NULL,
	"display_filename" text NOT NULL,
	"quarantined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploader_user_id_users_roblox_user_id_fk" FOREIGN KEY ("uploader_user_id") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_uploader_user_id_idx" ON "documents" USING btree ("uploader_user_id");--> statement-breakpoint
CREATE INDEX "documents_created_at_idx" ON "documents" USING btree ("created_at");
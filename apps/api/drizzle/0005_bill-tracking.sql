CREATE TYPE "public"."bill_chamber" AS ENUM('H', 'S');--> statement-breakpoint
CREATE TYPE "public"."bill_stage" AS ENUM('COMMITTEE', 'ORIGIN_FLOOR', 'OTHER_FLOOR', 'PRESIDENTIAL', 'VETO_OVERRIDE');--> statement-breakpoint
CREATE TYPE "public"."bill_status" AS ENUM('IN_COMMITTEE', 'ORIGIN_FLOOR', 'OTHER_FLOOR', 'PRESIDENTIAL', 'VETOED', 'VETO_OVERRIDE', 'ENACTED', 'ENACTED_BY_OVERRIDE', 'VETO_SUSTAINED', 'FAILED_COMMITTEE', 'FAILED_ORIGIN_FLOOR', 'FAILED_OTHER_FLOOR', 'DIED_IN_SESSION');--> statement-breakpoint
CREATE TYPE "public"."chamber" AS ENUM('house', 'senate');--> statement-breakpoint
CREATE TYPE "public"."vote_position" AS ENUM('yea', 'nay', 'abstain', 'absent');--> statement-breakpoint
CREATE TABLE "bill_sequence_counters" (
	"chamber" "bill_chamber" NOT NULL,
	"session" integer NOT NULL,
	"last_sequence" integer NOT NULL,
	CONSTRAINT "bill_sequence_counters_chamber_session_pk" PRIMARY KEY("chamber","session")
);
--> statement-breakpoint
CREATE TABLE "bill_stage_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bill_stage_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bill_id" integer NOT NULL,
	"stage" "bill_stage" NOT NULL,
	"outcome" "bill_status" NOT NULL,
	"decided_by" bigint,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "bill_tags" (
	"bill_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "bill_tags_bill_id_tag_id_pk" PRIMARY KEY("bill_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "bill_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bill_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bill_id" integer NOT NULL,
	"version_no" integer NOT NULL,
	"document_id" uuid NOT NULL,
	"uploaded_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_votes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bill_votes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"stage_event_id" integer NOT NULL,
	"roblox_user_id" bigint NOT NULL,
	"position" "vote_position" NOT NULL,
	"recorded_by" bigint NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_by" bigint
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bills_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"chamber" "bill_chamber" NOT NULL,
	"session" integer NOT NULL,
	"sequence" integer NOT NULL,
	"title" text NOT NULL,
	"status" "bill_status" DEFAULT 'IN_COMMITTEE' NOT NULL,
	"submitted_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "congress_rosters" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "congress_rosters_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"chamber" "chamber" NOT NULL,
	"roblox_user_id" bigint NOT NULL,
	"username_snapshot" text,
	"rank" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roster_rank_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "roster_rank_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"chamber" "chamber" NOT NULL,
	"comparison" "rank_comparison" NOT NULL,
	"rank_value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "bill_stage_events" ADD CONSTRAINT "bill_stage_events_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_stage_events" ADD CONSTRAINT "bill_stage_events_decided_by_users_roblox_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_tags" ADD CONSTRAINT "bill_tags_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_tags" ADD CONSTRAINT "bill_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_versions" ADD CONSTRAINT "bill_versions_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_versions" ADD CONSTRAINT "bill_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_versions" ADD CONSTRAINT "bill_versions_uploaded_by_users_roblox_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_votes" ADD CONSTRAINT "bill_votes_stage_event_id_bill_stage_events_id_fk" FOREIGN KEY ("stage_event_id") REFERENCES "public"."bill_stage_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_votes" ADD CONSTRAINT "bill_votes_recorded_by_users_roblox_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_votes" ADD CONSTRAINT "bill_votes_superseded_by_bill_votes_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."bill_votes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_submitted_by_users_roblox_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("roblox_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_stage_events_bill_id_idx" ON "bill_stage_events" USING btree ("bill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_versions_bill_version_unique" ON "bill_versions" USING btree ("bill_id","version_no");--> statement-breakpoint
CREATE INDEX "bill_votes_stage_event_id_idx" ON "bill_votes" USING btree ("stage_event_id");--> statement-breakpoint
CREATE INDEX "bill_votes_live_idx" ON "bill_votes" USING btree ("stage_event_id","roblox_user_id") WHERE "bill_votes"."superseded_by" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bills_chamber_session_sequence_unique" ON "bills" USING btree ("chamber","session","sequence");--> statement-breakpoint
CREATE INDEX "bills_status_idx" ON "bills" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bills_session_idx" ON "bills" USING btree ("session");--> statement-breakpoint
CREATE INDEX "bills_submitted_by_idx" ON "bills" USING btree ("submitted_by");--> statement-breakpoint
CREATE UNIQUE INDEX "congress_rosters_chamber_member_unique" ON "congress_rosters" USING btree ("chamber","roblox_user_id");--> statement-breakpoint
CREATE INDEX "congress_rosters_chamber_active_idx" ON "congress_rosters" USING btree ("chamber","active");
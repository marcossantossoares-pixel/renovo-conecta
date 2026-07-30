CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'export', 'access', 'permission_change', 'login', 'logout');--> statement-breakpoint
CREATE TYPE "public"."church_status" AS ENUM('visitante', 'frequentador', 'membro', 'lider', 'pastor');--> statement-breakpoint
CREATE TYPE "public"."elo_frequency" AS ENUM('semanal', 'quinzenal', 'mensal');--> statement-breakpoint
CREATE TYPE "public"."elo_modality" AS ENUM('presencial', 'online', 'hibrido');--> statement-breakpoint
CREATE TYPE "public"."elo_status" AS ENUM('ativo', 'pausado', 'encerrado');--> statement-breakpoint
CREATE TYPE "public"."join_request_origin" AS ENUM('lider', 'secretaria', 'publico');--> statement-breakpoint
CREATE TYPE "public"."join_request_status" AS ENUM('pendente', 'aprovada', 'recusada');--> statement-breakpoint
CREATE TYPE "public"."leadership_role" AS ENUM('lider', 'vice_lider', 'anfitriao');--> statement-breakpoint
CREATE TYPE "public"."marital_status" AS ENUM('solteiro', 'casado', 'divorciado', 'viuvo', 'uniao_estavel', 'nao_informado');--> statement-breakpoint
CREATE TYPE "public"."scope_type" AS ENUM('global', 'congregation', 'supervision', 'elo');--> statement-breakpoint
CREATE TYPE "public"."weekday" AS ENUM('domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado');--> statement-breakpoint
CREATE TABLE "congregation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"state" text,
	"timezone" text DEFAULT 'America/Bahia' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "system_setting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "system_setting_tenant_key_unq" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "tenant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "tenant_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"congregation_id" uuid NOT NULL,
	"auth_user_id" uuid,
	"person_id" uuid,
	"email" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "app_user_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "app_user_tenant_email_unq" UNIQUE("tenant_id","email")
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"congregation_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"social_name" text,
	"birth_date" date,
	"is_minor" boolean DEFAULT false NOT NULL,
	"marital_status" "marital_status" DEFAULT 'nao_informado' NOT NULL,
	"phone" text,
	"whatsapp" text,
	"email" text,
	"photo_file_id" uuid,
	"church_status" "church_status" DEFAULT 'visitante' NOT NULL,
	"first_visit_at" date,
	"how_found_church" text,
	"decision_at" date,
	"baptism_at" date,
	"integration_course_at" date,
	"membership_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "person_address" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"congregation_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"street" text,
	"number" text,
	"complement" text,
	"district" text,
	"city" text,
	"state" text,
	"zip_code" text,
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "person_change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"congregation_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"field_name" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"congregation_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "person_tag_unq" UNIQUE("person_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"congregation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "tag_tenant_name_unq" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"congregation_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role_id" uuid NOT NULL,
	"scope_type" "scope_type" NOT NULL,
	"scope_id" uuid,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "invitation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "permission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"resource" text NOT NULL,
	"action" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "permission_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT true NOT NULL,
	"level" text DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "role_tenant_code_unq" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "role_permission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"default_scope" "scope_type" DEFAULT 'elo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "role_permission_unq" UNIQUE("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "user_role_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"congregation_id" uuid NOT NULL,
	"app_user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"scope_type" "scope_type" NOT NULL,
	"scope_id" uuid,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "elo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"congregation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"internal_code" text NOT NULL,
	"status" "elo_status" DEFAULT 'ativo' NOT NULL,
	"description" text,
	"audience_profile" text,
	"weekday" "weekday" NOT NULL,
	"start_time" time NOT NULL,
	"frequency" "elo_frequency" DEFAULT 'semanal' NOT NULL,
	"modality" "elo_modality" DEFAULT 'presencial' NOT NULL,
	"district" text,
	"city" text,
	"state" text,
	"street" text,
	"number" text,
	"complement" text,
	"zip_code" text,
	"reference_point" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"suggested_capacity" integer,
	"opened_at" date,
	"planned_multiplication_at" date,
	"origin_elo_id" uuid,
	"photo_file_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "elo_tenant_code_unq" UNIQUE("tenant_id","internal_code")
);
--> statement-breakpoint
CREATE TABLE "elo_join_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"congregation_id" uuid NOT NULL,
	"elo_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"origin" "join_request_origin" DEFAULT 'lider' NOT NULL,
	"status" "join_request_status" DEFAULT 'pendente' NOT NULL,
	"message" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "elo_leadership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"congregation_id" uuid NOT NULL,
	"elo_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "leadership_role" NOT NULL,
	"starts_at" date NOT NULL,
	"ends_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "elo_multiplication" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"congregation_id" uuid NOT NULL,
	"origin_elo_id" uuid NOT NULL,
	"new_elo_id" uuid NOT NULL,
	"multiplied_at" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "elo_multiplication_new_elo_unq" UNIQUE("new_elo_id")
);
--> statement-breakpoint
CREATE TABLE "elo_participant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"congregation_id" uuid NOT NULL,
	"elo_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"joined_at" date NOT NULL,
	"left_at" date,
	"leave_reason" text,
	"discipler_person_id" uuid,
	"is_potential_leader" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "supervision_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"congregation_id" uuid NOT NULL,
	"supervisor_person_id" uuid NOT NULL,
	"elo_id" uuid NOT NULL,
	"starts_at" date NOT NULL,
	"ends_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"congregation_id" uuid,
	"actor_app_user_id" uuid,
	"action" "audit_action" NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid,
	"changes" jsonb,
	"ip_hash" text,
	"user_agent" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"congregation_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"original_name" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"depicts_minor" boolean DEFAULT false NOT NULL,
	"width_px" integer,
	"height_px" integer,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "congregation" ADD CONSTRAINT "congregation_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_setting" ADD CONSTRAINT "system_setting_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_congregation_id_congregation_id_fk" FOREIGN KEY ("congregation_id") REFERENCES "public"."congregation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_congregation_id_congregation_id_fk" FOREIGN KEY ("congregation_id") REFERENCES "public"."congregation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_address" ADD CONSTRAINT "person_address_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_address" ADD CONSTRAINT "person_address_congregation_id_congregation_id_fk" FOREIGN KEY ("congregation_id") REFERENCES "public"."congregation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_address" ADD CONSTRAINT "person_address_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_address" ADD CONSTRAINT "person_address_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_address" ADD CONSTRAINT "person_address_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_change_log" ADD CONSTRAINT "person_change_log_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_change_log" ADD CONSTRAINT "person_change_log_congregation_id_congregation_id_fk" FOREIGN KEY ("congregation_id") REFERENCES "public"."congregation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_change_log" ADD CONSTRAINT "person_change_log_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_change_log" ADD CONSTRAINT "person_change_log_changed_by_app_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_tag" ADD CONSTRAINT "person_tag_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_tag" ADD CONSTRAINT "person_tag_congregation_id_congregation_id_fk" FOREIGN KEY ("congregation_id") REFERENCES "public"."congregation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_tag" ADD CONSTRAINT "person_tag_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_tag" ADD CONSTRAINT "person_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_tag" ADD CONSTRAINT "person_tag_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_tag" ADD CONSTRAINT "person_tag_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_congregation_id_congregation_id_fk" FOREIGN KEY ("congregation_id") REFERENCES "public"."congregation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_congregation_id_congregation_id_fk" FOREIGN KEY ("congregation_id") REFERENCES "public"."congregation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_app_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignment" ADD CONSTRAINT "user_role_assignment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignment" ADD CONSTRAINT "user_role_assignment_congregation_id_congregation_id_fk" FOREIGN KEY ("congregation_id") REFERENCES "public"."congregation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignment" ADD CONSTRAINT "user_role_assignment_app_user_id_app_user_id_fk" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignment" ADD CONSTRAINT "user_role_assignment_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignment" ADD CONSTRAINT "user_role_assignment_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignment" ADD CONSTRAINT "user_role_assignment_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo" ADD CONSTRAINT "elo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo" ADD CONSTRAINT "elo_congregation_id_congregation_id_fk" FOREIGN KEY ("congregation_id") REFERENCES "public"."congregation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo" ADD CONSTRAINT "elo_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo" ADD CONSTRAINT "elo_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_join_request" ADD CONSTRAINT "elo_join_request_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_join_request" ADD CONSTRAINT "elo_join_request_congregation_id_congregation_id_fk" FOREIGN KEY ("congregation_id") REFERENCES "public"."congregation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_join_request" ADD CONSTRAINT "elo_join_request_elo_id_elo_id_fk" FOREIGN KEY ("elo_id") REFERENCES "public"."elo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_join_request" ADD CONSTRAINT "elo_join_request_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_join_request" ADD CONSTRAINT "elo_join_request_decided_by_app_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_join_request" ADD CONSTRAINT "elo_join_request_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_join_request" ADD CONSTRAINT "elo_join_request_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_leadership" ADD CONSTRAINT "elo_leadership_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_leadership" ADD CONSTRAINT "elo_leadership_congregation_id_congregation_id_fk" FOREIGN KEY ("congregation_id") REFERENCES "public"."congregation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_leadership" ADD CONSTRAINT "elo_leadership_elo_id_elo_id_fk" FOREIGN KEY ("elo_id") REFERENCES "public"."elo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_leadership" ADD CONSTRAINT "elo_leadership_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_leadership" ADD CONSTRAINT "elo_leadership_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_leadership" ADD CONSTRAINT "elo_leadership_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_multiplication" ADD CONSTRAINT "elo_multiplication_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_multiplication" ADD CONSTRAINT "elo_multiplication_congregation_id_congregation_id_fk" FOREIGN KEY ("congregation_id") REFERENCES "public"."congregation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_multiplication" ADD CONSTRAINT "elo_multiplication_origin_elo_id_elo_id_fk" FOREIGN KEY ("origin_elo_id") REFERENCES "public"."elo"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_multiplication" ADD CONSTRAINT "elo_multiplication_new_elo_id_elo_id_fk" FOREIGN KEY ("new_elo_id") REFERENCES "public"."elo"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_multiplication" ADD CONSTRAINT "elo_multiplication_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_multiplication" ADD CONSTRAINT "elo_multiplication_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_participant" ADD CONSTRAINT "elo_participant_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_participant" ADD CONSTRAINT "elo_participant_congregation_id_congregation_id_fk" FOREIGN KEY ("congregation_id") REFERENCES "public"."congregation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_participant" ADD CONSTRAINT "elo_participant_elo_id_elo_id_fk" FOREIGN KEY ("elo_id") REFERENCES "public"."elo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_participant" ADD CONSTRAINT "elo_participant_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_participant" ADD CONSTRAINT "elo_participant_discipler_person_id_person_id_fk" FOREIGN KEY ("discipler_person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_participant" ADD CONSTRAINT "elo_participant_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_participant" ADD CONSTRAINT "elo_participant_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervision_assignment" ADD CONSTRAINT "supervision_assignment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervision_assignment" ADD CONSTRAINT "supervision_assignment_congregation_id_congregation_id_fk" FOREIGN KEY ("congregation_id") REFERENCES "public"."congregation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervision_assignment" ADD CONSTRAINT "supervision_assignment_supervisor_person_id_person_id_fk" FOREIGN KEY ("supervisor_person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervision_assignment" ADD CONSTRAINT "supervision_assignment_elo_id_elo_id_fk" FOREIGN KEY ("elo_id") REFERENCES "public"."elo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervision_assignment" ADD CONSTRAINT "supervision_assignment_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervision_assignment" ADD CONSTRAINT "supervision_assignment_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_congregation_id_congregation_id_fk" FOREIGN KEY ("congregation_id") REFERENCES "public"."congregation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_app_user_id_app_user_id_fk" FOREIGN KEY ("actor_app_user_id") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_attachment" ADD CONSTRAINT "file_attachment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_attachment" ADD CONSTRAINT "file_attachment_congregation_id_congregation_id_fk" FOREIGN KEY ("congregation_id") REFERENCES "public"."congregation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_attachment" ADD CONSTRAINT "file_attachment_uploaded_by_app_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "congregation_tenant_idx" ON "congregation" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "app_user_tenant_idx" ON "app_user" USING btree ("tenant_id","congregation_id");--> statement-breakpoint
CREATE INDEX "person_tenant_congregation_name_idx" ON "person" USING btree ("tenant_id","congregation_id","full_name");--> statement-breakpoint
CREATE INDEX "person_tenant_status_idx" ON "person" USING btree ("tenant_id","church_status");--> statement-breakpoint
CREATE INDEX "person_address_person_idx" ON "person_address" USING btree ("person_id","is_primary");--> statement-breakpoint
CREATE INDEX "person_address_district_idx" ON "person_address" USING btree ("tenant_id","district");--> statement-breakpoint
CREATE INDEX "person_change_log_person_idx" ON "person_change_log" USING btree ("person_id","changed_at");--> statement-breakpoint
CREATE INDEX "invitation_tenant_email_idx" ON "invitation" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "invitation_expires_idx" ON "invitation" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_role_assignment_user_idx" ON "user_role_assignment" USING btree ("app_user_id","ends_at");--> statement-breakpoint
CREATE INDEX "user_role_assignment_scope_idx" ON "user_role_assignment" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "elo_tenant_congregation_status_idx" ON "elo" USING btree ("tenant_id","congregation_id","status");--> statement-breakpoint
CREATE INDEX "elo_district_idx" ON "elo" USING btree ("tenant_id","district");--> statement-breakpoint
CREATE INDEX "elo_join_request_elo_status_idx" ON "elo_join_request" USING btree ("elo_id","status");--> statement-breakpoint
CREATE INDEX "elo_leadership_elo_idx" ON "elo_leadership" USING btree ("elo_id","role","ends_at");--> statement-breakpoint
CREATE INDEX "elo_leadership_person_idx" ON "elo_leadership" USING btree ("person_id","ends_at");--> statement-breakpoint
CREATE INDEX "elo_participant_elo_idx" ON "elo_participant" USING btree ("elo_id","is_active");--> statement-breakpoint
CREATE INDEX "elo_participant_person_idx" ON "elo_participant" USING btree ("person_id","is_active");--> statement-breakpoint
CREATE INDEX "supervision_assignment_supervisor_idx" ON "supervision_assignment" USING btree ("supervisor_person_id","ends_at");--> statement-breakpoint
CREATE INDEX "supervision_assignment_elo_idx" ON "supervision_assignment" USING btree ("elo_id","ends_at");--> statement-breakpoint
CREATE INDEX "audit_log_tenant_occurred_idx" ON "audit_log" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_resource_idx" ON "audit_log" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_app_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "file_attachment_tenant_idx" ON "file_attachment" USING btree ("tenant_id");
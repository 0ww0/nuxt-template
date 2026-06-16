CREATE TABLE "informations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"version" text NOT NULL,
	"logo" text,
	"favicon" text,
	"ogImage" text,
	"keywords" text,
	"author" text,
	"siteUrl" text,
	"email" text,
	"phone" text,
	"address" text,
	"twitter" text,
	"facebook" text,
	"instagram" text,
	"linkedin" text,
	"github" text,
	"primaryColor" text,
	"accentColor" text,
	"privacyPolicyUrl" text,
	"termsOfServiceUrl" text,
	"maintenanceMode" boolean DEFAULT false,
	"analyticsEnabled" boolean DEFAULT true,
	"tagline" text,
	"copyrightText" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

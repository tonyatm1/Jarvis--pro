CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" varchar(80) NOT NULL,
  "role" varchar(16) NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "chat_messages_client_id_idx" ON "chat_messages" USING btree ("client_id");

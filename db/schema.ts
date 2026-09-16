import { index, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const chatMessages = pgTable("chat_messages", {
  id: serial().primaryKey(),
  clientId: varchar("client_id", { length: 80 }).notNull(),
  role: varchar({ length: 16 }).notNull(),
  content: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("chat_messages_client_id_idx").on(table.clientId)]);

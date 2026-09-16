import { drizzle } from "drizzle-orm/netlify-db";
import * as schema from "./schema.ts";

export const getDb = () => drizzle({ schema });

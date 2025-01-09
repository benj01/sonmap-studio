import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    POSTGIS_HOST: z.string().min(1),
    POSTGIS_PORT: z.coerce.number().int().positive(),
    POSTGIS_DATABASE: z.string().min(1),
    POSTGIS_USER: z.string().min(1),
    POSTGIS_PASSWORD: z.string(),
    POSTGIS_MAX_CONNECTIONS: z.coerce.number().int().positive().default(10),
  },
  client: {
    // Add any client-side env vars here if needed
  },
  runtimeEnv: {
    POSTGIS_HOST: process.env.POSTGIS_HOST,
    POSTGIS_PORT: process.env.POSTGIS_PORT,
    POSTGIS_DATABASE: process.env.POSTGIS_DATABASE,
    POSTGIS_USER: process.env.POSTGIS_USER,
    POSTGIS_PASSWORD: process.env.POSTGIS_PASSWORD,
    POSTGIS_MAX_CONNECTIONS: process.env.POSTGIS_MAX_CONNECTIONS,
  },
}); 
import { getCloudflareContext } from "@opennextjs/cloudflare";

type EnvWithDb = {
  DB: D1Database;
};

export async function getDb(): Promise<D1Database> {
  try {
    const { env } = await getCloudflareContext();
    const db = (env as EnvWithDb | undefined)?.DB;

    if (!db) {
      throw new Error(
        "D1 binding DB is unavailable. The local Workers runtime (workerd) failed to start, so next dev cannot reach the database.",
      );
    }

    return db;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("D1 binding DB is unavailable")
    ) {
      throw error;
    }

    throw new Error(
      "Cloudflare context is unavailable. The local Workers runtime (workerd) failed to start.",
      { cause: error },
    );
  }
}

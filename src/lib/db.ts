import { getCloudflareContext } from "@opennextjs/cloudflare";

type EnvWithDb = {
  DB: D1Database;
};

export async function getDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext();
  return (env as EnvWithDb).DB;
}

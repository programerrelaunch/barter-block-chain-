import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { migrate } from "./db/schema";
import { seed } from "./db/seed";
import { registerRoutes } from "./routes";

const PORT = Number(process.env.PORT ?? 4000);
const JWT_SECRET = process.env.JWT_SECRET ?? "barterchain-dev-secret-change-me";

async function main() {
  migrate();
  seed();

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: JWT_SECRET });
  await registerRoutes(app);

  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`BarterChain API listening on http://localhost:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

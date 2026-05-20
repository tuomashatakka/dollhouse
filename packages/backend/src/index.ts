import http from "node:http";
import cors from "cors";
import express from "express";
import { availableAgentTypes } from "./agents/AgentRegistry.js";
import { Delegator } from "./delegator/Delegator.js";
import { createProvider } from "./delegator/providers/index.js";
import { env } from "./env.js";
import { createSocketServer } from "./socket/server.js";

const app = express();
app.use(cors({ origin: env.FRONTEND_ORIGIN }));
app.use(express.json());

// Build the shared delegator at boot. Provider construction is async (lazy
// SDK imports) so we await it here once.
const sharedDelegator = new Delegator();
try {
  sharedDelegator.setProvider(await createProvider());
} catch (err) {
  console.warn(
    `[delegator] provider "${env.LLM_PROVIDER}" failed (${(err as Error).message}); falling back to mock.`,
  );
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    provider: sharedDelegator.providerName,
    agents: availableAgentTypes(),
  });
});

const httpServer = http.createServer(app);
createSocketServer(httpServer, sharedDelegator);

httpServer.listen(env.PORT, () => {
  console.log(
    `\n🏠 DollhouseDev backend listening on http://localhost:${env.PORT}`,
  );
  console.log(`   Delegator provider: ${sharedDelegator.providerName}`);
  console.log(`   Available agents:   ${availableAgentTypes().join(", ")}`);
  console.log(`   CORS origin:        ${env.FRONTEND_ORIGIN}\n`);
});

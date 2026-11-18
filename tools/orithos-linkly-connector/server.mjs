import http from "node:http";

const HOST = process.env.CONNECTOR_HOST || "127.0.0.1";
const PORT = Number(process.env.CONNECTOR_PORT || 9167);
const ORITHOS_API_URL = (process.env.ORITHOS_API_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
const ORITHOS_CONNECTOR_TOKEN = process.env.ORITHOS_CONNECTOR_TOKEN || "";
const AUTO_APPROVE_MS = Number(process.env.CONNECTOR_AUTO_APPROVE_MS || 800);

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
}

async function postCallback(attemptId, connectorChallenge, status, providerReference) {
  if (!ORITHOS_CONNECTOR_TOKEN) {
    console.warn("ORITHOS_CONNECTOR_TOKEN is empty; callback skipped.");
    return;
  }
  const response = await fetch(`${ORITHOS_API_URL}/api/eftpos/connector/callback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Orithos-Connector-Token": ORITHOS_CONNECTOR_TOKEN,
    },
    body: JSON.stringify({ attemptId, connectorChallenge, status, providerReference }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error(`Orithos callback failed (${response.status}): ${text}`);
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  const url = req.url?.split("?")[0] || "";

  if (req.method === "GET" && url === "/v1/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url === "/v1/status") {
    sendJson(res, 200, {
      linklyClient: ORITHOS_CONNECTOR_TOKEN ? "simulated-ready" : "waiting-for-token",
      terminal: "ready",
      detail: "Lab connector; replace with Linkly IP Interface when bank confirms.",
    });
    return;
  }

  if (req.method === "POST" && url === "/v1/query") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      let body;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(res, 400, { error: "Invalid JSON" });
        return;
      }
      const attemptId = body.attemptId;
      const connectorChallenge = body.connectorChallenge;
      if (!attemptId || !connectorChallenge) {
        sendJson(res, 400, { error: "attemptId and connectorChallenge are required" });
        return;
      }
      sendJson(res, 202, { queried: true, attemptId });
      setTimeout(() => {
        void postCallback(attemptId, connectorChallenge, "APPROVED", `LAB-QUERY-${attemptId}-${Date.now()}`);
      }, AUTO_APPROVE_MS);
    });
    return;
  }

  if (req.method === "POST" && url === "/v1/purchase") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      let body;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(res, 400, { error: "Invalid JSON" });
        return;
      }
      const attemptId = body.attemptId;
      const connectorChallenge = body.connectorChallenge;
      const orderUuid = body.orderUuid;
      if (!attemptId || !connectorChallenge) {
        sendJson(res, 400, { error: "attemptId and connectorChallenge are required" });
        return;
      }
      sendJson(res, 202, { accepted: true, orderUuid: orderUuid ?? null });
      setTimeout(() => {
        void postCallback(
          attemptId,
          connectorChallenge,
          "APPROVED",
          `LAB-${attemptId}-${Date.now()}`,
        );
      }, AUTO_APPROVE_MS);
    });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`Orithos Linkly Connector listening on http://${HOST}:${PORT}`);
  console.log(`Orithos API: ${ORITHOS_API_URL}`);
});
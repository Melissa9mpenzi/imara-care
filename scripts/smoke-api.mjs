const apiBase = (
  process.env.API_BASE_URL ?? "https://imara-care-api.vercel.app/api/v1"
).replace(/\/+$/, "");
const token = process.env.API_AUTH_TOKEN;
const routes = [
  "/pharmacy/stock",
  "/pharmacy/orders",
  "/theatre/procedures",
];

async function checkHealth() {
  const response = await fetch(`${apiBase}/health`);
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.status !== "ok") {
    throw new Error(`Health check failed with HTTP ${response.status}.`);
  }
  console.log(`PASS GET /health (${response.status})`);
}

async function checkDepartmentRoute(path) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(`${apiBase}${path}`, { headers });
  const accepted = token
    ? response.ok
    : response.status === 401 || response.status === 403;

  if (!accepted) {
    throw new Error(
      `GET ${path} returned HTTP ${response.status}; expected ${
        token ? "a successful authenticated response" : "401 or 403 without a token"
      }.`,
    );
  }

  console.log(
    `PASS GET ${path} (${response.status}${token ? ", authenticated" : ", route exists"})`,
  );
}

try {
  await checkHealth();
  for (const route of routes) {
    await checkDepartmentRoute(route);
  }
  console.log("API smoke checks passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

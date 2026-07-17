const hostname = Bun.env.HOST ?? "0.0.0.0";
const port = Number(Bun.env.PORT ?? 8000);

function assetPath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const segments = decoded.split("/").filter(Boolean);
  if (segments.some((segment) => segment === ".." || segment.includes("\\"))) return null;
  return `${import.meta.dir}/dist/${segments.join("/") || "index.html"}`;
}

const server = Bun.serve({
  hostname,
  port,
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" }
      });
    }

    const pathname = new URL(request.url).pathname;
    const filename = assetPath(pathname);
    if (!filename) return new Response("Not found", { status: 404 });

    const file = Bun.file(filename);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });

    const headers = {
      "Cache-Control": "no-store",
      "Content-Type": file.type
    };
    return request.method === "HEAD"
      ? new Response(null, { headers })
      : new Response(file, { headers });
  }
});

console.log(`Sailboat Force Lab running at http://${server.hostname}:${server.port}`);

import { createServer, type Server } from "node:http";

const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
export type FixtureVariant = "A" | "B" | "C";

function page(title: string, body: string, options?: { description?: boolean; viewport?: boolean; variant?: FixtureVariant; lang?: boolean }) {
  const color = options?.variant === "B" ? "#e9fff0" : "#fff";
  return `<!doctype html><html${options?.lang === false ? "" : ' lang="en"'}><head><meta charset="utf-8">${options?.viewport === false ? "" : '<meta name="viewport" content="width=device-width,initial-scale=1">'}${title ? `<title>${title}</title>` : ""}${options?.description === false ? "" : '<meta name="description" content="ALT QR deterministic fixture">'}<style>body{margin:0;padding:24px;background:${color};font:16px Arial;color:#111}nav{display:grid;gap:8px;max-width:560px}main{border-top:${options?.variant === "B" ? "12px solid #185c36" : "3px solid #222"};padding-top:18px}</style></head><body>${body}</body></html>`;
}
export async function startFixtureServer(port = 0, initialVariant: FixtureVariant = "A") {
  let variant: FixtureVariant = initialVariant;
  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", "http://fixture.local");
    const common = { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'self' 'unsafe-inline'", "x-content-type-options": "nosniff" };
    if (url.pathname === "/__variant" && request.method === "POST") {
      const requested = url.searchParams.get("value");
      variant = requested === "B" || requested === "C" ? requested : "A";
      response.writeHead(204); response.end(); return;
    }
    if (url.pathname === "/robots.txt") {
      response.writeHead(200, { "content-type": "text/plain" }); response.end("User-agent: *\nDisallow: /private\n"); return;
    }
    if (url.pathname === "/asset.png") { response.writeHead(200, { "content-type": "image/png" }); response.end(pixel); return; }
    if (url.pathname === "/candidate-api") { response.writeHead(variant === "B" ? 500 : 200, { "content-type": "application/json" }); response.end(variant === "B" ? '{"error":"candidate request failed"}' : '{"ok":true}'); return; }
    if (["/missing-image.png", "/missing.js", "/missing.css", "/missing-data", "/missing-font.woff2"].includes(url.pathname)) {
      if (variant === "A") { response.writeHead(404, { "content-type": url.pathname.endsWith(".css") ? "text/css" : url.pathname.endsWith(".js") ? "application/javascript" : "text/plain" }); response.end("missing"); return; }
      if (url.pathname.endsWith(".png")) { response.writeHead(200, { "content-type": "image/png" }); response.end(pixel); return; }
      response.writeHead(200, { "content-type": url.pathname.endsWith(".css") ? "text/css" : url.pathname.endsWith(".js") ? "application/javascript" : "application/json" }); response.end(url.pathname.endsWith(".css") ? "body{outline:0}" : url.pathname.endsWith(".js") ? "void 0" : "{}"); return;
    }
    if (url.pathname === "/oversized-image") { const body = Buffer.alloc(5_100_000); response.writeHead(200, { "content-type": "image/png", "content-length": String(body.length) }); response.end(body); return; }
    if (url.pathname === "/redirect") { response.writeHead(302, { location: "/clean" }); response.end(); return; }
    if (url.pathname === "/clean") { response.writeHead(200, common); response.end(page("Clean fixture", '<main><h1>Clean deterministic page</h1><p>All checked facts are present.</p></main>')); return; }
    if (url.pathname === "/missing-lang") { response.writeHead(200, common); response.end(page("Language fixture", '<main><h1>Missing document language</h1></main>', { lang: false })); return; }
    if (url.pathname === "/dom-budget") { response.writeHead(200, common); response.end(page("DOM budget fixture", `<main><h1>Bounded DOM</h1>${"<i>x</i>".repeat(6_000)}</main>`)); return; }
    if (url.pathname === "/policy-limited") { response.writeHead(200, common); response.end(page("Policy fixture", '<main><h1>Policy-limited resources</h1><img src="/oversized-image" alt="Large media"><script>fetch("/passive-write",{method:"POST",body:"ignored"}).catch(function(){})</script></main>')); return; }
    if (url.pathname === "/passive-write") { response.writeHead(204); response.end(); return; }
    if (url.pathname === "/timeout-root") { response.writeHead(200, common); response.end(page("Timeout fixture", '<main><h1>Partial timeout</h1><a href="/good">Fast child</a><a href="/slow">Slow child</a></main>')); return; }
    if (url.pathname === "/slow") {
      const timer = setTimeout(() => { if (!response.destroyed) { response.writeHead(200, common); response.end(page("Slow fixture", "<h1>Eventually loaded</h1>")); } }, 30_000);
      response.on("close", () => clearTimeout(timer)); return;
    }
    if (url.pathname === "/partial-failure") { request.socket.destroy(); return; }
    if (url.pathname === "/broken") { response.writeHead(404, common); response.end(page("Not found", "<h1>Missing page</h1>", { variant })); return; }
    if (url.pathname === "/missing") {
      response.writeHead(200, common);
      response.end(variant === "A"
        ? page("", '<main><h1>Missing metadata fixture</h1><img src="/asset.png"></main>', { description: false, variant })
        : page("Metadata repaired", '<main><h1>Metadata repaired</h1><img src="/asset.png" alt="Single test pixel"></main>', { variant }));
      return;
    }
    if (url.pathname === "/overflow") {
      const width = variant === "A" ? 1500 : 1800;
      response.writeHead(200, common); response.end(page("Overflow fixture", `<main style="width:${width}px"><h1>Horizontal overflow</h1><p>Fixed-width content.</p></main>`, { variant })); return;
    }
    if (url.pathname === "/js-error") {
      const script = variant === "A" ? '<script>console.error("fixture console failure");console.warn("fixture repeated warning");console.warn("fixture repeated warning");setTimeout(function(){ throw new Error("fixture runtime failure") }, 10)</script>' : "";
      response.writeHead(200, common); response.end(page("Runtime fixture", `<main><h1>Runtime health</h1>${script}</main>`, { variant })); return;
    }
    if (url.pathname === "/form") {
      const form = variant === "A" ? '<input type="email" name="email">' : '<label>Email <input type="email" name="email"></label>';
      response.writeHead(200, common); response.end(page("Form fixture", `<main><h1>Contact</h1><form>${form}<button type="button">Inspect only</button></form></main>`, { variant })); return;
    }
    if (url.pathname === "/new-problem") { response.writeHead(200, common); response.end(page("New regression", '<main><h1>Regression fixture</h1><h3>Heading skips level two</h3><p id="duplicate">One</p><p id="duplicate">Two</p><img src="/asset.png"></main>', { viewport: false, description: false, variant })); return; }
    if (url.pathname === "/network") { response.writeHead(200, common); response.end(page("Network fixture", '<link rel="stylesheet" href="/missing.css"><style>@font-face{font-family:Broken;src:url(/missing-font.woff2)}body{font-family:Broken,Arial}</style><main><h1>Network health</h1><img src="/missing-image.png" alt="Network fixture"><img src="/oversized-image" alt="Oversized safety fixture"><script src="/missing.js"></script><script>fetch("/missing-data").catch(function(){});new WebSocket("ws://"+location.host+"/socket")</script></main>', { variant })); return; }
    if (url.pathname === "/deep") { response.writeHead(200, common); response.end(page("Deep fixture", '<main><h1>Nested crawl target</h1><p>Discovered only from a child page.</p></main>', { variant })); return; }
    if (url.pathname === "/good") {
      const adversarialRegression = variant === "C" ? '<script>setTimeout(function(){throw new Error("red team route regression")},10)</script>' : "";
      response.writeHead(200, common); response.end(page("Healthy fixture", `<main><h1>Healthy page</h1><img src="/asset.png" alt="Single test pixel"><p>Clear, compact content.</p><a href="/deep">Nested page</a>${adversarialRegression}</main>`, { variant })); return;
    }
    if (url.pathname === "/private") { response.writeHead(200, common); response.end(page("Private", "<h1>Must not crawl</h1>", { variant })); return; }
    response.writeHead(200, common);
    const variantLink = variant === "B" ? '<a href="/new-problem">New problem</a>' : "";
    const candidateRuntimeRegression = variant === "B" ? '<script>console.error("candidate release initialization failed");fetch("/candidate-api").catch(function(){})</script>' : "";
    response.end(page("Quality fixture index", `<main><h1>ALT QR fixture site ${variant}</h1><nav><a href="/good">Good page</a><a href="/broken">Broken link</a><a href="/missing">Metadata test</a><a href="/overflow">Overflow</a><a href="/js-error">JS error</a><a href="/form">Form</a><a href="/partial-failure">Partial page</a>${variantLink}<a href="/network">Network failures</a><a href="/logout">Unsafe action</a><a href="/private">Robots blocked</a></nav>${candidateRuntimeRegression}</main>`, { variant }));
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  let upgradeAttempts = 0;
  server.on("upgrade", (request) => { upgradeAttempts += 1; request.socket.destroy(); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server did not bind a port");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    server,
    setVariant: (next: FixtureVariant) => { variant = next; },
    getUpgradeAttempts: () => upgradeAttempts,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

export type FixtureServer = { origin: string; server: Server; setVariant: (variant: FixtureVariant) => void; getUpgradeAttempts: () => number; close: () => Promise<void> };

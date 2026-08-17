import { createServer, type ServerResponse } from "node:http";

import type { BenchmarkProfileId } from "./types";

type PageOptions = {
  title?: string | false;
  description?: string | false;
  lang?: string | false;
  viewport?: string | false;
  body?: string;
  head?: string;
};

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'",
  "x-content-type-options": "nosniff",
};

function html(options: PageOptions = {}) {
  const title = options.title === false ? "" : `<title>${options.title ?? "ALT QR reliability fixture"}</title>`;
  const description = options.description === false ? "" : `<meta name="description" content="Deterministic ALT QR reliability fixture">`;
  const viewport = options.viewport === false ? "" : `<meta name="viewport" content="${options.viewport ?? "width=device-width,initial-scale=1"}">`;
  const lang = options.lang === false ? "" : ` lang="${options.lang ?? "en"}"`;
  return `<!doctype html><html${lang}><head><meta charset="utf-8">${viewport}${title}${description}<style>html{color:#111;background:#fff}body{margin:0;padding:24px;font:16px/1.5 Arial,sans-serif}nav{display:grid;gap:8px;max-width:40rem}main{max-width:64rem}label{display:grid;gap:6px}</style>${options.head ?? ""}</head><body>${options.body ?? "<main><h1>ALT QR reliability fixture</h1></main>"}</body></html>`;
}

function sendHtml(response: ServerResponse, options: PageOptions = {}, status = 200, includeCsp = true) {
  const headers = includeCsp ? HTML_HEADERS : Object.fromEntries(Object.entries(HTML_HEADERS).filter(([key]) => key !== "content-security-policy"));
  response.writeHead(status, headers);
  response.end(html(options));
}

function links(paths: string[]) {
  return `<main><h1>ALT QR reliability profile</h1><nav>${paths.map((path) => `<a href="${path}">${path}</a>`).join("")}</nav></main>`;
}

const PROFILE_LINKS: Record<BenchmarkProfileId, string[]> = {
  clean: ["/clean-static", "/clean-responsive", "/clean-form", "/clean-spa", "/clean-redirect"],
  document: ["/missing-title", "/missing-description", "/missing-h1", "/multiple-h1", "/missing-lang", "/missing-alt", "/missing-viewport", "/heading-order", "/duplicate-id"],
  accessibility: ["/unlabeled-control", "/contrast", "/labelled-control"],
  runtime: ["/console", "/page-error", "/resource-image", "/resource-script", "/resource-stylesheet", "/resource-font", "/resource-fetch", "/sanitized-error"],
  navigation: ["/status-404", "/status-500", "/transport-close", "/redirect-chain-a", "/redirect-loop-a"],
  security: ["/missing-csp-a", "/missing-csp-b", "/present-csp", "/shared-a", "/shared-b", "/repeated-resource"],
};

export async function startReliabilityFixture(profileId: BenchmarkProfileId) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://fixture.local");
    if (url.pathname === "/robots.txt") {
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("User-agent: *\nAllow: /\n");
      return;
    }
    if (url.pathname === "/") { sendHtml(response, { title: `${profileId} profile`, body: links(PROFILE_LINKS[profileId]) }); return; }

    if (profileId === "clean") {
      if (url.pathname === "/clean-redirect") { response.writeHead(302, { location: "/clean-static" }); response.end(); return; }
      if (url.pathname === "/clean-static") { sendHtml(response, { title: "Clean static", body: "<main><h1>Clean static page</h1><p>Complete deterministic document.</p></main>" }); return; }
      if (url.pathname === "/clean-responsive") { sendHtml(response, { title: "Clean responsive", body: "<main style=\"width:min(100%,48rem)\"><h1>Clean responsive page</h1><p>Fluid content.</p></main>" }); return; }
      if (url.pathname === "/clean-form") { sendHtml(response, { title: "Clean form", body: "<main><h1>Clean form</h1><label for=\"clean-email\">Email</label><input id=\"clean-email\" type=\"email\"></main>" }); return; }
      if (url.pathname === "/clean-spa") { sendHtml(response, { title: "Clean SPA", body: "<main id=\"app\"></main><script>document.getElementById('app').innerHTML='<h1>Clean client route</h1><p>Rendered synchronously.</p>'</script>" }); return; }
    }

    if (profileId === "document") {
      if (url.pathname === "/missing-title") { sendHtml(response, { title: false, body: "<main><h1>Missing title</h1></main>" }); return; }
      if (url.pathname === "/missing-description") { sendHtml(response, { title: "Missing description", description: false, body: "<main><h1>Missing description</h1></main>" }); return; }
      if (url.pathname === "/missing-h1") { sendHtml(response, { title: "Missing h1", body: "<main><p>No primary heading.</p></main>" }); return; }
      if (url.pathname === "/multiple-h1") { sendHtml(response, { title: "Multiple h1", body: "<main><h1>First heading</h1><h1>Second heading</h1></main>" }); return; }
      if (url.pathname === "/missing-lang") { sendHtml(response, { title: "Missing language", lang: false, body: "<main><h1>Missing language</h1></main>" }); return; }
      if (url.pathname === "/missing-alt") { sendHtml(response, { title: "Missing alt", body: "<main><h1>Missing image text</h1><img id=\"hero\" src=\"data:image/gif;base64,R0lGODlhAQABAAAAACw=\"></main>" }); return; }
      if (url.pathname === "/missing-viewport") { sendHtml(response, { title: "Missing viewport", viewport: false, body: "<main><h1>Missing viewport</h1></main>" }); return; }
      if (url.pathname === "/heading-order") { sendHtml(response, { title: "Heading order", body: "<main><h1>Heading order</h1><h3 id=\"jump\">Skipped level two</h3></main>" }); return; }
      if (url.pathname === "/duplicate-id") { sendHtml(response, { title: "Duplicate ID", body: "<main><h1>Duplicate ID</h1><p id=\"shared\">First</p><p id=\"shared\">Second</p></main>" }); return; }
    }

    if (profileId === "accessibility") {
      if (url.pathname === "/unlabeled-control") { sendHtml(response, { title: "Unlabelled control", body: "<main><h1>Unlabelled control</h1><input id=\"email\" type=\"email\"></main>" }); return; }
      if (url.pathname === "/contrast") { sendHtml(response, { title: "Contrast", body: "<main><h1>Contrast</h1><p id=\"low-contrast\" style=\"color:#777;background:#888\">Text with deliberately insufficient contrast.</p></main>" }); return; }
      if (url.pathname === "/labelled-control") { sendHtml(response, { title: "Labelled control", body: "<main><h1>Labelled control</h1><label for=\"named\">Name</label><input id=\"named\"></main>" }); return; }
    }

    if (profileId === "runtime") {
      if (["/missing-image", "/missing-script", "/missing-stylesheet", "/missing-font", "/missing-fetch"].includes(url.pathname)) {
        const contentType = url.pathname.includes("stylesheet") ? "text/css" : url.pathname.includes("script") ? "application/javascript" : "text/plain";
        response.writeHead(404, { "content-type": contentType }); response.end("missing"); return;
      }
      if (url.pathname === "/console") { sendHtml(response, { title: "Console", body: "<main><h1>Console events</h1></main><script>console.error('fixture console error');console.warn('fixture repeated warning');console.warn('fixture repeated warning');console.warn('fixture repeated warning')</script>" }); return; }
      if (url.pathname === "/page-error") { sendHtml(response, { title: "Page exception", body: "<main><h1>Page exception</h1></main><script>setTimeout(function(){throw new Error('fixture uncaught exception')},0)</script>" }); return; }
      if (url.pathname === "/resource-image") { sendHtml(response, { title: "Image failure", body: "<main><h1>Image failure</h1><img src=\"/missing-image\" alt=\"Expected missing resource\"></main>" }); return; }
      if (url.pathname === "/resource-script") { sendHtml(response, { title: "Script failure", body: "<main><h1>Script failure</h1><script src=\"/missing-script\"></script></main>" }); return; }
      if (url.pathname === "/resource-stylesheet") { sendHtml(response, { title: "Stylesheet failure", head: "<link rel=\"stylesheet\" href=\"/missing-stylesheet\">", body: "<main><h1>Stylesheet failure</h1></main>" }); return; }
      if (url.pathname === "/resource-font") { sendHtml(response, { title: "Font failure", head: "<style>@font-face{font-family:BrokenFixture;src:url('/missing-font')}body{font-family:BrokenFixture,Arial}</style>", body: "<main><h1>Font failure</h1><p>Font request is expected to fail.</p></main>" }); return; }
      if (url.pathname === "/resource-fetch") { sendHtml(response, { title: "Fetch failure", body: "<main><h1>Fetch failure</h1></main><script>fetch('/missing-fetch').catch(function(){})</script>" }); return; }
      if (url.pathname === "/sanitized-error") { sendHtml(response, { title: "Sanitized exception", body: "<main><h1>Sanitized exception</h1></main><script>setTimeout(function(){throw new Error('fixture internal path at C:\\\\Users\\\\user\\\\Documents\\\\ALT ai\\\\node_modules\\\\playwright\\\\index.js:10:2')},0)</script>" }); return; }
    }

    if (profileId === "navigation") {
      if (url.pathname === "/status-404") { sendHtml(response, { title: "404 fixture", body: "<main><h1>Not found</h1></main>" }, 404); return; }
      if (url.pathname === "/status-500") { sendHtml(response, { title: "500 fixture", body: "<main><h1>Server error</h1></main>" }, 500); return; }
      if (url.pathname === "/transport-close") { request.socket.destroy(); return; }
      if (url.pathname === "/redirect-chain-a") { response.writeHead(302, { location: "/redirect-chain-b" }); response.end(); return; }
      if (url.pathname === "/redirect-chain-b") { response.writeHead(302, { location: "/redirect-final" }); response.end(); return; }
      if (url.pathname === "/redirect-final") { sendHtml(response, { title: "Redirect final", body: "<main><h1>Valid redirect destination</h1></main>" }); return; }
      if (url.pathname === "/redirect-loop-a") { response.writeHead(302, { location: "/redirect-loop-b" }); response.end(); return; }
      if (url.pathname === "/redirect-loop-b") { response.writeHead(302, { location: "/redirect-loop-a" }); response.end(); return; }
    }

    if (profileId === "security") {
      if (["/shared-missing-script", "/repeated-missing"].includes(url.pathname)) { response.writeHead(404, { "content-type": url.pathname.includes("script") ? "application/javascript" : "application/json" }); response.end("missing"); return; }
      if (url.pathname === "/missing-csp-a" || url.pathname === "/missing-csp-b") { sendHtml(response, { title: "Missing CSP", body: `<main><h1>${url.pathname.slice(1)}</h1></main>` }, 200, false); return; }
      if (url.pathname === "/present-csp") { sendHtml(response, { title: "Present CSP", body: "<main><h1>Present CSP</h1></main>" }); return; }
      if (url.pathname === "/shared-a" || url.pathname === "/shared-b") { sendHtml(response, { title: "Shared failure", body: `<main><h1>${url.pathname.slice(1)}</h1><script src=\"/shared-missing-script\"></script></main>` }); return; }
      if (url.pathname === "/repeated-resource") { sendHtml(response, { title: "Repeated failure", body: "<main><h1>Repeated failure</h1></main><script>Promise.all([fetch('/repeated-missing'),fetch('/repeated-missing'),fetch('/repeated-missing')]).catch(function(){})</script>" }); return; }
    }

    sendHtml(response, { title: "Unexpected fixture route", body: "<main><h1>Unexpected fixture route</h1></main>" }, 404);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Reliability fixture did not bind a TCP port.");
  return {
    profileId,
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

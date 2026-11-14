// Petit serveur statique sans dépendance pour lancer BlocSim en local.
// Usage : node server.js [port]   (par défaut 8080)
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const LOGS = path.join(ROOT, "logs");
const { ollamaChat, ollamaStatus } = require("./tools/ollama");

// relais vers le modèle local : le navigateur n'appelle jamais Ollama directement
function llm(req, res) {
  let body = "";
  req.on("data", (c) => { body += c; if (body.length > 2e6) req.destroy(); });
  req.on("end", async () => {
    const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
    try {
      const b = JSON.parse(body);
      if (!Array.isArray(b.messages)) return send(400, { error: "messages manquants" });
      const t0 = Date.now();
      const out = await ollamaChat(b);
      console.log(`LLM ${out.model} : ${((Date.now() - t0) / 1000).toFixed(1)} s, ${out.tokens.output} jetons`);
      send(200, out);
    } catch (e) {
      send(502, { error: e.message });
    }
  });
}

function saveLogs(req, res) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 20e6) req.destroy();
  });
  req.on("end", () => {
    try {
      const { files } = JSON.parse(body);
      fs.mkdirSync(LOGS, { recursive: true });
      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
      const saved = files.map((f) => {
        const name = `${stamp}-${String(f.name).replace(/[^A-Za-z0-9._-]/g, "_")}`;
        fs.writeFileSync(path.join(LOGS, name), String(f.csv), "utf8");
        return `logs/${name}`;
      });
      console.log("Log enregistré :", saved.join(", "));
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ saved }));
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Requête invalide" }));
    }
  });
}

http
  .createServer((req, res) => {
    const route = req.url.split("?")[0];
    if (req.method === "POST" && route === "/api/log") return saveLogs(req, res);
    if (req.method === "POST" && route === "/api/llm") return llm(req, res);
    if (req.method === "GET" && route === "/api/llm/status") {
      return ollamaStatus().then((s) => { res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(s)); });
    }
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";
    const file = path.normalize(path.join(ROOT, urlPath));
    if (!file.startsWith(ROOT) || file.includes(`${path.sep}data${path.sep}raw`)) {
      res.writeHead(403);
      return res.end("Accès refusé");
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Fichier introuvable");
      }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(data);
    });
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`BlocSim tourne sur http://localhost:${PORT}`);
  });

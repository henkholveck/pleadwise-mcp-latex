const fs = require("fs");
const path = require("path");

function downloadRoute(appDir = "/app/build") {
  return function(req, res) {
    const id = path.basename(req.url.replace("/files/", "").replace(".pdf", ""));
    // Strict validation: only alphanumeric, hyphen, underscore
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(404).json({ error: "invalid file id" });
    }
    // Block traversal: basename only, no .. allowed (already enforced by basename but double-check)
    const file = path.join(appDir, id + ".pdf");
    const resolved = path.resolve(file);
    const base = path.resolve(appDir);
    if (!resolved.startsWith(base)) {
      return res.status(404).json({ error: "invalid path" });
    }
    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ error: "not found" });
    }
    const stat = fs.statSync(resolved);
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=" + path.basename(resolved),
      "Content-Length": stat.size,
    });
    fs.createReadStream(resolved).pipe(res);
  };
}

module.exports = { downloadRoute };

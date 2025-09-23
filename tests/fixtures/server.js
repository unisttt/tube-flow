const { createServer } = require('http');
const { readFile } = require('fs/promises');
const { join, extname } = require('path');

const PORT = Number(process.env.PORT) || 4173;
const ROOT = join(__dirname, 'static');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const server = createServer(async (req, res) => {
  try {
    const pathname = req.url === '/' ? '/youtube-home.html' : req.url;
    const filePath = join(ROOT, pathname.replace(/\../g, '.'));
    const data = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'text/plain; charset=utf-8';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`[TubeFlow fixtures] Listening on http://127.0.0.1:${PORT}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

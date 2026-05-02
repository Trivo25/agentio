import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (process.argv[i]?.startsWith('--')) {
    args.set(process.argv[i].slice(2), process.argv[i + 1]);
  }
}

const root = join(process.cwd(), 'landing');
const host = args.get('host') ?? process.env.HOST ?? '127.0.0.1';
const port = Number(args.get('port') ?? process.env.PORT ?? 4173);
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.png', 'image/png'],
  ['.json', 'application/json; charset=utf-8'],
]);

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const pathname = url.pathname === '/' ? '/uniswap-demo.html' : url.pathname;
  const candidate = normalize(join(root, pathname));

  if (!candidate.startsWith(root) || !existsSync(candidate)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, { 'content-type': types.get(extname(candidate)) ?? 'application/octet-stream' });
  createReadStream(candidate).pipe(response);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Try: npm run example:uniswap:web-ui -- --port ${port + 1}`);
    process.exit(1);
  }

  throw error;
});

server.listen(port, host, () => {
  console.log(`0xAgentio Uniswap web UI: http://${host}:${port}/uniswap-demo.html`);
});

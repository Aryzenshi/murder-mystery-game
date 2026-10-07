import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import { registerHandlers } from './socket/handlers';
import { RoomManager } from './rooms/RoomManager';
import { getNetworkInfo } from './services/network';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** True for RFC1918 / loopback / link-local / ULA addresses. */
function isPrivateAddress(ip: string | undefined): boolean {
  const address = String(ip ?? '');
  if (!address) return false;
  if (address === '::1' || address === '::ffff:127.0.0.1' || address.startsWith('127.')) return true;
  if (address.startsWith('10.') || address.startsWith('192.168.') || address.startsWith('169.254.')) return true;
  if (address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')) return true;
  const match = /^172\.(\d+)\./.exec(address);
  return !!match && Number(match[1]) >= 16 && Number(match[1]) <= 31;
}

export interface MansionServer {
  app: express.Express;
  server: http.Server;
  io: Server;
  manager: RoomManager;
}

export function createApp(
  port = Number(process.env.PORT ?? 3000),
  options: { aiDelayScale?: number } = {},
): MansionServer {
  const app = express();
  const server = http.createServer(app);
  /**
   * Cross-origin sockets are OFF unless the operator lists the origins in
   * `CLIENT_ORIGIN` (comma separated). Reflecting any origin back with
   * credentials (`origin: true`) would let any website drive a visitor's game
   * session, so we never do it by accident.
   */
  const allowedOrigins = (process.env.CLIENT_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const io = new Server(server, {
    path: '/socket.io',
    cors: allowedOrigins.length ? { origin: allowedOrigins, credentials: true } : undefined,
    pingInterval: 20000,
    pingTimeout: 25000,
    // A single frame of intent is a few hundred bytes; 1 MB is plenty.
    maxHttpBufferSize: 1e6,
  });

  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });

  // Anti-scraping middleware for assets
  app.use(['/art', '/audio'], (req, res, next) => {
    const secFetchSite = req.headers['sec-fetch-site'];
    const secFetchDest = req.headers['sec-fetch-dest'];
    const referer = req.headers.referer;

    // Reject requests that are clearly direct navigations or from external sites
    if (secFetchSite === 'none' || secFetchSite === 'cross-site' || secFetchDest === 'document') {
      return res.status(403).send('Direct downloading of assets is forbidden.');
    }

    // Fallback for older clients/scrapers without fetch metadata: require a same-origin referer
    if (!secFetchSite && !secFetchDest) {
      if (!referer || !referer.includes(req.headers.host || '')) {
        return res.status(403).send('Direct downloading of assets is forbidden.');
      }
    }
    
    next();
  });

  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime(), rooms: manager.size });
  });

  /**
   * LAN addresses of the machine running this server. Internal addressing is
   * only useful — and only disclosed — to somebody already on this network, so
   * callers from a public address get the "no LAN here" answer.
   */
  app.get('/api/network-info', (req, res) => {
    const info = getNetworkInfo(port);
    if (!isPrivateAddress(req.ip)) {
      res.json({ port, lanUrl: null, addresses: [], hostnames: [], lanReachable: false, mode: 'online' });
      return;
    }
    res.json({ ...info, mode: 'lan-capable' });
  });

  /**
   * A QR code for a URL, drawn by hand into a PNG (no third-party service).
   * `?format=data-url` returns `{ dataUrl }` instead of raw image bytes.
   */
  app.get('/api/qr', async (req, res) => {
    const target = String(req.query.url ?? '');
    if (!/^https?:\/\//.test(target)) {
      res.status(400).json({ error: 'A url query parameter is required.' });
      return;
    }
    const options = {
      margin: 1,
      width: 320,
      errorCorrectionLevel: 'M' as const,
      color: { dark: '#241a14', light: '#f4ecda' },
    };
    try {
      if (req.query.format === 'data-url') {
        res.json({ dataUrl: await QRCode.toDataURL(target, options) });
        return;
      }
      const png = await QRCode.toBuffer(target, { ...options, type: 'png' });
      res.type('png').set('Cache-Control', 'public, max-age=3600').send(png);
    } catch {
      res.status(500).json({ error: 'Could not draw the QR code.' });
    }
  });

  const clientDist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .status(200)
        .set('Content-Type', 'text/html')
        .send(
          '<pre style="font-family:Georgia,serif;padding:2rem;background:#f4ecda;color:#241a14">Mystery Mansion server is running.\n\nThe client has not been built yet. Run `npm run build` and reload,\nor start the Vite dev server with `npm run dev` (port 5173).</pre>',
        );
    });
  }

  const manager = new RoomManager(io, { aiDelayScale: options.aiDelayScale ?? 1 });
  registerHandlers(io, manager);

  return { app, server, io, manager };
}

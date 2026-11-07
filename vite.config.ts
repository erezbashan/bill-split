import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';

// Store outside the project root in os.tmpdir() so Vite's file watcher
// never triggers HMR / page reloads when bills are updated!
const STORAGE_FILE = path.join(os.tmpdir(), 'billsplit-local-dev-bills.json');
const env = loadEnv('development', process.cwd(), '');
const RESEND_API_KEY = process.env.RESEND_API_KEY || env.RESEND_API_KEY || '';
const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL || env.CONTACT_TO_EMAIL || 'erez.bashan@gmail.com';

interface StoredBill {
  id: string;
  expiresAt?: number;
  [key: string]: unknown;
}

interface StoredData {
  bills: Record<string, StoredBill>;
  images: Record<string, string>;
}

function loadStore(): StoredData {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8')) as StoredData;
    }
  } catch {
    // ignore
  }
  return { bills: {}, images: {} };
}

function saveStore(store: StoredData) {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function localRealtimeBillsPlugin(): Plugin {
  const store = loadStore();

  return {
    name: 'local-realtime-bills-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Contact email endpoint: POST /api/contact
        if (req.url === '/api/contact' && req.method === 'POST') {
          try {
            const body = (await readJsonBody(req)) as {
              name?: string;
              replyTo?: string;
              message?: string;
            };
            const senderName = (body.name || 'משתמש Bill Split').trim();
            const replyTo = (body.replyTo || '').trim();
            const message = (body.message || '').trim();

            if (!message) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Missing message' }));
              return;
            }

            const html = `
              <div dir="rtl" style="font-family: sans-serif; line-height: 1.6; color: #1e293b;">
                <h2>פנייה חדשה מאפליקציית Bill Split 🧾</h2>
                <p><strong>מאת:</strong> ${senderName}</p>
                ${replyTo ? `<p><strong>פרטי חזרה (אימייל/טלפון):</strong> ${replyTo}</p>` : ''}
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
                <p style="white-space: pre-wrap;">${message}</p>
              </div>
            `;

            const resendRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: 'Bill Split App <onboarding@resend.dev>',
                to: [CONTACT_TO_EMAIL],
                subject: `🧾 פנייה מאפליקציית Bill Split מאת ${senderName}`,
                html,
              }),
            });

            if (!resendRes.ok) {
              const errText = await resendRes.text();
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: errText }));
              return;
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        if (!req.url?.startsWith('/api/bills/')) {
          return next();
        }

        const urlObj = new URL(req.url, 'http://localhost');
        const parts = urlObj.pathname.replace(/^\/api\/bills\//, '').split('/');
        const billId = parts[0];
        const subRoute = parts[1]; // undefined | 'receipt'

        if (!billId) return next();

        // Receipt image: GET or PUT /api/bills/:id/receipt
        if (subRoute === 'receipt') {
          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify({ dataUrl: store.images[billId] ?? null }));
            return;
          }
          if (req.method === 'PUT') {
            const body = (await readJsonBody(req)) as { dataUrl?: string };
            if (body?.dataUrl) {
              store.images[billId] = body.dataUrl;
              saveStore(store);
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
            return;
          }
        }

        // Bill document: GET or PUT /api/bills/:id
        if (!subRoute) {
          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            const bill = store.bills[billId];

            if (!bill) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'NOT_FOUND' }));
              return;
            }

            // Check if 24h TTL expired
            if (typeof bill.expiresAt === 'number' && Date.now() > bill.expiresAt) {
              delete store.bills[billId];
              delete store.images[billId];
              saveStore(store);
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'EXPIRED' }));
              return;
            }

            res.statusCode = 200;
            res.end(JSON.stringify(bill));
            return;
          }

          if (req.method === 'PUT') {
            const billData = (await readJsonBody(req)) as StoredBill;
            store.bills[billId] = billData;
            saveStore(store);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(billData));
            return;
          }
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localRealtimeBillsPlugin()],
});

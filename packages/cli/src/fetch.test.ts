import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchWellKnown, normalizeDomain } from './fetch.js';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let handler: Handler = (_req, res) => res.end();
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('failed to bind test server');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe('normalizeDomain', () => {
  it('strips scheme, path, and whitespace', () => {
    expect(normalizeDomain('https://example.com/foo')).toBe('example.com');
    expect(normalizeDomain('  example.com/ ')).toBe('example.com');
    expect(normalizeDomain('example.com')).toBe('example.com');
  });
});

describe('fetchWellKnown', () => {
  it('reads a 200 JSON body with its content-type and byte length', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"applinks":{}}');
    };
    const doc = await fetchWellKnown(`${baseUrl}/.well-known/apple-app-site-association`);
    expect(doc.ok).toBe(true);
    expect(doc.status).toBe(200);
    expect(doc.scheme).toBe('http');
    expect(doc.contentType).toBe('application/json');
    expect(doc.body).toBe('{"applinks":{}}');
    expect(doc.byteLength).toBe(15);
    expect(doc.redirected).toBe(false);
    expect(doc.truncated).toBe(false);
  });

  it('detects a redirect without following it', async () => {
    handler = (_req, res) => {
      res.writeHead(301, { location: 'https://cdn.example.com/aasa' });
      res.end();
    };
    const doc = await fetchWellKnown(`${baseUrl}/x`);
    expect(doc.redirected).toBe(true);
    expect(doc.redirectLocation).toBe('https://cdn.example.com/aasa');
    expect(doc.ok).toBe(false);
  });

  it('caps and flags an oversized body', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('x'.repeat(300 * 1024));
    };
    const doc = await fetchWellKnown(`${baseUrl}/big`, { maxBytes: 128 * 1024 });
    expect(doc.truncated).toBe(true);
    expect(doc.byteLength).toBeGreaterThan(128 * 1024);
  });

  it('captures a transport error against a closed port', async () => {
    const doc = await fetchWellKnown('http://127.0.0.1:1/nope');
    expect(doc.ok).toBe(false);
    expect(doc.status).toBe(0);
    expect(doc.networkError).toBeDefined();
  });

  it('reports a non-2xx status', async () => {
    handler = (_req, res) => {
      res.writeHead(404);
      res.end('not found');
    };
    const doc = await fetchWellKnown(`${baseUrl}/missing`);
    expect(doc.ok).toBe(false);
    expect(doc.status).toBe(404);
  });
});

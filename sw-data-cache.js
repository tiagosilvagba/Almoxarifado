"use strict";

const CACHE_NAME = "almoxarifado-csv-v1";
const CSV_PATTERN = /\.csv(?:$|\?)/i;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !CSV_PATTERN.test(url.pathname + url.search)) return;

  event.respondWith(csvCacheFirst(request, event));
});

async function csvCacheFirst(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request.url);

  if (!cached) {
    const response = await fetchFresh(request);
    if (response.ok) await cache.put(request.url, response.clone());
    return response;
  }

  event.waitUntil(revalidateCsv(request, cached, cache));
  return cached;
}

async function revalidateCsv(request, cached, cache) {
  try {
    const headers = new Headers(request.headers);
    const etag = cached.headers.get("etag");
    const lastModified = cached.headers.get("last-modified");
    if (etag) headers.set("If-None-Match", etag);
    if (lastModified) headers.set("If-Modified-Since", lastModified);

    const response = await fetch(request.url, {
      method: "GET",
      headers,
      cache: "no-store",
      credentials: request.credentials,
      mode: request.mode,
      redirect: request.redirect,
    });

    if (response.status === 304) return;
    if (!response.ok) return;

    if (await sameResponse(cached, response)) return;

    await cache.put(request.url, response.clone());
    await notifyClients(request.url);
  } catch {
    // Mantém a última leitura válida se a rede estiver indisponível.
  }
}

async function fetchFresh(request) {
  try {
    return await fetch(request.url, {
      method: "GET",
      headers: request.headers,
      cache: "no-store",
      credentials: request.credentials,
      mode: request.mode,
      redirect: request.redirect,
    });
  } catch (error) {
    throw error;
  }
}

async function sameResponse(cached, fresh) {
  const cachedEtag = cached.headers.get("etag");
  const freshEtag = fresh.headers.get("etag");
  if (cachedEtag && freshEtag) return cachedEtag === freshEtag;

  const cachedLength = cached.headers.get("content-length");
  const freshLength = fresh.headers.get("content-length");
  const cachedModified = cached.headers.get("last-modified");
  const freshModified = fresh.headers.get("last-modified");
  if (cachedLength && freshLength && cachedModified && freshModified) {
    return cachedLength === freshLength && cachedModified === freshModified;
  }

  return false;
}

async function notifyClients(url) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: "almoxarifado-csv-updated", url });
  }
}

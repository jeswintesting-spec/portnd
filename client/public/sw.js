const map = new Map();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const data = event.data;
  
  if (data.type === 'STREAM_OPEN') {
    const { filename, size, type, streamId } = data;
    
    let controller;
    const stream = new ReadableStream({
      start(c) {
        controller = c;
      },
      cancel() {
        map.delete(streamId);
      }
    });
    
    map.set(streamId, {
      stream,
      controller,
      filename,
      size,
      type
    });
    
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ status: 'OPENED' });
    }
  } else if (data.type === 'STREAM_CHUNK') {
    const { streamId, chunk } = data;
    const entry = map.get(streamId);
    if (entry && entry.controller) {
      entry.controller.enqueue(chunk);
    }
  } else if (data.type === 'STREAM_CLOSE') {
    const { streamId } = data;
    const entry = map.get(streamId);
    if (entry && entry.controller) {
      entry.controller.close();
      map.delete(streamId);
    }
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (url.pathname.includes('/download-stream')) {
    const streamId = url.searchParams.get('id');
    const entry = map.get(streamId);
    
    if (entry) {
      const headers = new Headers({
        'Content-Type': entry.type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(entry.filename)}"`,
        'Content-Length': entry.size,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff'
      });
      
      event.respondWith(new Response(entry.stream, { headers }));
    } else {
      event.respondWith(new Response('Stream expired or not found. Please try the transfer again.', { status: 404 }));
    }
  }
});

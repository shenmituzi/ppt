// 开发期绕过 HTTP 缓存：部分内嵌浏览器无视 no-cache/ETag，
// 会导致改动后页面一直加载旧代码。此 SW 强制所有 GET 请求直连网络。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request, { cache: "no-store" }));
});

import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // 开发期禁用缓存：内嵌浏览器等环境可能无视 no-cache 导致改动不可见
    headers: { "Cache-Control": "no-store" },
  },
});

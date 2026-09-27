import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: true,
    watch: {
      // Аварийный дамп Git Bash: пока он пишется, Windows держит файл занятым, и слежение Vite падает (EBUSY)
      ignored: ["**/*.stackdump"],
    },
  },
});

import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function runSync(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: root, shell: true });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log("[Dev Watch] Checking binaries...");
runSync("node", ["scripts/ensure-ffmpeg-win.mjs"]);
runSync("node", ["scripts/ensure-go2rtc-win.mjs"]);

console.log("[Dev Watch] Performing initial build...");
runSync("npx", ["tsc", "-p", "tsconfig.json"]);
runSync("npx", ["vite", "build"]);

console.log("[Dev Watch] Starting code watchers...");
const tscWatch = spawn("npx", ["tsc", "-p", "tsconfig.json", "-w"], { stdio: "ignore", cwd: root, shell: true });
const viteWatch = spawn("npx", ["vite", "build", "--watch"], { stdio: "ignore", cwd: root, shell: true });

let electronProcess = null;
let isExiting = false;

function startElectron() {
  if (electronProcess) {
    electronProcess.kill();
  }
  
  electronProcess = spawn("npx", ["electron", "."], { stdio: "inherit", cwd: root, shell: true });
  
  electronProcess.on("close", (code) => {
    if (!isExiting) {
      cleanup();
      process.exit(code || 0);
    }
  });
}

function cleanup() {
  isExiting = true;
  tscWatch.kill();
  viteWatch.kill();
  if (electronProcess) {
    electronProcess.kill();
  }
}

// Watch main process compiler output to auto-restart Electron when changed
const mainJsDir = path.join(root, "dist", "electron");
let fsTimeout = null;

if (fs.existsSync(mainJsDir)) {
  fs.watch(mainJsDir, (event, filename) => {
    if (filename === "main.js") {
      if (!fsTimeout) {
        fsTimeout = setTimeout(() => {
          console.log("\n[Dev Watch] Main process changed. Restarting Electron...");
          startElectron();
          fsTimeout = null;
        }, 800);
      }
    }
  });
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

console.log("[Dev Watch] Launching Electron app...");
startElectron();

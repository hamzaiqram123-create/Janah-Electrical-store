/** Development mode: rebuilds the client bundles on change and restarts the server when server code changes. */
import { watch } from "fs";
import { join } from "path";

const root = join(import.meta.dir, "..");
const build = () => Bun.spawnSync(["bun", "scripts/build.ts", "--dev"], { cwd: root, stdout: "inherit", stderr: "inherit" }).exitCode === 0;

if (!build()) process.exit(1);
const server = Bun.spawn(["bun", "--watch", "src/server/index.ts"], { cwd: root, stdout: "inherit", stderr: "inherit", env: { ...process.env, NODE_ENV: "development" } });

let timer: ReturnType<typeof setTimeout> | undefined;
for (const dir of ["src/web", "src/admin", "src/shared"]) {
  watch(join(root, dir), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(build, 150);
  });
}
process.on("SIGINT", () => { server.kill(); process.exit(0); });

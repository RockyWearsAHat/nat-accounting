import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const misplaced = path.join(root, "frontend", "dist", "client");
const target = path.join(root, "dist", "client");

if (fs.existsSync(misplaced)) {
  if (!fs.existsSync(path.join(root, "dist")))
    fs.mkdirSync(path.join(root, "dist"));
  if (fs.existsSync(target)) {
    // Already consolidated; skip
    process.exit(0);
  }
  fs.renameSync(misplaced, target);
  // Remove empty container directories if any
  const frontendDist = path.join(root, "frontend", "dist");
  try {
    const remain = fs.readdirSync(frontendDist);
    if (remain.length === 0) fs.rmdirSync(frontendDist);
  } catch {}
  console.log("Moved client assets into dist/client");
}

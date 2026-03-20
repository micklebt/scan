import dotenv from "dotenv";
import fs from "fs";
import path from "path";

const root = process.cwd();
const primary = path.join(root, "docucapture.env");
const fallback = path.join(root, ".env");

if (fs.existsSync(primary)) {
  dotenv.config({ path: primary });
} else if (fs.existsSync(fallback)) {
  dotenv.config({ path: fallback });
} else {
  dotenv.config();
}

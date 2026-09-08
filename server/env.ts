import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);

if (process.env.SKIP_DOTENV !== "true") {
  dotenv.config({ path: path.resolve(currentDirPath, ".env"), quiet: true });
}

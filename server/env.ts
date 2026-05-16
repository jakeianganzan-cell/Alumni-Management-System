import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);

dotenv.config({ path: path.resolve(currentDirPath, "../.env") });
dotenv.config({ path: path.resolve(currentDirPath, ".env"), override: true });

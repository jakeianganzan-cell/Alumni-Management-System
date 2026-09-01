import "./env";
import app from "./app";
import { logger } from "./utils/logger";

const PORT = Number(process.env.PORT_OVERRIDE || process.env.PORT || 5000);
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
    logger.startup(`API server running on http://${HOST}:${PORT}`);
});

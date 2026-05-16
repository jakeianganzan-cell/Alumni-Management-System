import "./env";
import app from "./app";

const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
    console.log(`API server running on http://${HOST}:${PORT}`);
});

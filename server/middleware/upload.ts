import express from "express";

export const alumniImportFileParser = express.raw({
    type: [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/octet-stream"
    ],
    limit: "15mb"
});

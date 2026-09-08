const FILE_EXTENSION_BY_MIME: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx"
};

export const parseDataUrlUpload = (dataUrl: string, maxBytes = 8 * 1024 * 1024) => {
    const match = String(dataUrl || "").match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
    if (!match) {
        throw new Error("Upload must be a valid file data URL.");
    }

    const mimeType = match[1].toLowerCase();
    const extension = FILE_EXTENSION_BY_MIME[mimeType];
    if (!extension) {
        throw new Error("Only image, PDF, and Office document uploads are allowed.");
    }

    const encoded = match[2];
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
        throw new Error("Upload contains invalid base64 data.");
    }
    const buffer = Buffer.from(encoded, "base64");
    if (buffer.length > maxBytes) {
        throw new Error(`Uploads must be ${Math.floor(maxBytes / 1024 / 1024)}MB or smaller.`);
    }

    if (!hasValidFileSignature(buffer, mimeType)) {
        throw new Error("Uploaded file content does not match the declared file type.");
    }

    if (mimeType.startsWith("application/vnd.openxmlformats-officedocument.")) {
        const archiveText = buffer.toString("latin1");
        if (!archiveText.includes("[Content_Types].xml") || /vbaProject\.bin/i.test(archiveText)) {
            throw new Error("Office uploads must be valid, macro-free OpenXML documents.");
        }
    }

    return {
        buffer,
        extension,
        mimeType,
        size: buffer.length
    };
};

export const hasValidFileSignature = (buffer: Buffer, mimeType: string) => {
    if (mimeType === "application/pdf") {
        return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    }

    if (mimeType.startsWith("application/vnd.openxmlformats-officedocument.")) {
        return buffer[0] === 0x50 && buffer[1] === 0x4b;
    }

    if (mimeType === "image/png") {
        return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }

    if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
        return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
    }

    if (mimeType === "image/gif") {
        const header = buffer.subarray(0, 6).toString("ascii");
        return header === "GIF87a" || header === "GIF89a";
    }

    if (mimeType === "image/webp") {
        return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
    }

    if (mimeType === "image/x-icon" || mimeType === "image/vnd.microsoft.icon") {
        return buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00;
    }

    return false;
};

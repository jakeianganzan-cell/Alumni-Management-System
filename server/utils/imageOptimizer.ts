import { hasValidFileSignature } from "./fileUpload";

const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico"
};

export const parseImageDataUrl = (dataUrl: string, maxBytes = 5 * 1024 * 1024) => {
    const match = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
        throw new Error("Upload must be an image file.");
    }

    const mimeType = match[1].toLowerCase();
    const extension = IMAGE_EXTENSION_BY_MIME[mimeType];
    if (!extension) {
        throw new Error("Only PNG, JPG, GIF, WebP, and ICO images are allowed.");
    }

    const encoded = match[2];
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
        throw new Error("Image upload contains invalid base64 data.");
    }
    const buffer = Buffer.from(encoded, "base64");
    if (buffer.length > maxBytes) {
        throw new Error(`Image uploads must be ${Math.floor(maxBytes / 1024 / 1024)}MB or smaller.`);
    }

    if (!hasValidFileSignature(buffer, mimeType)) {
        throw new Error("Uploaded image content does not match the declared file type.");
    }

    return {
        buffer,
        extension,
        mimeType,
        size: buffer.length
    };
};

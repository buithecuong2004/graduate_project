/**
 * storage.js — AWS S3 media storage helpers
 * Drop-in replacement for the old ImageKit helpers.
 *
 * Exported API:
 *   uploadFile({ fileBuffer, fileName, folder, mimeType }) → { url, fileId }
 *   deleteFile(fileKey)                                     → void (throws on error)
 *   getPublicUrl(fileKey)                                   → string
 */

import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import s3 from "./s3.js";
import path from "path";
import crypto from "crypto";

const BUCKET = process.env.AWS_S3_BUCKET;
const REGION = process.env.AWS_S3_REGION;

/**
 * Build the public HTTPS URL for an S3 object key.
 * @param {string} fileKey  - e.g. "posts/abc123.jpg"
 */
export const getPublicUrl = (fileKey) => {
    if (!fileKey) return "";
    // Use virtual-hosted-style URL (works for all public buckets)
    return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${fileKey}`;
};

/**
 * Generate a unique S3 object key.
 * @param {string} folder     - e.g. "posts" or "users/profile"
 * @param {string} fileName   - original file name (used for extension only)
 */
const generateKey = (folder, fileName) => {
    const ext = path.extname(fileName) || "";
    const unique = crypto.randomBytes(16).toString("hex");
    const folderPrefix = folder ? `${folder}/` : "";
    return `${folderPrefix}${unique}${ext}`;
};

/**
 * Upload a file buffer to S3.
 *
 * @param {object}  opts
 * @param {Buffer}  opts.fileBuffer  - raw file bytes
 * @param {string}  opts.fileName    - original file name (for extension)
 * @param {string}  [opts.folder]    - S3 "folder" prefix (no leading/trailing slash)
 * @param {string}  [opts.mimeType]  - MIME type (defaults to application/octet-stream)
 *
 * @returns {{ url: string, fileId: string }}
 *   url    – public CDN/S3 URL
 *   fileId – S3 object key (used to delete later)
 */
export const uploadFile = async ({ fileBuffer, fileName, folder = "", mimeType = "application/octet-stream", fixedKey = null }) => {
    const fileKey = fixedKey || generateKey(folder, fileName);

    // Use the managed Upload helper for large files (auto-multipart)
    const uploader = new Upload({
        client: s3,
        params: {
            Bucket: BUCKET,
            Key: fileKey,
            Body: fileBuffer,
            ContentType: mimeType,
        },
    });

    await uploader.done();

    return {
        url: getPublicUrl(fileKey),
        fileId: fileKey, // we store the key so we can delete later
    };
};

/**
 * Delete a file from S3 by its object key.
 * Silently ignores empty / null keys.
 *
 * @param {string} fileKey - S3 object key stored as media_id / image_ids / video_id
 */
export const deleteFile = async (fileKey) => {
    if (!fileKey) return;

    await s3.send(
        new DeleteObjectCommand({
            Bucket: BUCKET,
            Key: fileKey,
        })
    );
};

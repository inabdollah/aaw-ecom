// pages/api/process-pharma-aligner.ts
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable prefer-const */
// @ts-nocheck

import { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import archiver from "archiver";
import sharp from "sharp";
import fetch from "node-fetch";
import Papa from "papaparse"; // yarn add papaparse (or npm i papaparse)
import fs from "fs";

// Disable Next.js default body parsing so formidable can handle file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

/** 
 * Determines whether a pixel should be considered background.
 */
function isBackgroundPixel(r: number, g: number, b: number): boolean {
  const whiteThreshold = 235;
  if (r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold) return true;
  const greyTolerance = 10;
  const greyMinValue = 240;
  if (
    Math.abs(r - g) <= greyTolerance &&
    Math.abs(r - b) <= greyTolerance &&
    Math.abs(g - b) <= greyTolerance &&
    r >= greyMinValue &&
    g >= greyMinValue &&
    b >= greyMinValue
  ) {
    return true;
  }
  return false;
}

/**
 * Processes an image buffer and appends the final JPEG image to the ZIP archive.
 */
async function processImageBuffer(inputBuffer, filename, archive) {
  try {
    // (Optional) Auto-rotate the image based on EXIF data.
    // This can help avoid issues with images whose dimensions/orientation aren’t as expected.
    inputBuffer = await sharp(inputBuffer).rotate().toBuffer();
  } catch (err) {
    console.error(`Error auto-rotating image ${filename}:`, err);
    // Proceed with the original buffer if auto-rotate fails.
  }

  let composedBuffer;
  try {
    // Create a 2000×2000 canvas with the input image centered.
    composedBuffer = await sharp({
      create: {
        width: 2000,
        height: 2000,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([{ input: inputBuffer, gravity: "center" }])
      .png() // use PNG for intermediate processing
      .toBuffer();
  } catch (err) {
    console.error(`Error compositing image ${filename}:`, err);
    return; // Skip this image if we can’t composite it.
  }

  // Get raw pixel data so we can compute the crop region.
  let image = sharp(composedBuffer).ensureAlpha();
  let data, info;
  try {
    ({ data, info } = await image.raw().toBuffer({ resolveWithObject: true }));
  } catch (err) {
    console.error(`Error reading raw pixels for image ${filename}:`, err);
    return;
  }
  const { width, height, channels } = info;

  // Determine crop boundaries based on non-background pixels.
  let minX = width,
    minY = height,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx],
        g = data[idx + 1],
        b = data[idx + 2];
      if (!isBackgroundPixel(r, g, b)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) {
    // If no non-background pixel was found, use the full canvas.
    minX = 0;
    minY = 0;
    maxX = width - 1;
    maxY = height - 1;
  }

  const originalMinX = minX;
  const originalProductBottom = maxY;

  // Compute initial crop dimensions.
  let cropW = maxX - minX;
  let cropH = maxY - minY;
  const marginX = Math.round(0.1 * cropW);
  const marginY = Math.round(0.1 * cropH);

  // Expand the crop region by margins while clamping to image bounds.
  maxY = Math.min(height - 1, maxY + marginY);
  minX = Math.max(0, minX - marginX);
  minY = Math.max(0, minY - marginY);
  cropW = maxX - minX + 1;
  cropH = maxY - minY + 1;

  // Validate crop dimensions.
  if (cropW <= 0 || cropH <= 0) {
    console.warn(`Invalid crop dimensions for ${filename} (cropW=${cropW}, cropH=${cropH}). Using full image.`);
    minX = 0;
    minY = 0;
    cropW = width;
    cropH = height;
  }

  const productBottomOffset = originalProductBottom - minY;
  const productCenterX = (originalMinX + maxX) / 2 - minX;

  // ---- RESIZING LOGIC: TARGET HEIGHT APPROACH ----
  const targetProductHeight = 700;
  let scaleFactor = targetProductHeight / cropH;
  let resizedHeight = Math.round(cropH * scaleFactor);
  let resizedWidth = Math.round(cropW * scaleFactor);
  // If the new width exceeds the 800px canvas limit, recalc using width as constraint.
  if (resizedWidth > 800) {
    scaleFactor = 800 / cropW;
    resizedHeight = Math.round(cropH * scaleFactor);
    resizedWidth = Math.round(cropW * scaleFactor);
  }
  // ------------------------------------------------

  let resizedBuffer;
  try {
    // Extract the crop area from the composed buffer and resize it.
    resizedBuffer = await sharp(composedBuffer)
      .extract({ left: minX, top: minY, width: cropW, height: cropH })
      .resize(resizedWidth, resizedHeight)
      .toBuffer();
  } catch (err) {
    console.error(`Error extracting/resizing image ${filename}:`, err);
    return;
  }

  const resizedProductCenterX = productCenterX * scaleFactor;
  const resizedProductBottomOffset = Math.round(productBottomOffset * scaleFactor);

  const canvasWidth = 800;
  const canvasHeight = 800;
  const leftX = Math.floor(canvasWidth / 2 - resizedProductCenterX);
  const topY = canvasHeight - 110 - resizedProductBottomOffset;

  let finalImageBuffer;
  try {
    // Create the final canvas and composite the resized image.
    finalImageBuffer = await sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 3, // JPEG does not support alpha
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([{ input: resizedBuffer, left: leftX, top: topY }])
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch (err) {
    console.error(`Error compositing final image for ${filename}:`, err);
    return;
  }

  // Append the JPEG image to the ZIP archive.
  archive.append(finalImageBuffer, { name: filename });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const form = formidable({ multiples: true });
    const { files } = await new Promise<{
      files: formidable.Files;
      fields: formidable.Fields;
    }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ files, fields });
      });
    });

    // Grab the images array from the form
    const fileArray = Array.isArray(files.images)
      ? files.images
      : [files.images].filter(Boolean);

    // (Potential) CSV file
    let sheetFile = null;
    if (files.sheet) {
      // Single file, typically
      sheetFile = Array.isArray(files.sheet) ? files.sheet[0] : files.sheet;
    }

    // Prepare ZIP response
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="SKU-Images-${Date.now()}.zip"`,
    });
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      throw err;
    });
    archive.pipe(res);

    // 1) Process directly-uploaded images (if any)
    for (const f of fileArray) {
      const filePath = f.filepath;
      const originalBuffer = fs.readFileSync(filePath);
      // Ensure the filename has a .jpg extension
      const originalFilename = f.originalFilename || `processed-${Date.now()}.jpg`;
      const outName = originalFilename.replace(/\.[^.]+$/, '.jpg');
      await processImageBuffer(originalBuffer, outName, archive);
    }

    // 2) Process the CSV sheet (fetch each image_url, rename as product_sku)
if (sheetFile) {
  const sheetBuffer = fs.readFileSync(sheetFile.filepath);
  // Convert buffer to string (assuming CSV is UTF-8)
  const csvString = sheetBuffer.toString("utf8");

  const parsed = Papa.parse(csvString, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors && parsed.errors.length) {
    console.error("CSV parse errors:", parsed.errors);
  }

  for (const row of parsed.data) {
    const imageUrl = row["image_url"];
    const productSku = row["product_sku"];
    if (!imageUrl || !productSku) continue;

    // Fetch the image using the updated approach:
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        console.warn(`Failed to fetch ${imageUrl}: ${response.statusText}`);
        continue;
      }
      // Use arrayBuffer() and convert it to a Node.js Buffer:
      const arrayBuffer = await response.arrayBuffer();
      const imgBuffer = Buffer.from(arrayBuffer);

      // Use the product SKU for the filename with a .jpg extension
      const filename = `${productSku}.jpg`;
      await processImageBuffer(imgBuffer, filename, archive);
    } catch (err) {
      console.error("Error fetching image URL:", err);
    }
  }
}

    await archive.finalize();
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}

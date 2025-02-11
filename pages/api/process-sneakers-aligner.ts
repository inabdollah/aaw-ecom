// pages/api/process-sneakers-aligner.ts
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
 * isBackgroundPixel, your Sharp pipeline, etc. 
 * (copy all your existing code for bounding box and compositing here)
 */
function isBackgroundPixel(r: number, g: number, b: number): boolean {
  const whiteThreshold = 220;
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

async function processImageBuffer(inputBuffer: Buffer, filename: string, archive: archiver.Archiver) {
  // === Your existing 2000×2000 composition, bounding box detection, etc. ===
  const composedBuffer = await sharp({
    create: {
      width: 2000,
      height: 2000,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: inputBuffer, gravity: "center" }])
    .png()
    .toBuffer();

  let image = sharp(composedBuffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (!isBackgroundPixel(r, g, b)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) {
    minX = 0; minY = 0; maxX = width - 1; maxY = height - 1;
  }

  const originalMinX = minX;
  const originalProductBottom = maxY;

  let cropW = maxX - minX;
  let cropH = maxY - minY;
  const marginX = Math.round(0.1 * cropW);
  const marginY = Math.round(0.1 * cropH);

  maxY = Math.min(height - 1, maxY + marginY);
  minX = Math.max(0, minX - marginX);
  minY = Math.max(0, minY - marginY);
  cropW = maxX - minX + 1;
  cropH = maxY - minY + 1;

  const productBottomOffset = originalProductBottom - minY;
  const productCenterX = (originalMinX + maxX) / 2 - minX;

  image = sharp(composedBuffer).extract({
    left: minX,
    top: minY,
    width: cropW,
    height: cropH,
  });

  const targetProductWidth = 700;
  let scaleFactor = targetProductWidth / cropW;
  let resizedWidth = targetProductWidth;
  let resizedHeight = Math.round(cropH * scaleFactor);
  if (resizedHeight > 800) {
    scaleFactor = 800 / cropH;
    resizedWidth = Math.round(cropW * scaleFactor);
    resizedHeight = 800;
  }
  const resizedBuffer = await image.resize(resizedWidth, resizedHeight).toBuffer();

  const resizedProductCenterX = productCenterX * scaleFactor;
  const resizedProductBottomOffset = Math.round(productBottomOffset * scaleFactor);

  const canvasWidth = 800;
  const canvasHeight = 800;
  const leftX = Math.floor(canvasWidth / 2 - resizedProductCenterX);
  const topY = canvasHeight - 212 - resizedProductBottomOffset;

  const finalImageBuffer = await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: resizedBuffer, left: leftX, top: topY }])
    .png()
    .toBuffer();

  // Add to ZIP
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

    // Prepare ZIP
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
      const outName = f.originalFilename || `processed-${Date.now()}.png`;
      await processImageBuffer(originalBuffer, outName, archive);
    }

    // 2) Process the CSV sheet (fetch each image_url, rename as product_sku)
    if (sheetFile) {
      const sheetBuffer = fs.readFileSync(sheetFile.filepath);
      // Convert buffer to string (assuming CSV is UTF-8):
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

        // Fetch the image
        try {
          const response = await fetch(imageUrl);
          if (!response.ok) {
            console.warn(`Failed to fetch ${imageUrl}: ${response.statusText}`);
            continue;
          }
          const imgBuffer = await response.buffer();
          // Use your existing pipeline:
          const filename = `${productSku}.png`; // or .jpg, etc.
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

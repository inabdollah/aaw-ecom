// pages/api/process-csv-aligner.ts
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
import Papa from "papaparse";
import fs from "fs";
import path from "path";
import os from "os";

// Server-side background removal
let removeBackgroundNode: any = null;

// Configuration for production optimization
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Disable Next.js default body parsing so formidable can handle file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

// Initialize background removal library
async function initBackgroundRemoval() {
  if (!removeBackgroundNode) {
    try {
      const { removeBackground } = await import('@imgly/background-removal-node');
      removeBackgroundNode = removeBackground;
      console.log('Background removal library initialized successfully');
      
      if (IS_PRODUCTION) {
        const memUsage = process.memoryUsage();
        console.log(`Memory after library init: RSS=${Math.round(memUsage.rss/1024/1024)}MB, Heap=${Math.round(memUsage.heapUsed/1024/1024)}MB`);
      }
    } catch (error) {
      console.error('Failed to initialize background removal:', error);
    }
  }
}

/**
 * Convert any image format to JPEG with white background
 */
async function convertToJpeg(inputBuffer: Buffer): Promise<Buffer> {
  try {
    const metadata = await sharp(inputBuffer).metadata();
    
    if (metadata.format === 'jpeg' && !metadata.hasAlpha) {
      return inputBuffer;
    }
    
    if (metadata.hasAlpha || metadata.format === 'png' || metadata.format === 'webp') {
      console.log(`Converting ${metadata.format} to JPEG with white background`);
      return await sharp(inputBuffer)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
        .toBuffer();
    }
    
    return await sharp(inputBuffer)
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toBuffer();
  } catch (error: any) {
    throw new Error(`Failed to convert image to JPEG: ${error.message}`);
  }
}

/**
 * Remove background using server-side AI
 */
async function removeBackgroundServerSide(inputBuffer: Buffer): Promise<Buffer> {
  try {
    console.log('Starting server-side background removal');
    
    if (IS_PRODUCTION) {
      const memUsage = process.memoryUsage();
      console.log(`Memory before AI processing: RSS=${Math.round(memUsage.rss/1024/1024)}MB, Heap=${Math.round(memUsage.heapUsed/1024/1024)}MB`);
    }
    
    await initBackgroundRemoval();
    
    if (!removeBackgroundNode) {
      throw new Error('Background removal library not available');
    }
    
    console.log('Converting input to proper JPEG format...');
    const jpegBuffer = await sharp(inputBuffer)
      .jpeg({ 
        quality: IS_PRODUCTION ? 85 : 98,
        chromaSubsampling: '4:4:4' 
      })
      .toBuffer();
    
    const aiConfig = IS_PRODUCTION ? {
      model: 'isnet_quint8',
      output: {
        format: 'image/png',
        quality: 0.8
      }
    } : undefined;
    
    try {
      console.log('Trying direct buffer approach with optimized settings...');
      const blob = aiConfig 
        ? await removeBackgroundNode(jpegBuffer, aiConfig)
        : await removeBackgroundNode(jpegBuffer);
        
      const result = Buffer.from(await blob.arrayBuffer());
      
      if (IS_PRODUCTION) {
        const memUsage = process.memoryUsage();
        console.log(`Memory after AI processing: RSS=${Math.round(memUsage.rss/1024/1024)}MB, Heap=${Math.round(memUsage.heapUsed/1024/1024)}MB`);
      }
      
      console.log('Server-side background removal completed (direct buffer)');
      return result;
    } catch (directError) {
      console.log('Direct buffer failed, trying file approach...', directError.message);
      
      const tempInputPath = path.join(os.tmpdir(), `input_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`);
      
      try {
        fs.writeFileSync(tempInputPath, jpegBuffer);
        
        console.log('Trying file path approach with JPEG:', tempInputPath);
        
        const blob = aiConfig
          ? await removeBackgroundNode(tempInputPath, aiConfig)
          : await removeBackgroundNode(tempInputPath);
          
        const result = Buffer.from(await blob.arrayBuffer());
        
        console.log('Server-side background removal completed (file approach)');
        return result;
        
      } finally {
        try {
          if (fs.existsSync(tempInputPath)) {
            fs.unlinkSync(tempInputPath);
          }
        } catch (cleanupError) {
          console.warn('Failed to cleanup temp file:', cleanupError);
        }
      }
    }
    
  } catch (error) {
    console.error('Server-side background removal failed:', error);
    throw new Error(`Background removal failed: ${error.message}`);
  }
}

/**
 * Add an artificial shadow under the product after background removal
 */
async function addArtificialShadow(inputBuffer: Buffer): Promise<Buffer> {
  try {
    console.log('Adding artificial shadow under product...');
    
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();
    
    if (!metadata.width || !metadata.height) {
      return inputBuffer;
    }
    
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    
    let minX = width, maxX = 0, maxY = 0;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        const alpha = channels === 4 ? data[idx + 3] : 255;
        
        if (alpha > 50) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    
    const sneakerWidth = Math.max(maxX - minX, 100);
    const sneakerCenterX = (minX + maxX) / 2;
    
    const shadowWidth = Math.floor(sneakerWidth * 1.1);
    const shadowHeight = Math.floor(shadowWidth * 0.04);
    const shadowX = Math.floor(sneakerCenterX - shadowWidth / 2);
    const shadowY = Math.floor(maxY - shadowHeight * 0.8);
    
    const shadowSvg = `
      <svg width="${metadata.width}" height="${metadata.height}">
        <defs>
          <radialGradient id="shadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" style="stop-color:rgba(0,0,0,0.45);stop-opacity:1" />
            <stop offset="60%" style="stop-color:rgba(0,0,0,0.2);stop-opacity:1" />
            <stop offset="100%" style="stop-color:rgba(0,0,0,0);stop-opacity:0" />
          </radialGradient>
        </defs>
        <ellipse cx="${shadowX + shadowWidth/2}" cy="${shadowY + shadowHeight/2}" 
                 rx="${shadowWidth/2}" ry="${shadowHeight/2}" 
                 fill="url(#shadow)" />
      </svg>
    `;
    
    const shadowBuffer = Buffer.from(shadowSvg);
    
    const backgroundWithShadow = await sharp({
      create: {
        width: metadata.width,
        height: metadata.height,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
    .composite([
      { input: shadowBuffer, top: 0, left: 0 },
      { input: inputBuffer, top: 0, left: 0 }
    ])
    .png()
    .toBuffer();
    
    console.log(`Artificial shadow added: width=${shadowWidth}px, height=${shadowHeight}px, position=(${shadowX}, ${shadowY})`);
    return backgroundWithShadow;
    
  } catch (error) {
    console.warn('Failed to add artificial shadow, using original:', error);
    return inputBuffer;
  }
}

/**
 * Determines whether a pixel should be considered background.
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

/**
 * Process image: remove background, align, and add custom background
 */
async function processImageWithCustomBackground(
  inputBuffer: Buffer,
  filename: string,
  archive: archiver.Archiver,
  shouldRemoveBackground: boolean,
  customBgPath: string
): Promise<void> {
  let processedBuffer = inputBuffer;
  
  // Step 1: Remove background if requested
  if (shouldRemoveBackground) {
    try {
      console.log(`Removing background for: ${filename}`);
      processedBuffer = await removeBackgroundServerSide(inputBuffer);
      console.log(`Background removed for: ${filename}`);
      
      processedBuffer = await addArtificialShadow(processedBuffer);
      console.log(`Artificial shadow added for: ${filename}`);
    } catch (error) {
      console.warn(`Background removal failed for ${filename}, continuing with original:`, error);
      processedBuffer = inputBuffer;
    }
  }
  
  // Step 2: Convert to JPEG
  const jpegBuffer = await convertToJpeg(processedBuffer);
  
  // Step 3: Resize if needed
  const inputImage = sharp(jpegBuffer);
  const metadata = await inputImage.metadata();
  
  let processedInputBuffer = jpegBuffer;
  
  if (metadata.width && metadata.height && (metadata.width > 2000 || metadata.height > 2000)) {
    processedInputBuffer = await inputImage
      .resize(2000, 2000, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .toBuffer();
  }
  
  // Step 4: Create 2000x2000 canvas with white background
  const composedBuffer = await sharp({
    create: {
      width: 2000,
      height: 2000,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: processedInputBuffer, gravity: "center" }])
    .png()
    .toBuffer();

  // Step 5: Find product bounds
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

  // Step 6: Crop and resize
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

  // Step 7: Load custom background image
  let customBgBuffer: Buffer;
  
  try {
    customBgBuffer = fs.readFileSync(customBgPath);
    console.log(`Loaded custom background from: ${customBgPath}`);
    
    // Resize background to 800x800
    customBgBuffer = await sharp(customBgBuffer)
      .resize(canvasWidth, canvasHeight, {
        fit: 'cover',
        position: 'center'
      })
      .toBuffer();
      
  } catch (error) {
    console.warn(`Failed to load custom background, using white:`, error);
    // Fallback to white background
    customBgBuffer = await sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
    .jpeg()
    .toBuffer();
  }

  // Step 8: Composite product onto custom background
  const finalImageBuffer = await sharp(customBgBuffer)
    .composite([{ input: resizedBuffer, left: leftX, top: topY }])
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toBuffer();

  // Step 9: Append to archive
  archive.append(finalImageBuffer, { name: filename });
}

/**
 * Download image from URL and process it
 */
async function downloadAndProcessImage(
  imageUrl: string,
  sku: string,
  archive: archiver.Archiver,
  shouldRemoveBackground: boolean,
  customBgPath: string
): Promise<void> {
  try {
    console.log(`Downloading image for SKU ${sku} from ${imageUrl}`);
    
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);
    
    const filename = `${sku}.jpg`;
    
    await processImageWithCustomBackground(
      imageBuffer,
      filename,
      archive,
      shouldRemoveBackground,
      customBgPath
    );
    
    console.log(`Successfully processed image for SKU ${sku}`);
    
    // Force garbage collection after each image in production
    if (IS_PRODUCTION && global.gc) {
      global.gc();
      console.log(`Garbage collection forced after processing ${sku}`);
    }
    
  } catch (error: any) {
    throw new Error(`Failed to download/process image for SKU ${sku}: ${error.message}`);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const form = formidable({ multiples: false });
    const { files, fields } = await new Promise<{
      files: formidable.Files;
      fields: formidable.Fields;
    }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ files, fields });
      });
    });

    // Get the CSV file
    const csvFile = Array.isArray(files.csv) ? files.csv[0] : files.csv;
    
    if (!csvFile) {
      return res.status(400).json({ error: "No CSV file provided" });
    }

    // Check if background removal is enabled
    const removeBackgroundField = Array.isArray(fields.removeBackground) 
      ? fields.removeBackground[0] 
      : fields.removeBackground;
    const shouldRemoveBackground = removeBackgroundField === 'true' || removeBackgroundField === true;
    
    console.log(`Processing CSV with background removal: ${shouldRemoveBackground}`);

    // Read and parse the CSV
    const csvBuffer = fs.readFileSync(csvFile.filepath);
    const csvString = csvBuffer.toString("utf8");
    
    const parsed = Papa.parse(csvString, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
    });

    if (parsed.errors && parsed.errors.length > 0) {
      console.error("CSV parse errors:", parsed.errors);
      return res.status(400).json({ 
        error: "Failed to parse CSV file", 
        details: parsed.errors[0].message 
      });
    }

    const rows = parsed.data as any[];
    
    if (rows.length === 0) {
      return res.status(400).json({ error: "CSV file is empty" });
    }

    // Validate CSV structure
    const firstRow = rows[0];
    if (!firstRow.sku && !firstRow.product_sku) {
      return res.status(400).json({ 
        error: "CSV must have a 'sku' or 'product_sku' column" 
      });
    }
    if (!firstRow.image_url) {
      return res.status(400).json({ 
        error: "CSV must have an 'image_url' column" 
      });
    }

    console.log(`Processing ${rows.length} rows from CSV`);

    // Path to custom background image
    const customBgPath = path.join(process.cwd(), 'public', 'coming-bg.jpg');
    
    if (!fs.existsSync(customBgPath)) {
      console.warn(`Custom background not found at ${customBgPath}, will use white background`);
    }

    // Set up the ZIP file response
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="processed-images-${Date.now()}.zip"`,
    });

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      throw err;
    });
    archive.pipe(res);

    // Process each row
    let processedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const sku = (row.sku || row.product_sku || "").trim();
      const imageUrl = (row.image_url || "").trim();
      
      if (!sku || !imageUrl) {
        console.warn(`Skipping row with missing SKU or image_url`);
        continue;
      }

      try {
        await downloadAndProcessImage(imageUrl, sku, archive, shouldRemoveBackground, customBgPath);
        processedCount++;
        
        if (processedCount % 5 === 0) {
          console.log(`Progress: ${processedCount}/${rows.length} images processed`);
        }
      } catch (error: any) {
        errorCount++;
        const errorMsg = `SKU ${sku}: ${error.message}`;
        errors.push(errorMsg);
        console.error(errorMsg);
        continue;
      }
    }

    // Add error report if needed
    if (errors.length > 0) {
      const errorReport = `Processing Report\n${"=".repeat(50)}\n\n` +
        `Total rows: ${rows.length}\n` +
        `Successfully processed: ${processedCount}\n` +
        `Failed: ${errorCount}\n\n` +
        `Errors:\n${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}`;
      
      archive.append(errorReport, { name: "ERROR_REPORT.txt" });
    }

    console.log(`Finalizing ZIP: ${processedCount} images processed, ${errorCount} errors`);
    
    await archive.finalize();
    
  } catch (error: any) {
    console.error("Global error:", error);
    
    if (res.headersSent) {
      res.end();
    } else {
      res.status(500).json({ 
        error: "Server error during processing",
        details: error.message 
      });
    }
  }
}

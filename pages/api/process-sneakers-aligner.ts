// pages/api/process-sneakers-aligner.ts
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

// Server-side background removal
let removeBackgroundNode: any = null;

// Initialize background removal library
async function initBackgroundRemoval() {
  if (!removeBackgroundNode) {
    try {
      const { removeBackground } = await import('@imgly/background-removal-node');
      removeBackgroundNode = removeBackground;
      console.log('Background removal library initialized');
    } catch (error) {
      console.error('Failed to initialize background removal:', error);
    }
  }
}

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
 * Convert any image format to JPEG with white background
 */
async function convertToJpeg(inputBuffer: Buffer): Promise<Buffer> {
  try {
    // First try to get metadata to identify the format
    const metadata = await sharp(inputBuffer).metadata();
    
    // If it's already JPEG, return as is
    if (metadata.format === 'jpeg') {
      return inputBuffer;
    }
    
    // Create a white background canvas and composite the image on top
    const image = sharp(inputBuffer);
    
    // For PNG files, WebP files, or any images with alpha channels, add white background
    if (metadata.format === 'png' || metadata.format === 'webp' || metadata.hasAlpha) {
      console.log(`Adding white background to ${metadata.format} with alpha channel`);
      return await image
        .flatten({ background: { r: 255, g: 255, b: 255 } }) // Add white background
        .jpeg({ quality: 95 })
        .toBuffer();
    }
    
    // For other formats, convert directly to JPEG
    return await image
      .jpeg({ quality: 95 })
      .toBuffer();
  } catch (error) {
    // Check if this is an AVIF-specific error
    if (error.message && (error.message.includes('heif') || error.message.includes('AVIF') || error.message.includes('bad seek'))) {
      throw new Error(`AVIF format is not supported on this server. Please convert the image to JPEG, PNG, or WebP format before uploading. You can use online converters or image editing software to convert AVIF files.`);
    }
    
    // Check for other format-specific errors
    if (error.message && error.message.includes('Input file is missing')) {
      throw new Error(`Invalid image file. Please ensure the file is not corrupted.`);
    }
    
    if (error.message && error.message.includes('unsupported image format')) {
      throw new Error(`Unsupported image format. Please use JPEG, PNG, WebP, or GIF formats.`);
    }
    
    // Generic error
    throw new Error(`Failed to process image: ${error.message}`);
  }
}

/**
 * Add white background to PNG files with transparency
 */
async function addWhiteBackgroundToPng(inputBuffer: Buffer): Promise<Buffer> {
  try {
    const metadata = await sharp(inputBuffer).metadata();
    
    // Only process PNG files with alpha channel
    if (metadata.format !== 'png' || !metadata.hasAlpha) {
      return inputBuffer; // Return original if not a transparent PNG
    }
    
    // Add white background and keep as PNG
    return await sharp(inputBuffer)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toBuffer();
  } catch (error) {
    throw new Error(`Failed to add white background to PNG: ${error.message}`);
  }
}

/**
 * Add white background to WebP files with transparency
 */
async function addWhiteBackgroundToWebp(inputBuffer: Buffer): Promise<Buffer> {
  try {
    const metadata = await sharp(inputBuffer).metadata();
    
    // Only process WebP files with alpha channel
    if (metadata.format !== 'webp' || !metadata.hasAlpha) {
      return inputBuffer; // Return original if not a transparent WebP
    }
    
    console.log('Adding white background to transparent WebP file');
    
    // Add white background and convert to JPEG to eliminate any transparency issues
    return await sharp(inputBuffer)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: 95 })
      .toBuffer();
  } catch (error) {
    throw new Error(`Failed to add white background to WebP: ${error.message}`);
  }
}

/**
 * Remove background using server-side AI
 */
async function removeBackgroundServerSide(inputBuffer: Buffer): Promise<Buffer> {
  try {
    console.log('Starting server-side background removal');
    
    // Initialize the library if not already done
    await initBackgroundRemoval();
    
    if (!removeBackgroundNode) {
      throw new Error('Background removal library not available');
    }
    
    // Remove background
    const blob = await removeBackgroundNode(inputBuffer);
    
    // Convert blob to buffer
    const result = Buffer.from(await blob.arrayBuffer());
    
    console.log('Server-side background removal completed');
    return result;
    
  } catch (error) {
    console.error('Server-side background removal failed:', error);
    throw new Error(`Background removal failed: ${error.message}`);
  }
}

/**
 * Processes an image buffer and appends the final JPEG image to the ZIP archive.
 */
async function processImageBuffer(inputBuffer: Buffer, filename: string, archive: archiver.Archiver, removeBackground = false) {
  let processedBuffer = inputBuffer;
  
  // Step 1: Remove background if requested
  if (removeBackground) {
    try {
      console.log(`Removing background for: ${filename}`);
      processedBuffer = await removeBackgroundServerSide(inputBuffer);
      console.log(`Background removed for: ${filename}`);
    } catch (error) {
      console.warn(`Background removal failed for ${filename}, continuing with original:`, error);
      processedBuffer = inputBuffer;
    }
  }
  
  // Step 2: Convert to JPEG
  const jpegBuffer = await convertToJpeg(processedBuffer);
  
  // First, check the dimensions of the input image and resize if needed
  const inputImage = sharp(jpegBuffer);
  const metadata = await inputImage.metadata();
  
  let processedInputBuffer = jpegBuffer;
  
  // If the image is larger than 2000x2000, resize it to fit
  if (metadata.width && metadata.height && (metadata.width > 2000 || metadata.height > 2000)) {
    processedInputBuffer = await inputImage
      .resize(2000, 2000, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .toBuffer();
  }
  
  // Create a 2000×2000 canvas and composite the input image in the center.
  const composedBuffer = await sharp({
    create: {
      width: 2000,
      height: 2000,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: processedInputBuffer, gravity: "center" }])
    .png() // Keep as PNG for processing
    .toBuffer();

  let image = sharp(composedBuffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let minX = width,
    minY = height,
    maxX = 0,
    maxY = 0;
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

  // Create final canvas and composite the resized image.
  const finalImageBuffer = await sharp({
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

  // Append the JPEG image to the ZIP archive.
  archive.append(finalImageBuffer, { name: filename });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const form = formidable({ multiples: true });
    const { files, fields } = await new Promise<{
      files: formidable.Files;
      fields: formidable.Fields;
    }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ files, fields });
      });
    });

    // Check if this is a preview request
    const previewField = Array.isArray(fields.preview) ? fields.preview[0] : fields.preview;
    const isPreview = previewField === 'true' || previewField === true;
    
    // Check if background removal is enabled
    const removeBackgroundField = Array.isArray(fields.removeBackground) ? fields.removeBackground[0] : fields.removeBackground;
    const shouldRemoveBackground = removeBackgroundField === 'true' || removeBackgroundField === true;
    
    console.log(`Processing request - Preview: ${isPreview}, Remove Background: ${shouldRemoveBackground}`);
    
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

    if (isPreview) {
      // For preview mode, collect processed images and return as JSON
      const previewImages: { filename: string; data: string }[] = [];
      
      // Process directly-uploaded images
      for (const f of fileArray) {
        const filePath = f.filepath;
        const originalFilename = f.originalFilename || `processed-${Date.now()}.jpg`;
        const outName = originalFilename.replace(/\.[^.]+$/, '.jpg');
        
        try {
          const originalBuffer = fs.readFileSync(filePath);
          // Process the image but collect as base64 instead of adding to archive
          const processedBuffer = await processImageForPreview(originalBuffer, shouldRemoveBackground);
          previewImages.push({
            filename: outName,
            data: `data:image/jpeg;base64,${processedBuffer.toString('base64')}`
          });
        } catch (error) {
          console.error(`Error processing file ${originalFilename}:`, error);
          return res.status(400).json({ 
            error: `Failed to process image`, 
            failedFile: originalFilename,
            details: error.message 
          });
        }
      }
      
      // Process CSV sheet images
      if (sheetFile) {
        const sheetBuffer = fs.readFileSync(sheetFile.filepath);
        const csvString = sheetBuffer.toString("utf8");
        
        const parsed = Papa.parse(csvString, {
          header: true,
          skipEmptyLines: true,
        });
        
        for (const row of parsed.data) {
          const imageUrl = row["image_url"];
          const productSku = row["product_sku"];
          if (!imageUrl || !productSku) continue;
          
          const filename = `${productSku}.jpg`;
          
          try {
            const response = await fetch(imageUrl);
            if (!response.ok) {
              console.warn(`Failed to fetch ${imageUrl}: ${response.statusText}`);
              continue;
            }
            const arrayBuffer = await response.arrayBuffer();
            const imgBuffer = Buffer.from(arrayBuffer);
            
            const processedBuffer = await processImageForPreview(imgBuffer, shouldRemoveBackground);
            previewImages.push({
              filename,
              data: `data:image/jpeg;base64,${processedBuffer.toString('base64')}`
            });
          } catch (err) {
            console.error(`Error processing image from URL ${imageUrl}:`, err);
            return res.status(400).json({ 
              error: `Failed to process image from CSV`, 
              failedFile: filename,
              details: err.message,
              imageUrl: imageUrl
            });
          }
        }
      }
      
      // Return preview images as JSON
      return res.status(200).json({ images: previewImages });
      
    } else {
      // Original ZIP download mode
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
        const originalFilename = f.originalFilename || `processed-${Date.now()}.jpg`;
        const outName = originalFilename.replace(/\.[^.]+$/, '.jpg');
        
        try {
          const originalBuffer = fs.readFileSync(filePath);
          await processImageBuffer(originalBuffer, outName, archive, shouldRemoveBackground);
        } catch (error) {
          console.error(`Error processing file ${originalFilename}:`, error);
          return res.status(400).json({ 
            error: `Failed to process image`, 
            failedFile: originalFilename,
            details: error.message 
          });
        }
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

          const filename = `${productSku}.jpg`;
          
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

            await processImageBuffer(imgBuffer, filename, archive, shouldRemoveBackground);
          } catch (err) {
            console.error(`Error processing image from URL ${imageUrl}:`, err);
            return res.status(400).json({ 
              error: `Failed to process image from CSV`, 
              failedFile: filename,
              details: err.message,
              imageUrl: imageUrl
            });
          }
        }
      }

      await archive.finalize();
    }
  } catch (error: any) {
    console.error("Global error:", error);
    res.status(500).json({ 
      error: "Server error during processing",
      details: error.message 
    });
  }
}

/**
 * Process image for preview mode - returns the processed image as a buffer
 */
async function processImageForPreview(inputBuffer: Buffer, removeBackground: boolean): Promise<Buffer> {
  let processedBuffer = inputBuffer;
  
  // Step 1: Remove background if requested
  if (removeBackground) {
    try {
      console.log('Removing background for preview image');
      processedBuffer = await removeBackgroundServerSide(inputBuffer);
      console.log('Background removed for preview image');
    } catch (error) {
      console.warn('Background removal failed for preview, continuing with original:', error);
      processedBuffer = inputBuffer;
    }
  }
  
  // Step 2: Convert to JPEG
  const jpegBuffer = await convertToJpeg(processedBuffer);
  
  // First, check the dimensions of the input image and resize if needed
  const inputImage = sharp(jpegBuffer);
  const metadata = await inputImage.metadata();
  
  let processedInputBuffer = jpegBuffer;
  
  // If the image is larger than 2000x2000, resize it to fit
  if (metadata.width && metadata.height && (metadata.width > 2000 || metadata.height > 2000)) {
    processedInputBuffer = await inputImage
      .resize(2000, 2000, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .toBuffer();
  }
  
  // Create a 2000×2000 canvas and composite the input image in the center.
  const composedBuffer = await sharp({
    create: {
      width: 2000,
      height: 2000,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: processedInputBuffer, gravity: "center" }])
    .png() // Keep as PNG for processing
    .toBuffer();

  let image = sharp(composedBuffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let minX = width,
    minY = height,
    maxX = 0,
    maxY = 0;
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

  // Create final canvas and composite the resized image.
  const finalImageBuffer = await sharp({
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

  return finalImageBuffer;
}

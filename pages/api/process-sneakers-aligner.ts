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
import path from "path";
import os from "os";

// Server-side background removal
let removeBackgroundNode: any = null;

// Cache for processed images to avoid reprocessing on download
interface ProcessedImageCache {
  buffer: Buffer;
  filename: string;
  timestamp: number;
}

const imageCache = new Map<string, ProcessedImageCache[]>();

// Configuration for production optimization
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const BATCH_SIZE = IS_PRODUCTION ? 5 : 10; // Smaller batches in production
const MAX_CONCURRENT = IS_PRODUCTION ? 2 : 3; // Fewer concurrent operations in production
const CACHE_EXPIRY = IS_PRODUCTION ? 10 * 60 * 1000 : 30 * 60 * 1000; // Shorter cache in production (10 min vs 30 min)

console.log(`Environment: ${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'} - Batch size: ${BATCH_SIZE}, Concurrent: ${MAX_CONCURRENT}`);

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

// Generate session ID for caching
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Clean expired cache entries
function cleanExpiredCache() {
  const now = Date.now();
  for (const [sessionId, cache] of imageCache.entries()) {
    if (cache.length > 0 && now - cache[0].timestamp > CACHE_EXPIRY) {
      imageCache.delete(sessionId);
      console.log(`Cleaned expired cache for session: ${sessionId}`);
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
        .jpeg({ quality: 98, chromaSubsampling: '4:4:4' }) // High quality, no color compression
        .toBuffer();
    }
    
    // For other formats, convert directly to JPEG with high quality
    return await image
      .jpeg({ quality: 98, chromaSubsampling: '4:4:4' }) // High quality, no color compression
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
 * Add an artificial shadow under the sneaker after background removal
 */
async function addArtificialShadow(inputBuffer: Buffer): Promise<Buffer> {
  try {
    console.log('Adding artificial shadow under sneaker...');
    
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();
    
    if (!metadata.width || !metadata.height) {
      return inputBuffer;
    }
    
    // Analyze the image to find the sneaker bounds
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    
    // Find the actual sneaker boundaries
    let minX = width, maxX = 0, maxY = 0;
    
    // Scan for non-transparent pixels to find sneaker bounds
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        const alpha = channels === 4 ? data[idx + 3] : 255; // Check alpha channel
        
        if (alpha > 50) { // Non-transparent pixel (part of sneaker)
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y; // Find bottom of sneaker
        }
      }
    }
    
    // Calculate shadow dimensions based on actual sneaker
    const sneakerWidth = Math.max(maxX - minX, 100); // Minimum 100px width
    const sneakerCenterX = (minX + maxX) / 2;
    
    // Shadow should be slightly wider than sneaker, thinner, and darker
    const shadowWidth = Math.floor(sneakerWidth * 1.1); // 110% of sneaker width (reduced from 120%)
    const shadowHeight = Math.floor(shadowWidth * 0.04); // Very thin - 4% of width (reduced from 8%)
    const shadowX = Math.floor(sneakerCenterX - shadowWidth / 2); // Center under sneaker
    const shadowY = Math.floor(maxY - shadowHeight * 0.8); // Move shadow up more - sneaker covers 80% of shadow
    
    // Create very subtle, thin shadow as SVG with increased darkness
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
    
    // Convert SVG to buffer
    const shadowBuffer = Buffer.from(shadowSvg);
    
    // Create white background with shadow
    const backgroundWithShadow = await sharp({
      create: {
        width: metadata.width,
        height: metadata.height,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
    .composite([
      { input: shadowBuffer, top: 0, left: 0 }, // Add shadow first
      { input: inputBuffer, top: 0, left: 0 }   // Then add sneaker on top
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
    
    // First, ensure the buffer is a proper image format
    console.log('Converting input to proper JPEG format...');
    const jpegBuffer = await sharp(inputBuffer)
      .jpeg({ quality: 98, chromaSubsampling: '4:4:4' }) // High quality for AI processing
      .toBuffer();
    
    // Try multiple approaches - using default settings for maximum background removal
    try {
      // Approach 1: Try direct buffer (default aggressive settings)
      console.log('Trying direct buffer approach with default aggressive settings...');
      const blob = await removeBackgroundNode(jpegBuffer);
      const result = Buffer.from(await blob.arrayBuffer());
      console.log('Server-side background removal completed (direct buffer)');
      return result;
    } catch (directError) {
      console.log('Direct buffer failed, trying file approach...', directError.message);
      
      // Approach 2: Use temporary file (default aggressive settings)
      const tempInputPath = path.join(os.tmpdir(), `input_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`);
      
      try {
        // Write the properly formatted JPEG to temp file
        fs.writeFileSync(tempInputPath, jpegBuffer);
        
        console.log('Trying file path approach with JPEG:', tempInputPath);
        
        // Remove background using file path (default settings)
        const blob = await removeBackgroundNode(tempInputPath);
        const result = Buffer.from(await blob.arrayBuffer());
        
        console.log('Server-side background removal completed (file approach)');
        return result;
        
      } finally {
        // Clean up temporary file
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
      
      // Add artificial shadow after background removal
      processedBuffer = await addArtificialShadow(processedBuffer);
      console.log(`Artificial shadow added for: ${filename}`);
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
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' }) // High quality output, no color compression
    .toBuffer();

  // Append the JPEG image to the ZIP archive.
  archive.append(finalImageBuffer, { name: filename });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Clean expired cache entries
    cleanExpiredCache();
    
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
    
    // Check for existing session ID (for download requests)
    const sessionIdField = Array.isArray(fields.sessionId) ? fields.sessionId[0] : fields.sessionId;
    let sessionId = sessionIdField || null;
    
    console.log(`Processing request - Preview: ${isPreview}, Remove Background: ${shouldRemoveBackground}, Session: ${sessionId}`);
    
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
      // Generate new session ID for preview
      sessionId = generateSessionId();
      
      // Collect all image data first
      const allImageData: Array<{ buffer: Buffer; filename: string }> = [];
      
      // Process directly-uploaded images
      for (const f of fileArray) {
        const filePath = f.filepath;
        const originalFilename = f.originalFilename || `processed-${Date.now()}.jpg`;
        const outName = originalFilename.replace(/\.[^.]+$/, '.jpg');
        
        try {
          const originalBuffer = fs.readFileSync(filePath);
          allImageData.push({
            buffer: originalBuffer,
            filename: outName
          });
        } catch (error) {
          console.error(`Error reading file ${originalFilename}:`, error);
          return res.status(400).json({ 
            error: `Failed to read image file`, 
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
            
            allImageData.push({
              buffer: imgBuffer,
              filename: filename
            });
          } catch (err) {
            console.error(`Error fetching image from URL ${imageUrl}:`, err);
            // Continue with other images instead of failing completely
            continue;
          }
        }
      }
      
      console.log(`Total images to process: ${allImageData.length}`);
      
      // Process all images in batches
      const processedCache = await processImagesInBatches(
        allImageData,
        shouldRemoveBackground,
        (processed, total) => {
          console.log(`Progress: ${processed}/${total} images processed`);
        }
      );
      
      // Convert to preview format
      const previewImages = processedCache.map(item => ({
        filename: item.filename,
        data: `data:image/jpeg;base64,${item.buffer.toString('base64')}`
      }));
      
      // Store processed images in cache
      imageCache.set(sessionId, processedCache);
      console.log(`Cached ${processedCache.length} processed images for session: ${sessionId}`);
      
      // Return preview images as JSON with session ID
      return res.status(200).json({ 
        images: previewImages,
        sessionId: sessionId 
      });
      
    } else {
      // Download mode - check cache first
      const cachedImages = sessionId ? imageCache.get(sessionId) : null;
      
      if (cachedImages && cachedImages.length > 0) {
        console.log(`Using cached images for session: ${sessionId} (${cachedImages.length} images)`);
        
        // Use cached images for ZIP
        res.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="SKU-Images-${Date.now()}.zip"`,
        });
        const archive = archiver("zip", { zlib: { level: 9 } });
        archive.on("error", (err) => {
          throw err;
        });
        archive.pipe(res);

        // Add cached images to ZIP
        for (const cachedImage of cachedImages) {
          archive.append(cachedImage.buffer, { name: cachedImage.filename });
        }

        await archive.finalize();
        
        // Clean up used cache
        imageCache.delete(sessionId);
        console.log(`Cleaned up cache for completed session: ${sessionId}`);
        
      } else {
        console.log(`No cache found for session: ${sessionId}, processing from scratch`);
        
        // Fallback to original processing (no cache available)
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
      
      // Add artificial shadow after background removal
      processedBuffer = await addArtificialShadow(processedBuffer);
      console.log('Artificial shadow added for preview image');
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
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' }) // High quality output, no color compression
    .toBuffer();

  return finalImageBuffer;
}

/**
 * Timeout wrapper for production safety
 */
async function withTimeout<T>(
  promise: Promise<T>, 
  timeoutMs: number, 
  errorMessage: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

/**
 * Process images in batches to avoid timeouts
 */
async function processImagesInBatches(
  imageData: Array<{ buffer: Buffer; filename: string }>,
  shouldRemoveBackground: boolean,
  onProgress?: (processed: number, total: number) => void
): Promise<ProcessedImageCache[]> {
  const processedImages: ProcessedImageCache[] = [];
  const total = imageData.length;
  
  console.log(`Processing ${total} images in batches of ${BATCH_SIZE}`);
  
  // Set timeout based on environment (production is more restrictive)
  const timeoutPerBatch = IS_PRODUCTION ? 120000 : 300000; // 2 min vs 5 min per batch
  
  // Process in batches
  for (let i = 0; i < imageData.length; i += BATCH_SIZE) {
    const batch = imageData.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(total / BATCH_SIZE);
    
    console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} images)`);
    
    try {
      // Process batch with timeout protection
      const batchPromise = Promise.all(
        batch.map(async (item, index) => {
          try {
            // Add small delay to prevent overwhelming the server
            await new Promise(resolve => setTimeout(resolve, index * 100));
            
            const processedBuffer = await processImageForPreview(item.buffer, shouldRemoveBackground);
            return {
              buffer: processedBuffer,
              filename: item.filename,
              timestamp: Date.now()
            };
          } catch (error) {
            console.error(`Failed to process ${item.filename}:`, error);
            // Return original image if processing fails
            return {
              buffer: await sharp(item.buffer).jpeg({ quality: 90 }).toBuffer(),
              filename: item.filename,
              timestamp: Date.now()
            };
          }
        })
      );
      
      const batchResults = await withTimeout(
        batchPromise,
        timeoutPerBatch,
        `Batch ${batchNumber} timed out after ${timeoutPerBatch/1000} seconds`
      );
      
      processedImages.push(...batchResults);
      
      // Report progress
      if (onProgress) {
        onProgress(processedImages.length, total);
      }
      
      console.log(`Completed batch ${batchNumber}/${totalBatches} - ${processedImages.length}/${total} images processed`);
      
      // Force garbage collection in production to manage memory
      if (IS_PRODUCTION && global.gc) {
        global.gc();
      }
      
    } catch (error) {
      console.error(`Batch ${batchNumber} failed:`, error);
      // Continue with other batches even if one fails
      continue;
    }
  }
  
  console.log(`Completed processing: ${processedImages.length}/${total} images successfully processed`);
  return processedImages;
}


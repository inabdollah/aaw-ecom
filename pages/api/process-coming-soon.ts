// pages/api/process-coming-soon.ts
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
import puppeteer from "puppeteer";

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
        background: { r: 0, g: 0, b: 0, alpha: 0 }  // Transparent background
      }
    })
    .composite([
      { input: shadowBuffer, top: 0, left: 0, blend: 'over' },
      { input: inputBuffer, top: 0, left: 0, blend: 'over' }
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
function isBackgroundPixel(r: number, g: number, b: number, alpha?: number): boolean {
  // If alpha channel is available, check for transparency
  if (typeof alpha === 'number' && alpha < 128) {
    return true;  // Consider transparent pixels as background
  }

  // For non-transparent pixels, check for white/grey
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
 * Detect brand from product name
 */
function detectBrand(productName: string): string {
  const name = productName.toLowerCase();
  
  // Adidas - IMPORTANT: Distinguish between Adidas and Adidas Originals
  if (name.includes('adidas')) {
    // Adidas Originals models (famous retro/lifestyle models)
    const adidasOriginalsModels = [
      'superstar', 'stan smith', 'gazelle', 'campus', 'samba', 'forum',
      'continental', 'nmd', 'yeezy', 'ozweego', 'zx', 'rivalry',
      'top ten', 'sl 72', 'handball spezial', 'spezial', 'prophere', 'falcon'
    ];
    
    // Check if it's an Adidas Originals model
    for (const model of adidasOriginalsModels) {
      if (name.includes(model)) {
        return 'adidas-originals';
      }
    }
    
    // Default to regular Adidas for performance/sport models
    return 'adidas';
  }
  
  // Air Jordan
  if (name.includes('air jordan') || name.includes('jordan')) {
    return 'airjordan';
  }
  
  // Nike
  if (name.includes('nike')) {
    return 'nike';
  }
  
  // New Balance
  if (name.includes('new balance') || name.includes('new-balance')) {
    return 'new-balance';
  }
  
  // Asics
  if (name.includes('asics')) {
    return 'asics';
  }
  
  // Puma
  if (name.includes('puma')) {
    return 'puma';
  }
  
  // Veja
  if (name.includes('veja')) {
    return 'veja';
  }
  
  // Default fallback - no logo
  return '';
}

/**
 * Process image: remove background, align, and add custom background
 */
/**
 * Convert date string (MM/DD) to formatted date parts
 */
function formatDate(dateStr: string): { day: string, month: string } {
  const [month, day] = dateStr.split('/');
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 
                     'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return {
    day: day.padStart(2, '0'),  // Show the day number
    month: monthNames[parseInt(month) - 1]  // Show the month name
  };
}

async function processImageWithCustomBackground(
  inputBuffer: Buffer,
  filename: string,
  archive: archiver.Archiver,
  shouldRemoveBackground: boolean,
  customBgPath: string,
  productName: string,
  dateStr: string
): Promise<void> {
  let processedBuffer = inputBuffer;
  
  // Step 1: Remove background if requested (without shadow for now)
  if (shouldRemoveBackground) {
    try {
      console.log(`Removing background for: ${filename}`);
      processedBuffer = await removeBackgroundServerSide(inputBuffer);
      console.log(`Background removed for: ${filename}`);
    } catch (error) {
      console.warn(`Background removal failed for ${filename}, continuing with original:`, error);
      processedBuffer = inputBuffer;
    }
  }
  
  // Step 2: Convert to JPEG for alignment
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
  
  // Step 4: Create 2000x2000 canvas with white background for alignment
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
      const alpha = channels === 4 ? data[idx + 3] : 255;
      if (!isBackgroundPixel(r, g, b, alpha)) {
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

  // Step 6: Crop and resize (maintaining transparency)
  image = sharp(composedBuffer).extract({
    left: minX,
    top: minY,
    width: cropW,
    height: cropH,
  });

  const targetProductWidth = 650;  // Reduced from 700px to 600px for smaller sneaker size
  let scaleFactor = targetProductWidth / cropW;
  let resizedWidth = targetProductWidth;
  let resizedHeight = Math.round(cropH * scaleFactor);
  
  if (resizedHeight > 800) {
    scaleFactor = 800 / cropH;
    resizedWidth = Math.round(cropW * scaleFactor);
    resizedHeight = 800;
  }
  
  let resizedBuffer = await image
    .resize(resizedWidth, resizedHeight)
    .png()  // Keep as PNG to maintain transparency
    .toBuffer();

  const resizedProductCenterX = productCenterX * scaleFactor;
  const resizedProductBottomOffset = Math.round(productBottomOffset * scaleFactor);

  // Step 6.5: Remove white background again if background removal was enabled
  if (shouldRemoveBackground) {
    try {
      console.log(`Removing white background after alignment for: ${filename}`);
      resizedBuffer = await removeBackgroundServerSide(resizedBuffer);
      console.log(`White background removed, product is now transparent for: ${filename}`);
      
      // Add shadow with transparent background
      resizedBuffer = await addArtificialShadow(resizedBuffer);
      console.log(`Artificial shadow added with transparency for: ${filename}`);
      
      // Ensure the buffer is PNG to preserve transparency
      resizedBuffer = await sharp(resizedBuffer)
        .ensureAlpha()  // Make sure we have alpha channel
        .png()  // Convert to PNG to preserve transparency
        .toBuffer();
      console.log(`Converted to PNG to preserve transparency for: ${filename}`);
    } catch (error) {
      console.warn(`Failed to remove white background after alignment for ${filename}:`, error);
      // Continue with the resized buffer (with white background)
    }
  }

  const canvasWidth = 800;
  const canvasHeight = 800;
  const leftX = Math.floor(canvasWidth / 2 - resizedProductCenterX);
  const topY = canvasHeight - 207 - resizedProductBottomOffset;  // Moved down 10px (changed from 212 to 202)

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

  // Step 8: Load brand logo (original size)
  let brandLogoBuffer: Buffer | null = null;
  try {
    const brandName = detectBrand(productName);
    
    if (brandName) {
      const brandLogoPath = path.join(process.cwd(), 'public', 'brands', `${brandName}.png`);
      
      if (fs.existsSync(brandLogoPath)) {
        console.log(`Loading brand logo: ${brandName}.png for product: ${productName}`);
        brandLogoBuffer = fs.readFileSync(brandLogoPath);
      } else {
        console.warn(`Brand logo not found: ${brandLogoPath}`);
      }
    }
  } catch (error) {
    console.warn(`Failed to load brand logo:`, error);
  }

  // Step 9: Create date text using HTML/CSS
  const { day, month } = formatDate(dateStr);
  
  // Create HTML with embedded font and text
  const html = `
    <html>
      <head>
        <style>
          @font-face {
            font-family: 'GothamPro-Bold';
            src: url('file://${path.join(process.cwd(), 'public', 'fonts', 'GothamPro-Bold.ttf')}') format('truetype');
          }
          body {
            width: ${canvasWidth}px;
            height: ${canvasHeight}px;
            margin: 0;
            background: transparent;
          }
          .date-container {
            position: absolute;
            right: 45px;
            top: 22px;
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 120px; /* Fixed width for centering */
          }
          .day {
            font-family: 'GothamPro-Bold';
            font-size: 83.16px;
            color: white;
            line-height: 0.85; /* Tighter line height */
            margin: 0;
            text-align: center;
            width: 100%;
            margin-bottom: 9px; /* Pull up the month text */
          }
          .month {
            font-family: 'GothamPro-Bold';
            font-size: 42.99px;
            color: white;
            line-height: 1;
            margin: 0;
            text-align: center;
            width: 100%;
            transform: translateY(-5px); /* Fine-tune vertical position */
          }
        </style>
      </head>
      <body>
        <div class="date-container">
          <div class="day">${day}</div>
          <div class="month">${month}</div>
        </div>
      </body>
    </html>
  `;

  // Launch browser and render HTML
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Set viewport to match canvas size
  await page.setViewport({ width: canvasWidth, height: canvasHeight });
  
  // Set content and wait for font to load
  await page.setContent(html);
  await page.evaluateHandle('document.fonts.ready');
  
  // Capture screenshot with transparency
  const textBuffer = await page.screenshot({
    type: 'png',
    omitBackground: true
  });
  
  await browser.close();

  // Step 10: Composite product, logo, and date onto custom background
  const compositeInputs: any[] = [
    { 
      input: resizedBuffer, 
      left: leftX, 
      top: topY,
      blend: 'over'  // Proper alpha blending for transparent PNG
    }
  ];
  
  // Add brand logo at top-left (0, 0)
  if (brandLogoBuffer) {
    compositeInputs.push({
      input: brandLogoBuffer,
      left: 0,
      top: 0,
      blend: 'over'
    });
  }

  // Add date text overlay
  compositeInputs.push({
    input: textBuffer,
    top: 0,
    left: 0,
    blend: 'over'
  });
  
  const finalImageBuffer = await sharp(customBgBuffer)
    .composite(compositeInputs)
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toBuffer();

  // Step 10: Append to archive in the coming-soon-image folder
  archive.append(finalImageBuffer, { name: `coming-soon-image/${filename}` });
}

/**
 * Download image from URL and process it with retry logic
 */
async function downloadAndProcessImage(
  imageUrl: string,
  sku: string,
  productName: string,
  dateStr: string,
  archive: archiver.Archiver,
  shouldRemoveBackground: boolean,
  customBgPath: string
): Promise<void> {
  const maxRetries = 2;
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Downloading image for SKU ${sku} (attempt ${attempt}/${maxRetries}) from ${imageUrl}`);
      
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
        customBgPath,
        productName,
        dateStr
      );
      
      console.log(`Successfully processed image for SKU ${sku}`);
      
      // Force garbage collection after each image in production
      if (IS_PRODUCTION && global.gc) {
        global.gc();
        console.log(`Garbage collection forced after processing ${sku}`);
      }
      
      // Success - exit the retry loop
      return;
      
    } catch (error: any) {
      lastError = error;
      console.warn(`Attempt ${attempt}/${maxRetries} failed for SKU ${sku}: ${error.message}`);
      
      // If this was not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const waitTime = 2000 * attempt; // 2s, 4s
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  // All retries failed
  throw new Error(`Failed to download/process image for SKU ${sku} after ${maxRetries} attempts: ${lastError.message}`);
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
    if (!firstRow.name) {
      return res.status(400).json({ 
        error: "CSV must have a 'name' column for brand detection" 
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
      const productName = (row.name || "").trim();
      const date = (row.date || "").trim();
      
      if (!sku || !imageUrl || !productName || !date) {
        console.warn(`Skipping row with missing SKU, image_url, name, or date`);
        continue;
      }

      try {
        await downloadAndProcessImage(imageUrl, sku, productName, date, archive, shouldRemoveBackground, customBgPath);
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

    // Generate updated CSV with new image paths and split names
    const updatedRows = rows.map(row => {
      const sku = (row.sku || row.product_sku || "").trim();
      const name = (row.name || "").trim();
      
      // Split name into title and subtitle
      let title = name;
      let subtitle = "";
      
      // Look for text in quotes at the end of the name
      // Handle both straight quotes (") and curly quotes ("")
      const match = name.match(/(.*?)\s*[\u201C\u201D"]([^\u201C\u201D"]+)[\u201C\u201D"]$/);
      if (match) {
        title = match[1].trim();  // Everything before the quoted part
        subtitle = `"${match[2]}"`;  // Standardize to straight quotes
      }
      
      console.log(`Name: "${name}" -> Title: "${title}" | Subtitle: "${subtitle}"`);
      
      return {
        sku: sku,
        title: title,
        subtitle: subtitle,
        date: row.date,
        image_url: `coming-soon-image/${sku}.jpg`  // New image path
      };
    });
    
    // Convert back to CSV
    const csvContent = Papa.unparse(updatedRows, {
      header: true,
      columns: ['sku', 'title', 'subtitle', 'date', 'image_url']
    });
    
    // Add CSV to archive
    archive.append(csvContent, { name: "updated_data.csv" });

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

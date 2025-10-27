// pages/api/process-csv-images.ts
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import archiver from "archiver";
import sharp from "sharp";
import fetch from "node-fetch";
import Papa from "papaparse";
import fs from "fs";
import path from "path";

// Disable Next.js default body parsing so formidable can handle file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Convert any image format to JPEG with white background
 */
async function convertToJpeg(inputBuffer: Buffer): Promise<Buffer> {
  try {
    const metadata = await sharp(inputBuffer).metadata();
    
    // If it's already JPEG without transparency, return as is
    if (metadata.format === 'jpeg' && !metadata.hasAlpha) {
      return inputBuffer;
    }
    
    // For images with alpha channels (PNG, WebP, etc.), add white background
    if (metadata.hasAlpha || metadata.format === 'png' || metadata.format === 'webp') {
      console.log(`Converting ${metadata.format} to JPEG with white background`);
      return await sharp(inputBuffer)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
        .toBuffer();
    }
    
    // For other formats, convert directly to JPEG
    return await sharp(inputBuffer)
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toBuffer();
  } catch (error: any) {
    throw new Error(`Failed to convert image to JPEG: ${error.message}`);
  }
}

/**
 * Download image from URL and convert to JPEG
 */
async function downloadAndConvertImage(imageUrl: string, sku: string): Promise<{ buffer: Buffer; filename: string }> {
  try {
    console.log(`Downloading image for SKU ${sku} from ${imageUrl}`);
    
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);
    
    // Convert to JPEG
    const jpegBuffer = await convertToJpeg(imageBuffer);
    
    // Create filename from SKU
    const filename = `${sku}.jpg`;
    
    console.log(`Successfully processed image for SKU ${sku}`);
    
    return { buffer: jpegBuffer, filename };
  } catch (error: any) {
    throw new Error(`Failed to download/convert image for SKU ${sku}: ${error.message}`);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Parse the uploaded CSV file
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

    // Set up the ZIP file response
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="images-${Date.now()}.zip"`,
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
        const { buffer, filename } = await downloadAndConvertImage(imageUrl, sku);
        archive.append(buffer, { name: filename });
        processedCount++;
        
        // Log progress
        if (processedCount % 10 === 0) {
          console.log(`Progress: ${processedCount}/${rows.length} images processed`);
        }
      } catch (error: any) {
        errorCount++;
        const errorMsg = `SKU ${sku}: ${error.message}`;
        errors.push(errorMsg);
        console.error(errorMsg);
        
        // Continue processing other images even if one fails
        continue;
      }
    }

    // If we have errors, add a text file with error details
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
    
    // Check if headers were already sent
    if (res.headersSent) {
      // Can't send JSON response, just end
      res.end();
    } else {
      res.status(500).json({ 
        error: "Server error during processing",
        details: error.message 
      });
    }
  }
}

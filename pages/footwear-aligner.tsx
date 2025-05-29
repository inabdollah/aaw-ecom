// pages/footwear-aligner.tsx
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable prefer-const */
// @ts-nocheck
import React, { useState } from "react";
import axios from "axios";
import { useDropzone } from "react-dropzone";

// A reusable FilePicker component that provides a drag & drop area
const FilePicker = ({
  accept,
  multiple,
  onFilesSelected,
  selectedFiles,
  placeholder,
}: {
  accept: { [key: string]: string[] };
  multiple: boolean;
  onFilesSelected: (files: File[]) => void;
  selectedFiles: File[] | File | null;
  placeholder: string;
}) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    multiple,
    onDrop: (acceptedFiles) => {
      onFilesSelected(acceptedFiles);
    },
  });

  // Calculate the number of selected files
  const fileCount = selectedFiles 
    ? Array.isArray(selectedFiles) 
      ? selectedFiles.length 
      : 1
    : 0;

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed p-4 text-center rounded cursor-pointer transition-colors ${
        isDragActive ? "border-blue-500" : "border-gray-300"
      }`}
    >
      <input {...getInputProps()} />
      {isDragActive ? (
        <p className="text-blue-500">Drop the files here ...</p>
      ) : (
        <p className="text-gray-600">{placeholder}</p>
      )}
      {/* Display file count if files are selected */}
      {fileCount > 0 && (
        <div className="mt-2">
          <p className="text-sm text-gray-700">
            {fileCount} file{fileCount !== 1 ? 's' : ''} selected
          </p>
        </div>
      )}
    </div>
  );
};

// Function to convert AVIF to JPEG on the client side using browser's built-in capabilities
async function convertAvifToJpeg(file: File): Promise<File> {
  try {
    // Create a URL for the file
    const url = URL.createObjectURL(file);
    
    // Load the image using the browser's built-in AVIF support
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Failed to load AVIF image'));
      img.src = url;
    });
    
    // Create a canvas to convert the image to JPEG
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    // Fill with white background (important for JPEG conversion)
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw the image on the canvas
    ctx.drawImage(img, 0, 0);
    
    // Clean up the object URL
    URL.revokeObjectURL(url);
    
    // Convert canvas to blob
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to convert to JPEG'));
            return;
          }
          
          // Create a new File object with the JPEG data
          const jpegFile = new File(
            [blob],
            file.name.replace(/\.avif$/i, '.jpg'),
            { type: 'image/jpeg' }
          );
          
          resolve(jpegFile);
        },
        'image/jpeg',
        0.95 // Quality
      );
    });
  } catch (error) {
    console.error('Failed to convert AVIF to JPEG:', error);
    throw error;
  }
}

// Function to add white background to PNG files with transparency
async function addWhiteBackgroundToPng(file: File): Promise<File> {
  try {
    // Create a URL for the file
    const url = URL.createObjectURL(file);
    
    // Load the image
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Failed to load PNG image'));
      img.src = url;
    });
    
    // Create a canvas
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    // Fill with white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw the image on top of the white background
    ctx.drawImage(img, 0, 0);
    
    // Clean up the object URL
    URL.revokeObjectURL(url);
    
    // Convert canvas to blob (keep as PNG to maintain quality)
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to process PNG image'));
            return;
          }
          
          // Create a new File object with the processed PNG data
          const processedFile = new File(
            [blob],
            file.name,
            { type: 'image/png' }
          );
          
          resolve(processedFile);
        },
        'image/png',
        1 // Maximum quality for PNG
      );
    });
  } catch (error) {
    console.error('Failed to add white background to PNG:', error);
    throw error;
  }
}

// Function to check if a PNG has transparency
async function pngHasTransparency(file: File): Promise<boolean> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Check PNG signature
    if (uint8Array[0] !== 0x89 || uint8Array[1] !== 0x50 || uint8Array[2] !== 0x4E || uint8Array[3] !== 0x47) {
      return false; // Not a PNG file
    }
    
    // Look for tRNS chunk (transparency) or IHDR with alpha channel
    let offset = 8; // Skip PNG signature
    while (offset < uint8Array.length - 8) {
      const chunkLength = (uint8Array[offset] << 24) | (uint8Array[offset + 1] << 16) | (uint8Array[offset + 2] << 8) | uint8Array[offset + 3];
      const chunkType = String.fromCharCode(uint8Array[offset + 4], uint8Array[offset + 5], uint8Array[offset + 6], uint8Array[offset + 7]);
      
      if (chunkType === 'IHDR') {
        // Check color type (offset + 8 + 9 = color type byte)
        const colorType = uint8Array[offset + 8 + 9];
        // Color types 4 and 6 have alpha channel
        if (colorType === 4 || colorType === 6) {
          return true;
        }
      } else if (chunkType === 'tRNS') {
        // Transparency chunk found
        return true;
      }
      
      offset += 4 + 4 + chunkLength + 4; // length + type + data + crc
    }
    
    return false;
  } catch (error) {
    console.warn('Could not determine PNG transparency, assuming it has transparency:', error);
    return true; // Assume transparency if we can't determine
  }
}

// Function to remove background using AI
async function removeBackgroundWithAI(file: File): Promise<File> {
  try {
    // Dynamically import the background removal library
    const { removeBackground: aiRemoveBackground } = await import('@imgly/background-removal');
    
    console.log(`Removing background for: ${file.name}`);
    
    // Remove background using AI
    const imageWithoutBackground = await aiRemoveBackground(file);
    
    // Convert the result to a File object
    const processedFile = new File(
      [imageWithoutBackground],
      file.name.replace(/\.(jpg|jpeg|png|webp|avif)$/i, '_no_bg.png'),
      { type: 'image/png' }
    );
    
    console.log(`Successfully removed background for: ${file.name}`);
    return processedFile;
    
  } catch (error) {
    console.warn('AI background removal failed:', error);
    throw error;
  }
}

// Function to add white background to image (for images that had background removed)
async function addWhiteBackground(file: File): Promise<File> {
  try {
    // Create a URL for the file
    const url = URL.createObjectURL(file);
    
    // Load the image
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
    
    // Create a canvas
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    // Fill with white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw the image on top of the white background
    ctx.drawImage(img, 0, 0);
    
    // Clean up the object URL
    URL.revokeObjectURL(url);
    
    // Convert canvas to blob
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to add white background'));
            return;
          }
          
          // Create a new File object
          const processedFile = new File(
            [blob],
            file.name.replace(/_no_bg\.png$/i, '_white_bg.png'),
            { type: 'image/png' }
          );
          
          resolve(processedFile);
        },
        'image/png',
        1
      );
    });
  } catch (error) {
    console.warn('Failed to add white background:', error);
    throw error;
  }
}

// Function to check if a WebP has transparency
async function webpHasTransparency(file: File): Promise<boolean> {
  try {
    // For WebP, we'll use a simpler approach by checking if the canvas reveals transparency
    const url = URL.createObjectURL(file);
    
    const img = new Image();
    
    // Add a timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('WebP loading timeout')), 5000);
    });
    
    const loadPromise = new Promise((resolve, reject) => {
      img.onload = () => {
        try {
          // Create a small canvas to check for transparency
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(img.naturalWidth, 100);
          canvas.height = Math.min(img.naturalHeight, 100);
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(true); // Assume transparency if we can't check
            return;
          }
          
          // Draw image scaled down
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          // Get image data and check for any transparent pixels
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          
          // Check for any pixels with alpha < 255
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] < 255) {
              resolve(true); // Found transparency
              return;
            }
          }
          
          resolve(false); // No transparency found
        } catch (canvasError) {
          console.warn('Canvas error while checking WebP transparency:', canvasError);
          resolve(true); // Assume transparency if canvas fails
        }
      };
      img.onerror = (error) => {
        console.warn('WebP image load error:', error);
        reject(new Error('Failed to load WebP image - the file may be corrupted or in an unsupported WebP format'));
      };
      img.src = url;
    });
    
    try {
      const result = await Promise.race([loadPromise, timeoutPromise]);
      URL.revokeObjectURL(url);
      return result as boolean;
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    
  } catch (error) {
    console.warn('Could not determine WebP transparency, assuming it has transparency:', error);
    return true; // Assume transparency if we can't determine
  }
}

// Function to add white background to WebP files with transparency
async function addWhiteBackgroundToWebp(file: File): Promise<File> {
  try {
    // Create a URL for the file
    const url = URL.createObjectURL(file);
    
    // Load the image
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Failed to load WebP image'));
      img.src = url;
    });
    
    // Create a canvas
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    // Fill with white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw the image on top of the white background
    ctx.drawImage(img, 0, 0);
    
    // Clean up the object URL
    URL.revokeObjectURL(url);
    
    // Convert canvas to blob (convert to JPEG to ensure no transparency issues)
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to process WebP image'));
            return;
          }
          
          // Create a new File object with JPEG format to avoid any transparency issues
          const processedFile = new File(
            [blob],
            file.name.replace(/\.webp$/i, '.jpg'),
            { type: 'image/jpeg' }
          );
          
          resolve(processedFile);
        },
        'image/jpeg',
        0.95 // High quality
      );
    });
  } catch (error) {
    console.error('Failed to add white background to WebP:', error);
    throw error;
  }
}

// Function to process files and convert AVIF files to JPEG
async function processFiles(files: File[], shouldRemoveBackground: boolean): Promise<File[]> {
  const processedFiles: File[] = [];
  
  for (const file of files) {
    // Step 1: Apply AI background removal to all image files (if enabled)
    let currentFile = file;
    if (file.type.startsWith('image/') && shouldRemoveBackground) {
      try {
        console.log(`Removing background for: ${file.name}`);
        const fileWithoutBg = await removeBackgroundWithAI(file);
        // Add white background to the image after background removal
        currentFile = await addWhiteBackground(fileWithoutBg);
        console.log(`Successfully processed background for: ${file.name}`);
      } catch (error) {
        console.warn(`Background removal failed for ${file.name}:`, error);
        currentFile = file; // Keep original if background removal fails
      }
    }
    
    // Step 2: Handle specific format conversions
    if (currentFile.type === 'image/avif' || currentFile.name.toLowerCase().endsWith('.avif')) {
      try {
        console.log(`Converting AVIF file: ${currentFile.name}`);
        const jpegFile = await convertAvifToJpeg(currentFile);
        processedFiles.push(jpegFile);
        console.log(`Successfully converted ${currentFile.name} to JPEG`);
      } catch (error) {
        console.warn(`Browser AVIF conversion failed for ${currentFile.name}, will process on server:`, error);
        // Still add the processed file (or original if processing failed)
        processedFiles.push(currentFile);
      }
    } else if (currentFile.type === 'image/png' || currentFile.name.toLowerCase().endsWith('.png')) {
      try {
        console.log(`Checking PNG transparency for: ${currentFile.name}`);
        const hasTransparency = await pngHasTransparency(currentFile);
        
        if (hasTransparency && !shouldRemoveBackground) { // Only add white bg if we didn't already process with AI
          console.log(`Adding white background to transparent PNG: ${currentFile.name}`);
          const processedPng = await addWhiteBackgroundToPng(currentFile);
          processedFiles.push(processedPng);
          console.log(`Successfully added white background to ${currentFile.name}`);
        } else {
          console.log(`PNG processed, using current version: ${currentFile.name}`);
          processedFiles.push(currentFile);
        }
      } catch (error) {
        console.warn(`PNG processing failed for ${currentFile.name}, keeping current version:`, error);
        processedFiles.push(currentFile);
      }
    } else if (currentFile.type === 'image/webp' || currentFile.name.toLowerCase().endsWith('.webp')) {
      try {
        console.log(`Checking WebP transparency for: ${currentFile.name}`);
        const hasTransparency = await webpHasTransparency(currentFile);
        
        if (hasTransparency && !shouldRemoveBackground) { // Only add white bg if we didn't already process with AI
          console.log(`Adding white background to transparent WebP: ${currentFile.name}`);
          const processedWebp = await addWhiteBackgroundToWebp(currentFile);
          processedFiles.push(processedWebp);
          console.log(`Successfully added white background to ${currentFile.name}`);
        } else {
          console.log(`WebP processed, using current version: ${currentFile.name}`);
          processedFiles.push(currentFile);
        }
      } catch (error) {
        console.warn(`WebP processing failed for ${currentFile.name}, keeping current version:`, error);
        processedFiles.push(currentFile);
      }
    } else {
      // For other image types, just use the processed version
      processedFiles.push(currentFile);
    }
  }
  
  return processedFiles;
}

function FootwearAligner() {
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [convertingAvif, setConvertingAvif] = useState(false);
  const [removeBackground, setRemoveBackground] = useState(false);

  // Progress states for upload/download
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0);
  // "idle" | "uploading" | "processing" | "downloading"
  const [stage, setStage] = useState<"idle" | "uploading" | "processing" | "downloading">("idle");
  
  // Preview states
  const [previewImages, setPreviewImages] = useState<Array<{filename: string; data: string}>>([]);
  const [showPreview, setShowPreview] = useState(false);

  // Handle file selection with AVIF conversion and PNG transparency processing
  const handleFilesSelected = async (files: File[]) => {
    // Check if any files need processing
    const hasImages = files.some(file => file.type.startsWith('image/'));
    const hasAvif = files.some(file => 
      file.type === 'image/avif' || file.name.toLowerCase().endsWith('.avif')
    );
    const hasPng = files.some(file => 
      file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
    );
    const hasWebp = files.some(file => 
      file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp')
    );
    
    if (hasImages) {
      setConvertingAvif(true);
      
      // Build processing message based on what will be done
      let processingMessage = "Processing images";
      const processes = [];
      
      if (removeBackground) {
        processes.push("removing background");
      }
      if (hasAvif) {
        processes.push("converting AVIF");
      }
      if (hasPng || hasWebp) {
        processes.push("processing transparency");
      }
      
      if (processes.length > 0) {
        processingMessage += ` (${processes.join(", ")})...`;
      } else {
        processingMessage += "...";
      }
      
      setMessage(processingMessage);
      
      try {
        const processedFiles = await processFiles(files, removeBackground);
        setSelectedImages(processedFiles);
        
        // Count processed files
        const originalImageCount = files.filter(f => f.type.startsWith('image/')).length;
        const originalAvifCount = files.filter(f => 
          f.type === 'image/avif' || f.name.toLowerCase().endsWith('.avif')
        ).length;
        const originalPngCount = files.filter(f => 
          f.type === 'image/png' || f.name.toLowerCase().endsWith('.png')
        ).length;
        const originalWebpCount = files.filter(f => 
          f.type === 'image/webp' || f.name.toLowerCase().endsWith('.webp')
        ).length;
        
        const remainingAvifCount = processedFiles.filter(f => 
          f.type === 'image/avif' || f.name.toLowerCase().endsWith('.avif')
        ).length;
        
        const convertedAvifCount = originalAvifCount - remainingAvifCount;
        
        let statusMessage = "";
        
        if (removeBackground && originalImageCount > 0) {
          statusMessage += `Processed background for ${originalImageCount} image(s). `;
        }
        
        if (originalAvifCount > 0 && convertedAvifCount > 0) {
          statusMessage += `Converted ${convertedAvifCount}/${originalAvifCount} AVIF file(s) to JPEG. `;
        } else if (originalAvifCount > 0 && convertedAvifCount === 0) {
          statusMessage += "AVIF files will be processed on server. ";
        }
        
        if (originalPngCount > 0 && !removeBackground) {
          statusMessage += `Processed ${originalPngCount} PNG file(s) for transparency. `;
        }
        
        if (originalWebpCount > 0 && !removeBackground) {
          statusMessage += `Processed ${originalWebpCount} WebP file(s) for transparency.`;
        }
        
        if (statusMessage) {
          setMessage(statusMessage.trim());
        } else {
          setMessage("Files processed successfully.");
        }
        
        // Clear message after 5 seconds
        setTimeout(() => setMessage(""), 5000);
      } catch (error) {
        let errorMsg = "Error processing files: ";
        if (error instanceof Error) {
          errorMsg += error.message;
        } else {
          errorMsg += "Unknown error occurred";
        }
        setMessage(errorMsg);
        setSelectedImages(files);
        setTimeout(() => setMessage(""), 5000);
      } finally {
        setConvertingAvif(false);
      }
    } else {
      setSelectedImages(files);
    }
  };

  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedImages.length === 0 && !selectedSheet) {
      setMessage("Please upload images or a sheet before processing.");
      return;
    }

    setLoading(true);
    setMessage("");
    setStage("uploading");
    setUploadProgress(0);

    // Build your FormData
    const formData = new FormData();
    formData.append("preview", "true"); // Add preview flag
    if (selectedImages.length > 0) {
      selectedImages.forEach((file) => {
        formData.append("images", file);
      });
    }
    if (selectedSheet) {
      formData.append("sheet", selectedSheet);
    }

    try {
      const res = await axios.post("/api/process-sneakers-aligner", formData, {
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentComplete = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentComplete);
            if (percentComplete === 100) {
              setStage("processing");
            }
          }
        },
      });

      // Add validation for the response
      if (res.data && res.data.images && Array.isArray(res.data.images)) {
        setPreviewImages(res.data.images);
        setShowPreview(true);
        setMessage(`${res.data.images.length} images processed successfully!`);
      } else {
        setMessage("Invalid response format from server");
        console.error("Invalid response:", res.data);
      }
    } catch (err: any) {
      // Improved error handling
      let errorMessage = "Processing failed: ";
      
      if (err.response?.data?.error) {
        errorMessage += err.response.data.error;
        
        // Check if there's specific file information in the error
        if (err.response.data.failedFile) {
          errorMessage += ` (File: ${err.response.data.failedFile})`;
        }
        if (err.response.data.details) {
          errorMessage += ` - ${err.response.data.details}`;
        }
      } else if (err.message) {
        errorMessage += err.message;
      } else {
        errorMessage += "Unknown error occurred";
      }
      
      setMessage(errorMessage);
      console.error("Preview error:", err);
    } finally {
      setLoading(false);
      setStage("idle");
      setUploadProgress(0);
    }
  };

  const handleDownload = async () => {
    setLoading(true);
    setMessage("");
    setStage("uploading");
    setUploadProgress(0);
    setDownloadProgress(0);

    // Build your FormData
    const formData = new FormData();
    if (selectedImages.length > 0) {
      selectedImages.forEach((file) => {
        formData.append("images", file);
      });
    }
    if (selectedSheet) {
      formData.append("sheet", selectedSheet);
    }

    try {
      const res = await axios.post("/api/process-sneakers-aligner", formData, {
        responseType: "blob",
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentComplete = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentComplete);
            if (percentComplete === 100) {
              setStage("processing");
            }
          }
        },
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentComplete = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setDownloadProgress(percentComplete);
            setStage("downloading");
          }
        },
      });

      // Extract filename from response headers if available
      const disposition = res.headers["content-disposition"];
      let filename = "download.zip";
      if (disposition && disposition.indexOf("filename=") !== -1) {
        filename = disposition.split("filename=")[1].replace(/['"]/g, "");
      }

      // Trigger download of the resulting file
      const blob = new Blob([res.data], { type: "application/zip" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage("Download started!");
    } catch (err: any) {
      // Improved error handling for download
      let errorMessage = "Download failed: ";
      
      if (err.response?.data) {
        // If the response is a blob, we need to read it as text
        if (err.response.data instanceof Blob) {
          const text = await err.response.data.text();
          try {
            const errorData = JSON.parse(text);
            errorMessage += errorData.error || text;
            if (errorData.failedFile) {
              errorMessage += ` (File: ${errorData.failedFile})`;
            }
          } catch {
            errorMessage += text;
          }
        } else if (err.response.data.error) {
          errorMessage += err.response.data.error;
        }
      } else if (err.message) {
        errorMessage += err.message;
      } else {
        errorMessage += "Unknown error occurred";
      }
      
      setMessage(errorMessage);
      console.error("Download error:", err);
    } finally {
      setLoading(false);
      setStage("idle");
      setUploadProgress(0);
      setDownloadProgress(0);
    }
  };

  const closePreview = () => {
    setShowPreview(false);
    setPreviewImages([]);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow p-4">
        <div className="max-w-7xl mx-auto">
          <img src="/logo.png" alt="Logo" className="h-10 w-auto" />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-grow flex items-center justify-center">
        <div className="max-w-lg w-full p-6">
          <div className="bg-white rounded shadow p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-800">Upload Options</h2>
            <form onSubmit={handlePreview} className="space-y-6">
              {/* Background Removal Option */}
              <div>
                <label className="flex items-center space-x-2 font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={removeBackground}
                    onChange={(e) => setRemoveBackground(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span>Enable AI Background Removal (slower)</span>
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  {removeBackground 
                    ? "AI will remove backgrounds from all images. This may take longer to process." 
                    : "Images will be processed with simple transparency handling and format conversion only (faster)."}
                </p>
              </div>

              {/* Images Dropzone */}
              <div>
                <label className="font-semibold text-gray-700 mb-2 block">
                  Upload Individual Images
                </label>
                <FilePicker
                  accept={{ 
                    "image/*": [".jpeg", ".jpg", ".png", ".gif", ".avif", ".webp"],
                    "image/jpeg": [".jpeg", ".jpg"],
                    "image/png": [".png"],
                    "image/gif": [".gif"],
                    "image/avif": [".avif"],
                    "image/webp": [".webp"]
                  }}
                  multiple={true}
                  onFilesSelected={handleFilesSelected}
                  selectedFiles={selectedImages}
                  placeholder="Drag & drop images here (JPEG, PNG, GIF, WebP, AVIF)"
                />
                {selectedImages.length > 0 && (
                  <p className="text-gray-700 mt-2">
                    {selectedImages.length} image(s) selected.
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  {removeBackground 
                    ? "All images will have their backgrounds removed using AI. AVIF files will be converted to JPEG if your browser supports AVIF. PNG and WebP files with transparency will automatically get a white background. Files may be processed on the server if client-side processing fails."
                    : "AVIF files will be converted to JPEG if your browser supports AVIF. PNG and WebP files with transparency will automatically get a white background. Files may be processed on the server if client-side processing fails."}
                </p>
              </div>

              {/* Sheet Dropzone */}
              <div>
                <label className="font-semibold text-gray-700 mb-2 block">
                  Or Upload a CSV/XLS Sheet
                </label>
                <FilePicker
                  accept={{
                    "text/csv": [".csv"],
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
                  }}
                  multiple={false}
                  onFilesSelected={(files) => setSelectedSheet(files[0])}
                  selectedFiles={selectedSheet}
                  placeholder="Drag & drop a CSV/XLSX file here, or click to select file"
                />
                {selectedSheet && (
                  <p className="text-gray-700 mt-2">Selected Sheet: {selectedSheet.name}</p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || convertingAvif}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded shadow disabled:opacity-50"
              >
                {convertingAvif ? "Processing images..." : loading ? "Processing..." : "Preview Images"}
              </button>

              {/* Progress Indicators */}
              {loading && (
                <div>
                  {stage === "uploading" && (
                    <div>
                      <p className="mb-1">Uploading: {uploadProgress}%</p>
                      <div className="w-full bg-gray-200 rounded h-2">
                        <div
                          className="bg-blue-500 h-2 rounded"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {stage === "processing" && (
                    <p className="mt-2 text-center text-gray-700">
                      Processing on server, please wait...
                    </p>
                  )}
                  {stage === "downloading" && (
                    <div className="mt-2">
                      <p className="mb-1">Downloading: {downloadProgress}%</p>
                      <div className="w-full bg-gray-200 rounded h-2">
                        <div
                          className="bg-green-500 h-2 rounded"
                          style={{ width: `${downloadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </form>

            {/* Feedback Message */}
            {message && (
              <div className={`mt-4 p-4 rounded ${message.includes('failed') || message.includes('Failed') ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                {message}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-xl font-bold">Preview Processed Images</h3>
              <button
                onClick={closePreview}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto max-h-[calc(90vh-200px)]">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {previewImages && previewImages.length > 0 ? (
                  previewImages.map((image, index) => (
                    <div key={index} className="flex flex-col">
                      <div className="relative w-full h-48 bg-gray-100 rounded overflow-hidden">
                        <img
                          src={image.data}
                          alt={image.filename}
                          className="absolute inset-0 w-full h-full object-contain"
                        />
                        <img
                          src="/guides.png"
                          alt="Guide overlay"
                          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                          style={{ mixBlendMode: 'multiply', opacity: 0.5 }}
                        />
                      </div>
                      <p className="text-sm text-gray-600 mt-1 truncate" title={image.filename}>
                        {image.filename}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-gray-500">No images to preview</p>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t flex justify-end space-x-4">
              <button
                onClick={closePreview}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDownload}
                disabled={loading}
                className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white font-bold rounded shadow disabled:opacity-50"
              >
                {loading ? "Downloading..." : "Download All as ZIP"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FootwearAligner;

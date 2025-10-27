// pages/coming-soon-creator.tsx
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import axios from "axios";
import { useDropzone } from "react-dropzone";

// A reusable FilePicker component that provides a drag & drop area
const FilePicker = ({
  accept,
  onFileSelected,
  selectedFile,
  placeholder,
}: {
  accept: { [key: string]: string[] };
  onFileSelected: (file: File | null) => void;
  selectedFile: File | null;
  placeholder: string;
}) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    multiple: false,
    onDrop: (acceptedFiles) => {
      onFileSelected(acceptedFiles[0] || null);
    },
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed p-6 text-center rounded cursor-pointer transition-colors ${
        isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"
      }`}
    >
      <input {...getInputProps()} />
      {isDragActive ? (
        <p className="text-blue-500 text-lg">Drop the CSV file here ...</p>
      ) : (
        <div>
          <p className="text-gray-600 text-lg">{placeholder}</p>
          {selectedFile && (
            <div className="mt-3">
              <p className="text-sm text-green-600 font-semibold">
                ✓ {selectedFile.name}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function ComingSoonCreator() {
  const [selectedCsv, setSelectedCsv] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [removeBackground, setRemoveBackground] = useState(true); // Default to true
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [stage, setStage] = useState<"idle" | "uploading" | "processing" | "downloading">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedCsv) {
      setMessage("Please upload a CSV file before processing.");
      return;
    }

    setLoading(true);
    setMessage("");
    setStage("uploading");
    setUploadProgress(0);
    setDownloadProgress(0);

    const formData = new FormData();
    formData.append("csv", selectedCsv);
    formData.append("removeBackground", removeBackground.toString());

    try {
      const res = await axios.post("/api/process-coming-soon", formData, {
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
      let filename = "processed-images.zip";
      if (disposition && disposition.indexOf("filename=") !== -1) {
        filename = disposition.split("filename=")[1].replace(/['"]/g, "");
      }

      // Trigger download
      const blob = new Blob([res.data], { type: "application/zip" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      setMessage("Download completed successfully!");
      setStage("idle");
    } catch (err: any) {
      let errorMessage = "Processing failed: ";
      
      if (err.response?.data) {
        // If the response is a blob, we need to read it as text
        if (err.response.data instanceof Blob) {
          const text = await err.response.data.text();
          try {
            const errorData = JSON.parse(text);
            errorMessage += errorData.error || text;
            if (errorData.details) {
              errorMessage += ` - ${errorData.details}`;
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
      console.error("Processing error:", err);
      setStage("idle");
    } finally {
      setLoading(false);
      setUploadProgress(0);
      setDownloadProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-md p-4">
        <div className="max-w-7xl mx-auto">
          <img src="/logo.png" alt="Logo" className="h-10 w-auto" />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-grow flex items-center justify-center p-6">
        <div className="max-w-2xl w-full">
          <div className="bg-white rounded-lg shadow-xl p-8">
            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold text-gray-800 mb-2">CSV Image Aligner & Processor</h1>
              <p className="text-gray-600">
                Upload a CSV with image URLs and SKUs. Images will be downloaded, background removed, aligned, and packaged with custom background.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Background Removal Option */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={removeBackground}
                    onChange={(e) => setRemoveBackground(e.target.checked)}
                    className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <div>
                    <span className="font-semibold text-gray-800 block">AI Background Removal & Alignment</span>
                    <span className="text-sm text-gray-600">Remove background, align product, and add custom background</span>
                  </div>
                </label>
              </div>

              {/* CSV Upload */}
              <div>
                <label className="block font-semibold text-gray-700 mb-3">
                  Upload CSV File
                </label>
                <FilePicker
                  accept={{
                    "text/csv": [".csv"],
                    "application/vnd.ms-excel": [".csv"],
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
                  }}
                  onFileSelected={setSelectedCsv}
                  selectedFile={selectedCsv}
                  placeholder="Drag & drop a CSV file here, or click to select"
                />
                
                {/* CSV Format Info */}
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800 font-semibold mb-2">CSV Format Requirements:</p>
                  <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                    <li>Must have a header row</li>
                    <li>Required columns: <code className="bg-blue-100 px-1 rounded">sku</code>, <code className="bg-blue-100 px-1 rounded">name</code>, and <code className="bg-blue-100 px-1 rounded">image_url</code></li>
                    <li>The <code className="bg-blue-100 px-1 rounded">name</code> column is used to detect brand and add the appropriate logo</li>
                    <li>Each image will be downloaded, processed, aligned, and renamed to <code className="bg-blue-100 px-1 rounded">[sku].jpg</code></li>
                  </ul>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !selectedCsv}
                className="w-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 hover:from-purple-600 hover:via-pink-600 hover:to-orange-600 text-white font-bold py-4 px-6 rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-95"
              >
                {loading ? "Processing..." : "Process & Download Images"}
              </button>

              {/* Progress Indicators */}
              {loading && (
                <div className="space-y-3">
                  {stage === "uploading" && (
                    <div>
                      <div className="flex justify-between mb-1">
                        <p className="text-sm font-medium text-gray-700">Uploading CSV</p>
                        <p className="text-sm font-medium text-gray-700">{uploadProgress}%</p>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="bg-purple-500 h-3 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  {stage === "processing" && (
                    <div className="text-center py-4">
                      <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-3"></div>
                      <p className="text-gray-700 font-medium">
                        Processing images: downloading, removing backgrounds, aligning...
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        This may take several minutes depending on the number of images
                      </p>
                    </div>
                  )}
                  
                  {stage === "downloading" && (
                    <div>
                      <div className="flex justify-between mb-1">
                        <p className="text-sm font-medium text-gray-700">Downloading ZIP</p>
                        <p className="text-sm font-medium text-gray-700">{downloadProgress}%</p>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="bg-green-500 h-3 rounded-full transition-all duration-300"
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
              <div className={`mt-6 p-4 rounded-lg ${
                message.includes('failed') || message.includes('Failed') || message.includes('error')
                  ? 'bg-red-100 border border-red-300 text-red-700' 
                  : 'bg-green-100 border border-green-300 text-green-700'
              }`}>
                <p className="font-medium">{message}</p>
              </div>
            )}
          </div>

          {/* Features List */}
          <div className="mt-8 bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">What This Tool Does</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-start space-x-3">
                <svg className="w-6 h-6 text-purple-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <div>
                  <p className="font-medium text-gray-800">Download from URLs</p>
                  <p className="text-sm text-gray-600">Fetches all images from URLs in your CSV</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <svg className="w-6 h-6 text-purple-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <div>
                  <p className="font-medium text-gray-800">AI Background Removal</p>
                  <p className="text-sm text-gray-600">Removes background using advanced AI</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <svg className="w-6 h-6 text-purple-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                <div>
                  <p className="font-medium text-gray-800">Smart Alignment</p>
                  <p className="text-sm text-gray-600">Centers and aligns products perfectly</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <svg className="w-6 h-6 text-purple-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <div>
                  <p className="font-medium text-gray-800">Custom Background</p>
                  <p className="text-sm text-gray-600">Adds your custom background image</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <svg className="w-6 h-6 text-purple-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <p className="font-medium text-gray-800">Auto Rename</p>
                  <p className="text-sm text-gray-600">Renames each image with its SKU</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <svg className="w-6 h-6 text-purple-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <p className="font-medium text-gray-800">ZIP Package</p>
                  <p className="text-sm text-gray-600">All images in one downloadable ZIP</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default ComingSoonCreator;

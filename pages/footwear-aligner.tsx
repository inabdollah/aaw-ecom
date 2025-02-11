// pages/footwear-aligner.tsx
// @ts-nocheck
import React, { useState, useRef } from "react";
import axios from "axios";

function FootwearAligner() {
  const [selectedImages, setSelectedImages] = useState<FileList | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Progress states for upload/download
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0);
  // "idle" | "uploading" | "processing" | "downloading"
  const [stage, setStage] = useState<"idle" | "uploading" | "processing" | "downloading">("idle");

  const imagesInputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);

  const handleImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedImages(e.target.files);
    }
  };

  const handleSheetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedSheet(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // You can decide whether you want to force the user to pick either images or a sheet, or both, etc.
    if (!selectedImages && !selectedSheet) {
      setMessage("Please upload images or a sheet before processing.");
      return;
    }

    setLoading(true);
    setMessage("");
    setStage("uploading");
    setUploadProgress(0);
    setDownloadProgress(0);

    // Build your FormData
    const formData = new FormData();
    if (selectedImages) {
      Array.from(selectedImages).forEach((file) => {
        formData.append("images", file);
      });
    }
    if (selectedSheet) {
      formData.append("sheet", selectedSheet);
    }

    try {
      // POST to our new endpoint that can handle both raw images and a CSV sheet:
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

      const disposition = res.headers["content-disposition"];
      let filename = "download.zip";
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
      setMessage("Download started!");
    } catch (err: any) {
      setMessage(`Upload failed: ${err.message}`);
    } finally {
      setLoading(false);
      setStage("idle");
      setUploadProgress(0);
      setDownloadProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow p-4">
        <div className="max-w-7xl mx-auto">
          <img src="/logo.png" alt="Logo" className="h-10 w-auto" />
        </div>
      </header>

      {/* Main */}
      <main className="flex-grow flex items-center justify-center">
        <div className="max-w-lg w-full p-6">
          <div className="bg-white rounded shadow p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-800">Upload Options</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Upload images */}
              <div>
                <label className="font-semibold text-gray-700 mb-2 block">
                  Upload Individual Images
                </label>
                <input
                  ref={imagesInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleImagesChange}
                  className="block w-full"
                />
                {selectedImages && (
                  <p className="text-gray-700 mt-2">
                    {selectedImages.length} image(s) selected.
                  </p>
                )}
              </div>

              {/* Upload sheet */}
              <div>
                <label className="font-semibold text-gray-700 mb-2 block">
                  Or Upload a CSV/XLS Sheet
                </label>
                <input
                  ref={sheetInputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={handleSheetChange}
                  className="block w-full"
                />
                {selectedSheet && (
                  <p className="text-gray-700 mt-2">Selected Sheet: {selectedSheet.name}</p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded shadow disabled:opacity-50"
              >
                {loading ? "Processing..." : "Process"}
              </button>

              {/* Progress bar */}
              {loading && (
                <div>
                  {stage === "uploading" && (
                    <div>
                      <p className="mb-1">Uploading: {uploadProgress}%</p>
                      <div className="w-full bg-gray-200 rounded h-2">
                        <div
                          className="bg-green-500 h-2 rounded"
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
                          className="bg-blue-500 h-2 rounded"
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
              <div className="mt-4 p-4 rounded bg-gray-100 text-gray-700">{message}</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default FootwearAligner;

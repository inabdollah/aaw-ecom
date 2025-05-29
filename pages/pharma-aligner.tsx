// pages/pharma-aligner.tsx
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
      {/* Display file names if files are selected */}
      {selectedFiles &&
        ((Array.isArray(selectedFiles) && selectedFiles.length > 0) ||
          (!Array.isArray(selectedFiles) && selectedFiles)) && (
          <div className="mt-2">
            {Array.isArray(selectedFiles) ? (
              selectedFiles.map((file, index) => (
                <p key={index} className="text-sm text-gray-700">
                  {file.name}
                </p>
              ))
            ) : (
              <p className="text-sm text-gray-700">{selectedFiles.name}</p>
            )}
          </div>
        )}
    </div>
  );
};

function PharmaAligner() {
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Progress states for upload/download
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0);
  // "idle" | "uploading" | "processing" | "downloading"
  const [stage, setStage] = useState<"idle" | "uploading" | "processing" | "downloading">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedImages.length === 0 && !selectedSheet) {
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
    if (selectedImages.length > 0) {
      selectedImages.forEach((file) => {
        formData.append("images", file);
      });
    }
    if (selectedSheet) {
      formData.append("sheet", selectedSheet);
    }

    try {
      const res = await axios.post("/api/process-pharma-aligner", formData, {
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

      {/* Main content */}
      <main className="flex-grow flex items-center justify-center">
        <div className="max-w-lg w-full p-6">
          <div className="bg-white rounded shadow p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-800">Upload Options</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Images Dropzone */}
              <div>
                <label className="font-semibold text-gray-700 mb-2 block">
                  Upload Individual Images
                </label>
                <FilePicker
                  accept={{ "image/*": [".jpeg", ".jpg", ".png", ".gif"] }}
                  multiple={true}
                  onFilesSelected={(files) => setSelectedImages(files)}
                  selectedFiles={selectedImages}
                  placeholder="Drag & drop images here, or click to select files"
                />
                {selectedImages.length > 0 && (
                  <p className="text-gray-700 mt-2">
                    {selectedImages.length} image(s) selected.
                  </p>
                )}
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
                disabled={loading}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded shadow disabled:opacity-50"
              >
                {loading ? "Processing..." : "Process"}
              </button>

              {/* Progress Indicators */}
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
              <div className="mt-4 p-4 rounded bg-gray-100 text-gray-700">
                {message}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default PharmaAligner;

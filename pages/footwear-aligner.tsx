import React, { useState, useEffect } from "react";
import axios from "axios";

export default function MyPage() {
  const [jobId, setJobId] = useState("");
  const [progress, setProgress] = useState({ total: 0, done: 0, status: "idle", zipPath: "" });
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleStartJob = async (files: FileList | null) => {
    if (!files) return;
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("images", file));

    // First, we upload to /api/start-align-job
    const res = await axios.post("/api/start-align-job", formData, {
      onUploadProgress: (e) => {
        if (e.total) {
          const percent = Math.round((e.loaded * 100) / e.total);
          setUploadProgress(percent);
        }
      },
    });
    setJobId(res.data.jobId);
  };

  useEffect(() => {
    if (!jobId) return;

    // Open SSE connection
    const source = new EventSource(`/api/progress-align-job?jobId=${jobId}`);

    source.onmessage = (event) => {
      // If no event name is specified, it's a "message" by default
      // But we used "event: progress", so let's do onprogress
    };

    source.addEventListener("progress", (event) => {
      const data = JSON.parse(event.data);
      setProgress({
        total: data.total,
        done: data.done,
        status: data.status,
        zipPath: data.zipPath,
      });
    });

    source.addEventListener("error", (event) => {
      console.error("SSE error:", event);
      source.close();
    });

    return () => {
      source.close();
    };
  }, [jobId]);

  return (
    <div>
      <h1>Long Running Job Demo</h1>

      <input
        type="file"
        multiple
        onChange={(e) => {
          if (e.target.files) {
            handleStartJob(e.target.files);
          }
        }}
      />

      {uploadProgress > 0 && uploadProgress < 100 && (
        <p>Upload Progress: {uploadProgress}%</p>
      )}

      {jobId && (
        <div>
          <p>Status: {progress.status}</p>
          <p>
            Processed {progress.done} of {progress.total}
          </p>
          {progress.status === "finished" && progress.zipPath && (
            <a href={progress.zipPath} download>
              Download ZIP
            </a>
          )}
        </div>
      )}
    </div>
  );
}

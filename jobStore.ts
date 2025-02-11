// jobStore.ts
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

interface JobData {
  progress: number; // from 0 (not started) to 100 (done), or -1 if an error occurred
  zipFilePath?: string;
}

export const jobStore: { [jobId: string]: JobData } = {};

import type { GradeDataset } from "./types";
export function parseInWorker(file: File): Promise<GradeDataset> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./import-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ dataset?: GradeDataset; error?: string }>) => {
      worker.terminate();
      if (event.data.dataset) resolve(event.data.dataset);
      else reject(new Error(event.data.error ?? "解析失败"));
    };
    worker.onerror = () => { worker.terminate(); reject(new Error("后台解析未能完成，请重试或缩小工作簿；已有数据保持不变。")); };
    worker.postMessage(file);
  });
}

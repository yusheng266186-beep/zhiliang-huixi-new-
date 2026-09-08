import { parseGradeWorkbook } from "./parser";
self.onmessage = async (event: MessageEvent<File>) => {
  try { self.postMessage({ dataset: await parseGradeWorkbook(event.data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "解析失败" }); }
};

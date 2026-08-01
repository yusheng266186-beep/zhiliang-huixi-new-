import * as XLSX from "xlsx";
import type { QualityReportModel } from "./report-model";

const safe = (value: unknown) => value === null || value === undefined || value === "" ? "—" : value;
const stamp = (value: string) => value.replace(/[:\s/\\]+/g, "-").replace(/-+/g, "-").slice(0, 50);
const filename = (model: QualityReportModel, ext: string) => `质量慧析-${stamp(model.exam)}-${stamp(model.reportType)}-${stamp(model.scope)}.${ext}`;

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export async function exportReportWord(model: QualityReportModel): Promise<void> {
  const { Document, Footer, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = await import("docx");
  const paragraph = (text: string, bold = false) => new Paragraph({ children: [new TextRun({ text, bold })] });
  const table = (headers: string[], rows: string[][]) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
    new TableRow({ children: headers.map((header) => new TableCell({ children: [paragraph(header, true)] })) }),
    ...rows.map((row) => new TableRow({ children: row.map((value) => new TableCell({ children: [paragraph(value)] })) })),
  ] });
  const summary = model.summary;
  const doc = new Document({
    styles: { default: { document: { run: { font: "Microsoft YaHei", size: 21 } } } },
    sections: [{
      footers: { default: new Footer({ children: [paragraph(`质量慧析 · ${model.sourceName}`)] }) },
      children: [
        new Paragraph({ text: model.title, heading: HeadingLevel.TITLE }),
        paragraph(`分析范围：${model.scope}　生成时间：${new Date(model.generatedAt).toLocaleString("zh-CN")}`),
        paragraph(model.focusStatement),
        new Paragraph({ text: "一、结论摘要", heading: HeadingLevel.HEADING_1 }),
        paragraph(`本次纳入${summary.count}人，平均分${summary.average.toFixed(1)}，中位数${summary.median.toFixed(1)}；一本/特控上线${summary.topCount}人（${(summary.topRate * 100).toFixed(1)}%），本科上线${summary.undergraduateCount}人（${(summary.undergraduateRate * 100).toFixed(1)}%）。一本临界${summary.topCriticalCount}人，本科临界${summary.undergraduateCriticalCount}人。`),
        table(["指标", "数值", "口径"], [["参考人数", String(summary.count), "有效总分"], ["平均分", summary.average.toFixed(1), "总分"], ["中位数", summary.median.toFixed(1), "总分"], ["一本上线", `${summary.topCount} / ${(summary.topRate * 100).toFixed(1)}%`, "已识别分数线"], ["本科上线", `${summary.undergraduateCount} / ${(summary.undergraduateRate * 100).toFixed(1)}%`, "已识别分数线"]]),
        new Paragraph({ text: "二、成绩分布与分层", heading: HeadingLevel.HEADING_1 }),
        table(["区间", "人数", "占比"], model.distribution.map((item) => [item.label, String(item.count), `${(item.rate * 100).toFixed(1)}%`])),
        table(["分层", "人数", "占比", "行动意图"], model.segments.map((item) => [item.label, String(item.count), `${(item.rate * 100).toFixed(1)}%`, item.intent])),
        new Paragraph({ text: "三、班级对标", heading: HeadingLevel.HEADING_1 }),
        table(["班级", "班型", "人数", "均分", "同组差", "同组位次", "一本率", "本科率"], model.classes.map((item) => [`${item.classNo}班`, item.type, String(item.count), item.average.toFixed(1), `${item.averageDelta >= 0 ? "+" : ""}${item.averageDelta.toFixed(1)}`, `${item.peerRank}/${item.peerSize}`, `${(item.topRate * 100).toFixed(1)}%`, `${(item.undergraduateRate * 100).toFixed(1)}%`])),
        new Paragraph({ text: "四、学科诊断", heading: HeadingLevel.HEADING_1 }),
        table(["学科", "参考", "均分", "一本有效率", "本科有效率", "优先级"], model.subjects.map((item) => [item.subject, String(item.count), item.average.toFixed(1), `${item.topEffectiveCount} / ${(item.topEffectiveRate * 100).toFixed(1)}%`, `${item.undergraduateEffectiveCount} / ${(item.undergraduateEffectiveRate * 100).toFixed(1)}%`, item.undergraduateEffectiveRate < .55 ? "优先补弱" : item.undergraduateEffectiveRate < .75 ? "巩固提升" : "优势保持"])),
        new Paragraph({ text: "五、临界生清单", heading: HeadingLevel.HEADING_1 }),
        table(["类型", "班级", "姓名", "总分", "一本差", "本科差", "薄弱学科"], model.critical.slice(0, 100).map((item) => [item.criticalTiers.join("、"), `${item.classNo}班`, item.name, item.total.toFixed(1), safe(item.topDiff)?.toString() ?? "—", safe(item.undergraduateDiff)?.toString() ?? "—", item.weakSubjects.slice(0, 3).map((weak) => `${weak.subject} ${weak.diff.toFixed(1)}`).join("、") || "—"])),
        new Paragraph({ text: "六、知识点与小题", heading: HeadingLevel.HEADING_1 }),
        paragraph(`本报告以${model.subject ?? "当前最弱学科"}作为知识点主视图；无可识别小题时保留成绩层结论，并在质检章节说明。`),
        table(["知识点", "小题数", "答题数", "得分率", "优先级"], model.knowledge.slice(0, 60).map((item) => [item.knowledge, String(item.questionCount), String(item.responseCount), `${(item.rate * 100).toFixed(1)}%`, item.priority])),
        new Paragraph({ text: "七、行动建议", heading: HeadingLevel.HEADING_1 }),
        ...model.recommendations.map((recommendation, index) => paragraph(`${index + 1}. ${recommendation}`)),
        new Paragraph({ text: "八、数据质量与方法", heading: HeadingLevel.HEADING_1 }),
        table(["质检项", "结果"], [["综合识别置信度", `${(model.quality.confidence * 100).toFixed(1)}%`], ["学科完整度", `${(model.quality.subjectCompleteness * 100).toFixed(1)}%`], ["分数线完整度", `${(model.quality.thresholdCompleteness * 100).toFixed(1)}%`], ["小题覆盖度", `${(model.quality.itemCoverage * 100).toFixed(1)}%`], ["重建总分", String(model.quality.reconstructedTotals)], ["可用模块", model.quality.availableModules.join("、") || "—"]]),
        ...model.methodology.map((method, index) => paragraph(`${index + 1}. ${method}`)),
      ],
    }],
  });
  downloadBlob(await Packer.toBlob(doc), filename(model, "docx"));
}

export function exportAnalysisExcel(model: QualityReportModel): void {
  const book = XLSX.utils.book_new();
  const add = (name: string, rows: unknown[][]) => XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));
  add("分析摘要", [["质量慧析分析摘要"], ["报告", model.title], ["范围", model.scope], ["数据源", model.sourceName], [], ["指标", "数值"], ["参考人数", model.summary.count], ["平均分", model.summary.average], ["中位数", model.summary.median], ["一本上线", model.summary.topCount], ["一本上线率", model.summary.topRate], ["本科上线", model.summary.undergraduateCount], ["本科上线率", model.summary.undergraduateRate], ["一本临界", model.summary.topCriticalCount], ["本科临界", model.summary.undergraduateCriticalCount], [], ["核心发现", "行动建议"], ...model.insights.map((item) => [item.finding, item.action])]);
  add("学生明细", [["考试", "班级", "姓名", "类别", "总分", "总分来源", "市排名", "校排名", "语文", "数学", "英语", "日语", "物理", "历史", "化学", "生物", "政治", "地理"], ...model.critical.map((student) => [student.exam, student.classNo, student.name, student.track, student.total, student.totalSource ?? "source", student.cityRank ?? "", student.schoolRank ?? "", ...["语文", "数学", "英语", "日语", "物理", "历史", "化学", "生物", "政治", "地理"].map((subject) => student.subjects[subject as keyof typeof student.subjects] ?? "")])]);
  add("班级对标", [["班级", "类别", "班型", "人数", "平均分", "同组", "同组差", "位次", "一本率", "本科率"], ...model.classes.map((item) => [item.classNo, item.track, item.type, item.count, item.average, item.peerGroup, item.averageDelta, `${item.peerRank}/${item.peerSize}`, item.topRate, item.undergraduateRate])]);
  add("学科诊断", [["学科", "参考人数", "平均分", "最高分", "一本有效人数", "一本有效率", "本科有效人数", "本科有效率", "一本有效分", "本科有效分"], ...model.subjects.map((item) => [item.subject, item.count, item.average, item.max, item.topEffectiveCount, item.topEffectiveRate, item.undergraduateEffectiveCount, item.undergraduateEffectiveRate, item.topEffectiveLine ?? "", item.undergraduateEffectiveLine ?? ""])]);
  add("临界生清单", [["类型", "考试", "班级", "姓名", "总分", "一本差", "本科差", "优先学科", "班型"], ...model.critical.map((student) => [student.criticalTiers.join("、"), student.exam, student.classNo, student.name, student.total, student.topDiff ?? "", student.undergraduateDiff ?? "", student.weakSubjects.map((weak) => `${weak.subject} ${weak.diff.toFixed(1)}`).join("、"), student.classType])]);
  add(`${model.subject ?? "知识点"}知识点`, [["知识点", "小题数", "答题数", "得分", "可能得分", "得分率", "优先级"], ...model.knowledge.map((item) => [item.knowledge, item.questionCount, item.responseCount, item.earned, item.possible, item.rate, item.priority])]);
  add("数据质检", [["项目", "结果"], ["综合识别置信度", model.quality.confidence], ["学科完整度", model.quality.subjectCompleteness], ["分数线完整度", model.quality.thresholdCompleteness], ["小题覆盖度", model.quality.itemCoverage], ["重建总分数量", model.quality.reconstructedTotals], ["警告数量", model.quality.warnings], ["错误数量", model.quality.errors], ["可用模块", model.quality.availableModules.join("、")], [], ["方法说明"], ...model.methodology.map((item) => [item])]);
  const bytes = XLSX.write(book, { bookType: "xlsx", type: "array" });
  downloadBlob(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename(model, "xlsx"));
}

export async function exportElementPdf(target: HTMLElement | null, name: string): Promise<void> {
  if (!target) throw new Error("报告预览尚未准备好，请稍后重试。");
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const canvas = await html2canvas(target, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = 210, pageHeight = 297, margin = 10, contentWidth = pageWidth - margin * 2, imageHeight = canvas.height * contentWidth / canvas.width, usableHeight = pageHeight - margin * 2;
  let offset = 0, page = 0;
  while (offset < imageHeight) {
    if (page > 0) pdf.addPage();
    const sourceY = offset * canvas.width / contentWidth;
    const sourceHeight = Math.min(usableHeight * canvas.width / contentWidth, canvas.height - sourceY);
    const slice = document.createElement("canvas"); slice.width = canvas.width; slice.height = Math.ceil(sourceHeight);
    slice.getContext("2d")?.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, slice.width, slice.height);
    pdf.addImage(slice.toDataURL("image/jpeg", .92), "JPEG", margin, margin, contentWidth, slice.height * contentWidth / slice.width);
    offset += usableHeight; page += 1;
  }
  pdf.save(name.endsWith(".pdf") ? name : `${name}.pdf`);
}

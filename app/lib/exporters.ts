import type { WorkBook } from "xlsx";
import type { QualityReportModel } from "./report-model";

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

export async function buildReportWordBlob(model: QualityReportModel, charts: { overview?: string; detail?: string } = {}): Promise<Blob> {
  const { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, PageBreak, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } = await import("docx");
  const colors = { ink: "25252B", muted: "74747E", primary: "625CF6", primarySoft: "EFEEFF", cyan: "20B8AE", cyanSoft: "EAF9F7", amber: "F0A329", amberSoft: "FFF7E8", line: "E6E6EB", surface: "F7F7F9", white: "FFFFFF" };
  const paragraph = (text: string, bold = false, options: { color?: string; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType]; spacingAfter?: number } = {}) => new Paragraph({ alignment: options.align, spacing: { after: options.spacingAfter ?? 80 }, children: [new TextRun({ text, bold, color: options.color ?? colors.ink, size: options.size ?? 20, font: "Microsoft YaHei" })] });
  const cell = (text: string, options: { header?: boolean; fill?: string; align?: typeof AlignmentType[keyof typeof AlignmentType] } = {}) => new TableCell({ shading: { type: ShadingType.CLEAR, fill: options.fill ?? (options.header ? colors.primarySoft : colors.white) }, margins: { top: 100, bottom: 100, left: 120, right: 120 }, borders: { top: { style: BorderStyle.SINGLE, color: colors.line, size: 1 }, bottom: { style: BorderStyle.SINGLE, color: colors.line, size: 1 }, left: { style: BorderStyle.SINGLE, color: colors.line, size: 1 }, right: { style: BorderStyle.SINGLE, color: colors.line, size: 1 } }, children: [paragraph(text, Boolean(options.header), { color: options.header ? colors.primary : colors.ink, size: options.header ? 18 : 17, align: options.align, spacingAfter: 0 })] });
  const table = (headers: string[], rows: string[][]) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
    new TableRow({ tableHeader: true, children: headers.map((header) => cell(header, { header: true })) }),
    ...rows.map((row, index) => new TableRow({ cantSplit: true, children: row.map((value) => cell(value, { fill: index % 2 ? "FAFAFC" : colors.white })) })),
  ] });
  const image = (dataUrl: string | undefined, width: number, height: number) => dataUrl ? new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 180 }, children: [new ImageRun({ data: Uint8Array.from(atob(dataUrl.split(",")[1]!), (char) => char.charCodeAt(0)), transformation: { width, height }, type: "png" })] }) : paragraph("当前数据不足，未生成此图表。", false, { color: colors.muted });
  const chartNote = (text: string) => new Paragraph({ keepNext: true, spacing: { before: 70, after: 70 }, shading: { type: ShadingType.CLEAR, fill: "F5F4FF" }, border: { left: { style: BorderStyle.SINGLE, color: colors.primary, size: 10, space: 6 } }, children: [new TextRun({ text: `图例｜${text}`, bold: true, color: "55506F", size: 17, font: "Microsoft YaHei" })] });
  const sectionTitle = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: 260, after: 120 }, border: { left: { style: BorderStyle.SINGLE, color: colors.primary, size: 16, space: 8 } }, children: [new TextRun({ text, bold: true, color: colors.ink, size: 28, font: "Microsoft YaHei" })] });
  const kpiTable = table(["参考人数", "平均分 / 中位数", "特控/一本上线", "本科上线"], [[String(model.summary.count), `${model.summary.average.toFixed(1)} / ${model.summary.median.toFixed(1)}`, `${model.summary.topCount}人 / ${(model.summary.topRate * 100).toFixed(1)}%`, `${model.summary.undergraduateCount}人 / ${(model.summary.undergraduateRate * 100).toFixed(1)}%`]]);
  const summary = model.summary;
  const doc = new Document({
    creator: "质量慧析",
    title: model.title,
    subject: model.focusStatement,
    description: `分析范围：${model.scope}；数据源：${model.sourceName}`,
    styles: { default: { document: { run: { font: "Microsoft YaHei", size: 20, color: colors.ink }, paragraph: { spacing: { line: 320, after: 80 } } } } },
    sections: [{
      properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
      footers: { default: new Footer({ children: [paragraph(`质量慧析 · ${model.school} · ${model.sourceName}`, false, { color: colors.muted, size: 16, align: AlignmentType.CENTER })] }) },
      children: [
        paragraph("QUALITY INTELLIGENCE REPORT", true, { color: colors.primary, size: 16, spacingAfter: 140 }),
        new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 140 }, children: [new TextRun({ text: model.title, bold: true, color: colors.ink, size: 42, font: "Microsoft YaHei" })] }),
        paragraph(`${model.school}　｜　${model.scope}　｜　生成于 ${new Date(model.generatedAt).toLocaleString("zh-CN")}`, false, { color: colors.muted, size: 18, spacingAfter: 180 }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [new TableCell({ shading: { type: ShadingType.CLEAR, fill: colors.primarySoft }, margins: { top: 160, bottom: 160, left: 180, right: 180 }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.SINGLE, color: colors.primary, size: 18 }, right: { style: BorderStyle.NONE } }, children: [paragraph("本报告回答什么", true, { color: colors.primary, size: 18 }), paragraph(model.focusStatement, false, { color: "4C4A69", size: 19, spacingAfter: 0 })] })] })] }),
        sectionTitle("一、结论摘要"),
        paragraph(`本次纳入${summary.count}人，平均分${summary.average.toFixed(1)}，中位数${summary.median.toFixed(1)}；一本/特控上线${summary.topCount}人（${(summary.topRate * 100).toFixed(1)}%），本科上线${summary.undergraduateCount}人（${(summary.undergraduateRate * 100).toFixed(1)}%）。一本临界${summary.topCriticalCount}人，本科临界${summary.undergraduateCriticalCount}人。`),
        kpiTable,
        chartNote("紫色柱 = 分数区间人数；青绿色虚线 = 中位数位置。分层横条颜色与图中标签一一对应。"),
        image(charts.overview, 610, 265),
        sectionTitle("二、成绩分布与分层"),
        table(["区间", "人数", "占比"], model.distribution.map((item) => [item.label, String(item.count), `${(item.rate * 100).toFixed(1)}%`])),
        table(["分层", "人数", "占比", "行动意图"], model.segments.map((item) => [item.label, String(item.count), `${(item.rate * 100).toFixed(1)}%`, item.intent])),
        sectionTitle("三、班级对标"),
        chartNote("班级图：琥珀色柱 = 一本/特控上线率，青绿色柱 = 本科上线率。趋势图：紫线 = 一本线达成指数，琥珀线 = 一本上线率，青绿线 = 本科上线率，紫色虚线 = 指数基准100。"),
        image(charts.detail, 610, 285),
        table(["班级", "班型", "人数", "均分", "同组差", "同组位次", "一本率", "本科率"], model.classes.map((item) => [`${item.classNo}班`, item.type, String(item.count), item.average.toFixed(1), `${item.averageDelta >= 0 ? "+" : ""}${item.averageDelta.toFixed(1)}`, `${item.peerRank}/${item.peerSize}`, `${(item.topRate * 100).toFixed(1)}%`, `${(item.undergraduateRate * 100).toFixed(1)}%`])),
        sectionTitle("四、学科诊断"),
        table(["学科", "参考", "均分", "一本有效率", "本科有效率", "优先级"], model.subjects.map((item) => [item.subject, String(item.count), item.average.toFixed(1), `${item.topEffectiveCount} / ${(item.topEffectiveRate * 100).toFixed(1)}%`, `${item.undergraduateEffectiveCount} / ${(item.undergraduateEffectiveRate * 100).toFixed(1)}%`, item.undergraduateEffectiveRate < .55 ? "优先补弱" : item.undergraduateEffectiveRate < .75 ? "巩固提升" : "优势保持"])),
        new Paragraph({ children: [new PageBreak()] }),
        sectionTitle("五、临界生清单"),
        table(["类型", "班级", "姓名", "总分", "一本差", "本科差", "薄弱学科"], model.critical.map((item) => [item.criticalTiers.join("、"), `${item.classNo}班`, item.name, item.total.toFixed(1), item.topDiff === null ? "—" : item.topDiff.toFixed(1), item.undergraduateDiff === null ? "—" : item.undergraduateDiff.toFixed(1), item.weakSubjects.slice(0, 3).map((weak) => `${weak.subject} ${weak.diff.toFixed(1)}`).join("、") || "—"])),
        sectionTitle("六、知识点与小题"),
        paragraph(`本报告以${model.subject ?? "当前最弱学科"}作为知识点主视图；无可识别小题时保留成绩层结论，并在质检章节说明。`),
        table(["知识点", "小题数", "答题数", "得分率", "优先级"], model.knowledge.map((item) => [item.knowledge, String(item.questionCount), String(item.responseCount), `${(item.rate * 100).toFixed(1)}%`, item.priority])),
        sectionTitle("七、行动建议"),
        ...model.recommendations.map((recommendation, index) => paragraph(`${index + 1}. ${recommendation}`)),
        sectionTitle("八、数据质量与方法"),
        table(["质检项", "结果"], [["综合质量评分", `${model.quality.score}分`], ["综合识别置信度", `${(model.quality.confidence * 100).toFixed(1)}%`], ["身份关联方式", model.quality.identityCoverage ? "学号优先；缺失编号的记录按班级＋姓名" : "班级＋姓名；学号为可选字段，不参与评分"], ["学科完整度", `${(model.quality.subjectCompleteness * 100).toFixed(1)}%`], ["分数线完整度", `${(model.quality.thresholdCompleteness * 100).toFixed(1)}%`], ["小题覆盖度", `${(model.quality.itemCoverage * 100).toFixed(1)}%`], ["重建总分", String(model.quality.reconstructedTotals)], ["可用模块", model.quality.availableModules.join("、") || "—"]]),
        ...model.methodology.map((method, index) => paragraph(`${index + 1}. ${method}`)),
      ],
    }],
  });
  return Packer.toBlob(doc);
}

export async function exportReportWord(model: QualityReportModel, charts: { overview?: string; detail?: string } = {}): Promise<void> {
  downloadBlob(await buildReportWordBlob(model, charts), filename(model, "docx"));
}

export async function buildAnalysisWorkbook(model: QualityReportModel): Promise<WorkBook> {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  const add = (name: string, rows: unknown[][], options: { widths?: number[]; freeze?: string; filters?: string } = {}) => {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const widths = options.widths ?? rows.reduce<number[]>((result, row) => {
      row.forEach((value, index) => { result[index] = Math.min(42, Math.max(result[index] ?? 10, String(value ?? "").length * 1.45 + 2)); });
      return result;
    }, []);
    sheet["!cols"] = widths.map((wch) => ({ wch }));
    if (options.filters && sheet["!ref"]) sheet["!autofilter"] = { ref: options.filters };
    if (options.freeze) sheet["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: options.freeze, activePane: "bottomLeft", state: "frozen" } as never;
    XLSX.utils.book_append_sheet(book, sheet, name.slice(0, 31));
    return sheet;
  };
  const visualBar = (value: number, width = 18) => `${"■".repeat(Math.max(0, Math.min(width, Math.round(value * width))))}${"·".repeat(Math.max(0, width - Math.round(value * width)))}`;
  add("分析摘要", [["质量慧析分析摘要"], ["报告", model.title], ["范围", model.scope], ["数据源", model.sourceName], [], ["指标", "数值"], ["参考人数", model.summary.count], ["平均分", model.summary.average], ["中位数", model.summary.median], ["一本上线", model.summary.topCount], ["一本上线率", model.summary.topRate], ["本科上线", model.summary.undergraduateCount], ["本科上线率", model.summary.undergraduateRate], ["一本临界", model.summary.topCriticalCount], ["本科临界", model.summary.undergraduateCriticalCount], [], ["核心发现", "行动建议"], ...model.insights.map((item) => [item.finding, item.action])]);
  add("可视化摘要", [["质量慧析 · 可视化摘要"], ["范围", model.scope], [], ["班级", "一本率", "一本率视觉", "本科率", "本科率视觉"], ...model.classes.map((item) => [`${item.classNo}班`, item.topRate, visualBar(item.topRate), item.undergraduateRate, visualBar(item.undergraduateRate)]), [], ["学科", "一本有效率", "一本视觉", "本科有效率", "本科视觉"], ...model.subjects.map((item) => [item.subject, item.topEffectiveRate, visualBar(item.topEffectiveRate), item.undergraduateEffectiveRate, visualBar(item.undergraduateEffectiveRate)]), [], ["考试", "一本线达成指数", "一本上线率", "本科上线率", "参考人数"], ...model.trend.map((item) => [item.exam, item.topLineIndex ?? "", item.topRate, item.undergraduateRate, item.count])], { widths: [16, 18, 24, 14, 24] });
  add("学生明细", [["考试", "班级", "学号", "姓名", "类别", "班型", "选科组合", "总分", "总分来源", "源表行号", "市排名", "校排名", "语文", "数学", "英语", "日语", "物理", "历史", "化学", "生物", "政治", "地理"], ...model.students.map((student) => [student.exam, student.classNo, student.studentId ?? "", student.name, student.track, student.classType, student.combination, student.total, student.totalSource === "reconstructed" ? "重构" : "源表", student.sourceRow ?? "", student.cityRank ?? "", student.schoolRank ?? "", ...["语文", "数学", "英语", "日语", "物理", "历史", "化学", "生物", "政治", "地理"].map((subject) => student.subjects[subject as keyof typeof student.subjects] ?? "")])], { freeze: "A2", filters: "A1:V1" });
  add("成绩分布", [["区间", "人数", "占比", "起点", "终点"], ...model.distribution.map((item) => [item.label, item.count, item.rate, item.start, item.end])], { filters: "A1:E1" });
  add("学生分层", [["分层", "人数", "占比", "行动意图"], ...model.segments.map((item) => [item.label, item.count, item.rate, item.intent])], { filters: "A1:D1" });
  add("班级对标", [["班级", "类别", "班型", "人数", "平均分", "同组", "同组差", "位次", "一本人数", "一本率", "本科人数", "本科率"], ...model.classes.map((item) => [item.classNo, item.track, item.type, item.count, item.average, item.peerGroup, item.averageDelta, `${item.peerRank}/${item.peerSize}`, item.topCount, item.topRate, item.undergraduateCount, item.undergraduateRate])], { freeze: "A2", filters: "A1:L1" });
  add("学科诊断", [["学科", "参考人数", "平均分", "最高分", "一本有效人数", "一本有效率", "本科有效人数", "本科有效率", "一本有效分", "本科有效分"], ...model.subjects.map((item) => [item.subject, item.count, item.average, item.max, item.topEffectiveCount, item.topEffectiveRate, item.undergraduateEffectiveCount, item.undergraduateEffectiveRate, item.topEffectiveLine ?? "", item.undergraduateEffectiveLine ?? ""])], { filters: "A1:J1" });
  add("临界生清单", [["类型", "考试", "班级", "学号", "姓名", "总分", "一本差", "本科差", "优先学科", "班型", "源表行号"], ...model.critical.map((student) => [student.criticalTiers.join("、"), student.exam, student.classNo, student.studentId ?? "", student.name, student.total, student.topDiff ?? "", student.undergraduateDiff ?? "", student.weakSubjects.map((weak) => `${weak.subject} ${weak.diff.toFixed(1)}`).join("、"), student.classType, student.sourceRow ?? ""])], { freeze: "A2", filters: "A1:K1" });
  add(`${model.subject ?? "知识点"}知识点`, [["知识点", "小题数", "答题数", "得分", "可能得分", "得分率", "优先级"], ...model.knowledge.map((item) => [item.knowledge, item.questionCount, item.responseCount, item.earned, item.possible, item.rate, item.priority])], { filters: "A1:G1" });
  add("历次趋势", [["考试", "参考人数", "原始平均分", "一本线达成指数", "一本上线", "一本上线率", "本科上线", "本科上线率"], ...model.trend.map((item) => [item.exam, item.count, item.average, item.topLineIndex ?? "", item.topCount, item.topRate, item.undergraduateCount, item.undergraduateRate])], { filters: "A1:H1" });
  add("分数线", [["考试", "类别", "一本/特控总分线", "本科总分线", "一本学科线", "本科学科线"], ...model.thresholds.map((item) => [item.exam, item.track, item.topTotal ?? "", item.undergraduateTotal ?? "", Object.entries(item.topSubjects).map(([key, value]) => `${key}:${value}`).join("；"), Object.entries(item.undergraduateSubjects).map(([key, value]) => `${key}:${value}`).join("；")])], { filters: "A1:F1" });
  add("字段映射", [["标准字段", "源表表头", "列号", "识别策略", "置信度/口径"], ...model.fieldMatches.map((item) => item.field === "学号" && item.column === null
    ? [item.field, "可选未提供", "—", "可选字段", "不计分"]
    : [item.field, item.header || "未识别", item.column === null ? "" : item.column + 1, item.strategy, item.confidence])], { filters: "A1:E1" });
  add("数据质检", [["项目", "结果"], ["学校", model.school], ["导入时间", model.importedAt], ["工作表", model.sheets.join("、")], ["综合质量评分", model.quality.score], ["综合识别置信度", model.quality.confidence], ["身份关联方式", model.quality.identityCoverage ? "学号优先；其余按班级＋姓名" : "班级＋姓名（学号为可选字段，不参与评分）"], ["学科完整度", model.quality.subjectCompleteness], ["分数线完整度", model.quality.thresholdCompleteness], ["小题覆盖度", model.quality.itemCoverage], ["重建总分数量", model.quality.reconstructedTotals], ["警告数量", model.quality.warnings], ["错误数量", model.quality.errors], ["可用模块", model.quality.availableModules.join("、")], [], ["级别", "模块", "问题", "影响行数", "源表行号", "建议"], ...model.issues.map((item) => [item.level, item.module ?? "", item.message, item.affectedCount ?? "", item.rowNumbers?.join("、") ?? "", item.suggestion ?? ""]), [], ["方法说明"], ...model.methodology.map((item) => [item])]);
  book.Props = { Title: model.title, Subject: model.focusStatement, Author: "质量慧析", Company: model.school, CreatedDate: new Date(model.generatedAt), Comments: `范围：${model.scope}；数据源：${model.sourceName}` };
  return book;
}

export async function buildStyledAnalysisExcelBytes(model: QualityReportModel): Promise<Uint8Array> {
  const [excelModule, XLSX] = await Promise.all([import("exceljs"), import("xlsx")]);
  const Workbook = excelModule.Workbook ?? excelModule.default.Workbook;
  const source = await buildAnalysisWorkbook(model);
  const workbook = new Workbook();
  workbook.creator = "质量慧析";
  workbook.lastModifiedBy = "质量慧析";
  workbook.created = new Date(model.generatedAt);
  workbook.modified = new Date();
  workbook.title = model.title;
  workbook.subject = model.focusStatement;
  workbook.company = model.school;
  workbook.description = `分析范围：${model.scope}；数据源：${model.sourceName}`;

  const theme = {
    ink: "FF25252B",
    muted: "FF74747E",
    primary: "FF625CF6",
    primaryDark: "FF4F49D8",
    primarySoft: "FFEFEEFF",
    cyan: "FF20B8AE",
    cyanSoft: "FFEAF9F7",
    amber: "FFF0A329",
    amberSoft: "FFFFF7E8",
    coralSoft: "FFFFEEEA",
    line: "FFE6E6EB",
    surface: "FFF7F7F9",
    white: "FFFFFFFF",
  };
  const sectionLabels = new Set(["指标", "核心发现", "班级", "学科", "考试", "级别", "方法说明"]);
  const ratioHeader = /(率|占比|完整度|覆盖度|置信度)/;
  const countHeader = /(人数|数量|小题数|答题数|源表行号|列号|警告|错误|班级|一本上线|本科上线)$/;

  for (const sheetName of source.SheetNames) {
    const sourceSheet = source.Sheets[sheetName]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sourceSheet, { header: 1, raw: true, defval: "" });
    const maxColumns = Math.max(1, ...rows.map((row) => row.length));
    const wide = maxColumns > 7;
    const sheet = workbook.addWorksheet(sheetName, {
      properties: { defaultRowHeight: 19 },
      pageSetup: {
        paperSize: 9,
        orientation: wide ? "landscape" : "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: .3, right: .3, top: .5, bottom: .5, header: .2, footer: .2 },
        printTitlesRow: "1:1",
      },
      views: [{ state: "frozen", xSplit: 0, ySplit: sheetName === "分析摘要" ? 6 : sheetName === "可视化摘要" ? 4 : 1, showGridLines: false }],
    });
    sheet.addRows(rows);
    sheet.headerFooter.oddFooter = "&L质量慧析 · 数据仅限内部使用&C第 &P / &N 页&R" + model.exam;
    sheet.autoFilter = sourceSheet["!autofilter"]?.ref;
    const sourceColumns = (sourceSheet["!cols"] ?? []) as Array<{ wch?: number }>;
    sheet.columns = Array.from({ length: maxColumns }, (_, index) => ({ width: Math.max(10, Math.min(44, sourceColumns[index]?.wch ?? 14)) }));

    const titleSheet = sheetName === "分析摘要" || sheetName === "可视化摘要";
    if (titleSheet && maxColumns > 1) sheet.mergeCells(1, 1, 1, maxColumns);

    for (let rowIndex = 1; rowIndex <= sheet.rowCount; rowIndex += 1) {
      const row = sheet.getRow(rowIndex);
      const firstValue = String(row.getCell(1).value ?? "");
      const isTitle = titleSheet && rowIndex === 1;
      const isSection = sectionLabels.has(firstValue);
      const isPrimaryHeader = !titleSheet && rowIndex === 1;
      const isHeader = isPrimaryHeader || isSection;
      const wrappedSheets = new Set(["分析摘要", "临界生清单", "分数线", "数据质检"]);
      const estimatedLines = wrappedSheets.has(sheetName) && firstValue !== "" ? Math.max(1, ...Array.from({ length: maxColumns }, (_, index) => {
        const text = String(row.getCell(index + 1).value ?? "");
        const units = [...text].reduce((sum, character) => sum + (/[^\x00-\xff]/.test(character) ? 1.8 : 1), 0);
        return Math.max(1, Math.ceil(units / Math.max(8, (sheet.getColumn(index + 1).width ?? 14) * .9)));
      })) : 1;
      row.height = isTitle ? 32 : isHeader ? 26 : firstValue === "" ? 10 : Math.min(96, Math.max(21, estimatedLines * 14 + 5));

      row.eachCell({ includeEmpty: true }, (cell, columnIndex) => {
        cell.font = { name: "Microsoft YaHei", size: isTitle ? 15 : isHeader ? 10 : 9.5, bold: isTitle || isHeader, color: { argb: isTitle || isHeader ? theme.white : theme.ink } };
        cell.alignment = { vertical: "middle", horizontal: isTitle ? "left" : typeof cell.value === "number" ? "right" : "left", wrapText: true };
        cell.border = { bottom: { style: "hair", color: { argb: theme.line } } };
        if (isTitle) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: theme.primaryDark } };
        } else if (isHeader) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isSection ? theme.cyan : theme.primary } };
        } else if (firstValue !== "" && rowIndex % 2 === 0) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: theme.surface } };
        }

        const columnHeader = String(rows[0]?.[columnIndex - 1] ?? "");
        const rowLabel = String(row.getCell(1).value ?? "");
        if (typeof cell.value === "number") {
          if (ratioHeader.test(columnHeader) || (columnIndex === 2 && ratioHeader.test(rowLabel))) {
            cell.numFmt = "0.0%";
            if (!isHeader) {
              const fill = cell.value >= .8 ? theme.cyanSoft : cell.value >= .6 ? theme.primarySoft : theme.amberSoft;
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
            }
          } else if (countHeader.test(columnHeader) || countHeader.test(rowLabel)) {
            cell.numFmt = "0";
          } else {
            cell.numFmt = "0.0";
          }
        }
      });
    }

    const primaryHeaders = rows[0]?.map((value) => String(value ?? "")) ?? [];
    primaryHeaders.forEach((header, index) => {
      if (!ratioHeader.test(header) || sheet.rowCount < 2) return;
      const column = sheet.getColumn(index + 1).letter;
      const dataBarRule = { type: "dataBar", cfvo: [{ type: "min" }, { type: "max" }], color: { argb: theme.primary }, showValue: true, gradient: true } as import("exceljs").DataBarRuleType & { color: { argb: string } };
      sheet.addConditionalFormatting({
        ref: `${column}2:${column}${sheet.rowCount}`,
        rules: [dataBarRule],
      });
    });
    sheet.getColumn(1).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    sheet.views = [{ state: "frozen", xSplit: 0, ySplit: sheetName === "分析摘要" ? 6 : sheetName === "可视化摘要" ? 4 : 1, showGridLines: false }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export async function exportAnalysisExcel(model: QualityReportModel): Promise<void> {
  const bytes = await buildStyledAnalysisExcelBytes(model);
  downloadBlob(new Blob([Uint8Array.from(bytes).buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename(model, "xlsx"));
}

export async function exportElementPdf(target: HTMLElement | null, name: string): Promise<void> {
  if (!target) throw new Error("报告预览尚未准备好，请稍后重试。");
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const canvas = await html2canvas(target, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false, windowWidth: Math.max(820, target.scrollWidth), onclone: (documentClone) => documentClone.documentElement.classList.add("exporting-document") });
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const pageWidth = 210, pageHeight = 297, marginX = 10, marginTop = 9, marginBottom = 12, contentWidth = pageWidth - marginX * 2, usableHeight = pageHeight - marginTop - marginBottom;
  const pixelsPerMm = canvas.width / contentWidth;
  const maxSlicePixels = usableHeight * pixelsPerMm;
  const targetRect = target.getBoundingClientRect();
  const renderScale = canvas.width / Math.max(1, targetRect.width);
  const protectedRanges = Array.from(target.querySelectorAll("h1, h2, p, tr, .report-kpis, .report-focus, .report-chart-card, .report-insights, .report-segment-grid, .report-footer")).map((element) => {
    const rect = element.getBoundingClientRect();
    return { top: Math.max(0, (rect.top - targetRect.top) * renderScale), bottom: Math.min(canvas.height, (rect.bottom - targetRect.top) * renderScale) };
  }).filter((range) => range.bottom > range.top);
  let sliceStart = 0;
  let page = 0;
  while (sliceStart < canvas.height - 2) {
    const desiredEnd = Math.min(canvas.height, sliceStart + maxSlicePixels);
    let sliceEnd = desiredEnd;
    if (desiredEnd < canvas.height) {
      const crossing = protectedRanges.filter((range) => range.top < desiredEnd && range.bottom > desiredEnd && range.top > sliceStart + maxSlicePixels * .48).sort((a, b) => b.top - a.top)[0];
      if (crossing) sliceEnd = crossing.top;
    }
    if (sliceEnd <= sliceStart + maxSlicePixels * .4) sliceEnd = desiredEnd;
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = Math.ceil(sliceEnd - sliceStart);
    const context = slice.getContext("2d");
    if (!context) throw new Error("无法创建PDF分页画布");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, slice.width, slice.height);
    context.drawImage(canvas, 0, sliceStart, canvas.width, slice.height, 0, 0, slice.width, slice.height);
    if (page > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL("image/jpeg", .94), "JPEG", marginX, marginTop, contentWidth, slice.height / pixelsPerMm, undefined, "FAST");
    pdf.setDrawColor(229, 229, 234);
    pdf.line(marginX, pageHeight - 8, pageWidth - marginX, pageHeight - 8);
    pdf.setTextColor(139, 139, 148);
    pdf.setFontSize(7);
    pdf.text(`质量慧析 · ${page + 1}`, pageWidth - marginX, pageHeight - 4.5, { align: "right" });
    sliceStart = sliceEnd;
    page += 1;
  }
  pdf.save(name.endsWith(".pdf") ? name : `${name}.pdf`);
}

export type Track = "物理类" | "历史类" | "未配置";

export type SubjectName =
  | "语文"
  | "数学"
  | "英语"
  | "日语"
  | "物理"
  | "历史"
  | "化学"
  | "生物"
  | "政治"
  | "地理";

export type ClassProfile = {
  classNo: number;
  track: Track;
  combination: string;
  type: string;
  label: string;
};

export type StudentScore = {
  exam: string;
  rawExam: string;
  school: string;
  classNo: number;
  name: string;
  track: Track;
  classType: string;
  combination: string;
  total: number;
  totalSource?: "source" | "reconstructed";
  cityRank: number | null;
  schoolRank: number | null;
  subjects: Partial<Record<SubjectName, number>>;
};

export type Threshold = {
  exam: string;
  track: Track;
  topTotal: number | null;
  undergraduateTotal: number | null;
  topSubjects: Partial<Record<SubjectName, number>>;
  undergraduateSubjects: Partial<Record<SubjectName, number>>;
};

export type QuestionMeta = {
  question: string;
  maxScore: number | null;
  maxScoreSource?: "source" | "inferred";
  knowledge: string;
  sourceColumn?: number;
};

export type ItemResponse = {
  subject: SubjectName;
  exam: string;
  classNo: number;
  name: string;
  scores: Array<number | null>;
};

export type ImportIssue = {
  level: "error" | "warning" | "info";
  message: string;
  module?: "成绩" | "分数线" | "小题" | "系统";
  affectedCount?: number;
  suggestion?: string;
};

export type DataCapability = {
  id: "overview" | "classes" | "subjects" | "students" | "online" | "items" | "history" | "reports";
  label: string;
  available: boolean;
  confidence: number;
  reason: string;
};

export type FieldMatch = {
  field: string;
  column: number | null;
  header: string;
  strategy: "semantic" | "relative" | "fallback" | "missing";
  confidence: number;
};

export type DataProfile = {
  overallConfidence: number;
  scoreHeaderRow: number | null;
  subjectCompleteness: number;
  thresholdCompleteness: number;
  itemCoverage: number;
  reconstructedTotals: number;
  skippedRows: number;
  fieldMatches: FieldMatch[];
  capabilities: DataCapability[];
};

export type GradeDataset = {
  id: string;
  sourceName: string;
  importedAt: string;
  school: string;
  exams: string[];
  scores: StudentScore[];
  thresholds: Threshold[];
  questionBanks: Record<string, QuestionMeta[]>;
  itemResponses: ItemResponse[];
  issues: ImportIssue[];
  sheets: string[];
  profile?: DataProfile;
};

export type ClassSummary = {
  classNo: number;
  label: string;
  track: Track;
  type: string;
  count: number;
  average: number;
  topCount: number;
  undergraduateCount: number;
  topRate: number;
  undergraduateRate: number;
  subjectAverages: Partial<Record<SubjectName, number>>;
};

export type SubjectSummary = {
  subject: SubjectName;
  count: number;
  average: number;
  max: number;
  topEffectiveCount: number;
  topEffectiveRate: number;
  topEffectiveLine: number | null;
  undergraduateEffectiveCount: number;
  undergraduateEffectiveRate: number;
  undergraduateEffectiveLine: number | null;
  /** 兼容旧页面：等同于本科有效口径。 */
  effectiveCount: number;
  effectiveRate: number;
  effectiveLine: number | null;
};

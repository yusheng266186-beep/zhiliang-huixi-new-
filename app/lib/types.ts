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
  language?: "英语" | "日语";
  subjectSourceOverrides?: Partial<Record<SubjectName, SubjectName>>;
};

export type StudentScore = {
  exam: string;
  rawExam: string;
  school: string;
  classNo: number;
  studentId?: string | null;
  name: string;
  identityKey?: string;
  sourceRow?: number;
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
  code?: "missing-identity" | "missing-student-id" | "missing-total" | "reconstructed-total" | "duplicate-record" | "duplicate-name" | "multiple-schools" | "out-of-range";
  affectedCount?: number;
  rowNumbers?: number[];
  suggestion?: string;
};

export type DuplicateStrategy = "keep-all" | "keep-first" | "keep-last";

export type GradeImportOptions = {
  /** null 表示保留所有学校；省略时选择记录数最多的学校并等待用户确认。 */
  school?: string | null;
  includeReconstructedTotals?: boolean;
  duplicateStrategy?: DuplicateStrategy;
  /** 可选的班级规则覆盖；用于让后续导入复用当前学校的班型与选科口径。 */
  classProfiles?: Record<number, ClassProfile>;
};

export type DuplicateConflict = {
  exam: string;
  classNo: number;
  rowNumbers: number[];
  conflictingFields: string[];
};

export type ImportReview = {
  candidateRows: number;
  retainedRows: number;
  detectedSchools: Array<{ school: string; rowCount: number; studentCount: number }>;
  selectedSchool: string | null;
  studentCount: number;
  classCount: number;
  idRows: number;
  identityCoverage: number;
  duplicateGroups: number;
  duplicateRows: number;
  duplicateConflicts: DuplicateConflict[];
  sameNameGroups: number;
  reconstructedTotals: number;
  skippedRows: number;
  excludedSchoolRows: number;
  excludedReconstructedRows: number;
  deduplicatedRows: number;
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
  /** 当前学校可编辑的班级、类别与选科规则。 */
  classProfiles?: Record<number, ClassProfile>;
  profile?: DataProfile;
  importReview?: ImportReview;
  /** 仅用于导入确认阶段；确认后会移除，不写入浏览器存储。 */
  importCandidates?: StudentScore[];
  /** 导入确认阶段保留完整分数线候选，确认后移除。 */
  importThresholds?: Threshold[];
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

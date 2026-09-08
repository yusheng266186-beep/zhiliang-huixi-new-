import type { ClassProfile, SubjectName, Track } from "./types";

export const CLASS_PROFILES: Record<number, ClassProfile> = {
  1: { classNo: 1, track: "物理类", combination: "物化生", type: "华英班", label: "1班 · 物化生华英班" },
  2: { classNo: 2, track: "物理类", combination: "物化生", type: "直播班", label: "2班 · 物化生直播班" },
  3: { classNo: 3, track: "物理类", combination: "物化生", type: "平行班", label: "3班 · 物化生平行班" },
  4: { classNo: 4, track: "物理类", combination: "物化生", type: "平行班", label: "4班 · 物化生平行班" },
  5: { classNo: 5, track: "物理类", combination: "物化生", type: "平行班", label: "5班 · 物化生平行班" },
  6: { classNo: 6, track: "物理类", combination: "物化生", type: "平行班", label: "6班 · 物化生平行班" },
  7: { classNo: 7, track: "物理类", combination: "物化生", type: "日语平行班", label: "7班 · 物化生日语平行班" },
  8: { classNo: 8, track: "物理类", combination: "物化生", type: "平行班", label: "8班 · 物化生平行班" },
  9: { classNo: 9, track: "物理类", combination: "物化地", type: "平行班", label: "9班 · 物化地平行班" },
  10: { classNo: 10, track: "历史类", combination: "历政地", type: "直播班", label: "10班 · 历政地直播班" },
  11: { classNo: 11, track: "历史类", combination: "历政地", type: "平行班", label: "11班 · 历政地平行班" },
  12: { classNo: 12, track: "历史类", combination: "历政地", type: "平行班", label: "12班 · 历政地平行班" },
  13: { classNo: 13, track: "历史类", combination: "历政地", type: "平行班", label: "13班 · 历政地平行班" },
  14: { classNo: 14, track: "历史类", combination: "历政地", type: "平行班", label: "14班 · 历政地平行班" },
  15: { classNo: 15, track: "历史类", combination: "历政地", type: "体育班", label: "15班 · 历政地体育班" },
  17: { classNo: 17, track: "物理类", combination: "物化生", type: "待配置", label: "17班 · 物化生（班型待配置）" },
  18: { classNo: 18, track: "历史类", combination: "历政地", type: "待配置", label: "18班 · 历政地（班型待配置）" },
  16: { classNo: 16, track: "历史类", combination: "艺术", type: "美术班", label: "16班 · 美术班" },
};

export const ALL_SUBJECTS: SubjectName[] = [
  "语文", "数学", "英语", "日语", "物理", "历史", "化学", "生物", "政治", "地理",
];

export const getClassProfile = (classNo: number, exam = ""): ClassProfile => {
  if (CLASS_PROFILES[classNo]) return CLASS_PROFILES[classNo];
  const track: Track = exam.includes("历") ? "历史类" : exam.includes("物") ? "物理类" : "未配置";
  return {
    classNo,
    track,
    combination: track === "物理类" ? "物化生" : track === "历史类" ? "历政地" : "待配置",
    type: "待配置",
    label: `${classNo}班 · 待配置`,
  };
};

export const relevantSubjects = (profile: ClassProfile): SubjectName[] => {
  const language: SubjectName = profile.classNo === 7 ? "日语" : "英语";
  if (profile.combination === "物化生") return ["语文", "数学", language, "物理", "化学", "生物"];
  if (profile.combination === "物化地") return ["语文", "数学", language, "物理", "化学", "地理"];
  if (profile.combination === "历政地") return ["语文", "数学", language, "历史", "政治", "地理"];
  if (profile.track === "物理类") return ["语文", "数学", language, "物理", "化学", "生物"];
  if (profile.track === "未配置") return ["语文", "数学", language];
  return ["语文", "数学", language, "历史", "政治", "地理"];
};

export const normalizeExam = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  return raw.replace(/[物历]$/, "").trim();
};


// Only known school exam codes are ordered. Unknown names retain source order.
export const orderExams = (exams: string[]): string[] => {
  const known = ["入口", "1册", "21", "22", "2册", "31", "32", "33", "3册", "41", "4半", "4月", "43", "4册", "51"];
  const knownSlots = exams.filter(e => known.includes(e)).sort((a,b) => known.indexOf(a)-known.indexOf(b));
  return exams.map(e => known.includes(e) ? knownSlots.shift()! : e);
};

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGradeWorkbook } from '../app/lib/parser';
import { classSummaries, filterScores, subjectSummaries, knowledgeSummaries, buildExecutiveInsights, onlineSummary } from '../app/lib/analytics';
import { buildQualityReport } from '../app/lib/report-model';
import { createDemoDataset } from '../app/lib/demo';
import { percentage } from '../app/lib/format';
const path=process.argv[2];
const dataset=path ? await parseGradeWorkbook(new File([readFileSync(path)], 'validation.xlsx')) : createDemoDataset();
if(path) {
 assert.equal(dataset.exams.at(-1),'51');
 for(const [track,count,top,under] of [['物理类',433,67,237],['历史类',289,34,175]] as const) {
   const rows=filterScores(dataset,'51',track), summary=onlineSummary(dataset,'51',rows);
   assert.equal(rows.length,count);assert.equal(summary.topCount,top);assert.equal(summary.undergraduateCount,under);
   const classes=classSummaries(dataset,'51',track);
   assert.equal(classes.reduce((n,c)=>n+(c.topCount ?? 0),0),top);
   assert.equal(classes.reduce((n,c)=>n+(c.undergraduateCount ?? 0),0),under);
 }
 const c17=filterScores(dataset,'51','物理类',17);
 assert.equal(c17.length,32);assert.ok(c17.every(r=>r.subjects.物理!==undefined && r.subjects.化学!==undefined && r.subjects.历史===undefined));
 assert.equal(classSummaries(dataset,'51','历史类').find(c=>c.classNo===18)?.count,19);
 assert.equal(dataset.itemResponses.filter(r=>r.exam==='51').length,0);
 const report=buildQualityReport(dataset,{exam:'51',track:'全部',classNo:'全部',reportType:'年级质量分析'});
 assert.equal(report.summary.topCount,101);assert.equal(report.summary.undergraduateCount,412);assert.equal(report.quality.itemCoverage,0);assert.ok(!report.quality.availableModules.includes('小题知识点'));
 assert.equal(dataset.itemResponses.filter(r=>r.exam==='4册'&&r.subject==='地理'&&r.classNo===9).length,44);
 assert.ok(!dataset.itemResponses.some(r=>r.subject==='日语'));
 assert.ok(Object.values(dataset.questionBanks).flat().every(q=>q.maxScoreSource!=='inferred'));
 const geo=knowledgeSummaries(dataset,'4册','地理','物理类',9);assert.ok(geo.every(k=>k.rate<=1));
 console.log('Workbook checks passed: 722 students; top 101; undergraduate 412; classes 17/18; geography 44; exam 51 has no items.');
}
const exam=dataset.exams.at(-1)!;
const missing={...dataset,thresholds:[]};
assert.ok(subjectSummaries(missing,exam,'全部','全部').every(s=>s.undergraduateEffectiveRate === null));
assert.ok(!buildExecutiveInsights(missing,exam,'全部','全部').some(i=>i.id==='subject'));
assert.equal(percentage(onlineSummary(missing,exam,filterScores(missing,exam,'全部')).topRate),'—');
assert.ok(classSummaries(missing,exam,'全部').every(c=>c.topCount === null));
console.log('Missing thresholds remain unavailable; no false weakest-subject verdict.');
const source=dataset.scores.find(r=>r.exam===exam)!;
const mixed={...dataset,scores:[{...source,exam,track:'物理类' as const,subjects:{语文:100}},{...source,exam,name:'synthetic-second',track:'历史类' as const,subjects:{语文:10}}],thresholds:[{exam,track:'物理类' as const,topTotal:500,undergraduateTotal:400,topSubjects:{语文:90},undergraduateSubjects:{语文:80}}]};
const partial=subjectSummaries(mixed,exam,'全部','全部')[0];
assert.equal(partial.count,2);assert.equal(partial.topEligible,1);assert.equal(partial.topEffectiveRate,1);
const marks={...mixed,questionBanks:{['语文::'+exam]:[{question:'1',knowledge:'测试知识点',maxScore:null}]},itemResponses:[{exam,subject:'语文' as const,classNo:source.classNo,name:source.name,scores:[2]}]};
assert.equal(knowledgeSummaries(marks,exam,'语文','全部','全部').length,0);
console.log('Partial denominator and unknown full marks regression checks passed.');

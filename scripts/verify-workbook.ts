import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import * as XLSX from 'xlsx';
import { parseGradeWorkbook } from '../app/lib/parser';
import { buildQualityReport } from '../app/lib/report-model';
import { buildAnalysisExcel, buildReportWord } from '../app/lib/exporters';
import { classifyScore } from '../app/lib/score-validation';
import { onlineSummary, filterScores } from '../app/lib/analytics';

// Synthetic data follows the supplied workbook's 33-row, original/converted-score layout.
const rows: unknown[][] = Array.from({length:33},()=>[]);
rows[0][1]='一本'; rows[0][10]='本科'; rows[1][2]='总分'; rows[1][11]='总分';
rows[4][1]='51物'; rows[4][2]=500; rows[4][10]='51物'; rows[4][11]=400;
const headers: Record<number,string>={0:'考试',1:'学校',2:'班级',3:'姓名',4:'总分原分',5:'总分赋分',7:'市赋名',9:'校赋名',10:'语文',13:'数学',16:'英语',19:'物理',23:'政治赋分',27:'地理赋分',31:'化学赋分',35:'生物赋分'};
Object.entries(headers).forEach(([col,text])=>rows[30][Number(col)]=text);
const row=(name:string,total:unknown=490)=>{ const r:unknown[]=[];r[0]='51物';r[1]='合成学校';r[2]=17;r[3]=name;r[4]=total;r[5]=total;r[7]=1;r[9]=1;[10,13,16].forEach(c=>r[c]=100);[19,31,35].forEach(c=>r[c]=60);return r; };
for(let i=1;i<=155;i++) rows.push(row(`合成学生${String(i).padStart(3,'0')}`));
const zero=row('有效零分');zero[10]=0;rows.push(zero);
for(const [name,value] of [['空白',null],['缺考','缺考'],['缓考','缓考'],['错误','#REF!'],['负数',-1],['超限',151]] as const){const r=row(name);r[10]=value;rows.push(r);}
rows.push(row('总分空白',null),row('总分异常',999));
const badClass=row('班号小数');badClass[2]=17.9;rows.push(badClass);
rows.push(row('同分重复'),row('同分重复'));
rows.push(row('成绩冲突',480),row('成绩冲突',490));
const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet(rows);XLSX.utils.book_append_sheet(book,sheet,'学生基础');
const formulaRow=rows.findIndex(r=>r[3]==='错误');sheet[XLSX.utils.encode_cell({r:formulaRow,c:10})]={t:'e',v:23};
const bytes=XLSX.write(book,{type:'buffer',bookType:'xlsx'});
if(process.env.SYNTHETIC_OUTPUT)writeFileSync(process.env.SYNTHETIC_OUTPUT,bytes);
const data=await parseGradeWorkbook(new File([bytes],'synthetic.xlsx'));
assert.equal(data.scores.length,163);
assert.equal(data.scores.find(s=>s.name==='有效零分')?.subjects.语文,0);
for(const name of ['空白','缺考','缓考','错误','负数','超限'])assert.equal(data.scores.find(s=>s.name===name)?.subjects.语文,undefined);
assert.equal(data.scoreIssues?.find(i=>i.name==='错误')?.state,'formula-error');
assert.ok(!data.scores.some(s=>['总分空白','总分异常','班号小数','成绩冲突'].includes(s.name)));
assert.equal(data.scoreConflicts?.filter(c=>c.resolution==='excluded').length,1);
assert.equal(data.scoreConflicts?.filter(c=>c.resolution==='rank-only').length,1);
assert.equal(data.profile?.reconstructedTotals,0);
assert.equal(classifyScore('0').value,0);assert.equal(classifyScore('').state,'missing');
const model=buildQualityReport(data,{exam:'51',track:'全部',classNo:'全部',reportType:'年级质量分析'});
assert.equal(model.critical.length,163);assert.equal(model.students.length,163);
const excel=XLSX.read(await (await buildAnalysisExcel(model)).arrayBuffer());
assert.equal(XLSX.utils.sheet_to_json(excel.Sheets['学生明细']).length,163);
assert.equal(XLSX.utils.sheet_to_json(excel.Sheets['临界生清单']).length,163);
assert.equal(XLSX.utils.sheet_to_json(excel.Sheets['源表异常明细']).length,model.audit.length);
const tmp=mkdtempSync(join(tmpdir(),'quality-report-'));
try { const file=join(tmp,'report.docx');writeFileSync(file,Buffer.from(await (await buildReportWord(model)).arrayBuffer()));
const xml=execFileSync('python3',['-c','import zipfile,sys;print(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode())',file],{encoding:'utf8'});
for(const student of model.critical)assert.ok(xml.includes(student.name));
}finally{rmSync(tmp,{recursive:true,force:true});}
if(process.argv[2]){
 const original=await parseGradeWorkbook(new File([readFileSync(process.argv[2])],'source.xlsx'));
 const actual=buildQualityReport(original,{exam:'51',track:'全部',classNo:'全部',reportType:'年级质量分析'});
 assert.equal(actual.students.length,722);assert.equal(actual.audit.filter(i=>i.state==='missing').length,34);
 for(const [track,expected] of [['物理类',403.5713922320411],['历史类',419.14728192175136]] as const){const scores=filterScores(original,'51',track);assert.ok(Math.abs(scores.reduce((n,s)=>n+s.total,0)/scores.length-expected)<1e-9);assert.equal(onlineSummary(original,'51',scores).topMetric.status,'available');}
 const exported=XLSX.read(await (await buildAnalysisExcel(actual)).arrayBuffer());assert.equal(XLSX.utils.sheet_to_json(exported.Sheets['学生明细']).length,722);
 console.log(JSON.stringify({exam51:722,missingSubjectCells:actual.audit.length,conflicts:original.scoreConflicts?.reduce((a,c)=>({...a,[c.resolution]:(a[c.resolution]??0)+1}),{} as Record<string,number>)}));
}
console.log('Workbook-layout validation passed: zero/missing/error/invalid identity/totals/duplicates; 163 complete Excel and Word rows.');

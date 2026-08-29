# examples/

本目录**不提交任何工作簿数据**（含真实姓名/成绩的文件严禁提交；合成示例体积约几十 MB，也不提交）。

`scripts/make-fixture.ts` 用于从一份真实质量复盘工作簿生成本机离线验证用的合成示例
`examples/synthetic-quality-review.xlsx`（已被 .gitignore 排除）：

    node --import tsx scripts/make-fixture.ts <真实工作簿.xlsx>

生成规则：所有学生姓名替换为"学生001…"式代号，分数做 ±8% 确定性扰动；
工作表结构、分块与解析口径完全保留（scores=7255 / exams=11 / thresholds=19 / itemResponses=16047）。

生成之后，任何验证都可以脱离真实数据、脱离原路径运行：

    npm run test:parser
    npm run test:analytics

分析真实数据时请通过参数显式传入本机工作簿：

    npm run test:parser -- "C:/path/to/高2024级4册质量复盘.xlsx"

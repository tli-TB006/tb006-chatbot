const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const faqPath = path.join(__dirname, "faq.json");
const faqs = JSON.parse(fs.readFileSync(faqPath, "utf-8"));

function normalize(text = "") {
  return text.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/gi, " ");
}

function scoreFaq(query, faq) {
  const q = normalize(query);
  const question = normalize(faq.question);
  const answer = normalize(faq.answer);
  const keywords = (faq.keywords || []).map(k => normalize(k));

  let score = 0;

  if (question.includes(q)) score += 50;
  if (answer.includes(q)) score += 20;

  for (const kw of keywords) {
    if (!kw) continue;
    if (q.includes(kw) || kw.includes(q)) score += 25;
    const qTokens = q.split(/\s+/).filter(Boolean);
    if (qTokens.some(t => kw.includes(t))) score += 8;
  }

  const qTokens = q.split(/\s+/).filter(Boolean);
  const hitCount = qTokens.filter(t => question.includes(t) || answer.includes(t)).length;
  score += hitCount * 5;

  return score;
}

app.post("/api/ask", (req, res) => {
  const { question } = req.body || {};
  if (!question || !question.trim()) {
    return res.status(400).json({ error: "问题不能为空" });
  }

  const ranked = faqs
    .map(faq => ({ ...faq, _score: scoreFaq(question, faq) }))
    .sort((a, b) => b._score - a._score);

  const best = ranked[0];
  const related = ranked.slice(1, 4).map(item => ({
    id: item.id,
    question: item.question,
    category: item.category
  }));

  if (!best || best._score < 15) {
    return res.json({
      found: false,
      answer: "暂未找到精准答案，请换个关键词（如：EAP、MMSE、SAE、副作用）或联系人工支持。",
      related: []
    });
  }

  return res.json({
    found: true,
    answer: best.answer,
    matchedQuestion: best.question,
    category: best.category,
    related
  });
});

app.listen(PORT, () => {
  console.log(`服务已启动, 端口：${PORT}`);
});
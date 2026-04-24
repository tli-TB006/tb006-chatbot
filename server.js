const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "chat.html"));
});

// 核心优化 1: 动态读取函数，确保 GitHub 更新后 Render 部署能读取到最新数据
function getLatestFaqs() {
  try {
    // 兼容你提到的 FAQ.JSON 大小写问题
    const filePath = fs.existsSync(path.join(__dirname, "FAQ.JSON")) 
      ? path.join(__dirname, "FAQ.JSON") 
      : path.join(__dirname, "faq.json");
    
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("读取 FAQ 文件失败:", err);
    return [];
  }
}

function normalize(text = "") {
  // 针对中文优化：保留中文字符、字母、数字，去掉干扰符号
  return text.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/gi, "").trim();
}

function scoreFaq(query, faq) {
  const q = normalize(query);
  if (!q) return 0;

  const question = normalize(faq.question);
  const keywords = (faq.keywords || []).map((k) => normalize(k));

  let score = 0;

  // 1. 全等匹配（最高优先级）
  if (question === q) score += 100;

  // 2. 关键词硬匹配（非常重要）
  for (const kw of keywords) {
    if (!kw) continue;
    if (q === kw) {
      score += 80; // 完全命中关键词
    } else if (q.includes(kw)) {
      score += 40; // 用户提问包含关键词 (如 "这个药价格多少" 包含 "价格")
    } else if (kw.includes(q)) {
      score += 20; // 关键词包含用户提问
    }
  }

  // 3. 模糊包含匹配
  if (question.includes(q)) score += 30;
  
  // 4. 类别辅助匹配（如果用户提到了类别名，如“我想问下关于不良事件”）
  if (q.includes(normalize(faq.category))) score += 10;

  return score;
}

app.post("/api/ask", (req, res) => {
  const { question } = req.body || {};
  if (!question || !question.trim()) {
    return res.status(400).json({ error: "问题不能为空" });
  }

  // 核心优化 2: 每次请求重新加载数据，保证同步最新 GitHub 内容
  const currentFaqs = getLatestFaqs();

  const ranked = currentFaqs
    .map((faq) => ({ ...faq, _score: scoreFaq(question, faq) }))
    .filter(item => item._score > 0) // 只保留有相关性的
    .sort((a, b) => b._score - a._score);

  const best = ranked[0];
  
  // 过滤掉当前最佳答案后，提取相关问题
  const related = ranked
    .slice(1, 4)
    .map((item) => ({
      id: item.id,
      question: item.question,
      category: item.category,
    }));

  // 核心优化 3: 调整阈值。如果分值太低（低于 15），认为没找到
  if (!best || best._score < 15) {
    // 关键：在控制台打印未匹配的日志
    console.log(`[MISSING_FAQ] 用户提问: "${question}" | 时间: ${new Date().toLocaleString()}`);

    return res.json({
      found: false,
      answer: "暂未找到精准答案，请咨询人工微信：CA_Pluto。",
      related: [],
    });
  }

  return res.json({
    found: true,
    answer: best.answer,
    matchedQuestion: best.question,
    category: best.category,
    related: related,
  });
});

app.listen(PORT, () => {
  console.log(`TB006 FAQ服务已启动, 端口：${PORT}`);
});

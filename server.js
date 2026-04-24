const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer"); // 必须确保 package.json 里有这个库

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 邮件发送配置 (使用 Render 的环境变量)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "chat.html"));
});

// 动态读取 FAQ 数据
function getLatestFaqs() {
  try {
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
  return text.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/gi, "").trim();
}

// 评分逻辑
function scoreFaq(query, faq) {
  const q = normalize(query);
  if (!q) return 0;
  const question = normalize(faq.question);
  const keywords = (faq.keywords || []).map((k) => normalize(k));
  let score = 0;

  if (question === q) score += 100;
  for (const kw of keywords) {
    if (!kw) continue;
    if (q === kw) score += 80;
    else if (q.includes(kw)) score += 40;
    else if (kw.includes(q)) score += 20;
  }
  if (question.includes(q)) score += 30;
  return score;
}

// 问答处理接口
app.post("/api/ask", async (req, res) => {
  const { question } = req.body || {};
  if (!question || !question.trim()) {
    return res.status(400).json({ error: "问题不能为空" });
  }

  const currentFaqs = getLatestFaqs();
  const ranked = currentFaqs
    .map((faq) => ({ ...faq, _score: scoreFaq(question, faq) }))
    .filter(item => item._score > 0)
    .sort((a, b) => b._score - a._score);

  const best = ranked[0];

  // --- 邮件通知逻辑 ---
  if (!best || best._score < 15) {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // 发给自己
      subject: '🤖 TB006 机器人：未匹配提醒',
      text: `用户提问：${question}\n时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) console.error("邮件发送错误:", error);
      else console.log("通知邮件已发送");
    });

    return res.json({
      found: false,
      answer: "抱歉，我还没学到这个问题的具体答案。您可以尝试输入更简短的关键词.",
      related: [],
    });
  }

  const related = ranked.slice(1, 4).map((item) => ({
    id: item.id,
    question: item.question,
    category: item.category,
  }));

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


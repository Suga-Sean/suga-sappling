require("dotenv").config();

const path = require("path");
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// The SDK reads ANTHROPIC_API_KEY from the environment automatically.
// If no key is set, we run in "demo" mode and return a templated description
// so the app is still runnable without credentials.
const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);
const client = hasApiKey ? new Anthropic() : null;

// Default to Opus 5. To cut cost on high volume, set MODEL=claude-sonnet-5
// (see README — that's the pragmatic pick once you have paying users).
const MODEL = process.env.MODEL || "claude-opus-5";

const TONES = {
  professional: "professional and trustworthy",
  playful: "playful, fun, and casual",
  luxury: "premium, elegant, and aspirational",
  minimal: "clean, minimal, and to-the-point",
};

function buildPrompt({ productName, features, keywords, tone, audience }) {
  const toneDescription = TONES[tone] || TONES.professional;

  const lines = [
    `Write an e-commerce product description for: ${productName}`,
    ``,
    `Tone: ${toneDescription}.`,
  ];

  if (audience) lines.push(`Target customer: ${audience}.`);
  if (features) lines.push(`Key features/details to work in:\n${features}`);
  if (keywords) lines.push(`SEO keywords to include naturally: ${keywords}`);

  lines.push(
    ``,
    `Return the result as JSON only, with this exact shape:`,
    `{`,
    `  "title": "a short catchy product title (max 70 chars)",`,
    `  "description": "2-3 short paragraphs of persuasive body copy",`,
    `  "bullets": ["3 to 5 scannable selling-point bullets"],`,
    `  "metaDescription": "an SEO meta description under 155 characters"`,
    `}`,
    ``,
    `Do not invent specific claims (exact dimensions, certifications, prices)`,
    `that were not provided. Write for conversion.`,
  );

  return lines.join("\n");
}

function demoResponse({ productName, tone }) {
  return {
    title: `${productName} — Upgrade Your Everyday`,
    description:
      `Meet the ${productName}, designed to make your life simpler. ` +
      `Thoughtfully built and ready to impress, it delivers the quality your ` +
      `customers expect at a price that keeps them coming back.\n\n` +
      `(This is DEMO output — set ANTHROPIC_API_KEY to generate real ${tone} copy with AI.)`,
    bullets: [
      "Premium quality that stands out",
      "Simple, reliable, everyday use",
      "Backed by fast, friendly support",
    ],
    metaDescription: `Shop the ${productName}. Quality you can trust, delivered fast. Order yours today.`,
    _demo: true,
  };
}

app.post("/api/generate", async (req, res) => {
  const { productName } = req.body || {};

  if (!productName || !productName.trim()) {
    return res.status(400).json({ error: "productName is required" });
  }

  if (!hasApiKey) {
    return res.json(demoResponse(req.body));
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      output_config: { effort: "low" },
      system:
        "You are an expert e-commerce copywriter who writes high-converting, " +
        "SEO-friendly product descriptions. You always return valid JSON.",
      messages: [{ role: "user", content: buildPrompt(req.body) }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    let parsed;
    try {
      // Be tolerant of stray text around the JSON.
      const jsonSlice = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      parsed = JSON.parse(jsonSlice);
    } catch (e) {
      return res.status(502).json({
        error: "Model did not return valid JSON",
        raw: text,
      });
    }

    return res.json(parsed);
  } catch (err) {
    console.error("Generation failed:", err);
    return res.status(500).json({ error: "Generation failed. Check server logs." });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: hasApiKey ? "live" : "demo", model: MODEL });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  AI Product Description Generator`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → mode: ${hasApiKey ? "LIVE (" + MODEL + ")" : "DEMO (no API key set)"}\n`);
});

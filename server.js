require("dotenv").config();

const path = require("path");
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// The SDK reads ANTHROPIC_API_KEY from the environment automatically.
// If no key is set, we run in "demo" mode and return templated copy so the
// app is still runnable without credentials.
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

// The three length "personalities" we generate in one go.
const VARIANTS = [
  {
    id: "snappy",
    label: "Snappy",
    brief: "SHORT and punchy — 1 tight paragraph (2-3 sentences), scannable, grabs attention fast.",
  },
  {
    id: "balanced",
    label: "Balanced",
    brief: "MEDIUM — 2 short paragraphs, the everyday all-rounder most stores would use.",
  },
  {
    id: "indepth",
    label: "In-Depth",
    brief: "LONG and rich — 3 paragraphs, more detail and more SEO keywords woven in naturally.",
  },
];

function buildPrompt({ productName, features, keywords, tone, audience }) {
  const toneDescription = TONES[tone] || TONES.professional;

  const lines = [
    `Write THREE e-commerce product descriptions for the same product, each a different length.`,
    ``,
    `Product: ${productName}`,
    `Tone: ${toneDescription}.`,
  ];

  if (audience) lines.push(`Target customer: ${audience}.`);
  if (features) lines.push(`Key features/details to work in:\n${features}`);
  if (keywords) lines.push(`SEO keywords to include naturally: ${keywords}`);

  lines.push(
    ``,
    `The three versions:`,
    ...VARIANTS.map((v) => `- "${v.id}": ${v.brief}`),
    ``,
    `For EACH version also rate it 0-100 on four qualities, based only on the copy itself:`,
    `  seo (keyword strength), readability (easy to scan), persuasion (emotional pull),`,
    `  clarity (clear about what the product is).`,
    ``,
    `Return JSON only, exactly this shape:`,
    `{`,
    `  "variants": [`,
    `    {`,
    `      "id": "snappy",`,
    `      "title": "short catchy title, max 70 chars",`,
    `      "description": "the body copy for this length",`,
    `      "bullets": ["3 to 5 selling-point bullets"],`,
    `      "metaDescription": "SEO meta description under 155 chars",`,
    `      "scores": { "seo": 0, "readability": 0, "persuasion": 0, "clarity": 0 }`,
    `    }`,
    `    // ...one object for "balanced" and one for "indepth", same shape`,
    `  ]`,
    `}`,
    ``,
    `Do not invent specific claims (exact dimensions, certifications, prices) that were`,
    `not provided. Write for conversion.`,
  );

  return lines.join("\n");
}

function demoVariant(id, productName, tone) {
  const map = {
    snappy: {
      title: `${productName} — Everyday Upgrade`,
      description: `Meet the ${productName}: simple, reliable, and ready to impress. The easy upgrade your customers didn't know they needed.`,
      scores: { seo: 71, readability: 92, persuasion: 78, clarity: 88 },
    },
    balanced: {
      title: `${productName} — Quality You Can Trust`,
      description:
        `Meet the ${productName}, designed to make everyday life simpler. Thoughtfully built and ready to impress, it delivers the quality your customers expect.\n\n` +
        `Backed by fast, friendly support and a price that keeps them coming back.`,
      scores: { seo: 80, readability: 85, persuasion: 82, clarity: 86 },
    },
    indepth: {
      title: `${productName} — The Details That Matter`,
      description:
        `Meet the ${productName}. Every detail is considered, from the materials to the finish, so it performs the way your customers expect and looks great doing it.\n\n` +
        `Built to last and easy to love, it slots into daily life without fuss.\n\n` +
        `Refillable, dependable, and backed by support that actually answers — this is the ${productName} done right.`,
      scores: { seo: 90, readability: 76, persuasion: 84, clarity: 83 },
    },
  };
  const v = map[id];
  return {
    id,
    title: v.title,
    description:
      v.description +
      `\n\n(DEMO output — set ANTHROPIC_API_KEY for real ${tone} copy with AI.)`,
    bullets: [
      "Premium quality that stands out",
      "Simple, reliable, everyday use",
      "Backed by fast, friendly support",
    ],
    metaDescription: `Shop the ${productName}. Quality you can trust, delivered fast. Order yours today.`,
    scores: v.scores,
  };
}

function demoResponse({ productName, tone }) {
  return {
    _demo: true,
    variants: VARIANTS.map((v) => demoVariant(v.id, productName, tone)),
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
      max_tokens: 2600,
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
      const jsonSlice = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      parsed = JSON.parse(jsonSlice);
    } catch (e) {
      return res.status(502).json({
        error: "Model did not return valid JSON",
        raw: text,
      });
    }

    if (!parsed.variants || !Array.isArray(parsed.variants)) {
      return res.status(502).json({ error: "Unexpected response shape", raw: text });
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
  console.log(`\n  Product Copy Studio`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → mode: ${hasApiKey ? "LIVE (" + MODEL + ")" : "DEMO (no API key set)"}\n`);
});

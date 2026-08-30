require("dotenv").config();

const path = require("path");
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const {
  readabilityScore,
  seoScore,
  findUnsupportedClaims,
  detectSlop,
} = require("./quality");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// The SDK reads ANTHROPIC_API_KEY from the environment automatically.
// Without a key we run in "demo" mode so the app is still usable.
const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);
const client = hasApiKey ? new Anthropic() : null;

// Opus for development quality. Set MODEL=claude-sonnet-5 in .env before
// serving paying customers — see the cost table in the README.
const MODEL = process.env.MODEL || "claude-opus-5";

const TONES = {
  professional: "plain, confident, and factual — like a good catalogue",
  playful: "warm and conversational, light humour, still specific",
  luxury: "restrained and precise; understatement rather than adjectives",
  minimal: "stripped back — short declarative sentences, no filler",
};

const VARIANTS = [
  { id: "snappy", brief: "SHORT — 2-3 sentences, one paragraph. Every sentence carries a fact." },
  { id: "balanced", brief: "MEDIUM — 2 short paragraphs. The everyday default." },
  { id: "indepth", brief: "LONG — 3 paragraphs, more detail and more room for keywords." },
];

// The anti-slop rules. This is the actual product: any tool can call an AI,
// but generic AI copy is worthless to a merchant because shoppers recognise
// it instantly. These constraints are what make the output usable.
const HOUSE_RULES = `
WRITING RULES — these matter more than anything else.

Never use these openers or anything resembling them:
  "Meet the...", "Introducing...", "Say hello to...", "Look no further",
  "Not just a X, it's a Y", "In today's world", "Whether you're X or Y"

Never use these words and phrases:
  elevate, elevated, game-changer, revolutionary, seamless, effortless,
  thoughtfully crafted/designed/engineered, sleek and stylish, must-have,
  take it to the next level, perfect for anyone who, designed for those who,
  unlock, transform your, experience the difference

THE SWAP TEST — apply this to every sentence you write.
If a sentence would still make sense with a completely different product
swapped in, delete it. "Built to make life easier" works for a kettle, a
mattress and a laptop, so it is worthless. "The 750ml body holds a full day
of water without a refill" only works for one product. Write only the second
kind.

GROUND EVERY CLAIM.
Use the specifics you were given. Do not invent measurements, materials,
certifications, warranties, or capabilities that were not provided — a
merchant can be penalised for false advertising. If you were given very
little, write something SHORT and true rather than padding with adjectives.
Never write a number or a unit that did not come from the input.

Vary sentence length. Lead with the most concrete benefit, not a greeting.
`.trim();

// Supplier mode. Marketplace listings are machine-translated, keyword-stuffed
// and routinely overstate the product. Three jobs: pull out what is actually
// knowable, say what we binned, and flag the claims a merchant would be
// republishing under their own name without checking.
function buildSupplierPrompt({ supplierText, keywords, tone, audience }) {
  const toneDescription = TONES[tone] || TONES.professional;

  const lines = [
    `A merchant has imported this listing from a supplier marketplace. It is`,
    `almost certainly machine-translated, keyword-stuffed, and written to game`,
    `a marketplace search box rather than to inform a shopper.`,
    ``,
    `SUPPLIER LISTING:`,
    `"""`,
    supplierText.slice(0, 4000),
    `"""`,
    ``,
    `STEP 1 — Extract only what is genuinely knowable about the product.`,
    `  Keep: what the item is, materials, measurements, capacity, colours,`,
    `  real functional features, who it is for.`,
    `  Bin: "2024", "New", "Hot Sale", "Fashion", "High Quality", brand spam,`,
    `  repeated keywords, ALL CAPS, and anything that tells a shopper nothing.`,
    ``,
    `STEP 2 — Flag claims you would not publish without checking.`,
    `  Supplier listings routinely overstate. Anything like waterproof,`,
    `  genuine leather, 100%, medical grade, certified, unbreakable, or a`,
    `  specific performance number is the SUPPLIER's claim, not a fact. The`,
    `  merchant becomes legally responsible for it once they publish it.`,
    ``,
    `STEP 3 — Write three descriptions using ONLY the facts from step 1.`,
    `  Never repeat the supplier's phrasing — the merchant needs original text`,
    `  or search engines will treat their page as duplicate content.`,
    ``,
    `VOICE: ${toneDescription}`,
  ];

  if (audience) lines.push(`BUYER: ${audience}`);
  if (keywords) lines.push(`KEYWORDS to work in naturally: ${keywords}`);

  lines.push(
    ``,
    HOUSE_RULES,
    ``,
    `THE THREE VERSIONS:`,
    ...VARIANTS.map((v) => `  "${v.id}": ${v.brief}`),
    ``,
    `Rate each version 0-100 on persuasion and clarity only.`,
    ``,
    `Return JSON only, exactly this shape:`,
    `{`,
    `  "extracted": {`,
    `    "productType": "what this actually is, in plain words",`,
    `    "facts": ["each real fact you kept"],`,
    `    "discarded": ["each piece of noise you binned"],`,
    `    "verify": ["each supplier claim the merchant should confirm"]`,
    `  },`,
    `  "variants": [`,
    `    { "id": "snappy", "title": "...", "description": "...",`,
    `      "bullets": ["..."], "metaDescription": "...",`,
    `      "scores": { "persuasion": 0, "clarity": 0 } }`,
    `    // then "balanced", then "indepth"`,
    `  ]`,
    `}`,
  );

  return lines.join("\n");
}

function buildPrompt({ productName, features, keywords, tone, audience }) {
  const toneDescription = TONES[tone] || TONES.professional;

  const lines = [
    `Write THREE product descriptions for the same item, at three lengths.`,
    ``,
    `PRODUCT: ${productName}`,
    `VOICE: ${toneDescription}`,
  ];

  if (audience) lines.push(`BUYER: ${audience}`);
  if (features) lines.push(`FACTS YOU MAY USE (and only these):\n${features}`);
  else lines.push(`FACTS: none supplied — keep the copy short and generic-free.`);
  if (keywords) lines.push(`KEYWORDS to work in naturally: ${keywords}`);

  lines.push(
    ``,
    HOUSE_RULES,
    ``,
    `THE THREE VERSIONS:`,
    ...VARIANTS.map((v) => `  "${v.id}": ${v.brief}`),
    ``,
    `Also rate each version 0-100 on two things only:`,
    `  persuasion — does it make someone want the product?`,
    `  clarity    — is it obvious what the product is and does?`,
    `(SEO and readability are measured separately, so do not rate those.)`,
    ``,
    `Return JSON only, in exactly this shape:`,
    `{`,
    `  "variants": [`,
    `    {`,
    `      "id": "snappy",`,
    `      "title": "specific title, max 70 chars",`,
    `      "description": "the body copy",`,
    `      "bullets": ["3 to 5 concrete selling points"],`,
    `      "metaDescription": "SEO meta, aim for 120-155 characters",`,
    `      "scores": { "persuasion": 0, "clarity": 0 }`,
    `    }`,
    `    // then "balanced", then "indepth", same shape`,
    `  ]`,
    `}`,
  );

  return lines.join("\n");
}

// Attaches the computed half of the score plus any invented-claim flags.
// Called for both live and demo output so the two behave identically.
function scoreVariant(variant, input) {
  const sourceText = [input.productName, input.features, input.keywords, input.audience]
    .filter(Boolean)
    .join(" \n ");

  const generatedText = [
    variant.title,
    variant.description,
    (variant.bullets || []).join(" "),
    variant.metaDescription,
  ]
    .filter(Boolean)
    .join(" \n ");

  const readability = readabilityScore(
    [variant.description, (variant.bullets || []).join(". ")].join(" ")
  );
  const seo = seoScore({
    title: variant.title,
    description: [variant.description, (variant.bullets || []).join(" ")].join(" "),
    metaDescription: variant.metaDescription,
    keywords: input.keywords,
  });

  const judged = variant.scores || {};
  const scores = {
    seo: seo.score,
    readability,
    persuasion: clamp(judged.persuasion),
    clarity: clamp(judged.clarity),
  };

  return {
    ...variant,
    scores,
    // Which numbers are arithmetic and which are the model's opinion. Shown
    // in the UI — a score you can't explain isn't worth much.
    measured: ["seo", "readability"],
    judged: ["persuasion", "clarity"],
    seoDetail: seo.detail,
    claims: findUnsupportedClaims(sourceText, generatedText),
  };
}

function clamp(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
}

/* ── Demo mode ───────────────────────────────────────────────────────── */

function demoResponse(input) {
  const name = input.productName;
  const facts = (input.features || "").trim();
  const factLine = facts ? ` ${facts}.` : "";

  const drafts = {
    snappy: {
      title: `${name}`,
      description: `${name}.${factLine} In stock and shipping now.`,
      persuasion: 62,
      clarity: 78,
    },
    balanced: {
      title: `${name} — the details`,
      description:
        `${name}.${factLine}\n\nDEMO MODE: this is placeholder text, not AI output. ` +
        `Add ANTHROPIC_API_KEY to your .env file to generate real copy.`,
      persuasion: 65,
      clarity: 80,
    },
    indepth: {
      title: `${name} — full description`,
      description:
        `${name}.${factLine}\n\nThe live version writes three genuinely different ` +
        `drafts here, each grounded only in the facts you supply.\n\n` +
        `DEMO MODE: placeholder text. Add your API key to see real output.`,
      persuasion: 66,
      clarity: 79,
    },
  };

  const variants = VARIANTS.map((v) => {
    const d = drafts[v.id];
    return scoreVariant(
      {
        id: v.id,
        title: d.title,
        description: d.description,
        bullets: facts
          ? facts.split(/[,\n]+/).map((f) => f.trim()).filter(Boolean).slice(0, 5)
          : ["Add product details to see selling points here"],
        metaDescription: `${name}. ${facts}`.slice(0, 155),
        scores: { persuasion: d.persuasion, clarity: d.clarity },
      },
      input
    );
  });

  return { _demo: true, variants };
}

// Marketplace listing noise. Without an API key we still do a real (if blunt)
// pass over the text so demo mode demonstrates the actual idea rather than
// printing a canned paragraph.
const NOISE = [
  "hot sale", "new arrival", "free shipping", "high quality", "top quality",
  "best seller", "dropshipping", "wholesale", "factory price", "brand new",
  "fashion", "fashionable", "hot", "sale", "new", "trendy", "popular",
  "luxury", "casual", "cute", "cool", "nice", "good", "super", "best",
];

function demoSupplierResponse(input) {
  const raw = input.supplierText.trim();

  // Split on punctuation and separators marketplace titles love.
  const chunks = raw
    .split(/[,|/·•\n\r]+|\s{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);

  const discarded = [];
  const facts = [];

  for (const chunk of chunks) {
    const lower = chunk.toLowerCase();
    const isYear = /^(19|20)\d{2}$/.test(chunk.trim());
    const isNoise = isYear || NOISE.some((n) => lower === n || lower.startsWith(n + " ") || lower.endsWith(" " + n));
    if (isNoise) discarded.push(chunk);
    else facts.push(chunk);
  }

  // Strip noise embedded inside a phrase rather than separated out — a
  // marketplace title is usually one long run of it.
  const cleanedFacts = facts.map((f) => {
    let out = f.replace(/\b(19|20)\d{2}\b/g, (y) => {
      if (!discarded.includes(y)) discarded.push(y);
      return " ";
    });
    for (const n of NOISE) {
      const re = new RegExp("\\b" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi");
      if (re.test(out)) {
        if (!discarded.includes(n)) discarded.push(n);
        out = out.replace(re, " ");
      }
    }
    return out.replace(/\s+/g, " ").trim();
  }).filter((f) => f.length > 1);

  const verify = findUnsupportedClaims("", raw).map((c) => c.text);
  const productType = cleanedFacts[0] || "product";

  const factLine = cleanedFacts.slice(0, 6).join(", ");
  const drafts = {
    snappy: { title: productType, body: `${productType}. ${factLine}.`, p: 60, c: 76 },
    balanced: {
      title: productType,
      body: `${productType}. ${factLine}.\n\nDEMO MODE: this extraction is a rough keyword pass, not AI. ` +
        `Add ANTHROPIC_API_KEY to your .env for the real thing.`,
      p: 63, c: 78,
    },
    indepth: {
      title: productType,
      body: `${productType}. ${factLine}.\n\nThe live version reads the listing properly, works out what the ` +
        `product actually is, and writes original copy that will not read as duplicate content.\n\n` +
        `DEMO MODE: placeholder. Add your API key to see real output.`,
      p: 64, c: 77,
    },
  };

  const scoringInput = { ...input, productName: productType, features: cleanedFacts.join(", ") };

  return {
    _demo: true,
    extracted: {
      productType,
      facts: cleanedFacts.slice(0, 10),
      discarded: [...new Set(discarded)].slice(0, 10),
      verify,
    },
    variants: VARIANTS.map((v) => {
      const d = drafts[v.id];
      return scoreVariant(
        {
          id: v.id,
          title: d.title,
          description: d.body,
          bullets: cleanedFacts.slice(0, 4),
          metaDescription: `${productType}. ${factLine}`.slice(0, 155),
          scores: { persuasion: d.p, clarity: d.c },
        },
        scoringInput
      );
    }),
  };
}

/* ── Model plumbing ──────────────────────────────────────────────────── */

// One request, parsed. Returns null if the response wasn't usable JSON so the
// caller can decide whether to retry or give up.
async function callModel(promptText, maxTokens) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { effort: "medium" },
    system:
      "You are a working e-commerce copywriter. You write specific, grounded " +
      "product copy that never sounds machine-generated, and you never invent " +
      "facts about a product. You always return valid JSON and nothing else.",
    messages: [{ role: "user", content: promptText }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return Array.isArray(parsed.variants) ? parsed : null;
  } catch {
    return null;
  }
}

// Slop across all three drafts, merged. One bad draft is enough to regenerate,
// because the merchant sees all three.
function worstSlop(variants) {
  const all = { phrases: [], fillerCount: 0, fillerHeavy: false, isSlop: false };
  for (const v of variants || []) {
    const text = [v.title, v.description, (v.bullets || []).join(" ")]
      .filter(Boolean)
      .join(" ");
    const r = detectSlop(text);
    for (const p of r.phrases) if (!all.phrases.includes(p)) all.phrases.push(p);
    all.fillerCount = Math.max(all.fillerCount, r.fillerCount);
    all.fillerHeavy = all.fillerHeavy || r.fillerHeavy;
    all.isSlop = all.isSlop || r.isSlop;
  }
  return all;
}

/* ── Routes ──────────────────────────────────────────────────────────── */

app.post("/api/generate", async (req, res) => {
  const input = req.body || {};
  const isSupplier = input.mode === "supplier";

  if (isSupplier) {
    if (!input.supplierText || input.supplierText.trim().length < 15) {
      return res.status(400).json({
        error: "Paste the supplier's product title and description to clean up.",
      });
    }
  } else if (!input.productName || !input.productName.trim()) {
    return res.status(400).json({ error: "Enter a product name to generate copy." });
  }

  if (!hasApiKey) {
    return res.json(isSupplier ? demoSupplierResponse(input) : demoResponse(input));
  }

  try {
    const prompt = isSupplier ? buildSupplierPrompt(input) : buildPrompt(input);
    const maxTokens = isSupplier ? 3200 : 2600;

    let parsed = await callModel(prompt, maxTokens);
    if (!parsed) {
      return res.status(502).json({ error: "The model returned something we couldn't read. Try again." });
    }

    // Enforce the house rules rather than trusting them. If the copy came back
    // full of stock phrases, tell the model exactly which ones it used and ask
    // again — once. A second failure is returned anyway, flagged, rather than
    // spending the merchant's credit indefinitely.
    let slop = worstSlop(parsed.variants);
    let regenerated = false;

    if (slop.isSlop) {
      const correction =
        prompt +
        `\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED.\n` +
        `It used these banned phrases: ${slop.phrases.join(", ") || "(none)"}.\n` +
        (slop.fillerHeavy
          ? `It also leaned on empty adjectives instead of facts.\n`
          : "") +
        `Write it again. Every sentence must fail the swap test — it must be ` +
        `false or absurd if applied to a different product. Lead with a ` +
        `concrete fact, not a greeting.`;

      const second = await callModel(correction, maxTokens);
      if (second) {
        const secondSlop = worstSlop(second.variants);
        // Keep whichever draft is cleaner.
        if (!secondSlop.isSlop || secondSlop.phrases.length < slop.phrases.length) {
          parsed = second;
          slop = secondSlop;
        }
        regenerated = true;
      }
    }

    if (!Array.isArray(parsed.variants) || parsed.variants.length === 0) {
      return res.status(502).json({ error: "The model returned an unexpected shape. Try again." });
    }

    // In supplier mode the copy is checked against the *extracted* facts, not
    // the raw listing — otherwise the supplier's own exaggerations would pass
    // through unflagged. Their dubious claims are surfaced separately as
    // "verify", so the merchant sees both kinds.
    const scoringInput = isSupplier
      ? {
          ...input,
          productName: (parsed.extracted && parsed.extracted.productType) || "",
          features: [
            ...((parsed.extracted && parsed.extracted.facts) || []),
            ...((parsed.extracted && parsed.extracted.verify) || []),
          ].join(", "),
        }
      : input;

    return res.json({
      extracted: parsed.extracted || null,
      // Surfaced so the UI can be honest when a draft still isn't clean,
      // rather than quietly handing over copy we know reads as generic.
      slop: slop.isSlop ? { phrases: slop.phrases, regenerated } : null,
      variants: parsed.variants.map((v) => scoreVariant(v, scoringInput)),
    });
  } catch (err) {
    console.error("Generation failed:", err);
    return res.status(500).json({ error: "Generation failed. Check the server logs." });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: hasApiKey ? "live" : "demo", model: MODEL });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Cartwright — product copy, crafted`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → mode: ${hasApiKey ? "LIVE (" + MODEL + ")" : "DEMO (no API key set)"}\n`);
});

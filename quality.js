// quality.js — the objective half of the Listing Score.
//
// Two of the four scores are computed here with real arithmetic rather than
// asked of the model:
//
//   • Readability — Flesch Reading Ease, a standard formula from 1948.
//   • SEO         — literal checks: do the keywords actually appear, is the
//                   meta description the right length for Google, etc.
//
// Persuasion and Clarity stay with the model, because they genuinely are
// judgement calls. We label which is which in the UI so nobody is misled.
//
// This module also flags claims the copy makes that weren't in the merchant's
// input — invented specs are a real legal risk for a store owner.

/* ── Readability ─────────────────────────────────────────────────────── */

// Standard heuristic syllable counter. Not perfect on every English word,
// but consistent, which is what a comparative score needs.
function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}

function countSentences(text) {
  const parts = text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 0);
  return Math.max(parts.length, 1);
}

function countWords(text) {
  return text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
}

// Flesch Reading Ease: 206.835 − 1.015·(words/sentence) − 84.6·(syllables/word)
// Higher is easier. ~60-70 is plain English; product copy should sit high.
function readabilityScore(text) {
  const words = countWords(text);
  if (words.length < 5) return 0;
  const sentences = countSentences(text);
  const syllableTotal = words.reduce((sum, w) => sum + syllables(w), 0);

  const raw =
    206.835 -
    1.015 * (words.length / sentences) -
    84.6 * (syllableTotal / words.length);

  return Math.max(0, Math.min(100, Math.round(raw)));
}

/* ── SEO ─────────────────────────────────────────────────────────────── */

const META_MIN = 120; // shorter wastes the snippet
const META_MAX = 158; // Google truncates around here
const TITLE_MAX = 70;

function normalise(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ");
}

function splitKeywords(keywords) {
  return (keywords || "")
    .split(/[,\n;]+/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

// Points-based, so we can explain exactly why a listing scored what it did.
function seoScore({ title = "", description = "", metaDescription = "", keywords = "" }) {
  const keys = splitKeywords(keywords);
  const detail = [];
  let score = 0;

  // Structural checks apply whether or not keywords were supplied.
  const metaLen = metaDescription.length;
  if (metaLen >= META_MIN && metaLen <= META_MAX) {
    score += 15;
    detail.push({ ok: true, label: `Meta is ${metaLen} chars — fits Google's snippet` });
  } else if (metaLen > 0) {
    detail.push({
      ok: false,
      label:
        metaLen < META_MIN
          ? `Meta is ${metaLen} chars — under ${META_MIN}, wasting snippet space`
          : `Meta is ${metaLen} chars — over ${META_MAX}, Google will cut it off`,
    });
  }

  if (title.length > 0 && title.length <= TITLE_MAX) {
    score += 15;
    detail.push({ ok: true, label: `Title is ${title.length} chars — within ${TITLE_MAX}` });
  } else if (title.length > TITLE_MAX) {
    detail.push({ ok: false, label: `Title is ${title.length} chars — over ${TITLE_MAX}` });
  }

  if (keys.length === 0) {
    // Honest ceiling: without keywords we simply cannot measure the main
    // thing SEO depends on, so we say so rather than inventing a number.
    detail.push({
      ok: false,
      label: "No keywords given — add some to score the part that matters most",
    });
    return { score: Math.min(score, 40), detail, measurable: false };
  }

  const inTitle = normalise(title);
  const inBody = normalise(description);
  const inMeta = normalise(metaDescription);

  const hit = (haystack, key) => haystack.includes(key);
  const titleHits = keys.filter((k) => hit(inTitle, k));
  const bodyHits = keys.filter((k) => hit(inBody, k));
  const metaHits = keys.filter((k) => hit(inMeta, k));

  score += Math.round(25 * (titleHits.length / keys.length));
  score += Math.round(25 * (bodyHits.length / keys.length));
  score += Math.round(20 * (metaHits.length / keys.length));

  detail.push({
    ok: titleHits.length > 0,
    label: `${titleHits.length}/${keys.length} keywords in the title`,
  });
  detail.push({
    ok: bodyHits.length === keys.length,
    label: `${bodyHits.length}/${keys.length} keywords in the description`,
  });
  detail.push({
    ok: metaHits.length > 0,
    label: `${metaHits.length}/${keys.length} keywords in the meta`,
  });

  // Keyword stuffing check — repeating a term too often is penalised by
  // search engines and reads badly to humans. A phrase used once or twice is
  // never stuffing, however short the copy, so require a real repetition
  // before measuring density (and count multi-word phrases by their length).
  const bodyWords = countWords(inBody).length || 1;
  const stuffed = keys.filter((k) => {
    const occurrences = inBody.split(k).length - 1;
    if (occurrences < 3) return false;
    const keyLength = k.split(/\s+/).length;
    return (occurrences * keyLength) / bodyWords > 0.06; // >6% of the copy
  });
  if (stuffed.length > 0) {
    score -= 10;
    detail.push({ ok: false, label: `Keyword stuffing: "${stuffed[0]}" is overused` });
  }

  return { score: Math.max(0, Math.min(100, score)), detail, measurable: true };
}

/* ── Invented-claim detection ────────────────────────────────────────── */

// Words that assert a verifiable property. If the copy uses one and the
// merchant never mentioned it, that is a claim they may not be able to back.
const CLAIM_WORDS = [
  "waterproof", "water-resistant", "windproof", "shockproof", "fireproof",
  "bpa-free", "organic", "vegan", "cruelty-free", "hypoallergenic",
  "certified", "guaranteed", "warranty", "lifetime", "dishwasher-safe",
  "microwave-safe", "food-grade", "medical-grade",
  "stainless", "leak-proof", "recyclable", "biodegradable",
  "handmade", "eco-friendly", "sustainable", "patented",
  "fda", "ce-certified", "iso",
  // Marketplace listings lean hard on these, and they are exactly the claims
  // a merchant becomes liable for once they republish them.
  "genuine leather", "real leather", "solid wood", "solid gold",
  "sterling silver", "authentic", "unbreakable", "scratch-proof",
  "anti-bacterial", "antibacterial", "non-toxic", "gmo-free", "gluten-free",
];

// Numbers carrying a unit — "750ml", "24 hours", "5-year", "100%", "IP68".
// A negative lookahead rather than \b, because \b fails after a symbol unit
// like "%" (both sides are non-word characters, so no boundary exists).
const MEASUREMENT = /\b\d+(?:\.\d+)?\s?(?:ml|l|litre|liter|oz|g|kg|lb|lbs|mm|cm|m|in|inch|inches|ft|hour|hours|hr|hrs|day|days|week|weeks|month|months|year|years|%|w|watt|watts|v|volt|volts|mah|ip\d{2})(?![a-z0-9])/gi;

// Collapse punctuation and spacing so "leak-proof", "leak proof" and
// "Leak-Proof" all compare equal. Both sides must be flattened the same way
// or a hyphenated fact the merchant *did* supply gets falsely flagged.
function flatten(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function findUnsupportedClaims(sourceText, generatedText) {
  const source = flatten(sourceText);
  const generated = flatten(generatedText);
  const flags = [];
  const already = new Set();

  for (const word of CLAIM_WORDS) {
    const w = flatten(word);
    if (already.has(w)) continue;
    if (generated.includes(w) && !source.includes(w)) {
      already.add(w);
      flags.push({ type: "claim", text: word });
    }
  }

  const measurements = generatedText.match(MEASUREMENT) || [];
  const seen = new Set();
  for (const raw of measurements) {
    const m = raw.toLowerCase().replace(/\s+/g, "");
    if (seen.has(m)) continue;
    seen.add(m);
    // Compare digits-and-unit only, so "750 ml" in the input still matches
    // "750ml" in the output.
    const compact = source.replace(/\s+/g, "");
    if (!compact.includes(m)) {
      flags.push({ type: "measurement", text: raw.trim() });
    }
  }

  return flags.slice(0, 8); // keep the UI readable
}

module.exports = { readabilityScore, seoScore, findUnsupportedClaims };

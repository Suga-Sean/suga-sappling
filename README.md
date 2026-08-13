# Cartwright

**Product copy, crafted.**

Paste a product name and a few details → get three store-ready descriptions,
each with a title, body copy, selling-point bullets, an SEO meta description,
and a **Listing Score** so you can pick the best one.

*(A cartwright is a craftsman who builds carts — and "wright" sounds like
"write". Cart + maker + writer.)*

## The three versions

Every generation returns the same product written three ways:

| Version | What it is |
|---|---|
| **Snappy** | Short and punchy — one tight paragraph, built to be scanned |
| **Balanced** | The everyday all-rounder (selected by default) |
| **In-Depth** | Longer and richer, with more SEO keywords woven in |

## The Listing Score

Each version is rated 0–100 on **SEO, Readability, Persuasion, and Clarity**,
so the user can compare versions rather than guess.

> **Honest note:** right now the model scores its own output. That's a fair
> opinion about copy that exists — unlike a sales forecast, it invents nothing —
> but it's a self-assessment. Two of the four can be made objective later:
> Readability via a real formula (Flesch–Kincaid), and SEO by literally checking
> whether the supplied keywords appear in the title, body, and meta. Worth doing
> before charging money.

## Run it

```bash
npm install
cp .env.example .env      # paste your Anthropic API key into .env
npm start
```

Open http://localhost:3000

**No API key?** It still runs — DEMO mode returns templated copy so you can see
the interface. Add `ANTHROPIC_API_KEY` to `.env` for real output.

## Cost per generation

One click = one API call producing all three versions. That means roughly
**2,000 output tokens per generation**, not a few hundred — so the unit cost is
cents, not fractions of a cent:

| Model | Cost per generation | 100 generations |
|---|---|---|
| `claude-opus-5` (dev default) | ~5¢ | ~$5.00 |
| `claude-sonnet-5` | ~3¢ | ~$3.00 |
| `claude-haiku-4-5` | ~1¢ | ~$1.00 |

**Set `MODEL=claude-sonnet-5` in `.env` before charging anyone.** On Opus, a
$12/month plan with 150 credits costs ~$7.50 in API spend — the margin doesn't
survive Stripe's cut.

## Pricing plan

Researched against the Shopify App Store, Aug 2026. The market standard is a
**monthly subscription metered by credits** (1 credit ≈ 1 generation). Nobody
charges per generation — subscriptions give predictable revenue, and credits cap
the AI cost exposure per user.

| Tier | Price | Credits/mo | AI cost (Sonnet) | Gross margin |
|---|---|---|---|---|
| **Free** | $0 | 10 | ~$0.30 | the hook |
| **Starter** | **$12**/mo | 100 | ~$3.00 | ~75% |
| **Pro** | **$29**/mo | 400 + bulk | ~$12.00 | ~59% |

### Why these numbers

The market splits into a **budget cluster ($5–15)** and a **premium cluster
($39+)**, where the premium tier is justified by bulk processing:

| Competitor | Price |
|---|---|
| HumanizeGPT | from $5/mo |
| AiGen | $4.99 / $9.99 / $14.99 |
| ChatGPT‑AI Product Description | $14.90 / $49 / $199 |
| Avada AI Product Description | from $39/mo |
| Descrii | $39/mo unlimited |

Free tiers are universal and range from 10–50 credits/month.

**$12 enters the budget cluster** — where an unknown app with no reviews can
realistically win — while **Pro at $29 undercuts Avada's $39** for the bulk
users who are the actual profit centre.

### ⚠️ The pricing ceiling

**Shopify Magic is bundled free with every Shopify plan**, and it generates
product descriptions. Every prospective customer already has a free option
built into their admin.

So Cartwright is not selling "AI writes descriptions" — that's a commodity at
$0. It sells what Magic doesn't do: three scored versions to choose from, and
whichever wedge gets built next. Price and positioning both have to reflect
that.

### Billing implementation

Chosen: **Stripe** (keeps ~97% vs. Shopify's cut; direct customer relationship).

For v1, skip building accounts — use **Stripe Payment Links** (hosted checkout,
zero code) and issue paying customers a **licence key** they paste into the app.
Crude, but it ships in hours instead of weeks and is fine for the first ~50
customers. Build real accounts once people are actually paying.

Prerequisites before this can be wired up: a verified Stripe account (needs
ID, a bank account, 18+ in most countries) and a live URL for Stripe to
redirect back to.

## What's here

- `server.js` — Express server and the `/api/generate` endpoint (the product)
- `public/index.html` — the interface, self-contained
- `.env.example` — config template

## Design

Dark-first, warm charcoal ground. Each colour has a job:

- **Coral** — actions (generate button, active tabs, focus)
- **Gold** — quality (the Listing Score, status pill)
- **Light grey** — everything else, kept deliberately quiet

A light theme ships alongside it and keeps the same identity.

## Competitive reality (read before building more)

This space is **crowded**, and that shapes what's worth building:

- [DropCopy](https://www.getdropcopy.com/) — same product, plus bulk CSV and multi-language
- [SmartCopy](https://apps.shopify.com/smartcopy) — already on the Shopify App Store
- [Copy.ai](https://www.copy.ai/tools/product-description-generator) — free

"AI writes product descriptions" is a feature now, not a product — and one
version of it is free. The wedge has to be sharper. Candidates:

1. **Supplier-junk rewriter** — paste a machine-translated AliExpress/CJ
   description, get clean store copy. Nobody appears to lead with this, and
   dropshippers do it by hand for every product.
2. **Bulk** — the #1 request, and weakly served by most Shopify apps.
3. **Listing Score** — none of the competitors have it.

## Next steps

1. Deploy to a server so it's reachable at a real URL
2. Pick and build the wedge (see above)
3. Wrap as a Shopify app — the App Store is the distribution, which is the
   genuinely hard part
4. Add billing (Shopify handles subscriptions for apps)

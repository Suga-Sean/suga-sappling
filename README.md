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

## Cost

One generation = one API call producing all three versions. Default model is
`claude-opus-5`. For high volume set `MODEL=claude-sonnet-5` in `.env` —
cheaper, still excellent for this task.

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

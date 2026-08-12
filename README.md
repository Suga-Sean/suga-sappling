# AI Product Description Generator

Paste a product name and a few details → get store-ready, SEO-friendly copy
(title, body, bullet points, and a meta description).

This is the **sellable core** of a Shopify/WooCommerce app. On its own it's a
useful standalone tool; the same `/api/generate` endpoint is what you'd wire
into a Shopify embedded app later so merchants can generate descriptions
without leaving their store admin.

## Why this is a business, not just a script

Dropshippers and small stores hate writing product descriptions — it's
repetitive and every listing needs one. You sell them the shovel: a tool that
turns "insulated water bottle, 750ml, keeps drinks cold 24h" into polished
copy in seconds. Charge a monthly subscription. The hard part isn't the code
(it's here) — it's distribution, which is why building this as a **Shopify App
Store app** is the smart next step: the store gives you the customers.

## Run it

```bash
npm install
cp .env.example .env      # then paste your Anthropic API key into .env
npm start
```

Open http://localhost:3000

**No API key?** It still runs — in DEMO mode it returns templated copy so you
can see the UI. Add `ANTHROPIC_API_KEY` to `.env` for real AI output.

## Cost

Every generation is one short API call (~1500 output tokens max). Default model
is `claude-opus-5`. For high volume, set `MODEL=claude-sonnet-5` in `.env` —
cheaper, still excellent for this task. That's the pragmatic pick once you have
paying users.

## What's here

- `server.js` — Express server + the `/api/generate` endpoint (the product)
- `public/index.html` — self-contained frontend
- `.env.example` — config template

## Turning this into a real business (next steps)

1. **Wrap it as a Shopify app** using Shopify's App Bridge + OAuth so it runs
   inside store admin. The AI logic here doesn't change.
2. **Add accounts + billing** (Shopify handles subscription billing for apps).
3. **Add a "write directly to my product" button** using Shopify's Admin API —
   that's the feature merchants actually pay for.
4. **Get your first reviews** on the App Store. Distribution > code.

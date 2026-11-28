# Read this first

Two AI agents work on this repo: Claude and Grokbot. Justin is the owner and makes the final calls.

Before you start any work, read [docs/HANDOFF.md](docs/HANDOFF.md). When you finish a piece of work, add an entry at the top of its log.

## Rules for both agents

- Work on a branch and open a pull request. Never push to `main`.
- **Only merge after Justin says go.** He checks the Netlify preview first. No auto-merging, ever.
- Check `docs/HANDOFF.md` and the open pull requests before you start, so two agents never change the same files at once. If the other agent has an open PR on a file, leave that file alone or say so in the log.
- No secrets in the repo. Keys live in Netlify environment variables only.
- Netlify previews use Stripe test mode, but Printful may be live. Don't place test orders that could reach Printful.
- Copy on the site: calm, plain, no exclamation marks, no em dashes. Normal shop words (Shop, Buy now).
- Legibility: no text under 13px, never fade text with opacity, all text passes WCAG AA.
- Tees are AU$59 with free shipping. Don't change prices in `products.json` unless Justin asks.

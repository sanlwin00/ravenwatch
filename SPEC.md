# OSINT Platform — Technical Specification

## Overview
China–Myanmar Mediation Intelligence Platform.
Web app for 2 analysts. ~10 sources, ~30 articles/day, 30-day retention.

---

## Recommended Tech Stack

### Backend
| Component      | Choice                                                      |
|----------------|-------------------------------------------------------------|
| Language       | Python 3.11+                                                |
| Framework      | FastAPI                                                     |
| Scraping       | Firecrawl API (primary) + requests/BeautifulSoup (fallback) |
| Scheduler      | APScheduler (in-process)                                    |
| Task trigger   | FastAPI endpoint (manual run)                               |
| Translation    | DeepL API (free tier)                                       |
| NLP / Tagging  | OpenAI GPT-4o-mini                                          |
| Export         | pandas (CSV), WeasyPrint (PDF)                              |

### Database
| Component  | Choice                  |
|------------|-------------------------|
| Primary DB | PostgreSQL via Supabase |
| Tier       | Free tier               |

### Frontend
| Component     | Choice                    |
|---------------|---------------------------|
| Framework     | Next.js (React)           |
| Styling       | Tailwind CSS              |
| Charts/tables | Recharts + TanStack Table |
| PWA support   | next-pwa                  |

### Notifications
| Channel  | Method                  |
|----------|-------------------------|
| Telegram | Telegram Bot API (free) |
| Browser  | Web Push API (free)     |

### Hosting
| Component  | Choice                       | Cost        |
|------------|------------------------------|-------------|
| Server     | DigitalOcean Droplet (Basic) | $6/mo       |
| Database   | Supabase free tier           | $0/mo       |
| Scraping   | Firecrawl free tier          | $0/mo       |
| APIs       | DeepL free + GPT-4o-mini     | ~$8/mo      |
| **Total**  |                              | **~$14/mo** |

---

## Data Model

### sources
- id, name, url, language, type (official/yunnan/myanmar/thinktank), active, last_scraped_at

### articles
- id, source_id, title, url, published_at
- raw_text_en, raw_text_original, language_original
- scraped_at, expires_at
- is_early_signal (bool — Yunnan sources)
- is_policy_signal (bool — think tank sources)

### entities
- id, name, name_zh, aliases[], type (person/org/group), tier (1/2), notes, created_by

### article_entities
- article_id, entity_id, matched_alias

### article_topics
- article_id, topic (ceasefire/mediation/border_security/election/bri)

### narrative_metrics
- id, term, term_zh, date, frequency

### users
- id, email, telegram_chat_id, push_subscription

### alert_log
- id, article_id, priority (critical/high/standard), sent_at, channel

---

## API Endpoints (high-level)

### Articles
- GET /articles — list with filters (entity, source, topic, date range)
- GET /articles/:id — article detail
- POST /scrape — manual trigger

### Entities
- GET /entities
- POST /entities
- PUT /entities/:id
- DELETE /entities/:id

### Narrative
- GET /narrative/trends — term frequency over time

### Export
- GET /export/csv
- GET /export/pdf

### Auth
- POST /auth/login
- POST /auth/logout

---

## Scraper Architecture

```
Scheduler (24h) or Manual Trigger
  → For each source:
      1. Try Firecrawl API → returns clean markdown
      2. On failure → fallback to requests + BeautifulSoup
      3. Store raw_text_original
      4. Send to DeepL → store raw_text_en
      5. Send to GPT-4o-mini → extract entities + topics
      6. Match against watchlist → create article_entities records
      7. Evaluate alert rules → send Telegram + push if triggered
      8. Set expires_at = now + 30 days
```

---

## Build Plan (4 weeks)

| Week | Focus |
|------|-------|
| 1    | Scraper pipeline: Firecrawl + BS fallback + DeepL translation + DB schema |
| 2    | NLP: entity tagging (GPT-4o-mini) + watchlist matching + alert rules |
| 3    | Frontend: dashboard + search + filters + Telegram + push notifications |
| 4    | Narrative trends chart + CSV/PDF export + manual trigger UI + auth + polish |

---

## Settings

### Data Model Addition

#### platform_settings
- id, key, value, updated_by, updated_at
- Keys: `retention_days` (default: 30), `scraper_frequency_hours` (default: 24)

### API Endpoints Addition
- GET /settings
- PUT /settings — update one or more keys

### Scraper Architecture Note
APScheduler job interval is loaded from `platform_settings.scraper_frequency_hours` at startup.
On settings update, the existing job is rescheduled dynamically — no restart required.

Retention cleanup runs daily: `DELETE FROM articles WHERE expires_at < NOW()`.
`expires_at` is set at ingest time as `scraped_at + retention_days`.
Changing retention only affects new articles, not existing ones.

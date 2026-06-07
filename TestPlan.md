# RavenWatch Phase 1 — Test Plan

## Scope

Phase 1 covers the manual-trigger MVP: authentication, article feed, scraping, entity management, settings, and CSV export. Automated scraping and Telegram/push alerts are Phase 2 and out of scope here.

## Test Stack

- **Playwright** (TypeScript) — end-to-end UI tests against `localhost:3000` (frontend) + `localhost:8000` (backend)
- Tests run against a live backend with seeded test data (analyst1@ravenwatch.local / changeme123)
- All tests are isolated — each test starts from a known state (logged in or logged out)

---

## Test Suites

### TS-01 Authentication

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| AUTH-01 | Login with valid credentials | Navigate to /login, enter analyst1@ravenwatch.local / changeme123, submit | Redirect to /, JWT stored in localStorage (rw_token) |
| AUTH-02 | Login with invalid password | Enter valid email + wrong password, submit | Error message shown, stays on /login |
| AUTH-03 | Login with empty fields | Submit empty form | Form validation prevents submit or error shown |
| AUTH-04 | Logout | Login, click logout in NavBar | Redirect to /login, rw_token removed from localStorage |
| AUTH-05 | Protected route redirect | Navigate to / without being logged in | Redirect to /login |
| AUTH-06 | Protected route redirect (entities) | Navigate to /entities without token | Redirect to /login |
| AUTH-07 | Protected route redirect (settings) | Navigate to /settings without token | Redirect to /login |
| AUTH-08 | Session persistence | Login, reload page | Stays on dashboard, not redirected to /login |

---

### TS-02 Dashboard — Article Feed

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| FEED-01 | Dashboard loads articles | Login, navigate to / | Article cards visible, count > 0 |
| FEED-02 | Article card renders correctly | View any article card | Shows title (or "Untitled"), source name, scraped date |
| FEED-03 | Early Signal badge | View article from Yunnan source | Red "Early Signal" badge visible |
| FEED-04 | Policy Signal badge | View article from think tank source | Amber "Policy Signal" badge visible |
| FEED-05 | Load more pagination | Scroll to bottom, click Load More | Additional articles appended (not replaced) |
| FEED-06 | Load More hidden when exhausted | When all articles loaded | Load More button not visible |

---

### TS-03 Dashboard — Filters

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| FILTER-01 | Filter by source | Select a source from dropdown | Only articles from that source shown |
| FILTER-02 | Filter by entity | Select an entity from dropdown | Only articles tagged with that entity shown |
| FILTER-03 | Filter by topic | Select a topic | Only articles with that topic shown |
| FILTER-04 | Filter by date range (from) | Set from_date | Only articles after that date shown |
| FILTER-05 | Filter by date range (to) | Set to_date | Only articles before that date shown |
| FILTER-06 | Text search | Type in search box, click Search | Articles filtered by keyword in title/body |
| FILTER-07 | Clear filter resets results | Apply filter, then reset to "All" | Full unfiltered list returns |
| FILTER-08 | Combined filters | Set source + topic + date | Results satisfy all conditions |

---

### TS-04 Manual Scrape

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| SCRAPE-01 | Run Scrape button visible | Login, view dashboard | "Run Scrape" button visible |
| SCRAPE-02 | Scrape starts | Click Run Scrape | Button shows loading/disabled state, banner says "Scraping sources" |
| SCRAPE-03 | Articles appear after scrape | Wait for scrape to complete | New articles visible in feed (poll completes) |
| SCRAPE-04 | Scrape banner dismisses | Click × on success banner | Banner disappears |

---

### TS-05 Article Detail

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| DETAIL-01 | Click article opens detail | Click any article card | Navigates to /articles/[id] |
| DETAIL-02 | Detail shows metadata | View article detail page | Title, source, scraped date visible |
| DETAIL-03 | Detail shows translated text | Article has raw_text_en | English text block visible |
| DETAIL-04 | Entity tags shown | Article tagged with entities | Entity badges visible |
| DETAIL-05 | Topic tags shown | Article tagged with topics | Topic badges visible |
| DETAIL-06 | External link works | Click "View Source" link | Opens original URL in new tab |
| DETAIL-07 | Back navigation | Click browser back | Returns to dashboard with filters intact |

---

### TS-06 Entity Management

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| ENTITY-01 | Entity list loads | Navigate to /entities | Table with seeded entities visible |
| ENTITY-02 | Tier 1 entities present | View entity list | Deng Xijun, Wang Yi, Liu Zhongyi, Min Aung Hlaing present |
| ENTITY-03 | Entity tiers labeled | View entity list | Tier 1 (blue badge) and Tier 2 (gray badge) visible |
| ENTITY-04 | Add new entity | Click Add Entity, fill form (name, name_zh, type, tier), save | New entity appears in list |
| ENTITY-05 | Add entity with aliases | Fill aliases field with comma-separated values, save | Entity saved with aliases |
| ENTITY-06 | Edit existing entity | Click entity row, modify name, save | Updated name reflected in list |
| ENTITY-07 | Delete entity | Click entity row, click Delete, confirm | Entity removed from list |
| ENTITY-08 | Validation — required fields | Submit add form with empty name | Error shown, form not submitted |

---

### TS-07 Settings

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| SETTINGS-01 | Settings page loads | Navigate to /settings | Retention days and scraper frequency fields visible |
| SETTINGS-02 | Current values loaded | View settings | Inputs show current DB values (default: 30 days, 24 hours) |
| SETTINGS-03 | Save retention days | Change retention to 60, click Save | Success toast shown |
| SETTINGS-04 | Retention value persists | Save 60 days, reload page | Field shows 60 |
| SETTINGS-05 | Save scraper frequency | Change frequency to 12, click Save | Success toast shown |
| SETTINGS-06 | Frequency value persists | Save 12 hours, reload page | Field shows 12 |
| SETTINGS-07 | Min retention validation | Enter 6 (below min 7), try to save | HTML5 validation or error prevents save |
| SETTINGS-08 | Max retention validation | Enter 366 (above max 365), try to save | HTML5 validation or error prevents save |

---

### TS-08 CSV Export

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| EXPORT-01 | Export all articles | Click Export CSV with no filters | CSV file downloaded |
| EXPORT-02 | CSV has correct columns | Open downloaded CSV | Headers: title, source_name, published_at, url, entities, topics, summary_en |
| EXPORT-03 | Export with source filter | Filter by source, then Export CSV | CSV contains only articles from that source |
| EXPORT-04 | Export with entity filter | Filter by entity, Export CSV | CSV contains only articles matching that entity |
| EXPORT-05 | Export with date range | Set date range, Export CSV | CSV respects date bounds |

---

### TS-09 Navigation

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| NAV-01 | NavBar visible on all pages | Visit /, /entities, /settings | RavenWatch logo + nav links visible |
| NAV-02 | Active tab highlighted | Visit each page | Correct nav link highlighted |
| NAV-03 | Logo link goes to dashboard | Click RavenWatch logo | Navigates to / |

---

## Test Data Requirements

- Backend running at `localhost:8000` with `.env` configured
- Supabase DB seeded: users (analyst1/analyst2), 16 entities, 15 sources
- At least one scrape completed (articles in DB for filter/detail tests)
- Playwright base URL: `http://localhost:3000`

## Setup & Fixtures

```
fixtures/
  auth.ts          # storageState with analyst1 logged in
  seedArticle.ts   # API call to ensure at least 1 article exists
```

## Test Run Order

1. AUTH suite first (establishes login state)
2. FEED, FILTER, SCRAPE (require articles)
3. DETAIL (requires at least 1 article)
4. ENTITY (independent)
5. SETTINGS (independent)
6. EXPORT (requires articles)
7. NAV (independent)

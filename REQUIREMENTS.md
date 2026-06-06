# OSINT Platform — Requirements & Business Rules

## Platform Purpose
China–Myanmar Mediation Intelligence Platform.
Monitors official Chinese sources, Myanmar conflict reporting, and actor activity
to provide near-real-time visibility into Chinese mediation efforts, policy signals,
and emerging developments from Beijing and Yunnan.

---

## Entity Watchlist

### Tier 1 — Direct Myanmar Mediation Actors (People)

| Name | Chinese | Position | Why Track |
|------|---------|----------|-----------|
| Deng Xijun | 邓锡军 | China's Special Envoy for Asian Affairs / Myanmar | Primary mediator; ceasefire talks, border negotiations |
| Wang Yi | 王毅 | Chinese Foreign Minister | Sets overall China policy on Myanmar |
| Liu Zhongyi | 刘忠义 | Cross-border security official | Scam-center crackdowns, border stabilization |
| Yunnan Provincial Leaders | — | Party Secretary, Governor, Foreign Affairs Office | Myanmar policy operationalized through Yunnan |

### Tier 2 — Organizations

| Name | Chinese | Type |
|------|---------|------|
| Ministry of Foreign Affairs | 外交部 | Chinese government |
| Chinese Embassy Yangon | 中国驻缅甸大使馆 | Chinese government |
| Yunnan Foreign Affairs Office | 云南省外事办公室 | Provincial government |
| International Dept of CCP | 中联部 | CCP organ |
| Ministry of Public Security | 公安部 | Chinese government |
| NDRC | 国家发展和改革委员会 | BRI projects |
| SAC | — | Myanmar military junta |
| MNDAA | 果敢同盟军 | Myanmar EAO |
| UWSA | 佤邦联合军 | Myanmar EAO |
| KIA | — | Myanmar EAO |
| TNLA | — | Myanmar EAO |
| NDAA Mongla | — | Myanmar EAO |

---

## Sources

### Chinese Official (High Priority)
| Source | URL | Language |
|--------|-----|----------|
| MFA China | https://www.fmprc.gov.cn | Chinese + English |
| Chinese Embassy Yangon | http://mm.china-embassy.gov.cn | Chinese |
| Xinhua | — | Chinese + English |
| People's Daily | 人民网 | Chinese |
| Global Times | 环球时报 | Chinese + English |

### Yunnan (High Priority — early signals)
| Source | Language |
|--------|----------|
| Yunnan Daily (云南日报) | Chinese |
| Yunnan.cn (云南网) | Chinese |
| Kunming Daily (昆明日报) | Chinese |

### Myanmar (English)
| Source |
|--------|
| Irrawaddy |
| Myanmar Now |
| Mizzima |

### Think Tanks (Policy signals)
| Source |
|--------|
| Chinese Academy of Social Sciences (CASS) |
| CICIR |
| China Institute of International Studies (CIIS) |
| Yunnan University Myanmar Studies Center |

---

## Intelligence Collection Topics & Keywords

### A. Peace Mediation
```
缅甸和平进程
缅北停火
和平谈判
政治对话
民族地方武装
```

### B. Border Stability
```
边境稳定
边境安全
跨境犯罪
电信诈骗
```

### C. Armed Groups
Monitor mentions of: MNDAA, UWSA, KIA, TNLA, NDAA Mongla
```
果敢
佤邦
掸邦
缅北武装
```

### D. Economic Corridor
```
中缅经济走廊
CMEC
皎漂
油气管道
```

### E. Yunnan-Specific Keywords
```
中缅边境
缅北
电诈
停火
稳定局势
```

---

## Alert Rules & Priority Tiers

### Critical Alert (immediate)
- Chinese delegation arrives Lashio
- Deng Xijun meets MNDAA/UWSA/KIA leadership

### High Priority Alert
- China MFA mentions "peace process" AND "Myanmar" in same statement
- Deng Xijun makes public statement or travel
- Yunnan Daily publishes border security article

### Standard Alert
- New article published matching any watchlist entity or keyword
- New article from any monitored source

---

## Narrative Tracking
Track frequency of terms over time to detect shifts in Chinese messaging:

| Term | Meaning |
|------|---------|
| 和平 | peace |
| 稳定 | stability |
| 停火 | ceasefire |
| 选举 | elections |
| 主权 | sovereignty |

---

## NLP Auto-Tagging Rules

### People tags
- Deng Xijun / 邓锡军 (and aliases)
- Wang Yi / 王毅
- Min Aung Hlaing
- EAO leaders by name

### Organization tags
- MFA / SAC / MNDAA / UWSA / KIA / TNLA

### Topic tags
- Ceasefire, Mediation, Border Security, Election, BRI

### Rules
- Tag on Chinese name OR English name OR known alias
- One article can have multiple entity and topic tags
- Yunnan-source articles automatically flagged as "early signal"

---

## User Stories

As an analyst, I want to see today's new articles on login
  so I can quickly catch up without searching.

As an analyst, I want to search articles by entity name (English or Chinese)
  so I can pull everything related to a specific actor.

As an analyst, I want to filter articles by source, entity, topic, and date range
  so I can narrow down to relevant time windows.

As an analyst, I want Critical alerts delivered immediately via Telegram
  so I don't miss high-stakes developments.

As an analyst, I want to see a narrative trend chart for key Chinese terms
  so I can detect shifts in Beijing's messaging posture.

As an analyst, I want to add/edit entities with Chinese and English aliases
  so the system catches name variations across sources.

As an analyst, I want to export filtered results as CSV or PDF
  so I can share findings outside the platform.

As an analyst, I want to manually trigger a scrape
  so I can fetch fresh content without waiting for the 24h cycle.

---

## User Flows

### Daily Review
Login
→ Dashboard (new articles since last visit, sorted by date)
→ Filter by entity or topic if needed
→ Click article → summary + translated text + link to original source

### Entity Deep Dive
Search → type entity name (English or Chinese)
→ Filtered article list
→ Read articles → export results as CSV or PDF

### Alert Flow
Scrape completes → articles tagged → alert rules evaluated
→ Critical/High: Telegram message + push notification sent
→ User taps → opens article in web app

### Entity Management
Settings → Entities
→ Add entity: name + Chinese name + aliases + type + tier
→ Save → auto-tags future articles
→ Edit or delete existing entities

### Manual Scrape
Dashboard → "Run scrape now"
→ Progress indicator
→ New articles in feed + notifications sent

### Narrative Tracking
Dashboard → Narrative Trends tab
→ Line chart: term frequency over time (last 30 days)
→ Spike detection highlights unusual surges

---

## Business Rules

1. Articles expire after 30 days and are deleted from the database
2. Only extracted text + metadata + URL stored — no raw HTML
3. Translation to English happens at ingest time (DeepL); original text also stored
4. Scraper runs every 24 hours automatically; can also be triggered manually
5. Alert priority tiers determine delivery channel (Critical = immediate Telegram; Standard = daily digest)
6. Entity matching uses name AND all registered aliases (Chinese + English)
7. Yunnan-source articles are flagged as "early signal" regardless of entity match
8. Think tank articles tagged as "policy signal"
9. Two users only; no self-registration; accounts created by admin
10. Search operates on English text only; entity matching operates on both languages

---

## Settings Page

Users can configure platform behaviour without code changes.

### Configurable Settings
| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| Article retention (days) | 30 | 7–365 | How long articles are kept before deletion |
| Scraper frequency (hours) | 24 | 1–168 | How often automatic scraping runs |

### Business Rules (Settings)
11. Retention period change applies to future expiry only — existing articles are not retroactively deleted
12. Scraper frequency change takes effect on the next scheduled run
13. Minimum scraper frequency is 1 hour (to avoid hammering sources)
14. Settings are global — both users share the same configuration
15. Only authenticated users can modify settings

### User Story
As an analyst, I want to adjust article retention and scrape frequency from a settings page
  so I can tune the platform without touching code.

### User Flow — Settings
Settings → General
→ Retention Days: [input] → Save
→ Scraper Frequency: every [X] hours → Save
→ Changes confirmed with success message
→ Next scrape cycle picks up new frequency

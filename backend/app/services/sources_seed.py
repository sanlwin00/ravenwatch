"""
Seed the initial RavenWatch sources into the database.
Safe to call multiple times — skips any source whose URL already exists.

URLs point to article listing pages (not homepages) where possible,
so the multi-level scraper can extract individual article links.
"""
from __future__ import annotations

import logging
from supabase import Client

logger = logging.getLogger(__name__)

SOURCES: list[dict] = [
    # --- Official Chinese government sources ---
    {
        "name": "MFA China",
        "url": "https://www.fmprc.gov.cn/eng/zxxx_662805/",
        "language": "zh",
        "type": "official",
    },
    {
        "name": "Chinese Embassy Yangon",
        "url": "http://mm.china-embassy.gov.cn/eng/",
        "language": "zh",
        "type": "official",
    },
    {
        "name": "Xinhua",
        "url": "https://english.news.cn/",
        "language": "en",
        "type": "official",
    },
    {
        "name": "People's Daily",
        "url": "http://en.people.cn/",
        "language": "en",
        "type": "official",
    },
    {
        "name": "Global Times",
        "url": "https://www.globaltimes.cn/world/",
        "language": "en",
        "type": "official",
    },
    # --- Yunnan regional sources (early signal) ---
    {
        "name": "Yunnan Daily",
        "url": "https://www.yndaily.com/",
        "language": "zh",
        "type": "yunnan",
    },
    {
        "name": "Yunnan.cn",
        "url": "https://www.yunnan.cn/system/newsList.shtml?cid=17",
        "language": "zh",
        "type": "yunnan",
    },
    {
        "name": "Kunming Daily",
        "url": "https://www.kunmingdaily.com/",
        "language": "zh",
        "type": "yunnan",
    },
    # --- Myanmar independent media ---
    {
        "name": "Irrawaddy",
        "url": "https://www.irrawaddy.com/news",
        "language": "en",
        "type": "myanmar",
    },
    {
        "name": "Myanmar Now",
        "url": "https://myanmar-now.org/en/news/",
        "language": "en",
        "type": "myanmar",
    },
    {
        "name": "Mizzima",
        "url": "https://eng.mizzima.com/category/news/myanmar_news",
        "language": "en",
        "type": "myanmar",
    },
    # --- Think tanks — policy signal sources ---
    {
        "name": "CASS",
        "url": "https://www.cass.cn/",
        "language": "zh",
        "type": "thinktank",
    },
    {
        "name": "CICIR",
        "url": "https://www.cicir.ac.cn/NEW/news.html",
        "language": "zh",
        "type": "thinktank",
    },
    {
        "name": "China Institute of International Studies",
        "url": "https://www.ciis.org.cn/xwzx/xwdt/",
        "language": "zh",
        "type": "thinktank",
    },
    {
        "name": "Yunnan University Myanmar Studies Center",
        "url": "https://msrc.ynu.edu.cn/",
        "language": "zh",
        "type": "thinktank",
    },
]


def seed_sources(db: Client) -> dict:
    """
    Upsert sources by name:
    - If a source with the same name exists, update its URL (and other fields) in case
      the listing-page URL changed.
    - If no source with that name exists at all, insert it.

    Returns a summary dict with counts.
    """
    inserted = 0
    updated = 0
    skipped = 0

    for source in SOURCES:
        try:
            # First check by exact URL — already up to date
            by_url = (
                db.table("sources")
                .select("id")
                .eq("url", source["url"])
                .execute()
            )
            if by_url.data:
                logger.debug("Source already up to date, skipping: %s", source["url"])
                skipped += 1
                continue

            # Check by name — exists but URL may need updating
            by_name = (
                db.table("sources")
                .select("id", "url")
                .eq("name", source["name"])
                .execute()
            )
            if by_name.data:
                existing_id = by_name.data[0]["id"]
                old_url = by_name.data[0].get("url", "")
                db.table("sources").update({
                    "url": source["url"],
                    "language": source["language"],
                    "type": source["type"],
                }).eq("id", existing_id).execute()
                logger.info(
                    "Updated source URL for %s: %s -> %s",
                    source["name"], old_url, source["url"]
                )
                updated += 1
                continue

            # New source — insert
            db.table("sources").insert(source).execute()
            logger.info("Seeded source: %s", source["name"])
            inserted += 1
        except Exception as exc:
            logger.error("Failed to seed source %s: %s", source["name"], exc)
            skipped += 1

    return {
        "total": len(SOURCES),
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
    }

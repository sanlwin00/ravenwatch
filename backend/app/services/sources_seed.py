"""
Seed the 10 initial RavenWatch sources into the database.
Safe to call multiple times — skips any source whose URL already exists.
"""
from __future__ import annotations

import logging
from supabase import Client

logger = logging.getLogger(__name__)

SOURCES: list[dict] = [
    {
        "name": "MFA China",
        "url": "https://www.fmprc.gov.cn/eng/",
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
        "url": "http://www.xinhuanet.com/english/",
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
        "url": "https://www.globaltimes.cn/",
        "language": "en",
        "type": "official",
    },
    {
        "name": "Yunnan Daily",
        "url": "https://www.yndaily.com/",
        "language": "zh",
        "type": "yunnan",
    },
    {
        "name": "Yunnan.cn",
        "url": "https://www.yunnan.cn/",
        "language": "zh",
        "type": "yunnan",
    },
    {
        "name": "Kunming Daily",
        "url": "https://www.kunmingdaily.com/",
        "language": "zh",
        "type": "yunnan",
    },
    {
        "name": "Irrawaddy",
        "url": "https://www.irrawaddy.com/",
        "language": "en",
        "type": "myanmar",
    },
    {
        "name": "Myanmar Now",
        "url": "https://myanmar-now.org/en/",
        "language": "en",
        "type": "myanmar",
    },
    {
        "name": "Mizzima",
        "url": "https://mizzima.com/",
        "language": "en",
        "type": "myanmar",
    },
    # Think tanks — policy signal sources
    {
        "name": "CASS",
        "url": "https://www.cass.cn/",
        "language": "zh",
        "type": "thinktank",
    },
    {
        "name": "CICIR",
        "url": "https://www.cicir.ac.cn/",
        "language": "zh",
        "type": "thinktank",
    },
    {
        "name": "China Institute of International Studies",
        "url": "https://www.ciis.org.cn/",
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
    Insert sources that don't already exist (matched by URL).
    Returns a summary dict with counts.
    """
    inserted = 0
    skipped = 0

    for source in SOURCES:
        try:
            existing = (
                db.table("sources")
                .select("id")
                .eq("url", source["url"])
                .execute()
            )
            if existing.data:
                logger.debug("Source already exists, skipping: %s", source["url"])
                skipped += 1
                continue

            db.table("sources").insert(source).execute()
            logger.info("Seeded source: %s", source["name"])
            inserted += 1
        except Exception as exc:
            logger.error("Failed to seed source %s: %s", source["name"], exc)
            skipped += 1

    return {
        "total": len(SOURCES),
        "inserted": inserted,
        "skipped": skipped,
    }

from supabase import Client

ENTITIES = [
    # Tier 1 People
    {
        "name": "Deng Xijun",
        "name_zh": "邓锡军",
        "aliases": ["Deng Xi-jun", "邓特使"],
        "type": "person",
        "tier": 1,
        "notes": "China's Special Envoy for Asian Affairs / Myanmar. Primary mediator.",
    },
    {
        "name": "Wang Yi",
        "name_zh": "王毅",
        "aliases": ["Wang Yi"],
        "type": "person",
        "tier": 1,
        "notes": "Chinese Foreign Minister. Sets overall China policy toward Myanmar.",
    },
    {
        "name": "Liu Zhongyi",
        "name_zh": "刘忠义",
        "aliases": [],
        "type": "person",
        "tier": 1,
        "notes": "Chinese security official. Cross-border security, scam-center crackdowns.",
    },
    {
        "name": "Min Aung Hlaing",
        "name_zh": "敏昂莱",
        "aliases": ["Min Aung Hlaing"],
        "type": "person",
        "tier": 1,
        "notes": "SAC commander-in-chief.",
    },
    # Tier 2 Organizations
    {
        "name": "Ministry of Foreign Affairs",
        "name_zh": "外交部",
        "aliases": ["MFA", "MFA China", "中国外交部"],
        "type": "org",
        "tier": 2,
    },
    {
        "name": "Chinese Embassy Yangon",
        "name_zh": "中国驻缅甸大使馆",
        "aliases": ["Chinese Embassy Myanmar"],
        "type": "org",
        "tier": 2,
    },
    {
        "name": "Yunnan Foreign Affairs Office",
        "name_zh": "云南省外事办公室",
        "aliases": ["Yunnan FAO"],
        "type": "org",
        "tier": 2,
    },
    {
        "name": "SAC",
        "name_zh": "缅甸国家管理委员会",
        "aliases": ["State Administration Council", "Myanmar military junta"],
        "type": "org",
        "tier": 2,
    },
    {
        "name": "MNDAA",
        "name_zh": "果敢同盟军",
        "aliases": ["Myanmar National Democratic Alliance Army", "果敢"],
        "type": "group",
        "tier": 2,
    },
    {
        "name": "UWSA",
        "name_zh": "佤邦联合军",
        "aliases": ["United Wa State Army", "佤邦"],
        "type": "group",
        "tier": 2,
    },
    {
        "name": "KIA",
        "name_zh": "克钦独立军",
        "aliases": ["Kachin Independence Army"],
        "type": "group",
        "tier": 2,
    },
    {
        "name": "TNLA",
        "name_zh": "德昂民族解放军",
        "aliases": ["Ta'ang National Liberation Army"],
        "type": "group",
        "tier": 2,
    },
    {
        "name": "NDAA Mongla",
        "name_zh": "东部掸邦民族民主同盟军",
        "aliases": ["National Democratic Alliance Army"],
        "type": "group",
        "tier": 2,
    },
    {
        "name": "NDRC",
        "name_zh": "国家发展和改革委员会",
        "aliases": ["National Development and Reform Commission"],
        "type": "org",
        "tier": 2,
    },
    {
        "name": "Ministry of Public Security",
        "name_zh": "公安部",
        "aliases": ["MPS China"],
        "type": "org",
        "tier": 2,
    },
    {
        "name": "International Department of CCP",
        "name_zh": "中联部",
        "aliases": ["IDCPC", "中共中央对外联络部"],
        "type": "org",
        "tier": 2,
    },
]


async def seed_entities(db: Client) -> int:
    """Seed default entities if they don't already exist (checked by name). Returns count of newly inserted entities."""
    existing_res = db.table("entities").select("name").execute()
    existing_names = {row["name"] for row in (existing_res.data or [])}

    to_insert = [e for e in ENTITIES if e["name"] not in existing_names]

    if not to_insert:
        return 0

    db.table("entities").insert(to_insert).execute()
    return len(to_insert)

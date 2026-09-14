from scripts.run_web_mandate import finish_run, fail_run

ctx = {
    "run_id": "6e542ade-e2f1-432a-a32e-e97692b5eee9",
    "theme": "Find startups that use AI to discover and design new chemicals and materials for data centers, in particular dielectric fluids, immersion cooling fluids, and related thermal management materials. Focus on companies designing the fluids and materials themselves, not cooling system integrators or hardware vendors.",
    "geography": "Global",
    "stage": "Series A, Series B, Pre-seed, Seed",
    "search_mode": "DEEP",
    "special_instructions": "",
    "submitted_by_email": "em@icoscapital.com",
    "submitted_by_name": "Eszter Madai",
    "additional_companies": [],
    "extra_check_sites": [],
    "icos_fit": False,
    "seed_companies": [],
    "exhaustive": False,
    "include_small": True,
    "slug": "2026-09-14-find-startups-that-use-ai-to-d-512av4",
    "current_round": 1,
    "watch": False,
    "t_start": 1789382778.3729775,
}

companies = [
    {
        "name": "Orbital Industries",
        "description": "AI platform ('Orb') that simulates the quantum-mechanical behavior of up to 100k atoms on a single GPU to discover new molecular classes; first product is a non-toxic, PFAS-free dielectric cooling fluid engineered to stop next-gen GPUs overheating, plus a modular data-center hardware system built around it. Founded 2022 (as Orbital Materials) by ex-DeepMind researcher Jonathan Godwin; rebranded to Orbital Industries in 2026. AWS strategic partnership on data-center decarbonization/cooling since Dec 2024.",
        "website": "orbitalindustries.com",
        "linkedin": "linkedin.com/company/orbitalindustries",
        "stage": "Series B",
        "geography": "UK",
        "segment": "AI-designed dielectric fluids",
        "score": None,
        "source": "Open web, X/press",
        "notes": "FTE: Unknown. $50M Series B (2026) led by Plural, w/ NVIDIA NVentures, Radical Ventures, Compound, Fly Ventures. Mandate fit: 3/3 verified (AI-driven fluid discovery; data-center dielectric/cooling application; designs the material itself, not an integrator — though now also ships modular DC hardware built around its own fluid).",
    },
    {
        "name": "Rasyn",
        "description": "Y Combinator (S26) startup building foundational AI models for chemistry, focused on ~10-ingredient formulations (datacenter coolant, GPU thermal paste, paint, glue). Used its models to invent three novel chemicals — including a PFAS-free datacenter coolant — and has since synthesized and patented all three. Team includes a Caltech computational chemist (Arnold/Marcus Lab) and researchers from NASA JPL and Biogen.",
        "website": "rasyn.ai",
        "linkedin": "linkedin.com/company/rasyn-ycs26",
        "stage": "Pre-seed",
        "geography": "US",
        "segment": "AI-designed dielectric fluids",
        "score": None,
        "source": "Open web",
        "notes": "FTE: 3 — Early (<10 FTE). Backed by Y Combinator, Undeterred Capital, Character VC. Mandate fit: 3/3 verified (AI-invented, patented, PFAS-free datacenter coolant; designs the chemical itself).",
    },
    {
        "name": "Discovered Materials",
        "description": "Y Combinator startup using swarms of AI agent models plus in-house physics simulation to discover and validate thermally conductive materials for AI chips and data centers, aiming to compress a 10+ year discovery cycle to months. Founded by Akash Ramdas (Stanford PhD, nanoscale interconnects adopted into Intel/TSMC roadmaps).",
        "website": "discoveredmaterials.com",
        "linkedin": "linkedin.com/company/discoveredmaterials",
        "stage": "Seed",
        "geography": "US",
        "segment": "AI thermal/semiconductor materials platforms",
        "score": None,
        "source": "VC portfolio (co-investor snowball off Orbital Industries backers)",
        "notes": "FTE: 2 — Early (<10 FTE). $9M Seed (Aug 2026) led by Lightspeed, w/ Y Combinator, Peak XV. Mandate fit: 3/3 verified (AI materials discovery; explicit datacenter/chip thermal-management application; designs the material itself).",
    },
    {
        "name": "CuspAI",
        "description": "AI materials-discovery company (Cambridge, UK) running a 'Materials Foundry' — generative AI + simulation (incl. a Universal Model for Atoms built with Meta) to design new materials, with published work on dielectric property prediction. Applications named: semiconductors, clean energy, advanced manufacturing.",
        "website": "cusp.ai",
        "linkedin": "linkedin.com/company/cuspai",
        "stage": "Series B",
        "geography": "UK",
        "segment": "AI thermal/semiconductor materials platforms",
        "score": None,
        "source": "Open web, Crunchbase",
        "notes": "FTE: 74. $450M Series B (2026, $2.6B valuation) — Kleiner Perkins, NEA, Bezos Expeditions, Lux Capital, AMD Ventures, Meta, NVIDIA. Mandate fit: 2/3 verified — AI-driven materials discovery and designing-the-material-itself confirmed; data-center-specific dielectric/cooling application NOT confirmed (their dielectric work is framed around semiconductors broadly, not named data-center cooling fluids) — unverified, not contradicted.",
    },
    {
        "name": "Periodic Labs",
        "description": "AI-for-science startup (ex-OpenAI/DeepMind founders) building autonomous AI 'scientist' labs — AI hypothesis generation + quantum-mechanical simulation + robotic synthesis — for materials discovery. Near-term markets named: semiconductors, advanced manufacturing, batteries/energy storage, magnets, defense. Has worked with a semiconductor manufacturer on heat-dissipation challenges.",
        "website": "periodiclabs.com",
        "linkedin": "Unknown",
        "stage": "Series A",
        "geography": "US",
        "segment": "AI thermal/semiconductor materials platforms",
        "score": None,
        "source": "Open web",
        "notes": "FTE: 33-64 (est.). $300M raised (2025 round, labeled Series A). Traction unverified (semiconductor heat-dissipation work referenced but no named data-center customer/pilot). Mandate fit: 2/3 verified — AI materials discovery and designs-the-material-itself confirmed; data-center dielectric/cooling-fluid application is the WEAKEST fit in this list — general materials-AI platform with only an adjacent semiconductor heat-dissipation mention, not a named data-center thermal-fluid product. Included for completeness; author should treat as a stretch/context match, not a core hit.",
    },
    {
        "name": "Engineered Fluids",
        "description": "Developer and manufacturer of dielectric cooling fluids and lubricants for data centers, GPUs, power transformers, and industrial/military/marine use. Designs and produces the fluid formulations itself (not a cooling-system integrator).",
        "website": "engineeredfluids.com",
        "linkedin": "Unknown",
        "stage": "Unknown",
        "geography": "US",
        "segment": "Traditional fluid manufacturers (context)",
        "score": None,
        "source": "Pipedrive CRM",
        "notes": "Pipedrive: Lost — Does not fit fund (ICF 4) strategy (2026-04-17). No evidence of AI-driven discovery in any source found — a traditional formulation company. Included for context as a genuine fluid-designer (not an integrator), but does NOT meet the mandate's core 'AI-driven' requirement — flagged, not a primary match.",
    },
]

summary = (
    "Search mode: COMPREHENSIVE (DEEP), regions EU+JP+US (Global geography).\n"
    "This is a narrow, nascent niche — independent research agents converged on the same conclusion: "
    "very few startups genuinely combine (a) AI-driven discovery/design of the chemical/material itself with "
    "(b) a named data-center dielectric-fluid/immersion-cooling/thermal-management application. 6 companies made the cut.\n"
    "Top 3 clean fits: Orbital Industries (formerly Orbital Materials — AI-designed PFAS-free dielectric fluid, "
    "$50M Series B incl. NVIDIA NVentures, AWS partner), Rasyn (YC, pre-seed, AI-invented & patented PFAS-free "
    "datacenter coolant), Discovered Materials (YC, seed, AI agents for chip/datacenter thermal materials).\n"
    "CuspAI and Periodic Labs are broader AI-materials-discovery platforms with semiconductor/dielectric work but "
    "no confirmed data-center-specific fluid product — included as weaker/adjacent matches, tagged accordingly.\n"
    "Engineered Fluids (Pipedrive CRM, previously Lost) is a genuine fluid designer but has no confirmed AI angle — "
    "kept for context only.\n"
    "Screened OUT ~20 companies that matched on keywords but are cooling-system integrators/hardware vendors "
    "(Submer, Calyos, GRC, Asperitas, ARA Cooling, Info-Cool, Top Eco Cloud, DCX, Fluid Works, ZutaCore, LiquidStack, "
    "Corintis, KoolMicro, EMCOOL, Accelsius, Albotherm, Apexify, Apheros, Aquacycl, Ferveret) per the mandate's explicit "
    "instruction to focus on fluid/material designers, not integrators — Ferveret was also confirmed to use a "
    "conventional (non-AI-designed) glycol-based fluid. Also screened out ~8 general-purpose AI-materials-discovery "
    "platforms with no data-center angle (Kebotix, ExoMatter, Mattiq, Aionics, Lila Sciences, Altrove, PhaseTree, Simreka).\n"
    "No seed companies or explicitly-named companies were provided in this mandate, so no recall check applies."
)

try:
    finish_run(ctx, companies, summary=summary)
    print("DONE")
except Exception as e:
    fail_run(ctx, e)

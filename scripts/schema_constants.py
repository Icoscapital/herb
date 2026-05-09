"""
Pipedrive schema constants for icoscapital.pipedrive.com.
Generated from API introspection on 2026-04-26.

If your Pipedrive admin adds/renames fields or option values, regenerate by re-running the
introspection script and updating this file. The keys below are the API keys, not display labels.
"""

# ---- Pipeline & stage ----
PIPELINE_ICOS = 9
PIPELINE_INCUBATORS = 12

STAGE_DATA_ENTRY = 96            # default landing stage for new intake
STAGE_LEADS = 137
STAGE_DEALS_TO_DISCUSS = 141
STAGE_FOLLOW_UP = 139
STAGE_CORPORATE_FOLLOWUP = 145
STAGE_ADVANCED_FOLLOWUP = 144
STAGE_FOLLOW_ON_PORTFOLIO = 142
STAGE_QUICKSCAN = 99
STAGE_PUR_DD_FIP = 100
STAGE_WATCH_AND_FOLLOW = 107

VISIBILITY_ITEM_OWNER = 1
VISIBILITY_ALL_USERS = 3

# ---- Custom deal field API keys ----
DEAL_FIELD = {
    "website":            "6b60ca85da3cdd92e5e810b929876c53e8562ade",
    "investment_manager": "68533ca253cf72116f283dd6b4f33694495ed511",
    "short_description":  "61962076853eba9a795f634c54a18418d55e85ba",
    "city":               "c0fb11d319405479ab8f3325b55bbc3f0cf49151",
    "source_type":        "ab272fd745c1df210fc545ea8de6473e1825b755",
    "top_100":            "48dae8fae2ce57126fed1d3f882f4c2c336dbb27",
    "business_stage":     "93895be5537764a10abe88141a58ca61f4cdf96a",
    "funds_required":     "5225d96e16fc1b9b461cb4b121ec1370b98b7db0",
    "funds_required_currency": "5225d96e16fc1b9b461cb4b121ec1370b98b7db0_currency",
    "valuation_expected": "2d0c283afc77a6604ded9d7249a42fd8556257d8",
    "total_funds_raised": "53223c4b369646a3622f998a5c09bb84f203d1cd",
    "production":         "e2b99dcceb5cbe4b3e99ebd7c19daaa067d90faf",
    "chemicals_materials":"681da30d4020f77d4069711b1006a3f33d45f017",
    "sustainable_industry":"1424b379aa2218cccd0cd81666bdd774a2cd54c6",
    "food_systems":       "d7b2d7dda0fd431d3d343396b1b3950b7aace27c",
    "decarbonisation":    "a22f452beb56b76b04ef4b56de35b4df98753b60",
    "corporate_interest": "eae659774facd085f9b39b19ce437bf65276112e",
}

ORG_FIELD = {
    "website":  "63f152ee23cc36c2be69e64ae1da73f2358663a0",
    "location": "ee71755c756bc6778d38aa70d7b925943ac82947",
    "phone":    "ed4a1f83d76a4ce916a68ddf791eec679bd859ee",
    "email":    "d2db56abafe9e4f91241bf8c542f5e6eb7eb6ffd",
}

# ---- Set/enum option IDs ----
# Pipedrive set fields take the integer option id, not the label string.

INVESTMENT_MANAGER = {
    "Nityen Lal":        423,
    "Peter van Gelderen":424,
    "Katarzyna Gil":     427,
    "Sandro Fazio":      680,
    "Stefan Dobrev":     710,
}

BUSINESS_STAGE = {
    "Seed":   410,   # Seed / product development phase
    "Pre-A":  409,   # Pre-A (reference launching customers)
    "A":      399,   # A-Round (sales close to 1M)
    "B":      400,   # B-Round (sales close to 3M)
    "C":      401,   # C-Round (sales close to 5M)
    "Mature": 402,   # Mature Company (sales more than 5M)
}

VALUATION_EXPECTED = {
    "<15M":     696,
    "16-30M":   697,
    "31-50M":   698,
    "50-100M":  699,
    ">100M":    700,
}

TOTAL_FUNDS_RAISED = {
    "<15M EUR":   693,
    "15-30M EUR": 694,
    ">30M EUR":   695,
}

PRODUCTION = {
    "Lab":               685,
    "Prototype":         686,
    "Scaled with clients": 687,
    "Scaling - high risk": 688,
    "Scaling - low risk":  689,
}

# Sector verticals — a deal usually maps to ONE primary vertical
CHEMICALS_MATERIALS = {
    "Biochemicals (Plant)":           440,
    "Biochemicals (Animal)":          670,
    "Biochemicals (Side stream)":     671,
    "Circular materials":             441,
    "Improved functionality (Materials)": 442,
    "Water treatment":                672,
    "Industry energy solutions":      673,
}

SUSTAINABLE_INDUSTRY = {
    "IoT/Industry digitization":     411,
    "Supply & value chain":          284,
    "BI/Big data/AI":                305,
    "Energy efficiency/Robotics/3D": 281,
    "Quantum/Other":                 413,
}

FOOD_SYSTEMS = {
    "Alt proteins (Plant)":     660,
    "Alt proteins (Microbial)": 432,
    "Alt proteins (Cultured)":  661,
    "Alt proteins (Insect)":    662,
    "Alt proteins (Side stream)":663,
    "Food ingredients (Plant)": 433,
    "Food ingredients (Microbial)": 664,
    "Food ingredients (Side stream)": 665,
    "Ag biotech":               434,
    "Livestock (CH4)":          435,
}

DECARBONISATION = {
    "Carbon capture":      443,
    "Carbon sequestration":445,
    "Carbon utilization":  444,
    "Carbon IT":           659,
}

SOURCE_TYPE = {
    "University":  3,
    "Agency":      4,
    "Proprietary": 5,
    "Corporate":   6,
    "Direct":      7,
    "VC":          8,
    "Conference":  9,
    "Award":      10,
    "Market Scan":11,
}

# Active Icos users (id, name, email) - for owner / Investment Manager pickers at install time
ACTIVE_USERS = [
    {"id": 27267544, "name": "Andre Groeneveld", "email": "ag@icoscapital.com"},
    {"id": 11866622, "name": "Kasia (Katarzyna Gil)", "email": "kg@icoscapital.com"},
    {"id": 5523,     "name": "Nityen Lal",       "email": "nlal@icoscapital.com"},
    {"id": 5620,     "name": "Peter van Gelderen","email": "pvg@icoscapital.com"},
    {"id": 605824,   "name": "Sandro Fazio",     "email": "sf@icoscapital.com"},
    {"id": 26283891, "name": "Stefan Dobrev",    "email": "sd@icoscapital.com"},
]

# Map active user id → Investment Manager option id (best match by name)
USER_TO_INVESTMENT_MANAGER = {
    27267544: None,                              # Andre — no IM option, leave blank
    11866622: INVESTMENT_MANAGER["Katarzyna Gil"],
    5523:     INVESTMENT_MANAGER["Nityen Lal"],
    5620:     INVESTMENT_MANAGER["Peter van Gelderen"],
    605824:   INVESTMENT_MANAGER["Sandro Fazio"],
    26283891: INVESTMENT_MANAGER["Stefan Dobrev"],
}

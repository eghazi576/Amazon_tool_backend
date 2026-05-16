// Node.js 20 WebSocket fix — must be first line
import { WebSocket } from "ws";
globalThis.WebSocket = WebSocket;

/**
 * Amazon Insight Hub — Backend API Server
 * =========================================
 * Stack: Node.js + Express + Supabase (PostgreSQL)
 * Node.js 20 compatible — uses "ws" package for WebSocket
 */

import express from "express";
import cors from "cors";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config(); // load .env

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());

// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabaseUrl     = process.env.SUPABASE_URL;
const supabaseKey     = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("⚠  SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — DB features disabled");
}

const clientOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
};

const supabaseAdmin = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, clientOptions)
  : null;

// ─── Auth middleware ──────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }
  const token = header.slice(7);
  if (!supabaseAdmin) {
    req.userId = "dev-user";
    return next();
  }
  try {
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error } = await anonClient.auth.getUser();
    if (error || !user) return res.status(401).json({ error: "Invalid or expired token" });
    req.userId    = user.id;
    req.userEmail = user.email;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Auth verification failed" });
  }
}

// ─── Keepa helpers ────────────────────────────────────────────────────────────
const CSV = {
  AMAZON: 0, NEW: 1, USED: 2, SALES_RANK: 3, LIST_PRICE: 4,
  NEW_FBA: 10, OFFER_COUNT_NEW: 11, OFFER_COUNT_FBA: 15,
  RATING: 16, REVIEW_COUNT: 17, BUYBOX: 18, MAP: 19,
};

const keepaMinutesToMs = (km) => (km + 21564000) * 60 * 1000;

function parseCsvSeries(csv, cutoffMs = null) {
  if (!Array.isArray(csv)) return [];
  const out = [];
  for (let i = 0; i < csv.length - 1; i += 2) {
    const km = csv[i], v = csv[i + 1];
    if (v === -1 || v == null || km == null) continue;
    const t = keepaMinutesToMs(km);
    if (cutoffMs && t < cutoffMs) continue;
    out.push({ t, v });
  }
  return out;
}

const parsePriceSeries = (csv, cutoff) =>
  parseCsvSeries(csv, cutoff).map((p) => ({ t: p.t, v: parseFloat((p.v / 100).toFixed(2)) }));

const lastValue = (s) => (s?.length ? s[s.length - 1].v : null);

const currentFromStats = (stats, idx) => {
  const v = stats?.current?.[idx];
  return v == null || v === -1 ? null : v;
};

const medianOf = (series) => {
  const vals = series.map((p) => p.v).filter((v) => v > 0).sort((a, b) => a - b);
  if (!vals.length) return null;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
};

const downsample = (series, max = 90) => {
  if (!series || series.length <= max) return series;
  const step = Math.ceil(series.length / max);
  const out  = [];
  for (let i = 0; i < series.length; i += step) out.push(series[i]);
  if (out[out.length - 1] !== series[series.length - 1]) out.push(series[series.length - 1]);
  return out;
};

// ─── Amazon Fee Calculation Engine ───────────────────────────────────────────
// Exact match with Amazon Seller Central Revenue Calculator 2024-2025

// ── Detect true Amazon fee category ─────────────────────────────────────────
// Priority: DEEPEST Keepa subcategory > product title keywords
// Keepa categoryTree gives specific names like:
//   "Wrist Watches", "Sunglasses", "T-Shirts", "Running Shoes"
//   "Backpacks", "Earbuds", "Laptops", "Necklaces" etc.
// These are FAR more reliable than rootCategory ("Clothing, Shoes & Jewelry")

function hasWord(text, word) {
  const escaped = word.replace(/[-\/]/g, '\$&');
  return new RegExp('(?<![a-zA-Z])' + escaped + '(?![a-zA-Z])', 'i').test(text);
}

function detectTrueCategory(allCategoryLevels, title) {
  // Combine ALL category tree levels + title for maximum signal
  const full  = `${allCategoryLevels} ${title}`.toLowerCase();
  const t     = (title || "").toLowerCase();

  // ── 1. WATCHES ────────────────────────────────────────────────────────────
  // Keepa subcategory: "Wrist Watches", "Pocket Watches", "Smartwatches"
  if (full.includes("wrist watch") || full.includes("wristwatches") ||
      full.includes("pocket watch") || full.includes("smartwatch") ||
      full.includes("smart watch") || full.includes("chronograph") ||
      hasWord(t, "watch") || hasWord(t, "watches") || hasWord(t, "timepiece"))
    return "watch";

  // ── 2. SUNGLASSES ─────────────────────────────────────────────────────────
  // Keepa subcategory: "Sunglasses", "Goggle & Sunglasses"
  if (full.includes("sunglasses") || full.includes("sunglass") ||
      full.includes("goggles") || full.includes("polarized lens") ||
      full.includes("uv400") || full.includes("uv protection lens"))
    return "sunglasses";

  // ── 3. SHOES / FOOTWEAR ───────────────────────────────────────────────────
  // Keepa subcategory: "Running Shoes", "Dress Shoes", "Sneakers", "Boots"
  if (full.includes("running shoe") || full.includes("dress shoe") ||
      full.includes("athletic shoe") || full.includes("walking shoe") ||
      full.includes("basketball shoe") || full.includes("training shoe") ||
      full.includes("casual shoe") || full.includes("oxford shoe") ||
      hasWord(full, "sneakers") || hasWord(full, "sneaker") ||
      hasWord(full, "loafers") || hasWord(full, "loafer") ||
      hasWord(full, "boots") && !full.includes("ankle boots bag") ||
      hasWord(full, "sandals") || hasWord(full, "sandal") ||
      hasWord(full, "slippers") || hasWord(full, "slipper") ||
      hasWord(full, "footwear") || hasWord(full, "moccasin") ||
      (hasWord(t, "shoes") && !t.includes("shoe rack") && !t.includes("shoe box") && !t.includes("shoe bag")) ||
      (hasWord(t, "shoe") && !t.includes("shoehorn") && !t.includes("shoe box")))
    return "shoes";

  // ── 4. HANDBAGS / PURSES ──────────────────────────────────────────────────
  // Keepa subcategory: "Handbags", "Shoulder Bags", "Tote Bags", "Clutches"
  if (full.includes("handbag") || full.includes("shoulder bag") ||
      full.includes("tote bag") || full.includes("clutch bag") ||
      full.includes("crossbody bag") || full.includes("satchel") ||
      full.includes("wristlet") || full.includes("evening bag") ||
      hasWord(t, "purse") || hasWord(t, "handbag"))
    return "shoes_handbags";

  // ── 5. BACKPACKS / LUGGAGE ────────────────────────────────────────────────
  // Keepa subcategory: "Backpacks", "Carry-Ons", "Suitcases", "Duffel Bags"
  if (full.includes("backpacks") || full.includes("backpack") ||
      full.includes("rucksack") || full.includes("carry-on") ||
      full.includes("suitcase") || full.includes("luggage") ||
      full.includes("duffel bag") || full.includes("duffle bag") ||
      full.includes("briefcase") || full.includes("laptop bag") ||
      full.includes("messenger bag") || full.includes("school bag") ||
      full.includes("gym bag") || full.includes("travel bag") ||
      full.includes("diaper bag"))
    return "luggage";

  // ── 6. JEWELRY ────────────────────────────────────────────────────────────
  // Keepa subcategory: "Necklaces", "Bracelets", "Earrings", "Rings", "Pendants"
  if (full.includes("necklaces") || full.includes("necklace") ||
      full.includes("bracelets") || full.includes("bracelet") ||
      full.includes("earrings") || full.includes("earring") ||
      full.includes("pendants") || full.includes("pendant") ||
      full.includes("anklets") || full.includes("anklet") ||
      full.includes("brooches") || full.includes("brooch") ||
      full.includes("cufflinks") || full.includes("cufflink") ||
      full.includes("bangles") || full.includes("bangle") ||
      full.includes("fine jewelry") || full.includes("fashion jewelry") ||
      (full.includes("ring") && !full.includes("ring light") &&
       !full.includes("boxing ring") && !full.includes("o-ring") &&
       !full.includes("curtain ring") && !full.includes("key ring")))
    return "jewelry";

  // ── 7. CLOTHING ───────────────────────────────────────────────────────────
  // Keepa subcategory: "T-Shirts", "Dress Shirts", "Jeans", "Hoodies", "Dresses"
  if (full.includes("t-shirts") || full.includes("dress shirts") ||
      full.includes("polo shirts") || full.includes("tank tops") ||
      full.includes("sweatshirts") || full.includes("hoodies") ||
      full.includes("activewear") || full.includes("swimwear") ||
      full.includes("sleepwear") || full.includes("lingerie") ||
      full.includes("underwear") || full.includes("socks & hosiery") ||
      full.includes("fashion hoodies") || full.includes("graphic tees") ||
      hasWord(t, "shirt") || hasWord(t, "t-shirt") || hasWord(t, "tshirt") ||
      hasWord(t, "polo") || hasWord(t, "blouse") ||
      hasWord(t, "hoodie") || hasWord(t, "sweatshirt") || hasWord(t, "sweater") ||
      hasWord(t, "pullover") || hasWord(t, "cardigan") ||
      hasWord(t, "jeans") || hasWord(t, "denim") ||
      hasWord(t, "pants") || hasWord(t, "trouser") || hasWord(t, "chino") ||
      hasWord(t, "shorts") || hasWord(t, "jogger") ||
      hasWord(t, "jacket") || hasWord(t, "coat") || hasWord(t, "blazer") ||
      hasWord(t, "dress") || hasWord(t, "skirt") || hasWord(t, "legging") ||
      hasWord(t, "swimsuit") || hasWord(t, "uniform") ||
      hasWord(t, "pajama") || hasWord(t, "pyjama") || hasWord(t, "vest"))
    return "clothing";

  // ── 8. ELECTRONICS ACCESSORIES ────────────────────────────────────────────
  // Keepa subcategory: "Earbud Headphones", "Over-Ear Headphones", "Cables"
  if (full.includes("earbud headphone") || full.includes("in-ear headphone") ||
      full.includes("over-ear headphone") || full.includes("on-ear headphone") ||
      full.includes("noise cancelling headphone") ||
      hasWord(full, "earbuds") || hasWord(full, "earphones") ||
      hasWord(full, "headphones") || hasWord(full, "headset") ||
      hasWord(t, "airpods") || full.includes("tws earbuds") ||
      full.includes("phone cases") || full.includes("screen protectors") ||
      full.includes("charging cables") || full.includes("power banks") ||
      full.includes("usb cables") || full.includes("hdmi cables"))
    return "electronics_accessories";

  // ── 9. CONSUMER ELECTRONICS ───────────────────────────────────────────────
  if (full.includes("laptops") || full.includes("tablets") ||
      full.includes("smartphones") || full.includes("televisions") ||
      full.includes("monitors") || full.includes("projectors") ||
      full.includes("digital cameras") || full.includes("consumer electronics") ||
      full.includes("computers") ||
      hasWord(t, "laptop") || hasWord(t, "tablet") ||
      hasWord(t, "television") || hasWord(t, "monitor"))
    return "consumer_electronics";

  // ── 10. BABY ──────────────────────────────────────────────────────────────
  if (full.includes("baby product") || full.includes("baby gear") ||
      full.includes("diaper") || full.includes("stroller") ||
      full.includes("baby monitor") || full.includes("baby carrier") ||
      hasWord(t, "baby") || hasWord(t, "infant") || hasWord(t, "toddler"))
    return "baby";

  // ── 11. BEAUTY & PERSONAL CARE ────────────────────────────────────────────
  if (full.includes("skin care") || full.includes("skin-care") ||
      full.includes("hair care") || full.includes("hair-care") ||
      full.includes("lip color") || full.includes("face wash") ||
      full.includes("personal care") || full.includes("beauty") ||
      hasWord(t, "shampoo") || hasWord(t, "moisturizer") ||
      hasWord(t, "lipstick") || hasWord(t, "serum") || hasWord(t, "sunscreen"))
    return "beauty";

  // ── 12. HEALTH & HOUSEHOLD ────────────────────────────────────────────────
  if (full.includes("vitamins") || full.includes("supplements") ||
      full.includes("health care") || full.includes("household supplies") ||
      hasWord(t, "vitamin") || hasWord(t, "supplement") || hasWord(t, "probiotic"))
    return "health";

  // ── 13. GROCERY & GOURMET ─────────────────────────────────────────────────
  if (full.includes("grocery") || full.includes("gourmet food") ||
      full.includes("snack food") || full.includes("beverages") ||
      hasWord(t, "coffee") || hasWord(t, "tea") || hasWord(t, "snack"))
    return "grocery";

  // ── 14. SPORTS & OUTDOORS ─────────────────────────────────────────────────
  if (full.includes("sports") || full.includes("outdoor recreation") ||
      full.includes("exercise") || full.includes("fitness") ||
      hasWord(t, "yoga mat") || hasWord(t, "dumbbell") || hasWord(t, "bicycle"))
    return "sports";

  // ── 15. TOYS & GAMES ──────────────────────────────────────────────────────
  if (full.includes("toys") || full.includes("board games") ||
      full.includes("action figures") || full.includes("dolls") ||
      hasWord(t, "toy") || hasWord(t, "lego") || hasWord(t, "puzzle"))
    return "toys";

  // ── 16. PET SUPPLIES ──────────────────────────────────────────────────────
  if (full.includes("pet supplies") || full.includes("dog food") ||
      full.includes("cat food") || full.includes("pet bed") ||
      full.includes("aquarium"))
    return "pet";

  // ── 17. HOME & KITCHEN ────────────────────────────────────────────────────
  if (full.includes("kitchen") || full.includes("cookware") ||
      full.includes("bakeware") || full.includes("home & kitchen") ||
      full.includes("bedding") || full.includes("bath") ||
      hasWord(t, "air fryer") || hasWord(t, "blender") || hasWord(t, "toaster"))
    return "home_kitchen";

  // ── 18. FURNITURE ─────────────────────────────────────────────────────────
  if (full.includes("furniture") || full.includes("sofas") || full.includes("mattress") ||
      hasWord(t, "sofa") || hasWord(t, "couch") || hasWord(t, "mattress"))
    return "furniture";

  // ── 19. TOOLS & HOME IMPROVEMENT ─────────────────────────────────────────
  if (full.includes("tools & home") || full.includes("power tools") ||
      full.includes("hand tools") || full.includes("home improvement"))
    return "tools";

  // ── 20. OFFICE PRODUCTS ───────────────────────────────────────────────────
  if (full.includes("office products") || full.includes("office supplies"))
    return "office";

  // ── 21. AUTOMOTIVE ────────────────────────────────────────────────────────
  if (full.includes("automotive") || full.includes("powersports"))
    return "automotive";

  // ── 22. INDUSTRIAL & SCIENTIFIC ───────────────────────────────────────────
  if (full.includes("industrial") || full.includes("scientific"))
    return "industrial";

  // ── 23. BOOKS ─────────────────────────────────────────────────────────────
  if (full.includes("books") || full.includes("kindle"))
    return "books";

  // ── 24. MUSICAL INSTRUMENTS ───────────────────────────────────────────────
  if (full.includes("musical instruments") ||
      hasWord(t, "guitar") || hasWord(t, "piano") || hasWord(t, "violin"))
    return "musical";

  // ── 25. LARGE APPLIANCES ──────────────────────────────────────────────────
  if (full.includes("refrigerator") || full.includes("washing machine") ||
      full.includes("dishwasher") || full.includes("large appliance"))
    return "appliance";

  // DEFAULT
  return "everything_else";
}

// ── Referral Fee Calculator (2026 Guide — exact tiered logic) ────────────────
// Returns the DOLLAR AMOUNT of referral fee (not just a rate)
// because many categories have tiered/price-based rates.
// Minimum fee: $0.30 for most categories (exceptions noted).

function calcReferralFee(category = "", price = 0, title = "") {
  // Use detectTrueCategory to get correct fee category from title + Keepa category
  const trueCategory = detectTrueCategory(category, title);
  const name = trueCategory.toLowerCase();
  const p    = price;
  const minFee = 0.30;

  // ── Amazon Device Accessories ─────────────────────────────────────────────
  if (name.includes("amazon device")) {
    return Math.max(p * 0.45, minFee);
  }

  // ── Automotive & Powersports ──────────────────────────────────────────────
  if (name.includes("automotive") || name.includes("powersport")) {
    return Math.max(p * 0.12, minFee);
  }

  // ── Baby Products — tiered by price ──────────────────────────────────────
  // ≤ $10 → 8% | > $10 → 15%
  if (name.includes("baby")) {
    const rate = p <= 10 ? 0.08 : 0.15;
    return Math.max(p * rate, minFee);
  }

  // ── Beauty & Personal Care — tiered by price ──────────────────────────────
  // ≤ $10 → 8% | > $10 → 15%
  if (name.includes("beauty") || name.includes("personal care")) {
    const rate = p <= 10 ? 0.08 : 0.15;
    return Math.max(p * rate, minFee);
  }

  // ── Books ─────────────────────────────────────────────────────────────────
  // 15%, no minimum fee
  if (name.includes("book")) {
    return p * 0.15; // no minimum
  }

  // ── Camera & Photo ────────────────────────────────────────────────────────
  if (name.includes("camera") || name.includes("photo")) {
    return Math.max(p * 0.08, minFee);
  }

  // ── Clothing & Accessories — tiered by price ──────────────────────────────
  // ≤ $15 → 5% | $15.01–$20 → 10% | > $20 → 17%
  if (name.includes("clothing") || name.includes("apparel") || name.includes("fashion")) {
    let rate;
    if (p <= 15)      rate = 0.05;
    else if (p <= 20) rate = 0.10;
    else              rate = 0.17;
    return Math.max(p * rate, minFee);
  }

  // ── Shoes, Handbags & Sunglasses — tiered by price ───────────────────────
  // ≤ $75 → 5% | $75.01–$150 → 10% | > $150 → 15%
  if (name.includes("shoes") || name.includes("handbag") || name.includes("sunglasses")) {
    let rate;
    if (p <= 75)       rate = 0.05;
    else if (p <= 150) rate = 0.10;
    else               rate = 0.15;
    return Math.max(p * rate, minFee);
  }

  // ── Consumer Electronics — 8% FLAT ──────────────────────────────────────
  if (name.includes("consumer electronics")) {
    return Math.max(p * 0.08, minFee);
  }

  // ── Electronics Accessories — tiered ─────────────────────────────────────
  // 15% on portion ≤ $100 | 8% on portion > $100
  if (name.includes("electronics accessories") || name.includes("electronic accessories") ||
      name.includes("electronics accessory") || name.includes("cell phone accessories") ||
      name.includes("camera accessories") || name.includes("computer accessories") ||
      name.includes("accessories") && name.includes("electronic")) {
    if (p <= 100) {
      return Math.max(p * 0.15, minFee);
    } else {
      // 15% on first $100 + 8% on remainder
      const fee = (100 * 0.15) + ((p - 100) * 0.08);
      return Math.max(fee, minFee);
    }
  }

  // ── Electronics (generic) — 8% flat ──────────────────────────────────────
  if (name.includes("electronics")) {
    return Math.max(p * 0.08, minFee);
  }

  // ── Computers ────────────────────────────────────────────────────────────
  if (name.includes("computers") || name.includes("laptop") || name.includes("pc")) {
    return Math.max(p * 0.08, minFee);
  }

  // ── Furniture — tiered by price ───────────────────────────────────────────
  // ≤ $200 → 15% | > $200 → 10%
  if (name.includes("furniture")) {
    const rate = p <= 200 ? 0.15 : 0.10;
    return Math.max(p * rate, minFee);
  }

  // ── Gift Cards ────────────────────────────────────────────────────────────
  // 20%, no minimum fee
  if (name.includes("gift card")) {
    return p * 0.20; // no minimum
  }

  // ── Grocery & Gourmet — tiered by price ──────────────────────────────────
  // ≤ $15 → 8% | > $15 → 15% | No minimum fee
  if (name.includes("grocery") || name.includes("gourmet") || name.includes("food")) {
    const rate = p <= 15 ? 0.08 : 0.15;
    return p * rate; // no minimum
  }

  // ── Health & Household — tiered by price ─────────────────────────────────
  // ≤ $10 → 8% | > $10 → 15%
  if (name.includes("health") || name.includes("household")) {
    const rate = p <= 10 ? 0.08 : 0.15;
    return Math.max(p * rate, minFee);
  }

  // ── Home & Kitchen ────────────────────────────────────────────────────────
  if (name.includes("home") || name.includes("kitchen")) {
    return Math.max(p * 0.15, minFee);
  }

  // ── Industrial & Scientific ───────────────────────────────────────────────
  if (name.includes("industrial") || name.includes("scientific")) {
    return Math.max(p * 0.12, minFee);
  }

  // ── Jewelry — tiered (on portion basis) ──────────────────────────────────
  // 20% on portion ≤ $250 | 5% on portion > $250
  if (name.includes("jewelry") || name.includes("jewellery")) {
    if (p <= 250) {
      return Math.max(p * 0.20, minFee);
    } else {
      // 20% on first $250 + 5% on remainder
      const fee = (250 * 0.20) + ((p - 250) * 0.05);
      return Math.max(fee, minFee);
    }
  }

  // ── Large Appliances — tiered by price ───────────────────────────────────
  // ≤ $300 → 8% | $300.01–$500 → 15% | > $500 → 8%
  if (name.includes("large appliance") || name.includes("major appliance") ||
      name.includes("appliance")) {
    let rate;
    if (p <= 300)      rate = 0.08;
    else if (p <= 500) rate = 0.15;
    else               rate = 0.08;
    return Math.max(p * rate, minFee);
  }

  // ── Musical Instruments ───────────────────────────────────────────────────
  if (name.includes("musical instrument") || name.includes("music instrument")) {
    return Math.max(p * 0.15, minFee);
  }

  // ── Office Products ───────────────────────────────────────────────────────
  if (name.includes("office")) {
    return Math.max(p * 0.15, minFee);
  }

  // ── Pet Supplies ──────────────────────────────────────────────────────────
  if (name.includes("pet")) {
    return Math.max(p * 0.15, minFee);
  }

  // ── Sports & Outdoors ────────────────────────────────────────────────────
  if (name.includes("sport") || name.includes("outdoor")) {
    return Math.max(p * 0.15, minFee);
  }

  // ── Toys & Games ─────────────────────────────────────────────────────────
  if (name.includes("toy") || name.includes("game")) {
    return Math.max(p * 0.15, minFee);
  }

  // ── Video Games ───────────────────────────────────────────────────────────
  if (name.includes("video game") && !name.includes("console")) {
    return Math.max(p * 0.15, minFee);
  }

  // ── Video Game Consoles ───────────────────────────────────────────────────
  if (name.includes("video game console") || name.includes("game console")) {
    return Math.max(p * 0.08, minFee);
  }

  // ── Watches — tiered (on portion basis) ──────────────────────────────────
  // 16% on portion ≤ $1500 | 3% on portion > $1500 | Min fee: $2.00
  if (name.includes("watch")) {
    let fee;
    if (p <= 1500) {
      fee = p * 0.16;
    } else {
      // 16% on first $1500 + 3% on remainder
      fee = (1500 * 0.16) + ((p - 1500) * 0.03);
    }
    return Math.max(fee, 2.00); // min $2.00 for watches
  }

  // ── Fine Art — tiered by price ────────────────────────────────────────────
  // ≤ $100 → 20% | $100–$1000 → 15% | $1000–$5000 → 10% | > $5000 → 5% | No min
  if (name.includes("fine art") || name.includes("art")) {
    let rate;
    if (p <= 100)       rate = 0.20;
    else if (p <= 1000) rate = 0.15;
    else if (p <= 5000) rate = 0.10;
    else                rate = 0.05;
    return p * rate; // no minimum
  }

  // ── Handmade ─────────────────────────────────────────────────────────────
  // 15%, min $1.00
  if (name.includes("handmade")) {
    return Math.max(p * 0.15, 1.00);
  }

  // ── Cell Phones / Wireless ────────────────────────────────────────────────
  if (name.includes("cell phone") || name.includes("wireless") ||
      name.includes("mobile")) {
    return Math.max(p * 0.08, minFee);
  }

  // ── Luggage & Travel ──────────────────────────────────────────────────────
  if (name.includes("luggage") || name.includes("travel")) {
    return Math.max(p * 0.15, minFee);
  }

  // ── Tools & Home Improvement ─────────────────────────────────────────────
  if (name.includes("tool") || name.includes("home improvement")) {
    return Math.max(p * 0.15, minFee);
  }

  // ── Everything Else (default) ────────────────────────────────────────────
  return Math.max(p * 0.15, minFee);
}

// Keep getReferralRate for backward compat (returns rate not fee)
function getReferralRate(category = "") {
  const cat = category.toLowerCase();
  if (cat.includes("amazon device"))                   return 0.45;
  if (cat.includes("camera") || cat.includes("photo")) return 0.08;
  if (cat.includes("clothing") || cat.includes("apparel")) return 0.17;
  if (cat.includes("shoes") || cat.includes("handbag")) return 0.15;
  if (cat.includes("consumer electronics") || cat.includes("electronics")) return 0.08;
  if (cat.includes("computers"))                       return 0.08;
  if (cat.includes("jewelry"))                         return 0.20;
  if (cat.includes("watch"))                           return 0.16;
  if (cat.includes("automotive") || cat.includes("industrial")) return 0.12;
  if (cat.includes("grocery") || cat.includes("food")) return 0.08;
  if (cat.includes("baby") || cat.includes("beauty") ||
      cat.includes("health"))                          return 0.08;
  if (cat.includes("book"))                            return 0.15;
  return 0.15;
}

// ── Is this an apparel product? (different FBA fee table) ────────────────────
function isApparel(category = "") {
  // ONLY true clothing/footwear items use apparel FBA fee table
  // Luggage, bags, backpacks use STANDARD fee table
  const cat = category.toLowerCase();
  return cat.includes("apparel") || cat.includes("clothing") ||
         cat.includes("shoes") || cat.includes("handbag") ||
         cat.includes("fashion") || cat.includes("sunglasses");
  // NOTE: "luggage" intentionally excluded — uses standard FBA fees
}

// ── FBA Fulfillment Fee — Amazon 2026 Official Rate Card ─────────────────────
// Effective January 15, 2026 (non-peak, excludes 3.5% fuel surcharge from Apr 17)
// Source: Amazon Seller Central GABBX6GZPA8MSZGW via Goat Consulting
//
// Three price bands per weight tier:
//   band 0: price < $10
//   band 1: $10 ≤ price ≤ $50
//   band 2: price > $50
//
// Size tiers:
//   Small standard: ≤ 16 oz AND ≤ 15×12×0.75 inches
//   Large standard: > 16 oz OR exceeds small standard dimensions (up to 20 lb)
//
// Weight used: MAX(actual weight, dimensional weight)
//   Dimensional weight = L×W×H (inches) / 139

function getFbaFee(weightG = null, dimensions = null, category = "", sellingPrice = 0) {
  if (!weightG || weightG <= 0) return null;

  const weightOz = weightG / 28.3495;
  const weightLb = weightG / 453.592;
  const apparel  = isApparel(category);

  // Dimensional weight (Keepa dims: mm×10 → inches)
  let dimWeightLb = 0;
  if (dimensions?.length && dimensions?.width && dimensions?.height) {
    const lIn = (dimensions.length / 10) * 0.393701;
    const wIn = (dimensions.width  / 10) * 0.393701;
    const hIn = (dimensions.height / 10) * 0.393701;
    dimWeightLb = (lIn * wIn * hIn) / 139;
  }

  // Billable = whichever is greater
  const billableOz = Math.max(weightOz, dimWeightLb * 16);
  const billableLb = Math.max(weightLb, dimWeightLb);

  // Price band index
  const p    = sellingPrice || 0;
  const band = p < 10 ? 0 : p <= 50 ? 1 : 2;

  // ─────────────────────────────────────────────────────────────────────────
  // APPAREL fee tables (2026)
  // ─────────────────────────────────────────────────────────────────────────
  if (apparel) {
    // Small standard apparel (≤ 16 oz)
    if (billableOz <=  2) return [2.62, 3.51, 3.77][band];
    if (billableOz <=  4) return [2.64, 3.54, 3.80][band];
    if (billableOz <=  6) return [2.68, 3.59, 3.85][band];
    if (billableOz <=  8) return [2.81, 3.69, 3.95][band];
    if (billableOz <= 10) return [3.00, 3.91, 4.17][band];
    if (billableOz <= 12) return [3.10, 4.09, 4.35][band];
    if (billableOz <= 14) return [3.20, 4.20, 4.46][band];
    if (billableOz <= 16) return [3.30, 4.25, 4.51][band];
    // Large standard apparel (> 16 oz)
    if (billableLb <= 1.00) return [3.48, 4.30, 4.56][band]; // up to 16oz (by lb for consistency)
    if (billableLb <= 1.25) return [5.05, 5.87, 6.13][band];
    if (billableLb <= 1.50) return [5.22, 6.04, 6.30][band];
    if (billableLb <= 1.75) return [5.32, 6.14, 6.40][band];
    if (billableLb <= 2.00) return [5.43, 6.25, 6.51][band];
    if (billableLb <= 2.25) return [5.78, 6.60, 6.86][band];
    if (billableLb <= 2.50) return [5.90, 6.72, 6.98][band];
    if (billableLb <= 2.75) return [5.95, 6.77, 7.03][band];
    if (billableLb <= 3.00) return [6.08, 6.90, 7.16][band];
    // 3+ lb apparel: base + $0.16 per half-lb above 3 lb
    const appBase = [6.15, 6.97, 7.23][band];
    return parseFloat((appBase + 0.16 * Math.ceil((billableLb - 3) * 2)).toFixed(2));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NON-APPAREL fee tables (2026)
  // ─────────────────────────────────────────────────────────────────────────

  // Small standard (≤ 16 oz)
  if (billableOz <=  2) return [2.43, 3.32, 3.58][band];
  if (billableOz <=  4) return [2.49, 3.42, 3.68][band];
  if (billableOz <=  6) return [2.56, 3.45, 3.71][band];
  if (billableOz <=  8) return [2.66, 3.54, 3.80][band];
  if (billableOz <= 10) return [2.77, 3.68, 3.94][band];
  if (billableOz <= 12) return [2.82, 3.78, 4.04][band];
  if (billableOz <= 14) return [2.92, 3.91, 4.17][band];
  if (billableOz <= 16) return [2.95, 3.96, 4.22][band];

  // Large standard (> 16 oz)
  // Amazon's large standard weight tiers:
  if (billableLb <= 1.00) return [2.91, 3.73, 3.99][band]; // ≤16oz large (by dim weight)
  if (billableLb <= 1.25) return [4.22, 5.04, 5.30][band]; // 1+ to 1.25 lb
  if (billableLb <= 1.50) return [4.60, 5.42, 5.68][band]; // 1.25+ to 1.5 lb
  if (billableLb <= 1.75) return [4.75, 5.57, 5.83][band]; // 1.5+ to 1.75 lb
  if (billableLb <= 2.00) return [5.00, 5.82, 6.08][band]; // 1.75+ to 2 lb
  if (billableLb <= 2.25) return [5.10, 5.92, 6.18][band]; // 2+ to 2.25 lb
  if (billableLb <= 2.50) return [5.28, 6.10, 6.36][band]; // 2.25+ to 2.5 lb
  if (billableLb <= 2.75) return [5.44, 6.26, 6.52][band]; // 2.5+ to 2.75 lb
  if (billableLb <= 3.00) return [5.85, 6.67, 6.93][band]; // 2.75+ to 3 lb
  // 3+ lb to 20 lb: base + $0.08 per 4 oz above first 3 lb
  const stdBase = [6.15, 6.97, 7.23][band];
  return parseFloat((stdBase + 0.08 * Math.ceil((billableLb - 3) * 4)).toFixed(2));
}

// ── Inbound Placement Fee (Jan 15, 2026, minimal splits) ────────────────────
// Source: Goat Consulting / Amazon Seller Central 2026 rate card
// Small standard ≤8oz:       $0.14–$0.32 (use midpoint $0.23)
// Small standard 8-16oz:     $0.16–$0.32 (use midpoint $0.24) ← Amazon shows $0.36 for some
// Large standard ≤12oz:      $0.20–$0.40
// Large standard 12oz-1.5lb: $0.24–$0.50
// Large standard 1.5-3lb:    $0.34–$0.60
// Amazon-optimized (5+ locations): FREE

function getInboundFee(weightG = null, dimensions = null, category = "") {
  if (!weightG || weightG <= 0) return null;

  const weightOz = weightG / 28.3495;
  const weightLb = weightG / 453.592;
  let dimWeightLb = 0;
  if (dimensions?.length && dimensions?.width && dimensions?.height) {
    const lIn = (dimensions.length / 10) * 0.393701;
    const wIn = (dimensions.width  / 10) * 0.393701;
    const hIn = (dimensions.height / 10) * 0.393701;
    dimWeightLb = (lIn * wIn * hIn) / 139;
  }
  const billableOz = Math.max(weightOz, dimWeightLb * 16);
  const billableLb = Math.max(weightLb, dimWeightLb);

  // Small standard (≤ 16 oz)
  if (billableOz <= 8)  return 0.23;  // small std ≤8oz: $0.14-$0.32
  if (billableOz <= 16) return 0.36;  // small std 8-16oz: $0.16-$0.32 (Amazon shows $0.36)
  // Large standard
  if (billableLb <= 0.75) return 0.30; // large std ≤12oz: $0.20-$0.40
  if (billableLb <= 1.5)  return 0.37; // large std 12oz-1.5lb: $0.24-$0.50
  if (billableLb <= 3)    return 0.47; // large std 1.5-3lb: $0.34-$0.60
  if (billableLb <= 5)    return 0.57; // large std 3-5lb: $0.38-$0.76
  if (billableLb <= 7)    return 0.69; // large std 5-7lb: $0.40-$0.98
  if (billableLb <= 10)   return 0.81; // large std 7-10lb: $0.42-$1.20
  return 0.97;
}

// ── Main Profit Calculation ───────────────────────────────────────────────────
// Formula: Net Profit = Item Price
//                     - Referral Fee (category %, min $0.30)
//                     - FBA Fulfillment Fee (weight+category based)
//                     - Monthly Storage Fee (cubic ft × $0.78 ÷ monthly units)
//                     - Inbound Placement Fee (size+category based)
//                     - COGS (user enters)
function calcProfit({
  sellingPrice,
  cogs = 0,
  category = "",
  title = "",
  weightG = null,
  dimensions = null,
  monthlySales = null,
  manualReferralRate = null,
}) {
  if (!sellingPrice || sellingPrice <= 0) {
    return {
      referralFee: 0, referralRate: 15, fbaFee: null,
      storageFee: null, inboundPlacementFee: null,
      totalFees: null, netProfit: null, roi: null,
      margin: null, breakEven: null, weightMissing: true,
    };
  }

  // 1. Referral Fee — exact tiered calculation per 2026 guide
  //    If user selected a category from dropdown with manual rate, use that rate
  //    Otherwise use calcReferralFee() which handles all tiered conditions
  let referralFee;
  let referralRate;
  if (manualReferralRate != null && manualReferralRate > 0) {
    referralRate = manualReferralRate / 100;
    referralFee  = parseFloat(Math.max(sellingPrice * referralRate, 0.30).toFixed(2));
  } else {
    // Auto-detect using title + Keepa category for accurate tier detection
    referralFee  = parseFloat(calcReferralFee(category, sellingPrice, title).toFixed(2));
    referralRate = sellingPrice > 0 ? referralFee / sellingPrice : 0.15;
  }

  // 2. FBA Fulfillment Fee (apparel vs standard table)
  const fbaFeeRaw = getFbaFee(weightG, dimensions, category, sellingPrice || 0);
  const fbaFee    = fbaFeeRaw != null ? parseFloat(fbaFeeRaw.toFixed(2)) : null;

  // 3. Storage Fee per unit/month
  //    = (cubic ft × $0.78) ÷ monthly units
  //    Keepa dimensions: mm×10 → inches → cubic feet
  let storageFee = null;
  if (dimensions?.length && dimensions?.width && dimensions?.height) {
    const lIn     = (dimensions.length / 10) * 0.393701;
    const wIn     = (dimensions.width  / 10) * 0.393701;
    const hIn     = (dimensions.height / 10) * 0.393701;
    const cubicFt = (lIn * wIn * hIn) / 1728;
    const units   = Math.max(monthlySales || 30, 1);
    storageFee    = parseFloat(((cubicFt * 0.78) / units).toFixed(2));
  } else if (weightG && weightG > 0) {
    // Estimate storage from weight (avg density ~12 lb/cuft consumer goods)
    const weightLb   = weightG / 453.592;
    const estCubicFt = weightLb / 12;
    const units      = Math.max(monthlySales || 30, 1);
    storageFee       = parseFloat(((estCubicFt * 0.78) / units).toFixed(2));
  }

  // 4. Inbound Placement Fee (category + size based)
  const inboundRaw       = getInboundFee(weightG, dimensions, `${category} ${title}`);
  const inboundPlacementFee = inboundRaw != null ? parseFloat(inboundRaw.toFixed(2)) : null;

  // 5. Total fees — null if FBA fee unknown (weight missing)
  const totalFees = fbaFee != null
    ? parseFloat((referralFee + fbaFee + (storageFee || 0) + (inboundPlacementFee || 0)).toFixed(2))
    : null;

  // 6. Net Profit
  const netProfit = totalFees != null
    ? parseFloat((sellingPrice - totalFees - cogs).toFixed(2))
    : null;

  // 7. Margin & ROI
  const margin = netProfit != null && sellingPrice > 0
    ? parseFloat(((netProfit / sellingPrice) * 100).toFixed(1)) : null;
  const roi = netProfit != null && cogs > 0
    ? parseFloat(((netProfit / cogs) * 100).toFixed(1)) : null;

  // 8. Break-even
  const breakEven = totalFees != null
    ? parseFloat((totalFees + cogs).toFixed(2)) : null;

  return {
    referralFee,
    referralRate: parseFloat((referralRate * 100).toFixed(1)),
    fbaFee,
    storageFee,
    inboundPlacementFee,
    totalFees,
    netProfit,
    roi,
    margin,
    breakEven,
    weightMissing: fbaFee == null,
  };
}

function bsrToSales(bsr, category = "") {
  if (!bsr || bsr <= 0) return null;
  const cat = category.toLowerCase();
  if (cat.includes("kitchen") || cat.includes("home")) {
    if (bsr <= 500) return 1200; if (bsr <= 1000) return 600;
    if (bsr <= 5000) return 300; if (bsr <= 10000) return 100;
    return Math.max(1, Math.round(1500000 / bsr));
  }
  if (bsr <= 1000) return 500; if (bsr <= 5000) return 200;
  if (bsr <= 10000) return 100; if (bsr <= 50000) return 25;
  return Math.max(1, Math.round(1000000 / bsr));
}

const detectRankSpike = (rankSeries) => {
  if (!rankSeries || rankSeries.length < 5) return false;
  const vals = rankSeries.map((p) => p.v).filter((v) => v > 0);
  if (vals.length < 5) return false;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std  = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  return std / mean > 0.8;
};

// ─── GET /health ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), db: !!supabaseAdmin });
});

// ─── POST /api/keepa/product ──────────────────────────────────────────────────
app.post("/api/keepa/product", async (req, res) => {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "KEEPA_API_KEY not configured on server" });

  const { asin, domain = 1, cogs = 0, manualWeightG = 0, manualReferralRate = null } = req.body;
  if (!asin || !/^[A-Z0-9]{10}$/i.test(asin.trim()))
    return res.status(400).json({ error: "Invalid ASIN. Must be 10 alphanumeric characters." });

  const cleanAsin = asin.trim().toUpperCase();
  const now       = Date.now();
  const cutoff90d = now - 90 * 24 * 60 * 60 * 1000;

  try {
    // Fetch only what we need — saves Keepa tokens
    // stats=90   → current values + 90-day min/max/avg + salesRankDrops
    // buybox=1   → Buy Box history (for current selling price)
    // rating=1   → rating + review count series
    // offers=0   → skip offer details (saves tokens, we use OFFER_COUNT from csv)
    // update=0   → use cached data (no extra token cost)
    const url = new URL("https://api.keepa.com/product");
    url.searchParams.set("key",    apiKey);
    url.searchParams.set("domain", String(domain));
    url.searchParams.set("asin",   cleanAsin);
    url.searchParams.set("stats",  "90");
    url.searchParams.set("buybox", "1");
    url.searchParams.set("rating", "1");

    const keepaResp = await fetch(url.toString());
    const keepaData = await keepaResp.json();

    // Log full Keepa response for debugging
    console.log("Keepa status:", keepaResp.status);
    console.log("Keepa tokensLeft:", keepaData.tokensLeft);
    console.log("Keepa error:", keepaData.error);

    if (!keepaResp.ok || keepaData.error) {
      const errMsg = keepaData.error === 1 ? "Request failed — check ASIN and API key"
        : keepaData.error === 2 ? "Not enough Keepa tokens — wait or upgrade plan"
        : keepaData.error === 3 ? "Invalid API key — check KEEPA_API_KEY in .env"
        : keepaData.error === 4 ? "API not accessible — check your Keepa subscription"
        : keepaData.error === 5 ? "Endpoint not available for your plan"
        : `Keepa error code: ${keepaData.error}`;
      console.error("Keepa API error:", keepaData);
      return res.status(400).json({ error: errMsg, keepaError: keepaData.error, details: keepaData });
    }

    const product = keepaData?.products?.[0];
    if (!product) return res.status(404).json({ error: "Product not found on Keepa." });

    const csv   = product.csv || [];
    const stats = product.stats || {};

    // ── 90-day filtered series — for GRAPHS and scoring only ────────────────
    const buyboxSeries = parsePriceSeries(csv[CSV.BUYBOX],        cutoff90d);
    const amazonSeries = parsePriceSeries(csv[CSV.AMAZON],        cutoff90d);
    const newSeries    = parsePriceSeries(csv[CSV.NEW],           cutoff90d);
    const newFbaSeries = parsePriceSeries(csv[CSV.NEW_FBA],       cutoff90d);
    const listSeries   = parsePriceSeries(csv[CSV.LIST_PRICE],    cutoff90d);
    const rankSeries   = parseCsvSeries(csv[CSV.SALES_RANK],      cutoff90d);
    const reviewSeries = parseCsvSeries(csv[CSV.REVIEW_COUNT],    cutoff90d);
    const offerSeries  = parseCsvSeries(csv[CSV.OFFER_COUNT_NEW], cutoff90d);
    const fbaCtSeries  = parseCsvSeries(csv[CSV.OFFER_COUNT_FBA], cutoff90d);
    const ratingSeries = parseCsvSeries(csv[CSV.RATING],          cutoff90d);

    // ── CURRENT selling price (for PROFIT CALCULATION only) ──────────────────
    // Priority: stats.current BuyBox → last BuyBox in series → FBA → New
    // This matches Amazon FBA Revenue Calculator which uses CURRENT price
    let sellingPrice = null;
    const curBB = currentFromStats(stats, CSV.BUYBOX);
    if (curBB > 0) sellingPrice = curBB / 100;
    if (!sellingPrice) { const v = lastValue(buyboxSeries);             if (v > 0) sellingPrice = v; }
    if (!sellingPrice) { const v = currentFromStats(stats, CSV.NEW_FBA);if (v > 0) sellingPrice = v / 100; }
    if (!sellingPrice) { const v = lastValue(newFbaSeries);             if (v > 0) sellingPrice = v; }
    if (!sellingPrice) { const v = currentFromStats(stats, CSV.NEW);    if (v > 0) sellingPrice = v / 100; }
    if (!sellingPrice) { const v = lastValue(newSeries);                if (v > 0) sellingPrice = v; }

    // ── 90-day median price (for GRAPHS reference line only) ─────────────────
    const medianBuyBox = medianOf(buyboxSeries) || medianOf(newSeries) || sellingPrice;

    // ── 90-day average BSR (for SCORING / product approval) ──────────────────
    const avgRank90 = rankSeries.length
      ? Math.round(rankSeries.reduce((s, p) => s + p.v, 0) / rankSeries.length)
      : null;

    // ── Current BSR (display only) ────────────────────────────────────────────
    let currentRank = currentFromStats(stats, CSV.SALES_RANK);
    if (!currentRank) currentRank = lastValue(rankSeries);

    // ── List price ────────────────────────────────────────────────────────────
    let listPrice = null;
    const curList = currentFromStats(stats, CSV.LIST_PRICE);
    if (curList > 0) listPrice = curList / 100;
    else { const v = lastValue(listSeries); if (v > 0) listPrice = v; }

    // ── MAP price ─────────────────────────────────────────────────────────────
    let mapPrice = null;
    const mapStats = currentFromStats(stats, CSV.MAP);
    if (mapStats > 0) mapPrice = mapStats / 100;

    // ── Rating — current value (ratings don't change much, current is fine) ────
    let currentRating = null;
    const ratingStats = currentFromStats(stats, CSV.RATING);
    if (ratingStats > 0) currentRating = ratingStats / 10;
    else { const v = lastValue(ratingSeries); if (v > 0) currentRating = v / 10; }

    // ── Reviews — current (cumulative, always current is latest) ──────────────
    let currentReviewCount = currentFromStats(stats, CSV.REVIEW_COUNT);
    if (!currentReviewCount) currentReviewCount = lastValue(reviewSeries);

    // ── FBA / offer counts — 90d average for stability ───────────────────────
    const currentOfferCount = currentFromStats(stats, CSV.OFFER_COUNT_NEW) ?? lastValue(offerSeries);
    const currentFbaCount   = currentFromStats(stats, CSV.OFFER_COUNT_FBA) ?? lastValue(fbaCtSeries);

    // ── 90d average FBA count (more stable than current snapshot) ────────────
    const avgFbaCount90 = fbaCtSeries.length > 0
      ? Math.round(fbaCtSeries.reduce((s, p) => s + p.v, 0) / fbaCtSeries.length)
      : currentFbaCount;

    // ── Amazon as seller ──────────────────────────────────────────────────────
    const amazonLastPrice = lastValue(amazonSeries);
    const amazonIsSeller  = (product.availabilityAmazon != null && product.availabilityAmazon >= 0)
                         || (amazonLastPrice != null && amazonLastPrice > 0);

    // ── 90d sales rank drops — best sales estimate ────────────────────────────
    // Keepa salesRankDrops = number of times rank improved = number of sales events
    // This is the most accurate sales estimate available

    // ── Category ──────────────────────────────────────────────────────────────
    const categoryTree = product.categoryTree || [];
    // deepest = most specific subcategory (e.g. "Wrist Watches", "T-Shirts", "Sunglasses")
    // root = broadest category (e.g. "Clothing, Shoes & Jewelry")
    // ALL levels joined — used for detection (gives maximum signal)
    const categoryName  = categoryTree.length ? categoryTree[categoryTree.length - 1].name : null;
    const rootCategory  = categoryTree.length ? categoryTree[0].name : null;
    const allCategories = categoryTree.map(c => c.name).join(" | ");
    console.log("Keepa categoryTree:", allCategories);
    console.log("Product title:", product.title?.slice(0, 80));

    // ── Monthly sales estimate ────────────────────────────────────────────────
    const drops30 = stats.salesRankDrops30 ?? null;
    const drops90 = stats.salesRankDrops90 ?? null;
    // salesRankDrops90 ÷ 3 = monthly average over 90 days (most accurate)
    // salesRankDrops30 = last 30 days (can be seasonal)
    // fallback = BSR-based estimate
    let monthlySalesEstimate = null;
    if (drops90 > 0)      monthlySalesEstimate = Math.round(drops90 / 3); // 90d avg = most stable
    else if (drops30 > 0) monthlySalesEstimate = drops30;
    else                  monthlySalesEstimate = bsrToSales(avgRank90, categoryName || rootCategory);

    // ── Product attributes ────────────────────────────────────────────────────
    const packageWeightG = product.packageWeight ?? null;
    const itemWeightG    = product.itemWeight ?? null;
    const dimensions     = product.packageDimension ?? null;
    // Use manual weight if Keepa has no weight data
    const effectiveWeightG = packageWeightG || itemWeightG || (manualWeightG > 0 ? manualWeightG : null);
    const isHazmat       = product.isHazMat === true;
    const isAdultProduct = product.isAdultProduct === true;
    // hasBuyBox: true if Buy Box series has recent data OR current stats show a BB price
    const hasBuyBox = (buyboxSeries.length > 0 && lastValue(buyboxSeries) > 0)
                   || (currentFromStats(stats, CSV.BUYBOX) > 0);
    // amazonBuyboxPct: % of time Amazon held BB in 90d (from buyBoxSellerIdHistory if available)
    // Keepa doesn't provide exact % directly — we detect from amazon series presence
    const amazonHeldBB90d = amazonSeries.length > 0 && amazonSeries.some(p => p.v > 0);

    // ── 90-day price stats (for display / graphs) ─────────────────────────────
    const stats90 = {
      avgBuyBox: medianBuyBox,
      minBuyBox: stats.min90?.[CSV.BUYBOX] > 0 ? stats.min90[CSV.BUYBOX] / 100 : null,
      maxBuyBox: stats.max90?.[CSV.BUYBOX] > 0 ? stats.max90[CSV.BUYBOX] / 100 : null,
      minRank:   stats.min90?.[CSV.SALES_RANK] ?? null,
      maxRank:   stats.max90?.[CSV.SALES_RANK] ?? null,
      avgRank:   avgRank90,
    };

    // ── Trends (graphs only) ──────────────────────────────────────────────────
    const priceSeries  = buyboxSeries.length ? buyboxSeries : newSeries;
    const priceTrend90 = priceSeries.length >= 2
      ? parseFloat((((priceSeries.at(-1).v - priceSeries[0].v) / priceSeries[0].v) * 100).toFixed(1)) : null;
    const bsrTrend90 = rankSeries.length >= 2
      ? parseFloat((((rankSeries.at(-1).v - rankSeries[0].v) / rankSeries[0].v) * 100).toFixed(1)) : null;

    // ── PROFIT CALCULATION — uses CURRENT price (matches Amazon FBA Calculator)
    // Graphs use 90d data. Scoring uses avgRank90. Profit uses current price.
    // detectTrueCategory: pass ALL category levels + product title for maximum accuracy
    // deepest subcategory (categoryName) is most specific, so check it first
    const rawCategory       = allCategories || categoryName || rootCategory || "";
    const effectiveCategory = detectTrueCategory(rawCategory, product.title || "");
    console.log("effectiveCategory:", effectiveCategory);
    const profitCalc = calcProfit({
      sellingPrice:      sellingPrice || 0,
      cogs,
      category:          effectiveCategory,
      title:             product.title || "",
      weightG:           effectiveWeightG,
      dimensions,
      monthlySales:      monthlySalesEstimate,
      manualReferralRate,
    });

    const monthlyRevenue = monthlySalesEstimate && sellingPrice
      ? parseFloat((monthlySalesEstimate * sellingPrice).toFixed(2)) : null;

    return res.json({
      asin: cleanAsin,
      title: product.title ?? null,
      brand: product.brand ?? null,
      manufacturer: product.manufacturer ?? null,
      model: product.model ?? null,
      category: categoryName,
      rootCategory,
      allCategories,
      image: product.imagesCSV
        ? `https://images-na.ssl-images-amazon.com/images/I/${product.imagesCSV.split(",")[0]}`
        : null,
      isHazmat, isAdultProduct, hasBuyBox,
      packageWeightG, itemWeightG, dimensions,
      partNumber: product.partNumber ?? null,
      eanList: product.eanList ?? null,
      upcList: product.upcList ?? null,
      pricing: {
        sellingPrice, medianBuyBox, listPrice, mapPrice,
        amazonPrice: lastValue(amazonSeries),
        newFbaPrice: lastValue(newFbaSeries),
        priceTrend90, stats90,
      },
      metrics: {
        currentRank, avgRank90, currentRating, currentReviewCount,
        currentOfferCount,
        currentFbaCount: avgFbaCount90 ?? currentFbaCount, // 90d avg for stability
        amazonIsSeller, hasBuyBox,
        monthlySalesEstimate, monthlyRevenue,
        salesRankDrops30: drops30, salesRankDrops90: drops90,
        rankSpike: detectRankSpike(rankSeries), bsrTrend90,
      },
      profitAnalysis: {
        priceUsed: sellingPrice || 0, ...profitCalc,
        note: cogs > 0 ? "Calculated with your COGS" : "Enter COGS for accurate profit",
      },
      series: {
        price:      downsample(buyboxSeries.length ? buyboxSeries : newSeries),
        rank:       downsample(rankSeries),
        reviews:    downsample(reviewSeries),
        offerCount: downsample(offerSeries),
        fbaCount:   downsample(fbaCtSeries),
      },
      tokensLeft: keepaData.tokensLeft ?? null,
    });
  } catch (err) {
    console.error("keepa-product error:", err);
    return res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

// ─── POST /api/search/save ────────────────────────────────────────────────────
app.post("/api/search/save", requireAuth, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: "Database not configured" });

  const {
    asin, title, brand, image, category,
    sellingPrice, medianPrice, profit, roi, margin,
    decision, score, maxScore, pct,
    referralFee, fbaFee, storageFee, totalFees, cogs, breakEven,
    rejectionReasons,
    currentRank, avgRank90, currentRating, currentReviewCount,
    currentFbaCount, monthlySalesEstimate, monthlyRevenue,
    isHazmat, amazonIsSeller,
  } = req.body;

  const { data, error } = await supabaseAdmin
    .from("asin_searches")
    .insert({
      user_id:           req.userId,
      asin:              asin?.toUpperCase(),
      title, brand, image, category,
      selling_price:     sellingPrice,
      median_price_90d:  medianPrice,
      profit_per_unit:   profit,
      roi_pct:           roi,
      margin_pct:        margin,
      decision,
      score,
      max_score:         maxScore,
      score_pct:         pct,
      referral_fee:      referralFee,
      fba_fee:           fbaFee,
      storage_fee:       storageFee,
      total_fees:        totalFees,
      cogs,
      break_even_price:  breakEven,
      rejection_reasons: rejectionReasons ?? [],
      current_bsr:       currentRank,
      avg_bsr_90d:       avgRank90,
      rating:            currentRating,
      review_count:      currentReviewCount,
      fba_seller_count:  currentFbaCount,
      monthly_sales_est: monthlySalesEstimate,
      monthly_revenue:   monthlyRevenue,
      is_hazmat:         isHazmat ?? false,
      amazon_is_seller:  amazonIsSeller ?? false,
    })
    .select()
    .single();

  if (error) { console.error("DB insert error:", error); return res.status(500).json({ error: error.message }); }
  return res.json({ ok: true, entry: data });
});

// ─── GET /api/search/history ──────────────────────────────────────────────────
app.get("/api/search/history", requireAuth, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: "Database not configured" });

  const limit  = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;

  const { data, error, count } = await supabaseAdmin
    .from("asin_searches")
    .select("*", { count: "exact" })
    .eq("user_id", req.userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ entries: data, total: count });
});

// ─── DELETE /api/search/clear/all ────────────────────────────────────────────
app.delete("/api/search/clear/all", requireAuth, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: "Database not configured" });
  const { error } = await supabaseAdmin
    .from("asin_searches").delete().eq("user_id", req.userId);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

// ─── DELETE /api/search/:id ───────────────────────────────────────────────────
app.delete("/api/search/:id", requireAuth, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: "Database not configured" });
  const { error } = await supabaseAdmin
    .from("asin_searches").delete()
    .eq("id", req.params.id)
    .eq("user_id", req.userId);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  Amazon Insight Hub backend running on port ${PORT}`);
  console.log(`   KEEPA_API_KEY:          ${process.env.KEEPA_API_KEY ? "✓ set" : "✗ NOT SET"}`);
  console.log(`   SUPABASE_URL:           ${supabaseUrl ? "✓ set" : "✗ NOT SET"}`);
  console.log(`   SUPABASE_SERVICE_ROLE:  ${supabaseKey ? "✓ set" : "✗ NOT SET"}`);
  console.log(`   SUPABASE_ANON_KEY:      ${supabaseAnonKey ? "✓ set" : "✗ NOT SET"}\n`);
});
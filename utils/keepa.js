// ─── Keepa CSV Index Map ──────────────────────────────────────────────────────
export const CSV = {
  AMAZON: 0, NEW: 1, USED: 2, SALES_RANK: 3, LIST_PRICE: 4,
  NEW_FBA: 10, OFFER_COUNT_NEW: 11, OFFER_COUNT_FBA: 15,
  RATING: 16, REVIEW_COUNT: 17, BUYBOX: 18, MAP: 19,
};

const keepaMinutesToMs = (km) => (km + 21564000) * 60 * 1000;

export function parseCsvSeries(csv, cutoffMs = null) {
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

export const parsePriceSeries = (csv, cutoff) =>
  parseCsvSeries(csv, cutoff).map((p) => ({ t: p.t, v: parseFloat((p.v / 100).toFixed(2)) }));

export const lastValue = (s) => (s?.length ? s[s.length - 1].v : null);

export const currentFromStats = (stats, idx) => {
  const v = stats?.current?.[idx];
  return v == null || v === -1 ? null : v;
};

export const medianOf = (series) => {
  const vals = series.map((p) => p.v).filter((v) => v > 0).sort((a, b) => a - b);
  if (!vals.length) return null;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
};

export const downsample = (series, max = 90) => {
  if (!series || series.length <= max) return series;
  const step = Math.ceil(series.length / max);
  const out  = [];
  for (let i = 0; i < series.length; i += step) out.push(series[i]);
  if (out[out.length - 1] !== series[series.length - 1]) out.push(series[series.length - 1]);
  return out;
};

export const detectRankSpike = (rankSeries) => {
  if (!rankSeries || rankSeries.length < 5) return false;
  const vals = rankSeries.map((p) => p.v).filter((v) => v > 0);
  if (vals.length < 5) return false;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std  = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  return std / mean > 0.8;
};

export function bsrToSales(bsr, category = "") {
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

// ─── Fee Calculation Engine ───────────────────────────────────────────────────

function hasWord(text, word) {
  const escaped = word.replace(/[-/]/g, "\\$&");
  return new RegExp("(?<![a-zA-Z])" + escaped + "(?![a-zA-Z])", "i").test(text);
}

export function detectTrueCategory(allCategoryLevels, title) {
  const full = `${allCategoryLevels} ${title}`.toLowerCase();
  const t    = (title || "").toLowerCase();

  if (full.includes("wrist watch") || full.includes("wristwatches") ||
      full.includes("pocket watch") || full.includes("smartwatch") ||
      full.includes("smart watch") || full.includes("chronograph") ||
      hasWord(t, "watch") || hasWord(t, "watches") || hasWord(t, "timepiece"))
    return "watch";

  if (full.includes("sunglasses") || full.includes("sunglass") ||
      full.includes("goggles") || full.includes("polarized lens") ||
      full.includes("uv400"))
    return "sunglasses";

  if (full.includes("running shoe") || full.includes("dress shoe") ||
      full.includes("athletic shoe") || full.includes("walking shoe") ||
      hasWord(full, "sneakers") || hasWord(full, "sneaker") ||
      hasWord(full, "boots") || hasWord(full, "sandals") ||
      hasWord(full, "slippers") || hasWord(full, "footwear") ||
      (hasWord(t, "shoes") && !t.includes("shoe rack") && !t.includes("shoe box")) ||
      (hasWord(t, "shoe") && !t.includes("shoe box")))
    return "shoes";

  if (full.includes("handbag") || full.includes("shoulder bag") ||
      full.includes("tote bag") || full.includes("crossbody bag") ||
      full.includes("clutch bag") || full.includes("wristlet") ||
      hasWord(t, "purse") || hasWord(t, "handbag"))
    return "shoes_handbags";

  if (full.includes("backpacks") || full.includes("backpack") ||
      full.includes("rucksack") || full.includes("carry-on") ||
      full.includes("suitcase") || full.includes("luggage") ||
      full.includes("duffel bag") || full.includes("duffle bag") ||
      full.includes("briefcase") || full.includes("laptop bag") ||
      full.includes("messenger bag") || full.includes("school bag") ||
      full.includes("gym bag") || full.includes("travel bag") ||
      full.includes("diaper bag"))
    return "luggage";

  if (full.includes("necklaces") || full.includes("necklace") ||
      full.includes("bracelets") || full.includes("bracelet") ||
      full.includes("earrings") || full.includes("earring") ||
      full.includes("pendants") || full.includes("pendant") ||
      full.includes("fine jewelry") || full.includes("fashion jewelry") ||
      full.includes("bangles") || full.includes("cufflinks") ||
      (full.includes("ring") && !full.includes("ring light") &&
       !full.includes("boxing ring") && !full.includes("o-ring") &&
       !full.includes("curtain ring") && !full.includes("key ring")))
    return "jewelry";

  if (full.includes("t-shirts") || full.includes("dress shirts") ||
      full.includes("polo shirts") || full.includes("tank tops") ||
      full.includes("sweatshirts") || full.includes("hoodies") ||
      full.includes("activewear") || full.includes("swimwear") ||
      hasWord(t, "shirt") || hasWord(t, "t-shirt") || hasWord(t, "tshirt") ||
      hasWord(t, "polo") || hasWord(t, "blouse") ||
      hasWord(t, "hoodie") || hasWord(t, "sweatshirt") || hasWord(t, "sweater") ||
      hasWord(t, "jeans") || hasWord(t, "pants") || hasWord(t, "trouser") ||
      hasWord(t, "shorts") || hasWord(t, "jacket") || hasWord(t, "coat") ||
      hasWord(t, "dress") || hasWord(t, "skirt") || hasWord(t, "legging") ||
      hasWord(t, "pajama") || hasWord(t, "vest"))
    return "clothing";

  if (full.includes("earbud headphone") || full.includes("in-ear headphone") ||
      full.includes("over-ear headphone") || full.includes("noise cancelling") ||
      hasWord(full, "earbuds") || hasWord(full, "earphones") ||
      hasWord(full, "headphones") || hasWord(full, "headset") ||
      full.includes("tws earbuds") || full.includes("phone cases") ||
      full.includes("charging cables") || full.includes("power banks"))
    return "electronics_accessories";

  if (full.includes("laptops") || full.includes("tablets") ||
      full.includes("televisions") || full.includes("monitors") ||
      full.includes("consumer electronics") || full.includes("computers") ||
      hasWord(t, "laptop") || hasWord(t, "tablet") ||
      hasWord(t, "television") || hasWord(t, "monitor"))
    return "consumer_electronics";

  if (full.includes("baby product") || full.includes("baby gear") ||
      full.includes("diaper") || full.includes("stroller") ||
      hasWord(t, "baby") || hasWord(t, "infant") || hasWord(t, "toddler"))
    return "baby";

  if (full.includes("skin care") || full.includes("hair care") ||
      full.includes("personal care") || full.includes("beauty") ||
      hasWord(t, "shampoo") || hasWord(t, "moisturizer") || hasWord(t, "serum"))
    return "beauty";

  if (full.includes("vitamins") || full.includes("supplements") ||
      full.includes("health care") || full.includes("household supplies") ||
      hasWord(t, "vitamin") || hasWord(t, "supplement"))
    return "health";

  if (full.includes("grocery") || full.includes("gourmet food") ||
      full.includes("snack food") || full.includes("beverages"))
    return "grocery";

  if (full.includes("sports") || full.includes("outdoor recreation") ||
      full.includes("exercise") || full.includes("fitness"))
    return "sports";

  if (full.includes("toys") || full.includes("board games") ||
      hasWord(t, "toy") || hasWord(t, "lego") || hasWord(t, "puzzle"))
    return "toys";

  if (full.includes("pet supplies") || full.includes("dog food") ||
      full.includes("cat food") || full.includes("pet bed"))
    return "pet";

  if (full.includes("kitchen") || full.includes("home & kitchen") ||
      full.includes("cookware") || full.includes("bedding"))
    return "home_kitchen";

  if (full.includes("furniture") || hasWord(t, "sofa") || hasWord(t, "mattress"))
    return "furniture";

  if (full.includes("tools & home") || full.includes("power tools") ||
      full.includes("home improvement"))
    return "tools";

  if (full.includes("office products") || full.includes("office supplies"))
    return "office";

  if (full.includes("automotive") || full.includes("powersports"))
    return "automotive";

  if (full.includes("industrial") || full.includes("scientific"))
    return "industrial";

  if (full.includes("books") || full.includes("kindle"))
    return "books";

  if (full.includes("musical instruments") ||
      hasWord(t, "guitar") || hasWord(t, "piano") || hasWord(t, "violin"))
    return "musical";

  if (full.includes("large appliance") || full.includes("refrigerator") ||
      full.includes("washing machine"))
    return "appliance";

  return "everything_else";
}

export function calcReferralFee(category = "", price = 0, title = "") {
  const trueCategory = detectTrueCategory(category, title);
  const name = trueCategory.toLowerCase();
  const p    = price;
  const minFee = 0.30;

  if (name === "amazon_device")        return Math.max(p * 0.45, minFee);
  if (name === "automotive")           return Math.max(p * 0.12, minFee);
  if (name === "baby")                 return Math.max(p * (p <= 10 ? 0.08 : 0.15), minFee);
  if (name === "beauty")               return Math.max(p * (p <= 10 ? 0.08 : 0.15), minFee);
  if (name === "books")                return p * 0.15;
  if (name === "camera")               return Math.max(p * 0.08, minFee);

  if (name === "clothing") {
    const rate = p <= 15 ? 0.05 : p <= 20 ? 0.10 : 0.17;
    return Math.max(p * rate, minFee);
  }

  if (name === "shoes" || name === "shoes_handbags" || name === "sunglasses") {
    const rate = p <= 75 ? 0.05 : p <= 150 ? 0.10 : 0.15;
    return Math.max(p * rate, minFee);
  }

  if (name === "consumer_electronics") return Math.max(p * 0.08, minFee);

  if (name === "electronics_accessories") {
    const fee = p <= 100 ? p * 0.15 : (100 * 0.15) + ((p - 100) * 0.08);
    return Math.max(fee, minFee);
  }

  if (name === "furniture")            return Math.max(p * (p <= 200 ? 0.15 : 0.10), minFee);
  if (name === "gift_cards")           return p * 0.20;
  if (name === "grocery")              return p * (p <= 15 ? 0.08 : 0.15);
  if (name === "health")               return Math.max(p * (p <= 10 ? 0.08 : 0.15), minFee);
  if (name === "home_kitchen")         return Math.max(p * 0.15, minFee);
  if (name === "industrial")           return Math.max(p * 0.12, minFee);

  if (name === "jewelry") {
    const fee = p <= 250 ? p * 0.20 : (250 * 0.20) + ((p - 250) * 0.05);
    return Math.max(fee, minFee);
  }

  if (name === "appliance") {
    const rate = p <= 300 ? 0.08 : p <= 500 ? 0.15 : 0.08;
    return Math.max(p * rate, minFee);
  }

  if (name === "luggage")              return Math.max(p * 0.15, minFee);
  if (name === "musical")              return Math.max(p * 0.15, minFee);
  if (name === "office")               return Math.max(p * 0.15, minFee);
  if (name === "pet")                  return Math.max(p * 0.15, minFee);
  if (name === "sports")               return Math.max(p * 0.15, minFee);
  if (name === "tools")                return Math.max(p * 0.15, minFee);
  if (name === "toys")                 return Math.max(p * 0.15, minFee);
  if (name === "handmade")             return Math.max(p * 0.15, 1.00);

  if (name === "watch") {
    const fee = p <= 1500 ? p * 0.16 : (1500 * 0.16) + ((p - 1500) * 0.03);
    return Math.max(fee, 2.00);
  }

  return Math.max(p * 0.15, minFee);
}

function isApparel(category = "") {
  const cat = category.toLowerCase();
  return cat.includes("apparel") || cat.includes("clothing") ||
         cat.includes("shoes") || cat.includes("handbag") ||
         cat.includes("fashion") || cat.includes("sunglasses");
}

// Amazon 2026 FBA fee table (non-peak, effective Jan 15, 2026)
// Band: 0=<$10 | 1=$10-$50 | 2=>$50
export function getFbaFee(weightG = null, dimensions = null, category = "", sellingPrice = 0) {
  if (!weightG || weightG <= 0) return null;

  const weightOz = weightG / 28.3495;
  const weightLb = weightG / 453.592;
  const apparel  = isApparel(category);

  let dimWeightLb = 0;
  if (dimensions?.length && dimensions?.width && dimensions?.height) {
    const lIn = (dimensions.length / 10) * 0.393701;
    const wIn = (dimensions.width  / 10) * 0.393701;
    const hIn = (dimensions.height / 10) * 0.393701;
    dimWeightLb = (lIn * wIn * hIn) / 139;
  }

  const billableOz = Math.max(weightOz, dimWeightLb * 16);
  const billableLb = Math.max(weightLb, dimWeightLb);
  const p    = sellingPrice || 0;
  const band = p < 10 ? 0 : p <= 50 ? 1 : 2;

  if (apparel) {
    if (billableOz <=  2) return [2.62, 3.51, 3.77][band];
    if (billableOz <=  4) return [2.64, 3.54, 3.80][band];
    if (billableOz <=  6) return [2.68, 3.59, 3.85][band];
    if (billableOz <=  8) return [2.81, 3.69, 3.95][band];
    if (billableOz <= 10) return [3.00, 3.91, 4.17][band];
    if (billableOz <= 12) return [3.10, 4.09, 4.35][band];
    if (billableOz <= 14) return [3.20, 4.20, 4.46][band];
    if (billableOz <= 16) return [3.30, 4.25, 4.51][band];
    if (billableLb <= 1.00) return [3.48, 4.30, 4.56][band];
    if (billableLb <= 1.25) return [5.05, 5.87, 6.13][band];
    if (billableLb <= 1.50) return [5.22, 6.04, 6.30][band];
    if (billableLb <= 1.75) return [5.32, 6.14, 6.40][band];
    if (billableLb <= 2.00) return [5.43, 6.25, 6.51][band];
    if (billableLb <= 2.25) return [5.78, 6.60, 6.86][band];
    if (billableLb <= 2.50) return [5.90, 6.72, 6.98][band];
    if (billableLb <= 2.75) return [5.95, 6.77, 7.03][band];
    if (billableLb <= 3.00) return [6.08, 6.90, 7.16][band];
    const appBase = [6.15, 6.97, 7.23][band];
    return parseFloat((appBase + 0.16 * Math.ceil((billableLb - 3) * 2)).toFixed(2));
  }

  // Non-apparel standard
  if (billableOz <=  2) return [2.43, 3.32, 3.58][band];
  if (billableOz <=  4) return [2.49, 3.42, 3.68][band];
  if (billableOz <=  6) return [2.56, 3.45, 3.71][band];
  if (billableOz <=  8) return [2.66, 3.54, 3.80][band];
  if (billableOz <= 10) return [2.77, 3.68, 3.94][band];
  if (billableOz <= 12) return [2.82, 3.78, 4.04][band];
  if (billableOz <= 14) return [2.92, 3.91, 4.17][band];
  if (billableOz <= 16) return [2.95, 3.96, 4.22][band];
  if (billableLb <= 1.00) return [2.91, 3.73, 3.99][band];
  if (billableLb <= 1.25) return [4.22, 5.04, 5.30][band];
  if (billableLb <= 1.50) return [4.60, 5.42, 5.68][band];
  if (billableLb <= 1.75) return [4.75, 5.57, 5.83][band];
  if (billableLb <= 2.00) return [5.00, 5.82, 6.08][band];
  if (billableLb <= 2.25) return [5.10, 5.92, 6.18][band];
  if (billableLb <= 2.50) return [5.28, 6.10, 6.36][band];
  if (billableLb <= 2.75) return [5.44, 6.26, 6.52][band];
  if (billableLb <= 3.00) return [5.85, 6.67, 6.93][band];
  const stdBase = [6.15, 6.97, 7.23][band];
  return parseFloat((stdBase + 0.08 * Math.ceil((billableLb - 3) * 4)).toFixed(2));
}

export function getInboundFee(weightG = null, dimensions = null) {
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

  if (billableOz <=  8) return 0.23;
  if (billableOz <= 16) return 0.36;
  if (billableLb <= 0.75) return 0.30;
  if (billableLb <= 1.5)  return 0.37;
  if (billableLb <= 3)    return 0.47;
  if (billableLb <= 5)    return 0.57;
  if (billableLb <= 7)    return 0.69;
  if (billableLb <= 10)   return 0.81;
  return 0.97;
}

export function calcProfit({
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

  let referralFee, referralRate;
  if (manualReferralRate != null && manualReferralRate > 0) {
    referralRate = manualReferralRate / 100;
    referralFee  = parseFloat(Math.max(sellingPrice * referralRate, 0.30).toFixed(2));
  } else {
    referralFee  = parseFloat(calcReferralFee(category, sellingPrice, title).toFixed(2));
    referralRate = sellingPrice > 0 ? referralFee / sellingPrice : 0.15;
  }

  const fbaFeeRaw = getFbaFee(weightG, dimensions, category, sellingPrice || 0);
  const fbaFee    = fbaFeeRaw != null ? parseFloat(fbaFeeRaw.toFixed(2)) : null;

  let storageFee = null;
  if (dimensions?.length && dimensions?.width && dimensions?.height) {
    const lIn     = (dimensions.length / 10) * 0.393701;
    const wIn     = (dimensions.width  / 10) * 0.393701;
    const hIn     = (dimensions.height / 10) * 0.393701;
    const cubicFt = (lIn * wIn * hIn) / 1728;
    const units   = Math.max(monthlySales || 30, 1);
    storageFee    = parseFloat(((cubicFt * 0.78) / units).toFixed(2));
  } else if (weightG && weightG > 0) {
    const weightLb   = weightG / 453.592;
    const estCubicFt = weightLb / 12;
    const units      = Math.max(monthlySales || 30, 1);
    storageFee       = parseFloat(((estCubicFt * 0.78) / units).toFixed(2));
  }

  const inboundRaw          = getInboundFee(weightG, dimensions);
  const inboundPlacementFee = inboundRaw != null ? parseFloat(inboundRaw.toFixed(2)) : null;

  const totalFees = fbaFee != null
    ? parseFloat((referralFee + fbaFee + (storageFee || 0) + (inboundPlacementFee || 0)).toFixed(2))
    : null;

  const netProfit = totalFees != null
    ? parseFloat((sellingPrice - totalFees - cogs).toFixed(2))
    : null;

  const margin = netProfit != null && sellingPrice > 0
    ? parseFloat(((netProfit / sellingPrice) * 100).toFixed(1)) : null;

  const roi = netProfit != null && cogs > 0
    ? parseFloat(((netProfit / cogs) * 100).toFixed(1)) : null;

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

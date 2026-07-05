import { env } from "../../config/env.js";
import { AppError } from "../../utils/response.js";
import prisma from "../../db/prisma.js";

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
import {
  CSV,
  parseCsvSeries,
  parsePriceSeries,
  lastValue,
  currentFromStats,
  medianOf,
  downsample,
  detectRankSpike,
  bsrToSales,
  detectTrueCategory,
  calcProfit,
} from "../../utils/keepa.js";

const KEEPA_ERROR_MESSAGES = {
  1: "Request failed — check ASIN and API key",
  2: "Not enough Keepa tokens — wait or upgrade plan",
  3: "Invalid API key — check KEEPA_API_KEY in .env",
  4: "API not accessible — check your Keepa subscription",
  5: "Endpoint not available for your plan",
};

export const keepaService = {
  /**
   * Fetch product data from Keepa and compute profit analysis.
   * @param {{ asin, domain, cogs, manualWeightG, manualReferralRate }} dto
   */
  async fetchProduct({ asin, domain, cogs, manualWeightG, manualReferralRate }) {
    const cleanAsin = asin.trim().toUpperCase();
    const now       = Date.now();
    const cutoff90d = now - 90 * 24 * 60 * 60 * 1000;

    // ── Cache lookup ─────────────────────────────────────────────────────────
    let product    = null;
    let tokensLeft = null;

    const cached = await prisma.keepaCache.findUnique({
      where: { asin_domain: { asin: cleanAsin, domain } },
    }).catch(() => null);

    if (cached && (now - new Date(cached.cachedAt).getTime()) < CACHE_TTL_MS) {
      console.log("[Keepa] cache HIT:", cleanAsin);
      product    = cached.rawProduct;
      tokensLeft = cached.tokensLeft;
    } else {
      // ── Keepa API request ──────────────────────────────────────────────────
      const url = new URL("https://api.keepa.com/product");
      url.searchParams.set("key",    env.KEEPA_API_KEY);
      url.searchParams.set("domain", String(domain));
      url.searchParams.set("asin",   cleanAsin);
      url.searchParams.set("stats",  "90");
      url.searchParams.set("buybox", "1");
      url.searchParams.set("rating", "1");
      url.searchParams.set("offers", "20");

      const keepaResp = await fetch(url.toString());
      const keepaData = await keepaResp.json();

      console.log("[Keepa] cache MISS — status:", keepaResp.status, "| tokensLeft:", keepaData.tokensLeft);

      if (!keepaResp.ok || keepaData.error) {
        const msg = KEEPA_ERROR_MESSAGES[keepaData.error] ?? `Keepa error code: ${keepaData.error}`;
        throw new AppError(msg, 400, "KEEPA_ERROR", { keepaError: keepaData.error });
      }

      product = keepaData?.products?.[0];
      if (!product) throw new AppError("Product not found on Keepa", 404, "PRODUCT_NOT_FOUND");

      tokensLeft = keepaData.tokensLeft ?? null;

      // Store in cache (fire-and-forget — don't block response)
      prisma.keepaCache.upsert({
        where:  { asin_domain: { asin: cleanAsin, domain } },
        create: { asin: cleanAsin, domain, rawProduct: product, tokensLeft, cachedAt: new Date() },
        update: { rawProduct: product, tokensLeft, cachedAt: new Date() },
      }).catch((e) => console.warn("[Keepa] cache write failed:", e.message));
    }

    const csv   = product.csv || [];
    const stats = product.stats || {};

    // ── Parse 90-day series ──────────────────────────────────────────────────
    const buyboxSeries = parsePriceSeries(csv[CSV.BUYBOX],        cutoff90d);
    const amazonSeries = parsePriceSeries(csv[CSV.AMAZON],        cutoff90d);
    const newSeries    = parsePriceSeries(csv[CSV.NEW],           cutoff90d);
    const newFbaSeries = parsePriceSeries(csv[CSV.NEW_FBA],       cutoff90d);
    const listSeries   = parsePriceSeries(csv[CSV.LIST_PRICE],    cutoff90d);
    const rankSeries     = parseCsvSeries(csv[CSV.SALES_RANK], cutoff90d);
    const rankSeriesFull = parseCsvSeries(csv[CSV.SALES_RANK]);   // no time cutoff — for currentRank fallback
    const reviewSeries = parseCsvSeries(csv[CSV.REVIEW_COUNT],    cutoff90d);
    const offerSeries  = parseCsvSeries(csv[CSV.OFFER_COUNT_NEW], cutoff90d);
    const fbaCtSeries  = parseCsvSeries(csv[CSV.OFFER_COUNT_FBA], cutoff90d);
    const ratingSeries = parseCsvSeries(csv[CSV.RATING],          cutoff90d);

    // ── Current selling price ────────────────────────────────────────────────
    let sellingPrice = null;
    const curBB = currentFromStats(stats, CSV.BUYBOX);
    if (curBB > 0) sellingPrice = curBB / 100;
    if (!sellingPrice) { const v = lastValue(buyboxSeries);              if (v > 0) sellingPrice = v; }
    if (!sellingPrice) { const v = currentFromStats(stats, CSV.NEW_FBA); if (v > 0) sellingPrice = v / 100; }
    if (!sellingPrice) { const v = lastValue(newFbaSeries);              if (v > 0) sellingPrice = v; }
    if (!sellingPrice) { const v = currentFromStats(stats, CSV.NEW);     if (v > 0) sellingPrice = v / 100; }
    if (!sellingPrice) { const v = lastValue(newSeries);                 if (v > 0) sellingPrice = v; }

    const medianBuyBox = medianOf(buyboxSeries) || medianOf(newSeries) || sellingPrice;

    // ── BSR ──────────────────────────────────────────────────────────────────
    const avgRank90 = rankSeries.length
      ? Math.round(rankSeries.reduce((s, p) => s + p.v, 0) / rankSeries.length)
      : null;

    // currentRank: stats.current > 90d series last value > full series last value > salesRanks
    let currentRank = currentFromStats(stats, CSV.SALES_RANK);
    if (!currentRank) currentRank = lastValue(rankSeries);
    if (!currentRank) currentRank = lastValue(rankSeriesFull);
    // salesRanks map: { categoryId: bsr } — take the smallest BSR (most specific / relevant)
    if (!currentRank && product.salesRanks && typeof product.salesRanks === "object") {
      const bsrs = Object.values(product.salesRanks).filter(v => v > 0);
      if (bsrs.length) currentRank = Math.min(...bsrs);
    }

    // ── Prices ───────────────────────────────────────────────────────────────
    let listPrice = null;
    const curList = currentFromStats(stats, CSV.LIST_PRICE);
    if (curList > 0) listPrice = curList / 100;
    else { const v = lastValue(listSeries); if (v > 0) listPrice = v; }

    let mapPrice = null;
    const mapStats = currentFromStats(stats, CSV.MAP);
    if (mapStats > 0) mapPrice = mapStats / 100;

    // ── Rating & Reviews ─────────────────────────────────────────────────────
    let currentRating = null;
    const ratingStats = currentFromStats(stats, CSV.RATING);
    if (ratingStats > 0) currentRating = ratingStats / 10;
    else { const v = lastValue(ratingSeries); if (v > 0) currentRating = v / 10; }

    let currentReviewCount = currentFromStats(stats, CSV.REVIEW_COUNT);
    if (!currentReviewCount) currentReviewCount = lastValue(reviewSeries);

    // ── Seller counts ────────────────────────────────────────────────────────
    const currentOfferCount = currentFromStats(stats, CSV.OFFER_COUNT_NEW) ?? lastValue(offerSeries);
    const currentFbaCount   = currentFromStats(stats, CSV.OFFER_COUNT_FBA) ?? lastValue(fbaCtSeries);
    const avgFbaCount90     = fbaCtSeries.length > 0
      ? Math.round(fbaCtSeries.reduce((s, p) => s + p.v, 0) / fbaCtSeries.length)
      : currentFbaCount;

    // FBA count from live offers (most accurate — counts current new FBA sellers)
    let fbaCountFromOffers = null;
    if (product.liveOffersOrder?.length && product.offers?.length) {
      const liveOffers = product.liveOffersOrder.map(i => product.offers[i]).filter(Boolean);
      fbaCountFromOffers = liveOffers.filter(o => o.isFBA && o.condition === 1).length || null;
    }
    const resolvedFbaCount = fbaCountFromOffers ?? avgFbaCount90 ?? currentFbaCount;
    console.log("[Keepa] FBA count — live offers:", fbaCountFromOffers, "| avg90:", avgFbaCount90, "| resolved:", resolvedFbaCount);

    const amazonLastPrice = lastValue(amazonSeries);
    const amazonIsSeller  = (product.availabilityAmazon != null && product.availabilityAmazon >= 0)
                         || (amazonLastPrice != null && amazonLastPrice > 0);

    // ── Category ─────────────────────────────────────────────────────────────
    const categoryTree = product.categoryTree || [];
    const categoryName  = categoryTree.length ? categoryTree[categoryTree.length - 1].name : null;
    const rootCategory  = categoryTree.length ? categoryTree[0].name : null;
    const allCategories = categoryTree.map((c) => c.name).join(" | ");

    console.log("[Keepa] categoryTree:", allCategories);
    console.log("[Keepa] title:", product.title?.slice(0, 80));

    // ── Monthly sales estimate ────────────────────────────────────────────────
    const monthlySold = product.monthlySold ?? null;  // Amazon "Bought in past month" badge
    const drops30 = stats.salesRankDrops30 ?? null;
    const drops90 = stats.salesRankDrops90 ?? null;

    // Method 1: count rank drops (BSR decreases = sales) in last 30 days from series
    const cutoff30d     = now - 30 * 24 * 60 * 60 * 1000;
    const rankSeries30  = parseCsvSeries(csv[CSV.SALES_RANK], cutoff30d);
    let seriesDrops30   = 0;
    for (let i = 1; i < rankSeries30.length; i++) {
      if (rankSeries30[i].v < rankSeries30[i - 1].v) seriesDrops30++;
    }

    // Method 2: same from 90-day series → divide by 3
    let seriesDrops90 = 0;
    for (let i = 1; i < rankSeries.length; i++) {
      if (rankSeries[i].v < rankSeries[i - 1].v) seriesDrops90++;
    }

    let monthlySalesEstimate = null;
    if (monthlySold > 0)                                         monthlySalesEstimate = monthlySold;  // Amazon's own "bought in past month"
    else if (seriesDrops30 > 0)                                  monthlySalesEstimate = seriesDrops30;
    else if (drops30 > 0 && drops90 > 0 && drops30 < drops90)   monthlySalesEstimate = drops30;
    else if (drops90 > 0)                                        monthlySalesEstimate = Math.round(drops90 / 3);
    else if (seriesDrops90 > 0)                                  monthlySalesEstimate = Math.round(seriesDrops90 / 3);
    else                                                         monthlySalesEstimate = bsrToSales(avgRank90, categoryName || rootCategory);

    console.log("[Keepa] monthlySold:", monthlySold, "| series30:", seriesDrops30, "| drops30:", drops30, "| drops90:", drops90, "| estimate:", monthlySalesEstimate);

    // ── Product attributes ────────────────────────────────────────────────────
    const packageWeightG   = product.packageWeight ?? null;
    const itemWeightG      = product.itemWeight ?? null;
    const dimensions       = product.packageDimension ?? null;
    const effectiveWeightG = packageWeightG || itemWeightG || (manualWeightG > 0 ? manualWeightG : null);
    const isHazmat         = product.isHazMat === true;
    const isAdultProduct   = product.isAdultProduct === true;
    const hasBuyBox        = (buyboxSeries.length > 0 && lastValue(buyboxSeries) > 0)
                          || (currentFromStats(stats, CSV.BUYBOX) > 0);

    // ── Trends ───────────────────────────────────────────────────────────────
    const priceSeries  = buyboxSeries.length ? buyboxSeries : newSeries;
    const priceTrend90 = priceSeries.length >= 2
      ? parseFloat((((priceSeries.at(-1).v - priceSeries[0].v) / priceSeries[0].v) * 100).toFixed(1)) : null;
    const bsrTrend90 = rankSeries.length >= 2
      ? parseFloat((((rankSeries.at(-1).v - rankSeries[0].v) / rankSeries[0].v) * 100).toFixed(1)) : null;

    // ── Profit calculation ────────────────────────────────────────────────────
    const rawCategory       = allCategories || categoryName || rootCategory || "";
    const effectiveCategory = detectTrueCategory(rawCategory, product.title || "");
    console.log("[Keepa] effectiveCategory:", effectiveCategory);

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

    // ── Build response ────────────────────────────────────────────────────────
    return {
      asin: cleanAsin,
      title:        product.title ?? null,
      brand:        product.brand ?? null,
      manufacturer: product.manufacturer ?? null,
      model:        product.model ?? null,
      category:     categoryName,
      rootCategory,
      allCategories,
      image: product.imagesCSV
        ? `https://images-na.ssl-images-amazon.com/images/I/${product.imagesCSV.split(",")[0]}`
        : null,
      isHazmat, isAdultProduct, hasBuyBox,
      packageWeightG, itemWeightG, dimensions,
      partNumber: product.partNumber ?? null,
      eanList:    product.eanList ?? null,
      upcList:    product.upcList ?? null,
      pricing: {
        sellingPrice, medianBuyBox, listPrice, mapPrice,
        amazonPrice:  lastValue(amazonSeries),
        newFbaPrice:  lastValue(newFbaSeries),
        priceTrend90,
        stats90: {
          avgBuyBox: medianBuyBox,
          minBuyBox: (() => {
            // Try Keepa stats first; fall back to series min
            const s = stats.min90?.[CSV.BUYBOX];
            if (s > 0) return parseFloat((s / 100).toFixed(2));
            const vals = priceSeries.map(p => p.v).filter(v => v > 0);
            return vals.length ? parseFloat(Math.min(...vals).toFixed(2)) : null;
          })(),
          maxBuyBox: (() => {
            const s = stats.max90?.[CSV.BUYBOX];
            if (s > 0) return parseFloat((s / 100).toFixed(2));
            const vals = priceSeries.map(p => p.v).filter(v => v > 0);
            return vals.length ? parseFloat(Math.max(...vals).toFixed(2)) : null;
          })(),
          minRank:   stats.min90?.[CSV.SALES_RANK] ?? null,
          maxRank:   stats.max90?.[CSV.SALES_RANK] ?? null,
          avgRank:   avgRank90,
        },
      },
      metrics: {
        currentRank, avgRank90, currentRating, currentReviewCount,
        currentOfferCount,
        currentFbaCount: resolvedFbaCount,
        amazonIsSeller, hasBuyBox,
        monthlySalesEstimate, monthlyRevenue,
        salesRankDrops30: drops30, salesRankDrops90: drops90,
        rankSpike: detectRankSpike(rankSeries), bsrTrend90,
      },
      profitAnalysis: {
        priceUsed: sellingPrice || 0,
        ...profitCalc,
        note: cogs > 0 ? "Calculated with your COGS" : "Enter COGS for accurate profit",
      },
      series: {
        price:      downsample(buyboxSeries.length ? buyboxSeries : newSeries),
        rank:       downsample(rankSeries),
        reviews:    downsample(reviewSeries),
        offerCount: downsample(offerSeries),
        fbaCount:   downsample(fbaCtSeries),
      },
      tokensLeft,
    };
  },
};

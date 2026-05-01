/**
 * ============================================
 * REWE API Service
 * ============================================
 *
 * Integration mit REWE Online-Shop für:
 * - Produktsuche (Zutaten → REWE Produkte)
 * - Preisabfrage & Packungsgrößen
 * - Direkt-Links zum REWE Online-Shop
 *
 * HINWEIS: REWE bietet keine offizielle API an.
 * Dieser Service nutzt die öffentlich zugängliche Web-API,
 * die auch die REWE-Website verwendet. Diese kann sich ändern.
 */

import { isReweEnabled } from '../config/settings.js';
import { getAIProvider } from './ai/provider.js';

const REWE_SEARCH_URL = 'https://www.rewe.de/shop/api/products';
const REWE_SHOP_BASE = 'https://www.rewe.de/shop';

/**
 * Erzeugt einen URL-Slug aus einem Produktnamen
 * "Barilla Spaghetti Nr.5 500g" → "barilla-spaghetti-nr-5-500g"
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Erzeugt die REWE-Shop-URL für ein Produkt
 * @param {string} productName - Produktname
 * @param {string} productId - REWE Product-ID
 * @returns {string} URL zur Produktseite
 */
export function buildReweProductUrl(productName, productId) {
  if (!productId) return null;
  const slug = slugify(productName || 'produkt');
  return `${REWE_SHOP_BASE}/p/${slug}/${productId}`;
}

/**
 * Normalisiert Produkte aus dem Mobile-Format (Accept: *\/*)
 * Struktur: { products: [{ productId, title, listing: { currentRetailPrice, grammage }, imageURL }] }
 */
function parseMobileFormat(data) {
  return (data.products || []).map(product => {
    const listing = product.listing || {};
    const priceCents = listing.currentRetailPrice || null;
    const parsedSize = parsePackageSize(product.title);
    return {
      id: product.productId,
      name: product.title,
      price: priceCents,
      priceFormatted: priceCents ? formatPrice(priceCents) : null,
      packageSize: listing.grammage || parsedSize.raw || '',
      productUrl: buildReweProductUrl(product.title, product.productId),
      imageUrl: product.imageURL || null,
      parsedAmount: parsedSize.amount,
      parsedUnit: parsedSize.unit,
      parsedPieceCount: parsedSize.pieceCount || null,
    };
  });
}

/**
 * Normalisiert Produkte aus dem HAL/JSON-Format (Accept: application/json)
 * Struktur: { _embedded: { products: [{ id, productName, _embedded: { articles }, _links }] } }
 */
function parseHalFormat(data) {
  const embedded = data._embedded?.products || [];
  return embedded.map(product => {
    const article = product._embedded?.articles?.[0];
    const pricing = article?._embedded?.listing?.pricing || {};
    const priceCents = pricing.currentRetailPrice || null;
    const grammage = pricing.grammage || '';
    const name = product.productName || '';
    const productId = product.id || '';
    const parsedSize = parsePackageSize(name);
    // HAL-Format liefert _links.detail.href als "/p/slug/id"
    const detailHref = product._links?.detail?.href;
    const productUrl = detailHref
      ? `${REWE_SHOP_BASE}${detailHref}`
      : buildReweProductUrl(name, productId);
    const imageUrl = product.media?.images?.[0]?._links?.self?.href || null;
    return {
      id: productId,
      name,
      price: priceCents,
      priceFormatted: priceCents ? formatPrice(priceCents) : null,
      packageSize: grammage || parsedSize.raw || '',
      productUrl,
      imageUrl,
      parsedAmount: parsedSize.amount,
      parsedUnit: parsedSize.unit,
      parsedPieceCount: parsedSize.pieceCount || null,
    };
  });
}

/**
 * Sucht Produkte bei REWE (intern genutzt)
 *
 * HINWEIS: Die REWE-API liefert je nach Accept-Header unterschiedliche Formate:
 * - Accept: *\/* → Mobile-Format (flache Struktur, einfacher)
 * - Accept: application/json → HAL-Format (verschachtelt mit _embedded)
 * Wir nutzen *\/* (Mobile-Format), parsen aber als Fallback auch HAL.
 */
export async function searchProducts(query, options = {}) {
  if (!isReweEnabled()) {
    return { products: [], error: 'REWE-Integration ist deaktiviert.' };
  }

  const marketId = options.marketId;
  if (!marketId) {
    return { products: [], error: 'REWE Markt-ID nicht konfiguriert. Bitte in den REWE-Einstellungen einen Markt auswählen.' };
  }

  try {
    const params = new URLSearchParams({
      search: query,
      storeId: marketId,
      market: marketId,           // Beide nötig für Preise + Verfügbarkeit!
      objectsPerPage: String(options.limit || 15),
      page: String(options.page || 1),
      serviceTypes: 'PICKUP',
    });

    const response = await fetch(`${REWE_SEARCH_URL}?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: '*/*',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`REWE API Fehler für "${query}": ${response.status}`);
      return { products: [], error: `REWE API nicht erreichbar (${response.status})` };
    }

    const data = await response.json();

    // Auto-detect: Mobile-Format hat data.products, HAL hat data._embedded.products
    let products;
    if (data.products && Array.isArray(data.products)) {
      products = parseMobileFormat(data);
    } else if (data._embedded?.products) {
      products = parseHalFormat(data);
    } else {
      console.warn(`REWE: Unbekanntes Antwortformat für "${query}"`, Object.keys(data));
      products = [];
    }

    return { products, total: data.pagination?.objectCount || products.length };
  } catch (error) {
    console.error(`REWE Suche fehlgeschlagen für "${query}":`, error.message);
    return { products: [], error: error.message };
  }
}

/**
 * Bewertet, wie gut ein Produktname zu einer Zutat passt (0–100).
 * Höher = besser. Filtert z.B. "Energydrink mit Mango-Geschmack" weg wenn man "Mango" sucht.
 */
export function scoreRelevance(productName, ingredientName) {
  const pLow = productName.toLowerCase();
  const iLow = ingredientName.toLowerCase();
  let score = 0;

  // RegExp-Sonderzeichen escapen
  const escaped = iLow.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordBoundary = new RegExp(`(?:^|[\\s,;.!?()/\\-])${escaped}(?:[\\s,;.!?()/\\-]|$)`);

  // Exakter Match oder Produktname beginnt mit Zutat → sehr relevant
  if (pLow === iLow) {
    score += 60;
  } else if (pLow.startsWith(iLow + ' ') || pLow.startsWith(iLow + ',') || pLow.startsWith(iLow + '\n')) {
    score += 50;
  }

  // Zutat ist ein eigenständiges Wort im Produktnamen
  if (wordBoundary.test(pLow)) {
    score += 30;
  } else {
    // Prüfe deutsche Komposita: "Weidebutter" enthält "butter" als Suffix → sehr relevant
    // Prüfe jedes Wort einzeln, nicht nur den ganzen String
    const words = pLow.split(/[\s,;.!?()/\-]+/).filter(Boolean);
    const isCompoundSuffix = words.some(w => w !== iLow && w.endsWith(iLow) && w.length > iLow.length);
    const isCompoundPrefix = words.some(w => w !== iLow && w.startsWith(iLow) && w.length > iLow.length);

    if (isCompoundSuffix) {
      // "Weidebutter" → "butter" als Suffix = IS Butter. Im Deutschen definiert
      // das Grundwort (Suffix) die Kategorie, das Bestimmungswort nur die Art.
      score += 30;
    } else if (isCompoundPrefix) {
      // "Buttermilch" → "butter" als Prefix = anderes Produkt (Milch, nicht Butter)
      score += 10;
    } else if (pLow.includes(iLow)) {
      // Zutat ist irgendwo versteckt → minimal relevant
      score += 5;
    }
  }

  // Kurze Produktnamen sind eher das echte Produkt (nicht "XY mit Z-Geschmack Extra Plus")
  if (pLow.length < 30) score += 10;
  if (pLow.length < 20) score += 5;

  // Negativ: Geschmacks-/Aroma-Indikatoren → Produkt ist NICHT die Zutat selbst
  const flavorIndicators = [
    'geschmack', 'aroma', 'flavour', 'flavor', 'style',
    'drink', 'energy', 'likör', 'liqueur', 'sirup',
    'bonbon', 'gummibär', 'gummies', 'drops', 'lutscher',
    'chips', 'cracker', 'riegel', 'müsliriegel',
    'duschgel', 'seife', 'shampoo', 'deo', 'kerze',
    'tee ', 'eistee', 'limo', 'limonade', 'nektar',
  ];
  for (const indicator of flavorIndicators) {
    if (pLow.includes(indicator) && !iLow.includes(indicator)) {
      score -= 35;
    }
  }

  // Negativ: Saft/Smoothie (wenn man nicht explizit danach sucht)
  if ((pLow.includes('saft') || pLow.includes('smoothie')) && !iLow.includes('saft') && !iLow.includes('smoothie')) {
    score -= 25;
  }

  return score;
}

/**
 * Berechnet, wie viele REWE-Packungen benötigt werden.
 * Vereinfachte Logik – die KI liefert im AI-Matching bereits die Menge mit.
 * Diese Funktion dient nur noch als Fallback.
 */
export function calculatePackagesNeeded(neededAmount, neededUnit, packageAmount, packageUnit, pieceCount) {
  if (!neededAmount || neededAmount <= 0) return 1;

  const unitLow = (neededUnit || '').toLowerCase().trim().replace(/\.$/, '');
  const pkgUnitLow = (packageUnit || '').toLowerCase().trim().replace(/\.$/, '');

  // Löffel/Prise → 1 Packung reicht
  const spoonUnits = ['el', 'tl', 'prise', 'prisen', 'etwas', 'messerspitze', 'handvoll', 'spritzer', 'schuss'];
  if (spoonUnits.includes(unitLow)) return 1;

  // Stückeinheiten
  const pieceUnits = [
    'stk', 'stück', 'st', 'packung', 'pkg', 'pck', 'päckchen',
    'verp', 'verpackung', 'flasche', 'flaschen', 'tüte', 'tüten',
    'beutel', 'tafel', 'tafeln', 'netz', 'dose', 'dosen', 'glas',
    'becher', 'scheibe', 'scheiben', 'zehe', 'zehen', 'bund',
    'zweig', 'zweige', 'blatt', 'blätter', 'kopf', 'köpfe',
    'knolle', 'knollen', 'stange', 'stangen', 'ring', 'ringe',
    'rispe', 'rispen', '',
  ];

  const neededIsPiece = pieceUnits.includes(unitLow);
  const pkgIsPiece = pieceUnits.includes(pkgUnitLow);

  const weightUnits = ['g', 'kg'];
  const volumeUnits = ['ml', 'l'];
  const neededIsWeight = weightUnits.includes(unitLow);
  const neededIsVolume = volumeUnits.includes(unitLow);
  const pkgIsWeight = weightUnits.includes(pkgUnitLow);
  const pkgIsVolume = volumeUnits.includes(pkgUnitLow);

  // Beide Stück → direkt teilen
  if (neededIsPiece && pkgIsPiece && packageAmount > 0) {
    return Math.max(1, Math.ceil(neededAmount / packageAmount));
  }

  // Stück benötigt, Packung nach Gewicht → pieceCount nutzen oder 1:1
  if (neededIsPiece && (pkgIsWeight || pkgIsVolume)) {
    if (pieceCount && pieceCount > 0) {
      return Math.max(1, Math.ceil(neededAmount / pieceCount));
    }
    return Math.max(1, Math.ceil(neededAmount));
  }

  // Stück benötigt, keine Packungsinfo
  if (neededIsPiece && !packageAmount) {
    return Math.max(1, Math.ceil(neededAmount));
  }

  // Gewicht/Volumen + Packungsgröße
  if (packageAmount > 0) {
    let neededBase = neededAmount;
    if (unitLow === 'kg') neededBase *= 1000;
    else if (unitLow === 'l') neededBase *= 1000;

    if ((neededIsWeight && pkgIsWeight) || (neededIsVolume && pkgIsVolume)) {
      return Math.max(1, Math.ceil(neededBase / packageAmount));
    }
  }

  return 1;
}

/**
 * KI-gestütztes Produkt-Matching: Wählt das beste REWE-Produkt für eine Zutat.
 * Primär: KI entscheidet anhand der Suchergebnisse.
 * Fallback: Regelbasiertes Scoring wenn KI nicht verfügbar.
 */
async function findBestProduct(ingredientName, neededAmount, unit, options = {}) {
  const { products } = await searchProducts(ingredientName, options);

  if (!products.length) {
    return null;
  }

  // Nur Produkte mit Preis berücksichtigen
  let withPrice = products.filter(p => p.price);
  if (!withPrice.length) {
    return null;
  }

  // Tatsächlich verwendeter Suchbegriff (für "Alternative wählen" im Frontend)
  let actualSearchQuery = ingredientName;

  // ── Primär: KI-Matching (mit Retry bei schlechten Suchergebnissen) ──
  try {
    const ai = getAIProvider({ simple: true });
    const result = await aiMatchProducts(ai, ingredientName, neededAmount, unit, withPrice);

    // Match gefunden → fertig
    if (result?.product) return { ...result, searchQuery: actualSearchQuery };

    // KI sagt "kein passendes Produkt" → alternative Suche mit breiterem Begriff
    if (result?.alternativeSearch) {
      const altQuery = result.alternativeSearch;
      console.log(`  🔄 ${ingredientName}: Kein passendes Produkt → Alternativsuche "${altQuery}"…`);

      const { products: altProducts } = await searchProducts(altQuery, options);
      const altWithPrice = altProducts.filter(p => p.price);
      if (altWithPrice.length) {
        // Alternativ-Produkte werden zur neuen Basis für KI + Fallback
        withPrice = altWithPrice;
        actualSearchQuery = altQuery;
        const altResult = await aiMatchProducts(ai, ingredientName, neededAmount, unit, altWithPrice, { forceMatch: true });
        if (altResult?.product) return { ...altResult, searchQuery: actualSearchQuery };
        // altResult könnte undefined sein → Fallback mit altWithPrice (s.u.)
      }
    }
  } catch (err) {
    console.warn(`⚠️ KI-REWE-Matching für "${ingredientName}" fehlgeschlagen, nutze Fallback:`, err.message);
  }

  // ── Fallback: Regelbasiertes Scoring (nutzt ggf. Alternativ-Produkte) ──
  const fallback = findBestProductFallback(ingredientName, neededAmount, unit, withPrice);
  return fallback ? { ...fallback, searchQuery: actualSearchQuery } : null;
}

/**
 * Bereitet die Produktliste für den KI-Prompt auf (gemeinsam für Einzel- und Batch-Matching).
 * @returns {Array} Aufbereitete Produktliste (max. 12 Items)
 */
function prepareProductList(withPrice) {
  return withPrice.slice(0, 12).map((p, i) => {
    const entry = {
      index: i,
      name: p.name,
      price: formatPrice(p.price),
      packageSize: p.packageSize || 'unbekannt',
    };
    const grammagePrice = parseGrammagePrice(p.packageSize);
    if (grammagePrice) {
      entry[grammagePrice.label] = grammagePrice.formatted;
    }
    if (p.price && p.parsedAmount && (p.parsedUnit === 'stück' || p.parsedUnit === 'stk' || p.parsedUnit === 'st')) {
      entry.pricePerStück = formatPrice(Math.round(p.price / p.parsedAmount));
    }
    return entry;
  });
}

/**
 * Verarbeitet ein einzelnes KI-Ergebnis für ein Produkt-Matching.
 * @returns {{ product, ... } | { alternativeSearch } | undefined}
 */
function processAiMatchResult(aiResult, ingredientName, neededAmount, unit, withPrice) {
  // noMatch → Alternativsuche signalisieren
  if (aiResult?.noMatch || aiResult?.no_match || aiResult?.noResult) {
    const altSearch = aiResult.alternativeSearch || aiResult.alternative_search
      || aiResult.alternativeQuery || aiResult.alternative_query
      || aiResult.searchTerm || aiResult.search;
    if (altSearch) {
      return { alternativeSearch: altSearch, reason: aiResult.reason };
    }
    console.log(`  ℹ️ KI: noMatch für "${ingredientName}" ohne alternativeSearch-Vorschlag → generiere Fallback-Suchbegriff`);
    const fallbackSearch = ingredientName
      .replace(/\s*\(.*?\)\s*/g, '')
      .replace(/^Bio\s+/i, '')
      .trim();
    return { alternativeSearch: fallbackSearch, reason: aiResult.reason || 'Kein passendes Produkt' };
  }

  // KI hat ein Produkt gewählt
  const maxIndex = Math.min(withPrice.length, 12);
  if (aiResult && typeof aiResult.index === 'number' && aiResult.index >= 0 && aiResult.index < maxIndex) {
    const best = withPrice[aiResult.index];
    const qty = Math.max(1, aiResult.quantity || 1);
    const totalPrice = best.price * qty;

    return {
      product: best,
      neededAmount,
      unit,
      packageAmount: best.parsedAmount,
      packagesNeeded: qty,
      totalPrice,
      matchedBy: 'ai',
      matchReason: aiResult.reason || null,
      surplus: 0,
      surplusForPantry: null,
    };
  }

  console.warn(`  ⚠️ KI-Antwort für "${ingredientName}" hat unerwartetes Format:`, JSON.stringify(aiResult));
  return undefined;
}

/** Gemeinsame Regeln für den KI-Prompt (Einzel- und Batch-Matching). */
const AI_MATCH_RULES = `Regeln:
- WICHTIG: Wähle das Produkt in der richtigen Produktkategorie! Wenn eine Zutat gesucht wird (z.B. "Belugalinsen"), wähle das Grundnahrungsmittel (Hülsenfrüchte, Reis, Nudeln etc.) – NIEMALS Brotaufstriche, Saucen, Fertiggerichte, Suppen o.ä. die die Zutat nur als Geschmack enthalten.
- "Streichcreme Belugalinse" / "Brotaufstrich Belugalinse" ist KEIN Ersatz für "Belugalinsen". → noMatch + alternativeSearch: "Linsen"
- "Tomatensauce" ist KEIN Ersatz für "Tomaten". → noMatch + alternativeSearch: "Tomaten frisch"
- Wenn KEIN passendes Produkt in der Ergebnisliste ist, antworte mit noMatch und schlage einen breiteren/alternativen Suchbegriff vor (z.B. "Linsen" statt "Belugalinsen", "Petersilie" statt "Blattpetersilie").
- quantity = Anzahl Packungen die benötigt werden
- PREIS-LEISTUNG ist das WICHTIGSTE Kriterium bei gleichwertigen Produkten!
  pricePerKg bzw. pricePerLiter (aus der REWE-Grammage) und pricePerStück sind vorberechnet.
  Vergleiche diese direkt! Wähle IMMER das Produkt mit dem niedrigsten Einheitspreis, wenn mehrere gleichwertig passen.
  Eigenmarken (ja!, REWE Beste Wahl) sind oft günstiger als Markenprodukte – bevorzuge sie bei gleichem Produkt.
- PREISVERGLEICH bei Stückzahlen vs. Netze/Beutel: Wenn z.B. 4 Zwiebeln benötigt werden, rechne um!
  Ein Zwiebelnetz 1kg enthält ca. 6-8 Zwiebeln (1 Zwiebel ≈ 120-150g), ein Kartoffelnetz 2kg ca. 12-15 Kartoffeln (1 Kartoffel ≈ 130-170g), etc.
  Vergleiche: Ist 1× Netz günstiger als 4× Einzelzwiebel? Dann wähle das Netz mit quantity=1.
  Typische Stückgewichte: Zwiebel ≈ 120g, Kartoffel ≈ 150g, Tomate ≈ 130g, Paprika ≈ 170g, Apfel ≈ 180g, Zitrone ≈ 100g, Orange ≈ 200g, Karotte ≈ 80g, Knoblauch ≈ 40g
- Bevorzuge größere Packungen wenn günstiger pro Einheit
- Bei Gewichtsangaben (z.B. 500g Kartoffeln): Netz/Sack bevorzugen wenn verfügbar
- Bevorzuge unverarbeitete Varianten: frisch > tiefgekühlt > Konserve (es sei denn explizit anders gewünscht)`;

/**
 * KI-Produktauswahl aus einer Produktliste (Einzelmodus).
 * Gibt zurück:
 *   - Match-Objekt mit { product, ... } bei Treffer
 *   - { alternativeSearch: "..." } wenn kein passendes Produkt (KI schlägt Alternativsuche vor)
 *   - undefined wenn KI kein auswertbares Ergebnis liefert
 */
async function aiMatchProducts(ai, ingredientName, neededAmount, unit, withPrice, { forceMatch = false } = {}) {
  const productList = prepareProductList(withPrice);

  const noMatchBlock = forceMatch
    ? `\nWICHTIG: Du MUSST eines der Produkte wählen – "noMatch" ist KEINE Option. Dies ist bereits eine Alternativsuche. Wähle das am besten passende Produkt.`
    : `\nKein passendes Produkt (ALLE sind in der falschen Kategorie):\n{\n  "noMatch": true,\n  "alternativeSearch": "breiterer Suchbegriff",\n  "reason": "Warum keines passt"\n}`;

  const prompt = `Wähle das beste REWE-Produkt für diese Zutat:

Benötigt: ${neededAmount || '?'} ${unit || 'Stück'} ${ingredientName}

Verfügbare Produkte:
${JSON.stringify(productList, null, 2)}

Antworte als JSON:

Treffer:
{
  "index": 0,
  "quantity": 1,
  "reason": "Kurze Begründung"
}
${noMatchBlock}

${AI_MATCH_RULES}`;

  const aiResult = await ai.chatJSON(prompt, { temperature: 0.1, maxTokens: 256 });

  return processAiMatchResult(aiResult, ingredientName, neededAmount, unit, withPrice);
}

/**
 * Regelbasiertes Produkt-Matching (Fallback wenn KI nicht verfügbar).
 * Nutzt scoreRelevance() und calculatePackagesNeeded().
 */
function findBestProductFallback(ingredientName, neededAmount, unit, products) {
  const scored = products.map(p => ({
    ...p,
    relevance: scoreRelevance(p.name, ingredientName),
  }));

  const relevant = scored.filter(p => p.relevance > 0);
  const candidates = relevant.length ? relevant : scored;

  const withCosts = candidates.map(p => {
    const qty = calculatePackagesNeeded(neededAmount, unit, p.parsedAmount, p.parsedUnit, p.parsedPieceCount);
    const totalPrice = p.price * qty;

    let pricePerUnit = null;
    if (p.parsedAmount > 0 && p.price > 0) {
      if (['g', 'kg'].includes(p.parsedUnit)) {
        pricePerUnit = (p.price / p.parsedAmount) * 1000;
      } else if (['ml', 'l'].includes(p.parsedUnit)) {
        pricePerUnit = (p.price / p.parsedAmount) * 1000;
      } else if (['stück', 'stk', 'st'].includes(p.parsedUnit)) {
        pricePerUnit = p.price / p.parsedAmount;
      }
    }

    return { ...p, packagesNeeded: qty, totalPrice, pricePerUnit };
  });

  withCosts.sort((a, b) => {
    const groupA = Math.floor(a.relevance / 10);
    const groupB = Math.floor(b.relevance / 10);
    if (groupB !== groupA) return groupB - groupA;
    if (a.pricePerUnit != null && b.pricePerUnit != null) {
      const unitDiff = a.pricePerUnit - b.pricePerUnit;
      if (Math.abs(unitDiff) > 0.01) return unitDiff;
    }
    return a.totalPrice - b.totalPrice;
  });

  const best = withCosts[0] || products[0];
  const packagesNeeded = best.packagesNeeded || 1;
  const totalPrice = best.totalPrice || best.price;

  return {
    product: best,
    neededAmount,
    unit,
    packageAmount: best.parsedAmount,
    packagesNeeded,
    totalPrice,
    matchedBy: 'fallback',
    surplus: 0,
    surplusForPantry: null,
  };
}

/**
 * Parst eine Packungsgröße aus einem String (Titel oder Grammage)
 * z.B. "Barilla Spaghetti Nr.5 500g" -> { amount: 500, unit: "g", raw: "500g" }
 * z.B. "Weihenstephan H-Milch 3,5% 1l" -> { amount: 1000, unit: "ml", raw: "1l" }
 * z.B. "REWE Bio Zwiebel Duo 150g"     -> { amount: 150, unit: "g", raw: "150g", pieceCount: 2 }
 *
 * `pieceCount` wird aus Multiplier-Wörtern im Titel extrahiert:
 * "Duo" → 2, "Trio" → 3, "Doppelpack" → 2, "3er Pack" → 3, etc.
 * Dies ist unabhängig von amount/unit und hilft bei der Mengenberechnung,
 * wenn Stückzahlen benötigt aber Gewichtspackungen gefunden werden.
 */
export function parsePackageSize(sizeStr, productName) {
  if (!sizeStr && !productName) return { amount: null, unit: null, raw: null, pieceCount: null };

  const textToParse = sizeStr || productName || '';

  // Verschiedene Formate: "500g", "1kg", "1,5l", "250 ml", "6 Stück", "4x250ml"
  const match = textToParse.match(/([\d.,]+)\s*(?:x\s*[\d.,]+\s*)?(g|kg|ml|l|stk|stück|st)\b/i);
  if (!match) return { amount: null, unit: null, raw: null, pieceCount: parsePieceCountFromName(productName || sizeStr) };

  let amount = parseFloat(match[1].replace(',', '.'));
  let unit = match[2].toLowerCase();
  const raw = match[0];

  // In Basiseinheit konvertieren
  if (unit === 'kg') {
    amount *= 1000;
    unit = 'g';
  } else if (unit === 'l') {
    amount *= 1000;
    unit = 'ml';
  }

  // Stückzahl aus Multiplier-Wörtern extrahieren (Duo, Trio, Doppelpack…)
  // Prüfe sowohl sizeStr als auch productName
  const pieceCount = (unit === 'stück' || unit === 'stk' || unit === 'st')
    ? amount  // "4 Stück" → pieceCount = 4
    : parsePieceCountFromName(productName || sizeStr);

  return { amount, unit, raw, pieceCount };
}

/**
 * Erkennt Stückzahl-Indikatoren in Produktnamen.
 *
 * 1. Explizite Multiplier: "Duo" → 2, "Trio" → 3, "Doppelpack" → 2, "3er Pack" → 3
 * 2. Mehrstück-Gebinde: "Netz", "Sack", "Schale", "Korb" → mind. 3 Stück
 *    (ein Netz Zwiebeln, eine Schale Tomaten etc. enthalten immer mehrere lose Stücke)
 */
function parsePieceCountFromName(name) {
  if (!name) return null;
  const low = name.toLowerCase();

  // Wort-Multiplier (exakte Stückzahl bekannt)
  if (/\bduo\b/.test(low)) return 2;
  if (/\btrio\b/.test(low)) return 3;
  if (/\bdoppelpack\b/.test(low)) return 2;
  if (/\bdreierpack\b/.test(low)) return 3;

  // "2er Pack", "3er-Pack", "4er Packung", etc.
  const erPackMatch = low.match(/(\d+)er[\s-]?pack/);
  if (erPackMatch) return parseInt(erPackMatch[1], 10);

  // Mehrstück-Gebinde: Netz, Sack, Schale, Korb
  // Diese Verpackungen enthalten IMMER mehrere lose Stücke.
  // Konservative Schätzung: mind. 3 Stück pro Gebinde.
  // → "2 Stk Zwiebel" + "500g im Netz" → ceil(2/3) = 1 Netz ✓
  // → "5 Stk Kartoffeln" + "2kg im Netz" → ceil(5/3) = 2 Netze ✓
  if (/\b(netz|im\s+netz|sack|schale|korb)\b/.test(low)) return 3;

  return null;
}

/**
 * Extrahiert den Einheitspreis aus der REWE-Grammage-Angabe.
 * z.B. "300g (1 kg = 3,30 €)" → { label: "pricePerKg", formatted: "3,30 €/kg" }
 * z.B. "750ml (1 l = 2,65 €)" → { label: "pricePerLiter", formatted: "2,65 €/l" }
 * z.B. "250g (100 g = 1,20 €)" → { label: "pricePerKg", formatted: "12,00 €/kg" }
 */
function parseGrammagePrice(packageSize) {
  if (!packageSize) return null;

  // Muster: "(1 kg = 3,30 €)" oder "(100 g = 1,20 €)" oder "(1 l = 2,65 €)" oder "(100 ml = 0,53 €)"
  const match = packageSize.match(/\((\d+)\s*(g|kg|ml|l)\s*=\s*([\d.,]+)\s*€\)/i);
  if (!match) return null;

  const refAmount = parseInt(match[1], 10);
  const refUnit = match[2].toLowerCase();
  const refPrice = parseFloat(match[3].replace(',', '.'));

  if (isNaN(refPrice) || refPrice <= 0) return null;

  // Auf Standard-Einheit (kg / l) normalisieren
  if (refUnit === 'kg' || refUnit === 'g') {
    // "1 kg = X €" → direkt, "100 g = X €" → × 10
    const perKg = refUnit === 'kg'
      ? refPrice / refAmount
      : (refPrice / refAmount) * 1000;
    return {
      label: 'pricePerKg',
      formatted: perKg.toFixed(2).replace('.', ',') + ' €/kg',
    };
  }
  if (refUnit === 'l' || refUnit === 'ml') {
    const perLiter = refUnit === 'l'
      ? refPrice / refAmount
      : (refPrice / refAmount) * 1000;
    return {
      label: 'pricePerLiter',
      formatted: perLiter.toFixed(2).replace('.', ',') + ' €/l',
    };
  }

  return null;
}

/**
 * Formatiert einen Preis in Euro (Eingabe in Cent!)
 */
function formatPrice(priceCents) {
  if (!priceCents) return 'Preis unbekannt';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(priceCents / 100);
}

/**
 * Matcht eine komplette Einkaufsliste mit REWE-Produkten
 * Für jede Zutat wird das passendste Produkt + Direktlink gesucht
 *
 * Rate-Limiting: 500ms Pause zwischen Anfragen, 2s Pause alle 10 Anfragen
 *
 * @param {object[]} shoppingItems - Array mit { name, amount, unit }
 * @param {function} [onProgress] - Optionaler Callback: (progress) => void
 *   progress: { current, total, itemName, matched, productName, price }
 * @param {object} [options] - Optionale Einstellungen
 * @param {Map} [options.preferences] - Map<ingredientName, { rewe_product_id, rewe_product_name, rewe_price, rewe_package_size }>
 * @param {function} [options.onPriceUpdate] - Callback wenn sich ein Preis geändert hat: (productId, ingredientName, newPrice, packageSize)
 */
/**
 * KI-Batch-Produktauswahl für mehrere Zutaten gleichzeitig.
 * Reduziert die Anzahl der KI-Aufrufe drastisch (1 Call pro Batch statt pro Item).
 *
 * @param {object} ai - AI-Provider-Instanz
 * @param {Array<{ ingredientName, neededAmount, unit, products }>} items - Zutaten mit ihren REWE-Suchergebnissen
 * @returns {Promise<Array<object|undefined>>} - Array von Match-Ergebnissen (gleiche Reihenfolge wie Eingabe)
 */
async function aiBatchMatchProducts(ai, items) {
  if (items.length === 0) return [];
  if (items.length === 1) {
    // Einzelnes Item → Einzelmodus (vermeidet Batch-Overhead)
    const item = items[0];
    const result = await aiMatchProducts(ai, item.ingredientName, item.neededAmount, item.unit, item.products);
    return [result];
  }

  // Batch-Prompt aufbauen: Jede Zutat mit eigenem Produktkatalog
  const sections = items.map((item, idx) => {
    const productList = prepareProductList(item.products);
    return `## Zutat ${idx + 1}: ${item.neededAmount || '?'} ${item.unit || 'Stück'} ${item.ingredientName}
Produkte:
${JSON.stringify(productList, null, 2)}`;
  });

  const prompt = `Wähle für JEDE der folgenden ${items.length} Zutaten das beste REWE-Produkt.

${sections.join('\n\n')}

Antworte als JSON-Array mit GENAU ${items.length} Einträgen (einer pro Zutat, in gleicher Reihenfolge):

[
  { "ingredientIndex": 1, "index": 0, "quantity": 1, "reason": "Kurze Begründung" },
  { "ingredientIndex": 2, "noMatch": true, "alternativeSearch": "breiterer Suchbegriff", "reason": "Warum keines passt" }
]

Für jede Zutat entweder:
- Treffer: { "ingredientIndex": N, "index": Produktindex, "quantity": Packungszahl, "reason": "..." }
- Kein Treffer: { "ingredientIndex": N, "noMatch": true, "alternativeSearch": "...", "reason": "..." }

${AI_MATCH_RULES}`;

  try {
    let aiResults = await ai.chatJSON(prompt, { temperature: 0.1, maxTokens: 256 * items.length });

    // Robuster Array-Extraktor: KI antwortet manchmal mit { results: [...] } o.ä.
    if (!Array.isArray(aiResults) && aiResults && typeof aiResults === 'object') {
      // Suche nach dem ersten Array-Feld im Objekt
      const arrayField = Object.values(aiResults).find(v => Array.isArray(v));
      if (arrayField) {
        console.log('  ℹ️ KI-Batch: Array aus Wrapper-Objekt extrahiert');
        aiResults = arrayField;
      }
    }

    if (!Array.isArray(aiResults)) {
      console.warn('⚠️ KI-Batch-Matching: Unerwartetes Format (kein Array), nutze Einzelmodus');
      return items.map(() => undefined);
    }

    // Ergebnisse den Items zuordnen (nach ingredientIndex oder Position)
    const results = new Array(items.length).fill(undefined);
    for (let i = 0; i < aiResults.length && i < items.length; i++) {
      const aiResult = aiResults[i];
      // ingredientIndex ist 1-basiert, Fallback auf Position
      const idx = (aiResult?.ingredientIndex ? aiResult.ingredientIndex - 1 : i);
      if (idx >= 0 && idx < items.length) {
        results[idx] = processAiMatchResult(aiResult, items[idx].ingredientName, items[idx].neededAmount, items[idx].unit, items[idx].products);
      }
    }

    return results;
  } catch (err) {
    console.warn('⚠️ KI-Batch-Matching fehlgeschlagen, nutze Einzelmodus:', err.message);
    // Fallback: Alle als undefined → werden dann einzeln oder per Fallback behandelt
    return items.map(() => undefined);
  }
}

/**
 * Matcht eine komplette Einkaufsliste mit REWE-Produkten
 * Für jede Zutat wird das passendste Produkt + Direktlink gesucht
 *
 * Nutzt KI-Batch-Matching: Statt N einzelner KI-Aufrufe werden Items in Gruppen
 * von bis zu 5 gebatcht (1 KI-Call pro Gruppe). Alternativsuchen (noMatch)
 * werden weiterhin einzeln behandelt.
 *
 * Rate-Limiting: 500ms Pause zwischen Anfragen, 2s Pause alle 10 Anfragen
 *
 * @param {object[]} shoppingItems - Array mit { name, amount, unit }
 * @param {function} [onProgress] - Optionaler Callback: (progress) => void
 *   progress: { current, total, itemName, matched, productName, price }
 * @param {object} [options] - Optionale Einstellungen
 * @param {Map} [options.preferences] - Map<ingredientName, { rewe_product_id, rewe_product_name, rewe_price, rewe_package_size }>
 * @param {function} [options.onPriceUpdate] - Callback wenn sich ein Preis geändert hat: (productId, ingredientName, newPrice, packageSize)
 */
export async function matchShoppingListWithRewe(shoppingItems, onProgress, options = {}) {
  const { preferences, onPriceUpdate, marketId } = options;
  const results = new Array(shoppingItems.length).fill(null);
  const REWE_BATCH_SIZE = 10;
  const AI_BATCH_SIZE = 5;
  const DELAY_BETWEEN = 500;
  const DELAY_BETWEEN_BATCHES = 2000;
  let matchedCount = 0;

  console.log(`REWE-Matching: ${shoppingItems.length} Zutaten…`);

  // ── Phase 1: REWE-Suchen + Präferenz-Handling ──
  // Sammelt Items die KI-Matching brauchen für Phase 2

  const needsAI = []; // { originalIndex, item, products }

  for (let i = 0; i < shoppingItems.length; i++) {
    const item = shoppingItems[i];
    let match = null;
    let fromPreference = false;

    // 1. Gespeicherte Präferenzen prüfen (Multi-Favoriten)
    const prefs = preferences?.get(item.name.toLowerCase().trim());
    if (prefs && prefs.length > 0) {
      const { products } = await searchProducts(item.name, { marketId });
      let found = null;
      let matchedPref = null;

      // Prüfe Favoriten in Reihenfolge (sort_order ASC, updated_at DESC)
      for (const pref of prefs) {
        let candidate = products.find(p => p.id === pref.rewe_product_id);

        if (!candidate && pref.rewe_product_name) {
          const { products: prodByName } = await searchProducts(pref.rewe_product_name, { marketId });
          candidate = prodByName.find(p => p.id === pref.rewe_product_id);
        }

        if (candidate) {
          found = candidate;
          matchedPref = pref;
          break; // Erster verfügbarer Favorit wird verwendet
        }
      }

      if (found && matchedPref) {
        const packagesNeeded = calculatePackagesNeeded(item.amount, item.unit, found.parsedAmount, found.parsedUnit, found.parsedPieceCount);
        match = {
          product: found,
          neededAmount: item.amount,
          unit: item.unit,
          packagesNeeded,
          totalPrice: found.price ? found.price * packagesNeeded : null,
          fromPreference: true,
          matchedBy: 'preference',
        };
        fromPreference = true;
        matchedCount++;

        if (found.price !== matchedPref.rewe_price && onPriceUpdate) {
          onPriceUpdate(matchedPref.rewe_product_id, item.name, found.price, found.packageSize);
        }

        const priceChange = found.price !== matchedPref.rewe_price
          ? ` (Preis: ${formatPrice(matchedPref.rewe_price)} → ${formatPrice(found.price)})`
          : '';
        const qtyInfo = packagesNeeded > 1 ? ` [${packagesNeeded}×]` : '';
        const favIndex = prefs.indexOf(matchedPref) + 1;
        const favLabel = prefs.length > 1 ? ` (Favorit ${favIndex}/${prefs.length})` : '';
        console.log(`  ★ ${item.name} → ${found.name} (gemerkt${favLabel}${priceChange})${qtyInfo}`);
      } else {
        // Kein Favorit verfügbar → zur KI-Batch-Queue hinzufügen
        console.log(`  ⚠ ${item.name}: Keiner der ${prefs.length} gemerkten Produkte verfügbar → suche Alternative…`);
        const { products: searchResults } = await searchProducts(item.name, { marketId });
        const withPrice = searchResults.filter(p => p.price);
        if (withPrice.length > 0) {
          needsAI.push({ originalIndex: i, item, products: withPrice });
        }
        // match bleibt null → wird ggf. in Phase 2 gesetzt
      }
    } else {
      // 2. Kein gespeichertes Produkt → REWE-Suche, KI-Matching wird gebatcht
      const { products } = await searchProducts(item.name, { marketId });
      const withPrice = products.filter(p => p.price);
      if (withPrice.length > 0) {
        needsAI.push({ originalIndex: i, item, products: withPrice });
      } else {
        console.log(`  ✗ ${item.name} → kein Treffer (keine Produkte gefunden)`);
      }
    }

    // Ergebnis zwischenspeichern (Präferenz-Treffer sofort, Rest in Phase 2)
    if (match) {
      results[i] = { ...item, reweMatch: match };
    }

    // Fortschritt für Präferenz-Treffer sofort melden
    if (match && onProgress) {
      onProgress({
        current: i + 1,
        total: shoppingItems.length,
        itemName: item.name,
        matched: true,
        matchedCount,
        productName: match.product?.name || null,
        price: match.product?.priceFormatted || null,
        packagesNeeded: match.packagesNeeded || null,
        fromPreference,
        matchedBy: match.matchedBy || null,
      });
    }

    // Rate-Limiting für REWE-API
    if (i < shoppingItems.length - 1) {
      if ((i + 1) % REWE_BATCH_SIZE === 0) {
        console.log(`  ⏳ Batch-Pause (${DELAY_BETWEEN_BATCHES}ms)…`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      } else {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN));
      }
    }
  }

  // ── Phase 2: Batch-KI-Matching für alle Items ohne Präferenz ──

  if (needsAI.length > 0) {
    console.log(`  🤖 KI-Batch-Matching: ${needsAI.length} Zutaten in ${Math.ceil(needsAI.length / AI_BATCH_SIZE)} Batch(es)…`);

    const ai = getAIProvider({ simple: true });

    for (let b = 0; b < needsAI.length; b += AI_BATCH_SIZE) {
      const batch = needsAI.slice(b, b + AI_BATCH_SIZE);
      const batchInput = batch.map(entry => ({
        ingredientName: entry.item.name,
        neededAmount: entry.item.amount,
        unit: entry.item.unit,
        products: entry.products,
      }));

      const batchResults = await aiBatchMatchProducts(ai, batchInput);

      // Ergebnisse verarbeiten
      for (let j = 0; j < batch.length; j++) {
        const { originalIndex, item } = batch[j];
        const aiResult = batchResults[j];
        let match = null;
        let searchQuery = item.name;

        if (aiResult?.product) {
          // KI hat Produkt gewählt
          match = { ...aiResult, searchQuery };
          matchedCount++;
          const qtyInfo = match.packagesNeeded > 1 ? ` [${match.packagesNeeded}×]` : '';
          console.log(`  🤖 ${item.name} → ${match.product.name} (${match.product.priceFormatted || '?'})${qtyInfo}`);
        } else if (aiResult?.alternativeSearch) {
          // noMatch → Alternativsuche (individuell, mit eigener REWE-Suche + forceMatch)
          const altQuery = aiResult.alternativeSearch;
          console.log(`  🔄 ${item.name}: Kein passendes Produkt → Alternativsuche "${altQuery}"…`);
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN));
          const { products: altProducts } = await searchProducts(altQuery, { marketId });
          const altWithPrice = altProducts.filter(p => p.price);
          if (altWithPrice.length) {
            searchQuery = altQuery;
            try {
              const altResult = await aiMatchProducts(ai, item.name, item.amount, item.unit, altWithPrice, { forceMatch: true });
              if (altResult?.product) {
                match = { ...altResult, searchQuery };
                matchedCount++;
                const qtyInfo = match.packagesNeeded > 1 ? ` [${match.packagesNeeded}×]` : '';
                console.log(`  🤖 ${item.name} → ${match.product.name} (${match.product.priceFormatted || '?'}) [Alt: "${altQuery}"]${qtyInfo}`);
              }
            } catch (retryErr) {
              console.warn(`  ⚠️ Alternativsuche KI-Matching für "${item.name}" fehlgeschlagen:`, retryErr.message);
            }
          }
          // Falls KI-Retry fehlschlägt → regelbasierter Fallback
          if (!match) {
            const fallbackProducts = altWithPrice.length ? altWithPrice : batch[j].products;
            const fallback = findBestProductFallback(item.name, item.amount, item.unit, fallbackProducts);
            if (fallback) {
              match = { ...fallback, searchQuery };
              matchedCount++;
              console.log(`  📊 ${item.name} → ${match.product.name} (${match.product.priceFormatted || '?'}) [Fallback]`);
            }
          }
        } else {
          // KI hat kein auswertbares Ergebnis → regelbasierter Fallback
          const fallback = findBestProductFallback(item.name, item.amount, item.unit, batch[j].products);
          if (fallback) {
            match = { ...fallback, searchQuery };
            matchedCount++;
            console.log(`  📊 ${item.name} → ${match.product.name} (${match.product.priceFormatted || '?'}) [Fallback]`);
          } else {
            console.log(`  ✗ ${item.name} → kein Treffer`);
          }
        }

        results[originalIndex] = { ...item, reweMatch: match };

        // Fortschritt melden
        if (onProgress) {
          onProgress({
            current: originalIndex + 1,
            total: shoppingItems.length,
            itemName: item.name,
            matched: !!match,
            matchedCount,
            productName: match?.product?.name || null,
            price: match?.product?.priceFormatted || null,
            packagesNeeded: match?.packagesNeeded || null,
            fromPreference: false,
            matchedBy: match?.matchedBy || null,
          });
        }
      }
    }
  }

  // Nicht-gematchte Items auffüllen (falls results[i] noch null)
  for (let i = 0; i < shoppingItems.length; i++) {
    if (!results[i]) {
      results[i] = { ...shoppingItems[i], reweMatch: null };
    }
  }

  const prefCount = results.filter(r => r.reweMatch?.fromPreference).length;
  const apiCount = matchedCount - prefCount;
  console.log(`REWE-Matching fertig: ${matchedCount}/${results.length} zugeordnet (${prefCount} gemerkte Produkte, ${apiCount} neu gematcht)`);

  return results;
}

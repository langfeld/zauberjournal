/**
 * ============================================
 * Hilfsfunktionen
 * ============================================
 */

import { resolve, relative } from 'path';
import { randomBytes } from 'crypto';
import { estimateConversion } from './ingredient-weights.js';

/**
 * Generiert einen kryptographisch sicheren zufälligen String als ID.
 * Verwendet crypto.randomBytes statt Math.random() für Unvorhersagbarkeit.
 */
export function generateId(length = 12) {
  return randomBytes(Math.ceil(length * 0.75))
    .toString('base64url')
    .slice(0, length);
}

/**
 * Sanitiert einen String für die DB: trimmt, begrenzt Länge, entfernt Steuerzeichen.
 * @param {*} value - Eingabewert (wird zu String konvertiert)
 * @param {number} maxLen - Maximale Länge (default: 500)
 * @returns {string} - Bereinigter String
 */
export function sanitize(value, maxLen = 500) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Steuerzeichen entfernen (außer \t \n \r)
    .trim()
    .slice(0, maxLen);
}

/**
 * Validiert ob ein String ein gültiges ISO-Datum ist (YYYY-MM-DD).
 * @param {string} dateStr - Zu prüfendes Datum
 * @returns {string|null} - Das Datum oder null wenn ungültig
 */
export function validateDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return dateStr;
}

/**
 * Prüft ob eine URL auf eine private/interne Adresse zeigt (SSRF-Schutz).
 * Blockiert localhost, private IP-Ranges, link-local, Metadata-Endpoints.
 * @param {string} urlStr - Zu prüfende URL
 * @returns {boolean} - true wenn die URL blockiert werden sollte
 */
export function isPrivateUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);

    // Nur http/https erlauben
    if (!['http:', 'https:'].includes(parsed.protocol)) return true;

    const host = parsed.hostname.toLowerCase();

    // localhost
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') return true;

    // IPv6 link-local
    if (host.startsWith('[fe80:') || host.startsWith('fe80:')) return true;

    // Private IPv4 Ranges
    const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number);
      if (a === 10) return true;                          // 10.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
      if (a === 192 && b === 168) return true;             // 192.168.0.0/16
      if (a === 169 && b === 254) return true;             // 169.254.0.0/16 (link-local + AWS metadata)
      if (a === 127) return true;                          // 127.0.0.0/8
      if (a === 0) return true;                            // 0.0.0.0/8
    }

    // Docker internal
    if (host.endsWith('.internal') || host.endsWith('.local')) return true;

    return false;
  } catch {
    return true; // Bei Parse-Fehler blockieren
  }
}

/**
 * Sicher einen Dateipfad innerhalb eines Basisverzeichnisses auflösen.
 * Verhindert Path Traversal (../ Angriffe).
 * @param {string} basePath - Erlaubtes Basisverzeichnis
 * @param {string} userPath - Vom Benutzer/DB stammender Pfad
 * @returns {string|null} - Aufgelöster Pfad oder null bei Traversal-Versuch
 */
export function safePath(basePath, userPath) {
  const resolvedBase = resolve(basePath);
  const resolvedFull = resolve(basePath, userPath);
  if (!resolvedFull.startsWith(resolvedBase)) return null;
  return resolvedFull;
}

/**
 * Berechnet den Montag einer gegebenen Woche
 * @param {Date} date - Ein Datum in der gewünschten Woche
 * @returns {string} - Datum im Format YYYY-MM-DD
 */
export function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  // Sonntag (0) -> 6 Tage zurück, Montag (1) -> 0 Tage zurück, etc.
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  // Lokales Datum verwenden (toISOString() würde nach UTC konvertieren und kann das Datum verschieben)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Berechnet den Wochentag (0=Mo, ..., 6=So) aus einem Datum-String.
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {number} - 0=Montag, ..., 6=Sonntag
 */
export function getDayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const jsDay = d.getDay(); // 0=Sonntag, 1=Montag, ..., 6=Samstag
  return jsDay === 0 ? 6 : jsDay - 1; // 0=Montag, ..., 6=Sonntag
}

/**
 * Formatiert eine Zutatenmenge leserlich
 * z.B. 0.5 -> "½", 1.5 -> "1½"
 */
export function formatAmount(amount) {
  if (!amount) return '';

  const fractions = {
    0.25: '¼',
    0.33: '⅓',
    0.5: '½',
    0.66: '⅔',
    0.75: '¾',
  };

  const whole = Math.floor(amount);
  const fraction = Math.round((amount - whole) * 100) / 100;

  if (fraction === 0) return whole.toString();
  if (whole === 0) return fractions[fraction] || amount.toString();
  return `${whole}${fractions[fraction] || ''}`;
}

/**
 * Normalisiert Einheiten für den Vergleich.
 * Korrigiert Tippfehler/Plural, behält aber natürliche Einheiten bei.
 * Leerer String ("") bedeutet implizit "Stück".
 */
export function normalizeUnit(unit) {
  if (!unit) return '';

  // Trailing-Punkt entfernen (z.B. "Verp." → "Verp") und trimmen
  const cleaned = unit.trim().replace(/\.$/, '');
  if (!cleaned) return '';

  const unitMap = {
    // Gewicht
    gramm: 'g', gram: 'g', gr: 'g',
    kilogramm: 'kg', kilogram: 'kg',
    // Volumen
    milliliter: 'ml',
    liter: 'l',
    // Löffel
    teelöffel: 'TL', 'tl': 'TL',
    esslöffel: 'EL', 'el': 'EL',
    // Stück — nur explizite Stück-Synonyme auf "" (leer = Stück) normalisieren
    stück: '', stueck: '', stk: '', st: '',
    // Natürliche Zähleinheiten bleiben erhalten
    kopf: 'Kopf', köpfe: 'Kopf',
    knolle: 'Knolle', knollen: 'Knolle',
    stange: 'Stange', stangen: 'Stange',
    zweig: 'Zweig', zweige: 'Zweig',
    blatt: 'Blatt', blätter: 'Blatt',
    rispe: 'Rispe', rispen: 'Rispe',
    ring: 'Ring', ringe: 'Ring',
    handvoll: 'Handvoll',
    // Verpackungseinheiten
    packung: 'Pkg', pkg: 'Pkg', pack: 'Pkg', päckchen: 'Pkg',
    verp: 'Pkg', verpackung: 'Pkg', verpackungen: 'Pkg',
    // Andere zählbare Einheiten
    bund: 'Bund',
    dose: 'Dose', dosen: 'Dose',
    becher: 'Becher',
    prise: 'Prise', prisen: 'Prise',
    scheibe: 'Scheibe', scheiben: 'Scheibe',
    zehe: 'Zehe', zehen: 'Zehe',
  };

  return unitMap[cleaned.toLowerCase()] ?? cleaned;
}

/**
 * Konvertiert Mengen in eine einheitliche Basis für Vergleiche.
 * Unterstützt: kg→g, l→ml, TL→ml, EL→ml, Prise→g.
 * Die Löffel-/Prisen-Konvertierungen sind Näherungen (Standard-Kochwerte),
 * reichen aber für Vorratscheck und Einkaufslisten-Abgleich aus.
 */
export function convertToBaseUnit(amount, unit) {
  const conversions = {
    kg: { base: 'g', factor: 1000 },
    l: { base: 'ml', factor: 1000 },
    TL: { base: 'ml', factor: 5 },
    EL: { base: 'ml', factor: 15 },
    Prise: { base: 'g', factor: 0.3 },
  };

  const normalized = normalizeUnit(unit);
  if (conversions[normalized]) {
    return {
      amount: amount * conversions[normalized].factor,
      unit: conversions[normalized].base,
    };
  }

  return { amount, unit: normalized };
}

/**
 * Bestimmt den Einheitentyp: 'weight', 'volume' oder 'counting'
 */
export function getUnitType(unit) {
  const normalized = normalizeUnit(unit);
  if (['g', 'kg'].includes(normalized)) return 'weight';
  if (['ml', 'l'].includes(normalized)) return 'volume';
  if (['EL', 'TL'].includes(normalized)) return 'spoon';
  return 'counting';
}

/**
 * Prüft ob zwei Einheiten einfach kompatibel sind (identisch oder g↔ml).
 */
export function unitsCompatible(unitA, unitB) {
  if (unitA === unitB) return { compatible: true, factor: 1 };
  if ((unitA === 'g' && unitB === 'ml') || (unitA === 'ml' && unitB === 'g')) {
    return { compatible: true, factor: 1 };
  }
  return { compatible: false, factor: 0 };
}

/**
 * Vergleicht Rezept-Bedarf mit Pantry-Bestand für eine bestimmte Zutat.
 * Nutzt erst direkte Einheiten-Kompatibilität, dann die Küchenstandard-Tabelle
 * als Fallback für inkompatible Einheiten (z.B. Stück↔g, Zehe↔Stück).
 *
 * @param {string} ingredientName - Zutatname (für Tabellen-Lookup)
 * @param {number} neededAmount - Benötigte Menge (Originaleinheit)
 * @param {string} neededUnit - Benötigte Einheit (roh, nicht normalisiert)
 * @param {number} pantryAmount - Vorhandene Menge im Vorrat
 * @param {string} pantryUnit - Einheit im Vorrat (roh, nicht normalisiert)
 * @returns {{ compatible: boolean, deduction: number, remaining: number, estimated: boolean, pantryNote: string|null, pantryBaseDeduction: number, pantryBaseUnit: string }}
 */
export function comparePantryAmount(ingredientName, neededAmount, neededUnit, pantryAmount, pantryUnit) {
  // 1. Beide in Basiseinheiten konvertieren (TL→ml, kg→g, etc.)
  const neededBase = convertToBaseUnit(neededAmount, neededUnit);
  const pantryBase = convertToBaseUnit(pantryAmount, pantryUnit);

  // 2. Direkte Kompatibilität prüfen (g↔g, ml↔ml, g↔ml)
  const compat = unitsCompatible(neededBase.unit, pantryBase.unit);

  if (compat.compatible) {
    const deductionBase = Math.min(pantryBase.amount, neededBase.amount);
    const ratio = neededBase.amount > 0 ? deductionBase / neededBase.amount : 0;
    const deduction = neededAmount * ratio;
    let remaining = neededAmount - deduction;
    if (remaining < 0.01) remaining = 0;
    return {
      compatible: true, deduction, remaining, estimated: false, pantryNote: null,
      pantryBaseDeduction: deductionBase, pantryBaseUnit: pantryBase.unit,
    };
  }

  // 3. Küchenstandard-Tabelle: Rezept-Einheit → Pantry-Einheit konvertieren
  const estimate = estimateConversion(ingredientName, neededBase.unit, pantryBase.unit);

  if (estimate) {
    // neededAmount in Pantry-Einheit umrechnen
    const neededInPantryUnit = neededBase.amount * estimate.factor;
    const deductionInPantryUnit = Math.min(pantryBase.amount, neededInPantryUnit);
    const ratio = neededInPantryUnit > 0 ? deductionInPantryUnit / neededInPantryUnit : 0;
    const deduction = neededAmount * ratio;
    let remaining = neededAmount - deduction;
    if (remaining < 0.01) remaining = 0;
    return {
      compatible: true, deduction, remaining, estimated: true, pantryNote: null,
      pantryBaseDeduction: deductionInPantryUnit, pantryBaseUnit: pantryBase.unit,
    };
  }

  // 4. Keine Konvertierung möglich → Hinweis
  return {
    compatible: false,
    deduction: 0,
    remaining: neededAmount,
    estimated: false,
    pantryNote: `Im Vorrat: ${pantryAmount} ${pantryUnit || 'Stk'} (andere Einheit)`.trim(),
    pantryBaseDeduction: 0,
    pantryBaseUnit: pantryBase.unit,
  };
}

/**
 * Berechnet die Zutatenmenge für eine andere Portionszahl
 */
export function scaleIngredient(amount, originalServings, targetServings) {
  if (!amount || !originalServings) return amount;
  return Math.round((amount / originalServings) * targetServings * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_API_KEY =
  (typeof process !== "undefined" &&
    (process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY)) ||
  "";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_MAX_RETRIES = 2;
const GEMINI_RETRY_DELAY_MS = 2000;

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS STATIQUES DES DONNÉES JSON
// ─────────────────────────────────────────────────────────────────────────────
import activitesData from "../data/activites.json";
import cafesData from "../data/cafee.json";
import hotelsData from "../data/hotels.json";
import transportData from "../data/transport.json";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type Hotel = {
  name: string;
  stars: string;
  description: string;
  address?: string;
};

export type Cafe = {
  name: string;
  prix: string;
  zone: string;
};

export type Activity = {
  name: string;
  prix: string;
  description?: string;
};

export type CityData = {
  hotels: Hotel[];
  cafes: Cafe[];
  activities: Activity[];
  fromExcel: boolean;
};

export type DayPlan = {
  title: string;
  ville: string;
  hotel: Hotel | null;
  cafe: Cafe | null;
  activity: string;
  localActivity?: Activity;
  conseil?: string;
  transport?: string;
  meteo?: string;
  activitiesSource?: "json" | "gemini_fallback";
  isExcursion?: boolean;
  excursionCity?: string;
  mainDestination?: string;
};

export type GroupPref = {
  role: string;
  email: string;
  full_name?: string | null;
  hotel_type?: string | null;
  hotel_location?: string | null;
  activity_types?: string | null;
  cafe_levels?: string | null;
  voyage_type?: string | null;
  budget?: string | null;
  hotel_name?: string | null;
  cafe_name?: string | null;
  tranche_age?: string | null;
  destination?: string | null;
  date_depart?: string | null;
  date_arrivee?: string | null;
  nuitees?: number | null;
};

export type RagStep = {
  stepName: "RETRIEVE" | "REASON" | "PLAN" | "GENERATE";
  action: string;
  result: string;
  confidence: number;
  durationMs?: number;
};

export type RagPipelineResult = {
  itinerary: DayPlan[];
  aiAdvice: string;
  steps: RagStep[];
  model: "gemini" | "fallback";
  resolvedDestination?: string;
  resolvedDates?: ResolvedDates;
  geminiError?: string;
};

export type Intent = {
  destinations: string[];
  duration_days: number;
  budget_level: string;
  priority_themes: string[];
  group_profile: string;
  special_requirements: string;
  preferred_hotels: string[];
  preferred_cafes: string[];
  hotel_type: string;
  hotel_location: string;
  cafe_level: string;
  activity_types: string;
};

export type ResolvedDates = {
  dateDebut: Date | null;
  dateFin: Date | null;
  numDays: number;
  conflictInfo: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// VILLES VOISINES (fallback hôtel uniquement, JAMAIS pour café)
// ─────────────────────────────────────────────────────────────────────────────

const NEARBY_CITIES_FOR_HOTEL: Record<string, string[]> = {
  tunis: ["la marsa", "carthage", "ariana", "la goulette"],
  sousse: ["monastir", "mahdia", "msaken"],
  sfax: ["mahdia", "gabes", "el abassia"],
  djerba: ["zarzis", "gabes", "medenine"],
  hammamet: ["nabeul", "kelibia", "grombalia"],
  kairouan: ["sbeitla", "sousse", "sidi bouzid"],
  bizerte: ["tabarka", "mateur", "menzel bourguiba"],
  tozeur: ["nefta", "douz", "kebili"],
  gabes: ["matmata", "zarzis", "sfax"],
  gabès: ["matmata", "zarzis", "sfax"],
  monastir: ["sousse", "mahdia", "msaken"],
  nabeul: ["hammamet", "kelibia", "tunis"],
  tabarka: ["bizerte", "ain draham", "jendouba"],
};

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION CLÉ API
// ─────────────────────────────────────────────────────────────────────────────

function validateApiKey(): { valid: boolean; reason: string } {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === "") {
    return {
      valid: false,
      reason:
        "GEMINI_API_KEY manquante. Ajoutez EXPO_PUBLIC_GEMINI_API_KEY dans votre .env",
    };
  }
  if (GEMINI_API_KEY.length < 20) {
    return {
      valid: false,
      reason: "GEMINI_API_KEY semble invalide (trop courte)",
    };
  }
  return { valid: true, reason: "OK" };
}

// ─────────────────────────────────────────────────────────────────────────────
// RETRY
// ─────────────────────────────────────────────────────────────────────────────

async function callGeminiWithRetry(
  body: object,
  retries = GEMINI_MAX_RETRIES,
): Promise<Response> {
  const keyCheck = validateApiKey();
  if (!keyCheck.valid)
    throw new Error(`[Gemini] Configuration invalide : ${keyCheck.reason}`);

  for (let attempt = 0; attempt <= retries; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (networkErr) {
      if (attempt < retries) {
        await new Promise((r) =>
          setTimeout(r, (attempt + 1) * GEMINI_RETRY_DELAY_MS),
        );
        continue;
      }
      throw new Error(
        `[Gemini] Erreur réseau après ${retries + 1} tentatives : ${String(networkErr)}`,
      );
    }

    if (response.ok) return response;

    const status = response.status;
    const errText = await response.text().catch(() => "");

    if ((status === 429 || status === 503) && attempt < retries) {
      await new Promise((r) =>
        setTimeout(r, (attempt + 1) * GEMINI_RETRY_DELAY_MS),
      );
      continue;
    }
    throw new Error(`[Gemini] HTTP ${status} : ${errText.slice(0, 200)}`);
  }

  throw new Error(
    `[Gemini] Toutes les tentatives ont échoué (${retries + 1} essais)`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RÉSOLUTION DESTINATION & DATES
// ─────────────────────────────────────────────────────────────────────────────

export function resolveMajorityDestination(
  allPrefs: GroupPref[],
  defaultDestination: string,
): string {
  // defaultDestination doit venir de villes[0], jamais hardcodé en "Tunis"
  const destinations = allPrefs
    .map((p) => p.destination)
    .filter((d): d is string => !!d && d.trim() !== "");

  if (!destinations.length) return defaultDestination;

  const freq: Record<string, number> = {};
  for (const dest of destinations) {
    const key = dest.trim().toLowerCase();
    freq[key] = (freq[key] || 0) + 1;
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return defaultDestination;

  const topKey = sorted[0][0];
  const original = destinations.find((d) => d.trim().toLowerCase() === topKey);
  return original || defaultDestination;
}

function parseDateSafe(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function toDateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function resolveMajorityDates(
  allPrefs: GroupPref[],
  leaderPrefs: GroupPref | null,
  fallbackDebut: Date | null,
  fallbackFin: Date | null,
): ResolvedDates {
  const departures: Date[] = [];
  const arrivals: Date[] = [];

  for (const p of allPrefs) {
    const dep = parseDateSafe(p.date_depart);
    const arr = parseDateSafe(p.date_arrivee);
    if (dep) departures.push(dep);
    if (arr) arrivals.push(arr);
  }

  const majorityDate = (
    dates: Date[],
    leaderDate: Date | null,
    fallback: Date | null,
  ): Date | null => {
    if (!dates.length) return fallback;
    const freq: Record<string, { date: Date; count: number }> = {};
    for (const d of dates) {
      const key = toDateKey(d);
      if (freq[key]) freq[key].count++;
      else freq[key] = { date: d, count: 1 };
    }
    const sorted = Object.values(freq).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (leaderDate) {
        const aIsLeader = toDateKey(a.date) === toDateKey(leaderDate);
        const bIsLeader = toDateKey(b.date) === toDateKey(leaderDate);
        if (aIsLeader && !bIsLeader) return -1;
        if (bIsLeader && !aIsLeader) return 1;
      }
      return a.date.getTime() - b.date.getTime();
    });
    return sorted[0]?.date ?? fallback;
  };

  const leaderDep = parseDateSafe(leaderPrefs?.date_depart);
  const leaderArr = parseDateSafe(leaderPrefs?.date_arrivee);
  const resolvedDebut = majorityDate(departures, leaderDep, fallbackDebut);
  const resolvedFin = majorityDate(arrivals, leaderArr, fallbackFin);

  let numDays = 3;
  if (resolvedDebut && resolvedFin) {
    const diff =
      Math.floor(
        (resolvedFin.getTime() - resolvedDebut.getTime()) /
          (1000 * 60 * 60 * 24),
      ) + 1;
    numDays = diff > 0 ? diff : 3;
  }

  const uniqueDeps = [...new Set(departures.map(toDateKey))];
  const uniqueArrs = [...new Set(arrivals.map(toDateKey))];
  const conflicts: string[] = [];
  if (uniqueDeps.length > 1)
    conflicts.push(
      `Dates de départ multiples (${uniqueDeps.join(", ")}) → retenu: ${resolvedDebut ? toDateKey(resolvedDebut) : "—"}`,
    );
  if (uniqueArrs.length > 1)
    conflicts.push(
      `Dates d'arrivée multiples (${uniqueArrs.join(", ")}) → retenue: ${resolvedFin ? toDateKey(resolvedFin) : "—"}`,
    );

  return {
    dateDebut: resolvedDebut,
    dateFin: resolvedFin,
    numDays,
    conflictInfo: conflicts.length ? conflicts.join(" | ") : "Dates cohérentes",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALISATION
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeKey(s: any): string {
  if (typeof s !== "string") return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeCafeEntry(entry: any): Cafe {
  if (!entry || typeof entry !== "object")
    return { name: String(entry ?? ""), prix: "Variable", zone: "" };
  return {
    name: entry.name ?? entry.Nom ?? entry.nom ?? entry.NOM ?? "",
    prix: entry.prix ?? entry.Prix ?? entry.PRIX ?? "Variable",
    zone: entry.zone ?? entry.Zone ?? entry.ZONE ?? "",
  };
}

function normalizeActivityEntry(entry: any): Activity {
  if (typeof entry === "string")
    return { name: entry, prix: "Variable", description: "" };
  if (!entry || typeof entry !== "object")
    return { name: String(entry ?? ""), prix: "Variable", description: "" };
  return {
    name:
      entry.name ??
      entry["Activité"] ??
      entry.Activité ??
      entry.Activite ??
      entry.activité ??
      entry.activite ??
      entry.ACTIVITE ??
      "",
    prix:
      entry.prix ??
      entry["Prix_estimé"] ??
      entry.Prix_estimé ??
      entry.Prix_estime ??
      entry.PRIX ??
      "Variable",
    description: entry.description ?? entry.Description ?? "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSPORT & MÉTÉO
// ─────────────────────────────────────────────────────────────────────────────

function extractTransportEntry(
  entry: any,
): { transport: string; meteo: string } | null {
  if (!entry) return null;
  if (typeof entry === "string")
    return {
      transport: entry,
      meteo: "Printemps et automne agréables en Tunisie.",
    };
  if (typeof entry === "object") {
    if (entry.moyens || entry.conseils) {
      const moyens = Array.isArray(entry.moyens)
        ? entry.moyens.join(", ")
        : String(entry.moyens || "");
      const conseils = entry.conseils || "";
      const prixRaw = entry.prix_moyens;
      const prix = prixRaw
        ? Object.entries(prixRaw as Record<string, string>)
            .map(([k, v]) => `${k} : ${v}`)
            .join(" | ")
        : "";
      let transport = moyens;
      if (conseils) transport += `. ${conseils}`;
      if (prix) transport += ` Prix indicatifs — ${prix}.`;
      return {
        transport: transport.trim() || "Taxis et louages disponibles.",
        meteo: entry.meteo || "Printemps et automne agréables en Tunisie.",
      };
    }
    if (entry.transport) {
      return {
        transport: entry.transport,
        meteo: entry.meteo || "Printemps et automne agréables en Tunisie.",
      };
    }
  }
  return null;
}

const CITY_TIPS_FALLBACK: Record<string, { transport: string; meteo: string }> =
  {
    tunis: {
      transport:
        "Métro léger (TGM) et bus TRANSTU. Taxis blancs recommandés la nuit.",
      meteo: "Mars–mai et sept–nov.",
    },
    sousse: {
      transport: "Louages depuis Tunis (~2h).",
      meteo: "Mai à octobre.",
    },
    djerba: { transport: "Bac depuis Jorf ou avion.", meteo: "Toute l'année." },
    hammamet: {
      transport: "Louages ou taxi depuis Tunis (~1h).",
      meteo: "Avril à octobre.",
    },
    sfax: { transport: "Taxis collectifs et bus.", meteo: "Mars à novembre." },
    kairouan: {
      transport: "Louages depuis Tunis (~1h30).",
      meteo: "Printemps et automne.",
    },
  };

export function getCityTips(ville: string): {
  transport: string;
  meteo: string;
} {
  const key = normalizeKey(ville);
  const data = transportData as Record<string, any>;

  if (data[ville]) {
    const r = extractTransportEntry(data[ville]);
    if (r) return r;
  }
  for (const k of Object.keys(data)) {
    if (normalizeKey(k) === key) {
      const r = extractTransportEntry(data[k]);
      if (r) return r;
    }
  }
  for (const k of Object.keys(data)) {
    const kn = normalizeKey(k);
    if (kn.includes(key) || key.includes(kn)) {
      const r = extractTransportEntry(data[k]);
      if (r) return r;
    }
  }

  return (
    CITY_TIPS_FALLBACK[key] || {
      transport: "Taxis et louages disponibles. Négociez le prix.",
      meteo: "Printemps et automne agréables.",
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RECHERCHE DANS LES JSON
// ─────────────────────────────────────────────────────────────────────────────

const EXCURSION_MAP: Record<string, string> = {
  tunis: "Carthage",
  sousse: "Monastir",
  hammamet: "Nabeul",
  sfax: "Mahdia",
  djerba: "Zarzis",
  kairouan: "Sbeitla",
  bizerte: "Tabarka",
  tozeur: "Nefta",
  gabes: "Matmata",
  gabès: "Matmata",
};

const EXCURSION_KEYWORDS =
  /oui|excursion|aventure|decouverte|explorer|découverte/i;

function isExcursionRequested(voyageType: string | null | undefined): boolean {
  if (!voyageType) return false;
  return EXCURSION_KEYWORDS.test(voyageType);
}

function findInMap<T>(data: Record<string, T[]>, ville: string): T[] | null {
  const key = normalizeKey(ville);
  if (data[ville] && data[ville].length > 0) return data[ville];
  for (const k of Object.keys(data)) {
    if (normalizeKey(k) === key && data[k].length > 0) return data[k];
  }
  for (const k of Object.keys(data)) {
    const kn = normalizeKey(k);
    if ((kn.includes(key) || key.includes(kn)) && data[k].length > 0)
      return data[k];
  }
  return null;
}

/**
 * Cherche des hôtels pour une ville dans les données JSON.
 * Si introuvable, cherche dans les villes voisines réelles.
 * Ne retourne JAMAIS de données inventées.
 */
function getHotelsForCity(
  ville: string,
  cityDataMap: Record<string, CityData>,
): Hotel[] {
  // 1. Données Excel/cityDataMap
  const fromMap =
    cityDataMap[ville]?.hotels || cityDataMap[normalizeKey(ville)]?.hotels;
  if (fromMap && fromMap.length > 0) return fromMap;

  // 2. hotels.json — ville exacte
  const fromJson = findInMap(hotelsData as Record<string, Hotel[]>, ville);
  if (fromJson && fromJson.length > 0) return fromJson;

  // 3. Villes voisines réelles (hotels.json uniquement)
  const villeKey = normalizeKey(ville);
  const nearbyList = NEARBY_CITIES_FOR_HOTEL[villeKey] || [];
  for (const nearby of nearbyList) {
    const nFound = findInMap(hotelsData as Record<string, Hotel[]>, nearby);
    if (nFound && nFound.length > 0) {
      console.info(
        `[getHotelsForCity] Hôtels introuvables pour "${ville}", utilisation de la ville voisine "${nearby}".`,
      );
      return nFound;
    }
  }

  // 4. Dernier recours : première ville avec des hôtels dans hotels.json
  const allHotels = hotelsData as Record<string, Hotel[]>;
  for (const k of Object.keys(allHotels)) {
    if (allHotels[k] && allHotels[k].length > 0) {
      console.info(
        `[getHotelsForCity] Aucun hôtel pour "${ville}" ni voisins, utilisation de "${k}" en dernier recours.`,
      );
      return allHotels[k];
    }
  }

  // 5. Vraiment rien — retourner tableau vide (pas de données inventées)
  console.warn(`[getHotelsForCity] Aucun hôtel trouvé pour "${ville}".`);
  return [];
}

/**
 * Cherche des cafés pour une ville dans les données JSON.
 * Retourne [] si introuvable — JAMAIS de données inventées.
 * Le fallback vers une ville voisine n'est PAS appliqué pour les cafés.
 */
function getCafesForCitySync(
  ville: string,
  cityDataMap: Record<string, CityData>,
): Cafe[] {
  // 1. Données Excel/cityDataMap
  const fromMap =
    cityDataMap[ville]?.cafes || cityDataMap[normalizeKey(ville)]?.cafes;
  if (fromMap && fromMap.length > 0) return fromMap;

  // 2. cafee.json — ville exacte uniquement
  const fromJson = findInMap(cafesData as Record<string, any[]>, ville);
  if (fromJson && fromJson.length > 0) return fromJson.map(normalizeCafeEntry);

  // 3. Aucun café trouvé → [] (pas de fallback vers villes voisines pour les cafés)
  console.info(`[getCafesForCitySync] Aucun café trouvé pour "${ville}".`);
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// GÉNÉRATION DE CAFÉS VIA GEMINI — DÉSACTIVÉE (ne génère jamais)
// ─────────────────────────────────────────────────────────────────────────────

const geminiCafeCache: Record<string, Cafe[]> = {};

// Fonction désactivée – ne génère jamais de café.
async function generateCafesWithGemini(ville: string): Promise<Cafe[]> {
  // Retourne toujours un tableau vide, sans appeler l'API
  console.info(`[Gemini Cafés] Génération désactivée pour "${ville}".`);
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// getCafesForCity — VERSION ASYNCHRONE
// Ne génère JAMAIS via Gemini, retourne [] si aucune donnée locale.
// ─────────────────────────────────────────────────────────────────────────────

export async function getCafesForCity(
  ville: string,
  cityDataMap: Record<string, CityData>,
): Promise<Cafe[]> {
  if (geminiCafeCache[ville] !== undefined) {
    return geminiCafeCache[ville];
  }

  const syncResult = getCafesForCitySync(ville, cityDataMap);
  if (syncResult.length > 0) {
    return syncResult;
  }

  // Aucune donnée locale → pas de génération, retourne []
  console.info(
    `[Cafés] Aucune donnée locale pour "${ville}", aucun café ne sera affiché.`,
  );
  geminiCafeCache[ville] = [];
  return [];
}

/**
 * Version synchrone exportée — retourne [] si pas de données locales.
 */
export function getCafesForCityFallbackSync(
  ville: string,
  cityDataMap: Record<string, CityData>,
): Cafe[] {
  if (geminiCafeCache[ville] !== undefined) {
    return geminiCafeCache[ville];
  }
  return getCafesForCitySync(ville, cityDataMap);
}

function getActivitiesForCity(
  ville: string,
  cityDataMap: Record<string, CityData>,
): Activity[] {
  const fromMap =
    cityDataMap[ville]?.activities ||
    cityDataMap[normalizeKey(ville)]?.activities;
  if (fromMap && fromMap.length > 0) return fromMap;

  const fromJson = findInMap(activitesData as Record<string, any[]>, ville);
  if (fromJson && fromJson.length > 0)
    return fromJson.map(normalizeActivityEntry);

  // Villes voisines pour les activités aussi
  const villeKey = normalizeKey(ville);
  const nearbyList = NEARBY_CITIES_FOR_HOTEL[villeKey] || [];
  for (const nearby of nearbyList) {
    const nFound = findInMap(activitesData as Record<string, any[]>, nearby);
    if (nFound && nFound.length > 0) return nFound.map(normalizeActivityEntry);
  }

  return [];
}

export function enrichCityDataWithJson(
  ville: string,
  cityDataMap: Record<string, CityData>,
): CityData {
  return {
    hotels: getHotelsForCity(ville, cityDataMap),
    cafes: getCafesForCityFallbackSync(ville, cityDataMap),
    activities: getActivitiesForCity(ville, cityDataMap),
    fromExcel: !!cityDataMap[ville]?.fromExcel,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS RECHERCHE PAR NOM PRÉFÉRÉ
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function findByPreferredName<T extends { name: string }>(
  list: T[],
  preferredName: string | null | undefined,
): T | null {
  if (!preferredName || !list.length) return null;
  const pn = normalizeStr(preferredName);

  const exact = list.find((item) => normalizeStr(item.name) === pn);
  if (exact) return exact;

  const contains = list.find((item) => normalizeStr(item.name).includes(pn));
  if (contains) return contains;

  const reverse = list.find((item) => pn.includes(normalizeStr(item.name)));
  if (reverse) return reverse;

  const pnWords = pn.split(" ").filter((w) => w.length > 3);
  if (pnWords.length > 0) {
    const wordMatch = list.find((item) =>
      pnWords.some((w) => normalizeStr(item.name).includes(w)),
    );
    if (wordMatch) return wordMatch;
  }

  return null;
}

export function prioritizeByName<T extends { name: string }>(
  list: T[],
  preferredName: string | null | undefined,
): T[] {
  if (!preferredName || !list.length) return list;
  const match = findByPreferredName(list, preferredName);
  if (!match) return list;
  return [match, ...list.filter((item) => item.name !== match.name)];
}

// ─────────────────────────────────────────────────────────────────────────────
// MOTS-CLÉS LOISIRS
// ─────────────────────────────────────────────────────────────────────────────

const LEISURE_KEYWORDS =
  /plage|beach|shopping|souk|hammam|spa|piscine|vélo|velo|randonnée|randonnee|coucher\s*de\s*soleil|détente|detente|promenade|dégustation|degustation|gastronomie|quad|snorkeling|surf|balade|loisir|divertissement/i;

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACTION DES LOISIRS DEPUIS activites.json
// ─────────────────────────────────────────────────────────────────────────────

function getLeisureFromJson(ville: string): Activity[] | null {
  const key = normalizeKey(ville);
  const data = activitesData as Record<string, any[]>;

  let cityActivities: any[] | null = null;

  if (data[ville] && data[ville].length > 0) {
    cityActivities = data[ville];
  }

  if (!cityActivities) {
    for (const k of Object.keys(data)) {
      if (normalizeKey(k) === key && data[k].length > 0) {
        cityActivities = data[k];
        break;
      }
    }
  }

  if (!cityActivities) {
    for (const k of Object.keys(data)) {
      const kn = normalizeKey(k);
      if ((kn.includes(key) || key.includes(kn)) && data[k].length > 0) {
        cityActivities = data[k];
        break;
      }
    }
  }

  if (!cityActivities || cityActivities.length === 0) return null;

  const normalized: Activity[] = cityActivities
    .map((entry) => normalizeActivityEntry(entry))
    .filter((act) => LEISURE_KEYWORDS.test(act.name));

  return normalized.length > 0 ? normalized : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// VÉRIFICATION DE DOUBLON
// ─────────────────────────────────────────────────────────────────────────────

function isActivityAlreadyMentioned(
  activityName: string,
  existingActivityText: string,
): boolean {
  if (!activityName || !existingActivityText) return false;
  const candidateKey = normalizeKey(activityName);
  const existingKey = normalizeKey(existingActivityText);

  if (existingKey.includes(candidateKey)) return true;

  const words = candidateKey.split(/\s+/).filter((w) => w.length > 3);
  if (words.length === 0) return false;
  const matchCount = words.filter((w) => existingKey.includes(w)).length;
  return matchCount >= Math.ceil(words.length / 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// GESTIONNAIRE DE LOISIRS SANS RÉPÉTITION
// ─────────────────────────────────────────────────────────────────────────────

class LeisureScheduler {
  private pool: Activity[];
  private used: Set<string> = new Set();

  constructor(ville: string) {
    const fromJson = getLeisureFromJson(ville);
    this.pool = fromJson ?? [];
  }

  pick(existingActivityText?: string): Activity | undefined {
    for (const activity of this.pool) {
      const k = normalizeKey(activity.name);
      if (this.used.has(k)) continue;

      if (
        existingActivityText &&
        isActivityAlreadyMentioned(activity.name, existingActivityText)
      ) {
        continue;
      }

      this.used.add(k);
      return activity;
    }
    return undefined;
  }

  markUsed(activityName: string): void {
    const k = normalizeKey(activityName);
    this.used.add(k);
  }

  remaining(): number {
    return this.pool.filter((a) => !this.used.has(normalizeKey(a.name))).length;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// selectLocalActivity
// ─────────────────────────────────────────────────────────────────────────────

export function selectLocalActivity(
  activities: Activity[],
  dayIndex: number,
  mainActivityName?: string,
  ville?: string,
  scheduler?: LeisureScheduler,
  existingActivityText?: string,
): Activity | undefined {
  if (scheduler) {
    return scheduler.pick(existingActivityText);
  }

  if (ville) {
    const fromJson = getLeisureFromJson(ville);
    if (!fromJson || fromJson.length === 0) return undefined;

    const available = fromJson.filter(
      (act) =>
        !existingActivityText ||
        !isActivityAlreadyMentioned(act.name, existingActivityText),
    );
    if (available.length === 0) return undefined;
    return available[dayIndex % available.length];
  }

  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// SÉLECTION HOTEL
// ─────────────────────────────────────────────────────────────────────────────

function hotelTypeToStars(hotelType: string): number | null {
  const t = hotelType.toLowerCase();
  if (t.includes("luxe") || t.includes("5")) return 5;
  if (t.includes("standard") || t.includes("4")) return 4;
  if (t.includes("maison") || t.includes("3")) return 3;
  return null;
}

function countStars(hotel: Hotel): number {
  const m = (hotel.stars || "").match(/[⭐★]/g);
  return m ? m.length : 3;
}

export function selectHotel(
  hotels: Hotel[],
  pref?: GroupPref | null,
  preferredHotelName?: string | null,
): Hotel | null {
  if (!hotels.length) return null; // pas de données → null, jamais inventé

  const resolvedName = preferredHotelName ?? pref?.hotel_name ?? null;
  if (resolvedName) {
    const byName = findByPreferredName(hotels, resolvedName);
    if (byName) return byName;
  }

  if (pref?.hotel_type) {
    const targetStars = hotelTypeToStars(pref.hotel_type);
    if (targetStars) {
      const match = hotels.filter((h) => countStars(h) === targetStars);
      if (match.length) return match[0];
    }
  }
  return hotels[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRUCTION D'UN JOUR D'EXCURSION
// ─────────────────────────────────────────────────────────────────────────────

function buildExcursionDay(
  villePrincipale: string,
  villeExcursion: string,
  cityDataMap: Record<string, CityData>,
  dayIndex: number,
  excursionScheduler?: LeisureScheduler,
): DayPlan {
  const excursionCityData = enrichCityDataWithJson(villeExcursion, cityDataMap);

  const hotel = excursionCityData.hotels[0] || null;
  // Cafés de la ville d'excursion uniquement, null si introuvable
  const cafe: Cafe | null =
    excursionCityData.cafes.length > 0 ? excursionCityData.cafes[0] : null;

  const activities =
    excursionCityData.activities.length > 0 ? excursionCityData.activities : [];

  const activitePrincipale = activities[0] || {
    name: `Découverte de ${villeExcursion}`,
    prix: "Variable",
    description: "",
  };

  const nextAct = activities[1] || activitePrincipale;

  let activityText = `Matinée : ${activitePrincipale.name}`;
  if (activitePrincipale.description && activitePrincipale.description.trim()) {
    activityText += ` — ${activitePrincipale.description}`;
  }
  if (activitePrincipale.prix && activitePrincipale.prix !== "Variable") {
    activityText += ` (entrée : ${activitePrincipale.prix})`;
  }
  activityText += `. Déjeuner d'un repas local typique à ${villeExcursion} dans un restaurant du centre.`;
  if (nextAct && nextAct.name !== activitePrincipale.name) {
    activityText += ` Après-midi : ${nextAct.name}`;
    if (nextAct.description && nextAct.description.trim()) {
      activityText += ` — ${nextAct.description}`;
    }
    activityText += `.`;
  }
  activityText += ` Retour à ${villePrincipale} en soirée.`;

  if (excursionScheduler) {
    excursionScheduler.markUsed(activitePrincipale.name);
    if (nextAct.name !== activitePrincipale.name) {
      excursionScheduler.markUsed(nextAct.name);
    }
  }

  let activiteLocale: Activity | undefined;
  if (excursionScheduler) {
    activiteLocale = excursionScheduler.pick(activityText);
  } else {
    const oneOff = new LeisureScheduler(villeExcursion);
    oneOff.markUsed(activitePrincipale.name);
    if (nextAct.name !== activitePrincipale.name) {
      oneOff.markUsed(nextAct.name);
    }
    activiteLocale = oneOff.pick(activityText);
  }

  const transportAller = `Depuis ${villePrincipale} : louage ou taxi jusqu'à ${villeExcursion} (~1h, ~15–25 TND).`;
  const tips = getCityTips(villeExcursion);

  return {
    title: `Jour ${dayIndex + 1} — Excursion à ${villeExcursion}`,
    ville: villeExcursion,
    hotel,
    cafe,
    activity: activityText,
    ...(activiteLocale !== undefined ? { localActivity: activiteLocale } : {}),
    conseil: `Partez tôt depuis ${villePrincipale} pour profiter pleinement de ${villeExcursion}. Retour en soirée.`,
    transport: `${transportAller}\nSur place : ${tips.transport}`,
    meteo: tips.meteo,
    activitiesSource: "json",
    isExcursion: true,
    excursionCity: villeExcursion,
    mainDestination: villePrincipale,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST-TRAITEMENTS
// ─────────────────────────────────────────────────────────────────────────────

export function applyPreferredHotelToItinerary(
  itinerary: DayPlan[],
  preferredHotelName: string,
  cityDataMap: Record<string, CityData>,
  defaultVille: string,
): DayPlan[] {
  return itinerary.map((day) => {
    if (day.isExcursion) return day;
    const ville = day.ville || defaultVille;
    const allHotels = getHotelsForCity(ville, cityDataMap);
    const match = findByPreferredName(allHotels, preferredHotelName);
    if (match) return { ...day, hotel: match };
    // Hôtel non trouvé → garder le nom demandé mais sans inventer les étoiles/description
    return {
      ...day,
      hotel: {
        name: preferredHotelName,
        stars: day.hotel?.stars || "",
        description: day.hotel?.description || "",
      },
    };
  });
}

export function applyPreferredCafeToItinerary(
  itinerary: DayPlan[],
  preferredCafeName: string,
  cityDataMap: Record<string, CityData>,
  defaultVille: string,
): DayPlan[] {
  return itinerary.map((day, idx) => {
    if (day.isExcursion) return day;
    const ville = day.ville || defaultVille;
    // Cafés de la ville uniquement, pas de ville voisine pour les cafés
    const localCafes = getCafesForCityFallbackSync(ville, cityDataMap);
    if (localCafes.length === 0) return day; // pas de cafés → ne pas affecter
    const match = findByPreferredName(localCafes, preferredCafeName);
    if (match && (idx === 0 || idx % 2 === 0)) {
      return { ...day, cafe: match };
    }
    return day;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RÉSOLUTION DE LA DESTINATION EFFECTIVE
// Jamais "Tunis" hardcodé — toujours issu des données réelles
// ─────────────────────────────────────────────────────────────────────────────

function resolveDestination(
  allPrefs: GroupPref[],
  villes: string[],
  fallbackDefault: string,
): string {
  // Priorité 1 : valeur dans les préférences (majorité)
  const fromPrefs = resolveMajorityDestination(allPrefs, "");
  if (fromPrefs && fromPrefs.trim() !== "") return fromPrefs;

  // Priorité 2 : première ville explicitement fournie
  if (villes.length > 0 && villes[0].trim() !== "") return villes[0];

  // Priorité 3 : fallback fourni par l'appelant (issu de villes[0])
  return fallbackDefault;
}

// ─────────────────────────────────────────────────────────────────────────────
// GÉNÉRATION LOCALE (FALLBACK)
// ─────────────────────────────────────────────────────────────────────────────

export function generateFallbackPlan(params: {
  villes: string[];
  days: number;
  cityDataMap: Record<string, CityData>;
  isMultiCity: boolean;
  getVilleForDay: (index: number) => string;
  groupPrefs?: GroupPref[];
  leaderPrefs?: GroupPref | null;
  fallbackDateDebut?: Date | null;
  fallbackDateFin?: Date | null;
  preferredHotelName?: string | null;
  preferredCafeName?: string | null;
}): RagPipelineResult {
  const {
    villes,
    days,
    cityDataMap,
    isMultiCity,
    getVilleForDay,
    groupPrefs = [],
    leaderPrefs = null,
    fallbackDateDebut = null,
    fallbackDateFin = null,
    preferredHotelName = null,
    preferredCafeName = null,
  } = params;

  const steps: RagStep[] = [
    {
      stepName: "RETRIEVE",
      action: "Chargement données locales JSON",
      result: `${villes.length} ville(s) chargée(s)`,
      confidence: 1.0,
      durationMs: 5,
    },
    {
      stepName: "REASON",
      action: "Analyse préférences groupe (mode local)",
      result: `${groupPrefs.length} préférence(s)`,
      confidence: 0.85,
      durationMs: 2,
    },
    {
      stepName: "PLAN",
      action: "Construction itinéraire local",
      result: `${days} jour(s) planifié(s)`,
      confidence: 0.9,
      durationMs: 3,
    },
    {
      stepName: "GENERATE",
      action: "Génération locale (Gemini indisponible)",
      result:
        "Plan généré depuis les données JSON — hôtels réels (ville ou voisine), cafés null si introuvables.",
      confidence: 0.8,
      durationMs: 1,
    },
  ];

  const allPrefs = [...(leaderPrefs ? [leaderPrefs] : []), ...groupPrefs];

  const resolvedDestination = resolveDestination(
    allPrefs,
    villes,
    villes[0] ?? "",
  );

  const resolvedDates = resolveMajorityDates(
    allPrefs,
    leaderPrefs,
    fallbackDateDebut,
    fallbackDateFin,
  );

  const numDays =
    resolvedDates.numDays > 0 ? resolvedDates.numDays : days > 0 ? days : 3;

  const cityCache: Record<
    string,
    {
      hotels: Hotel[];
      cafes: Cafe[];
      activities: Activity[];
      tips: { transport: string; meteo: string };
    }
  > = {};

  const getCachedCity = (ville: string) => {
    if (!cityCache[ville]) {
      cityCache[ville] = {
        hotels: getHotelsForCity(ville, cityDataMap),
        cafes: getCafesForCityFallbackSync(ville, cityDataMap),
        activities: getActivitiesForCity(ville, cityDataMap),
        tips: getCityTips(ville),
      };
    }
    return cityCache[ville];
  };

  const mainVille = resolvedDestination || villes[0] || "";
  const mainCity = getCachedCity(mainVille);

  const mainHotel = selectHotel(
    mainCity.hotels,
    leaderPrefs,
    preferredHotelName,
  );

  const leisureSchedulers: Record<string, LeisureScheduler> = {};
  const getScheduler = (ville: string): LeisureScheduler => {
    if (!leisureSchedulers[ville]) {
      leisureSchedulers[ville] = new LeisureScheduler(ville);
    }
    return leisureSchedulers[ville];
  };

  const itinerary: DayPlan[] = [];

  for (let i = 0; i < numDays; i++) {
    const ville = isMultiCity ? getVilleForDay(i) : mainVille;
    const city = getCachedCity(ville);

    const hotel = isMultiCity
      ? selectHotel(city.hotels, leaderPrefs, preferredHotelName)
      : mainHotel;

    // Café : null si pas de données pour cette ville (pas de fallback inventé)
    let cafe: Cafe | null = null;
    if (city.cafes.length > 0) {
      if (preferredCafeName && (i === 0 || i % 2 === 0)) {
        const match = findByPreferredName(city.cafes, preferredCafeName);
        cafe = match ?? city.cafes[i % city.cafes.length];
      } else {
        cafe = city.cafes[i % city.cafes.length];
      }
    }

    const activities = city.activities.length > 0 ? city.activities : [];

    let activityText = "";
    let localActivity: Activity | undefined;

    if (activities.length > 0) {
      const actIndex = i % activities.length;
      const act = activities[actIndex];
      const nextActIndex = (actIndex + 1) % activities.length;
      const nextAct = activities[nextActIndex];

      activityText = `Matinée : ${act.name}`;
      if (act.description && act.description.trim()) {
        activityText += ` — ${act.description}`;
      }
      if (act.prix && act.prix !== "Variable") {
        activityText += ` (entrée : ${act.prix})`;
      }
      activityText += `. Déjeuner dans un restaurant local pour découvrir la gastronomie tunisienne authentique.`;
      if (nextAct && nextAct.name !== act.name) {
        activityText += ` Après-midi : ${nextAct.name}`;
        if (nextAct.description && nextAct.description.trim()) {
          activityText += ` — ${nextAct.description}`;
        }
        if (nextAct.prix && nextAct.prix !== "Variable") {
          activityText += ` (${nextAct.prix})`;
        }
        activityText += `.`;
      }

      const scheduler = getScheduler(ville);
      scheduler.markUsed(act.name);
      if (nextAct && nextAct.name !== act.name) {
        scheduler.markUsed(nextAct.name);
      }
      localActivity = scheduler.pick(activityText);
    } else {
      activityText = `Exploration libre de ${ville} : sites emblématiques, gastronomie locale et immersion culturelle.`;
    }

    itinerary.push({
      title: `Jour ${i + 1}`,
      ville,
      hotel,
      cafe,
      activity: activityText,
      ...(localActivity !== undefined ? { localActivity } : {}),
      transport: city.tips.transport,
      meteo: city.tips.meteo,
      activitiesSource: "json",
    });
  }

  const voyageType =
    leaderPrefs?.voyage_type || groupPrefs[0]?.voyage_type || "";
  if (isExcursionRequested(voyageType) && !isMultiCity && villes.length === 1) {
    const villeExcursion = EXCURSION_MAP[normalizeKey(resolvedDestination)];
    if (villeExcursion) {
      const excursionIndex = Math.floor(numDays / 2);
      if (excursionIndex >= 0 && excursionIndex < itinerary.length) {
        const excScheduler = new LeisureScheduler(villeExcursion);
        itinerary[excursionIndex] = buildExcursionDay(
          resolvedDestination,
          villeExcursion,
          cityDataMap,
          excursionIndex,
          excScheduler,
        );
      }
    }
  }

  const budgets = groupPrefs
    .map((p) => p.budget)
    .filter(Boolean)
    .join(", ");
  const types = groupPrefs
    .map((p) => p.voyage_type)
    .filter(Boolean)
    .join(", ");
  let aiAdvice = `Plan local généré pour ${resolvedDestination}`;
  if (numDays > 0) aiAdvice += ` — ${numDays} jour${numDays > 1 ? "s" : ""}`;
  if (types) aiAdvice += `. Type de voyage : ${types}`;
  if (budgets) aiAdvice += `. Budget estimé : ${budgets} TND`;
  aiAdvice += `. Chaque jour inclut un programme culturel complet.`;

  return {
    itinerary,
    aiAdvice,
    steps,
    model: "fallback",
    resolvedDestination,
    resolvedDates,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE PRINCIPAL (AGENTIC RAG)
// ─────────────────────────────────────────────────────────────────────────────

export async function runAgenticRagPipeline(params: {
  villes: string[];
  days: number;
  cityDataMap: Record<string, CityData>;
  groupPrefs: GroupPref[];
  leaderPrefs: GroupPref | null;
  isMultiCity: boolean;
  getVilleForDay: (index: number) => string;
  defaultDestination?: string;
  fallbackDateDebut?: Date | null;
  fallbackDateFin?: Date | null;
  preferredHotelName?: string | null;
  preferredCafeName?: string | null;
}): Promise<RagPipelineResult> {
  const {
    villes,
    days,
    cityDataMap,
    groupPrefs,
    leaderPrefs,
    isMultiCity,
    getVilleForDay,
    fallbackDateDebut = null,
    fallbackDateFin = null,
    preferredHotelName = null,
    preferredCafeName = null,
  } = params;

  const steps: RagStep[] = [];
  const t0 = Date.now();

  // ── STEP 1 : RETRIEVE ────────────────────────────────────────────
  const t1 = Date.now();
  const enrichedMap: Record<string, CityData> = {};

  await Promise.all(
    villes.map(async (ville) => {
      const baseCityData = enrichCityDataWithJson(ville, cityDataMap);
      const cafes = await getCafesForCity(ville, cityDataMap);

      enrichedMap[ville] = {
        ...baseCityData,
        cafes,
      };

      const cafeSource =
        cafes.length === 0
          ? "aucun"
          : geminiCafeCache[ville] !== undefined &&
              getCafesForCitySync(ville, cityDataMap).length === 0
            ? "gemini (désactivé)" // On indique que c'est désactivé
            : "json";

      console.info(
        `[RETRIEVE] ${ville} — ${enrichedMap[ville].hotels.length} hôtels | ${cafes.length} cafés (source: ${cafeSource}) | ${enrichedMap[ville].activities.length} activités`,
      );
    }),
  );

  steps.push({
    stepName: "RETRIEVE",
    action: "Chargement et enrichissement des données locales",
    result: `${villes.length} ville(s) : ${villes
      .map((v) => {
        const cafeCount = enrichedMap[v].cafes.length;
        const cafeInfo =
          cafeCount === 0
            ? "aucun café"
            : geminiCafeCache[v] !== undefined &&
                getCafesForCitySync(v, cityDataMap).length === 0
              ? `${cafeCount} cafés (✨ Gemini désactivé)`
              : `${cafeCount} cafés`;
        return `${v} (${enrichedMap[v].hotels.length} hôtels, ${cafeInfo}, ${enrichedMap[v].activities.length} activités)`;
      })
      .join(" | ")}`,
    confidence: 1.0,
    durationMs: Date.now() - t1,
  });

  // ── STEP 2 : REASON ──────────────────────────────────────────────
  const t2 = Date.now();
  const allPrefs = [...(leaderPrefs ? [leaderPrefs] : []), ...groupPrefs];

  const resolvedDestination = resolveDestination(
    allPrefs,
    villes,
    villes[0] ?? "",
  );

  const resolvedDates = resolveMajorityDates(
    allPrefs,
    leaderPrefs,
    fallbackDateDebut,
    fallbackDateFin,
  );
  const numDays =
    resolvedDates.numDays > 0 ? resolvedDates.numDays : days > 0 ? days : 3;

  const voyageType =
    leaderPrefs?.voyage_type || groupPrefs[0]?.voyage_type || "";
  const doExcursion =
    isExcursionRequested(voyageType) && !isMultiCity && villes.length === 1;
  let excursionCity: string | null = null;
  if (doExcursion) {
    excursionCity = EXCURSION_MAP[normalizeKey(resolvedDestination)] || null;
  }

  const intent: Intent = {
    destinations: villes,
    duration_days: numDays,
    budget_level: leaderPrefs?.budget || groupPrefs[0]?.budget || "moyen",
    priority_themes: [
      leaderPrefs?.activity_types || groupPrefs[0]?.activity_types || "culture",
    ].filter(Boolean) as string[],
    group_profile: `${allPrefs.length} participant(s)`,
    special_requirements: "",
    preferred_hotels: [
      preferredHotelName || leaderPrefs?.hotel_name || "",
    ].filter(Boolean) as string[],
    preferred_cafes: [preferredCafeName || leaderPrefs?.cafe_name || ""].filter(
      Boolean,
    ) as string[],
    hotel_type:
      leaderPrefs?.hotel_type || groupPrefs[0]?.hotel_type || "standard",
    hotel_location:
      leaderPrefs?.hotel_location || groupPrefs[0]?.hotel_location || "centre",
    cafe_level:
      leaderPrefs?.cafe_levels || groupPrefs[0]?.cafe_levels || "standard",
    activity_types:
      leaderPrefs?.activity_types ||
      groupPrefs[0]?.activity_types ||
      "culture, nature",
  };

  steps.push({
    stepName: "REASON",
    action: "Analyse des préférences et résolution groupe",
    result: `Destination: ${resolvedDestination} | Durée: ${numDays}j | Budget: ${intent.budget_level} | Activités: ${intent.activity_types}`,
    confidence: 0.92,
    durationMs: Date.now() - t2,
  });

  // ── STEP 3 : PLAN ────────────────────────────────────────────────
  const t3 = Date.now();

  const contextParts: string[] = [];
  for (const ville of villes) {
    const cd = enrichedMap[ville];

    const hotels = preferredHotelName
      ? prioritizeByName(cd.hotels, preferredHotelName)
      : cd.hotels;
    const cafes = preferredCafeName
      ? prioritizeByName(cd.cafes, preferredCafeName)
      : cd.cafes;

    const hotelNames = hotels
      .slice(0, 5)
      .map((h) => `${h.name} (${h.stars}) — ${h.description}`)
      .join(", ");

    const cafeNames =
      cafes.length > 0
        ? cafes
            .slice(0, 4)
            .map((c) => `${c.name} — ${c.zone} (${c.prix})`)
            .join(", ")
        : "Aucun café référencé pour cette ville — ne pas inclure de café";

    const actNames = cd.activities
      .slice(0, 8)
      .map((a) => `${a.name}${a.description ? ` (${a.description})` : ""}`)
      .join(" | ");

    const isGeminiCafes =
      geminiCafeCache[ville] !== undefined &&
      getCafesForCitySync(ville, cityDataMap).length === 0 &&
      cafes.length > 0;

    contextParts.push(
      `Ville: ${ville}\nHôtels: ${hotelNames}\nCafés${isGeminiCafes ? " (générés par IA — DÉSACTIVÉ)" : cafes.length === 0 ? " (AUCUN — mettre cafe_nom: null)" : ""}: ${cafeNames}\nSites culturels & activités: ${actNames}`,
    );
  }

  let excursionInstruction = "";
  if (excursionCity) {
    const excCityData = enrichCityDataWithJson(excursionCity, cityDataMap);
    const excCafes = await getCafesForCity(excursionCity, cityDataMap);
    const excCafeNames =
      excCafes.length > 0
        ? excCafes
            .slice(0, 2)
            .map((c) => c.name)
            .join(", ")
        : "Aucun café — mettre null";
    contextParts.push(
      `Ville d'excursion: ${excursionCity}\nHôtels: ${excCityData.hotels
        .slice(0, 3)
        .map((h) => h.name)
        .join(", ")}\nCafés: ${excCafeNames}\nSites: ${excCityData.activities
        .slice(0, 5)
        .map((a) => a.name)
        .join(", ")}`,
    );
    const dayNum = Math.floor(numDays / 2) + 1;
    excursionInstruction = `\n- Le jour ${dayNum} est une EXCURSION à ${excursionCity}. Le champ "activite" doit décrire le programme complet de cette excursion : transport depuis ${resolvedDestination} (louage/taxi ~1h ~15-25 TND), matinée sur le site principal de ${excursionCity}, déjeuner local, après-midi découverte. Retour en soirée.\n- Les autres jours restent centrés sur ${resolvedDestination}.`;
  }

  steps.push({
    stepName: "PLAN",
    action: "Construction du contexte RAG enrichi",
    result: `Contexte construit pour ${villes.length} ville(s) — prêt pour Gemini`,
    confidence: 0.95,
    durationMs: Date.now() - t3,
  });

  // ── STEP 4 : GENERATE (Gemini) ───────────────────────────────────
  const keyCheck = validateApiKey();
  if (!keyCheck.valid) {
    console.warn("[RAG] Clé Gemini absente, fallback local activé");
    return generateFallbackPlan({
      ...params,
      fallbackDateDebut,
      fallbackDateFin,
      preferredHotelName,
      preferredCafeName,
    });
  }

  const t4 = Date.now();

  const groupProfile = allPrefs
    .map((p) => {
      const parts = [p.role === "leader" ? "👑 Leader" : "👤 Invité"];
      const prenom = p.full_name
        ? p.full_name.split(" ")[0]
        : (p.email?.split("@")[0] ?? "Voyageur");
      parts.push(`Prénom: ${prenom}`);
      if (p.hotel_type) parts.push(`hôtel souhaité: ${p.hotel_type}`);
      if (p.hotel_location) parts.push(`emplacement: ${p.hotel_location}`);
      if (p.activity_types) parts.push(`activités: ${p.activity_types}`);
      if (p.budget) parts.push(`budget: ${p.budget} TND`);
      if (p.voyage_type) parts.push(`type de voyage: ${p.voyage_type}`);
      if (p.tranche_age) parts.push(`âge: ${p.tranche_age}`);
      return parts.join(" | ");
    })
    .join("\n");

  const leaderHotelType =
    leaderPrefs?.hotel_type || groupPrefs[0]?.hotel_type || "standard";
  const leaderBudget = leaderPrefs?.budget || groupPrefs[0]?.budget || "moyen";
  const leaderLocation =
    leaderPrefs?.hotel_location || groupPrefs[0]?.hotel_location || "centre";

  const preferenceInstruction = [
    preferredHotelName
      ? `- HÔTEL OBLIGATOIRE : utilise EXACTEMENT "${preferredHotelName}" pour TOUS les jours non-excursion. NE JAMAIS utiliser un autre hôtel.`
      : "",
    preferredCafeName
      ? `- CAFÉ PRIORITAIRE : utilise "${preferredCafeName}" pour les jours 1 et les jours pairs (seulement si des cafés sont disponibles dans les données).`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const hotelSelectionContext = `Type souhaité: ${leaderHotelType} | Budget: ${leaderBudget} TND | Localisation préférée: ${leaderLocation}${preferredHotelName ? ` | HÔTEL IMPOSÉ: ${preferredHotelName}` : ""}`;

  const prompt = `Tu es un expert en planification de voyages en Tunisie.
Génère un itinéraire détaillé de ${numDays} jours pour ${resolvedDestination}.

CONTEXTE DONNÉES LOCALES (utilise EXACTEMENT ces noms de lieux) :
${contextParts.join("\n\n")}

PROFIL DU GROUPE (${allPrefs.length} participant(s)) :
${groupProfile || "Voyageur solo, préférences standards"}

CRITÈRES DE SÉLECTION HÔTEL : ${hotelSelectionContext}

INSTRUCTIONS IMPORTANTES :
${preferenceInstruction}
- Génère exactement ${numDays} jours
- Utilise UNIQUEMENT les noms d'hôtels et de cafés fournis ci-dessus
- Si "AUCUN café" est indiqué pour une ville, mets cafe_nom à null
- Ne jamais inventer des noms d'hôtels ou de cafés absents des données
- Adapte les activités aux préférences et à la tranche d'âge du groupe

- Le champ "activite" est un RÉCIT DE VOYAGE FLUIDE ET IMMERSIF en 2-3 phrases courtes,
  écrit à la 2ème personne ("Commencez", "Enchaînez", "Profitez"),
  comme un guide qui parle directement au voyageur.

LIEUX AUTORISÉS :
  ✅ Médinas, souks, marchés traditionnels
  ✅ Ribats, mosquées, zaouïas, mausolées
  ✅ Musées, sites archéologiques, ruines antiques
  ✅ Plages, corniche, bords de mer
  ✅ Quartiers historiques, kasbahs, fortifications
  ✅ Cafés traditionnels, restaurants locaux, pâtisseries
  ✅ Artisans, coopératives, ateliers de poterie/tapis
  ✅ Oasis, sources naturelles, paysages emblématiques

LIEUX INTERDITS :
  ❌ Parcs d'attractions, jeux, arcades, karting, bowling
  ❌ Centres commerciaux modernes
  ❌ Activités sportives génériques

${excursionInstruction}

Réponds UNIQUEMENT en JSON valide avec cette structure exacte :
{
  "jours": [
    {
      "jour": 1,
      "titre": "Titre accrocheur du jour",
      "hotel_nom": "Nom exact de l'hôtel depuis la liste${preferredHotelName ? ` (DOIT être: ${preferredHotelName})` : ""}",
      "cafe_nom": "Nom exact du café depuis la liste, ou null si aucun disponible",
      "activite": "Récit fluide 2-3 phrases style guide local",
      "conseil": "Explication personnalisée + astuce pratique"
    }
  ],
  "conseil_global": "Conseil général personnalisé pour le groupe en 3-4 phrases"
}`;

  try {
    const response = await callGeminiWithRetry({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        topP: 0.95,
        maxOutputTokens: 4096,
      },
    });

    const data = await response.json();
    let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    rawText = rawText
      .replace(/```json\n?/gi, "")
      .replace(/```\n?/gi, "")
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("JSON invalide dans la réponse Gemini");
      }
    }

    const geminiJours: any[] = parsed?.jours || [];
    if (!geminiJours.length) throw new Error("Gemini n'a retourné aucun jour");

    const geminiLeisureSchedulers: Record<string, LeisureScheduler> = {};
    const getGeminiScheduler = (ville: string): LeisureScheduler => {
      if (!geminiLeisureSchedulers[ville]) {
        geminiLeisureSchedulers[ville] = new LeisureScheduler(ville);
      }
      return geminiLeisureSchedulers[ville];
    };

    const itinerary: DayPlan[] = geminiJours.map((j: any, idx: number) => {
      const ville = isMultiCity ? getVilleForDay(idx) : resolvedDestination;
      const cd =
        enrichedMap[ville] ||
        enrichedMap[resolvedDestination] ||
        enrichedMap[villes[0]];

      // ── Hôtel : depuis les données réelles uniquement ────────────
      let hotel: Hotel | null;
      if (preferredHotelName) {
        const byPreferred = findByPreferredName(cd.hotels, preferredHotelName);
        if (byPreferred) {
          hotel = byPreferred;
        } else if (cd.hotels.length > 0) {
          // Hôtel non trouvé dans les données → garder l'existant sans inventer
          hotel = cd.hotels[0];
          console.warn(
            `[Gemini post-traitement] Hôtel "${preferredHotelName}" non trouvé pour ${ville}, utilisation de "${hotel.name}".`,
          );
        } else {
          hotel = null;
        }
      } else {
        const hotelNom = (j.hotel_nom || "").trim();
        if (hotelNom && cd.hotels.length > 0) {
          hotel =
            cd.hotels.find((h) =>
              normalizeKey(h.name).includes(normalizeKey(hotelNom)),
            ) ?? selectHotel(cd.hotels, leaderPrefs, null);
        } else {
          hotel = cd.hotels.length > 0 ? cd.hotels[0] : null;
        }
      }

      // ── Café : null si aucune donnée pour cette ville ────────────
      const cafeNom = (j.cafe_nom || "").trim();
      let cafe: Cafe | null = null;

      if (cd.cafes.length > 0) {
        // Seulement si des cafés existent dans les données
        if (cafeNom && cafeNom !== "null" && cafeNom !== "aucun") {
          if (preferredCafeName && (idx === 0 || idx % 2 === 0)) {
            cafe = findByPreferredName(cd.cafes, preferredCafeName) ?? null;
          }
          if (!cafe) {
            cafe =
              cd.cafes.find((c) =>
                normalizeKey(c.name).includes(normalizeKey(cafeNom)),
              ) ?? cd.cafes[idx % cd.cafes.length];
          }
        } else {
          // Gemini a retourné null mais on a des cafés → utiliser quand même
          if (preferredCafeName && (idx === 0 || idx % 2 === 0)) {
            cafe = findByPreferredName(cd.cafes, preferredCafeName) ?? null;
          }
          if (!cafe) {
            cafe = cd.cafes[idx % cd.cafes.length];
          }
        }
      }
      // Si cd.cafes.length === 0 → cafe reste null, pas de données inventées

      const activityText = j.activite || `Exploration de ${ville}`;
      const scheduler = getGeminiScheduler(ville);
      const localActivity = scheduler.pick(activityText);

      const tips = getCityTips(ville);

      return {
        title: j.titre || `Jour ${idx + 1}`,
        ville,
        hotel,
        cafe,
        activity: activityText,
        ...(localActivity !== undefined ? { localActivity } : {}),
        conseil: j.conseil || "",
        transport: tips.transport,
        meteo: tips.meteo,
        activitiesSource: "gemini_fallback" as const,
      };
    });

    // Compléter si Gemini a retourné moins de jours que demandé
    if (itinerary.length < numDays) {
      const fallbackResult = generateFallbackPlan({
        ...params,
        fallbackDateDebut,
        fallbackDateFin,
        preferredHotelName,
        preferredCafeName,
      });
      for (let i = itinerary.length; i < numDays; i++) {
        itinerary.push(
          fallbackResult.itinerary[i] ||
            fallbackResult.itinerary[fallbackResult.itinerary.length - 1],
        );
      }
    }

    // Insérer le jour d'excursion si demandé
    if (excursionCity && !isMultiCity) {
      const excursionIndex = Math.floor(numDays / 2);
      const alreadyExcursion =
        itinerary[excursionIndex]?.ville === excursionCity;
      if (!alreadyExcursion) {
        const excScheduler = new LeisureScheduler(excursionCity);
        itinerary[excursionIndex] = buildExcursionDay(
          resolvedDestination,
          excursionCity,
          cityDataMap,
          excursionIndex,
          excScheduler,
        );
      }
    }

    // Post-traitement final : garantir l'hôtel préféré partout (depuis données réelles)
    if (preferredHotelName) {
      for (const day of itinerary) {
        if (!day.isExcursion) {
          const ville = day.ville || resolvedDestination;
          const cd =
            enrichedMap[ville] ||
            enrichedMap[resolvedDestination] ||
            enrichedMap[villes[0]];
          const match = findByPreferredName(
            cd?.hotels || [],
            preferredHotelName,
          );
          if (match) {
            day.hotel = match;
          }
          // Si pas trouvé → on garde l'hôtel actuel (réel), pas de données inventées
        }
      }
    }

    steps.push({
      stepName: "GENERATE",
      action: "Génération Gemini 2.5-Flash",
      result: `✅ ${itinerary.length} jours générés${excursionCity ? ` (excursion à ${excursionCity})` : ""}${preferredHotelName ? ` — hôtel: ${preferredHotelName}` : ""}`,
      confidence: 0.95,
      durationMs: Date.now() - t4,
    });

    const aiAdvice =
      parsed?.conseil_global ||
      `Itinéraire personnalisé pour ${resolvedDestination} — ${numDays} jours.`;

    return {
      itinerary,
      aiAdvice,
      steps,
      model: "gemini",
      resolvedDestination,
      resolvedDates,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(
      "[RAG] ⚠️ Gemini indisponible, activation du fallback local :",
      errMsg,
    );

    steps.push({
      stepName: "GENERATE",
      action: "Tentative Gemini → Fallback local",
      result: `⚠️ Gemini indisponible: ${errMsg.slice(0, 100)}`,
      confidence: 0.6,
      durationMs: Date.now() - t4,
    });

    const fallbackResult = generateFallbackPlan({
      ...params,
      fallbackDateDebut,
      fallbackDateFin,
      preferredHotelName,
      preferredCafeName,
    });

    return {
      ...fallbackResult,
      steps: [...steps, ...fallbackResult.steps],
      geminiError: errMsg,
    };
  }
}

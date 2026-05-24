import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useTravelData } from "../../context/TravelContext";

import { API } from "../../constants/api";
import activitesData from "../../data/activites.json";
import cafesData from "../../data/cafee.json";
import hotelsData from "../../data/hotels.json";
import transportData from "../../data/transport.json";
import {
  enrichCityDataWithJson,
  getCityTips,
  runAgenticRagPipeline,
  type CityData,
  type GroupPref,
  type DayPlan as RagDayPlan,
  type RagStep,
} from "../../service/geminiRagService";

// ─── CONFIG ──────────────────────────────────────────────────
const WEATHER_API_KEY =
  process.env.EXPO_PUBLIC_OPENWEATHER_KEY || "770482e1017ac0ddc2ac6247fb9358c8";

// ─── COULEURS ─────────────────────────────────────────────────
const BLUE_DEEP = "#042A66";
const BLUE_PRIMARY = "#0A4DBF";
const BLUE_PALE = "#D6E4FF";
const BLUE_ULTRA_PALE = "#EEF4FF";
const WHITE = "#FFFFFF";
const TEXT_MUTED = "#7A90B4";
const GOLD = "#C89B3C";
const GEMINI_BLUE = "#1A73E8";
const GEMINI_PALE = "#E8F0FE";
const GREEN = "#1B8A5A";
const GREEN_PALE = "#D4F5E9";
const ORANGE = "#EA580C";
const ORANGE_PALE = "#FFEDD5";
const RED = "#DC2626";

const HOTEL_PRICES: Record<string, Record<string, number>> = {
  "3": {
    Tunis: 90,
    Sousse: 80,
    Djerba: 95,
    Hammamet: 85,
    Sfax: 75,
    default: 80,
  },
  "4": {
    Tunis: 150,
    Sousse: 130,
    Djerba: 145,
    Hammamet: 140,
    Sfax: 120,
    default: 130,
  },
  "5": {
    Tunis: 250,
    Sousse: 220,
    Djerba: 240,
    Hammamet: 230,
    Sfax: 200,
    default: 220,
  },
};
const CAFE_PRICES: Record<string, number> = {
  Tunis: 18,
  Sousse: 15,
  Djerba: 16,
  Hammamet: 15,
  Sfax: 12,
  default: 14,
};
const TRANSPORT_PRICES: Record<string, number> = {
  Tunis: 10,
  Sousse: 10,
  Djerba: 8,
  Hammamet: 8,
  Sfax: 5,
  default: 8,
};

const CITY_SAFETY_THRESHOLDS: Record<string, any> = {
  Tunis: {
    maxTempAlert: 38,
    minTempAlert: 5,
    maxWindAlert: 50,
    maxHumidityAlert: 85,
  },
  Sousse: {
    maxTempAlert: 37,
    minTempAlert: 6,
    maxWindAlert: 45,
    maxHumidityAlert: 80,
  },
  Djerba: {
    maxTempAlert: 39,
    minTempAlert: 8,
    maxWindAlert: 55,
    maxHumidityAlert: 88,
  },
  Hammamet: {
    maxTempAlert: 37,
    minTempAlert: 6,
    maxWindAlert: 48,
    maxHumidityAlert: 83,
  },
  Sfax: {
    maxTempAlert: 40,
    minTempAlert: 4,
    maxWindAlert: 52,
    maxHumidityAlert: 80,
  },
  Tozeur: {
    maxTempAlert: 42,
    minTempAlert: 2,
    maxWindAlert: 60,
    maxHumidityAlert: 70,
  },
  Kairouan: {
    maxTempAlert: 41,
    minTempAlert: 3,
    maxWindAlert: 55,
    maxHumidityAlert: 75,
  },
  Bizerte: {
    maxTempAlert: 36,
    minTempAlert: 5,
    maxWindAlert: 60,
    maxHumidityAlert: 85,
  },
  default: {
    maxTempAlert: 38,
    minTempAlert: 5,
    maxWindAlert: 50,
    maxHumidityAlert: 85,
  },
};

// ═══════════════════════════════════════════════════════════════
// SÉCURITÉ DES LIEUX
// ═══════════════════════════════════════════════════════════════
export type PlaceSafetyLevel = "safe" | "warning" | "excluded";
export type PlaceSafetyReport = {
  score: number;
  level: PlaceSafetyLevel;
  reasons: string[];
  badge: string;
};

function computePlaceSafetyScore(
  entry: any,
  type: "cafe" | "activity" | "hotel",
): PlaceSafetyReport {
  let score = 60;
  const reasons: string[] = [];
  const ratingRaw =
    entry?.Rating ?? entry?.rating ?? entry?.Note ?? entry?.note ?? null;
  const rating = ratingRaw ? parseFloat(String(ratingRaw)) : null;
  if (rating !== null) {
    if (rating >= 4.5) {
      score += 20;
      reasons.push(`Excellente note : ${rating}/5`);
    } else if (rating >= 4.0) {
      score += 12;
      reasons.push(`Bonne note : ${rating}/5`);
    } else if (rating >= 3.5) {
      score += 4;
      reasons.push(`Note correcte : ${rating}/5`);
    } else if (rating >= 3.0) {
      score -= 8;
      reasons.push(`Note moyenne : ${rating}/5`);
    } else {
      score -= 20;
      reasons.push(`Note faible : ${rating}/5`);
    }
  } else {
    score -= 5;
    reasons.push("Note inconnue");
  }

  const reviewsRaw =
    entry?.Avis ?? entry?.avis ?? entry?.Reviews ?? entry?.reviews ?? null;
  const reviews = reviewsRaw ? parseInt(String(reviewsRaw), 10) : null;
  if (reviews !== null) {
    if (reviews >= 500) {
      score += 15;
      reasons.push(`${reviews} avis (très populaire)`);
    } else if (reviews >= 100) {
      score += 8;
      reasons.push(`${reviews} avis`);
    } else if (reviews >= 30) {
      score += 2;
      reasons.push(`${reviews} avis`);
    } else {
      score -= 5;
      reasons.push(`Peu d'avis : ${reviews}`);
    }
  } else {
    score -= 3;
  }

  const prixRaw =
    entry?.Prix ??
    entry?.prix ??
    entry?.Prix_estimé ??
    entry?.prix_estimé ??
    "";
  const prixStr = String(prixRaw);
  if (prixStr) {
    const nums = prixStr.match(/\d+/g);
    if (nums && nums.length > 0) {
      const minP = parseInt(nums[0], 10);
      if (type === "cafe") {
        if (minP >= 5 && minP <= 40) {
          score += 5;
          reasons.push("Gamme de prix raisonnable");
        } else if (minP > 40) {
          score += 3;
          reasons.push("Café haut de gamme");
        } else {
          score -= 3;
          reasons.push("Prix très bas — vérifier la qualité");
        }
      }
      if (type === "activity") {
        if (minP === 0) {
          score += 5;
          reasons.push("Activité gratuite ou libre");
        } else if (minP <= 50) {
          score += 3;
          reasons.push("Tarif accessible");
        }
      }
    }
  }

  const hasDesc = !!(
    entry?.description ||
    entry?.Description ||
    entry?.Adresse ||
    entry?.adresse
  );
  if (hasDesc) {
    score += 5;
    reasons.push("Informations détaillées disponibles");
  } else {
    score -= 3;
    reasons.push("Peu d'informations");
  }

  if (type === "cafe") {
    const zone = String(entry?.Zone ?? entry?.zone ?? "");
    if (zone.length > 2) {
      score += 5;
      reasons.push(`Zone identifiée : ${zone}`);
    } else {
      score -= 3;
      reasons.push("Zone non renseignée");
    }
  }
  if (type === "hotel") {
    const stars =
      parseInt(
        String(entry?.stars ?? entry?.Stars ?? "3").replace(/[^0-9]/g, ""),
        10,
      ) || 3;
    if (stars >= 4) {
      score += 10;
      reasons.push(`Hôtel ${stars} étoiles`);
    } else if (stars === 3) {
      score += 3;
      reasons.push("Hôtel 3 étoiles");
    }
  }

  score = Math.max(0, Math.min(100, score));
  let level: PlaceSafetyLevel;
  let badge: string;
  if (score >= 65) {
    level = "safe";
    badge = "✓ Lieu sûr";
  } else if (score >= 40) {
    level = "warning";
    badge = "⚠ À vérifier";
  } else {
    level = "excluded";
    badge = "✕ Non recommandé";
  }
  return { score, level, reasons, badge };
}

function filterAndRankBySafety<T>(
  list: T[],
  type: "cafe" | "activity" | "hotel",
  allowWarning = true,
) {
  return list
    .map((entry) => ({ entry, report: computePlaceSafetyScore(entry, type) }))
    .filter(
      ({ report }) =>
        report.level === "safe" || (allowWarning && report.level === "warning"),
    )
    .sort((a, b) => b.report.score - a.report.score);
}

function selectSafeCafe(
  cafeList: any[],
  weatherProfile: WeatherProfile,
  currentIdx: number,
  preferredCafeName: string | null,
) {
  if (cafeList.length === 0)
    return { entry: null, idx: 0, weatherAlert: null, safetyReport: null };
  if (preferredCafeName?.trim()) {
    const found = cafeList.find((c: any) =>
      (c.Nom || c.name || "")
        .toLowerCase()
        .includes(preferredCafeName.toLowerCase().slice(0, 5)),
    );
    if (found) {
      const report = computePlaceSafetyScore(found, "cafe");
      return {
        entry: found,
        idx: cafeList.indexOf(found),
        weatherAlert:
          report.level === "warning"
            ? `⚠ ${found.Nom || found.name} : score ${report.score}/100`
            : null,
        safetyReport: report,
      };
    }
  }
  const ranked = filterAndRankBySafety(cafeList, "cafe", true);
  if (!ranked.length) {
    const entry = cafeList[currentIdx % cafeList.length];
    return {
      entry,
      idx: currentIdx % cafeList.length,
      weatherAlert: "⚠ Aucun café validé",
      safetyReport: computePlaceSafetyScore(entry, "cafe"),
    };
  }
  const needsIndoor = ["rainy", "storm", "cold", "foggy"].includes(
    weatherProfile,
  );
  const isHot = weatherProfile === "sunny";
  const indoorKws = [
    "centre",
    "mall",
    "médina",
    "intérieur",
    "galerie",
    "hotel",
    "hôtel",
    "indoor",
    "couvert",
    "avenue",
    "boulevard",
  ];
  const terrasseKws = [
    "terrasse",
    "jardin",
    "rooftop",
    "extérieur",
    "plage",
    "panorama",
  ];
  let pool = ranked;
  if (needsIndoor) {
    const indoor = ranked.filter(({ entry }) => {
      const zone = String(entry?.Zone ?? entry?.zone ?? "").toLowerCase();
      const desc = String(entry?.description ?? "").toLowerCase();
      return indoorKws.some((kw) => zone.includes(kw) || desc.includes(kw));
    });
    if (indoor.length) pool = indoor;
  } else if (isHot) {
    const terrasse = ranked.filter(({ entry }) => {
      const zone = String(entry?.Zone ?? entry?.zone ?? "").toLowerCase();
      return terrasseKws.some((kw) => zone.includes(kw));
    });
    if (terrasse.length) pool = terrasse;
  }
  const pick = pool[currentIdx % pool.length];
  let weatherAlert: string | null = null;
  if (needsIndoor) weatherAlert = "☔ Météo — café en intérieur";
  else if (isHot) weatherAlert = "☀️ Beau temps — café en terrasse";
  return {
    entry: pick.entry,
    idx: cafeList.indexOf(pick.entry),
    weatherAlert,
    safetyReport: pick.report,
  };
}

function selectSafeActivity(
  actList: any[],
  weatherProfile: WeatherProfile,
  currentIdx: number,
) {
  if (!actList.length)
    return { entry: null, idx: 0, weatherAlert: null, safetyReport: null };
  const ranked = filterAndRankBySafety(actList, "activity", true);
  if (!ranked.length) {
    const entry = actList[currentIdx % actList.length];
    return {
      entry,
      idx: currentIdx % actList.length,
      weatherAlert: null,
      safetyReport: computePlaceSafetyScore(entry, "activity"),
    };
  }
  const needsIndoor = ["rainy", "storm", "cold"].includes(weatherProfile);
  const outdoorKws = [
    "plage",
    "randonnée",
    "vélo",
    "parc",
    "extérieur",
    "jardin",
    "plein air",
    "escalade",
    "surf",
    "baignade",
    "camping",
  ];
  const indoorKws = [
    "musée",
    "shopping",
    "galerie",
    "cinéma",
    "hammam",
    "spa",
    "culture",
    "restaurant",
    "café",
    "bowling",
    "escape",
    "aquarium",
    "mall",
  ];
  let pool = ranked;
  if (needsIndoor) {
    const indoor = ranked.filter(({ entry }) => {
      const name = String(entry?.Activité ?? entry?.nom ?? "").toLowerCase();
      const desc = String(entry?.description ?? "").toLowerCase();
      const isOutdoor = outdoorKws.some(
        (kw) => name.includes(kw) || desc.includes(kw),
      );
      const isIndoor = indoorKws.some(
        (kw) => name.includes(kw) || desc.includes(kw),
      );
      return isIndoor || !isOutdoor;
    });
    if (indoor.length) pool = indoor;
  }
  const pick = pool[currentIdx % pool.length];
  const weatherAlert = needsIndoor
    ? weatherProfile === "storm"
      ? "⛈️ Orage — activité en intérieur"
      : "🌧️ Pluie — activité en intérieur"
    : null;
  return {
    entry: pick.entry,
    idx: actList.indexOf(pick.entry),
    weatherAlert,
    safetyReport: pick.report,
  };
}

function selectSafeHotel(
  hotelList: any[],
  weatherProfile: WeatherProfile,
  currentIdx: number,
  preferredHotelName: string | null,
) {
  if (!hotelList.length) {
    return {
      entry: {
        name: preferredHotelName || "Hôtel Premium",
        stars: "4",
        description: "",
      },
      idx: 0,
      weatherAlert: null,
      safetyReport: null,
    };
  }
  if (preferredHotelName?.trim()) {
    const found = hotelList.find((h: any) =>
      (h.name || h.Nom || "")
        .toLowerCase()
        .includes(preferredHotelName.toLowerCase().slice(0, 6)),
    );
    if (found) {
      const report = computePlaceSafetyScore(found, "hotel");
      return {
        entry: found,
        idx: hotelList.indexOf(found),
        weatherAlert: null,
        safetyReport: report,
      };
    }
  }
  const ranked = filterAndRankBySafety(hotelList, "hotel", true);
  if (!ranked.length) {
    const entry = hotelList[currentIdx % hotelList.length];
    return {
      entry,
      idx: currentIdx % hotelList.length,
      weatherAlert: null,
      safetyReport: computePlaceSafetyScore(entry, "hotel"),
    };
  }
  if (["storm", "rainy"].includes(weatherProfile)) {
    const spa = ranked.filter(({ entry }) => {
      const desc = String(
        entry?.description ?? entry?.Description ?? "",
      ).toLowerCase();
      return ["spa", "piscine", "fitness", "restaurant", "wellness"].some(
        (kw) => desc.includes(kw),
      );
    });
    if (spa.length) {
      const pick = spa[currentIdx % spa.length];
      return {
        entry: pick.entry,
        idx: hotelList.indexOf(pick.entry),
        weatherAlert: "🌧️ Pluie — hôtel avec équipements intérieurs",
        safetyReport: pick.report,
      };
    }
  }
  const pick = ranked[currentIdx % ranked.length];
  return {
    entry: pick.entry,
    idx: hotelList.indexOf(pick.entry),
    weatherAlert: null,
    safetyReport: pick.report,
  };
}

// ─── MÉTÉO ────────────────────────────────────────────────────
const METEO_CACHE: Record<string, { data: WeatherInfo; ts: number }> = {};
const METEO_TTL_MS = 10 * 60 * 1000;
type WeatherInfo = {
  temp: number;
  feels: number;
  desc: string;
  icon: string;
  humidity: number;
  wind: number;
  city: string;
};

async function fetchWeather(city: string): Promise<WeatherInfo | null> {
  if (!WEATHER_API_KEY) return null;
  const cached = METEO_CACHE[city];
  if (cached && Date.now() - cached.ts < METEO_TTL_MS) return cached.data;
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)},TN&appid=${WEATHER_API_KEY}&units=metric&lang=fr`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();
    const info: WeatherInfo = {
      temp: Math.round(d.main.temp),
      feels: Math.round(d.main.feels_like),
      desc: d.weather[0]?.description ?? "",
      icon: d.weather[0]?.icon ?? "",
      humidity: d.main.humidity,
      wind: Math.round(d.wind.speed),
      city: d.name,
    };
    METEO_CACHE[city] = { data: info, ts: Date.now() };
    return info;
  } catch {
    return null;
  }
}

function weatherEmoji(icon: string): string {
  if (icon.startsWith("01")) return "☀️";
  if (icon.startsWith("02") || icon.startsWith("03")) return "⛅";
  if (icon.startsWith("04")) return "☁️";
  if (icon.startsWith("09") || icon.startsWith("10")) return "🌧️";
  if (icon.startsWith("11")) return "⛈️";
  if (icon.startsWith("13")) return "❄️";
  if (icon.startsWith("50")) return "🌫️";
  return "🌤️";
}

type WeatherProfile =
  | "sunny"
  | "cloudy"
  | "rainy"
  | "storm"
  | "cold"
  | "foggy"
  | "normal";
function getWeatherProfile(icon: string): WeatherProfile {
  if (!icon) return "normal";
  if (icon.startsWith("01") || icon.startsWith("02")) return "sunny";
  if (icon.startsWith("03") || icon.startsWith("04")) return "cloudy";
  if (icon.startsWith("09") || icon.startsWith("10")) return "rainy";
  if (icon.startsWith("11")) return "storm";
  if (icon.startsWith("13")) return "cold";
  if (icon.startsWith("50")) return "foggy";
  return "normal";
}

type SafetyAlert = {
  level: "info" | "warning" | "danger";
  icon: string;
  title: string;
  message: string;
  recommendations: string[];
};

function generateSafetyAlerts(
  weather: WeatherInfo | null,
  city: string,
): SafetyAlert[] {
  if (!weather) return [];
  const alerts: SafetyAlert[] = [];
  const th = CITY_SAFETY_THRESHOLDS[city] || CITY_SAFETY_THRESHOLDS["default"];
  if (weather.temp >= th.maxTempAlert) {
    alerts.push({
      level: "danger",
      icon: "🌡️",
      title: "Chaleur extrême",
      message: `${weather.temp}°C à ${city}. Évitez les sorties entre 12h et 16h.`,
      recommendations: [
        "Chapeau et crème solaire obligatoires",
        "Eau en permanence",
        "Pauses en intérieur climatisé",
      ],
    });
  } else if (weather.temp >= th.maxTempAlert - 3) {
    alerts.push({
      level: "warning",
      icon: "☀️",
      title: "Forte chaleur",
      message: `${weather.temp}°C à ${city}. Prenez des précautions.`,
      recommendations: [
        "Protection solaire recommandée",
        "Réduisez l'effort physique",
      ],
    });
  }
  if (weather.temp <= th.minTempAlert) {
    alerts.push({
      level: "warning",
      icon: "🥶",
      title: "Températures basses",
      message: `${weather.temp}°C à ${city}. Couvrez-vous correctement.`,
      recommendations: [
        "Manteau et couches supplémentaires",
        "Boissons chaudes conseillées",
      ],
    });
  }
  if (weather.wind >= th.maxWindAlert) {
    alerts.push({
      level: "danger",
      icon: "💨",
      title: "Vents forts",
      message: `Vents à ${weather.wind} km/h. Évitez les zones côtières.`,
      recommendations: [
        "Restez à l'intérieur si possible",
        "Annulez les activités nautiques",
      ],
    });
  }
  if (weather.humidity >= th.maxHumidityAlert) {
    alerts.push({
      level: "info",
      icon: "💧",
      title: "Humidité élevée",
      message: `Humidité à ${weather.humidity}%. Risque de chaleur accrue.`,
      recommendations: [
        "Vêtements légers et respirants",
        "Hydratation renforcée",
      ],
    });
  }
  const profile = getWeatherProfile(weather.icon);
  if (profile === "storm") {
    alerts.push({
      level: "danger",
      icon: "⛈️",
      title: "Orage — Danger",
      message: "Orage en cours. Restez à l'intérieur.",
      recommendations: [
        "Intérieur uniquement",
        "Évitez les sous-sols",
        "Ne vous abritez pas sous les arbres",
      ],
    });
  } else if (profile === "rainy") {
    alerts.push({
      level: "info",
      icon: "🌧️",
      title: "Pluie prévue",
      message: "Pluie détectée. Privilégiez les activités couvertes.",
      recommendations: [
        "Imperméable ou parapluie",
        "Musées et galeries",
        "Routes glissantes — prudence",
      ],
    });
  }
  return alerts;
}

// ─── HELPERS JSON ─────────────────────────────────────────────
function parseMinPrice(range: string | undefined): number {
  if (!range) return 0;
  const m = range.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}
function hotelPriceForCity(city: string, stars: string): number {
  const tier = HOTEL_PRICES[stars] || HOTEL_PRICES["4"];
  return tier[city] ?? tier["default"];
}
function cafePriceFromJson(entry: any): number {
  const raw = entry?.Prix ?? entry?.prix ?? "";
  const p = parseMinPrice(raw);
  return p > 0 ? p : CAFE_PRICES["default"];
}
function activityPriceFromJson(entry: any): number {
  const raw = entry?.Prix_estimé ?? entry?.prix ?? "";
  const p = parseMinPrice(raw);
  return p > 0 ? p : 30;
}
function getCafeList(city: string): any[] {
  const data = (cafesData as any)[city];
  return data && Array.isArray(data) ? data : [];
}
function getHotelList(city: string): any[] {
  const data = (hotelsData as any)[city];
  return data && Array.isArray(data) ? data : [];
}
function getActivityList(city: string): any[] {
  const data = (activitesData as any)[city];
  return data && Array.isArray(data) ? data : [];
}
function getTransportList(
  city: string,
): { label: string; prixStr: string; prixNum: number }[] {
  const t: any = (transportData as any)[city];
  if (!t) return [];
  const moyens: string[] = t.moyens || [];
  const prix: Record<string, string> = t.prix_moyens || {};
  if (moyens.length === 0) return [];
  return moyens.map((m) => {
    const key =
      Object.keys(prix).find((k) =>
        k.toLowerCase().includes(m.toLowerCase().slice(0, 4)),
      ) ||
      Object.keys(prix)[0] ||
      "";
    const prixStr = prix[key] || "8–15 TND";
    const prixNum =
      parseMinPrice(prixStr) ||
      (TRANSPORT_PRICES[city] ?? TRANSPORT_PRICES["default"]);
    return { label: m, prixStr, prixNum };
  });
}

// ─── BACKEND ──────────────────────────────────────────────────
async function fetchGuestEmailsForCode(inviteCode: string): Promise<string[]> {
  try {
    const emails: string[] = [];
    try {
      const res = await fetch(
        `${API}/api/group-preferences?invite_code=${encodeURIComponent(inviteCode)}`,
      );
      if (res.ok) {
        const data = await res.json();
        for (const item of data) {
          const email = (item.email || "").trim().toLowerCase();
          if (email && email.includes("@")) emails.push(email);
          else if (item.user_id) {
            try {
              const userRes = await fetch(`${API}/api/user/${item.user_id}`);
              if (userRes.ok) {
                const user = await userRes.json();
                if (user.email?.includes("@"))
                  emails.push(user.email.toLowerCase());
              }
            } catch {}
          } else if (typeof item === "string" && item.includes("@"))
            emails.push(item.trim().toLowerCase());
        }
      }
    } catch {}
    try {
      const invRes = await fetch(
        `${API}/api/pending-invites?invite_code=${encodeURIComponent(inviteCode)}`,
      );
      if (invRes.ok) {
        const invData = await invRes.json();
        for (const item of invData.pending || []) {
          const e = (item.email || "").trim().toLowerCase();
          if (e && e.includes("@")) emails.push(e);
        }
      }
    } catch {}
    try {
      const allRes = await fetch(
        `${API}/api/invite-emails?invite_code=${encodeURIComponent(inviteCode)}`,
      );
      if (allRes.ok) {
        const allData = await allRes.json();
        for (const e of allData.emails || []) {
          const clean = (e || "").trim().toLowerCase();
          if (clean.includes("@")) emails.push(clean);
        }
      }
    } catch {}
    return [...new Set(emails)];
  } catch {
    return [];
  }
}

async function savePlanToBackend(params: {
  planData: SavedPlan;
  inviteCode: string | null;
  guestEmails: string[];
  leaderEmail: string;
  leaderName: string;
  leaderId?: string | null;
}): Promise<{
  success: boolean;
  planCode?: string;
  emailsSent?: Record<string, string>;
  error?: string;
}> {
  const {
    planData,
    inviteCode,
    guestEmails,
    leaderEmail,
    leaderName,
    leaderId,
  } = params;
  const bodyToSend = {
    plan_code: undefined,
    leader_id: leaderId || null,
    leader_email: leaderEmail,
    leader_name: leaderName,
    plan: {
      nom: planData.nom,
      destination: planData.destination,
      dateDebut: planData.dateDebut,
      dateFin: planData.dateFin,
      itinerary: planData.itinerary,
      ...planData,
    },
    guest_emails: guestEmails.filter((e) => e && e.includes("@")),
  };
  try {
    const res = await fetch(`${API}/save-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyToSend),
    });
    const rawText = await res.text();
    let result: Record<string, any> = {};
    try {
      result = JSON.parse(rawText);
    } catch {}
    if (!res.ok)
      return {
        success: false,
        error: String(result.error || `Erreur serveur (${res.status})`),
      };
    return {
      success: true,
      planCode: String(result.plan_code || ""),
      emailsSent: result.emails_sent || {},
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Réseau inaccessible" };
  }
}

// ─── PAIEMENT ─────────────────────────────────────────────────
function luhnCheck(num: string): boolean {
  return num.replace(/\D/g, "").length === 16;
}
function detectCardType(num: string): string {
  const n = num.replace(/\D/g, "");
  if (/^(457|458|459|460|461|462|463|464|465)/.test(n)) return "🏦 CIB Tunisie";
  if (/^4/.test(n)) return "💳 Visa";
  if (/^5[1-5]/.test(n)) return "💳 Mastercard";
  if (/^(636|650|676)/.test(n)) return "💳 Smart Pay";
  return "💳 Carte bancaire";
}
function formatCardDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 16);
  const groups: string[] = [];
  for (let i = 0; i < 4; i++) {
    const chunk = digits.slice(i * 4, i * 4 + 4);
    if (chunk) groups.push(chunk);
  }
  return groups.join(" ");
}
function isExpiryValid(mm_yy: string): boolean {
  const [mm, yy] = mm_yy.split("/");
  if (!mm || !yy || mm.length < 2 || yy.length < 2) return false;
  const month = parseInt(mm, 10);
  const year = parseInt(yy, 10);
  if (month < 1 || month > 12) return false;
  const fullYear = 2000 + year;
  const now = new Date();
  if (fullYear > now.getFullYear()) return true;
  if (fullYear === now.getFullYear() && month >= now.getMonth() + 1)
    return true;
  return false;
}

// ─── TYPES ────────────────────────────────────────────────────
type SwapState = {
  hotelIdx: number;
  cafeIdx: number;
  actIdx: number;
  transportIdx: number;
};
type DailyCost = {
  hotel: number;
  cafe: number;
  activity: number;
  transport: number;
  dailyTotal: number;
};
type PremiumDayPlan = {
  id: string;
  title: string;
  ville: string;
  dayIndex: number;
  swap: SwapState;
  hotel: { name: string; stars: string; description: string; rating: string };
  cafe: { name: string; zone: string; prix: string };
  activity: string;
  activityEntry?: any;
  localActivity?: { name: string; prix: string; description?: string };
  transport: { label: string; prixStr: string };
  meteo?: WeatherInfo | null;
  conseil?: string;
  weatherAlerts?: {
    hotel?: string | null;
    cafe?: string | null;
    activity?: string | null;
  };
  safetyAlerts?: SafetyAlert[];
  placeSafety?: {
    hotel: PlaceSafetyReport | null;
    cafe: PlaceSafetyReport | null;
    activity: PlaceSafetyReport | null;
  };
  aiGenerated: boolean;
  cost: DailyCost;
};
type SavedPlan = {
  id: string;
  nom: string;
  destination: string;
  dateDebut: string;
  dateFin: string;
  duree: number;
  dateCreation: string;
  statut: "à venir" | "en cours" | "terminé";
  voyageurs: number;
  activites: string[];
  hotels: string[];
  itinerary: PremiumDayPlan[];
  type: "premium";
  budget: number;
  servicesInclus: string[];
  guidePrive: boolean;
  transportVip: boolean;
  aiModel?: "gemini" | "fallback";
  aiAdvice?: string;
  inviteCode?: string;
  plan_code?: string;
};

function generateDayId(dayIndex: number): string {
  return `day-${Date.now()}-${dayIndex}-${Math.random().toString(36).slice(2, 8)}`;
}

function recomputeDay(
  day: PremiumDayPlan,
  _maxBudget?: number,
  preferredHotelName?: string | null,
  preferredCafeName?: string | null,
): PremiumDayPlan {
  const city = day.ville;
  const { hotelIdx, cafeIdx, actIdx, transportIdx } = day.swap;
  const weatherProfile = getWeatherProfile(day.meteo?.icon ?? "");
  const hotelList = getHotelList(city);
  const hotelResult = selectSafeHotel(
    hotelList,
    weatherProfile,
    hotelIdx,
    preferredHotelName ?? null,
  );
  const hotelRaw = hotelResult.entry;
  const stars = (hotelRaw.stars || "4").replace(/[^0-9]/g, "") || "4";
  const hotelCost = hotelPriceForCity(city, stars);
  const cafeList = getCafeList(city);
  const cafeResult = selectSafeCafe(
    cafeList,
    weatherProfile,
    cafeIdx,
    preferredCafeName ?? null,
  );
  const cafeEntry = cafeResult.entry;
  const cafeCost = cafeEntry ? cafePriceFromJson(cafeEntry) : 0;
  const actList = getActivityList(city);
  const actResult = selectSafeActivity(actList, weatherProfile, actIdx);
  const actEntry = actResult.entry;
  const actCost = activityPriceFromJson(actEntry);
  const actName = actEntry
    ? String(actEntry.Activité ?? actEntry.nom ?? "Exploration")
    : "Exploration de la ville";
  const transList = getTransportList(city);
  const transEntry = transList.length
    ? transList[transportIdx % transList.length]
    : { label: "Taxi", prixStr: "8–15 TND", prixNum: 8 };
  const dailyTotal = hotelCost + cafeCost + actCost + transEntry.prixNum;
  const safetyAlerts = generateSafetyAlerts(day.meteo || null, city);
  return {
    ...day,
    hotel: {
      name: hotelRaw.name || hotelRaw.Nom || "Hôtel Premium",
      stars,
      description: hotelRaw.description || hotelRaw.Description || "",
      rating: "⭐".repeat(Math.min(parseInt(stars, 10), 5)),
    },
    cafe: {
      name: cafeEntry ? cafeEntry.Nom || cafeEntry.name || "" : "",
      zone: cafeEntry ? cafeEntry.Zone || cafeEntry.zone || "" : "",
      prix: cafeEntry ? cafeEntry.Prix || cafeEntry.prix || "" : "",
    },
    activity: actName,
    activityEntry: actEntry,
    transport: { label: transEntry.label, prixStr: transEntry.prixStr },
    weatherAlerts: {
      hotel: hotelResult.weatherAlert,
      cafe: cafeResult.weatherAlert,
      activity: actResult.weatherAlert,
    },
    safetyAlerts,
    placeSafety: {
      hotel: hotelResult.safetyReport,
      cafe: cafeResult.safetyReport,
      activity: actResult.safetyReport,
    },
    cost: {
      hotel: hotelCost,
      cafe: cafeCost,
      activity: actCost,
      transport: transEntry.prixNum,
      dailyTotal,
    },
  };
}

function buildLocalDay(
  city: string,
  dayIndex: number,
  weather: WeatherInfo | null,
  _maxBudget?: number,
  preferredHotelName?: string | null,
  preferredCafeName?: string | null,
): PremiumDayPlan {
  const tips = getCityTips(city);
  const base: PremiumDayPlan = {
    id: generateDayId(dayIndex),
    title: `Jour ${dayIndex + 1}`,
    ville: city,
    dayIndex,
    swap: { hotelIdx: 0, cafeIdx: dayIndex, actIdx: dayIndex, transportIdx: 0 },
    hotel: { name: "", stars: "4", description: "", rating: "" },
    cafe: { name: "", zone: "", prix: "" },
    activity: "",
    transport: { label: "", prixStr: "" },
    meteo: weather,
    conseil: typeof tips?.transport === "string" ? tips.transport : "",
    aiGenerated: false,
    cost: { hotel: 0, cafe: 0, activity: 0, transport: 0, dailyTotal: 0 },
  };
  return recomputeDay(base, undefined, preferredHotelName, preferredCafeName);
}

function ragToPremium(
  ragDay: RagDayPlan,
  dayIndex: number,
  weather: WeatherInfo | null,
  _maxBudget?: number,
  preferredHotelName?: string | null,
  preferredCafeName?: string | null,
): PremiumDayPlan {
  const city = ragDay.ville || "Tunis";
  const hotelList = getHotelList(city);
  let hotelIdx = hotelList.findIndex((h: any) =>
    (h.name || h.Nom || "")
      .toLowerCase()
      .includes((ragDay.hotel.name || "").toLowerCase().slice(0, 6)),
  );
  if (hotelIdx < 0) hotelIdx = 0;
  const cafeList = getCafeList(city);
  let cafeIdx = ragDay.cafe
    ? cafeList.findIndex((c: any) =>
        (c.Nom || "")
          .toLowerCase()
          .includes((ragDay.cafe!.name || "").toLowerCase().slice(0, 5)),
      )
    : -1;
  if (cafeIdx < 0) cafeIdx = dayIndex % Math.max(cafeList.length, 1);
  const actList = getActivityList(city);
  let actIdx = actList.findIndex((a: any) =>
    (a.Activité || a.nom || "")
      .toLowerCase()
      .includes((ragDay.activity || "").toLowerCase().slice(0, 5)),
  );
  if (actIdx < 0) actIdx = dayIndex % Math.max(actList.length, 1);
  const base: PremiumDayPlan = {
    id: generateDayId(dayIndex),
    title: ragDay.title || `Jour ${dayIndex + 1}`,
    ville: city,
    dayIndex,
    swap: { hotelIdx, cafeIdx, actIdx, transportIdx: 0 },
    hotel: {
      name: ragDay.hotel.name,
      stars: "4",
      description: ragDay.hotel.description || "",
      rating: "⭐⭐⭐⭐",
    },
    cafe: {
      name: ragDay.cafe?.name || "",
      zone: ragDay.cafe?.zone || "",
      prix: ragDay.cafe?.prix || "",
    },
    activity: ragDay.activity || "",
    localActivity: ragDay.localActivity,
    transport: { label: "", prixStr: "" },
    meteo: weather,
    conseil: typeof ragDay.conseil === "string" ? ragDay.conseil : "",
    aiGenerated: true,
    cost: { hotel: 0, cafe: 0, activity: 0, transport: 0, dailyTotal: 0 },
  };
  return recomputeDay(base, undefined, preferredHotelName, preferredCafeName);
}

function openMapForPlace(name: string, zone?: string) {
  const query = encodeURIComponent(
    zone ? `${name} ${zone} Tunisie` : `${name} Tunisie`,
  );
  const url =
    Platform.select({
      ios: `maps:0,0?q=${query}`,
      android: `geo:0,0?q=${query}`,
    }) || `https://www.google.com/maps/search/?api=1&query=${query}`;
  Linking.openURL(url).catch(() =>
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`),
  );
}

// ═══════════════════════════════════════════════════════════════
// SOUS-COMPOSANTS
// ═══════════════════════════════════════════════════════════════

function FloatingInput({
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  icon,
  maxLength,
  hint,
}: any) {
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <View style={[iSt.wrapper, focused && iSt.focused]}>
        {icon ? <Text style={iSt.icon}>{icon}</Text> : null}
        <TextInput
          style={iSt.input}
          placeholder={placeholder}
          placeholderTextColor={TEXT_MUTED}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoCapitalize={secureTextEntry ? "none" : "words"}
        />
      </View>
      {hint ? <Text style={iSt.hint}>{hint}</Text> : null}
    </View>
  );
}
const iSt = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
    marginBottom: 6,
    paddingHorizontal: 12,
  },
  focused: { borderColor: BLUE_PRIMARY, backgroundColor: "#E8F0FE" },
  icon: { fontSize: 16, marginRight: 8, color: BLUE_PRIMARY },
  input: { flex: 1, paddingVertical: 13, fontSize: 15, color: BLUE_DEEP },
  hint: { fontSize: 11, marginBottom: 8, marginLeft: 4 },
});

function PlaceSafetyBadge({
  report,
  compact = false,
}: {
  report: PlaceSafetyReport | null;
  compact?: boolean;
}) {
  if (!report) return null;
  const colors = {
    safe: { bg: GREEN_PALE, border: "#6EE7B7", text: GREEN },
    warning: { bg: ORANGE_PALE, border: "#FED7AA", text: ORANGE },
    excluded: { bg: "#FEE2E2", border: "#FCA5A5", text: RED },
  };
  const c = colors[report.level];
  return (
    <View
      style={[psbSt.badge, { backgroundColor: c.bg, borderColor: c.border }]}
    >
      <Text style={[psbSt.text, { color: c.text }]}>
        {report.badge}
        {!compact && ` · ${report.score}/100`}
      </Text>
    </View>
  );
}
const psbSt = StyleSheet.create({
  badge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  text: { fontSize: 11, fontWeight: "700" },
});

function PlaceSafetyDetail({
  report,
  placeName,
}: {
  report: PlaceSafetyReport | null;
  placeName: string;
}) {
  const [open, setOpen] = useState(false);
  if (!report) return null;
  const colors = {
    safe: { bg: GREEN_PALE, border: "#6EE7B7", text: GREEN },
    warning: { bg: ORANGE_PALE, border: "#FED7AA", text: ORANGE },
    excluded: { bg: "#FEE2E2", border: "#FCA5A5", text: RED },
  };
  const c = colors[report.level];
  return (
    <TouchableOpacity
      style={[
        psdSt.container,
        { backgroundColor: c.bg, borderColor: c.border },
      ]}
      onPress={() => setOpen(!open)}
      activeOpacity={0.8}
    >
      <View style={psdSt.row}>
        <Text style={[psdSt.badge, { color: c.text }]}>
          {report.badge} · {report.score}/100
        </Text>
        <Text style={[psdSt.chevron, { color: c.text }]}>
          {open ? "▲" : "▼"}
        </Text>
      </View>
      {open && (
        <View style={psdSt.reasons}>
          {report.reasons.map((r, i) => (
            <Text key={i} style={[psdSt.reason, { color: c.text }]}>
              • {r}
            </Text>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}
const psdSt = StyleSheet.create({
  container: { borderRadius: 10, borderWidth: 1, padding: 8, marginTop: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badge: { fontSize: 11, fontWeight: "700" },
  chevron: { fontSize: 10 },
  reasons: { marginTop: 6, gap: 2 },
  reason: { fontSize: 11, lineHeight: 16 },
});

function PlanSafetyReport({ itinerary }: { itinerary: PremiumDayPlan[] }) {
  const [open, setOpen] = useState(false);
  const allReports: {
    name: string;
    type: string;
    report: PlaceSafetyReport;
  }[] = [];
  for (const day of itinerary) {
    if (day.placeSafety?.hotel)
      allReports.push({
        name: day.hotel.name,
        type: "Hôtel",
        report: day.placeSafety.hotel,
      });
    if (day.placeSafety?.cafe && day.cafe.name)
      allReports.push({
        name: day.cafe.name,
        type: "Café",
        report: day.placeSafety.cafe,
      });
    if (day.placeSafety?.activity)
      allReports.push({
        name: day.activity,
        type: "Activité",
        report: day.placeSafety.activity,
      });
  }
  const safe = allReports.filter((r) => r.report.level === "safe").length;
  const warning = allReports.filter((r) => r.report.level === "warning").length;
  const excluded = allReports.filter(
    (r) => r.report.level === "excluded",
  ).length;
  const avgScore = allReports.length
    ? Math.round(
        allReports.reduce((s, r) => s + r.report.score, 0) / allReports.length,
      )
    : 0;
  const summaryColor = excluded > 0 ? RED : warning > 0 ? ORANGE : GREEN;
  const summaryBg =
    excluded > 0 ? "#FEE2E2" : warning > 0 ? ORANGE_PALE : GREEN_PALE;
  const summaryBorder =
    excluded > 0 ? "#FCA5A5" : warning > 0 ? "#FED7AA" : "#6EE7B7";
  return (
    <View
      style={[
        psrSt.container,
        { backgroundColor: summaryBg, borderColor: summaryBorder },
      ]}
    >
      <TouchableOpacity
        style={psrSt.header}
        onPress={() => setOpen(!open)}
        activeOpacity={0.8}
      >
        <Text style={psrSt.title}>🛡️ Rapport de sécurité des lieux</Text>
        <View style={psrSt.statsRow}>
          <Text style={[psrSt.stat, { color: GREEN }]}>✓ {safe} sûrs</Text>
          {warning > 0 && (
            <Text style={[psrSt.stat, { color: ORANGE }]}>
              ⚠ {warning} à vérifier
            </Text>
          )}
          {excluded > 0 && (
            <Text style={[psrSt.stat, { color: RED }]}>
              ✕ {excluded} exclus
            </Text>
          )}
          <Text style={[psrSt.stat, { color: summaryColor }]}>
            Moy. {avgScore}/100
          </Text>
          <Text style={[psrSt.chevron, { color: summaryColor }]}>
            {open ? "▲" : "▼"}
          </Text>
        </View>
      </TouchableOpacity>
      {open && (
        <View style={psrSt.list}>
          {allReports.map((r, i) => {
            const lc = {
              safe: GREEN_PALE,
              warning: ORANGE_PALE,
              excluded: "#FEE2E2",
            }[r.report.level];
            const tc = { safe: GREEN, warning: ORANGE, excluded: RED }[
              r.report.level
            ];
            return (
              <View key={i} style={psrSt.item}>
                <View style={{ flex: 1 }}>
                  <Text style={psrSt.itemName} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text style={psrSt.itemType}>{r.type}</Text>
                </View>
                <View style={[psrSt.itemBadge, { backgroundColor: lc }]}>
                  <Text style={[psrSt.itemBadgeTxt, { color: tc }]}>
                    {r.report.badge} · {r.report.score}/100
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
const psrSt = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 10,
    overflow: "hidden",
  },
  header: { padding: 12, gap: 6 },
  title: { fontSize: 13, fontWeight: "800", color: BLUE_DEEP },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  stat: { fontSize: 12, fontWeight: "700" },
  chevron: { fontSize: 10, marginLeft: "auto" },
  list: { paddingHorizontal: 12, paddingBottom: 10, gap: 6 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.07)",
  },
  itemName: { fontSize: 12, fontWeight: "700", color: BLUE_DEEP },
  itemType: { fontSize: 10, color: TEXT_MUTED },
  itemBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  itemBadgeTxt: { fontSize: 11, fontWeight: "700" },
});

function WeatherWidget({ weather }: { weather: WeatherInfo | null }) {
  if (!weather) return null;
  return (
    <View style={wSt.box}>
      <Text style={wSt.emoji}>{weatherEmoji(weather.icon)}</Text>
      <View style={{ flex: 1 }}>
        <Text style={wSt.temp}>
          {weather.temp}°C · {weather.desc}
        </Text>
        <Text style={wSt.sub}>
          Ressenti {weather.feels}°C · Vent {weather.wind} km/h · Hum.{" "}
          {weather.humidity}%
        </Text>
      </View>
    </View>
  );
}
const wSt = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    marginTop: 8,
  },
  emoji: { fontSize: 24 },
  temp: { fontSize: 13, fontWeight: "700", color: BLUE_DEEP },
  sub: { fontSize: 11, color: TEXT_MUTED, marginTop: 2 },
});

function SafetyAlertsPanel({
  alerts,
  city,
}: {
  alerts: SafetyAlert[];
  city: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!alerts.length)
    return (
      <View style={saSt.safe}>
        <Text style={saSt.safeIcon}>✅</Text>
        <Text style={saSt.safeTxt}>Conditions météo favorables à {city}</Text>
      </View>
    );
  const maxLevel = alerts.some((a) => a.level === "danger")
    ? "danger"
    : alerts.some((a) => a.level === "warning")
      ? "warning"
      : "info";
  const lc = {
    danger: { bg: "#FEF2F2", border: "#FCA5A5", text: "#991B1B", icon: "🚨" },
    warning: { bg: "#FFFBEB", border: "#FCD34D", text: "#92400E", icon: "⚠️" },
    info: { bg: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF", icon: "ℹ️" },
  }[maxLevel];
  return (
    <View
      style={[
        saSt.container,
        { backgroundColor: lc.bg, borderColor: lc.border },
      ]}
    >
      <TouchableOpacity
        style={saSt.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.8}
      >
        <Text style={{ fontSize: 16 }}>{lc.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[saSt.headerTitle, { color: lc.text }]}>
            Sécurité météo — {city}
          </Text>
          <Text style={[saSt.headerSub, { color: lc.text }]}>
            {alerts.length} alerte{alerts.length > 1 ? "s" : ""} ·{" "}
            {expanded ? "Masquer" : "Voir les détails"}
          </Text>
        </View>
        <Text style={{ fontSize: 10, color: lc.text }}>
          {expanded ? "▲" : "▼"}
        </Text>
      </TouchableOpacity>
      {expanded &&
        alerts.map((alert, idx) => (
          <View
            key={idx}
            style={[saSt.alertCard, { borderLeftColor: lc.border }]}
          >
            <View style={saSt.alertHeader}>
              <Text style={{ fontSize: 14 }}>{alert.icon}</Text>
              <Text style={[saSt.alertTitle, { color: lc.text }]}>
                {alert.title}
              </Text>
            </View>
            <Text style={[saSt.alertMsg, { color: lc.text }]}>
              {alert.message}
            </Text>
            {alert.recommendations.map((rec, ri) => (
              <View key={ri} style={saSt.recRow}>
                <Text style={{ fontSize: 10, color: lc.text }}>→</Text>
                <Text style={[saSt.recTxt, { color: lc.text }]}>{rec}</Text>
              </View>
            ))}
          </View>
        ))}
    </View>
  );
}
const saSt = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 10,
    overflow: "hidden",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  headerTitle: { fontSize: 13, fontWeight: "800" },
  headerSub: { fontSize: 11, marginTop: 2 },
  alertCard: {
    marginHorizontal: 12,
    marginBottom: 10,
    paddingLeft: 10,
    borderLeftWidth: 3,
    gap: 4,
  },
  alertHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  alertTitle: { fontSize: 12, fontWeight: "700" },
  alertMsg: { fontSize: 12, lineHeight: 17 },
  recRow: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  recTxt: { fontSize: 11, lineHeight: 16, flex: 1 },
  safe: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F0FFF4",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#6EE7B7",
    marginBottom: 8,
  },
  safeIcon: { fontSize: 16 },
  safeTxt: { fontSize: 12, color: GREEN, fontWeight: "600" },
});

function DailyCostCard({
  cost,
  dayTitle,
}: {
  cost: DailyCost;
  dayTitle: string;
}) {
  const items = [
    { icon: "🏨", label: "Hôtel", value: cost.hotel },
    { icon: "☕", label: "Café", value: cost.cafe },
    { icon: "🎯", label: "Activité", value: cost.activity },
    { icon: "🚘", label: "Transport", value: cost.transport },
  ];
  return (
    <View style={dcSt.card}>
      <View style={dcSt.header}>
        <Text style={dcSt.headerTxt}>💰 Détail des coûts — {dayTitle}</Text>
      </View>
      <View style={dcSt.grid}>
        {items.map((item) => (
          <View key={item.label} style={dcSt.cell}>
            <Text style={dcSt.cellIcon}>{item.icon}</Text>
            <Text style={dcSt.cellLabel}>{item.label}</Text>
            <Text style={dcSt.cellValue}>{item.value} TND</Text>
          </View>
        ))}
      </View>
      <View style={dcSt.totalRow}>
        <Text style={dcSt.totalLabel}>Total du jour</Text>
        <Text style={dcSt.totalValue}>{cost.dailyTotal} TND</Text>
      </View>
    </View>
  );
}
const dcSt = StyleSheet.create({
  card: {
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BLUE_PALE,
    marginTop: 10,
  },
  header: {
    backgroundColor: BLUE_PRIMARY,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerTxt: { fontSize: 12, fontWeight: "700", color: WHITE },
  grid: { flexDirection: "row", flexWrap: "wrap", padding: 8, gap: 8 },
  cell: {
    flex: 1,
    minWidth: "40%",
    backgroundColor: WHITE,
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BLUE_PALE,
  },
  cellIcon: { fontSize: 18, marginBottom: 4 },
  cellLabel: { fontSize: 10, color: TEXT_MUTED, fontWeight: "600" },
  cellValue: { fontSize: 14, fontWeight: "800", color: BLUE_PRIMARY },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: BLUE_PRIMARY,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  totalLabel: { fontSize: 13, fontWeight: "700", color: WHITE },
  totalValue: { fontSize: 18, fontWeight: "900", color: GOLD },
});

function TotalSummaryCard({
  itinerary,
  numDays,
}: {
  itinerary: PremiumDayPlan[];
  numDays: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalHotels = itinerary.reduce((s, d) => s + d.cost.hotel, 0);
  const totalCafes = itinerary.reduce((s, d) => s + d.cost.cafe, 0);
  const totalActivites = itinerary.reduce((s, d) => s + d.cost.activity, 0);
  const totalTransport = itinerary.reduce((s, d) => s + d.cost.transport, 0);
  const grandTotal = itinerary.reduce((s, d) => s + d.cost.dailyTotal, 0);
  const realDays = Math.max(itinerary.length, 1);
  const avgPerDay = Math.round(grandTotal / realDays);
  return (
    <View style={tsSt.container}>
      <LinearGradient
        colors={[GOLD, "#E8B84B"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={tsSt.grad}
      >
        <TouchableOpacity
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.85}
        >
          <Text style={tsSt.label}>TOTAL DU SÉJOUR</Text>
          <Text style={tsSt.grand}>{grandTotal} TND</Text>
          <View style={tsSt.subRow}>
            <Text style={tsSt.sub}>≈ {(grandTotal * 0.29).toFixed(0)} EUR</Text>
            <Text style={tsSt.sub}>
              {" "}
              · {itinerary.length} jour{itinerary.length > 1 ? "s" : ""}
            </Text>
            <Text style={tsSt.sub}> · Moy. {avgPerDay} TND/j</Text>
          </View>
          <Text style={tsSt.toggle}>
            {expanded ? "▲ Masquer le détail" : "▼ Voir le détail complet"}
          </Text>
        </TouchableOpacity>
        {expanded && (
          <View style={tsSt.detail}>
            {[
              {
                icon: "🏨",
                label: "Hôtels (total nuits)",
                total: totalHotels,
                pct:
                  grandTotal > 0
                    ? Math.round((totalHotels / grandTotal) * 100)
                    : 0,
              },
              {
                icon: "☕",
                label: "Cafés & pauses",
                total: totalCafes,
                pct:
                  grandTotal > 0
                    ? Math.round((totalCafes / grandTotal) * 100)
                    : 0,
              },
              {
                icon: "🎯",
                label: "Activités & loisirs",
                total: totalActivites,
                pct:
                  grandTotal > 0
                    ? Math.round((totalActivites / grandTotal) * 100)
                    : 0,
              },
              {
                icon: "🚘",
                label: "Transport",
                total: totalTransport,
                pct:
                  grandTotal > 0
                    ? Math.round((totalTransport / grandTotal) * 100)
                    : 0,
              },
            ].map((r) => (
              <View key={r.label} style={tsSt.detailRow}>
                <Text style={tsSt.detailIcon}>{r.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={tsSt.detailLabel}>{r.label}</Text>
                  <View style={tsSt.barBg}>
                    <View style={[tsSt.barFill, { width: `${r.pct}%` }]} />
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={tsSt.detailValue}>{r.total} TND</Text>
                  <Text style={tsSt.detailPct}>{r.pct}%</Text>
                </View>
              </View>
            ))}
            <View style={tsSt.perDayBox}>
              <Text style={tsSt.perDayLabel}>Coût moyen / jour</Text>
              <Text style={tsSt.perDayValue}>{avgPerDay} TND</Text>
            </View>
            <View style={tsSt.dayBreakdown}>
              <Text style={tsSt.dayBreakdownTitle}>Par jour</Text>
              {itinerary.map((d) => (
                <View key={d.id} style={tsSt.dayRow}>
                  <Text style={tsSt.dayRowLabel}>{d.title}</Text>
                  <Text style={tsSt.dayRowValue}>{d.cost.dailyTotal} TND</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}
const tsSt = StyleSheet.create({
  container: { borderRadius: 18, overflow: "hidden", marginTop: 4 },
  grad: { padding: 20, alignItems: "center", gap: 4 },
  label: {
    fontSize: 11,
    fontWeight: "800",
    color: "rgba(61,34,0,0.6)",
    letterSpacing: 2,
  },
  grand: { fontSize: 36, fontWeight: "900", color: "#3D2200" },
  subRow: { flexDirection: "row", alignItems: "center" },
  sub: { fontSize: 12, color: "rgba(61,34,0,0.55)" },
  toggle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#3D2200",
    marginTop: 8,
    textDecorationLine: "underline",
  },
  detail: {
    width: "100%",
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(61,34,0,0.15)",
    paddingTop: 12,
    gap: 10,
  },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailIcon: { fontSize: 14, width: 22 },
  detailLabel: { fontSize: 11, color: "rgba(61,34,0,0.65)", marginBottom: 4 },
  detailValue: { fontSize: 13, fontWeight: "700", color: "#3D2200" },
  detailPct: { fontSize: 10, color: "rgba(61,34,0,0.5)" },
  barBg: {
    height: 6,
    backgroundColor: "rgba(61,34,0,0.15)",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: { height: 6, backgroundColor: "#3D2200", borderRadius: 3 },
  perDayBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "rgba(61,34,0,0.1)",
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  perDayLabel: { fontSize: 12, color: "#3D2200", fontWeight: "600" },
  perDayValue: { fontSize: 14, fontWeight: "800", color: "#3D2200" },
  dayBreakdown: {
    borderTopWidth: 1,
    borderTopColor: "rgba(61,34,0,0.15)",
    paddingTop: 10,
    gap: 5,
  },
  dayBreakdownTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(61,34,0,0.55)",
    letterSpacing: 1,
    marginBottom: 4,
  },
  dayRow: { flexDirection: "row", justifyContent: "space-between" },
  dayRowLabel: { fontSize: 12, color: "rgba(61,34,0,0.65)" },
  dayRowValue: { fontSize: 12, fontWeight: "700", color: "#3D2200" },
});

function AiBadge({ model }: { model?: "gemini" | "fallback" }) {
  if (!model) return null;
  const isGemini = model === "gemini";
  return (
    <View style={[abSt.badge, isGemini ? abSt.gemini : abSt.fallback]}>
      <Text style={abSt.icon}>{isGemini ? "✨" : "🔄"}</Text>
      <Text style={[abSt.txt, { color: isGemini ? GEMINI_BLUE : "#92400E" }]}>
        {isGemini ? "Gemini AI" : "Données locales"}
      </Text>
    </View>
  );
}
const abSt = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  gemini: { backgroundColor: GEMINI_PALE, borderColor: "#93C5FD" },
  fallback: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
  icon: { fontSize: 11 },
  txt: { fontSize: 10, fontWeight: "800" },
});

function RagStepsPanel({
  steps,
  visible,
}: {
  steps: RagStep[];
  visible: boolean;
}) {
  if (!visible || !steps.length) return null;
  const icons: Record<string, string> = {
    RETRIEVE: "🔍",
    REASON: "🧠",
    PLAN: "📋",
    GENERATE: "✨",
  };
  return (
    <View style={rSt.box}>
      <Text style={rSt.title}>🤖 Pipeline Gemini RAG</Text>
      {steps.map((s, i) => (
        <View key={i} style={rSt.row}>
          <Text style={rSt.stepIcon}>{icons[s.stepName] || "●"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={rSt.action}>{s.action}</Text>
            <Text style={rSt.result}>{s.result}</Text>
            {s.durationMs !== undefined && (
              <Text style={rSt.ms}>{s.durationMs} ms</Text>
            )}
          </View>
          <View
            style={[
              rSt.conf,
              {
                backgroundColor: s.confidence > 0.8 ? GREEN_PALE : ORANGE_PALE,
                borderColor: s.confidence > 0.8 ? "#6EE7B7" : "#FED7AA",
              },
            ]}
          >
            <Text
              style={[
                rSt.confTxt,
                { color: s.confidence > 0.8 ? GREEN : ORANGE },
              ]}
            >
              {Math.round(s.confidence * 100)}%
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
const rSt = StyleSheet.create({
  box: {
    backgroundColor: GEMINI_PALE,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#93C5FD",
    marginBottom: 12,
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: GEMINI_BLUE,
    marginBottom: 2,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  stepIcon: { fontSize: 14, width: 20, textAlign: "center" },
  action: { fontSize: 12, fontWeight: "700", color: BLUE_DEEP },
  result: { fontSize: 11, color: TEXT_MUTED, marginTop: 1 },
  ms: { fontSize: 10, color: "#A0AEC0", marginTop: 1 },
  conf: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  confTxt: { fontSize: 10, fontWeight: "700" },
});

type RefaireOptions = {
  hotel: boolean;
  cafe: boolean;
  loisir: boolean;
  activite: boolean;
};
function RefaireModal({
  visible,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (options: RefaireOptions) => void;
}) {
  const [sel, setSel] = useState<RefaireOptions>({
    hotel: false,
    cafe: false,
    loisir: false,
    activite: false,
  });
  const allSel = sel.hotel && sel.cafe && sel.loisir && sel.activite;
  const toggle = (k: keyof RefaireOptions) =>
    setSel((p) => ({ ...p, [k]: !p[k] }));
  const toggleAll = () => {
    const n = !allSel;
    setSel({ hotel: n, cafe: n, loisir: n, activite: n });
  };
  const ITEMS = [
    {
      key: "hotel" as const,
      icon: "🏨",
      label: "Hôtel",
      sub: "Changer l'hébergement proposé",
    },
    {
      key: "cafe" as const,
      icon: "☕",
      label: "Café",
      sub: "Modifier les pauses café",
    },
    {
      key: "loisir" as const,
      icon: "🎮",
      label: "Loisir & divertissement",
      sub: "Remplacer les activités locales JSON",
    },
    {
      key: "activite" as const,
      icon: "🎯",
      label: "Activité principale",
      sub: "Régénérer via Gemini 2.5 Flash",
    },
  ];
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={rfSt.overlay}>
        <View style={rfSt.sheet}>
          <LinearGradient colors={["#042A66", "#0A4DBF"]} style={rfSt.header}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                flex: 1,
              }}
            >
              <View style={rfSt.headerIconBox}>
                <Text style={{ fontSize: 20, color: WHITE }}>↺</Text>
              </View>
              <View>
                <Text style={rfSt.headerTitle}>Refaire le plan</Text>
                <Text style={rfSt.headerSub}>
                  Choisissez les éléments à modifier
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={rfSt.closeBtn}>
              <Text style={rfSt.closeTxt}>✕</Text>
            </TouchableOpacity>
          </LinearGradient>
          <View style={rfSt.body}>
            <Text style={rfSt.sectionLabel}>ÉLÉMENTS À MODIFIER</Text>
            {ITEMS.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={rfSt.optionRow}
                onPress={() => toggle(item.key)}
                activeOpacity={0.7}
              >
                <View style={[rfSt.checkbox, sel[item.key] && rfSt.checkboxOn]}>
                  {sel[item.key] && <Text style={rfSt.checkmark}>✓</Text>}
                </View>
                <View style={rfSt.optionIconBox}>
                  <Text style={{ fontSize: 22 }}>{item.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={rfSt.optionLabel}>{item.label}</Text>
                  <Text style={rfSt.optionSub}>{item.sub}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={rfSt.selectAllRow}
              onPress={toggleAll}
              activeOpacity={0.7}
            >
              <View style={[rfSt.checkbox, allSel && rfSt.checkboxOn]}>
                {allSel && <Text style={rfSt.checkmark}>✓</Text>}
              </View>
              <Text style={rfSt.selectAllTxt}>Tout sélectionner</Text>
            </TouchableOpacity>
            <View style={rfSt.infoBox}>
              <Text style={{ fontSize: 16 }}>ℹ️</Text>
              <Text style={rfSt.infoTxt}>
                Sans sélection, le plan entier sera réinitialisé.
              </Text>
            </View>
            <View style={rfSt.btns}>
              <TouchableOpacity
                style={rfSt.cancelBtn}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={rfSt.cancelTxt}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={0.85}
                onPress={() => {
                  onConfirm(sel);
                  setSel({
                    hotel: false,
                    cafe: false,
                    loisir: false,
                    activite: false,
                  });
                }}
              >
                <LinearGradient
                  colors={["#0A4DBF", "#1a6aff"]}
                  style={rfSt.confirmBtn}
                >
                  <Text style={rfSt.confirmTxt}>↺ Réinitialiser le plan</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
const rfSt = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 12,
  },
  headerIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: WHITE },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeTxt: { color: WHITE, fontSize: 14, fontWeight: "700" },
  body: { padding: 20, gap: 0 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: TEXT_MUTED,
    letterSpacing: 2,
    marginBottom: 12,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F5FC",
  },
  optionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: BLUE_ULTRA_PALE,
    justifyContent: "center",
    alignItems: "center",
  },
  optionLabel: { fontSize: 15, fontWeight: "700", color: BLUE_DEEP },
  optionSub: { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: BLUE_PALE,
    backgroundColor: WHITE,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxOn: { backgroundColor: BLUE_PRIMARY, borderColor: BLUE_PRIMARY },
  checkmark: { fontSize: 12, color: WHITE, fontWeight: "800" },
  selectAllRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
  },
  selectAllTxt: { fontSize: 14, fontWeight: "700", color: BLUE_PRIMARY },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
    marginTop: 4,
    marginBottom: 16,
  },
  infoTxt: { flex: 1, fontSize: 13, color: "#92400E", lineHeight: 18 },
  btns: { flexDirection: "row", gap: 12 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#FFF0F0",
    borderWidth: 1.5,
    borderColor: "#FFCCCC",
  },
  cancelTxt: { color: "#E05555", fontWeight: "700", fontSize: 14 },
  confirmBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  confirmTxt: { color: WHITE, fontWeight: "800", fontSize: 14 },
});

function SwapRow({
  icon,
  label,
  value,
  subValue,
  cost,
  prixBadge,
  onSwap,
  swapHint,
  onMap,
  safetyReport,
}: {
  icon: string;
  label: string;
  value: string;
  subValue?: string;
  cost: number;
  prixBadge?: string;
  onSwap: () => void;
  swapHint: string;
  onMap?: () => void;
  safetyReport?: PlaceSafetyReport | null;
}) {
  return (
    <View style={swSt.container}>
      <View style={swSt.row}>
        <Text style={swSt.icon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={swSt.label}>{label}</Text>
          <Text style={swSt.value}>{value}</Text>
          {subValue ? <Text style={swSt.sub}>{subValue}</Text> : null}
          {prixBadge ? <Text style={swSt.prixBadge}>{prixBadge}</Text> : null}
          {safetyReport && <PlaceSafetyBadge report={safetyReport} compact />}
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <View style={swSt.costBadge}>
            <Text style={swSt.costTxt}>{cost} TND</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {onMap && (
              <TouchableOpacity onPress={onMap} style={swSt.mapBtn}>
                <Text style={swSt.mapLabel}>📍</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onSwap} style={swSt.swapBtn}>
              <Text style={swSt.swapIcon}>⇅</Text>
              <Text style={swSt.swapLabel}>Changer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <Text style={swSt.hint}>{swapHint}</Text>
    </View>
  );
}
const swSt = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    borderBottomColor: BLUE_ULTRA_PALE,
    paddingVertical: 10,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  icon: { fontSize: 18, width: 24, textAlign: "center", marginTop: 2 },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: TEXT_MUTED,
    letterSpacing: 0.5,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  value: { fontSize: 14, fontWeight: "700", color: BLUE_DEEP },
  sub: { fontSize: 11, color: TEXT_MUTED, marginTop: 2, lineHeight: 16 },
  prixBadge: { fontSize: 11, color: GREEN, fontWeight: "600", marginTop: 2 },
  costBadge: {
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: BLUE_PALE,
  },
  costTxt: { fontSize: 13, fontWeight: "800", color: BLUE_PRIMARY },
  swapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FFF7E6",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  swapIcon: { fontSize: 13, color: GOLD, fontWeight: "800" },
  swapLabel: { fontSize: 10, color: "#92400E", fontWeight: "700" },
  mapBtn: {
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: BLUE_PALE,
  },
  mapLabel: { fontSize: 13 },
  hint: {
    fontSize: 10,
    color: "#B0C4DE",
    marginTop: 3,
    marginLeft: 34,
    fontStyle: "italic",
  },
});

function AppMenuDark({ inviteCode }: { inviteCode: string | null }) {
  const [open, setOpen] = useState(false);
  const [promptVisible, setPromptVisible] = useState(false);
  const [promptCode, setPromptCode] = useState("");
  const handleJoinGroup = () => {
    const code = promptCode.trim().toUpperCase();
    if (!code) {
      Alert.alert("Erreur", "Le code est requis.");
      return;
    }
    setPromptVisible(false);
    setPromptCode("");
    router.push({ pathname: "/group-chat", params: { inviteCode: code } });
  };
  const items = [
    {
      icon: "robot-outline" as const,
      label: "Assistant IA",
      sub: "Posez vos questions voyage",
      color: BLUE_PRIMARY,
      onPress: () => {
        setOpen(false);
        router.push("/chatbot");
      },
    },
    {
      icon: "message-group-outline" as const,
      label: "Groupe voyage",
      sub: inviteCode ? `Code : ${inviteCode}` : "Communiquer avec le groupe",
      color: "#3B72E8",
      onPress: () => {
        setOpen(false);
        if (inviteCode)
          router.push({ pathname: "/group-chat", params: { inviteCode } });
        else setPromptVisible(true);
      },
    },
    {
      icon: "map-marker-path" as const,
      label: "Mes anciens plans",
      sub: "Consulter vos voyages passés",
      color: "#00D4AA",
      onPress: () => {
        setOpen(false);
        router.push("/ancienplan");
      },
    },
    {
      icon: "lock-reset" as const,
      label: "Modifier le mot de passe",
      sub: "Changer vos identifiants",
      color: "#F59E0B",
      onPress: () => {
        setOpen(false);
        router.push("/reset-password");
      },
    },
    {
      icon: "logout" as const,
      label: "Se déconnecter",
      sub: "Quitter l'application",
      color: "#EF4444",
      danger: true,
      onPress: () => {
        setOpen(false);
        Alert.alert("Déconnexion", "Êtes-vous sûr ?", [
          { text: "Annuler", style: "cancel" },
          {
            text: "Oui",
            style: "destructive",
            onPress: () => router.replace("/"),
          },
        ]);
      },
    },
  ];
  return (
    <View style={menuSt.wrapper}>
      <TouchableOpacity onPress={() => setOpen(true)} style={menuSt.trigger}>
        <MaterialCommunityIcons name="dots-vertical" size={28} color={WHITE} />
      </TouchableOpacity>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={menuSt.backdrop}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View style={menuSt.dropdown}>
            <View style={menuSt.header}>
              <MaterialCommunityIcons
                name="cog-outline"
                size={14}
                color={TEXT_MUTED}
              />
              <Text style={menuSt.headerTxt}>OPTIONS</Text>
            </View>
            {items.map((item, idx) => (
              <React.Fragment key={item.label}>
                {idx === items.length - 1 && <View style={menuSt.divider} />}
                <TouchableOpacity
                  style={menuSt.item}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      menuSt.iconBox,
                      { backgroundColor: `${item.color}22` },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={item.icon as any}
                      size={20}
                      color={item.color}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        menuSt.label,
                        (item as any).danger && { color: "#EF4444" },
                      ]}
                    >
                      {item.label}
                    </Text>
                    <Text style={menuSt.sub}>{item.sub}</Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={16}
                    color={TEXT_MUTED}
                  />
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
      <Modal
        visible={promptVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => {
          setPromptVisible(false);
          setPromptCode("");
        }}
      >
        <TouchableOpacity
          style={promptSt.overlay}
          activeOpacity={1}
          onPress={() => {
            setPromptVisible(false);
            setPromptCode("");
          }}
        >
          <TouchableOpacity activeOpacity={1} style={promptSt.card}>
            <View style={promptSt.iconWrap}>
              <MaterialCommunityIcons
                name={"arrow-right" as any}
                size={28}
                color="#1E88E5"
              />
            </View>
            <Text style={promptSt.title}>Rejoindre un groupe</Text>
            <Text style={promptSt.subtitle}>
              Saisissez le code d'invitation
            </Text>
            <View style={promptSt.inputWrap}>
              <MaterialCommunityIcons
                name="pound"
                size={18}
                color="#1E88E5"
                style={{ marginRight: 8 }}
              />
              <TextInput
                style={promptSt.input}
                placeholder="Ex : ABCD12"
                placeholderTextColor={TEXT_MUTED}
                value={promptCode}
                onChangeText={setPromptCode}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={10}
              />
            </View>
            <View style={promptSt.btnRow}>
              <TouchableOpacity
                style={promptSt.btnCancel}
                onPress={() => {
                  setPromptVisible(false);
                  setPromptCode("");
                }}
              >
                <Text style={promptSt.btnCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={promptSt.btnConfirm}
                onPress={handleJoinGroup}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={["#1E88E5", BLUE_PRIMARY]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={promptSt.btnGrad}
                >
                  <Text style={promptSt.btnConfirmText}>Rejoindre</Text>
                  <MaterialCommunityIcons
                    name="arrow-right"
                    size={16}
                    color={WHITE}
                  />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
const menuSt = StyleSheet.create({
  wrapper: { position: "relative" },
  trigger: {
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: Platform.OS === "ios" ? 100 : 80,
    paddingRight: 16,
  },
  dropdown: {
    backgroundColor: "#0C1829",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1A2B45",
    minWidth: 260,
    paddingVertical: 8,
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1A2B45",
    marginBottom: 4,
  },
  headerTxt: {
    color: "#4A6080",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  label: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  sub: { fontSize: 11, color: "#4A6080", marginTop: 2 },
  divider: {
    height: 1,
    backgroundColor: "#1A2B45",
    marginVertical: 4,
    marginHorizontal: 16,
  },
});
const promptSt = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
  },
  card: {
    backgroundColor: "#061525",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#0E2A45",
    padding: 24,
    elevation: 16,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(59,114,232,0.12)",
    borderWidth: 1,
    borderColor: "rgba(59,114,232,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: { color: "#E8F0FF", fontSize: 20, fontWeight: "800", marginBottom: 6 },
  subtitle: {
    color: "#4A7AAA",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 22,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#020B18",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(10,77,191,0.5)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 4,
  },
  btnRow: { flexDirection: "row", gap: 12 },
  btnCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#0E2A45",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  btnCancelText: { color: "#4A7AAA", fontWeight: "600", fontSize: 15 },
  btnConfirm: { flex: 1.5, borderRadius: 14, overflow: "hidden" },
  btnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
  },
  btnConfirmText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
});

// ═══════════════════════════════════════════════════════════════
// DELETE CONFIRMATION MODAL
// ═══════════════════════════════════════════════════════════════
function DeleteDayModal({
  visible,
  day,
  costSaved,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  day: PremiumDayPlan | null;
  costSaved: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!day) return null;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={delSt.overlay}>
        <View style={delSt.card}>
          <View style={delSt.iconCircle}>
            <Text style={{ fontSize: 28 }}>🗑️</Text>
          </View>
          <Text style={delSt.title}>Supprimer ce jour ?</Text>
          <Text style={delSt.subtitle}>
            {day.title} — {day.ville}
          </Text>

          <View style={delSt.costBox}>
            <Text style={delSt.costLabel}>Économie réalisée</Text>
            <Text style={delSt.costValue}>− {costSaved} TND</Text>
            <Text style={delSt.costSub}>
              Ce montant sera retiré du budget total
            </Text>
          </View>

          <View style={delSt.breakdown}>
            {[
              { icon: "🏨", label: "Hôtel", val: day.cost.hotel },
              { icon: "☕", label: "Café", val: day.cost.cafe },
              { icon: "🎯", label: "Activité", val: day.cost.activity },
              { icon: "🚘", label: "Transport", val: day.cost.transport },
            ].map((r) => (
              <View key={r.label} style={delSt.breakRow}>
                <Text style={delSt.breakIcon}>{r.icon}</Text>
                <Text style={delSt.breakLabel}>{r.label}</Text>
                <Text style={delSt.breakVal}>− {r.val} TND</Text>
              </View>
            ))}
          </View>

          <Text style={delSt.warning}>⚠️ Cette action est irréversible.</Text>

          <View style={delSt.btns}>
            <TouchableOpacity
              style={delSt.btnCancel}
              onPress={onCancel}
              activeOpacity={0.8}
            >
              <Text style={delSt.btnCancelTxt}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={delSt.btnConfirm}
              onPress={onConfirm}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={["#DC2626", "#EF4444"]}
                style={delSt.btnGrad}
              >
                <Text style={delSt.btnConfirmTxt}>🗑 Supprimer</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
const delSt = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(2,27,78,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    backgroundColor: WHITE,
    borderRadius: 24,
    padding: 24,
    width: "100%",
    alignItems: "center",
    elevation: 20,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  title: { fontSize: 20, fontWeight: "800", color: BLUE_DEEP, marginBottom: 4 },
  subtitle: { fontSize: 13, color: TEXT_MUTED, marginBottom: 16 },
  costBox: {
    backgroundColor: "#FEF2F2",
    borderRadius: 14,
    padding: 14,
    width: "100%",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#FCA5A5",
    marginBottom: 12,
  },
  costLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#991B1B",
    letterSpacing: 1,
    marginBottom: 4,
  },
  costValue: { fontSize: 28, fontWeight: "900", color: RED },
  costSub: {
    fontSize: 11,
    color: "#991B1B",
    marginTop: 4,
    textAlign: "center",
  },
  breakdown: {
    width: "100%",
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    gap: 6,
  },
  breakRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  breakIcon: { fontSize: 14, width: 22, textAlign: "center" },
  breakLabel: { flex: 1, fontSize: 12, color: BLUE_DEEP, fontWeight: "600" },
  breakVal: { fontSize: 12, fontWeight: "700", color: RED },
  warning: {
    fontSize: 12,
    color: "#92400E",
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 18,
    textAlign: "center",
  },
  btns: { flexDirection: "row", gap: 12, width: "100%" },
  btnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#F0F5FC",
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
  },
  btnCancelTxt: { color: BLUE_PRIMARY, fontWeight: "700", fontSize: 14 },
  btnConfirm: { flex: 1, borderRadius: 12, overflow: "hidden" },
  btnGrad: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnConfirmTxt: { color: WHITE, fontWeight: "800", fontSize: 14 },
});

const laSt = StyleSheet.create({
  card: {
    backgroundColor: "#F5F3FF",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#7C3AED",
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6D28D9",
    letterSpacing: 0.3,
  },
  name: { fontSize: 14, fontWeight: "700", color: "#4C1D95", lineHeight: 20 },
  desc: { fontSize: 12, color: "#6D28D9", lineHeight: 17, marginTop: 3 },
  prixRow: {
    backgroundColor: "#EDE9FE",
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#C4B5FD",
    alignSelf: "flex-start",
    marginTop: 6,
  },
  prixTxt: { fontSize: 12, fontWeight: "700", color: "#5B21B6" },
});
const consSt = StyleSheet.create({
  box: {
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#F59E0B",
  },
  txt: { fontSize: 12, color: "#92400E", lineHeight: 18, fontStyle: "italic" },
});
const hotelSt = StyleSheet.create({
  card: {
    backgroundColor: WHITE,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
    overflow: "hidden",
    elevation: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: BLUE_ULTRA_PALE,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BLUE_PALE,
  },
  headerIcon: { fontSize: 20 },
  headerTitle: { fontSize: 14, fontWeight: "800", color: BLUE_DEEP, flex: 1 },
  body: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
  },
  name: { fontSize: 17, fontWeight: "800", color: BLUE_DEEP },
  stars: { fontSize: 13, color: GOLD, marginTop: 2, fontWeight: "700" },
  desc: { fontSize: 12, color: TEXT_MUTED, marginTop: 4, lineHeight: 17 },
  mapBtn: {
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: BLUE_PALE,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  swapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFF7E6",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#FDE68A",
    alignSelf: "flex-start",
  },
  swapIcon: { fontSize: 16, color: GOLD, fontWeight: "800" },
  swapTxt: { fontSize: 11, color: "#92400E", fontWeight: "700" },
  costRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: BLUE_ULTRA_PALE,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: BLUE_PALE,
  },
  costLabel: { fontSize: 12, color: TEXT_MUTED, fontWeight: "600" },
  costValue: { fontSize: 15, fontWeight: "800", color: BLUE_PRIMARY },
  costTotal: { fontSize: 12, color: TEXT_MUTED },
});
const waSt = StyleSheet.create({
  container: {
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: "#FDE68A",
    gap: 6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  titleIcon: { fontSize: 14 },
  title: {
    fontSize: 12,
    fontWeight: "800",
    color: "#92400E",
    letterSpacing: 0.3,
  },
  alertRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  alertIcon: { fontSize: 13, width: 20 },
  alertText: {
    fontSize: 12,
    color: "#78350F",
    fontWeight: "600",
    flex: 1,
    lineHeight: 17,
  },
});
const editSt = StyleSheet.create({
  panel: {
    backgroundColor: WHITE,
    borderRadius: 14,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
    elevation: 3,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BLUE_PRIMARY },
  title: { flex: 1, fontSize: 14, fontWeight: "800", color: BLUE_DEEP },
  closeBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#EEF4FF",
    justifyContent: "center",
    alignItems: "center",
  },
  closeTxt: { fontSize: 11, color: TEXT_MUTED, fontWeight: "700" },
  sub: { fontSize: 12, color: TEXT_MUTED, marginBottom: 12, lineHeight: 17 },
  addDayBtn: {
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    marginBottom: 10,
    backgroundColor: BLUE_ULTRA_PALE,
  },
  addDayTxt: { fontSize: 13, fontWeight: "700", color: BLUE_PRIMARY },
  // Section suppression dans le panneau
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: TEXT_MUTED,
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 8,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BLUE_ULTRA_PALE,
  },
  deleteDayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
});
const dSt = StyleSheet.create({
  aiBadge: {
    backgroundColor: "rgba(26,115,232,0.2)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  aiBadgeTxt: { color: "#93C5FD", fontSize: 9, fontWeight: "800" },
  geminiTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: GEMINI_BLUE,
    fontStyle: "italic",
    marginBottom: 8,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(220,38,38,0.18)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.35)",
  },
  deleteBtnIcon: { fontSize: 12 },
  deleteBtnTxt: { fontSize: 10, color: "#FCA5A5", fontWeight: "700" },
});
const ragTogSt = StyleSheet.create({
  btn: {
    backgroundColor: GEMINI_PALE,
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#93C5FD",
    marginBottom: 8,
  },
  txt: { fontSize: 12, fontWeight: "700", color: GEMINI_BLUE },
});
const errSt = StyleSheet.create({
  box: {
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  txt: { fontSize: 12, color: "#92400E", lineHeight: 18 },
});
const advSt = StyleSheet.create({
  box: {
    backgroundColor: GEMINI_PALE,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#93C5FD",
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  emoji: { fontSize: 18 },
  title: { fontSize: 13, fontWeight: "700", color: GEMINI_BLUE },
  text: { fontSize: 13, color: "#1E40AF", lineHeight: 20 },
});
const priceBadgeSt = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(200,155,60,0.4)",
    marginTop: 10,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(200,155,60,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  icon: { fontSize: 18 },
  label: { fontSize: 13, fontWeight: "800", color: WHITE },
  sub: { fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  priceBox: { alignItems: "flex-end" },
  price: { fontSize: 18, fontWeight: "900", color: GOLD },
});
const pSt = StyleSheet.create({
  securityBadge: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#F0FFF4",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#6EE7B7",
    marginBottom: 12,
  },
  securityIcon: { fontSize: 16 },
  securityTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: GREEN,
    marginBottom: 2,
  },
  securityText: { flex: 1, fontSize: 11, color: GREEN, lineHeight: 17 },
});

// ═══════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL PlanPremium
// ═══════════════════════════════════════════════════════════════
export default function PlanPremium() {
  const { travelData } = useTravelData();
  const params = useLocalSearchParams();

  const leaderPrefsJson = params.leaderPrefsJson as string | undefined;
  const inviteCodeParam = params.inviteCode as string | undefined;
  const planNomParam = params.planNom as string | undefined;

  const [itinerary, setItinerary] = useState<PremiumDayPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [planName, setPlanName] = useState(planNomParam || "");
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [planCode, setPlanCode] = useState<string | null>(null);
  const [notifResult, setNotifResult] = useState<Record<string, string> | null>(
    null,
  );
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [leaderPrefs, setLeaderPrefs] = useState<any>(null);
  const [aiModel, setAiModel] = useState<"gemini" | "fallback" | undefined>();
  const [aiAdvice, setAiAdvice] = useState("");
  const [ragSteps, setRagSteps] = useState<RagStep[]>([]);
  const [showRag, setShowRag] = useState(false);
  const [geminiError, setGeminiError] = useState("");
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [weatherLoad, setWeatherLoad] = useState(false);
  const [showRefaire, setShowRefaire] = useState(false);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [menuInviteCode, setMenuInviteCode] = useState<string | null>(
    inviteCodeParam || null,
  );

  // État pour le modal de suppression
  const [deleteModalDayId, setDeleteModalDayId] = useState<string | null>(null);

  // Paiement
  const [paid, setPaid] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [cardRaw, setCardRaw] = useState("");
  const [cardName, setCardName] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardType, setCardType] = useState("💳");
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptDetails, setReceiptDetails] = useState<any>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const city = travelData.ville || leaderPrefs?.destination || "Tunis";

  const dayToDelete = itinerary.find((d) => d.id === deleteModalDayId) || null;
  const costSavedIfDeleted = dayToDelete?.cost.dailyTotal ?? 0;

  useEffect(() => {
    if (leaderPrefsJson) {
      try {
        setLeaderPrefs(JSON.parse(leaderPrefsJson));
      } catch {}
    }
    if (inviteCodeParam) setMenuInviteCode(inviteCodeParam);
    if (planNomParam) setPlanName(planNomParam);
  }, [leaderPrefsJson, inviteCodeParam, planNomParam]);

  useEffect(() => {
    AsyncStorage.getItem("inviteCode")
      .then((c) => {
        if (c) setMenuInviteCode(c);
      })
      .catch(() => {});
  }, []);

  const getNumDays = useCallback(() => {
    const { dateDebut, dateFin } = travelData;
    if (leaderPrefs?.date_depart && leaderPrefs?.date_arrivee) {
      const start = new Date(leaderPrefs.date_depart).setHours(0, 0, 0, 0);
      const end = new Date(leaderPrefs.date_arrivee).setHours(0, 0, 0, 0);
      return Math.max(Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1, 1);
    }
    if (!dateDebut || !dateFin) return 1;
    const start = new Date(dateDebut).setHours(0, 0, 0, 0);
    const end = new Date(dateFin).setHours(0, 0, 0, 0);
    return Math.max(Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1, 1);
  }, [travelData, leaderPrefs]);

  const defaultPrices = useCallback(() => {
    const hotelList = getHotelList(city);
    const h = hotelList[0] || { stars: "4" };
    const stars = (h.stars || "4").replace(/[^0-9]/g, "") || "4";
    const hotelCost = hotelPriceForCity(city, stars);
    const cafeList = getCafeList(city);
    const cafeCost = cafeList.length
      ? cafePriceFromJson(cafeList[0])
      : (CAFE_PRICES[city] ?? CAFE_PRICES["default"]);
    const actList = getActivityList(city);
    const actCost = actList.length ? activityPriceFromJson(actList[0]) : 35;
    const transList = getTransportList(city);
    const transCost =
      transList[0]?.prixNum ??
      TRANSPORT_PRICES[city] ??
      TRANSPORT_PRICES["default"];
    return {
      hotel: hotelCost,
      cafe: cafeCost,
      activity: actCost,
      transport: transCost,
      daily: hotelCost + cafeCost + actCost + transCost,
    };
  }, [city]);

  const dp = defaultPrices();

  const globalTotal =
    itinerary.length > 0
      ? itinerary.reduce((s, d) => s + d.cost.dailyTotal, 0)
      : dp.daily * getNumDays();

  useEffect(() => {
    if (!city) return;
    setWeatherLoad(true);
    fetchWeather(city).then((w) => {
      setWeather(w);
      setWeatherLoad(false);
    });
  }, [city]);

  const generateItinerary = useCallback(async () => {
    setLoading(true);
    setGeminiError("");
    setRagSteps([]);
    setAiAdvice("");
    const days = getNumDays();
    const currentWeather = await fetchWeather(city);
    setWeather(currentWeather);
    const preferredHotelName =
      leaderPrefs?.hotel_name || (travelData as any).hotel?.trim() || null;
    const preferredCafeName =
      leaderPrefs?.cafe_name || (travelData as any).cafe?.trim() || null;
    const totalBudget = leaderPrefs?.budget
      ? Number(leaderPrefs.budget)
      : (travelData as any).budget
        ? Number((travelData as any).budget)
        : null;
    const maxDailyBudget =
      totalBudget && totalBudget > 0 ? totalBudget / days : undefined;
    const finalCity = leaderPrefs?.destination || city;
    try {
      const cityDataMap: Record<string, CityData> = {
        [finalCity]: enrichCityDataWithJson(finalCity, {}),
      };
      const leaderPrefsForPipeline: GroupPref = {
        role: "leader",
        email:
          leaderPrefs?.email || (travelData as any).email || "user@premium.com",
        full_name: leaderPrefs?.full_name || (travelData as any).nom || null,
        hotel_type:
          leaderPrefs?.hotel_type || (travelData as any).hotelType || "luxe",
        hotel_location:
          leaderPrefs?.hotel_location ||
          (travelData as any).hotelLocation ||
          null,
        cafe_levels:
          leaderPrefs?.cafe_levels ||
          (travelData as any).cafeLevels?.join(", ") ||
          null,
        activity_types:
          leaderPrefs?.activity_types ||
          (travelData as any).activityTypes?.join(", ") ||
          (travelData as any).preferences ||
          null,
        budget: totalBudget ? String(totalBudget) : String(dp.daily * days),
        voyage_type:
          leaderPrefs?.voyage_type ||
          (travelData as any).voyageType ||
          (travelData as any).typeVoyage ||
          null,
        hotel_name: preferredHotelName,
        cafe_name: preferredCafeName,
        destination: finalCity,
        date_depart:
          leaderPrefs?.date_depart || (travelData as any).dateDebut || null,
        date_arrivee:
          leaderPrefs?.date_arrivee || (travelData as any).dateFin || null,
        nuitees: days,
      };
      const result = await runAgenticRagPipeline({
        villes: [finalCity],
        days,
        cityDataMap,
        isMultiCity: false,
        getVilleForDay: () => finalCity,
        groupPrefs: [],
        leaderPrefs: leaderPrefsForPipeline,
        fallbackDateDebut: leaderPrefs?.date_depart
          ? new Date(leaderPrefs.date_depart)
          : travelData.dateDebut
            ? new Date(travelData.dateDebut)
            : null,
        fallbackDateFin: leaderPrefs?.date_arrivee
          ? new Date(leaderPrefs.date_arrivee)
          : travelData.dateFin
            ? new Date(travelData.dateFin)
            : null,
        preferredHotelName,
        preferredCafeName,
        maxDailyBudget,
      } as any);
      const premium = result.itinerary.map((ragDay, idx) => {
        let dayPreferredCafe = null;
        if (preferredCafeName && idx === 0)
          dayPreferredCafe = preferredCafeName;
        return ragToPremium(
          ragDay,
          idx,
          currentWeather,
          maxDailyBudget,
          preferredHotelName,
          dayPreferredCafe,
        );
      });
      setItinerary(premium);
      setAiModel(result.model);
      setAiAdvice(result.aiAdvice || "");
      setRagSteps(result.steps || []);
      if (result.geminiError) setGeminiError(result.geminiError);
    } catch (err) {
      const fallback = Array.from({ length: days }, (_, i) => {
        let dayPreferredCafe = null;
        if (preferredCafeName && i === 0) dayPreferredCafe = preferredCafeName;
        return buildLocalDay(
          finalCity,
          i,
          currentWeather,
          maxDailyBudget,
          preferredHotelName,
          dayPreferredCafe,
        );
      });
      setItinerary(fallback);
      setAiModel("fallback");
      setGeminiError(String(err));
    } finally {
      setLoading(false);
    }
  }, [city, travelData, getNumDays, dp, leaderPrefs]);

  const swapField = useCallback(
    (dayId: string, field: keyof SwapState) => {
      const days = getNumDays();
      const totalBudget = leaderPrefs?.budget
        ? Number(leaderPrefs.budget)
        : (travelData as any).budget
          ? Number((travelData as any).budget)
          : null;
      const maxDailyBudget =
        totalBudget && totalBudget > 0 ? totalBudget / days : undefined;
      const preferredHotelName =
        field === "hotelIdx"
          ? null
          : leaderPrefs?.hotel_name ||
            (travelData as any).hotel?.trim() ||
            null;
      const preferredCafeName =
        field === "cafeIdx"
          ? null
          : leaderPrefs?.cafe_name || (travelData as any).cafe?.trim() || null;
      setItinerary((prev) =>
        prev.map((day) => {
          if (day.id !== dayId) return day;
          const listSizes = {
            hotelIdx: Math.max(getHotelList(day.ville).length, 1),
            cafeIdx: Math.max(getCafeList(day.ville).length, 1),
            actIdx: Math.max(getActivityList(day.ville).length, 1),
            transportIdx: Math.max(getTransportList(day.ville).length, 1),
          };
          const newSwap = {
            ...day.swap,
            [field]: (day.swap[field] + 1) % listSizes[field],
          };
          return recomputeDay(
            { ...day, swap: newSwap },
            maxDailyBudget,
            preferredHotelName,
            preferredCafeName,
          );
        }),
      );
    },
    [travelData, getNumDays, leaderPrefs],
  );

  const handleRefaire = useCallback(
    (options: RefaireOptions) => {
      const noneSelected =
        !options.hotel && !options.cafe && !options.loisir && !options.activite;
      if (noneSelected) {
        generateItinerary();
        setShowRefaire(false);
        return;
      }
      const days = getNumDays();
      const totalBudget = leaderPrefs?.budget
        ? Number(leaderPrefs.budget)
        : (travelData as any).budget
          ? Number((travelData as any).budget)
          : null;
      const maxDailyBudget =
        totalBudget && totalBudget > 0 ? totalBudget / days : undefined;
      const preferredHotelName = options.hotel
        ? null
        : leaderPrefs?.hotel_name || (travelData as any).hotel?.trim() || null;
      const preferredCafeName = options.cafe
        ? null
        : leaderPrefs?.cafe_name || (travelData as any).cafe?.trim() || null;
      setItinerary((prev) =>
        prev.map((day) => {
          const newSwap = {
            hotelIdx: options.hotel
              ? (day.swap.hotelIdx + 1) %
                Math.max(getHotelList(day.ville).length, 1)
              : day.swap.hotelIdx,
            cafeIdx: options.cafe
              ? (day.swap.cafeIdx + 1) %
                Math.max(getCafeList(day.ville).length, 1)
              : day.swap.cafeIdx,
            actIdx:
              options.activite || options.loisir
                ? (day.swap.actIdx + 1) %
                  Math.max(getActivityList(day.ville).length, 1)
                : day.swap.actIdx,
            transportIdx: day.swap.transportIdx,
          };
          return recomputeDay(
            { ...day, swap: newSwap },
            maxDailyBudget,
            preferredHotelName,
            preferredCafeName,
          );
        }),
      );
      setShowRefaire(false);
    },
    [generateItinerary, travelData, getNumDays, leaderPrefs],
  );

  const requestDeleteDay = useCallback((dayId: string) => {
    setDeleteModalDayId(dayId);
  }, []);

  const confirmDeleteDay = useCallback(() => {
    if (!deleteModalDayId) return;
    setItinerary((prev) => prev.filter((d) => d.id !== deleteModalDayId));
    setDeleteModalDayId(null);
  }, [deleteModalDayId]);

  const cardDigits = cardRaw.replace(/\D/g, "");
  const cardValid = luhnCheck(cardRaw);
  const expiryOk = isExpiryValid(expiryDate);
  const cvvOk = cvv.trim().length === 3;
  const nameOk = cardName.trim().length > 2;
  const isPaymentValid = cardValid && expiryOk && cvvOk && nameOk;

  const handlePayment = async () => {
    setPayError(null);
    if (!cardValid) {
      setPayError("Le numéro de carte n'est pas valide.");
      return;
    }
    if (!expiryOk) {
      setPayError("Votre carte est expirée ou la date est invalide.");
      return;
    }
    if (!cvvOk) {
      setPayError("Veuillez entrer un CVV à 3 chiffres.");
      return;
    }
    if (!nameOk) {
      setPayError("Veuillez entrer le nom du titulaire.");
      return;
    }
    setIsPaying(true);
    try {
      await fetch(`${API}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: 1,
          amount: 10,
          card_name: cardName.trim(),
          card_number: "**** **** **** " + cardDigits.slice(-4),
        }),
      });
    } catch {}
    setReceiptDetails({
      id: Math.floor(Math.random() * 1_000_000),
      date: new Date().toLocaleString("fr-FR"),
      amount: "10 TND",
      name: cardName.trim(),
    });
    setPaid(true);
    setShowPayment(false);
    setShowReceipt(true);
    setIsPaying(false);
    generateItinerary();
  };

  const savePlanToStorage = async (name: string) => {
    if (!itinerary.length) return null;
    const existing = await AsyncStorage.getItem("@premium_travel_plans");
    const plans: SavedPlan[] = existing ? JSON.parse(existing) : [];
    const globalTotalSave = itinerary.reduce(
      (s, d) => s + d.cost.dailyTotal,
      0,
    );
    const newPlan: SavedPlan = {
      id: Date.now().toString(),
      nom: name || "Voyage Premium",
      destination: leaderPrefs?.destination || city,
      dateDebut:
        leaderPrefs?.date_depart ||
        (travelData as any).dateDebut ||
        new Date().toISOString(),
      dateFin:
        leaderPrefs?.date_arrivee ||
        (travelData as any).dateFin ||
        new Date().toISOString(),
      duree: itinerary.length,
      dateCreation: new Date().toISOString(),
      statut: "à venir",
      voyageurs: 1,
      activites: itinerary.map((d) => d.activity),
      hotels: itinerary.map((d) => d.hotel.name),
      itinerary,
      type: "premium",
      budget: globalTotalSave,
      servicesInclus: ["Guide privé", "Transport VIP"],
      guidePrive: true,
      transportVip: true,
      aiModel,
      aiAdvice,
      inviteCode: (travelData as any).inviteCode || menuInviteCode || undefined,
      plan_code: undefined,
    };
    await AsyncStorage.setItem(
      "@premium_travel_plans",
      JSON.stringify([...plans, newPlan]),
    );
    return newPlan;
  };

  const handleSaveNamedPlan = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const plan = await savePlanToStorage(planName);
      if (!plan) throw new Error("Impossible de construire le plan");
      let guestEmails: string[] = [];
      const existingCode =
        (travelData as any).inviteCode ||
        (travelData as any).code ||
        menuInviteCode ||
        null;
      if (existingCode)
        guestEmails = await fetchGuestEmailsForCode(existingCode);
      if ((travelData as any).emailInvites?.length)
        guestEmails = [
          ...new Set([...guestEmails, ...(travelData as any).emailInvites]),
        ];
      if (
        leaderPrefs?.invited_emails &&
        Array.isArray(leaderPrefs.invited_emails)
      )
        guestEmails = [
          ...new Set([...guestEmails, ...leaderPrefs.invited_emails]),
        ];
      guestEmails = guestEmails.filter((email) => email && email.includes("@"));
      const leaderEmail = leaderPrefs?.email || (travelData as any).email || "";
      const leaderName =
        leaderPrefs?.full_name || (travelData as any).nom || "L'organisateur";
      const leaderId = (travelData as any).userId || null;
      const backendResult = await savePlanToBackend({
        planData: plan,
        inviteCode: existingCode,
        guestEmails,
        leaderEmail,
        leaderName,
        leaderId,
      });
      if (backendResult.success) {
        setPlanCode(backendResult.planCode || null);
        setNotifResult(backendResult.emailsSent || null);
        setShowNotifModal(true);
        const updatedPlan = { ...plan, plan_code: backendResult.planCode };
        const existing = await AsyncStorage.getItem("@premium_travel_plans");
        const plans: SavedPlan[] = existing ? JSON.parse(existing) : [];
        await AsyncStorage.setItem(
          "@premium_travel_plans",
          JSON.stringify(
            plans.map((p) => (p.id === plan.id ? updatedPlan : p)),
          ),
        );
      } else {
        setSaveError(backendResult.error || "Erreur serveur");
        Alert.alert(
          "✓ Plan sauvegardé localement",
          `"${plan.nom}" enregistré sur cet appareil.${backendResult.error ? ` (${backendResult.error})` : ""}`,
          [{ text: "Continuer", style: "cancel" }],
        );
      }
      setConfirmed(true);
      setSaveSuccess(true);
      setNameModalVisible(false);
      setPlanName("");
    } catch (err: any) {
      setSaveError(err?.message || "Erreur inattendue");
      Alert.alert("Erreur", `Impossible de sauvegarder : ${err?.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const sharedHotel = itinerary.length > 0 ? itinerary[0].hotel : null;

  // ─── PAYWALL ───────────────────────────────────────────────────
  if (!paid) {
    return (
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={["#021B4E", "#042A66", "#0A4DBF"]}
          style={styles.hero}
        >
          <View style={styles.menuWrapper}>
            <AppMenuDark inviteCode={menuInviteCode} />
          </View>
          <View style={styles.circle1} />
          <View style={styles.circle2} />
          <View style={styles.goldBadge}>
            <Text style={styles.goldBadgeText}>✦ PREMIUM</Text>
          </View>
          <Text style={styles.heroTitle}>Planificateur</Text>
          <Text style={styles.heroTitleAccent}>Premium ✨</Text>
          <Text style={styles.heroSub}>
            Services exclusifs · Guide privé · Transport VIP
          </Text>
          <View style={styles.heroPriceRow}>
            <View style={priceBadgeSt.wrapper}>
              <View style={priceBadgeSt.iconBox}>
                <Text style={priceBadgeSt.icon}>👑</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={priceBadgeSt.label}>Accès Premium IA</Text>
                <Text style={priceBadgeSt.sub}>
                  Gemini 2.5 · {getNumDays()} jour{getNumDays() > 1 ? "s" : ""}{" "}
                  · Sécurité des lieux incluse
                </Text>
              </View>
              <View style={priceBadgeSt.priceBox}>
                <Text style={priceBadgeSt.price}>10 TND</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
        <View style={styles.content}>
          {weatherLoad ? (
            <ActivityIndicator
              color={BLUE_PRIMARY}
              style={{ marginBottom: 8 }}
            />
          ) : (
            weather && <WeatherWidget weather={weather} />
          )}
          {weather && (
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { fontSize: 13 }]}>
                🛡️ Sécurité des lieux incluse dans Premium
              </Text>
              <Text
                style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 8 }}
              >
                Chaque café, lieu et hôtel est évalué sur 100 points (note,
                avis, prix, informations). Les lieux non recommandés sont
                automatiquement filtrés.
              </Text>
              {generateSafetyAlerts(weather, city).length === 0 ? (
                <Text style={{ fontSize: 12, color: GREEN }}>
                  ✅ Conditions météo favorables à {city}
                </Text>
              ) : (
                generateSafetyAlerts(weather, city)
                  .slice(0, 2)
                  .map((a, i) => (
                    <View
                      key={i}
                      style={{ flexDirection: "row", gap: 8, marginTop: 6 }}
                    >
                      <Text style={{ fontSize: 14 }}>{a.icon}</Text>
                      <Text style={{ fontSize: 12, color: BLUE_DEEP, flex: 1 }}>
                        <Text style={{ fontWeight: "700" }}>{a.title} :</Text>{" "}
                        {a.message}
                      </Text>
                    </View>
                  ))
              )}
            </View>
          )}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>✦ Ce qui vous attend</Text>
            <View style={styles.servicesRow}>
              {[
                { icon: "🎖", label: "Guide privé" },
                { icon: "🚘", label: "Transport VIP" },
                { icon: "🏨", label: "Hôtel ★★★★" },
                { icon: "☕", label: "Café sécurisé" },
                { icon: "✨", label: "Planification IA" },
                { icon: "🛡️", label: "Score sécurité lieux" },
                { icon: "💰", label: "Coûts détaillés" },
                { icon: "📍", label: "Localisation Maps" },
                { icon: "🎯", label: "Préférences respectées" },
              ].map((s) => (
                <View key={s.label} style={styles.serviceChip}>
                  <Text style={styles.serviceChipIcon}>{s.icon}</Text>
                  <Text style={styles.serviceChipText}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.lockedCard}>
            <View style={styles.lockedOverlay}>
              <Text style={styles.lockIcon}>🔒</Text>
              <Text style={styles.lockedTitle}>Votre plan IA est prêt</Text>
              <Text style={styles.lockedSub}>
                Payez pour débloquer l'itinéraire Gemini avec sécurité des
                lieux, météo et coûts détaillés
              </Text>
            </View>
            {[1, 2, 3].map((i) => (
              <View key={i} style={styles.lockedFakeRow}>
                <View style={styles.lockedFakeIcon} />
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={[styles.lockedFakeLine, { width: "60%" }]} />
                  <View style={[styles.lockedFakeLine, { width: "40%" }]} />
                </View>
                <View style={[styles.lockedFakeLine, { width: 60 }]} />
              </View>
            ))}
          </View>
          <TouchableOpacity
            onPress={() => setShowPayment(true)}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[GOLD, "#E8B84B"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.unlockBtn}
            >
              <Text style={styles.unlockBtnIcon}>💳</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.unlockBtnTitle}>Débloquer mon plan IA</Text>
                <Text style={styles.unlockBtnSub}>
                  10 TND · Paiement sécurisé SSL
                </Text>
              </View>
              <Text style={styles.unlockBtnArrow}>→</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.secureFooter}>
            🔒 Vos données bancaires sont protégées (TLS 1.3)
          </Text>
        </View>

        {/* Modal paiement */}
        <Modal visible={showPayment} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <LinearGradient
                colors={[GOLD, "#E8B84B"]}
                style={styles.modalAccent}
              >
                <Text style={{ fontSize: 22 }}>💳</Text>
              </LinearGradient>
              <Text style={styles.modalTitle}>Paiement Premium</Text>
              <Text style={styles.modalSub}>
                Montant : 10 TND · 🔒 SSL sécurisé
              </Text>
              <FloatingInput
                placeholder="Numéro de carte CIB / Visa / Mastercard"
                value={formatCardDisplay(cardRaw)}
                keyboardType="numeric"
                maxLength={19}
                icon={cardType}
                hint={
                  cardDigits.length === 16
                    ? cardValid
                      ? "✅ Carte valide"
                      : "❌ Numéro invalide"
                    : cardDigits.length > 0
                      ? `${cardDigits.length}/16 chiffres`
                      : ""
                }
                onChangeText={(t: string) => {
                  const raw = t.replace(/\D/g, "").slice(0, 16);
                  setCardRaw(raw);
                  setCardType(detectCardType(raw));
                }}
              />
              <FloatingInput
                placeholder="Nom du titulaire de la carte"
                value={cardName}
                icon="👤"
                onChangeText={(t: string) => setCardName(t.toUpperCase())}
                hint={
                  cardName.length > 0 && !nameOk
                    ? "❌ Nom trop court"
                    : cardName.length > 2
                      ? "✅ Nom valide"
                      : ""
                }
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <FloatingInput
                    placeholder="MM/AA"
                    value={expiryDate}
                    keyboardType="numeric"
                    maxLength={5}
                    icon="📅"
                    hint={
                      expiryDate.length === 5
                        ? expiryOk
                          ? "✅ Valide"
                          : "❌ Expirée"
                        : ""
                    }
                    onChangeText={(text: string) => {
                      const cleaned = text.replace(/\D/g, "").slice(0, 4);
                      let formatted = cleaned;
                      if (cleaned.length >= 2) {
                        let month = parseInt(cleaned.slice(0, 2), 10);
                        if (month > 12) month = 12;
                        const mm = month.toString().padStart(2, "0");
                        formatted =
                          cleaned.length > 2
                            ? `${mm}/${cleaned.slice(2, 4)}`
                            : mm;
                      }
                      setExpiryDate(formatted);
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <FloatingInput
                    placeholder="CVV"
                    value={cvv}
                    secureTextEntry
                    keyboardType="numeric"
                    maxLength={3}
                    icon="🔒"
                    hint={
                      cvv.length > 0 && !cvvOk
                        ? "❌ 3 chiffres requis"
                        : cvvOk
                          ? "✅"
                          : ""
                    }
                    onChangeText={(t: string) =>
                      setCvv(t.replace(/\D/g, "").slice(0, 3))
                    }
                  />
                </View>
              </View>
              <View style={pSt.securityBadge}>
                <Text style={pSt.securityIcon}>🛡️</Text>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={pSt.securityTitle}>Paiement 100% sécurisé</Text>
                  <Text style={pSt.securityText}>
                    🔒 Chiffrement TLS 1.3 · CIB, Visa, Mastercard
                  </Text>
                  <Text style={pSt.securityText}>
                    🚫 Données non stockées · Aucun partage tiers
                  </Text>
                </View>
              </View>
              {payError && (
                <View
                  style={{
                    backgroundColor: "#FEE2E2",
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 10,
                    width: "100%",
                  }}
                >
                  <Text style={{ fontSize: 12, color: RED }}>
                    ⚠️ {payError}
                  </Text>
                </View>
              )}
              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={styles.modalBtnCancel}
                  onPress={() => setShowPayment(false)}
                >
                  <Text style={styles.modalBtnCancelText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 2 }}
                  onPress={handlePayment}
                  activeOpacity={0.85}
                  disabled={!isPaymentValid || isPaying}
                >
                  <LinearGradient
                    colors={
                      isPaymentValid && !isPaying
                        ? [GOLD, "#E8B84B"]
                        : ["#ccc", "#ddd"]
                    }
                    style={styles.modalBtnSave}
                  >
                    {isPaying ? (
                      <ActivityIndicator size="small" color="#3D2200" />
                    ) : (
                      <Text
                        style={[styles.modalBtnSaveText, { color: "#3D2200" }]}
                      >
                        Payer 10 TND
                      </Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    );
  }

  // ─── PLAN DÉBLOQUÉ ────────────────────────────────────────────
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={["#021B4E", "#042A66", "#0A4DBF"]}
        style={styles.hero}
      >
        <View style={styles.menuWrapper}>
          <AppMenuDark inviteCode={menuInviteCode} />
        </View>
        <View style={styles.circle1} />
        <View style={styles.circle2} />
        <View style={styles.goldBadge}>
          <Text style={styles.goldBadgeText}>✦ PREMIUM DÉBLOQUÉ</Text>
        </View>
        <Text style={styles.heroTitle}>Planificateur</Text>
        <Text style={styles.heroTitleAccent}>Premium ✨</Text>
        <Text style={styles.heroSub}>
          {leaderPrefs?.destination || city} ·{" "}
          {itinerary.length > 0 ? itinerary.length : getNumDays()} jour
          {(itinerary.length > 0 ? itinerary.length : getNumDays()) > 1
            ? "s"
            : ""}
        </Text>
        <View style={styles.heroPriceRow}>
          <Text style={styles.heroPriceLabel}>Budget estimé</Text>
          <Text style={styles.heroPrice}>{globalTotal} TND</Text>
          <Text style={styles.heroPriceSub}>
            {" "}
            · {itinerary.length > 0 ? itinerary.length : getNumDays()} jour
            {(itinerary.length > 0 ? itinerary.length : getNumDays()) > 1
              ? "s"
              : ""}
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.content}>
        <WeatherWidget weather={weather} />
        {loading && (
          <View
            style={[
              styles.card,
              { alignItems: "center", paddingVertical: 32, gap: 14 },
            ]}
          >
            <ActivityIndicator size="large" color={GEMINI_BLUE} />
            <Text
              style={{ color: GEMINI_BLUE, fontWeight: "700", fontSize: 15 }}
            >
              Gemini génère votre itinéraire…
            </Text>
            <Text
              style={{ color: TEXT_MUTED, fontSize: 12, textAlign: "center" }}
            >
              Analyse des préférences · Sécurité des lieux · Coûts détaillés
            </Text>
          </View>
        )}
        {!loading && itinerary.length > 0 && (
          <>
            <AiBadge model={aiModel} />
            {weather && (
              <SafetyAlertsPanel
                alerts={generateSafetyAlerts(weather, city)}
                city={city}
              />
            )}
            <PlanSafetyReport itinerary={itinerary} />
            {aiAdvice !== "" && (
              <View style={advSt.box}>
                <View style={advSt.header}>
                  <Text style={advSt.emoji}>🤖</Text>
                  <Text style={advSt.title}>Conseil Gemini AI</Text>
                </View>
                <Text style={advSt.text}>{aiAdvice}</Text>
              </View>
            )}
            {geminiError !== "" && (
              <View style={errSt.box}>
                <Text style={errSt.txt}>
                  ⚠️ Gemini indisponible — plan généré depuis les données
                  locales JSON
                </Text>
              </View>
            )}
            {ragSteps.length > 0 && (
              <TouchableOpacity
                onPress={() => setShowRag((v) => !v)}
                activeOpacity={0.8}
                style={ragTogSt.btn}
              >
                <Text style={ragTogSt.txt}>
                  {showRag ? "▲ Masquer" : "▼ Voir"} l'analyse Gemini RAG
                </Text>
              </TouchableOpacity>
            )}
            <RagStepsPanel steps={ragSteps} visible={showRag} />

            {!confirmed && (
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={{ flex: 2 }}
                  onPress={() => setNameModalVisible(true)}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={["#0A4DBF", "#1a6aff"]}
                    style={styles.actionBtnGrad}
                  >
                    <Text style={styles.actionBtnGradText}>
                      ✓ Confirmer & Sauvegarder
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.actionBtnModifier,
                    { flex: 1 },
                    showEditPanel && styles.actionBtnModifierActive,
                  ]}
                  onPress={() => setShowEditPanel((v) => !v)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.actionBtnModifierIcon}>✎</Text>
                  <Text style={styles.actionBtnModifierTxt}>Modifier</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtnRefaire, { flex: 1 }]}
                  onPress={() => setShowRefaire(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.actionBtnRefaireIcon}>↺</Text>
                  <Text style={styles.actionBtnRefaireTxt}>Refaire</Text>
                </TouchableOpacity>
              </View>
            )}

            {showEditPanel && (
              <View style={editSt.panel}>
                <View style={editSt.headerRow}>
                  <View style={editSt.dot} />
                  <Text style={editSt.title}>Mode Modification</Text>
                  <TouchableOpacity
                    onPress={() => setShowEditPanel(false)}
                    style={editSt.closeBtn}
                  >
                    <Text style={editSt.closeTxt}>✕</Text>
                  </TouchableOpacity>
                </View>
                <Text style={editSt.sub}>
                  Appuyez sur ⇅ pour modifier chaque élément · 🗑 pour supprimer
                  un jour
                </Text>
                <TouchableOpacity
                  style={editSt.addDayBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    const nd = buildLocalDay(
                      leaderPrefs?.destination || city,
                      itinerary.length,
                      weather,
                      undefined,
                      leaderPrefs?.hotel_name ||
                        (travelData as any).hotel?.trim() ||
                        null,
                      null,
                    );
                    setItinerary((prev) => [...prev, nd]);
                    setShowEditPanel(false);
                  }}
                >
                  <Text style={editSt.addDayTxt}>+ Ajouter un jour</Text>
                </TouchableOpacity>

                {/* Section suppression dans le panneau */}
                <Text style={editSt.sectionTitle}>🗑️ Supprimer un jour</Text>
                {itinerary.map((day) => (
                  <View key={day.id} style={editSt.dayRow}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: BLUE_DEEP,
                      }}
                    >
                      {day.title} — {day.ville}
                    </Text>
                    <TouchableOpacity
                      onPress={() => requestDeleteDay(day.id)}
                      style={editSt.deleteDayBtn}
                    >
                      <Text style={{ fontSize: 14, color: RED }}>🗑</Text>
                      <Text style={{ fontSize: 12, color: RED }}>
                        Supprimer
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {sharedHotel && (
              <View style={hotelSt.card}>
                <View style={hotelSt.header}>
                  <Text style={hotelSt.headerIcon}>🏨</Text>
                  <Text style={hotelSt.headerTitle}>
                    Hébergement unique — tout le séjour
                  </Text>
                </View>
                <View style={hotelSt.body}>
                  <View style={{ flex: 1 }}>
                    <Text style={hotelSt.name}>{sharedHotel.name}</Text>
                    <Text style={hotelSt.stars}>
                      {sharedHotel.rating} {sharedHotel.stars}★
                    </Text>
                    {sharedHotel.description && (
                      <Text style={hotelSt.desc}>
                        {sharedHotel.description}
                      </Text>
                    )}
                    {itinerary[0]?.placeSafety?.hotel && (
                      <PlaceSafetyDetail
                        report={itinerary[0].placeSafety.hotel}
                        placeName={sharedHotel.name}
                      />
                    )}
                    <TouchableOpacity
                      onPress={() =>
                        openMapForPlace(
                          sharedHotel.name,
                          leaderPrefs?.destination || city,
                        )
                      }
                      style={hotelSt.mapBtn}
                    >
                      <Text style={{ fontSize: 12 }}>📍 Voir sur Maps</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setItinerary((prev) => {
                        const hotelList = getHotelList(
                          leaderPrefs?.destination || city,
                        );
                        const nextIdx =
                          (prev[0]?.swap.hotelIdx + 1) %
                          Math.max(hotelList.length, 1);
                        return prev.map((d) =>
                          recomputeDay({
                            ...d,
                            swap: { ...d.swap, hotelIdx: nextIdx },
                          }),
                        );
                      });
                    }}
                    style={hotelSt.swapBtn}
                  >
                    <Text style={hotelSt.swapIcon}>⇅</Text>
                    <Text style={hotelSt.swapTxt}>Changer</Text>
                  </TouchableOpacity>
                </View>
                <View style={hotelSt.costRow}>
                  <Text style={hotelSt.costLabel}>Coût / nuit</Text>
                  <Text style={hotelSt.costValue}>
                    {itinerary[0]?.cost.hotel ?? 0} TND
                  </Text>
                  <Text style={hotelSt.costTotal}>
                    {" "}
                    · {(itinerary[0]?.cost.hotel ?? 0) * itinerary.length} TND
                    total ({itinerary.length} nuits)
                  </Text>
                </View>
              </View>
            )}

            <View style={{ gap: 14 }}>
              {itinerary.map((d) => (
                <View key={d.id} style={styles.dayCard}>
                  <LinearGradient
                    colors={["#042A66", "#0A4DBF"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.dayHeader}
                  >
                    <View>
                      <Text style={styles.dayHeaderText}>{d.title}</Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: "rgba(255,255,255,0.55)",
                        }}
                      >
                        {d.ville}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 6,
                        alignItems: "center",
                      }}
                    >
                      {d.aiGenerated && (
                        <View
                          style={{
                            backgroundColor: "rgba(26,115,232,0.2)",
                            borderRadius: 6,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                          }}
                        >
                          <Text
                            style={{
                              color: "#93C5FD",
                              fontSize: 9,
                              fontWeight: "800",
                            }}
                          >
                            ✨ AI
                          </Text>
                        </View>
                      )}
                      <View style={styles.goldBadgeSmall}>
                        <Text style={styles.goldBadgeSmallText}>✦ Premium</Text>
                      </View>

                      {/* BOUTON SUPPRIMER SUR CHAQUE CARTE */}
                      <TouchableOpacity
                        onPress={() => requestDeleteDay(d.id)}
                        style={dSt.deleteBtn}
                        activeOpacity={0.8}
                      >
                        <Text style={dSt.deleteBtnIcon}>🗑</Text>
                        <Text style={dSt.deleteBtnTxt}>Supprimer</Text>
                      </TouchableOpacity>
                    </View>
                  </LinearGradient>
                  <View style={styles.dayBody}>
                    {d.aiGenerated && d.title !== `Jour ${d.dayIndex + 1}` && (
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: GEMINI_BLUE,
                          fontStyle: "italic",
                          marginBottom: 8,
                        }}
                      >
                        "{d.title}"
                      </Text>
                    )}
                    {d.meteo && <WeatherWidget weather={d.meteo} />}
                    {d.safetyAlerts && d.safetyAlerts.length > 0 && (
                      <SafetyAlertsPanel
                        alerts={d.safetyAlerts}
                        city={d.ville}
                      />
                    )}
                    {d.weatherAlerts &&
                      (d.weatherAlerts.hotel ||
                        d.weatherAlerts.cafe ||
                        d.weatherAlerts.activity) && (
                        <View style={waSt.container}>
                          <View style={waSt.titleRow}>
                            <Text style={waSt.titleIcon}>🛡️</Text>
                            <Text style={waSt.title}>
                              Sélection adaptée à la météo
                            </Text>
                          </View>
                          {d.weatherAlerts.hotel && (
                            <View style={waSt.alertRow}>
                              <Text style={waSt.alertIcon}>🏨</Text>
                              <Text style={waSt.alertText}>
                                {String(d.weatherAlerts.hotel)}
                              </Text>
                            </View>
                          )}
                          {d.weatherAlerts.cafe && (
                            <View style={waSt.alertRow}>
                              <Text style={waSt.alertIcon}>☕</Text>
                              <Text style={waSt.alertText}>
                                {String(d.weatherAlerts.cafe)}
                              </Text>
                            </View>
                          )}
                          {d.weatherAlerts.activity && (
                            <View style={waSt.alertRow}>
                              <Text style={waSt.alertIcon}>🎯</Text>
                              <Text style={waSt.alertText}>
                                {String(d.weatherAlerts.activity)}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    {d.cafe.name ? (
                      <SwapRow
                        icon="☕"
                        label="Pause café"
                        value={
                          d.cafe.zone
                            ? `${d.cafe.name} · ${d.cafe.zone}`
                            : d.cafe.name
                        }
                        subValue={`Tarif : ${d.cafe.prix}`}
                        cost={d.cost.cafe}
                        safetyReport={d.placeSafety?.cafe}
                        onSwap={() => swapField(d.id, "cafeIdx")}
                        swapHint={`${getCafeList(d.ville).length} cafés disponibles`}
                        onMap={
                          d.cafe.name
                            ? () =>
                                openMapForPlace(
                                  d.cafe.name,
                                  d.cafe.zone || d.ville,
                                )
                            : undefined
                        }
                      />
                    ) : null}
                    <SwapRow
                      icon="🎯"
                      label="Activité principale"
                      value={d.activity}
                      cost={d.cost.activity}
                      safetyReport={d.placeSafety?.activity}
                      onSwap={() => swapField(d.id, "actIdx")}
                      swapHint={`${getActivityList(d.ville).length} activités disponibles`}
                      onMap={() => openMapForPlace(d.ville, "Tunisie")}
                    />
                    {d.localActivity &&
                      (() => {
                        const nomLoisir = (
                          d.localActivity.name ?? ""
                        ).toLowerCase();
                        const isCafeLoisir = [
                          "café",
                          "cafe",
                          "coffee",
                          "barista",
                          "latte",
                          "espresso",
                          "thé",
                        ].some((kw) => nomLoisir.includes(kw));
                        if (isCafeLoisir && getCafeList(d.ville).length === 0)
                          return null;
                        return (
                          <View style={laSt.card}>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                marginBottom: 4,
                              }}
                            >
                              <Text style={{ fontSize: 14 }}>🎮</Text>
                              <Text style={laSt.label}>
                                Loisir / Divertissement
                              </Text>
                              {d.aiGenerated && (
                                <View style={[abSt.badge, abSt.gemini]}>
                                  <Text style={abSt.icon}>✨</Text>
                                  <Text
                                    style={[abSt.txt, { color: GEMINI_BLUE }]}
                                  >
                                    Gemini
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={laSt.name}>
                              {d.localActivity.name}
                            </Text>
                            {d.localActivity.description && (
                              <Text style={laSt.desc}>
                                {d.localActivity.description}
                              </Text>
                            )}
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <View style={laSt.prixRow}>
                                <Text style={laSt.prixTxt}>
                                  {d.localActivity.prix}
                                </Text>
                              </View>
                              <TouchableOpacity
                                onPress={() =>
                                  openMapForPlace(
                                    d.localActivity!.name,
                                    d.ville,
                                  )
                                }
                                style={[
                                  laSt.prixRow,
                                  {
                                    backgroundColor: "#EFF6FF",
                                    borderColor: BLUE_PALE,
                                  },
                                ]}
                              >
                                <Text
                                  style={{ fontSize: 11, color: BLUE_PRIMARY }}
                                >
                                  📍 Maps
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })()}
                    <SwapRow
                      icon="🚘"
                      label="Transport"
                      value={d.transport.label}
                      subValue={`Tarif indicatif : ${d.transport.prixStr}`}
                      cost={d.cost.transport}
                      onSwap={() => swapField(d.id, "transportIdx")}
                      swapHint={`${getTransportList(d.ville).length} options disponibles`}
                    />
                    {d.conseil && (
                      <View style={consSt.box}>
                        <Text style={consSt.txt}>💡 {d.conseil}</Text>
                      </View>
                    )}
                    <DailyCostCard cost={d.cost} dayTitle={d.title} />
                  </View>
                </View>
              ))}
            </View>

            <TotalSummaryCard
              itinerary={itinerary}
              numDays={itinerary.length}
            />

            {confirmed && saveSuccess && (
              <View style={styles.confirmedBox}>
                <View style={styles.confirmedIcon}>
                  <Text style={{ fontSize: 22, color: WHITE }}>✓</Text>
                </View>
                <Text style={styles.confirmedTitle}>
                  Plan Premium sauvegardé !
                </Text>
                <Text style={styles.confirmedSub}>
                  {aiModel === "gemini" ? "✨ Généré par Gemini AI · " : ""}
                  Budget total : {globalTotal} TND
                </Text>
              </View>
            )}
          </>
        )}
      </View>

      {/* MODAL DE SUPPRESSION */}
      <DeleteDayModal
        visible={deleteModalDayId !== null}
        day={dayToDelete}
        costSaved={costSavedIfDeleted}
        onConfirm={confirmDeleteDay}
        onCancel={() => setDeleteModalDayId(null)}
      />

      {/* Modal nommage du plan */}
      <Modal visible={nameModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <LinearGradient
              colors={[GOLD, "#E8B84B"]}
              style={styles.modalAccent}
            >
              <Text style={{ fontSize: 22 }}>✦</Text>
            </LinearGradient>
            <Text style={styles.modalTitle}>Nommez votre plan</Text>
            <Text style={styles.modalSub}>
              Ce nom apparaîtra dans vos anciens plans Premium
            </Text>
            <FloatingInput
              placeholder="Ex: Voyage Premium à Tunis"
              value={planName}
              onChangeText={setPlanName}
              icon="✈"
            />
            <View
              style={{
                backgroundColor: BLUE_ULTRA_PALE,
                borderRadius: 10,
                padding: 10,
                marginBottom: 12,
                width: "100%",
                borderWidth: 1,
                borderColor: BLUE_PALE,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: BLUE_DEEP,
                  fontWeight: "700",
                  marginBottom: 4,
                }}
              >
                📊 Résumé financier
              </Text>
              <Text
                style={{ fontSize: 13, color: BLUE_PRIMARY, fontWeight: "800" }}
              >
                Budget total : {globalTotal} TND
              </Text>
              <Text style={{ fontSize: 11, color: TEXT_MUTED }}>
                ≈ {(globalTotal * 0.29).toFixed(0)} EUR · {itinerary.length}{" "}
                jour{itinerary.length > 1 ? "s" : ""}
              </Text>
            </View>
            {saveError && (
              <View
                style={{
                  backgroundColor: "#FEE2E2",
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 10,
                  width: "100%",
                  borderWidth: 1,
                  borderColor: "#FECACA",
                }}
              >
                <Text style={{ fontSize: 12, color: RED }}>⚠️ {saveError}</Text>
              </View>
            )}
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => {
                  setNameModalVisible(false);
                  setPlanName("");
                }}
                disabled={isSaving}
              >
                <Text style={styles.modalBtnCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={handleSaveNamedPlan}
                disabled={isSaving}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={
                    isSaving ? ["#7AA3E6", "#7AA3E6"] : ["#0A4DBF", "#1a6aff"]
                  }
                  style={styles.modalBtnSave}
                >
                  {isSaving ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <ActivityIndicator size="small" color={WHITE} />
                      <Text style={styles.modalBtnSaveText}>
                        Enregistrement…
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.modalBtnSaveText}>Sauvegarder</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal confirmation sauvegarde */}
      <Modal visible={showNotifModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={[styles.modalAccent, { backgroundColor: "#16A34A" }]}>
              <Text style={{ fontSize: 22, color: WHITE }}>✓</Text>
            </View>
            <Text style={styles.modalTitle}>Plan sauvegardé !</Text>
            <Text style={styles.modalSub}>
              Votre itinéraire a été enregistré avec succès.
            </Text>
            {planCode && (
              <View style={nmSt.planCodeBox}>
                <Text style={nmSt.planCodeLabel}>CODE DU PLAN</Text>
                <Text style={nmSt.planCodeValue}>{planCode}</Text>
                <Text style={nmSt.planCodeHint}>
                  Partagez ce code avec vos invités.
                </Text>
              </View>
            )}
            {notifResult && Object.keys(notifResult).length > 0 && (
              <View style={nmSt.notifBox}>
                <Text style={nmSt.notifTitle}>📧 Notifications envoyées</Text>
                {Object.entries(notifResult).map(([email, status]) => (
                  <View key={email} style={nmSt.notifRow}>
                    <Text style={nmSt.notifEmail} numberOfLines={1}>
                      {email}
                    </Text>
                    <View
                      style={[
                        nmSt.statusBadge,
                        {
                          backgroundColor:
                            status === "envoyé" ? "#D4F5E9" : "#FEE2E2",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          nmSt.statusTxt,
                          { color: status === "envoyé" ? GREEN : RED },
                        ]}
                      >
                        {status === "envoyé" ? "✓ Envoyé" : "✗ Échec"}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => {
                  setShowNotifModal(false);
                  router.push("/ancienplan");
                }}
              >
                <Text style={styles.modalBtnCancelText}>Mes plans</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => setShowNotifModal(false)}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={["#0A4DBF", "#1a6aff"]}
                  style={styles.modalBtnSave}
                >
                  <Text style={styles.modalBtnSaveText}>Continuer</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal reçu de paiement */}
      <Modal visible={showReceipt} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingBottom: 20 }]}>
            <View style={[styles.modalAccent, { backgroundColor: "#2ecc71" }]}>
              <Text style={{ fontSize: 22, color: "white" }}>✓</Text>
            </View>
            <Text style={styles.modalTitle}>Reçu de Paiement</Text>
            <View
              style={{
                width: "100%",
                marginVertical: 15,
                borderStyle: "dashed",
                borderBottomWidth: 1,
                borderColor: "#ddd",
              }}
            />
            <View style={{ width: "100%", gap: 10 }}>
              {[
                { label: "ID Transaction", value: `#${receiptDetails?.id}` },
                { label: "Titulaire", value: receiptDetails?.name },
                {
                  label: "Carte",
                  value: `**** **** **** ${cardDigits.slice(-4)}`,
                },
                { label: "Date", value: receiptDetails?.date },
              ].map((row) => (
                <View
                  key={row.label}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: TEXT_MUTED }}>{row.label} :</Text>
                  <Text style={{ fontWeight: "bold" }}>{row.value}</Text>
                </View>
              ))}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginTop: 10,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "bold" }}>
                  Montant :
                </Text>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "bold",
                    color: BLUE_PRIMARY,
                  }}
                >
                  {receiptDetails?.amount}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[
                styles.modalBtnSave,
                { width: "100%", marginTop: 25, backgroundColor: BLUE_PRIMARY },
              ]}
              onPress={() => setShowReceipt(false)}
            >
              <Text style={{ color: "white", fontWeight: "bold" }}>
                Fermer & Voir mon Plan
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <RefaireModal
        visible={showRefaire}
        onClose={() => setShowRefaire(false)}
        onConfirm={handleRefaire}
      />
    </ScrollView>
  );
}

// ─── STYLES FINAUX ────────────────────────────────────────────
const nmSt = StyleSheet.create({
  planCodeBox: {
    width: "100%",
    backgroundColor: "#FEF9C3",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FDE047",
    marginBottom: 14,
    gap: 4,
  },
  planCodeLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "rgba(61,34,0,0.6)",
    letterSpacing: 2,
  },
  planCodeValue: {
    fontSize: 30,
    fontWeight: "900",
    color: "#3D2200",
    letterSpacing: 8,
  },
  planCodeHint: {
    fontSize: 11,
    color: "#78350F",
    textAlign: "center",
    lineHeight: 16,
    marginTop: 4,
  },
  notifBox: {
    width: "100%",
    backgroundColor: "#F0F5FC",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: BLUE_PALE,
    marginBottom: 14,
    gap: 8,
  },
  notifTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: BLUE_DEEP,
    marginBottom: 4,
  },
  notifRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  notifEmail: { flex: 1, fontSize: 12, color: TEXT_MUTED },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusTxt: { fontSize: 11, fontWeight: "700" },
});

const styles = StyleSheet.create({
  container: { backgroundColor: "#F0F5FC", paddingBottom: 60 },
  hero: {
    padding: 28,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 32,
    position: "relative",
    overflow: "hidden",
  },
  menuWrapper: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    right: 15,
    zIndex: 9999,
  },
  circle1: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(255,255,255,0.04)",
    top: -80,
    right: -60,
  },
  circle2: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.04)",
    bottom: -40,
    left: -40,
  },
  goldBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(200,155,60,0.2)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(200,155,60,0.4)",
    marginBottom: 14,
  },
  goldBadgeText: {
    color: GOLD,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: WHITE,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif" }),
    lineHeight: 36,
  },
  heroTitleAccent: {
    fontSize: 32,
    fontWeight: "800",
    color: GOLD,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif" }),
    marginBottom: 8,
  },
  heroSub: { fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 18 },
  heroPriceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  heroPriceLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    fontWeight: "600",
  },
  heroPrice: { fontSize: 22, fontWeight: "800", color: GOLD },
  heroPriceSub: { fontSize: 13, color: "rgba(255,255,255,0.45)" },
  content: { padding: 16, gap: 14 },
  card: {
    backgroundColor: WHITE,
    borderRadius: 20,
    padding: 18,
    shadowColor: BLUE_PRIMARY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 5,
    borderWidth: 1,
    borderColor: "rgba(10,77,191,0.06)",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: BLUE_DEEP,
    marginBottom: 14,
  },
  servicesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  serviceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: BLUE_PALE,
  },
  serviceChipIcon: { fontSize: 14 },
  serviceChipText: { fontSize: 12, fontWeight: "700", color: BLUE_DEEP },
  lockedCard: {
    backgroundColor: WHITE,
    borderRadius: 20,
    padding: 18,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: BLUE_PALE,
  },
  lockedOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  lockIcon: { fontSize: 36, marginBottom: 8 },
  lockedTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: BLUE_DEEP,
    textAlign: "center",
    marginBottom: 6,
  },
  lockedSub: {
    fontSize: 13,
    color: TEXT_MUTED,
    textAlign: "center",
    lineHeight: 18,
  },
  lockedFakeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BLUE_ULTRA_PALE,
  },
  lockedFakeIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#E8EEF8",
  },
  lockedFakeLine: { height: 10, borderRadius: 6, backgroundColor: "#E0E8F5" },
  unlockBtn: {
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    elevation: 8,
  },
  unlockBtnIcon: { fontSize: 26 },
  unlockBtnTitle: { fontSize: 16, fontWeight: "800", color: "#3D2200" },
  unlockBtnSub: { fontSize: 12, color: "rgba(61,34,0,0.6)", marginTop: 2 },
  unlockBtnArrow: { fontSize: 20, color: "rgba(61,34,0,0.5)" },
  secureFooter: {
    fontSize: 12,
    color: TEXT_MUTED,
    textAlign: "center",
    marginTop: -4,
  },
  actionsRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  actionBtnGrad: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  actionBtnGradText: { color: WHITE, fontWeight: "700", fontSize: 14 },
  actionBtnRefaire: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FFF0F0",
    borderWidth: 1.5,
    borderColor: "#FFCCCC",
  },
  actionBtnRefaireIcon: { fontSize: 16, color: "#E05555", fontWeight: "800" },
  actionBtnRefaireTxt: { color: "#E05555", fontWeight: "700", fontSize: 14 },
  actionBtnModifier: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#EEF4FF",
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
  },
  actionBtnModifierIcon: {
    fontSize: 14,
    color: BLUE_PRIMARY,
    fontWeight: "800",
  },
  actionBtnModifierTxt: {
    color: BLUE_PRIMARY,
    fontWeight: "700",
    fontSize: 14,
  },
  actionBtnModifierActive: {
    backgroundColor: BLUE_PALE,
    borderColor: BLUE_PRIMARY,
  },
  dayCard: {
    backgroundColor: WHITE,
    borderRadius: 18,
    overflow: "hidden",
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(10,77,191,0.06)",
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dayHeaderText: { fontSize: 15, fontWeight: "800", color: WHITE },
  goldBadgeSmall: {
    backgroundColor: "rgba(200,155,60,0.25)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(200,155,60,0.4)",
  },
  goldBadgeSmallText: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  dayBody: { padding: 14, gap: 0 },
  confirmedBox: {
    backgroundColor: WHITE,
    borderRadius: 18,
    padding: 22,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
    marginTop: 8,
    elevation: 5,
  },
  confirmedIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: BLUE_PRIMARY,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  confirmedTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: BLUE_DEEP,
    marginBottom: 4,
  },
  confirmedSub: { fontSize: 13, color: TEXT_MUTED, textAlign: "center" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2,27,78,0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 26,
    paddingBottom: 40,
    alignItems: "center",
    elevation: 20,
  },
  modalAccent: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginTop: -52,
    marginBottom: 16,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: BLUE_DEEP,
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 13,
    color: TEXT_MUTED,
    textAlign: "center",
    marginBottom: 18,
  },
  modalBtns: { flexDirection: "row", gap: 12, width: "100%", marginBottom: 8 },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#FFF0F0",
    borderWidth: 1.5,
    borderColor: "#FFCCCC",
  },
  modalBtnCancelText: { color: "#E05555", fontWeight: "700", fontSize: 14 },
  modalBtnSave: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  modalBtnSaveText: { color: WHITE, fontWeight: "800", fontSize: 15 },
});

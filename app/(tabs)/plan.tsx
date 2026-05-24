import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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

import {
  applyPreferredCafeToItinerary,
  applyPreferredHotelToItinerary,
  findByPreferredName,
  generateFallbackPlan,
  normalizeStr,
  prioritizeByName,
  resolveMajorityDates,
  resolveMajorityDestination,
  runAgenticRagPipeline,
  type Activity,
  type Cafe,
  type CityData,
  type DayPlan,
  type GroupPref,
  type Hotel,
  type RagStep,
  type ResolvedDates,
} from "../../service/geminiRagService";

import activitesData from "../../data/activites.json";
import cafesData from "../../data/cafee.json";
import hotelsData from "../../data/hotels.json";
import transportData from "../../data/transport.json";

// ─── Config ───────────────────────────────────────────────────────────────────
const API_BASE = "http://192.168.1.8:5000";

// ─── Couleurs ─────────────────────────────────────────────────────────────────
const BLUE_DEEP = "#042A66";
const BLUE_PRIMARY = "#0A4DBF";
const BLUE_PALE = "#D6E4FF";
const BLUE_ULTRA_PALE = "#EEF4FF";
const WHITE = "#FFFFFF";
const TEXT_MUTED = "#7A90B4";
const GEMINI_COLOR = "#1A73E8";
const GEMINI_PALE = "#E8F0FE";
const GREEN = "#1B8A5A";
const GREEN_PALE = "#D4F5E9";
const PURPLE = "#7C3AED";
const LOCAL_ACT_BG = "#F5F3FF";
const LOCAL_ACT_BORDER = "#7C3AED";
const LOCAL_ACT_TEXT = "#4C1D95";
const LOCAL_ACT_HINT = "#6D28D9";
const LOCAL_PRIX_BG = "#EDE9FE";
const LOCAL_PRIX_BORDER = "#C4B5FD";
const LOCAL_PRIX_TEXT = "#5B21B6";
const EXCURSION_COLOR = "#0891B2";

// ─── Helpers carte ────────────────────────────────────────────────────────────
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

const MapPinButton = ({
  name,
  zone,
  color = "#0369A1",
  bgColor = "#E0F2FE",
  borderColor = "#BAE6FD",
}: {
  name: string;
  zone?: string;
  color?: string;
  bgColor?: string;
  borderColor?: string;
}) => (
  <TouchableOpacity
    onPress={() => openMapForPlace(name, zone)}
    activeOpacity={0.75}
    style={[mapSt.btn, { backgroundColor: bgColor, borderColor }]}
  >
    <Text style={mapSt.pin}>📍</Text>
    <Text style={[mapSt.label, { color }]} numberOfLines={1}>
      {name}
    </Text>
    <Text style={[mapSt.arrow, { color }]}>Voir sur Maps →</Text>
  </TouchableOpacity>
);
const mapSt = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    marginTop: 8,
  },
  pin: { fontSize: 14 },
  label: { flex: 1, fontSize: 12, fontWeight: "600" },
  arrow: { fontSize: 11, fontWeight: "700" },
});

// ─── Excursion ────────────────────────────────────────────────────────────────
const EXCURSION_KEYWORDS = [
  "oui",
  "excursion",
  "aventure",
  "decouverte",
  "explorer",
  "découverte",
];
const EXCURSION_CITIES: Record<string, string> = {
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

function isExcursionRequested(voyageType: string | null | undefined): boolean {
  if (!voyageType) return false;
  const t = normalizeStr(voyageType);
  return EXCURSION_KEYWORDS.some((kw) => t.includes(kw));
}

function getExcursionCity(destination: string): string | null {
  const key = normalizeStr(destination);
  for (const [k, nearby] of Object.entries(EXCURSION_CITIES)) {
    if (key.includes(normalizeStr(k)) || normalizeStr(k).includes(key))
      return nearby;
  }
  return null;
}

// ─── Helpers normalisation ────────────────────────────────────────────────────
function normalizeActivity(entry: unknown): Activity {
  if (typeof entry === "string")
    return { name: entry, prix: "Variable", description: "" };
  if (!entry || typeof entry !== "object")
    return { name: String(entry ?? ""), prix: "Variable", description: "" };
  const e = entry as Record<string, unknown>;
  const name = String(
    e.name ??
      e["Activité"] ??
      e.Activité ??
      e.Activite ??
      e.activité ??
      e.activite ??
      e.ACTIVITE ??
      e.Nom ??
      "",
  );
  const prix = String(
    e.prix ??
      e["Prix_estimé"] ??
      e.Prix_estimé ??
      e.Prix_estime ??
      e.prix_estimé ??
      e.prix_estime ??
      e.Prix ??
      e.PRIX ??
      "Variable",
  );
  const description = String(
    e.description ?? e.Description ?? e.DESCRIPTION ?? "",
  );
  return { name, prix, description };
}

function normalizeCafe(entry: unknown): Cafe {
  if (!entry || typeof entry !== "object")
    return { name: String(entry ?? ""), prix: "Variable", zone: "" };
  const e = entry as Record<string, unknown>;
  return {
    name: String(e.name ?? e.Nom ?? e.nom ?? e.NOM ?? ""),
    prix: String(e.prix ?? e.Prix ?? e.PRIX ?? "Variable"),
    zone: String(e.zone ?? e.Zone ?? e.ZONE ?? ""),
  };
}

function extractTransport(entry: unknown): {
  transport: string;
  meteo: string;
} {
  const fallback = {
    transport: "Taxis et louages disponibles.",
    meteo: "Printemps et automne agréables en Tunisie.",
  };
  if (!entry) return fallback;
  if (typeof entry === "string")
    return { transport: entry, meteo: fallback.meteo };
  if (typeof entry !== "object") return fallback;
  const e = entry as Record<string, unknown>;
  if (e.moyens || e.conseils) {
    const moyens = Array.isArray(e.moyens)
      ? (e.moyens as string[]).join(", ")
      : String(e.moyens || "");
    const conseils = String(e.conseils || "");
    const prixRaw = e.prix_moyens as Record<string, string> | undefined;
    const prix = prixRaw
      ? Object.entries(prixRaw)
          .map(([k, v]) => `${k} : ${v}`)
          .join(" | ")
      : "";
    let transport = moyens;
    if (conseils) transport += `. ${conseils}`;
    if (prix) transport += ` Prix indicatifs — ${prix}.`;
    return {
      transport: transport.trim() || fallback.transport,
      meteo: String(e.meteo || fallback.meteo),
    };
  }
  if (e.transport)
    return {
      transport: String(e.transport),
      meteo: String(e.meteo || fallback.meteo),
    };
  return fallback;
}

function getCityTipsLocal(ville: string): { transport: string; meteo: string } {
  const data = transportData as Record<string, unknown>;
  const key = normalizeStr(ville);
  if (data[ville]) return extractTransport(data[ville]);
  for (const k of Object.keys(data))
    if (normalizeStr(k) === key) return extractTransport(data[k]);
  for (const k of Object.keys(data)) {
    const kn = normalizeStr(k);
    if (kn.includes(key) || key.includes(kn)) return extractTransport(data[k]);
  }
  return {
    transport: "Taxis et louages disponibles.",
    meteo: "Printemps et automne agréables en Tunisie.",
  };
}

function getCafesForVille(ville: string): Cafe[] {
  const data = cafesData as Record<string, unknown[]>;
  const key = normalizeStr(ville);
  if (data[ville]?.length > 0) return data[ville].map(normalizeCafe);
  for (const k of Object.keys(data))
    if (normalizeStr(k) === key && data[k].length > 0)
      return data[k].map(normalizeCafe);
  for (const k of Object.keys(data)) {
    const kn = normalizeStr(k);
    if ((kn.includes(key) || key.includes(kn)) && data[k].length > 0)
      return data[k].map(normalizeCafe);
  }
  return [];
}

// ─── Excursion builder ────────────────────────────────────────────────────────
function buildExcursionDay(params: {
  mainDestination: string;
  excursionCity: string;
  dayIndex: number;
}): DayPlan {
  const { mainDestination, excursionCity, dayIndex } = params;
  const hData = hotelsData as Record<string, unknown[]>;
  const cData = cafesData as Record<string, unknown[]>;
  const aData = activitesData as Record<string, unknown[]>;
  const tData = transportData as Record<string, unknown>;

  const hotelsRaw =
    hData[excursionCity] || hData[excursionCity.toLowerCase()] || [];
  const cafesRaw =
    cData[excursionCity] || cData[excursionCity.toLowerCase()] || [];
  const actsRaw =
    aData[excursionCity] || aData[excursionCity.toLowerCase()] || [];
  const transportRaw =
    tData[excursionCity] || tData[excursionCity.toLowerCase()] || null;

  const hotel: Hotel = (hotelsRaw[0] as Hotel) || {
    name: `Hôtel de ${excursionCity}`,
    stars: "⭐⭐⭐",
    description: `Hébergement confortable à ${excursionCity}.`,
  };
  const allCafes =
    cafesRaw.length > 0 ? cafesRaw.map(normalizeCafe) : FALLBACK_CAFES;
  const cafe: Cafe | null = allCafes[0] || null;
  const acts: Activity[] = Array.isArray(actsRaw)
    ? actsRaw.map(normalizeActivity)
    : [];
  const mainAct: Activity = acts[0] || {
    name: `Découverte de ${excursionCity}`,
    prix: "Gratuit",
    description: "",
  };
  const localAct: Activity =
    acts.length > 1
      ? acts[1]
      : {
          name: `Balade dans la médina de ${excursionCity}`,
          prix: "Gratuit",
          description: "",
        };

  let transportStr = `Depuis ${mainDestination} : louage ou taxi vers ${excursionCity} (~1h, ~15–25 TND). `;
  if (transportRaw) {
    const tr = transportRaw as Record<string, unknown>;
    if (typeof transportRaw === "string") transportStr += transportRaw;
    else if (tr.moyens) {
      const moyens = Array.isArray(tr.moyens)
        ? (tr.moyens as string[]).join(", ")
        : String(tr.moyens);
      transportStr += `Sur place : ${moyens}`;
    } else if (tr.transport) {
      transportStr += `Sur place : ${String(tr.transport)}`;
    }
  } else {
    transportStr += "Sur place : taxis et calèches disponibles.";
  }

  const activityText =
    `Excursion à ${excursionCity} — ${mainAct.name}` +
    (mainAct.description ? ` : ${mainAct.description}` : "") +
    (mainAct.prix && mainAct.prix !== "Variable" ? ` (${mainAct.prix})` : "");

  const tr = transportRaw as Record<string, unknown> | null;
  return {
    title: `Jour ${dayIndex + 1} — Excursion à ${excursionCity}`,
    ville: excursionCity,
    hotel,
    cafe,
    activity: activityText,
    localActivity: localAct,
    conseil: `Partez tôt depuis ${mainDestination} pour profiter pleinement de ${excursionCity}. Retour en soirée.`,
    transport: transportStr,
    meteo: String(tr?.meteo || `Même climat qu'à ${mainDestination}.`),
    activitiesSource: "json",
    isExcursion: true,
    excursionCity,
    mainDestination,
  };
}

function injectExcursionIntoItinerary(
  itinerary: DayPlan[],
  mainDestination: string,
  excursionCity: string,
): DayPlan[] {
  if (!itinerary.length) return itinerary;
  const insertAt = Math.max(1, Math.floor(itinerary.length / 2));
  const excursionDay = buildExcursionDay({
    mainDestination,
    excursionCity,
    dayIndex: insertAt,
  });
  const result = [
    ...itinerary.slice(0, insertAt),
    excursionDay,
    ...itinerary.slice(insertAt),
  ];
  return result.map((d, idx) => {
    const base = d.isExcursion
      ? `Jour ${idx + 1} — Excursion à ${d.excursionCity}`
      : `Jour ${idx + 1}`;
    const titleWithoutNum =
      d.title?.replace(/^Jour\s+\d+/, `Jour ${idx + 1}`) || base;
    return { ...d, title: titleWithoutNum };
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────
type SavedPlan = {
  id: string;
  nom: string;
  destination: string;
  dateDebut: string;
  dateFin: string;
  duree: number;
  dateCreation: string;
  statut: "à venir" | "en cours" | "terminé";
  nombreVoyageurs: number;
  listeActivites: string[];
  hotels: string[];
  itinerary: DayPlan[];
  type: "gratuit" | "premium";
  aiModel?: "gemini" | "fallback";
  inviteCode: string;
  guestPrefs?: GuestPrefs[];
  leaderPrefs?: GuestPrefs | null;
  sharedByLeader?: boolean;
};

type GuestPrefs = {
  role: string;
  email: string;
  full_name: string | null;
  hotel_type: string | null;
  hotel_location: string | null;
  activity_types: string | null;
  cafe_levels: string | null;
  voyage_type: string | null;
  budget: string | null;
  hotel_name: string | null;
  cafe_name: string | null;
  tranche_age: string | null;
  destination: string | null;
  date_depart: string | null;
  date_arrivee: string | null;
  phone?: string | null;
};

type ReplanChoices = {
  hotel: boolean;
  cafe: boolean;
  loisir: boolean;
  activite: boolean;
};

const FALLBACK_HOTELS: Hotel[] = [
  {
    name: "Hôtel Central",
    stars: "⭐⭐⭐",
    description: "Hôtel confortable en centre-ville.",
  },
  {
    name: "Résidence du Lac",
    stars: "⭐⭐⭐⭐",
    description: "Résidence moderne et bien équipée.",
  },
];
const FALLBACK_CAFES: Cafe[] = [
  { name: "Café du Quartier", prix: "3–10 TND", zone: "Centre" },
  { name: "Café du Marché", prix: "3–8 TND", zone: "Médina" },
];

function computeMajorityPrefs(prefsList: GuestPrefs[]): Partial<GuestPrefs> {
  if (!prefsList.length) return {};
  function count<T>(arr: (T | null | undefined)[]): T | null {
    const freq: Record<string, number> = {};
    for (const val of arr) {
      if (val != null) freq[String(val)] = (freq[String(val)] || 0) + 1;
    }
    let maxKey: string | null = null;
    let maxCount = 0;
    for (const [k, v] of Object.entries(freq)) {
      if (v > maxCount) {
        maxCount = v;
        maxKey = k;
      }
    }
    return maxKey as T | null;
  }
  return {
    hotel_type: count(prefsList.map((p) => p.hotel_type)),
    hotel_location: count(prefsList.map((p) => p.hotel_location)),
    activity_types: count(prefsList.map((p) => p.activity_types)),
    cafe_levels: count(prefsList.map((p) => p.cafe_levels)),
    voyage_type: count(prefsList.map((p) => p.voyage_type)),
    budget: count(prefsList.map((p) => p.budget)),
    hotel_name: count(prefsList.map((p) => p.hotel_name)),
    cafe_name: count(prefsList.map((p) => p.cafe_name)),
    tranche_age: count(prefsList.map((p) => p.tranche_age)),
    destination: count(prefsList.map((p) => p.destination)),
  };
}

function normalizeCode(c: string | null | undefined) {
  return c?.trim().toUpperCase() || "";
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("fr-FR");
  } catch {
    return d || "—";
  }
}

// ─── Sous-composants ──────────────────────────────────────────────────────────
const PrefCard = ({ pref }: { pref: GuestPrefs; index: number }) => (
  <View style={[ps.guestPrefCard, { marginBottom: 10 }]}>
    <View style={ps.prefHeaderRow}>
      <Text style={ps.guestPrefAvatar}>
        {pref.role === "leader" ? "👑" : "👤"}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={ps.guestPrefName}>{pref.full_name || pref.email}</Text>
        {pref.full_name && <Text style={ps.guestPrefEmail}>{pref.email}</Text>}
      </View>
      <View
        style={[
          ps.roleBadge,
          { backgroundColor: pref.role === "leader" ? BLUE_PALE : GREEN_PALE },
        ]}
      >
        <Text
          style={[
            ps.roleBadgeText,
            { color: pref.role === "leader" ? BLUE_PRIMARY : GREEN },
          ]}
        >
          {pref.role === "leader" ? "👑 Leader" : "👤 Invité"}
        </Text>
      </View>
    </View>
    <View style={ps.prefTagsRow}>
      {pref.hotel_type && (
        <View style={ps.prefTag}>
          <Text style={ps.prefTagText}>🏨 {pref.hotel_type}</Text>
        </View>
      )}
      {pref.activity_types && (
        <View style={ps.prefTag}>
          <Text style={ps.prefTagText}>🎯 {pref.activity_types}</Text>
        </View>
      )}
      {pref.voyage_type && (
        <View style={ps.prefTag}>
          <Text style={ps.prefTagText}>✈️ {pref.voyage_type}</Text>
        </View>
      )}
      {pref.budget && (
        <View style={[ps.prefTag, { backgroundColor: "#FEF9C3" }]}>
          <Text style={[ps.prefTagText, { color: "#854D0E" }]}>
            💰 {pref.budget} TND
          </Text>
        </View>
      )}
      {pref.hotel_name && (
        <View
          style={[
            ps.prefTag,
            {
              backgroundColor: "#FFF0F0",
              borderWidth: 1,
              borderColor: "#FFCCCC",
            },
          ]}
        >
          <Text
            style={[ps.prefTagText, { color: "#B91C1C", fontWeight: "700" }]}
          >
            🏠 ★ {pref.hotel_name}
          </Text>
        </View>
      )}
      {pref.cafe_name && (
        <View
          style={[
            ps.prefTag,
            {
              backgroundColor: "#FFF8E8",
              borderWidth: 1,
              borderColor: "#FDE68A",
            },
          ]}
        >
          <Text
            style={[ps.prefTagText, { color: "#92400E", fontWeight: "700" }]}
          >
            🫖 ★ {pref.cafe_name}
          </Text>
        </View>
      )}
    </View>
  </View>
);

const ResolutionBanner = ({
  resolvedDestination,
  resolvedDates,
  totalParticipants,
}: {
  resolvedDestination: string;
  resolvedDates: ResolvedDates | null;
  totalParticipants: number;
}) => {
  const [expanded, setExpanded] = useState(false);
  const hasConflict =
    resolvedDates?.conflictInfo &&
    resolvedDates.conflictInfo !== "Dates cohérentes";
  return (
    <View style={rb.container}>
      <TouchableOpacity
        style={rb.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.8}
      >
        <View style={rb.iconWrap}>
          <Text style={rb.icon}>{hasConflict ? "⚖️" : "✓"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={rb.title}>
            Résolution par majorité · {totalParticipants} participant
            {totalParticipants > 1 ? "s" : ""}
          </Text>
          <Text style={rb.sub} numberOfLines={1}>
            📍 {resolvedDestination}
            {resolvedDates?.dateDebut
              ? ` · ${resolvedDates.dateDebut.toLocaleDateString("fr-FR")}`
              : ""}
            {resolvedDates?.dateFin
              ? ` → ${resolvedDates.dateFin.toLocaleDateString("fr-FR")}`
              : ""}
          </Text>
        </View>
        <Text style={rb.chevron}>{expanded ? "▲" : "▼"}</Text>
      </TouchableOpacity>
      {expanded && (
        <View style={rb.body}>
          <View style={rb.row}>
            <Text style={rb.label}>📍 Destination</Text>
            <Text style={rb.value}>{resolvedDestination}</Text>
          </View>
          {resolvedDates?.numDays && (
            <View style={rb.row}>
              <Text style={rb.label}>📅 Durée</Text>
              <Text style={rb.value}>
                {resolvedDates.numDays} jour
                {resolvedDates.numDays > 1 ? "s" : ""}
              </Text>
            </View>
          )}
          {hasConflict && (
            <View style={rb.conflictBox}>
              <Text style={rb.conflictTitle}>⚠️ Conflits :</Text>
              <Text style={rb.conflictTxt}>{resolvedDates?.conflictInfo}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const RagPipelineTrace = ({
  steps,
  model,
}: {
  steps: RagStep[];
  model: "gemini" | "fallback";
}) => {
  const [expanded, setExpanded] = useState(false);
  const stepColors: Record<RagStep["stepName"], string> = {
    RETRIEVE: "#0891B2",
    REASON: "#7C3AED",
    PLAN: "#D97706",
    GENERATE: "#059669",
  };
  const stepEmojis: Record<RagStep["stepName"], string> = {
    RETRIEVE: "🔍",
    REASON: "🧠",
    PLAN: "📋",
    GENERATE: "✨",
  };
  return (
    <View style={rt.container}>
      <TouchableOpacity
        style={rt.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={rt.headerLeft}>
          <View
            style={[
              rt.modelBadge,
              model === "gemini" ? rt.geminiBadge : rt.fallbackBadge,
            ]}
          >
            <Text style={rt.modelBadgeTxt}>
              {model === "gemini" ? "✦ Gemini RAG" : "⚠ Fallback"}
            </Text>
          </View>
          <Text style={rt.headerTitle}>Pipeline IA</Text>
        </View>
        <View style={rt.stepsRow}>
          {steps.map((s, i) => (
            <View
              key={i}
              style={[rt.dot, { backgroundColor: stepColors[s.stepName] }]}
            />
          ))}
          <Text style={rt.chevron}>{expanded ? "▲" : "▼"}</Text>
        </View>
      </TouchableOpacity>
      {expanded && (
        <View style={rt.stepsContainer}>
          {steps.map((step, idx) => (
            <View key={idx} style={rt.stepRow}>
              <View
                style={[
                  rt.stepIcon,
                  { backgroundColor: `${stepColors[step.stepName]}22` },
                ]}
              >
                <Text style={rt.stepEmoji}>{stepEmojis[step.stepName]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={rt.stepTopRow}>
                  <Text
                    style={[rt.stepName, { color: stepColors[step.stepName] }]}
                  >
                    {step.stepName}
                  </Text>
                  {step.durationMs !== undefined && step.durationMs > 0 && (
                    <Text style={rt.stepMs}>{step.durationMs}ms</Text>
                  )}
                  <View
                    style={[
                      rt.confBadge,
                      {
                        backgroundColor:
                          step.confidence >= 0.9 ? "#D1FAE5" : "#FEF3C7",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        rt.confTxt,
                        {
                          color: step.confidence >= 0.9 ? "#065F46" : "#92400E",
                        },
                      ]}
                    >
                      {Math.round(step.confidence * 100)}%
                    </Text>
                  </View>
                </View>
                <Text style={rt.stepAction}>{step.action}</Text>
                <Text style={rt.stepResult} numberOfLines={3}>
                  {step.result}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const AppMenu = ({ inviteCode }: { inviteCode: string | null }) => {
  const [open, setOpen] = useState(false);
  const ITEMS = [
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
    <View>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={mStyles.trigger}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name="dots-vertical" size={28} color={WHITE} />
      </TouchableOpacity>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          style={mStyles.backdrop}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View style={mStyles.dropdown}>
            <View style={mStyles.header}>
              <MaterialCommunityIcons
                name="cog-outline"
                size={14}
                color="#4A6080"
              />
              <Text style={mStyles.headerTxt}>OPTIONS</Text>
            </View>
            {ITEMS.map((item, idx) => (
              <React.Fragment key={item.label}>
                {idx === ITEMS.length - 1 && <View style={mStyles.sep} />}
                <TouchableOpacity
                  style={mStyles.item}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      mStyles.icon,
                      { backgroundColor: `${item.color}22` },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={item.icon}
                      size={20}
                      color={item.color}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        mStyles.label,
                        (item as { danger?: boolean }).danger && {
                          color: "#EF4444",
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                    <Text style={mStyles.sub}>{item.sub}</Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={16}
                    color="#4A6080"
                  />
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function PlanScreen() {
  const { travelData, setTravelData } = useTravelData();
  const params = useLocalSearchParams<{
    groupPrefsJson?: string;
    leaderPrefsJson?: string;
    inviteCode?: string;
    planNom?: string;
    villes?: string;
  }>();

  const [itinerary, setItinerary] = useState<DayPlan[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [aiAdvice, setAiAdvice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [isModifying, setIsModifying] = useState(false);
  const [hasModifications, setHasModifications] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [planName, setPlanName] = useState(params.planNom || "");
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingDay, setEditingDay] = useState<{ index: number } | null>(null);
  const [newActivity, setNewActivity] = useState("");

  // ── Saving state ──────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [planCode, setPlanCode] = useState<string | null>(null);
  const [notifResult, setNotifResult] = useState<Record<string, string> | null>(
    null,
  );
  const [showNotifModal, setShowNotifModal] = useState(false);

  const [replanModalVisible, setReplanModalVisible] = useState(false);
  const [replanChoices, setReplanChoices] = useState<ReplanChoices>({
    hotel: false,
    cafe: false,
    loisir: false,
    activite: false,
  });
  const [replanLoading, setReplanLoading] = useState(false);

  const [ragSteps, setRagSteps] = useState<RagStep[]>([]);
  const [ragModel, setRagModel] = useState<"gemini" | "fallback">("gemini");
  const [currentRagStep, setCurrentRagStep] = useState<string>("");

  const [resolvedDestination, setResolvedDestination] = useState<string>("");
  const [resolvedDates, setResolvedDates] = useState<ResolvedDates | null>(
    null,
  );
  const [cityDataMap, setCityDataMap] = useState<Record<string, CityData>>({});
  const [loadingPrefs, setLoadingPrefs] = useState(false);
  const [leaderPrefData, setLeaderPrefData] = useState<GuestPrefs | null>(null);
  const [guestPrefsData, setGuestPrefsData] = useState<GuestPrefs[]>([]);
  const [resolvedHotelName, setResolvedHotelName] = useState<string | null>(
    null,
  );
  const [resolvedCafeName, setResolvedCafeName] = useState<string | null>(null);

  const villesParam: string[] = params.villes
    ? (() => {
        try {
          return JSON.parse(params.villes!);
        } catch {
          return [];
        }
      })()
    : [];
  const mainVille = travelData.ville || "Tunis";
  const isMultiCity = villesParam.length > 1;
  const [villes, setVilles] = useState<string[]>(
    isMultiCity ? villesParam : [mainVille],
  );

  const paramGroupPrefs: GroupPref[] = params.groupPrefsJson
    ? (() => {
        try {
          return JSON.parse(params.groupPrefsJson!);
        } catch {
          return [];
        }
      })()
    : [];
  const paramLeaderPrefs: GroupPref | null = params.leaderPrefsJson
    ? (() => {
        try {
          return JSON.parse(params.leaderPrefsJson!);
        } catch {
          return null;
        }
      })()
    : null;

  const [groupPrefs, setGroupPrefs] = useState<GroupPref[]>(paramGroupPrefs);
  const [leaderPrefs, setLeaderPrefs] = useState<GroupPref | null>(
    paramLeaderPrefs,
  );
  const inviteCode = params.inviteCode || null;
  const isGroupMode = groupPrefs.length > 0 || leaderPrefs !== null;

  const [invitationStart, setInvitationStart] = useState<Date | null>(null);
  const [invitationEnd, setInvitationEnd] = useState<Date | null>(null);

  // ── Résolution majorité dates/destination ─────────────────────────────────
  useEffect(() => {
    const allPrefs = [...(leaderPrefs ? [leaderPrefs] : []), ...groupPrefs];
    if (!allPrefs.length) return;
    const dest = resolveMajorityDestination(allPrefs, villes[0] || mainVille);
    setResolvedDestination(dest);
    const dates = resolveMajorityDates(
      allPrefs,
      leaderPrefs,
      travelData.dateDebut ?? null,
      travelData.dateFin ?? null,
    );
    setResolvedDates(dates);
    if (dates.dateDebut && !travelData.dateDebut)
      setTravelData({ dateDebut: dates.dateDebut });
    if (dates.dateFin && !travelData.dateFin)
      setTravelData({ dateFin: dates.dateFin });
    const leaderHotelName = (leaderPrefs as GuestPrefs)?.hotel_name || null;
    const leaderCafeName = (leaderPrefs as GuestPrefs)?.cafe_name || null;
    const allHotelNames = allPrefs
      .map((p) => (p as GuestPrefs).hotel_name)
      .filter(Boolean) as string[];
    const allCafeNames = allPrefs
      .map((p) => (p as GuestPrefs).cafe_name)
      .filter(Boolean) as string[];
    setResolvedHotelName(leaderHotelName || allHotelNames[0] || null);
    setResolvedCafeName(leaderCafeName || allCafeNames[0] || null);
  }, [groupPrefs, leaderPrefs, villes, mainVille]);

  // ── Fetch group prefs depuis DB ───────────────────────────────────────────
  const fetchGroupPrefsFromDB = useCallback(
    async (code: string) => {
      const c = normalizeCode(code);
      if (!c) return;
      setLoadingPrefs(true);
      try {
        const res = await fetch(
          `${API_BASE}/api/group-summary-lite?invite_code=${encodeURIComponent(c)}`,
          { signal: AbortSignal.timeout(8000) },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.leader_prefs) {
          const lp: GuestPrefs = { ...data.leader_prefs, role: "leader" };
          setLeaderPrefData(lp);
          setLeaderPrefs(lp as unknown as GroupPref);
          if (
            lp.destination &&
            !isMultiCity &&
            villes.length === 1 &&
            villes[0] === mainVille
          )
            setVilles([lp.destination]);
          if (lp.date_depart) {
            const d = new Date(lp.date_depart);
            setInvitationStart(d);
            if (!travelData.dateDebut) setTravelData({ dateDebut: d });
          }
          if (lp.date_arrivee) {
            const d = new Date(lp.date_arrivee);
            setInvitationEnd(d);
            if (!travelData.dateFin) setTravelData({ dateFin: d });
          }
          if (lp.hotel_name) setResolvedHotelName(lp.hotel_name);
          if (lp.cafe_name) setResolvedCafeName(lp.cafe_name);
        }
        if (data.guests_prefs?.length > 0) {
          const gp: GuestPrefs[] = data.guests_prefs.map((g: GuestPrefs) => ({
            ...g,
            role: g.role || "invite",
          }));
          setGuestPrefsData(gp);
          setGroupPrefs(gp as unknown as GroupPref[]);
        }
      } catch {
        // silencieux — pas de crash si le serveur est hors ligne
      } finally {
        setLoadingPrefs(false);
      }
    },
    [
      villes,
      mainVille,
      isMultiCity,
      travelData.dateDebut,
      travelData.dateFin,
      setTravelData,
    ],
  );

  // ── Fetch emails invités ──────────────────────────────────────────────────
  const fetchGuestEmails = useCallback(
    async (code: string): Promise<string[]> => {
      try {
        const res = await fetch(
          `${API_BASE}/api/group-preferences?invite_code=${encodeURIComponent(code)}`,
        );
        if (!res.ok) return [];
        const rows: GuestPrefs[] = await res.json();
        return rows
          .filter((p) => p.role !== "leader" && p.email)
          .map((p) => p.email);
      } catch {
        return [];
      }
    },
    [],
  );

  const getNumDays = useCallback((): number => {
    if (resolvedDates?.numDays && resolvedDates.numDays > 0)
      return resolvedDates.numDays;
    let start = travelData.dateDebut;
    let end = travelData.dateFin;
    if ((!start || !end) && invitationStart && invitationEnd) {
      start = invitationStart;
      end = invitationEnd;
    }
    if (!start || !end) return isMultiCity ? villes.length * 2 : 3;
    const s = new Date(start as Date);
    const e = new Date(end as Date);
    const startMs = new Date(
      s.getFullYear(),
      s.getMonth(),
      s.getDate(),
    ).getTime();
    const endMs = new Date(
      e.getFullYear(),
      e.getMonth(),
      e.getDate(),
    ).getTime();
    const diff = Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : isMultiCity ? villes.length * 2 : 3;
  }, [
    travelData.dateDebut,
    travelData.dateFin,
    isMultiCity,
    villes.length,
    invitationStart,
    invitationEnd,
    resolvedDates,
  ]);

  const getVilleForDay = useCallback(
    (dayIndex: number): string => {
      if (!isMultiCity) return villes[0];
      const days = getNumDays();
      const daysPerCity = Math.ceil(days / villes.length);
      return villes[
        Math.min(Math.floor(dayIndex / daysPerCity), villes.length - 1)
      ];
    },
    [isMultiCity, villes, getNumDays],
  );

  const fetchAllCities = useCallback(async () => {
    setLoadingCities(true);
    const map: Record<string, CityData> = {};
    const hData = hotelsData as Record<string, Hotel[]>;
    const aData = activitesData as Record<string, unknown[]>;
    for (const ville of villes) {
      const hotels = hData[ville] || FALLBACK_HOTELS;
      const cafes =
        getCafesForVille(ville).length > 0
          ? getCafesForVille(ville)
          : FALLBACK_CAFES;
      const rawActs = aData[ville] || [];
      const activities = Array.isArray(rawActs)
        ? rawActs.map(normalizeActivity)
        : [];
      map[ville] = { hotels, cafes, activities, fromExcel: true };
    }
    setCityDataMap(map);
    setLoadingCities(false);
  }, [villes]);

  useEffect(() => {
    if (inviteCode) fetchGroupPrefsFromDB(inviteCode);
    fetchAllCities();
  }, [inviteCode, fetchAllCities]);

  const getCityData = (ville: string): CityData =>
    cityDataMap[ville] ||
    cityDataMap[ville.toLowerCase()] || {
      hotels: FALLBACK_HOTELS,
      cafes:
        getCafesForVille(ville).length > 0
          ? getCafesForVille(ville)
          : FALLBACK_CAFES,
      activities: [],
      fromExcel: false,
    };

  const toDate = (val: Date | string | null | undefined): Date => {
    if (!val) return new Date();
    if (val instanceof Date) return val;
    return new Date(val);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SAUVEGARDE LOCALE AsyncStorage
  // ═══════════════════════════════════════════════════════════════════════════
  const savePlanToStorage = async (name: string): Promise<SavedPlan | null> => {
    if (!itinerary) return null;
    const raw = await AsyncStorage.getItem("@travel_plans");
    const existing: SavedPlan[] = raw ? JSON.parse(raw) : [];
    const destLabel =
      resolvedDestination || (isMultiCity ? villes.join(" → ") : villes[0]);
    const totalPart =
      (groupPrefs.length || 0) + (leaderPrefs ? 1 : 0) ||
      (travelData.emailInvites?.length ?? 0) + 1;
    const effectiveStart = toDate(
      resolvedDates?.dateDebut || invitationStart || travelData.dateDebut,
    );
    const effectiveEnd = toDate(
      resolvedDates?.dateFin || invitationEnd || travelData.dateFin,
    );

    const plan: SavedPlan = {
      id: Date.now().toString(),
      nom: name || `Voyage ${destLabel}`,
      destination: destLabel,
      dateDebut: effectiveStart.toISOString(),
      dateFin: effectiveEnd.toISOString(),
      duree: getNumDays(),
      dateCreation: new Date().toISOString(),
      statut: "à venir",
      nombreVoyageurs: totalPart,
      listeActivites: travelData.activityTypes ?? [],
      hotels: itinerary.map((d) => d.hotel.name),
      itinerary,
      type: "gratuit",
      aiModel: ragModel,
      inviteCode: inviteCode || "",
      guestPrefs: groupPrefs as unknown as GuestPrefs[],
      leaderPrefs: leaderPrefs as unknown as GuestPrefs | null,
    };

    await AsyncStorage.setItem(
      "@travel_plans",
      JSON.stringify([...existing, plan]),
    );
    return plan;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SAUVEGARDE + PARTAGE BACKEND  ← FIX PRINCIPAL
  // ═══════════════════════════════════════════════════════════════════════════
  const handleSavePlan = async () => {
    setIsSaving(true);
    setSaveError(null);
    setNotifResult(null);
    setPlanCode(null);

    try {
      // 1. Sauvegarde locale AsyncStorage
      const saved = await savePlanToStorage(planName);
      if (!saved) throw new Error("Impossible de construire le plan local");

      // 2. Partage backend (avec ou sans code groupe)
      const leaderEmail =
        (leaderPrefs as GuestPrefs | null)?.email ||
        leaderPrefData?.email ||
        travelData.email ||
        "";
      const leaderName =
        (leaderPrefs as GuestPrefs | null)?.full_name ||
        leaderPrefData?.full_name ||
        travelData.nom ||
        (leaderPrefs as GuestPrefs | null)?.email ||
        "L'organisateur";

      // Collecte des emails invités
      let guestEmails: string[] = [];
      if (inviteCode) {
        guestEmails = await fetchGuestEmails(inviteCode);
      }
      if (travelData.emailInvites?.length) {
        guestEmails = [
          ...new Set([...guestEmails, ...travelData.emailInvites]),
        ];
      }
      const gpEmails = groupPrefs
        .filter(
          (p) => (p as GuestPrefs).role !== "leader" && (p as GuestPrefs).email,
        )
        .map((p) => (p as GuestPrefs).email);
      guestEmails = [...new Set([...guestEmails, ...gpEmails])];

      // Corps envoyé au backend — structure attendue par Flask
      const bodyToSend = {
        plan_code: undefined as string | undefined, // généré côté backend
        leader_id: travelData.userId || null,
        leader_email: leaderEmail,
        leader_name: leaderName,
        plan: {
          // Champs lus par le backend
          nom: saved.nom,
          destination: saved.destination,
          dateDebut: saved.dateDebut,
          dateFin: saved.dateFin,
          itinerary: saved.itinerary,
          // On garde tout le reste pour plan_json
          ...saved,
        },
        guest_emails: guestEmails,
      };

      console.log("[save-plan] POST →", `${API_BASE}/save-plan`);
      console.log("[save-plan] leader_email:", leaderEmail);
      console.log("[save-plan] guest_emails:", guestEmails);

      let res: Response;
      try {
        res = await fetch(`${API_BASE}/save-plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyToSend),
        });
      } catch (networkErr: unknown) {
        const msg =
          networkErr instanceof Error ? networkErr.message : String(networkErr);
        // Réseau inaccessible → on reste en local uniquement
        setSaveError(`Serveur inaccessible : ${msg}`);
        setConfirmed(true);
        setIsModifying(false);
        setHasModifications(false);
        setSaveSuccess(true);
        setNameModalVisible(false);
        Alert.alert(
          "✓ Plan sauvegardé localement",
          `Impossible de joindre le serveur (${msg}).\nLe plan est enregistré sur cet appareil.`,
          [
            {
              text: "Voir mes plans",
              onPress: () => router.push("/ancienplan"),
            },
            { text: "Continuer", style: "cancel" },
          ],
        );
        return;
      }

      // Lecture sécurisée de la réponse (toujours du texte brut d'abord)
      const rawText = await res.text();
      console.log(
        "[save-plan] status:",
        res.status,
        "body:",
        rawText.slice(0, 300),
      );

      let result: Record<string, unknown> = {};
      try {
        result = JSON.parse(rawText);
      } catch {
        setSaveError(`Réponse invalide du serveur (status ${res.status})`);
        // Sauvegarde locale déjà faite → on continue quand même
      }

      if (!res.ok) {
        const errMsg = String(result.error || `Erreur serveur (${res.status})`);
        setSaveError(errMsg);
        // Sauvegarde locale déjà faite → on affiche un message doux
        setConfirmed(true);
        setIsModifying(false);
        setHasModifications(false);
        setSaveSuccess(true);
        setNameModalVisible(false);
        Alert.alert(
          "⚠️ Plan sauvegardé localement",
          `Le serveur a renvoyé une erreur : ${errMsg}\nVotre plan est quand même enregistré sur cet appareil.`,
          [
            {
              text: "Voir mes plans",
              onPress: () => router.push("/ancienplan"),
            },
            { text: "Continuer", style: "cancel" },
          ],
        );
        return;
      }

      // ✅ Succès complet
      setPlanCode(String(result.plan_code || ""));
      setNotifResult((result.emails_sent as Record<string, string>) || {});
      setConfirmed(true);
      setIsModifying(false);
      setHasModifications(false);
      setSaveSuccess(true);
      setNameModalVisible(false);
      setPlanName("");
      setShowNotifModal(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(msg);
      Alert.alert("Erreur", `Impossible de sauvegarder : ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // GÉNÉRATION ITINÉRAIRE
  // ═══════════════════════════════════════════════════════════════════════════
  const generateItinerary = async () => {
    if (loadingCities) {
      Alert.alert(
        "Chargement en cours",
        "Les données des villes sont encore en cours de chargement.",
      );
      return;
    }
    setLoading(true);
    setConfirmed(false);
    setIsModifying(false);
    setSaveSuccess(false);
    setHasModifications(false);
    setAiAdvice("");
    setRagSteps([]);
    setCurrentRagStep("");

    let finalGroupPrefs = groupPrefs;
    let finalLeaderPrefs = leaderPrefs;
    let majorityPrefs: Partial<GroupPref> = {};

    if (finalGroupPrefs.length) {
      majorityPrefs = computeMajorityPrefs(
        finalGroupPrefs as unknown as GuestPrefs[],
      ) as Partial<GroupPref>;
      if (!finalLeaderPrefs) {
        finalLeaderPrefs = {
          role: "leader",
          email: travelData.emailInvites?.[0] || "leader@example.com",
        } as unknown as GroupPref;
      }
      finalLeaderPrefs = {
        ...finalLeaderPrefs,
        hotel_type:
          (finalLeaderPrefs as GuestPrefs).hotel_type ||
          (majorityPrefs as GuestPrefs).hotel_type ||
          null,
        hotel_location:
          (finalLeaderPrefs as GuestPrefs).hotel_location ||
          (majorityPrefs as GuestPrefs).hotel_location ||
          null,
        activity_types:
          (finalLeaderPrefs as GuestPrefs).activity_types ||
          (majorityPrefs as GuestPrefs).activity_types ||
          null,
        cafe_levels:
          (finalLeaderPrefs as GuestPrefs).cafe_levels ||
          (majorityPrefs as GuestPrefs).cafe_levels ||
          null,
        voyage_type:
          (finalLeaderPrefs as GuestPrefs).voyage_type ||
          (majorityPrefs as GuestPrefs).voyage_type ||
          null,
        budget:
          (finalLeaderPrefs as GuestPrefs).budget ||
          (majorityPrefs as GuestPrefs).budget ||
          null,
        hotel_name:
          (finalLeaderPrefs as GuestPrefs).hotel_name ||
          (majorityPrefs as GuestPrefs).hotel_name ||
          null,
        cafe_name:
          (finalLeaderPrefs as GuestPrefs).cafe_name ||
          (majorityPrefs as GuestPrefs).cafe_name ||
          null,
        tranche_age:
          (finalLeaderPrefs as GuestPrefs).tranche_age ||
          (majorityPrefs as GuestPrefs).tranche_age ||
          null,
      } as unknown as GroupPref;
    }

    const preferredHotelName =
      (finalLeaderPrefs as GuestPrefs)?.hotel_name || resolvedHotelName || null;
    const preferredCafeName =
      (finalLeaderPrefs as GuestPrefs)?.cafe_name || resolvedCafeName || null;
    if (preferredHotelName) setResolvedHotelName(preferredHotelName);
    if (preferredCafeName) setResolvedCafeName(preferredCafeName);

    const allVoyageTypes = [
      (finalLeaderPrefs as GuestPrefs)?.voyage_type,
      ...finalGroupPrefs.map((p) => (p as GuestPrefs).voyage_type),
      (majorityPrefs as GuestPrefs)?.voyage_type,
    ].filter(Boolean) as string[];
    const voyageType = allVoyageTypes[0] ?? null;

    const enrichedCityDataMap = { ...cityDataMap };
    const aData = activitesData as Record<string, unknown[]>;
    for (const ville of villes) {
      const vk = ville
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const rawActs = aData[ville] || aData[vk] || [];
      const extraActs: Activity[] = Array.isArray(rawActs)
        ? rawActs.map(normalizeActivity)
        : [];
      const cityJSONCafes = getCafesForVille(ville);
      const hData = hotelsData as Record<string, Hotel[]>;
      let baseHotels =
        enrichedCityDataMap[ville]?.hotels || hData[ville] || FALLBACK_HOTELS;
      let baseCafes =
        cityJSONCafes.length > 0
          ? cityJSONCafes
          : enrichedCityDataMap[ville]?.cafes.length > 0
            ? enrichedCityDataMap[ville].cafes
            : FALLBACK_CAFES;
      if (preferredHotelName)
        baseHotels = prioritizeByName(baseHotels, preferredHotelName);
      if (preferredCafeName)
        baseCafes = prioritizeByName(baseCafes, preferredCafeName);
      enrichedCityDataMap[ville] = {
        ...(enrichedCityDataMap[ville] || {}),
        hotels: baseHotels,
        activities: [
          ...(enrichedCityDataMap[ville]?.activities || []),
          ...extraActs,
        ],
        cafes: baseCafes,
      };
    }

    try {
      setCurrentRagStep("RETRIEVE");
      await new Promise((r) => setTimeout(r, 300));
      setCurrentRagStep("REASON");
      await new Promise((r) => setTimeout(r, 200));
      setCurrentRagStep("PLAN");
      await new Promise((r) => setTimeout(r, 200));
      setCurrentRagStep("GENERATE");

      const result = await runAgenticRagPipeline({
        villes,
        days: getNumDays(),
        cityDataMap: enrichedCityDataMap,
        groupPrefs: finalGroupPrefs,
        leaderPrefs: finalLeaderPrefs,
        isMultiCity,
        getVilleForDay,
        defaultDestination: villes[0] || mainVille,
        fallbackDateDebut: travelData.dateDebut ?? null,
        fallbackDateFin: travelData.dateFin ?? null,
        preferredHotelName,
        preferredCafeName,
      });

      let finalItinerary = result.itinerary;
      let finalAiAdvice = result.aiAdvice;

      if (preferredHotelName)
        finalItinerary = applyPreferredHotelToItinerary(
          finalItinerary,
          preferredHotelName,
          enrichedCityDataMap,
          villes[0],
        );
      if (preferredCafeName)
        finalItinerary = applyPreferredCafeToItinerary(
          finalItinerary,
          preferredCafeName,
          enrichedCityDataMap,
          villes[0],
        );

      if (isExcursionRequested(voyageType) && !isMultiCity) {
        const dest = result.resolvedDestination || villes[0];
        const excCity = getExcursionCity(dest);
        if (excCity) {
          finalItinerary = injectExcursionIntoItinerary(
            finalItinerary,
            dest,
            excCity,
          );
          finalAiAdvice += ` Une journée d'excursion à ${excCity} a été intégrée.`;
        }
      }

      setItinerary(finalItinerary);
      setAiAdvice(finalAiAdvice);
      setRagSteps(result.steps);
      setRagModel(result.model);
      if (result.resolvedDestination)
        setResolvedDestination(result.resolvedDestination);
      if (result.resolvedDates) setResolvedDates(result.resolvedDates);
    } catch {
      const fallback = generateFallbackPlan({
        villes,
        days: getNumDays(),
        cityDataMap: enrichedCityDataMap,
        isMultiCity,
        getVilleForDay,
        groupPrefs: finalGroupPrefs,
        leaderPrefs: finalLeaderPrefs,
        fallbackDateDebut: travelData.dateDebut ?? null,
        fallbackDateFin: travelData.dateFin ?? null,
        preferredHotelName,
        preferredCafeName,
      });
      let finalItinerary = fallback.itinerary;
      if (preferredHotelName)
        finalItinerary = applyPreferredHotelToItinerary(
          finalItinerary,
          preferredHotelName,
          enrichedCityDataMap,
          villes[0],
        );
      if (preferredCafeName)
        finalItinerary = applyPreferredCafeToItinerary(
          finalItinerary,
          preferredCafeName,
          enrichedCityDataMap,
          villes[0],
        );
      if (isExcursionRequested(voyageType) && !isMultiCity) {
        const dest = fallback.resolvedDestination || villes[0];
        const excCity = getExcursionCity(dest);
        if (excCity)
          finalItinerary = injectExcursionIntoItinerary(
            finalItinerary,
            dest,
            excCity,
          );
      }
      setItinerary(finalItinerary);
      setAiAdvice(fallback.aiAdvice);
      setRagSteps(fallback.steps);
      setRagModel("fallback");
      if (fallback.resolvedDestination)
        setResolvedDestination(fallback.resolvedDestination);
      if (fallback.resolvedDates) setResolvedDates(fallback.resolvedDates);
      Alert.alert(
        "⚠️ Mode hors-ligne",
        "Le service Gemini est temporairement indisponible. Un plan de base a été généré.",
        [{ text: "OK" }],
      );
    } finally {
      setLoading(false);
      setCurrentRagStep("");
    }
  };

  const handleConfirm = () => setNameModalVisible(true);
  const handleModify = () => {
    setIsModifying(true);
    setConfirmed(false);
    setSaveSuccess(false);
    setHasModifications(false);
  };
  const handleSaveModifications = () => setNameModalVisible(true);
  const handleCancel = () => {
    setReplanChoices({
      hotel: false,
      cafe: false,
      loisir: false,
      activite: false,
    });
    setReplanModalVisible(true);
  };

  const handleReplan = async () => {
    setReplanModalVisible(false);
    const anySelected = Object.values(replanChoices).some(Boolean);
    if (!anySelected) {
      setItinerary(null);
      setConfirmed(false);
      setIsModifying(false);
      setSaveSuccess(false);
      setHasModifications(false);
      setAiAdvice("");
      setRagSteps([]);
      setReplanChoices({
        hotel: false,
        cafe: false,
        loisir: false,
        activite: false,
      });
      return;
    }
    if (!itinerary) return;
    setReplanLoading(true);
    try {
      let sharedNewHotel: Hotel | null = null;
      if (replanChoices.hotel && !isMultiCity) {
        const mainVilleForHotel =
          itinerary.find((d) => !d.isExcursion)?.ville || villes[0];
        const cd = getCityData(mainVilleForHotel);
        const hotels = cd.hotels.length > 0 ? cd.hotels : FALLBACK_HOTELS;
        if (resolvedHotelName) {
          const locked = findByPreferredName(hotels, resolvedHotelName);
          sharedNewHotel =
            locked ||
            hotels[
              (hotels.findIndex(
                (h) =>
                  h.name === itinerary.find((d) => !d.isExcursion)?.hotel.name,
              ) +
                1) %
                hotels.length
            ] ||
            hotels[0];
        } else {
          const ci = hotels.findIndex(
            (h) => h.name === itinerary.find((d) => !d.isExcursion)?.hotel.name,
          );
          sharedNewHotel = hotels[(ci + 1) % hotels.length] || hotels[0];
        }
      }

      const updated = await Promise.all(
        itinerary.map(async (day, i) => {
          const dayUpdated = { ...day };
          const isExcursionDay = !!day.isExcursion;
          const ville = day.ville;
          const cd = getCityData(ville);

          if (replanChoices.hotel) {
            if (isExcursionDay) {
              const hotels = cd.hotels.length > 0 ? cd.hotels : FALLBACK_HOTELS;
              const ci = hotels.findIndex((h) => h.name === day.hotel.name);
              dayUpdated.hotel = hotels[(ci + 1) % hotels.length] || hotels[0];
            } else {
              dayUpdated.hotel = resolvedHotelName
                ? findByPreferredName(
                    cd.hotels.length > 0 ? cd.hotels : FALLBACK_HOTELS,
                    resolvedHotelName,
                  ) || sharedNewHotel!
                : sharedNewHotel!;
            }
          }

          if (replanChoices.cafe) {
            const cityJSONCafes = getCafesForVille(ville);
            const allCafes =
              cityJSONCafes.length > 0
                ? cityJSONCafes
                : cd.cafes.length > 0
                  ? cd.cafes
                  : FALLBACK_CAFES;
            if (resolvedCafeName) {
              const locked = findByPreferredName(allCafes, resolvedCafeName);
              if (locked) {
                const others = allCafes.filter((c) => c.name !== locked.name);
                dayUpdated.cafe =
                  i === 0 || i % 2 === 0
                    ? locked
                    : others[(i - 1) % Math.max(1, others.length)] || locked;
              } else {
                const ci = allCafes.findIndex((c) => c.name === day.cafe?.name);
                dayUpdated.cafe =
                  allCafes[(ci + 1) % allCafes.length] || allCafes[0];
              }
            } else {
              const ci = allCafes.findIndex((c) => c.name === day.cafe?.name);
              dayUpdated.cafe =
                allCafes[(ci + 1) % allCafes.length] || allCafes[0];
            }
          }

          if (replanChoices.loisir) {
            const aData = activitesData as Record<string, unknown[]>;
            const rawActs = aData[ville] || [];
            const normalized: Activity[] = Array.isArray(rawActs)
              ? rawActs.map(normalizeActivity)
              : [];
            if (normalized.length > 1) {
              const ci = normalized.findIndex(
                (a) => a.name === day.localActivity?.name,
              );
              dayUpdated.localActivity =
                normalized[(ci + 1) % normalized.length];
            } else if (normalized.length === 1) {
              dayUpdated.localActivity = normalized[0];
            }
          }

          if (replanChoices.activite && !isExcursionDay) {
            try {
              const actNames =
                cd.activities
                  .slice(0, 8)
                  .map((a) => a.name)
                  .join(", ") || "Visite médina, musée, marché local";
              const prompt =
                `Tu es un expert voyage en Tunisie. Génère UNE SEULE activité principale pour ${ville} (jour ${i + 1}).` +
                ` Activités disponibles : ${actNames}.` +
                ` Réponds UNIQUEMENT en JSON: {"activite":"Description 2-3 phrases"}`;
              const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "";
              if (apiKey) {
                const response = await fetch(
                  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      contents: [{ parts: [{ text: prompt }] }],
                      generationConfig: {
                        temperature: 0.8,
                        maxOutputTokens: 512,
                      },
                    }),
                  },
                );
                const data = await response.json();
                let raw: string =
                  data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
                raw = raw
                  .replace(/```json\n?/gi, "")
                  .replace(/```\n?/gi, "")
                  .trim();
                const parsed = JSON.parse(raw);
                if (parsed?.activite) dayUpdated.activity = parsed.activite;
              }
            } catch {
              const aData = activitesData as Record<string, unknown[]>;
              const rawActs = aData[ville] || [];
              const normalized: Activity[] = Array.isArray(rawActs)
                ? rawActs.map(normalizeActivity)
                : [];
              if (normalized.length > 0) {
                const ci = normalized.findIndex((a) =>
                  day.activity.includes(a.name),
                );
                const pick = normalized[(ci + 1) % normalized.length];
                dayUpdated.activity =
                  pick.name +
                  (pick.description ? ` — ${pick.description}` : "") +
                  (pick.prix && pick.prix !== "Variable"
                    ? ` (${pick.prix})`
                    : "");
              }
            }
          }

          return dayUpdated;
        }),
      );

      setItinerary(updated);
      setHasModifications(true);
      setConfirmed(false);
      setSaveSuccess(false);
      setReplanChoices({
        hotel: false,
        cafe: false,
        loisir: false,
        activite: false,
      });

      const nbModified = Object.values(replanChoices).filter(Boolean).length;
      const labels = [
        replanChoices.hotel && "hôtel",
        replanChoices.cafe && "café",
        replanChoices.loisir && "loisir",
        replanChoices.activite && "activité",
      ]
        .filter(Boolean)
        .join(", ");
      Alert.alert(
        "✓ Plan mis à jour !",
        `${nbModified} élément${nbModified > 1 ? "s" : ""} modifié${nbModified > 1 ? "s" : ""} : ${labels}.`,
        [{ text: "OK" }],
      );
    } catch {
      Alert.alert("Erreur", "Impossible de mettre à jour le plan.");
    } finally {
      setReplanLoading(false);
    }
  };

  const handleEdit = (index: number) => {
    setEditingDay({ index });
    setNewActivity(itinerary![index].activity);
    setEditModalVisible(true);
  };

  const handleSaveEdit = () => {
    if (!editingDay || !itinerary) return;
    if (newActivity.trim()) {
      const updated = [...itinerary];
      updated[editingDay.index] = {
        ...updated[editingDay.index],
        activity: newActivity.trim(),
      };
      setItinerary(updated);
      setHasModifications(true);
    }
    setEditModalVisible(false);
    setEditingDay(null);
    setNewActivity("");
    Alert.alert("✓ Modification enregistrée", "L'activité a été mise à jour.");
  };

  const handleAddDay = () => {
    if (!itinerary) return;
    const i = itinerary.length;
    const jourVille = getVilleForDay(i);
    const cd = getCityData(jourVille);
    const cityTips = getCityTipsLocal(jourVille);
    const hData = hotelsData as Record<string, Hotel[]>;
    const hotel =
      !isMultiCity && itinerary.length > 0
        ? itinerary[0].hotel
        : cd.hotels[0] || hData[jourVille]?.[0] || FALLBACK_HOTELS[0];
    const cityJSONCafes = getCafesForVille(jourVille);
    const allCafes = [...(cd.cafes || []), ...cityJSONCafes].filter(
      (c, idx, arr) => arr.findIndex((x) => x.name === c.name) === idx,
    );
    const cafeForDay: Cafe | null =
      allCafes.length > 0 ? allCafes[i % allCafes.length] : null;
    const rawLocal =
      cd.activities.length > 0
        ? cd.activities[i % cd.activities.length]
        : undefined;
    const localActivity = rawLocal ? normalizeActivity(rawLocal) : undefined;

    setItinerary([
      ...itinerary,
      {
        title: `Jour ${i + 1}`,
        ville: jourVille,
        hotel,
        cafe: cafeForDay,
        activity: "Nouvelle activité à définir",
        localActivity,
        transport: cityTips.transport,
        meteo: cityTips.meteo,
      },
    ]);
    setHasModifications(true);
  };

  const handleReplaceActivity = (index: number) => {
    Alert.alert("Remplacer", "Voulez-vous remplacer cette activité ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Remplacer",
        style: "destructive",
        onPress: () => {
          const updated = [...itinerary!];
          updated[index] = {
            ...updated[index],
            activity: "Activité à définir",
          };
          setItinerary(updated);
          setHasModifications(true);
        },
      },
    ]);
  };

  // ── Données dérivées ──────────────────────────────────────────────────────
  const isMultiCityMode = isMultiCity && villes.length > 1;
  const destLabel =
    resolvedDestination || (isMultiCityMode ? villes.join(" → ") : villes[0]);
  const nbParticipants =
    (groupPrefs.length || 0) + (leaderPrefs ? 1 : 0) ||
    (travelData.emailInvites?.length ?? 0) + 1;

  const villeColors: Record<number, [string, string]> = {
    0: ["#042A66", "#0A4DBF"],
    1: ["#065F46", "#059669"],
    2: ["#7C2D12", "#B45309"],
    3: ["#4C1D95", "#7C3AED"],
    4: ["#1E3A5F", "#2563EB"],
  };
  const getVilleGradient = (ville: string): [string, string] =>
    villeColors[villes.indexOf(ville) % 5] || ["#042A66", "#0A4DBF"];

  const isNewCity = (index: number): boolean => {
    if (!isMultiCityMode || index === 0) return index === 0;
    return itinerary![index].ville !== itinerary![index - 1].ville;
  };

  const ragStepLabels: Record<string, string> = {
    RETRIEVE: "🔍 Récupération des données…",
    REASON: "🧠 Analyse des préférences…",
    PLAN: "📋 Construction du contexte…",
    GENERATE: "✨ Génération Gemini en cours…",
  };

  const effectiveDateDebut = toDate(
    resolvedDates?.dateDebut || invitationStart || travelData.dateDebut || null,
  );
  const effectiveDateFin = toDate(
    resolvedDates?.dateFin || invitationEnd || travelData.dateFin || null,
  );
  const hasEffectiveDateDebut =
    resolvedDates?.dateDebut || invitationStart || travelData.dateDebut;
  const hasEffectiveDateFin =
    resolvedDates?.dateFin || invitationEnd || travelData.dateFin;

  const allDisplayedPrefs: GuestPrefs[] = useMemo(() => {
    const leader =
      leaderPrefData ||
      (leaderPrefs
        ? { ...(leaderPrefs as unknown as GuestPrefs), role: "leader" }
        : null);
    const guests =
      guestPrefsData.length > 0
        ? guestPrefsData
        : (groupPrefs as unknown as GuestPrefs[]);
    return [...(leader ? [leader] : []), ...guests];
  }, [leaderPrefData, guestPrefsData, leaderPrefs, groupPrefs]);

  // ─── Rendu itinéraire ─────────────────────────────────────────────────────
  const renderItinerary = () => {
    if (!itinerary) return null;
    const nonExcursionDays = itinerary.filter((d) => !d.isExcursion);
    const firstNonExcHotelName = nonExcursionDays[0]?.hotel?.name;
    const isSameHotelForAllDays =
      !isMultiCityMode &&
      nonExcursionDays.length > 0 &&
      nonExcursionDays.every((d) => d.hotel.name === firstNonExcHotelName);
    const cityInfoDisplayed = new Set<string>();

    return (
      <View style={{ flex: 1 }}>
        {(resolvedDestination || resolvedDates) && (
          <ResolutionBanner
            resolvedDestination={resolvedDestination || villes[0]}
            resolvedDates={resolvedDates}
            totalParticipants={nbParticipants}
          />
        )}
        {ragSteps.length > 0 && (
          <RagPipelineTrace steps={ragSteps} model={ragModel} />
        )}

        {(resolvedHotelName || resolvedCafeName) && (
          <View style={s.priorityBanner}>
            <Text style={s.priorityBannerTitle}>
              🔒 Préférences verrouillées
            </Text>
            <View style={s.priorityBannerRow}>
              {resolvedHotelName && (
                <View style={s.priorityBadgeHotel}>
                  <Text style={s.priorityBadgeHotelTxt}>
                    🏨 {resolvedHotelName}
                  </Text>
                </View>
              )}
              {resolvedCafeName && (
                <View style={s.priorityBadgeCafe}>
                  <Text style={s.priorityBadgeCafeTxt}>
                    ☕ {resolvedCafeName}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {!!aiAdvice && (
          <View style={s.aiBox}>
            <View style={s.aiHeader}>
              <Text style={s.aiEmoji}>✦</Text>
              <Text style={s.aiTitle}>Conseil Gemini RAG</Text>
            </View>
            <Text style={s.aiText}>{aiAdvice}</Text>
          </View>
        )}

        {isSameHotelForAllDays && firstNonExcHotelName && (
          <View style={s.globalHotelBox}>
            <View style={s.sectionLbl}>
              <Text style={s.sectionEmoji}>🏨</Text>
              <Text style={s.sectionTxt}>
                Hébergement unique pour tout le séjour
              </Text>
            </View>
            <View style={s.infoCard}>
              <View style={s.infoRow}>
                <Text style={s.infoName}>{nonExcursionDays[0].hotel.name}</Text>
                <Text style={s.infoStars}>
                  {nonExcursionDays[0].hotel.stars}
                </Text>
              </View>
              <Text style={s.infoDesc}>
                {nonExcursionDays[0].hotel.description}
              </Text>
            </View>
            <MapPinButton
              name={nonExcursionDays[0].hotel.name}
              zone={villes[0]}
              color="#042A66"
              bgColor="#EEF4FF"
              borderColor="#D6E4FF"
            />
          </View>
        )}

        {isGroupMode && (
          <View style={s.groupBox}>
            <Text style={s.groupTitle}>
              👥 Plan pour {nbParticipants} participant(s) · {destLabel}
            </Text>
            {leaderPrefs && (
              <Text style={s.groupItem}>
                👑{" "}
                {(leaderPrefs as GuestPrefs).full_name ||
                  (leaderPrefs as GuestPrefs).email}{" "}
                (leader)
              </Text>
            )}
            {groupPrefs.map((g, i) => (
              <Text key={i} style={s.groupItem}>
                👤 {(g as GuestPrefs).full_name || (g as GuestPrefs).email}
              </Text>
            ))}
          </View>
        )}

        {!confirmed && !isModifying && !saveSuccess && (
          <View style={s.actionsRow}>
            <TouchableOpacity
              style={s.btnConfirm}
              onPress={handleConfirm}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={["#0A4DBF", "#1a6aff"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.btnGrad}
              >
                <Text style={s.btnGradIcon}>✓</Text>
                <Text style={s.btnGradText}>Confirmer</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.btnMod}
              onPress={handleModify}
              activeOpacity={0.8}
            >
              <Text style={s.btnModIcon}>✎</Text>
              <Text style={s.btnModText}>Modifier</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.btnCancel}
              onPress={handleCancel}
              activeOpacity={0.8}
            >
              <Text style={s.btnCancelIcon}>↺</Text>
              <Text style={s.btnCancelText}>Refaire</Text>
            </TouchableOpacity>
          </View>
        )}

        {isModifying && (
          <View style={s.modBanner}>
            <View style={s.modBannerRow}>
              <View style={s.modDot} />
              <Text style={s.modTitle}>Mode Modification</Text>
            </View>
            <Text style={s.modSub}>
              Appuyez sur ✎ pour éditer ou sur l'activité pour la remplacer
            </Text>
            <TouchableOpacity
              style={s.addDayBtn}
              onPress={handleAddDay}
              activeOpacity={0.8}
            >
              <Text style={s.addDayTxt}>+ Ajouter un jour</Text>
            </TouchableOpacity>
            {hasModifications ? (
              <TouchableOpacity
                onPress={handleSaveModifications}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={["#0A4DBF", "#1a6aff"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.saveModBtn}
                >
                  <Text style={s.saveModTxt}>✓ Confirmer et sauvegarder</Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <Text style={s.noModTxt}>Aucune modification pour le moment</Text>
            )}
          </View>
        )}

        <View style={{ gap: 16 }}>
          {itinerary.map((d, idx) => {
            const isExcursionDay = !!d.isExcursion;
            const excCity = d.excursionCity;
            const mainDest = d.mainDestination;
            const gradient: [string, string] = isExcursionDay
              ? ["#0369A1", "#0891B2"]
              : getVilleGradient(d.ville);
            const showCityHeader = isMultiCityMode && isNewCity(idx);
            const isFirstCity = !cityInfoDisplayed.has(d.ville);
            if (isFirstCity) cityInfoDisplayed.add(d.ville);

            const safeLocalActivity = d.localActivity
              ? normalizeActivity(d.localActivity)
              : undefined;
            const safeCafe = d.cafe ? normalizeCafe(d.cafe) : null;
            const shouldShowHotel = isExcursionDay || !isSameHotelForAllDays;
            const isPriorityCafe =
              resolvedCafeName && safeCafe
                ? normalizeStr(safeCafe.name).includes(
                    normalizeStr(resolvedCafeName),
                  ) ||
                  normalizeStr(resolvedCafeName).includes(
                    normalizeStr(safeCafe.name),
                  )
                : false;
            const isPriorityHotel =
              resolvedHotelName && d.hotel
                ? normalizeStr(d.hotel.name).includes(
                    normalizeStr(resolvedHotelName),
                  ) ||
                  normalizeStr(resolvedHotelName).includes(
                    normalizeStr(d.hotel.name),
                  )
                : false;

            return (
              <View key={idx}>
                {showCityHeader && (
                  <View style={s.cityHeader}>
                    <LinearGradient
                      colors={[`${gradient[0]}22`, `${gradient[1]}11`]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={s.cityHeaderGrad}
                    >
                      <Text style={s.cityHeaderEmoji}>📍</Text>
                      <Text style={[s.cityHeaderName, { color: gradient[0] }]}>
                        {d.ville}
                      </Text>
                      <View
                        style={[
                          s.cityHeaderBadge,
                          {
                            backgroundColor: `${gradient[1]}22`,
                            borderColor: `${gradient[1]}55`,
                          },
                        ]}
                      >
                        <Text
                          style={[s.cityHeaderBadgeTxt, { color: gradient[0] }]}
                        >
                          {
                            itinerary.filter((day) => day.ville === d.ville)
                              .length
                          }{" "}
                          jour(s)
                        </Text>
                      </View>
                    </LinearGradient>
                  </View>
                )}

                <View style={s.dayCard}>
                  <LinearGradient
                    colors={gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s.dayHeader}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.dayNum}>
                        {d.title || `Jour ${idx + 1}`}
                      </Text>
                      {isMultiCityMode && (
                        <Text style={s.dayVille}>{d.ville}</Text>
                      )}
                    </View>
                    {isExcursionDay && (
                      <View style={s.excursionBadge}>
                        <Text style={s.excursionBadgeTxt}>🗺️ EXCURSION</Text>
                      </View>
                    )}
                    {isModifying && (
                      <TouchableOpacity
                        style={s.editChip}
                        onPress={() => handleEdit(idx)}
                      >
                        <Text style={s.editChipTxt}>✎ Modifier</Text>
                      </TouchableOpacity>
                    )}
                  </LinearGradient>

                  {isExcursionDay && excCity && mainDest && (
                    <View style={s.excursionInfoBanner}>
                      <Text style={s.excursionInfoTxt}>
                        🚌 Journée d'excursion depuis{" "}
                        <Text style={{ fontWeight: "800" }}>{mainDest}</Text>{" "}
                        vers{" "}
                        <Text style={{ fontWeight: "800" }}>{excCity}</Text>
                      </Text>
                    </View>
                  )}

                  <View style={s.dayBody}>
                    {/* Hôtel */}
                    {shouldShowHotel && (
                      <>
                        <View style={s.section}>
                          <View style={s.sectionLbl}>
                            <Text style={s.sectionEmoji}>🏨</Text>
                            <Text style={s.sectionTxt}>Hébergement</Text>
                            {isPriorityHotel && !isExcursionDay && (
                              <View
                                style={[
                                  s.geminiBadgeInline,
                                  {
                                    backgroundColor: "#FFF0F0",
                                    borderColor: "#FFCCCC",
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    s.geminiBadgeInlineTxt,
                                    { color: "#B91C1C" },
                                  ]}
                                >
                                  🔒 Votre choix
                                </Text>
                              </View>
                            )}
                          </View>
                          <View
                            style={[
                              s.infoCard,
                              isPriorityHotel &&
                                !isExcursionDay && {
                                  borderColor: "#FFCCCC",
                                  borderWidth: 1.5,
                                },
                            ]}
                          >
                            <View style={s.infoRow}>
                              <Text style={s.infoName}>{d.hotel.name}</Text>
                              <Text style={s.infoStars}>{d.hotel.stars}</Text>
                            </View>
                            <Text style={s.infoDesc}>
                              {d.hotel.description}
                            </Text>
                          </View>
                          <MapPinButton
                            name={d.hotel.name}
                            zone={isExcursionDay ? excCity : d.ville}
                            color="#042A66"
                            bgColor="#EEF4FF"
                            borderColor="#D6E4FF"
                          />
                        </View>
                        <View style={s.div} />
                      </>
                    )}

                    {/* Café */}
                    <>
                      <View style={s.section}>
                        <View style={s.sectionLbl}>
                          <Text style={s.sectionEmoji}>☕</Text>
                          <Text style={s.sectionTxt}>Pause café</Text>
                          {isPriorityCafe && !isExcursionDay && (
                            <View
                              style={[
                                s.geminiBadgeInline,
                                {
                                  backgroundColor: "#FFF8E8",
                                  borderColor: "#FDE68A",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  s.geminiBadgeInlineTxt,
                                  { color: "#92400E" },
                                ]}
                              >
                                🔒 Votre choix
                              </Text>
                            </View>
                          )}
                        </View>
                        {safeCafe ? (
                          <View
                            style={[
                              s.infoCard,
                              {
                                backgroundColor: "#FFF8F0",
                                borderColor:
                                  isPriorityCafe && !isExcursionDay
                                    ? "#FDE68A"
                                    : "#FFE0B2",
                              },
                              isPriorityCafe &&
                                !isExcursionDay && { borderWidth: 1.5 },
                            ]}
                          >
                            <View style={s.infoRow}>
                              <Text style={[s.infoName, { color: "#5D4037" }]}>
                                {safeCafe.name}
                              </Text>
                              <View style={s.prixBadge}>
                                <Text style={s.prixTxt}>{safeCafe.prix}</Text>
                              </View>
                            </View>
                            {safeCafe.zone ? (
                              <Text style={[s.infoDesc, { color: "#8D6E63" }]}>
                                📍 {safeCafe.zone}
                              </Text>
                            ) : null}
                          </View>
                        ) : (
                          <View
                            style={[
                              s.infoCard,
                              {
                                backgroundColor: "#F5F5F5",
                                borderColor: "#E0E0E0",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                s.infoDesc,
                                { color: "#9E9E9E", fontStyle: "italic" },
                              ]}
                            >
                              Explorez librement les cafés locaux.
                            </Text>
                          </View>
                        )}
                        {safeCafe && (
                          <MapPinButton
                            name={safeCafe.name}
                            zone={safeCafe.zone || d.ville}
                            color="#7C2D12"
                            bgColor="#FFF8F0"
                            borderColor="#FFCC80"
                          />
                        )}
                      </View>
                      <View style={s.div} />
                    </>

                    {/* Activité principale */}
                    <View style={s.section}>
                      <View style={s.sectionLbl}>
                        <Text style={s.sectionEmoji}>🎯</Text>
                        <Text style={s.sectionTxt}>Programme du jour</Text>
                        {!isExcursionDay && (
                          <View style={s.geminiBadgeInline}>
                            <Text style={s.geminiBadgeInlineTxt}>✦ Gemini</Text>
                          </View>
                        )}
                        {isExcursionDay && (
                          <View
                            style={[
                              s.geminiBadgeInline,
                              {
                                backgroundColor: "#E0F7FA",
                                borderColor: "#80DEEA",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                s.geminiBadgeInlineTxt,
                                { color: "#0277BD" },
                              ]}
                            >
                              🗺️ Local
                            </Text>
                          </View>
                        )}
                      </View>
                      <TouchableOpacity
                        style={[
                          s.actCard,
                          isModifying && s.actCardEdit,
                          isExcursionDay && s.actCardExcursion,
                        ]}
                        onPress={() =>
                          isModifying && handleReplaceActivity(idx)
                        }
                        activeOpacity={isModifying ? 0.7 : 1}
                      >
                        <Text
                          style={[
                            s.actTxt,
                            isModifying && { color: "#B45309" },
                            isExcursionDay && { color: "#01579B" },
                          ]}
                        >
                          {d.activity}
                        </Text>
                        {isModifying && (
                          <Text style={s.actHint}>Appuyer pour remplacer</Text>
                        )}
                      </TouchableOpacity>
                      <MapPinButton
                        name={isExcursionDay && excCity ? excCity : d.ville}
                        zone="Tunisie"
                        color={isExcursionDay ? EXCURSION_COLOR : BLUE_PRIMARY}
                        bgColor={isExcursionDay ? "#E0F7FA" : BLUE_ULTRA_PALE}
                        borderColor={isExcursionDay ? "#B2EBF2" : BLUE_PALE}
                      />
                    </View>

                    {/* Loisir */}
                    {safeLocalActivity && (
                      <>
                        <View style={s.div} />
                        <View style={s.section}>
                          <View style={s.sectionLbl}>
                            <Text style={s.sectionEmoji}>🎮</Text>
                            <Text style={s.sectionTxt}>
                              Loisir & Divertissement
                            </Text>
                            <View style={s.localBadge}>
                              <Text style={s.localBadgeTxt}>📍 Local</Text>
                            </View>
                          </View>
                          <View style={s.localActCard}>
                            <Text style={s.localActName}>
                              {safeLocalActivity.name}
                            </Text>
                            {safeLocalActivity.description ? (
                              <Text style={s.localActDesc}>
                                {safeLocalActivity.description}
                              </Text>
                            ) : null}
                            {safeLocalActivity.prix &&
                            safeLocalActivity.prix !== "Variable" ? (
                              <View style={s.localPrixBadge}>
                                <Text style={s.localPrixTxt}>
                                  💰 {safeLocalActivity.prix}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <MapPinButton
                            name={safeLocalActivity.name}
                            zone={d.ville}
                            color={LOCAL_ACT_TEXT}
                            bgColor={LOCAL_ACT_BG}
                            borderColor={LOCAL_PRIX_BORDER}
                          />
                        </View>
                      </>
                    )}

                    {/* Conseil excursion */}
                    {isExcursionDay && d.conseil && (
                      <>
                        <View style={s.div} />
                        <View style={s.section}>
                          <View style={s.sectionLbl}>
                            <Text style={s.sectionEmoji}>💡</Text>
                            <Text style={s.sectionTxt}>Conseil du jour</Text>
                          </View>
                          <View
                            style={[
                              s.conseilCard,
                              {
                                backgroundColor: "#E1F5FE",
                                borderLeftColor: "#0288D1",
                              },
                            ]}
                          >
                            <Text style={[s.conseilTxt, { color: "#01579B" }]}>
                              {d.conseil}
                            </Text>
                          </View>
                        </View>
                      </>
                    )}

                    {/* Transport */}
                    {(isFirstCity || isExcursionDay) && d.transport && (
                      <>
                        <View style={s.div} />
                        <View style={s.section}>
                          <View style={s.sectionLbl}>
                            <Text style={s.sectionEmoji}>🚌</Text>
                            <Text style={s.sectionTxt}>
                              {isExcursionDay
                                ? `Transport vers ${excCity}`
                                : `Transport — ${d.ville}`}
                            </Text>
                          </View>
                          <View
                            style={[
                              s.conseilCard,
                              {
                                backgroundColor: isExcursionDay
                                  ? "#E0F7FA"
                                  : "#EFF6FF",
                                borderLeftColor: isExcursionDay
                                  ? "#0891B2"
                                  : "#3B82F6",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                s.conseilTxt,
                                {
                                  color: isExcursionDay ? "#006064" : "#1E40AF",
                                },
                              ]}
                            >
                              {d.transport}
                            </Text>
                          </View>
                        </View>
                      </>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {confirmed && saveSuccess && (
          <View style={s.confirmedBox}>
            <View style={s.confirmedIcon}>
              <Text style={s.confirmedCheck}>✓</Text>
            </View>
            <Text style={s.confirmedTitle}>Itinéraire sauvegardé !</Text>
            <Text style={s.confirmedSub}>
              Votre plan a été ajouté à vos anciens plans.
              {inviteCode ? " Les invités ont été notifiés par email." : ""}
            </Text>
            <View style={s.confirmedBtns}>
              <TouchableOpacity
                onPress={() => router.push("/ancienplan")}
                style={{ flex: 1 }}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={["#0A4DBF", "#1a6aff"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.confirmedPrimary}
                >
                  <Text style={s.confirmedPrimaryTxt}>Mes anciens plans</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.confirmedSecondary}
                onPress={handleCancel}
                activeOpacity={0.8}
              >
                <Text style={s.confirmedSecondaryTxt}>Nouveau plan</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDU PRINCIPAL
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F0F5FC" }}
      contentContainerStyle={s.container}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={["#021B4E", "#042A66"]} style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={s.backTxt}>←</Text>
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>Planificateur IA</Text>
            <View style={s.headerSubRow}>
              <Text style={s.headerSub} numberOfLines={1}>
                {destLabel} · {getNumDays()} jour{getNumDays() > 1 ? "s" : ""}
                {isGroupMode && nbParticipants > 0
                  ? ` · ${nbParticipants} pers.`
                  : ""}
              </Text>
              <View style={s.geminiBadgeHeader}>
                <Text style={s.geminiBadgeHeaderTxt}>✦ Gemini 2.5</Text>
              </View>
            </View>
          </View>
          <AppMenu inviteCode={inviteCode} />
        </View>
      </LinearGradient>

      <View style={s.content}>
        {loadingCities && (
          <View style={s.loadingBanner}>
            <ActivityIndicator size="small" color={BLUE_PRIMARY} />
            <Text style={s.loadingBannerTxt}>
              🔍 Chargement données pour {villes.join(", ")}…
            </Text>
          </View>
        )}

        {/* Carte résumé + bouton générer */}
        {!itinerary && (
          <View style={s.card}>
            <Text style={s.cardTitle}>
              {isMultiCityMode
                ? "🗺️ Voyage multi-villes"
                : isGroupMode
                  ? "🤝 Plan de groupe"
                  : "📋 Résumé du voyage"}
            </Text>
            <View style={s.grid}>
              {[
                { lbl: "Destination(s)", val: destLabel, icon: "📍" },
                { lbl: "Durée", val: `${getNumDays()} jour(s)`, icon: "📅" },
                {
                  lbl: "Arrivée",
                  val: hasEffectiveDateDebut
                    ? effectiveDateDebut.toLocaleDateString("fr-FR")
                    : "—",
                  icon: "🛫",
                },
                {
                  lbl: "Retour",
                  val: hasEffectiveDateFin
                    ? effectiveDateFin.toLocaleDateString("fr-FR")
                    : "—",
                  icon: "🛬",
                },
              ].map((item) => (
                <View key={item.lbl} style={s.gridCell}>
                  <Text style={s.gridEmoji}>{item.icon}</Text>
                  <Text style={s.gridLbl}>{item.lbl}</Text>
                  <Text style={s.gridVal} numberOfLines={2}>
                    {item.val}
                  </Text>
                </View>
              ))}
            </View>

            {(resolvedHotelName || resolvedCafeName) && (
              <View style={s.prePriorityBox}>
                <Text style={s.prePriorityTitle}>
                  🔒 Préférences nominatives détectées
                </Text>
                <View style={s.prePriorityRow}>
                  {resolvedHotelName && (
                    <View style={s.priorityBadgeHotel}>
                      <Text style={s.priorityBadgeHotelTxt}>
                        🏨 {resolvedHotelName}
                      </Text>
                    </View>
                  )}
                  {resolvedCafeName && (
                    <View style={s.priorityBadgeCafe}>
                      <Text style={s.priorityBadgeCafeTxt}>
                        ☕ {resolvedCafeName}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {allDisplayedPrefs.length > 0 && (
              <View style={s.prefsSection}>
                <View style={s.prefsSectionHeader}>
                  <Text style={s.prefsSectionTitle}>
                    👥 Préférences ({allDisplayedPrefs.length})
                  </Text>
                  {loadingPrefs && (
                    <ActivityIndicator size="small" color={BLUE_PRIMARY} />
                  )}
                </View>
                {allDisplayedPrefs
                  .filter((p) => p.role === "leader")
                  .map((pref, i) => (
                    <PrefCard key={`l-${i}`} pref={pref} index={i} />
                  ))}
                {allDisplayedPrefs
                  .filter((p) => p.role !== "leader")
                  .map((pref, i) => (
                    <PrefCard key={`g-${i}`} pref={pref} index={i} />
                  ))}
              </View>
            )}

            {loading && currentRagStep && (
              <View style={s.ragLoadingBox}>
                <Text style={s.ragLoadingStep}>
                  {ragStepLabels[currentRagStep]}
                </Text>
                <View style={s.ragLoadingStepsRow}>
                  {["RETRIEVE", "REASON", "PLAN", "GENERATE"].map((step) => (
                    <View
                      key={step}
                      style={[
                        s.ragLoadingDot,
                        {
                          backgroundColor:
                            step === currentRagStep ? GEMINI_COLOR : BLUE_PALE,
                        },
                      ]}
                    />
                  ))}
                </View>
              </View>
            )}

            <TouchableOpacity
              onPress={generateItinerary}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={
                  loading ? ["#7AA3E6", "#7AA3E6"] : [GEMINI_COLOR, "#0A4DBF"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.genBtn}
              >
                {loading ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <ActivityIndicator size="small" color={WHITE} />
                    <Text style={s.genBtnTxt}>Génération en cours…</Text>
                  </View>
                ) : (
                  <Text style={s.genBtnTxt}>
                    {isMultiCityMode
                      ? `✦ Générer — ${villes.length} villes`
                      : isGroupMode
                        ? `✦ Plan groupe Gemini 2.5 (${nbParticipants} pers.)`
                        : "✦ Générer l'itinéraire avec Gemini 2.5"}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {renderItinerary()}
      </View>

      {/* ── Modal édition activité ────────────────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalAccent}>
              <Text style={s.modalAccentTxt}>✎</Text>
            </View>
            <Text style={s.modalTitle}>Modifier le programme</Text>
            <TextInput
              style={s.modalInput}
              value={newActivity}
              onChangeText={setNewActivity}
              placeholder="Nouveau programme…"
              placeholderTextColor={TEXT_MUTED}
              multiline
              numberOfLines={3}
            />
            <View style={s.modalBtns}>
              <TouchableOpacity
                style={s.modalCancel}
                onPress={() => {
                  setEditModalVisible(false);
                  setNewActivity("");
                }}
              >
                <Text style={s.modalCancelTxt}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={handleSaveEdit}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={["#0A4DBF", "#1a6aff"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.modalSave}
                >
                  <Text style={s.modalSaveTxt}>Enregistrer</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal nom + sauvegarde ────────────────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent
        visible={nameModalVisible}
        onRequestClose={() => setNameModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalAccent}>
              <Text style={s.modalAccentTxt}>✈</Text>
            </View>
            <Text style={s.modalTitle}>Nommez votre plan</Text>
            <Text style={s.modalSub}>
              Donnez un nom pour retrouver facilement cet itinéraire
            </Text>
            <TextInput
              style={s.modalInput}
              value={planName}
              onChangeText={setPlanName}
              placeholder={`Ex: Plan ${destLabel}`}
              placeholderTextColor={TEXT_MUTED}
              autoFocus
            />

            {inviteCode && (
              <View style={nm.shareInfo}>
                <Text style={nm.shareInfoIcon}>📧</Text>
                <Text style={nm.shareInfoTxt}>
                  Le plan sera partagé avec les invités du code{" "}
                  <Text style={{ fontWeight: "800" }}>{inviteCode}</Text> par
                  email.
                </Text>
              </View>
            )}

            {saveError && (
              <View style={nm.errorBox}>
                <Text style={nm.errorTxt}>⚠️ {saveError}</Text>
              </View>
            )}

            <View style={s.modalBtns}>
              <TouchableOpacity
                style={s.modalCancel}
                onPress={() => {
                  setNameModalVisible(false);
                  setPlanName("");
                }}
                disabled={isSaving}
              >
                <Text style={s.modalCancelTxt}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={handleSavePlan}
                disabled={isSaving}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={
                    isSaving ? ["#7AA3E6", "#7AA3E6"] : ["#0A4DBF", "#1a6aff"]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.modalSave}
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
                      <Text style={s.modalSaveTxt}>Enregistrement…</Text>
                    </View>
                  ) : (
                    <Text style={s.modalSaveTxt}>
                      Sauvegarder{inviteCode ? " & Notifier" : ""}
                    </Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal résultat notifications + code plan ──────────────────────── */}
      <Modal
        animationType="fade"
        transparent
        visible={showNotifModal}
        onRequestClose={() => setShowNotifModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={[s.modalAccent, { backgroundColor: "#16A34A" }]}>
              <Text style={s.modalAccentTxt}>✓</Text>
            </View>
            <Text style={s.modalTitle}>Plan sauvegardé !</Text>
            <Text style={s.modalSub}>
              Votre itinéraire a été enregistré avec succès.
            </Text>

            {planCode && (
              <View style={nm.planCodeBox}>
                <Text style={nm.planCodeLabel}>CODE DU PLAN</Text>
                <Text style={nm.planCodeValue}>{planCode}</Text>
                <Text style={nm.planCodeHint}>
                  Partagez ce code avec vos invités pour qu'ils accèdent au plan
                  dans l'app Pack&Go.
                </Text>
              </View>
            )}

            {notifResult && Object.keys(notifResult).length > 0 && (
              <View style={nm.notifBox}>
                <Text style={nm.notifTitle}>📧 Notifications envoyées</Text>
                {Object.entries(notifResult).map(([email, status]) => (
                  <View key={email} style={nm.notifRow}>
                    <Text style={nm.notifEmail} numberOfLines={1}>
                      {email}
                    </Text>
                    <View
                      style={[
                        nm.statusBadge,
                        {
                          backgroundColor:
                            status === "envoyé" ? "#D4F5E9" : "#FEE2E2",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          nm.statusTxt,
                          {
                            color: status === "envoyé" ? "#1B8A5A" : "#DC2626",
                          },
                        ]}
                      >
                        {status === "envoyé" ? "✓ Envoyé" : "✗ Échec"}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={s.modalBtns}>
              <TouchableOpacity
                style={s.modalCancel}
                onPress={() => {
                  setShowNotifModal(false);
                  router.push("/ancienplan");
                }}
              >
                <Text style={s.modalCancelTxt}>Mes plans</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => setShowNotifModal(false)}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={["#0A4DBF", "#1a6aff"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.modalSave}
                >
                  <Text style={s.modalSaveTxt}>Continuer</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal replan ─────────────────────────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent
        visible={replanModalVisible}
        onRequestClose={() => setReplanModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { paddingTop: 0, paddingBottom: 48 }]}>
            <View style={rp.modalHeader}>
              <View style={rp.modalHeaderIcon}>
                <Text style={rp.modalHeaderIconTxt}>↺</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={rp.modalHeaderTitle}>Refaire le plan</Text>
                <Text style={rp.modalHeaderSub}>
                  Choisissez les éléments à modifier
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setReplanModalVisible(false)}
                style={rp.closeBtn}
                activeOpacity={0.7}
              >
                <Text style={rp.closeBtnTxt}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={rp.divider} />
            <Text style={rp.sectionLabel}>ÉLÉMENTS À MODIFIER</Text>

            {(
              [
                {
                  key: "hotel" as const,
                  emoji: "🏨",
                  label: "Hôtel",
                  sub: "Changer l'hébergement",
                },
                {
                  key: "cafe" as const,
                  emoji: "☕",
                  label: "Café",
                  sub: "Modifier les pauses café",
                },
                {
                  key: "loisir" as const,
                  emoji: "🎮",
                  label: "Loisir & divertissement",
                  sub: "Remplacer les activités locales",
                },
                {
                  key: "activite" as const,
                  emoji: "🎯",
                  label: "Activité principale",
                  sub: "Régénérer via Gemini 2.5",
                },
              ] as const
            ).map((item) => {
              const checked = replanChoices[item.key];
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[rp.choiceRow, checked && rp.choiceRowChecked]}
                  onPress={() =>
                    setReplanChoices((prev) => ({
                      ...prev,
                      [item.key]: !prev[item.key],
                    }))
                  }
                  activeOpacity={0.75}
                >
                  <View style={[rp.checkbox, checked && rp.checkboxChecked]}>
                    {checked && <Text style={rp.checkmark}>✓</Text>}
                  </View>
                  <Text style={rp.choiceEmoji}>{item.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[rp.choiceLabel, checked && rp.choiceLabelChecked]}
                    >
                      {item.label}
                    </Text>
                    <Text style={rp.choiceSub}>{item.sub}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={rp.selectAllRow}
              onPress={() => {
                const allChecked = Object.values(replanChoices).every(Boolean);
                setReplanChoices({
                  hotel: !allChecked,
                  cafe: !allChecked,
                  loisir: !allChecked,
                  activite: !allChecked,
                });
              }}
              activeOpacity={0.7}
            >
              <View
                style={[
                  rp.checkbox,
                  Object.values(replanChoices).every(Boolean) &&
                    rp.checkboxChecked,
                ]}
              >
                {Object.values(replanChoices).every(Boolean) && (
                  <Text style={rp.checkmark}>✓</Text>
                )}
              </View>
              <Text style={rp.selectAllTxt}>
                {Object.values(replanChoices).every(Boolean)
                  ? "Tout désélectionner"
                  : "Tout sélectionner"}
              </Text>
            </TouchableOpacity>

            <View style={rp.divider} />

            {!Object.values(replanChoices).some(Boolean) && (
              <View style={rp.infoBox}>
                <Text style={rp.infoTxt}>
                  ℹ️ Sans sélection, le plan entier sera réinitialisé.
                </Text>
              </View>
            )}

            <View style={s.modalBtns}>
              <TouchableOpacity
                style={s.modalCancel}
                onPress={() => {
                  setReplanModalVisible(false);
                  setReplanChoices({
                    hotel: false,
                    cafe: false,
                    loisir: false,
                    activite: false,
                  });
                }}
                activeOpacity={0.8}
              >
                <Text style={s.modalCancelTxt}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={handleReplan}
                disabled={replanLoading}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={
                    replanLoading
                      ? ["#7AA3E6", "#7AA3E6"]
                      : ["#0A4DBF", "#1a6aff"]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.modalSave}
                >
                  {replanLoading ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <ActivityIndicator size="small" color={WHITE} />
                      <Text style={s.modalSaveTxt}>Modification…</Text>
                    </View>
                  ) : (
                    <Text style={s.modalSaveTxt}>
                      {Object.values(replanChoices).some(Boolean)
                        ? `↺ Modifier (${Object.values(replanChoices).filter(Boolean).length})`
                        : "↺ Réinitialiser"}
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

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════
const nm = StyleSheet.create({
  shareInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#EEF4FF",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: BLUE_PALE,
    marginBottom: 12,
    width: "100%",
  },
  shareInfoIcon: { fontSize: 16 },
  shareInfoTxt: { flex: 1, fontSize: 12, color: BLUE_DEEP, lineHeight: 18 },
  errorBox: {
    backgroundColor: "#FEE2E2",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    width: "100%",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorTxt: { fontSize: 12, color: "#DC2626" },
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

const rb = StyleSheet.create({
  container: {
    backgroundColor: "#FFFBEB",
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "#FDE68A",
  },
  header: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { fontSize: 18 },
  title: { fontSize: 13, fontWeight: "700", color: "#92400E" },
  sub: { fontSize: 11, color: "#B45309", marginTop: 2 },
  chevron: { color: "#B45309", fontSize: 10 },
  body: {
    padding: 12,
    paddingTop: 4,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: "#FDE68A",
  },
  row: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  label: { fontSize: 12, color: "#92400E", fontWeight: "700", width: 120 },
  value: { flex: 1, fontSize: 12, color: "#78350F" },
  conflictBox: {
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  conflictTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#92400E",
    marginBottom: 4,
  },
  conflictTxt: { fontSize: 11, color: "#B45309", lineHeight: 16 },
});

const rt = StyleSheet.create({
  container: {
    backgroundColor: "#0C1829",
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1A2B45",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  modelBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  geminiBadge: { backgroundColor: "#1A73E822" },
  fallbackBadge: { backgroundColor: "#F59E0B22" },
  modelBadgeTxt: { fontSize: 11, fontWeight: "800", color: "#1A73E8" },
  headerTitle: { fontSize: 13, fontWeight: "700", color: "#C8D8F0" },
  stepsRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chevron: { color: "#4A6080", fontSize: 11, marginLeft: 6 },
  stepsContainer: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#111E31",
    borderRadius: 12,
    padding: 10,
  },
  stepIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  stepEmoji: { fontSize: 16 },
  stepTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 3,
  },
  stepName: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  stepMs: { fontSize: 10, color: "#4A6080" },
  confBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  confTxt: { fontSize: 10, fontWeight: "700" },
  stepAction: { fontSize: 11, color: "#7A90B4", marginBottom: 2 },
  stepResult: { fontSize: 11, color: "#4A6080", lineHeight: 15 },
});

const mStyles = StyleSheet.create({
  trigger: {
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
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
  icon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  label: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  sub: { fontSize: 11, color: "#4A6080", marginTop: 2 },
  sep: {
    height: 1,
    backgroundColor: "#1A2B45",
    marginVertical: 4,
    marginHorizontal: 16,
  },
});

const ps = StyleSheet.create({
  guestPrefCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: BLUE_PALE,
  },
  prefHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  guestPrefAvatar: { fontSize: 22 },
  guestPrefName: { fontSize: 14, fontWeight: "700", color: BLUE_DEEP },
  guestPrefEmail: { fontSize: 11, color: "#7A90B4" },
  roleBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  prefTagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  prefTag: {
    backgroundColor: "#EEF4FF",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  prefTagText: { fontSize: 12, color: BLUE_DEEP, fontWeight: "500" },
});

const rp = StyleSheet.create({
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: BLUE_DEEP,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 18,
    width: "100%",
    marginHorizontal: -20,
  },
  modalHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalHeaderIconTxt: { color: WHITE, fontSize: 20, fontWeight: "700" },
  modalHeaderTitle: { fontSize: 17, fontWeight: "800", color: WHITE },
  modalHeaderSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  closeBtnTxt: { color: WHITE, fontSize: 13, fontWeight: "700" },
  divider: {
    height: 1,
    backgroundColor: BLUE_PALE,
    width: "100%",
    marginVertical: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: TEXT_MUTED,
    letterSpacing: 1.2,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  choiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
    backgroundColor: BLUE_ULTRA_PALE,
    marginBottom: 8,
    width: "100%",
  },
  choiceRowChecked: { borderColor: BLUE_PRIMARY, backgroundColor: "#EEF4FF" },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#C5D0E8",
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: BLUE_PRIMARY, borderColor: BLUE_PRIMARY },
  checkmark: { color: WHITE, fontSize: 12, fontWeight: "800" },
  choiceEmoji: { fontSize: 20 },
  choiceLabel: { fontSize: 14, fontWeight: "600", color: BLUE_DEEP },
  choiceLabelChecked: { color: BLUE_PRIMARY },
  choiceSub: { fontSize: 11, color: TEXT_MUTED, marginTop: 2 },
  selectAllRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    width: "100%",
  },
  selectAllTxt: { fontSize: 13, color: BLUE_PRIMARY, fontWeight: "600" },
  infoBox: {
    backgroundColor: "#FFF8E8",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FFE082",
    width: "100%",
    marginBottom: 8,
  },
  infoTxt: { fontSize: 12, color: "#7B5800", lineHeight: 18 },
});

const s = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: "#F0F5FC", paddingBottom: 60 },
  header: {
    paddingTop: Platform.OS === "ios" ? 56 : 36,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  backTxt: { color: WHITE, fontSize: 20, fontWeight: "600" },
  headerCenter: { alignItems: "center", flex: 1, paddingHorizontal: 8 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: WHITE },
  headerSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 3,
  },
  headerSub: { fontSize: 11, color: "rgba(255,255,255,0.55)" },
  geminiBadgeHeader: {
    backgroundColor: "rgba(26,115,232,0.3)",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(26,115,232,0.5)",
  },
  geminiBadgeHeaderTxt: { fontSize: 9, fontWeight: "800", color: "#93C5FD" },
  content: { flex: 1, padding: 16, gap: 16 },
  loadingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: BLUE_PALE,
  },
  loadingBannerTxt: {
    fontSize: 12,
    color: BLUE_PRIMARY,
    flex: 1,
    lineHeight: 18,
  },
  card: {
    backgroundColor: WHITE,
    borderRadius: 20,
    padding: 20,
    shadowColor: BLUE_PRIMARY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
    borderWidth: 1,
    borderColor: "rgba(10,77,191,0.05)",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: BLUE_DEEP,
    marginBottom: 16,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  gridCell: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: BLUE_PALE,
  },
  gridEmoji: { fontSize: 18, marginBottom: 4 },
  gridLbl: {
    fontSize: 11,
    color: TEXT_MUTED,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  gridVal: { fontSize: 14, fontWeight: "700", color: BLUE_DEEP },
  prePriorityBox: {
    backgroundColor: "#FFFBEB",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#FDE68A",
    marginBottom: 14,
    gap: 8,
  },
  prePriorityTitle: { fontSize: 13, fontWeight: "800", color: "#92400E" },
  prePriorityRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  priorityBanner: {
    backgroundColor: "#FFFBEB",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#FDE68A",
    marginBottom: 16,
    gap: 6,
  },
  priorityBannerTitle: { fontSize: 13, fontWeight: "800", color: "#92400E" },
  priorityBannerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  priorityBadgeHotel: {
    backgroundColor: "#FFF0F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: "#FFCCCC",
  },
  priorityBadgeHotelTxt: { fontSize: 12, color: "#B91C1C", fontWeight: "700" },
  priorityBadgeCafe: {
    backgroundColor: "#FFF8E8",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: "#FDE68A",
  },
  priorityBadgeCafeTxt: { fontSize: 12, color: "#92400E", fontWeight: "700" },
  prefsSection: {
    backgroundColor: "#F0F5FC",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: BLUE_PALE,
    gap: 8,
  },
  prefsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  prefsSectionTitle: { fontSize: 14, fontWeight: "800", color: BLUE_DEEP },
  ragLoadingBox: {
    backgroundColor: GEMINI_PALE,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#C5D8F8",
    marginBottom: 12,
    alignItems: "center",
    gap: 8,
  },
  ragLoadingStep: { fontSize: 13, fontWeight: "600", color: GEMINI_COLOR },
  ragLoadingStepsRow: { flexDirection: "row", gap: 6 },
  ragLoadingDot: { width: 8, height: 8, borderRadius: 4 },
  genBtn: { borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  genBtnTxt: { color: WHITE, fontWeight: "800", fontSize: 15 },
  aiBox: {
    backgroundColor: GEMINI_PALE,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#93C5FD",
    marginBottom: 16,
  },
  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  aiEmoji: { fontSize: 18 },
  aiTitle: { fontSize: 14, fontWeight: "700", color: GEMINI_COLOR },
  aiText: { fontSize: 13, color: "#1E40AF", lineHeight: 20 },
  groupBox: {
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: BLUE_PALE,
    marginBottom: 16,
    gap: 6,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: BLUE_DEEP,
    marginBottom: 4,
  },
  groupItem: { fontSize: 12, color: TEXT_MUTED },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  btnConfirm: { flex: 2, minWidth: 140, borderRadius: 12, overflow: "hidden" },
  btnGrad: {
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  btnGradIcon: { color: WHITE, fontSize: 14, fontWeight: "700" },
  btnGradText: { color: WHITE, fontWeight: "700", fontSize: 14 },
  btnMod: {
    flex: 1,
    minWidth: 90,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 12,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
  },
  btnModIcon: { color: BLUE_PRIMARY, fontSize: 14 },
  btnModText: { color: BLUE_PRIMARY, fontWeight: "700", fontSize: 13 },
  btnCancel: {
    flex: 1,
    minWidth: 90,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#FFF0F0",
    borderRadius: 12,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: "#FFCCCC",
  },
  btnCancelIcon: { color: "#E05555", fontSize: 16, fontWeight: "700" },
  btnCancelText: { color: "#E05555", fontWeight: "700", fontSize: 13 },
  modBanner: {
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
    marginBottom: 16,
    gap: 10,
  },
  modBannerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BLUE_PRIMARY,
  },
  modTitle: { fontSize: 15, fontWeight: "800", color: BLUE_DEEP },
  modSub: { fontSize: 13, color: TEXT_MUTED },
  addDayBtn: {
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
  },
  addDayTxt: { color: BLUE_PRIMARY, fontWeight: "700", fontSize: 14 },
  saveModBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  saveModTxt: { color: WHITE, fontWeight: "800", fontSize: 15 },
  noModTxt: {
    fontSize: 13,
    color: TEXT_MUTED,
    textAlign: "center",
    fontStyle: "italic",
  },
  cityHeader: { marginBottom: 8, borderRadius: 14, overflow: "hidden" },
  cityHeaderGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  cityHeaderEmoji: { fontSize: 20 },
  cityHeaderName: { fontSize: 18, fontWeight: "800", flex: 1 },
  cityHeaderBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  cityHeaderBadgeTxt: { fontSize: 11, fontWeight: "700" },
  dayCard: {
    backgroundColor: WHITE,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: BLUE_PRIMARY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 5,
    borderWidth: 1,
    borderColor: "rgba(10,77,191,0.06)",
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  dayNum: { fontSize: 16, fontWeight: "800", color: WHITE },
  dayVille: { fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  editChip: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  editChipTxt: { color: WHITE, fontSize: 12, fontWeight: "600" },
  excursionBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    marginRight: 6,
  },
  excursionBadgeTxt: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  excursionInfoBanner: {
    backgroundColor: "#E0F7FA",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#B2EBF2",
  },
  excursionInfoTxt: { fontSize: 12, color: "#006064", lineHeight: 18 },
  dayBody: { padding: 16, gap: 0 },
  section: { paddingVertical: 4 },
  sectionLbl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  sectionEmoji: { fontSize: 16 },
  sectionTxt: { fontSize: 14, fontWeight: "700", color: BLUE_DEEP },
  div: { height: 1, backgroundColor: BLUE_ULTRA_PALE, marginVertical: 12 },
  infoCard: {
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: BLUE_PALE,
    gap: 6,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  infoName: { fontSize: 15, fontWeight: "800", color: BLUE_DEEP, flex: 1 },
  infoStars: { fontSize: 13 },
  infoDesc: { fontSize: 12, color: TEXT_MUTED, lineHeight: 18 },
  prixBadge: {
    backgroundColor: "#FFF0D6",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#FFD18C",
  },
  prixTxt: { fontSize: 11, fontWeight: "700", color: "#8B5E00" },
  actCard: {
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: BLUE_PRIMARY,
  },
  actCardEdit: { backgroundColor: "#FFF8E8", borderLeftColor: "#F59E0B" },
  actCardExcursion: {
    backgroundColor: "#E0F7FA",
    borderLeftColor: EXCURSION_COLOR,
  },
  actTxt: { fontSize: 14, fontWeight: "600", color: BLUE_DEEP, lineHeight: 20 },
  actHint: {
    fontSize: 11,
    color: "#B45309",
    marginTop: 6,
    fontStyle: "italic",
  },
  geminiBadgeInline: {
    backgroundColor: "rgba(26,115,232,0.12)",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(26,115,232,0.3)",
    marginLeft: 4,
  },
  geminiBadgeInlineTxt: { fontSize: 9, fontWeight: "800", color: GEMINI_COLOR },
  localBadge: {
    backgroundColor: "rgba(124,58,237,0.12)",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.3)",
    marginLeft: 4,
  },
  localBadgeTxt: { fontSize: 9, fontWeight: "800", color: PURPLE },
  localActCard: {
    backgroundColor: LOCAL_ACT_BG,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: LOCAL_ACT_BORDER,
    gap: 6,
  },
  localActName: {
    fontSize: 14,
    fontWeight: "700",
    color: LOCAL_ACT_TEXT,
    lineHeight: 20,
  },
  localActDesc: { fontSize: 12, color: LOCAL_ACT_HINT, lineHeight: 18 },
  localPrixBadge: {
    backgroundColor: LOCAL_PRIX_BG,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: LOCAL_PRIX_BORDER,
    alignSelf: "flex-start",
  },
  localPrixTxt: { fontSize: 12, fontWeight: "700", color: LOCAL_PRIX_TEXT },
  conseilCard: {
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#F59E0B",
  },
  conseilTxt: {
    fontSize: 13,
    color: "#92400E",
    lineHeight: 18,
    fontStyle: "italic",
  },
  confirmedBox: {
    backgroundColor: WHITE,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
    marginTop: 8,
    shadowColor: BLUE_PRIMARY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 6,
  },
  confirmedIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BLUE_PRIMARY,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  confirmedCheck: { fontSize: 24, color: WHITE, fontWeight: "700" },
  confirmedTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: BLUE_DEEP,
    marginBottom: 6,
  },
  confirmedSub: {
    fontSize: 13,
    color: TEXT_MUTED,
    marginBottom: 20,
    textAlign: "center",
  },
  confirmedBtns: { flexDirection: "row", gap: 12, width: "100%" },
  confirmedPrimary: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  confirmedPrimaryTxt: { color: WHITE, fontWeight: "700", fontSize: 14 },
  confirmedSecondary: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
    backgroundColor: BLUE_ULTRA_PALE,
  },
  confirmedSecondaryTxt: {
    color: BLUE_PRIMARY,
    fontWeight: "700",
    fontSize: 14,
  },
  globalHotelBox: {
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BLUE_PALE,
  },
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
    shadowColor: "#021B4E",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 20,
  },
  modalAccent: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: BLUE_PRIMARY,
    justifyContent: "center",
    alignItems: "center",
    marginTop: -52,
    marginBottom: 16,
  },
  modalAccentTxt: { fontSize: 22, color: WHITE },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: BLUE_DEEP,
    marginBottom: 6,
  },
  modalSub: {
    fontSize: 13,
    color: TEXT_MUTED,
    textAlign: "center",
    marginBottom: 18,
  },
  modalInput: {
    width: "100%",
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    color: BLUE_DEEP,
    backgroundColor: BLUE_ULTRA_PALE,
    minHeight: 52,
    textAlignVertical: "top",
    marginBottom: 18,
  },
  modalBtns: { flexDirection: "row", gap: 12, width: "100%" },
  modalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#FFF0F0",
    borderWidth: 1.5,
    borderColor: "#FFCCCC",
  },
  modalCancelTxt: { color: "#E05555", fontWeight: "700", fontSize: 15 },
  modalSave: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  modalSaveTxt: { color: WHITE, fontWeight: "800", fontSize: 15 },
});

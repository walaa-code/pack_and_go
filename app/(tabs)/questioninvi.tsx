import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
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

/* ── Imports des données locales ── */
import cafesData from "../../data/cafee.json";
import hotelsData from "../../data/hotels.json";

/* ─────────────────────────────────────────────
   FILTRAGE HÔTELS
───────────────────────────────────────────── */
function hotelTypeToStars(type: string): number | null {
  const t = type.toLowerCase();
  if (t.includes("luxe")) return 5;
  if (t.includes("standard")) return 4;
  if (t.includes("maison")) return 3;
  return null;
}

function countStarsFromString(stars: string): number {
  const m = stars.match(/\d/);
  return m ? parseInt(m[0]) : 3;
}

const LOCATION_KEYWORDS: Record<string, string[]> = {
  "centre-ville": [
    "centre",
    "urbain",
    "ville",
    "médina",
    "boulevard",
    "avenue",
  ],
  plage: ["plage", "mer", "balnéaire", "bord de mer", "marina", "côte"],
  montagne: ["montagne", "forêt", "nature", "altitude"],
  attractions: ["golf", "marina", "parc", "animation", "aquapark", "aqua"],
};

function filterHotelsByPrefs(
  ville: string,
  type: string,
  location: string,
): { name: string; stars: string; description: string }[] {
  if (!ville) return [];
  const lower = ville.toLowerCase().trim();
  const key = Object.keys(hotelsData).find(
    (k) => k.toLowerCase().trim() === lower,
  );
  if (!key) return [];

  const seen = new Set<string>();
  let hotels = (hotelsData as any)[key].filter((h: any) => {
    if (!h.name) return false;
    if (seen.has(h.name)) return false;
    seen.add(h.name);
    return true;
  });

  const targetStars = hotelTypeToStars(type);
  if (targetStars !== null) {
    const exact = hotels.filter(
      (h: any) => countStarsFromString(h.stars ?? "3") === targetStars,
    );
    if (exact.length > 0) {
      hotels = exact;
    } else {
      const loose = hotels.filter(
        (h: any) =>
          Math.abs(countStarsFromString(h.stars ?? "3") - targetStars) <= 1,
      );
      if (loose.length > 0) hotels = loose;
    }
  }

  if (location) {
    const loc = location.toLowerCase();
    const kws = LOCATION_KEYWORDS[loc] ?? [loc];
    const filtered = hotels.filter((h: any) => {
      const desc = (h.description ?? "").toLowerCase();
      return kws.some((kw: string) => desc.includes(kw));
    });
    if (filtered.length > 0) hotels = filtered;
  }

  return hotels;
}

/* ─────────────────────────────────────────────
   FILTRAGE CAFÉS
───────────────────────────────────────────── */
function getCafeTypeFromPrice(prix: string): string {
  const nums = prix.match(/\d+/g);
  if (!nums || nums.length < 2) return "Normal";
  const max = parseInt(nums[1]);
  if (max > 10) return "Luxe";
  if (max >= 5) return "Normal";
  const min = parseInt(nums[0]);
  if (min >= 4) return "Coffee Shop";
  return "Normal";
}

interface CafeItem {
  name: string;
  type: string;
  prix: string;
  zone: string;
  description: string;
}

function filterCafesByPrefs(
  ville: string,
  selectedTypes: string[],
): CafeItem[] {
  if (!ville) return [];
  const lower = ville.toLowerCase().trim();
  const key = Object.keys(cafesData).find(
    (k) => k.toLowerCase().trim() === lower,
  );
  if (!key) return [];

  const seen = new Set<string>();
  let cafes: CafeItem[] = (cafesData as any)[key]
    .filter((c: any) => {
      const name = c.Nom ?? c.name;
      if (!name) return false;
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .map((c: any) => ({
      name: c.Nom ?? c.name ?? "",
      type: getCafeTypeFromPrice(c.Prix ?? c.prix ?? "3 – 8 TND"),
      prix: c.Prix ?? c.prix ?? "",
      zone: c.Zone ?? c.zone ?? "",
      description: c.description ?? "",
    }));

  if (selectedTypes.length > 0) {
    const filtered = cafes.filter((c) =>
      selectedTypes.some((t) => t.toLowerCase() === c.type.toLowerCase()),
    );
    if (filtered.length > 0) cafes = filtered;
  }

  return cafes;
}

/* ─── Constantes ─── */
const HOTEL_TYPES = ["Luxe", "Standard", "Maison"] as const;
const LOCATIONS = ["Centre-ville", "Plage", "Montagne", "Attractions"] as const;
const ACTIVITIES = ["Détente", "Culture", "Aventure", "Shopping"] as const;
const CAFE_TYPES = ["Luxe", "Normal", "Coffee Shop"] as const;
const YES_NO = ["Oui", "Non"] as const;
const AGE_RANGES = [
  "Moins de 18 ans",
  "18 – 25 ans",
  "26 – 35 ans",
  "36 – 50 ans",
  "51 – 65 ans",
  "65 ans et +",
] as const;

const HOTEL_ICONS: Record<string, string> = {
  Luxe: "✦",
  Standard: "◈",
  Maison: "⌂",
};
const LOCATION_ICONS: Record<string, string> = {
  "Centre-ville": "🏙",
  Plage: "🌊",
  Montagne: "⛰",
  Attractions: "🎡",
};
const ACTIVITY_ICONS: Record<string, string> = {
  Détente: "☀",
  Culture: "🏛",
  Aventure: "⚡",
  Shopping: "◎",
};
const CAFE_ICONS: Record<string, string> = {
  Luxe: "✦",
  Normal: "◉",
  "Coffee Shop": "☕",
};
const AGE_ICONS: Record<string, string> = {
  "Moins de 18 ans": "🧒",
  "18 – 25 ans": "🧑",
  "26 – 35 ans": "👨",
  "36 – 50 ans": "🧔",
  "51 – 65 ans": "🧓",
  "65 ans et +": "👴",
};
const CAFE_TYPE_EMOJI: Record<string, string> = {
  Luxe: "✦",
  Normal: "◉",
  "Coffee Shop": "☕",
};

/* ─── Palette ─── */
const BLUE_DEEP = "#042A66";
const BLUE_PRIMARY = "#0A4DBF";
const BLUE_LIGHT = "#3B72E8";
const BLUE_PALE = "#D6E4FF";
const BLUE_ULTRA_PALE = "#EEF4FF";
const BG = "#F0F5FC";
const WHITE = "#FFFFFF";
const TEXT_MUTED = "#7A90B4";
const MENU_TEXT_MUTED = "#4A6080";

/* ─────────────────────────────────────────────
   MENU
───────────────────────────────────────────── */
function AppMenuDark({
  onChatbot,
  onChangePassword,
  onLogout,
}: {
  onChatbot: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);

  const MENU_ITEMS = [
    {
      icon: "robot-outline" as const,
      label: "Assistant IA",
      sub: "Posez vos questions voyage",
      color: BLUE_PRIMARY,
      onPress: () => {
        setOpen(false);
        onChatbot();
      },
    },
    {
      icon: "lock-reset" as const,
      label: "Modifier le mot de passe",
      sub: "Changer vos identifiants",
      color: "#F59E0B",
      onPress: () => {
        setOpen(false);
        onChangePassword();
      },
    },
    {
      icon: "logout" as const,
      label: "Se déconnecter",
      sub: "Quitter l'application",
      color: "#EF4444",
      onPress: () => {
        setOpen(false);
        onLogout();
      },
      danger: true,
    },
  ];

  return (
    <View style={menuStyles.wrapper}>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={menuStyles.trigger}
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
          style={menuStyles.backdrop}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View style={menuStyles.dropdown}>
            <View style={menuStyles.dropdownHeader}>
              <MaterialCommunityIcons
                name="cog-outline"
                size={14}
                color={MENU_TEXT_MUTED}
              />
              <Text style={menuStyles.dropdownHeaderText}>OPTIONS</Text>
            </View>
            {MENU_ITEMS.map((item, idx) => (
              <React.Fragment key={item.label}>
                {idx === MENU_ITEMS.length - 1 && (
                  <View style={menuStyles.divider} />
                )}
                <TouchableOpacity
                  style={menuStyles.menuItem}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      menuStyles.menuIcon,
                      { backgroundColor: `${item.color}22` },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={item.icon as any}
                      size={20}
                      color={item.color}
                    />
                  </View>
                  <View style={menuStyles.menuText}>
                    <Text
                      style={[
                        menuStyles.menuLabel,
                        item.danger && { color: "#EF4444" },
                      ]}
                    >
                      {item.label}
                    </Text>
                    <Text style={menuStyles.menuSub}>{item.sub}</Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={16}
                    color={MENU_TEXT_MUTED}
                  />
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const menuStyles = StyleSheet.create({
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  dropdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1A2B45",
    marginBottom: 4,
  },
  dropdownHeaderText: {
    color: "#4A6080",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  menuText: { flex: 1 },
  menuLabel: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  menuSub: { fontSize: 11, color: "#4A6080", marginTop: 2 },
  divider: {
    height: 1,
    backgroundColor: "#1A2B45",
    marginVertical: 4,
    marginHorizontal: 16,
  },
});

export default function QuestionInviScreen() {
  const router = useRouter();
  const { travelData, setTravelData } = useTravelData();

  // ✅ FIX : résoudre userId depuis travelData avec validation
  const uid: number | null = (() => {
    const raw = (travelData as any).userId;
    if (raw === null || raw === undefined) return null;
    const n = Number(raw);
    return !isNaN(n) && n > 0 ? n : null;
  })();

  const [hotelType, setHotelType] = useState("");
  const [hotelLocation, setHotelLocation] = useState("");
  const [voyageType, setVoyageType] = useState("");
  const [activityTypes, setActivityTypes] = useState<string[]>([]);
  const [cafeLevels, setCafeLevels] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [hotel, setHotel] = useState("");
  const [cafe, setCafe] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [hotelModalVisible, setHotelModalVisible] = useState(false);
  const [cafeModalVisible, setCafeModalVisible] = useState(false);

  const cityHotels = filterHotelsByPrefs(
    travelData.ville || "",
    hotelType,
    hotelLocation,
  );
  const cityCafes = filterCafesByPrefs(travelData.ville || "", cafeLevels);

  const handleChatbot = () => router.push("/chatbot");
  const handleChangePassword = () => router.push("/reset-password");
  const handleLogout = () => {
    Alert.alert("Déconnexion", "Êtes-vous sûr de vouloir vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Oui", style: "destructive", onPress: () => router.replace("/") },
    ]);
  };

  const toggle = (
    item: string,
    list: string[],
    setList: (v: string[]) => void,
  ) =>
    setList(
      list.includes(item) ? list.filter((i) => i !== item) : [...list, item],
    );

  const handleHotelTypeChange = (v: string) => {
    setHotelType(v);
    setHotel("");
  };
  const handleHotelLocationChange = (v: string) => {
    setHotelLocation(v);
    setHotel("");
  };
  const handleCafeLevelToggle = (v: string) => {
    toggle(v, cafeLevels, setCafeLevels);
    setCafe("");
  };

  /* ══════════════════════════════════════════════════
     handleSubmit
  ══════════════════════════════════════════════════ */
  const handleSubmit = async () => {
    if (!hotelType || !hotelLocation || activityTypes.length === 0) {
      Alert.alert(
        "Information manquante",
        "Veuillez répondre aux questions obligatoires",
      );
      return;
    }
    if (budget && isNaN(Number(budget))) {
      Alert.alert(
        "Erreur",
        "Veuillez entrer un budget valide (chiffres uniquement)",
      );
      return;
    }

    // ✅ Log de vérification avant envoi
    console.log(
      "🔍 QuestionInvi handleSubmit — uid:",
      uid,
      "| inviteCode:",
      (travelData as any).inviteCode,
    );

    setTravelData({
      ...(travelData as any),
      hotelType,
      hotelLocation,
      activityTypes,
      cafeLevels,
      voyageType,
      budget: budget ? Number(budget) : null,
      hotel: hotel.trim(),
      cafe: cafe.trim(),
      ageRange,
      userId: uid, // ✅ on préserve userId dans le contexte
    } as any);

    try {
      const response = await fetch("${API}/api/save_group_preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invite_code: (travelData as any).inviteCode,
          user_id: uid, // ✅ jamais null si l'utilisateur est bien connecté
          email: (travelData as any).email || "",
          role: "invite",
          hotel_type: hotelType,
          hotel_location: hotelLocation,
          activity_types: activityTypes.join(", "),
          cafe_levels: cafeLevels.join(", "),
          voyage_type: voyageType,
          budget: budget ? Number(budget) : null,
          hotel_name: hotel.trim(),
          cafe_name: cafe.trim(),
          tranche_age: ageRange,
        }),
      });
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      console.log("✅ save_group_preferences invité OK — userId:", uid);
    } catch (e) {
      console.warn("Erreur save_group_preferences invité:", e);
    }

    router.push("/(tabs)/resumeinvi");
  };

  /* ── OptionGroup ── */
  const OptionGroup = ({
    title,
    options,
    selectedValue,
    onSelect,
    required = false,
    icons,
  }: {
    title: string;
    options: readonly string[];
    selectedValue: string;
    onSelect: (v: string) => void;
    required?: boolean;
    icons?: Record<string, string>;
  }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.questionTitle}>{title}</Text>
        {required ? (
          <View style={styles.requiredBadge}>
            <Text style={styles.requiredBadgeTxt}>Obligatoire</Text>
          </View>
        ) : (
          <View style={styles.optionalBadge}>
            <Text style={styles.optionalBadgeTxt}>Optionnel</Text>
          </View>
        )}
      </View>
      <View style={styles.optionsGrid}>
        {options.map((option) => {
          const sel = selectedValue === option;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.chip, sel && styles.chipSel]}
              onPress={() => onSelect(option)}
              activeOpacity={0.7}
            >
              {icons && (
                <Text style={[styles.chipIcon, sel && styles.chipIconSel]}>
                  {icons[option]}
                </Text>
              )}
              <Text style={[styles.chipTxt, sel && styles.chipTxtSel]}>
                {option}
              </Text>
              {sel && <View style={styles.chipDot} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  /* ── MultiOptionGroup ── */
  const MultiOptionGroup = ({
    title,
    options,
    selectedValues,
    onToggle,
    required = false,
    icons,
  }: {
    title: string;
    options: readonly string[];
    selectedValues: string[];
    onToggle: (v: string) => void;
    required?: boolean;
    icons?: Record<string, string>;
  }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.questionTitle}>{title}</Text>
        {required ? (
          <View style={styles.requiredBadge}>
            <Text style={styles.requiredBadgeTxt}>Obligatoire</Text>
          </View>
        ) : (
          <View style={styles.optionalBadge}>
            <Text style={styles.optionalBadgeTxt}>Optionnel</Text>
          </View>
        )}
      </View>
      <Text style={styles.subtitle}>Plusieurs choix possibles</Text>
      <View style={styles.optionsGrid}>
        {options.map((option) => {
          const sel = selectedValues.includes(option);
          return (
            <TouchableOpacity
              key={option}
              style={[styles.chip, sel && styles.chipSel]}
              onPress={() => onToggle(option)}
              activeOpacity={0.7}
            >
              {icons && (
                <Text style={[styles.chipIcon, sel && styles.chipIconSel]}>
                  {icons[option]}
                </Text>
              )}
              <Text style={[styles.chipTxt, sel && styles.chipTxtSel]}>
                {option}
              </Text>
              {sel && <View style={styles.chipDot} />}
            </TouchableOpacity>
          );
        })}
      </View>
      {selectedValues.length > 0 && (
        <View style={styles.pills}>
          {selectedValues.map((v) => (
            <View key={v} style={styles.pill}>
              <Text style={styles.pillTxt}>{v}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const StarBadge = () => {
    if (!hotelType) return null;
    const stars = hotelTypeToStars(hotelType);
    if (!stars) return null;
    return (
      <View style={styles.starBadge}>
        <Text style={styles.starBadgeText}>
          {"⭐".repeat(stars)} · {cityHotels.length} hôtel
          {cityHotels.length !== 1 ? "s" : ""} disponible
          {cityHotels.length !== 1 ? "s" : ""}
        </Text>
      </View>
    );
  };

  const CafeBadge = () => {
    if (cafeLevels.length === 0 && cityCafes.length === 0) return null;
    return (
      <View
        style={[
          styles.starBadge,
          { backgroundColor: "#F0FFF4", borderColor: "#BBF7D0" },
        ]}
      >
        <Text style={[styles.starBadgeText, { color: "#166534" }]}>
          ☕ {cityCafes.length} café{cityCafes.length !== 1 ? "s" : ""}{" "}
          disponible{cityCafes.length !== 1 ? "s" : ""}
          {cafeLevels.length > 0 ? ` · ${cafeLevels.join(", ")}` : ""}
        </Text>
      </View>
    );
  };

  const filledCount = [
    hotelType,
    hotelLocation,
    activityTypes.length > 0 ? "ok" : "",
  ].filter(Boolean).length;

  /* ══════════ RENDER ══════════ */
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: BG }}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.menuWrapper}>
          <AppMenuDark
            onChatbot={handleChatbot}
            onChangePassword={handleChangePassword}
            onLogout={handleLogout}
          />
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          {travelData.ville ? (
            <View style={styles.voyageBadge}>
              <Text style={styles.voyageBadgeTxt}>✈️ {travelData.ville}</Text>
              {(travelData as any).inviteCode ? (
                <Text style={styles.codeBadgeTxt}>
                  {" "}
                  · 🔑 {(travelData as any).inviteCode}
                </Text>
              ) : null}
            </View>
          ) : null}
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeTxt}>Personnalisation invité</Text>
          </View>
          <View style={styles.heroTitleRow}>
            <Image
              source={require("../../assets/logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <View>
              <Text style={styles.heroTitle}>Vos préférences</Text>
              <Text style={styles.heroSub}>Répondez pour personnaliser</Text>
            </View>
          </View>
          <View style={styles.progressWrap}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(filledCount / 3) * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.progressTxt}>{filledCount}/3 obligatoires</Text>
          </View>
        </View>

        {/* Profil du voyageur */}
        <SectionLabel label="Profil du voyageur" />
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.questionTitle}>🎂 Tranche d'âge</Text>
            <View style={styles.optionalBadge}>
              <Text style={styles.optionalBadgeTxt}>Optionnel</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>Sélectionnez votre groupe d'âge</Text>
          <View style={styles.ageGrid}>
            {AGE_RANGES.map((range) => {
              const isSelected = ageRange === range;
              return (
                <TouchableOpacity
                  key={range}
                  style={[styles.ageChip, isSelected && styles.ageChipSelected]}
                  onPress={() => setAgeRange(isSelected ? "" : range)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.ageChipEmoji}>{AGE_ICONS[range]}</Text>
                  <Text
                    style={[
                      styles.ageChipText,
                      isSelected && styles.ageChipTextSelected,
                    ]}
                  >
                    {range}
                  </Text>
                  {isSelected && (
                    <View style={styles.ageChipCheck}>
                      <Text style={styles.ageChipCheckTxt}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Hébergement */}
        <SectionLabel label="Hébergement" />
        <OptionGroup
          title="Type d'hôtel"
          options={HOTEL_TYPES}
          selectedValue={hotelType}
          onSelect={handleHotelTypeChange}
          required
          icons={HOTEL_ICONS}
        />
        <OptionGroup
          title="Localisation souhaitée"
          options={LOCATIONS}
          selectedValue={hotelLocation}
          onSelect={handleHotelLocationChange}
          required
          icons={LOCATION_ICONS}
        />

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.questionTitle}>🏨 Hôtel souhaité</Text>
            <View style={styles.optionalBadge}>
              <Text style={styles.optionalBadgeTxt}>Optionnel</Text>
            </View>
          </View>
          <StarBadge />
          {cityHotels.length > 0 ? (
            <>
              <TouchableOpacity
                style={[
                  styles.pickerBtn,
                  hotel ? styles.pickerBtnSelected : null,
                ]}
                onPress={() => setHotelModalVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.pickerBtnIcon}>🏨</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.pickerBtnText,
                      hotel ? styles.pickerBtnTextSelected : null,
                    ]}
                  >
                    {hotel
                      ? hotel
                      : hotelType || hotelLocation
                        ? `Choisir parmi les hôtels filtrés de ${travelData.ville}`
                        : `Choisir parmi les hôtels de ${travelData.ville}`}
                  </Text>
                  {hotel && (
                    <Text style={styles.pickerBtnSub}>
                      {"⭐".repeat(
                        countStarsFromString(
                          cityHotels.find((h) => h.name === hotel)?.stars ??
                            "3",
                        ),
                      )}
                    </Text>
                  )}
                </View>
                <Text style={styles.pickerChevron}>{hotel ? "✓" : "›"}</Text>
              </TouchableOpacity>
              {hotel && (
                <TouchableOpacity
                  onPress={() => setHotel("")}
                  style={styles.clearBtn}
                >
                  <Text style={styles.clearBtnText}>
                    ✕ Effacer la sélection
                  </Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              {(hotelType || hotelLocation) && travelData.ville ? (
                <View style={styles.noResultBanner}>
                  <Text style={styles.noResultBannerText}>
                    Aucun hôtel ne correspond exactement à vos critères pour{" "}
                    {travelData.ville}. Saisissez un nom manuellement ou ajustez
                    vos filtres.
                  </Text>
                </View>
              ) : null}
              <TextInput
                style={styles.input}
                placeholder="Nom de l'hôtel (saisie libre)"
                placeholderTextColor="#A8BDD8"
                value={hotel}
                onChangeText={setHotel}
                returnKeyType="next"
              />
            </>
          )}
        </View>

        {/* Activités & Style */}
        <SectionLabel label="Activités & Style" />
        <MultiOptionGroup
          title="Activités préférées"
          options={ACTIVITIES}
          selectedValues={activityTypes}
          onToggle={(v) => toggle(v, activityTypes, setActivityTypes)}
          required
          icons={ACTIVITY_ICONS}
        />
        <OptionGroup
          title="Voyage multi-villes ?"
          options={YES_NO}
          selectedValue={voyageType}
          onSelect={setVoyageType}
        />

        {/* Restauration & Budget */}
        <SectionLabel label="Restauration & Budget" />
        <MultiOptionGroup
          title="Types de café"
          options={CAFE_TYPES}
          selectedValues={cafeLevels}
          onToggle={handleCafeLevelToggle}
          icons={CAFE_ICONS}
        />

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.questionTitle}>Budget total</Text>
            <View style={styles.optionalBadge}>
              <Text style={styles.optionalBadgeTxt}>Optionnel</Text>
            </View>
          </View>
          <View style={styles.inputRow}>
            <Text style={styles.inputPrefix}>DT</Text>
            <TextInput
              style={styles.inputInline}
              placeholder="Montant en dinars"
              placeholderTextColor="#A8BDD8"
              value={budget}
              keyboardType="numeric"
              onChangeText={setBudget}
              returnKeyType="done"
            />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.questionTitle}>☕ Café proposé</Text>
            <View style={styles.optionalBadge}>
              <Text style={styles.optionalBadgeTxt}>Optionnel</Text>
            </View>
          </View>
          <CafeBadge />
          {cityCafes.length > 0 ? (
            <>
              <TouchableOpacity
                style={[
                  styles.pickerBtn,
                  cafe ? styles.pickerBtnSelected : null,
                ]}
                onPress={() => setCafeModalVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.pickerBtnIcon}>☕</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.pickerBtnText,
                      cafe ? styles.pickerBtnTextSelected : null,
                    ]}
                  >
                    {cafe
                      ? cafe
                      : `Choisir parmi les cafés de ${travelData.ville}`}
                  </Text>
                  {cafe && (
                    <Text style={styles.pickerBtnSub}>
                      {CAFE_TYPE_EMOJI[
                        cityCafes.find((c) => c.name === cafe)?.type ?? ""
                      ] ?? "☕"}{" "}
                      {cityCafes.find((c) => c.name === cafe)?.type ?? ""}
                      {" · "}
                      {cityCafes.find((c) => c.name === cafe)?.prix ?? ""}
                    </Text>
                  )}
                </View>
                <Text style={styles.pickerChevron}>{cafe ? "✓" : "›"}</Text>
              </TouchableOpacity>
              {cafe && (
                <TouchableOpacity
                  onPress={() => setCafe("")}
                  style={styles.clearBtn}
                >
                  <Text style={styles.clearBtnText}>
                    ✕ Effacer la sélection
                  </Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              {cafeLevels.length > 0 && travelData.ville ? (
                <View style={styles.noResultBanner}>
                  <Text style={styles.noResultBannerText}>
                    Aucun café ne correspond à vos critères pour{" "}
                    {travelData.ville}. Saisissez un nom manuellement ou ajustez
                    vos filtres.
                  </Text>
                </View>
              ) : null}
              <TextInput
                style={styles.input}
                placeholder="Nom du café (saisie libre)"
                placeholderTextColor="#A8BDD8"
                value={cafe}
                onChangeText={setCafe}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </>
          )}
        </View>

        {/* Bouton Submit */}
        <TouchableOpacity
          style={styles.submitBtn}
          onPress={handleSubmit}
          activeOpacity={0.85}
        >
          <View style={styles.submitInner}>
            <Text style={styles.submitTxt}>Voir le résumé</Text>
            <Text style={styles.submitArrow}>→</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          * Les champs obligatoires doivent être remplis pour continuer
        </Text>
      </ScrollView>

      {/* ═══ Modal hôtels ═══ */}
      <Modal
        visible={hotelModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setHotelModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  Hôtels à {travelData.ville}
                </Text>
                <Text style={styles.modalSub}>
                  {cityHotels.length} hôtel{cityHotels.length > 1 ? "s" : ""}{" "}
                  disponible{cityHotels.length > 1 ? "s" : ""}
                  {hotelType ? ` · ${hotelType}` : ""}
                  {hotelLocation ? ` · ${hotelLocation}` : ""}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setHotelModalVisible(false)}
              >
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.modalList}
              showsVerticalScrollIndicator={false}
            >
              {cityHotels.map((h) => {
                const isSelected = hotel === h.name;
                const starCount = countStarsFromString(h.stars ?? "3");
                return (
                  <TouchableOpacity
                    key={h.name}
                    style={[
                      styles.listItem,
                      isSelected && styles.listItemSelected,
                    ]}
                    onPress={() => {
                      setHotel(h.name);
                      setHotelModalVisible(false);
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={styles.listItemLeft}>
                      <View
                        style={[
                          styles.listItemIcon,
                          isSelected && styles.listItemIconSelected,
                        ]}
                      >
                        <Text style={styles.listItemIconTxt}>🏨</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.listItemName,
                            isSelected && styles.listItemNameSelected,
                          ]}
                        >
                          {h.name}
                        </Text>
                        <Text style={styles.listItemStars}>
                          {"⭐".repeat(starCount)}
                        </Text>
                        <Text style={styles.listItemDesc}>{h.description}</Text>
                      </View>
                    </View>
                    {isSelected && (
                      <View style={styles.listItemCheck}>
                        <Text style={styles.listItemCheckTxt}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══ Modal cafés ═══ */}
      <Modal
        visible={cafeModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCafeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  Cafés à {travelData.ville}
                </Text>
                <Text style={styles.modalSub}>
                  {cityCafes.length} café{cityCafes.length > 1 ? "s" : ""}{" "}
                  trouvé{cityCafes.length > 1 ? "s" : ""}
                  {cafeLevels.length > 0 ? ` · ${cafeLevels.join(", ")}` : ""}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setCafeModalVisible(false)}
              >
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.modalList}
              showsVerticalScrollIndicator={false}
            >
              {cityCafes.map((c) => {
                const isSelected = cafe === c.name;
                return (
                  <TouchableOpacity
                    key={c.name}
                    style={[
                      styles.listItem,
                      isSelected && styles.listItemSelected,
                    ]}
                    onPress={() => {
                      setCafe(c.name);
                      setCafeModalVisible(false);
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={styles.listItemLeft}>
                      <View
                        style={[
                          styles.listItemIcon,
                          isSelected && styles.listItemIconSelected,
                        ]}
                      >
                        <Text style={styles.listItemIconTxt}>☕</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.listItemName,
                            isSelected && styles.listItemNameSelected,
                          ]}
                        >
                          {c.name}
                        </Text>
                        <View style={styles.cafeTypeBadge}>
                          <Text style={styles.cafeTypeBadgeText}>
                            {CAFE_TYPE_EMOJI[c.type] ?? "☕"} {c.type}
                          </Text>
                        </View>
                        {c.zone ? (
                          <Text style={styles.listItemDesc}>📍 {c.zone}</Text>
                        ) : null}
                        {c.prix ? (
                          <Text
                            style={[styles.listItemDesc, styles.cafePrixText]}
                          >
                            💰 {c.prix}
                          </Text>
                        ) : null}
                        {c.description ? (
                          <Text style={styles.listItemDesc}>
                            {c.description}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    {isSelected && (
                      <View style={styles.listItemCheck}>
                        <Text style={styles.listItemCheckTxt}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <View style={styles.secRow}>
      <View style={styles.secLine} />
      <Text style={styles.secTxt}>{label}</Text>
      <View style={styles.secLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48, backgroundColor: BG },
  menuWrapper: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    right: 15,
    zIndex: 9999,
  },
  hero: {
    backgroundColor: BLUE_DEEP,
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    overflow: "hidden",
    position: "relative",
  },
  heroGlow: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: BLUE_LIGHT,
    opacity: 0.15,
    top: -60,
    right: -40,
  },
  voyageBadge: {
    flexDirection: "row",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  voyageBadgeTxt: { color: WHITE, fontSize: 12, fontWeight: "700" },
  codeBadgeTxt: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  heroBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  heroBadgeTxt: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 20,
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: WHITE,
    letterSpacing: -0.5,
  },
  heroSub: { fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  progressWrap: { flexDirection: "row", alignItems: "center", gap: 12 },
  progressBar: {
    flex: 1,
    height: 5,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#5B9BFF", borderRadius: 3 },
  progressTxt: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontWeight: "600",
    minWidth: 80,
    textAlign: "right",
  },
  secRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  secLine: { flex: 1, height: 1, backgroundColor: "#C8D9EF" },
  secTxt: {
    fontSize: 11,
    fontWeight: "700",
    color: BLUE_PRIMARY,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: WHITE,
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    shadowColor: BLUE_PRIMARY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(10,77,191,0.05)",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  questionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: BLUE_DEEP,
    flex: 1,
    marginRight: 8,
  },
  requiredBadge: {
    backgroundColor: "#FFF0F0",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#FFCCCC",
  },
  requiredBadgeTxt: {
    fontSize: 10,
    color: "#E05555",
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  optionalBadge: {
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: BLUE_PALE,
  },
  optionalBadgeTxt: {
    fontSize: 10,
    color: BLUE_PRIMARY,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  starBadge: {
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
    alignSelf: "flex-start",
  },
  starBadgeText: { fontSize: 12, color: "#92400E", fontWeight: "600" },
  noResultBanner: {
    backgroundColor: "#FFF7ED",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  noResultBannerText: { fontSize: 12, color: "#9A3412", lineHeight: 18 },
  optionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: BLUE_ULTRA_PALE,
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
  },
  chipSel: {
    backgroundColor: BLUE_PRIMARY,
    borderColor: BLUE_PRIMARY,
    shadowColor: BLUE_PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  chipIcon: { fontSize: 16, color: BLUE_PRIMARY },
  chipIconSel: { color: WHITE },
  chipTxt: { fontSize: 14, fontWeight: "600", color: BLUE_DEEP },
  chipTxtSel: { color: WHITE },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.5)",
    marginLeft: 2,
  },
  subtitle: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginBottom: 12,
    marginTop: -6,
    fontStyle: "italic",
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#EEF4FF",
  },
  pill: {
    backgroundColor: BLUE_PALE,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillTxt: { fontSize: 12, color: BLUE_PRIMARY, fontWeight: "600" },
  ageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ageChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: BLUE_ULTRA_PALE,
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
    minWidth: "45%",
    flex: 1,
  },
  ageChipSelected: {
    backgroundColor: BLUE_PRIMARY,
    borderColor: BLUE_PRIMARY,
    shadowColor: BLUE_PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  ageChipEmoji: { fontSize: 18 },
  ageChipText: { fontSize: 13, fontWeight: "600", color: BLUE_DEEP, flex: 1 },
  ageChipTextSelected: { color: WHITE },
  ageChipCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  ageChipCheckTxt: { color: WHITE, fontSize: 11, fontWeight: "800" },
  pickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
  },
  pickerBtnSelected: {
    backgroundColor: "#EEF4FF",
    borderColor: BLUE_PRIMARY,
    shadowColor: BLUE_PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  pickerBtnIcon: { fontSize: 22 },
  pickerBtnText: { fontSize: 14, fontWeight: "600", color: TEXT_MUTED },
  pickerBtnTextSelected: { color: BLUE_DEEP, fontWeight: "700" },
  pickerBtnSub: { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },
  pickerChevron: { fontSize: 20, color: BLUE_PRIMARY, fontWeight: "700" },
  clearBtn: { marginTop: 10, alignSelf: "flex-start" },
  clearBtnText: { fontSize: 12, color: "#E05555", fontWeight: "600" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
    borderRadius: 14,
    backgroundColor: BLUE_ULTRA_PALE,
    overflow: "hidden",
  },
  inputPrefix: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 14,
    fontWeight: "700",
    color: BLUE_PRIMARY,
    backgroundColor: BLUE_PALE,
    borderRightWidth: 1,
    borderRightColor: BLUE_PALE,
  },
  inputInline: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: BLUE_DEEP,
  },
  input: {
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: BLUE_ULTRA_PALE,
    fontSize: 15,
    color: BLUE_DEEP,
  },
  submitBtn: {
    backgroundColor: BLUE_PRIMARY,
    borderRadius: 18,
    padding: 18,
    marginTop: 8,
    marginBottom: 12,
    shadowColor: BLUE_PRIMARY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  submitInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  submitTxt: {
    color: WHITE,
    fontWeight: "800",
    fontSize: 17,
    letterSpacing: 0.3,
  },
  submitArrow: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 20,
    fontWeight: "300",
  },
  footerNote: {
    fontSize: 11,
    color: TEXT_MUTED,
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2,27,78,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 12,
    maxHeight: "85%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: BLUE_PALE,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: BLUE_DEEP },
  modalSub: { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: BLUE_ULTRA_PALE,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: BLUE_PALE,
  },
  modalCloseBtnText: { fontSize: 14, color: TEXT_MUTED, fontWeight: "700" },
  modalList: { paddingHorizontal: 16 },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
  },
  listItemSelected: {
    backgroundColor: "#EEF4FF",
    borderColor: BLUE_PRIMARY,
    shadowColor: BLUE_PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  listItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  listItemIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: BLUE_PALE,
    justifyContent: "center",
    alignItems: "center",
  },
  listItemIconSelected: { backgroundColor: BLUE_PRIMARY },
  listItemIconTxt: { fontSize: 20 },
  listItemName: {
    fontSize: 14,
    fontWeight: "700",
    color: BLUE_DEEP,
    marginBottom: 2,
  },
  listItemNameSelected: { color: BLUE_PRIMARY },
  listItemStars: { fontSize: 12, marginBottom: 2 },
  listItemDesc: { fontSize: 11, color: TEXT_MUTED, lineHeight: 16 },
  listItemCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: BLUE_PRIMARY,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  listItemCheckTxt: { color: WHITE, fontSize: 14, fontWeight: "800" },
  cafeTypeBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#F0FFF4",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    marginBottom: 4,
  },
  cafeTypeBadgeText: { fontSize: 10, color: "#166534", fontWeight: "700" },
  cafePrixText: { color: "#0A4DBF", fontWeight: "600" },
});

import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const BG = "#020B18";
const SURFACE = "#061525";
const BORDER = "#0E2A45";
const BORDER2 = "#143554";
const BLUE = "#0A4DBF";
const BLUE_L = "#1E88E5";
const BLUE_D = "#042A66";
const BLUE_SK = "#64B5F6";
const CYAN = "#00B0FF";
const CORAL = "#E8614A";
const VIOLET = "#5B8FFF";
const TEAL = "#00D4AA";
const WHITE = "#FFFFFF";
const OFF_W = "#E8F0FF";
const GREY = "#4A7AAA";
const GREY2 = "#1A3A5C";
const ACCENTS = [CYAN, BLUE_L, BLUE_SK, VIOLET, TEAL, "#40C4FF"];
const TEXT_MUTED = "#4A6080";
const BLUE_LIGHT = "#3B72E8";
const BLUE_PRIMARY = "#0A4DBF";

interface Promo {
  id: string;
  name: string;
  type: "hotel" | "cafe" | "restaurant";
  category: string;
  city: string;
  addr: string;
  photo: string;
  lat: number;
  lon: number;
  stars?: number;
  cuisine?: string;
  openHours?: string;
  phone?: string;
  website?: string;
  wifi?: string;
  outdoor?: string;
  halal?: string;
  vegetarian?: string;
  delivery?: string;
  takeaway?: string;
  wheelchair?: string;
  payment?: string;
  rating?: string;
  source: "opentripmap" | "static";
}

const PHOTOS: Record<string, string[]> = {
  hotel: [
    "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800&q=80",
    "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80",
    "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80",
    "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
  ],
  cafe: [
    "https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=800&q=80",
    "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80",
    "https://images.unsplash.com/photo-1525610553991-2bede1a236e2?w=800&q=80",
    "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80",
  ],
  restaurant: [
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80",
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80",
    "https://images.unsplash.com/photo-1424847651672-bf20a4b0982b?w=800&q=80",
    "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80",
  ],
};

const STATIC_FALLBACK: Promo[] = [
  {
    id: "s1",
    name: "La Maison Dorée",
    type: "hotel",
    category: "HÔTEL ★★★★",
    city: "Tunis",
    addr: "3 Rue de Hollande, Tunis",
    photo: PHOTOS.hotel[0],
    lat: 36.8189,
    lon: 10.1658,
    stars: 4,
    openHours: "24/7",
    phone: "+216 71 240 632",
    wifi: "yes",
    rating: "8.5",
    source: "static",
  },
  {
    id: "s2",
    name: "Café de Paris",
    type: "cafe",
    category: "CAFÉ & LOUNGE",
    city: "Tunis",
    addr: "Avenue Habib Bourguiba, Tunis",
    photo: PHOTOS.cafe[0],
    lat: 36.8008,
    lon: 10.1847,
    wifi: "yes",
    outdoor: "yes",
    openHours: "07:00-23:00",
    rating: "7.8",
    source: "static",
  },
  {
    id: "s3",
    name: "Dar El Jeld",
    type: "restaurant",
    category: "RESTAURANT",
    city: "Tunis",
    addr: "5 Rue Dar El Jeld, Médina",
    photo: PHOTOS.restaurant[0],
    lat: 36.7985,
    lon: 10.1715,
    cuisine: "Tunisienne · Traditionnelle",
    openHours: "12:00-23:00",
    phone: "+216 71 560 916",
    halal: "yes",
    rating: "9.1",
    source: "static",
  },
  {
    id: "s4",
    name: "Hôtel Hasdrubal Thalassa",
    type: "hotel",
    category: "HÔTEL ★★★★★",
    city: "Hammamet",
    addr: "Zone Touristique, Yasmine Hammamet",
    photo: PHOTOS.hotel[1],
    lat: 36.3897,
    lon: 10.5686,
    stars: 5,
    wifi: "yes",
    outdoor: "yes",
    openHours: "24/7",
    rating: "9.0",
    source: "static",
  },
  {
    id: "s5",
    name: "Le Baroque Café",
    type: "cafe",
    category: "CAFÉ & LOUNGE",
    city: "Sfax",
    addr: "Avenue Habib Bourguiba, Sfax",
    photo: PHOTOS.cafe[1],
    lat: 34.7406,
    lon: 10.7603,
    wifi: "yes",
    openHours: "08:00-22:00",
    rating: "7.5",
    source: "static",
  },
  {
    id: "s6",
    name: "Restaurant Le Lido",
    type: "restaurant",
    category: "RESTAURANT",
    city: "Sousse",
    addr: "Boulevard de la Corniche, Sousse",
    photo: PHOTOS.restaurant[1],
    lat: 35.8256,
    lon: 10.6369,
    cuisine: "Fruits de mer · Méditerranéenne",
    openHours: "12:00-00:00",
    outdoor: "yes",
    halal: "yes",
    rating: "8.3",
    source: "static",
  },
  {
    id: "s7",
    name: "Radisson Blu Djerba",
    type: "hotel",
    category: "HÔTEL ★★★★★",
    city: "Djerba",
    addr: "Route de Midoun, Djerba",
    photo: PHOTOS.hotel[2],
    lat: 33.8234,
    lon: 10.9254,
    stars: 5,
    wifi: "yes",
    outdoor: "yes",
    openHours: "24/7",
    rating: "8.8",
    source: "static",
  },
  {
    id: "s8",
    name: "Café Andalou",
    type: "cafe",
    category: "CAFÉ & LOUNGE",
    city: "Kairouan",
    addr: "Rue de la Mosquée, Kairouan",
    photo: PHOTOS.cafe[2],
    lat: 35.6781,
    lon: 10.0963,
    openHours: "07:00-22:00",
    halal: "yes",
    rating: "7.2",
    source: "static",
  },
  {
    id: "s9",
    name: "Restaurant El Foundouk",
    type: "restaurant",
    category: "RESTAURANT",
    city: "Nabeul",
    addr: "Avenue Habib Thameur, Nabeul",
    photo: PHOTOS.restaurant[2],
    lat: 36.4571,
    lon: 10.7353,
    cuisine: "Tunisienne · Grillades",
    openHours: "11:00-23:00",
    halal: "yes",
    takeaway: "yes",
    rating: "8.0",
    source: "static",
  },
  {
    id: "s10",
    name: "Hôtel El Mouradi Gammarth",
    type: "hotel",
    category: "HÔTEL ★★★★★",
    city: "Gammarth",
    addr: "Avenue Taieb Mhiri, Gammarth",
    photo: PHOTOS.hotel[3],
    lat: 36.9167,
    lon: 10.2833,
    stars: 5,
    wifi: "yes",
    outdoor: "yes",
    openHours: "24/7",
    rating: "8.6",
    source: "static",
  },
  {
    id: "s11",
    name: "Café Culturel Ibn Rachiq",
    type: "cafe",
    category: "CAFÉ & LOUNGE",
    city: "Tunis",
    addr: "Rue Ibn Rachiq, Tunis",
    photo: PHOTOS.cafe[3],
    lat: 36.8065,
    lon: 10.1815,
    outdoor: "yes",
    openHours: "08:00-23:00",
    rating: "8.1",
    source: "static",
  },
  {
    id: "s12",
    name: "Essaraya Restaurant",
    type: "restaurant",
    category: "RESTAURANT",
    city: "Tunis",
    addr: "6 Rue Ben Mahmoud, Médina, Tunis",
    photo: PHOTOS.restaurant[3],
    lat: 36.799,
    lon: 10.17,
    cuisine: "Tunisienne · Gastronomique",
    openHours: "12:00-23:00",
    halal: "yes",
    rating: "9.3",
    source: "static",
  },
];

const OTM_BASE = "https://api.opentripmap.com/0.1/en/places";
const OTM_KEY = "5ae2e3f221c38a28845f05b63e1e5c97d2094d7d7c9fbf69e6a9e5f6";

const TUNISIA_CITIES = [
  { name: "Tunis", lat: 36.819, lon: 10.1658, radius: 8000 },
  { name: "Sfax", lat: 34.7406, lon: 10.7603, radius: 6000 },
  { name: "Sousse", lat: 35.8256, lon: 10.6369, radius: 6000 },
  { name: "Hammamet", lat: 36.4, lon: 10.61, radius: 5000 },
  { name: "Djerba", lat: 33.875, lon: 10.9, radius: 8000 },
  { name: "Monastir", lat: 35.7643, lon: 10.8113, radius: 5000 },
];

const OTM_KINDS_HOTEL = "accomodations";
const OTM_KINDS_CAFE = "cafes";
const OTM_KINDS_RESTAURANT = "restaurants";

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function fetchOTMPlaces(
  city: { name: string; lat: number; lon: number; radius: number },
  kinds: string,
  type: "hotel" | "cafe" | "restaurant",
  photoIdx: number,
): Promise<Promo[]> {
  const url =
    `${OTM_BASE}/radius?radius=${city.radius}` +
    `&lon=${city.lon}&lat=${city.lat}` +
    `&kinds=${kinds}&limit=5&format=json&apikey=${OTM_KEY}`;
  const res = await fetchWithTimeout(url, 8000);
  if (!res.ok) return [];
  const data: any[] = await res.json();
  if (!Array.isArray(data) || data.length === 0) return [];
  return data
    .filter((p: any) => p.name && p.name.trim().length > 2)
    .map((p: any, i: number): Promo => {
      const idx = (photoIdx + i) % PHOTOS[type].length;
      const stars =
        type === "hotel"
          ? p.rate
            ? Math.min(Math.ceil(p.rate / 2), 5)
            : undefined
          : undefined;
      return {
        id: `otm-${p.xid || p.name + i}`,
        name: p.name,
        type,
        category:
          type === "hotel"
            ? `HÔTEL${stars ? " " + "★".repeat(stars) : ""}`
            : type === "cafe"
              ? "CAFÉ & LOUNGE"
              : "RESTAURANT",
        city: city.name,
        addr: p.address
          ? [p.address.road, p.address.suburb, city.name]
              .filter(Boolean)
              .join(", ")
          : city.name,
        photo: PHOTOS[type][idx],
        lat: p.point?.lat ?? city.lat,
        lon: p.point?.lon ?? city.lon,
        stars,
        rating: p.rate ? String((p.rate / 10).toFixed(1)) : undefined,
        source: "opentripmap",
      };
    });
}

async function loadAllPlaces(): Promise<{ data: Promo[]; isLive: boolean }> {
  const CACHE_KEY = "promos_otm_v1";
  const CACHE_TTL = 15 * 60 * 1000;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const { data, ts } = JSON.parse(raw);
      if (
        Date.now() - ts < CACHE_TTL &&
        Array.isArray(data) &&
        data.length > 0
      ) {
        return { data, isLive: data[0]?.source === "opentripmap" };
      }
    }
  } catch {}
  try {
    const all: Promo[] = [];
    const shuffled = [...TUNISIA_CITIES]
      .filter((c) => c.name !== "Tunis")
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);
    const cities = [TUNISIA_CITIES[0], ...shuffled];
    for (const city of cities) {
      try {
        const [hotels, cafes, restos] = await Promise.all([
          fetchOTMPlaces(city, OTM_KINDS_HOTEL, "hotel", 0),
          fetchOTMPlaces(city, OTM_KINDS_CAFE, "cafe", 1),
          fetchOTMPlaces(city, OTM_KINDS_RESTAURANT, "restaurant", 2),
        ]);
        all.push(...hotels, ...cafes, ...restos);
      } catch {}
    }
    if (all.length >= 3) {
      const data = all.sort(() => Math.random() - 0.5).slice(0, 15);
      try {
        await AsyncStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ data, ts: Date.now() }),
        );
      } catch {}
      return { data, isLive: true };
    }
    return {
      data: [...STATIC_FALLBACK].sort(() => Math.random() - 0.5),
      isLive: false,
    };
  } catch {
    return {
      data: [...STATIC_FALLBACK].sort(() => Math.random() - 0.5),
      isLive: false,
    };
  }
}

function openMap(lat: number, lon: number, name: string) {
  const q = encodeURIComponent(name);
  const url =
    Platform.OS === "ios"
      ? `maps:0,0?q=${q}@${lat},${lon}`
      : `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  Linking.openURL(url).catch(() =>
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
    ),
  );
}

const TagRow = React.memo(
  ({
    icon,
    label,
    value,
    accent,
  }: {
    icon: string;
    label: string;
    value: string;
    accent: string;
  }) => (
    <View style={S.tagRow}>
      <View style={[S.tagIconBox, { backgroundColor: accent + "18" }]}>
        <Text style={S.tagIcon}>{icon}</Text>
      </View>
      <View style={S.tagContent}>
        <Text style={S.tagLabel}>{label}</Text>
        <Text style={S.tagValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  ),
);

const Chip = React.memo(
  ({ icon, text, accent }: { icon: string; text: string; accent: string }) => (
    <View
      style={[
        S.chip,
        { borderColor: accent + "44", backgroundColor: accent + "12" },
      ]}
    >
      <Text style={S.chipIcon}>{icon}</Text>
      <Text style={[S.chipTxt, { color: accent }]}>{text}</Text>
    </View>
  ),
);

/* ═══════════════════════════════════════
   MENU
═══════════════════════════════════════ */
function AppMenu({
  inviteCode,
  userId,
}: {
  inviteCode: string | null;
  userId?: string;
}) {
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
      color: BLUE_LIGHT,
      onPress: () => {
        setOpen(false);
        if (inviteCode) {
          router.push({ pathname: "/group-chat", params: { inviteCode } });
        } else setPromptVisible(true);
      },
    },
    {
      icon: "map-marker-path" as const,
      label: "Mes anciens plans",
      sub: "Consulter vos voyages passés",
      color: TEAL,
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
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={menuSt.trigger}
        activeOpacity={0.7}
      >
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
                color={BLUE_LIGHT}
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
                color={BLUE_LIGHT}
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
                activeOpacity={0.7}
              >
                <Text style={promptSt.btnCancelTxt}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={promptSt.btnConfirm}
                onPress={handleJoinGroup}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={[BLUE_LIGHT, BLUE_PRIMARY]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={promptSt.btnGrad}
                >
                  <Text style={promptSt.btnConfirmTxt}>Rejoindre</Text>
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

/* ═══════════════════════════════════════
   PROMO CARD
═══════════════════════════════════════ */
const PromoCard = React.memo(
  ({
    item,
    index,
    userId,
  }: {
    item: Promo;
    index: number;
    userId?: string;
  }) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const accent = ACCENTS[index % ACCENTS.length];
    const icon =
      item.type === "hotel" ? "🏨" : item.type === "cafe" ? "☕" : "🍽️";
    const isLive = item.source === "opentripmap";

    const chips = useMemo(() => {
      const list: { icon: string; text: string }[] = [];
      if (item.wifi === "yes") list.push({ icon: "📶", text: "WiFi" });
      if (item.outdoor === "yes") list.push({ icon: "🌿", text: "Terrasse" });
      if (item.halal === "yes") list.push({ icon: "☪️", text: "Halal" });
      if (item.vegetarian === "yes")
        list.push({ icon: "🥗", text: "Végétarien" });
      if (item.delivery === "yes") list.push({ icon: "🛵", text: "Livraison" });
      if (item.takeaway === "yes")
        list.push({ icon: "📦", text: "À emporter" });
      if (item.wheelchair === "yes")
        list.push({ icon: "♿", text: "Accessible" });
      return list;
    }, [item]);

    useEffect(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          delay: index * 70,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          delay: index * 70,
          tension: 60,
          friction: 9,
          useNativeDriver: true,
        }),
      ]).start();
    }, []);

    const onPressIn = useCallback(
      () =>
        Animated.spring(scaleAnim, {
          toValue: 0.974,
          useNativeDriver: true,
        }).start(),
      [],
    );
    const onPressOut = useCallback(
      () =>
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          useNativeDriver: true,
        }).start(),
      [],
    );

    return (
      <Animated.View
        style={[
          S.cardOuter,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
        >
          <View style={S.card}>
            <View style={S.imgWrap}>
              <Image
                source={{ uri: item.photo }}
                style={S.img}
                resizeMode="cover"
              />
              <LinearGradient
                colors={[
                  "transparent",
                  "rgba(2,11,24,0.65)",
                  "rgba(2,11,24,0.98)",
                ]}
                locations={[0.3, 0.65, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={[S.typeBadge, { borderColor: accent + "66" }]}>
                <Text style={S.badgeIcon}>{icon}</Text>
                <Text style={[S.badgeTxt, { color: accent }]}>
                  {item.category}
                </Text>
              </View>
              <View
                style={[
                  S.sourceBadge,
                  isLive
                    ? { backgroundColor: TEAL + "22", borderColor: TEAL + "44" }
                    : {
                        backgroundColor: CORAL + "22",
                        borderColor: CORAL + "44",
                      },
                ]}
              >
                <Text style={[S.sourceTxt, { color: isLive ? TEAL : CORAL }]}>
                  {isLive ? "● OpenTripMap" : "● Données locales"}
                </Text>
              </View>
              {item.rating && (
                <View style={S.ratingBadge}>
                  <Text style={S.ratingTxt}>⭐ {item.rating}</Text>
                </View>
              )}
              <View style={S.imgBottom}>
                <Text style={S.imgName} numberOfLines={2}>
                  {item.name}
                </Text>
                <View style={S.locRow}>
                  <Text style={[S.locDot, { color: accent }]}>📍</Text>
                  <Text style={S.locTxt}>{item.addr}</Text>
                </View>
              </View>
            </View>

            <View style={S.body}>
              {chips.length > 0 && (
                <View style={S.chipsRow}>
                  {chips.slice(0, 4).map((c, i) => (
                    <Chip key={i} icon={c.icon} text={c.text} accent={accent} />
                  ))}
                </View>
              )}
              <View style={[S.dataBox, { borderColor: accent + "28" }]}>
                {item.cuisine && (
                  <TagRow
                    icon="🍴"
                    label="Cuisine"
                    value={item.cuisine}
                    accent={accent}
                  />
                )}
                {item.stars && (
                  <TagRow
                    icon="⭐"
                    label="Classement"
                    value={"★".repeat(item.stars) + ` (${item.stars} étoiles)`}
                    accent={accent}
                  />
                )}
                {item.openHours && (
                  <TagRow
                    icon="🕐"
                    label="Horaires"
                    value={item.openHours}
                    accent={accent}
                  />
                )}
                {item.phone && (
                  <TagRow
                    icon="📞"
                    label="Téléphone"
                    value={item.phone}
                    accent={accent}
                  />
                )}
                {item.payment && (
                  <TagRow
                    icon="💳"
                    label="Paiement"
                    value={item.payment}
                    accent={accent}
                  />
                )}
                {!item.cuisine &&
                  !item.stars &&
                  !item.openHours &&
                  !item.phone && (
                    <View style={S.noDataRow}>
                      <Text style={S.noDataTxt}>
                        ℹ️ Lieu vérifié · {item.city}
                      </Text>
                    </View>
                  )}
              </View>

              <TouchableOpacity
                onPress={() => openMap(item.lat, item.lon, item.name)}
                activeOpacity={0.85}
                style={S.mapBtn}
              >
                <Image
                  source={{
                    uri: `https://static-maps.yandex.ru/1.x/?ll=${item.lon},${item.lat}&z=16&l=map&size=650,110&pt=${item.lon},${item.lat},pm2rdm`,
                  }}
                  style={S.mapImg}
                  resizeMode="cover"
                />
                <LinearGradient
                  colors={["transparent", "rgba(2,11,24,0.8)"]}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <View style={S.mapOverlay}>
                  <Text style={S.mapCoords}>
                    🌐 {item.lat.toFixed(4)}, {item.lon.toFixed(4)}
                  </Text>
                  <View style={[S.mapOpenBtn, { backgroundColor: CYAN }]}>
                    <Text style={S.mapOpenTxt}>Ouvrir Maps →</Text>
                  </View>
                </View>
              </TouchableOpacity>

              <View style={S.sep} />

              {/* ✅ CTA avec userId transmis */}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() =>
                  router.push({
                    pathname: "/formulaire",
                    params: {
                      ville: item.city,
                      hotel: item.name,
                      type: item.type,
                      userId: userId, // ✅ CORRECTION
                    },
                  })
                }
              >
                <View style={S.ctaWrapper}>
                  <LinearGradient
                    colors={[BLUE_D, BLUE, BLUE_L]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={S.ctaFull}
                  >
                    <View style={S.ctaShine} pointerEvents="none" />
                    <Text style={S.ctaTxt}>
                      {item.type === "hotel"
                        ? "🏨 Planifier ce séjour"
                        : item.type === "cafe"
                          ? "☕ Ajouter à mon plan"
                          : "🍽️ Ajouter à mon plan"}
                    </Text>
                    <Text style={S.ctaArrow}>→</Text>
                  </LinearGradient>
                </View>
              </TouchableOpacity>
            </View>

            <LinearGradient
              colors={[accent, accent + "00"]}
              style={S.stripe}
              pointerEvents="none"
            />
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  },
);

const SkeletonCard = React.memo(({ index }: { index: number }) => {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          delay: index * 100,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);
  return (
    <Animated.View style={[S.cardOuter, { opacity: pulse }]}>
      <View style={S.card}>
        <View style={[S.imgWrap, { backgroundColor: BORDER2 }]} />
        <View style={S.body}>
          <View
            style={[S.skLine, { width: "70%", height: 16, marginBottom: 8 }]}
          />
          <View
            style={[S.skLine, { width: "90%", height: 11, marginBottom: 5 }]}
          />
          <View
            style={[S.skLine, { width: "55%", height: 11, marginBottom: 18 }]}
          />
          <View
            style={[S.skLine, { width: "100%", height: 80, borderRadius: 12 }]}
          />
        </View>
      </View>
    </Animated.View>
  );
});

function SectionHead({ label, count }: { label: string; count: number }) {
  return (
    <View style={S.secHead}>
      <Text style={S.secLabel}>{label}</Text>
      <View style={S.secCount}>
        <Text style={S.secCountTxt}>{count}</Text>
      </View>
      <View style={S.secLine} />
    </View>
  );
}

/* ═══════════════════════════════════════
   MAIN SCREEN
═══════════════════════════════════════ */
export default function PromotionScreen() {
  // ✅ CORRECTION : récupérer userId depuis les params de navigation
  const { userId } = useLocalSearchParams<{ userId?: string }>();

  const [promos, setPromos] = useState<Promo[]>(STATIC_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const headerAnim = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-24)).current;

  useEffect(() => {
    // ✅ Log de vérification
    console.log("🔍 PromotionScreen — userId param:", userId);
    AsyncStorage.getItem("inviteCode")
      .then((c) => {
        if (c) setInviteCode(c);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(headerSlide, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, []),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, isLive: live } = await loadAllPlaces();
      const final =
        Array.isArray(data) && data.length > 0
          ? data
          : [...STATIC_FALLBACK].sort(() => Math.random() - 0.5);
      setPromos(final);
      setIsLive(live);
      setLastUpdated(
        new Date().toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      final.slice(0, 4).forEach((p) => Image.prefetch(p.photo));
    } catch {
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const hotels = useMemo(
    () => promos.filter((p) => p.type === "hotel"),
    [promos],
  );
  const cafes = useMemo(
    () => promos.filter((p) => p.type === "cafe"),
    [promos],
  );
  const restos = useMemo(
    () => promos.filter((p) => p.type === "restaurant"),
    [promos],
  );
  const allPromos = useMemo(
    () => [...hotels, ...cafes, ...restos],
    [hotels, cafes, restos],
  );

  const Header = useMemo(
    () => (
      <View>
        <Animated.View
          style={{
            opacity: headerAnim,
            transform: [{ translateY: headerSlide }],
          }}
        >
          <View style={S.hero}>
            <LinearGradient
              colors={["#001A3A", "#011228", BG]}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={S.glow1} pointerEvents="none" />
            <View style={S.glow2} pointerEvents="none" />
            <View style={S.eyebrow}>
              <View style={S.eyeLine} />
              <Text style={S.eyeTxt}>
                OPENTRIPMAP · HÔTELS & RESTAURANTS · TUNISIE
              </Text>
              <View style={S.eyeLine} />
            </View>
            <Text style={S.heroTitle}>Nos Promotions</Text>
            <Text style={S.heroSub}>
              {loading
                ? "⏳ Chargement des lieux…"
                : isLive
                  ? `✅ Données live · Actualisé à ${lastUpdated}`
                  : `📋 Données locales · ${lastUpdated || "prêt"}`}
            </Text>
            <View style={S.statsBar}>
              {[
                { n: loading ? "…" : `${hotels.length}`, l: "Hôtels", e: "🏨" },
                { n: loading ? "…" : `${cafes.length}`, l: "Cafés", e: "☕" },
                { n: loading ? "…" : `${restos.length}`, l: "Restos", e: "🍽️" },
              ].map((s, i) => (
                <React.Fragment key={s.l}>
                  {i > 0 && <View style={S.statSep} />}
                  <View style={S.statItem}>
                    <Text style={S.statE}>{s.e}</Text>
                    <Text style={S.statN}>{s.n}</Text>
                    <Text style={S.statL}>{s.l}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          </View>
        </Animated.View>
        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <SectionHead label="🏨  Hôtels" count={hotels.length} />
        </View>
      </View>
    ),
    [
      headerAnim,
      headerSlide,
      loading,
      isLive,
      lastUpdated,
      hotels.length,
      cafes.length,
      restos.length,
    ],
  );

  const Footer = useMemo(
    () => (
      <View>
        {cafes.length > 0 && (
          <View
            style={{ paddingHorizontal: 20, marginBottom: 12, marginTop: 16 }}
          >
            <SectionHead label="☕  Cafés" count={cafes.length} />
          </View>
        )}
        {restos.length > 0 && (
          <View
            style={{ paddingHorizontal: 20, marginBottom: 12, marginTop: 16 }}
          >
            <SectionHead label="🍽️  Restaurants" count={restos.length} />
          </View>
        )}

        <TouchableOpacity
          onPress={load}
          style={S.refreshBtn}
          activeOpacity={0.8}
        >
          <Text style={S.refreshIcon}>↻</Text>
          <Text style={S.refreshTxt}>
            {loading ? "Chargement…" : "Actualiser · Nouvelles données"}
          </Text>
        </TouchableOpacity>

        {!isLive && !loading && (
          <View style={S.offlineBox}>
            <Text style={S.offlineIcon}>📋</Text>
            <Text style={S.offlineTxt}>
              Données locales · Appuyez sur Actualiser pour réessayer en ligne
            </Text>
          </View>
        )}

        {/* ✅ CTA footer avec userId transmis */}
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/formulaire",
              params: { userId: userId }, // ✅ CORRECTION
            })
          }
          activeOpacity={0.88}
          style={{ marginHorizontal: 20, marginBottom: 24, marginTop: 8 }}
        >
          <View style={S.planWrapper}>
            <LinearGradient
              colors={[BLUE_D, BLUE, BLUE_L]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={S.planCard}
            >
              <View style={S.planShine} pointerEvents="none" />
              <View style={S.planLeft}>
                <View style={S.planIconBox}>
                  <Text style={{ fontSize: 20 }}>✦</Text>
                </View>
                <View>
                  <Text style={S.planTitle}>Organiser votre séjour</Text>
                  <Text style={S.planSub}>Personnalisez chaque détail</Text>
                </View>
              </View>
              <View style={S.planArrow}>
                <Text style={S.planArrowTxt}>→</Text>
              </View>
            </LinearGradient>
          </View>
        </TouchableOpacity>

        <View style={S.footer}>
          <View style={S.footerLine} />
          <Text style={S.footerTxt}>© OpenTripMap · Tunisie</Text>
          <View style={S.footerLine} />
        </View>
      </View>
    ),
    [loading, isLive, cafes.length, restos.length, load, userId],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Promo; index: number }) => (
      <PromoCard item={item} index={index} userId={userId} />
    ),
    [userId],
  );

  const keyExtractor = useCallback((item: Promo) => item.id, []);

  return (
    <View style={S.root}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={BG}
        translucent={false}
      />
      <View style={S.menuWrapper}>
        <AppMenu inviteCode={inviteCode} userId={userId} />
      </View>
      <FlatList
        data={allPromos}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={Header}
        ListFooterComponent={Footer}
        contentContainerStyle={S.scroll}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={7}
        removeClippedSubviews={Platform.OS === "android"}
        showsVerticalScrollIndicator={false}
      />
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
  btnCancelTxt: { color: "#4A7AAA", fontWeight: "600", fontSize: 15 },
  btnConfirm: { flex: 1.5, borderRadius: 14, overflow: "hidden" },
  btnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
  },
  btnConfirmTxt: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
});

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { paddingBottom: 60 },
  hero: {
    paddingTop: Platform.OS === "ios" ? 64 : 44,
    paddingBottom: 36,
    paddingHorizontal: 24,
    overflow: "hidden",
    position: "relative",
    minHeight: 300,
  },
  menuWrapper: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    right: 15,
    zIndex: 9999,
    elevation: 9999,
  },
  glow1: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(10,77,191,0.22)",
    top: -60,
    right: -60,
  },
  glow2: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(0,176,255,0.1)",
    bottom: -40,
    left: -40,
  },
  eyebrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  eyeLine: { flex: 1, height: 1, backgroundColor: BLUE_L + "44" },
  eyeTxt: { color: BLUE_SK, fontSize: 9, fontWeight: "800", letterSpacing: 2 },
  heroTitle: {
    color: OFF_W,
    fontSize: 42,
    fontWeight: "900",
    lineHeight: 48,
    letterSpacing: -1.5,
    marginBottom: 10,
    ...(Platform.OS === "ios" ? { fontFamily: "Georgia" } : {}),
  },
  heroSub: { color: GREY, fontSize: 13, lineHeight: 21, marginBottom: 26 },
  statsBar: {
    flexDirection: "row",
    backgroundColor: "rgba(10,77,191,0.12)",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: BLUE_D + "88",
  },
  statItem: { flex: 1, alignItems: "center", gap: 3 },
  statE: { fontSize: 16 },
  statN: { color: OFF_W, fontSize: 18, fontWeight: "900" },
  statL: { color: GREY, fontSize: 9, fontWeight: "600", letterSpacing: 0.5 },
  statSep: { width: 1, backgroundColor: BLUE_D + "88", marginVertical: 4 },
  secHead: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    marginTop: 6,
    gap: 10,
  },
  secLabel: { color: OFF_W, fontSize: 16, fontWeight: "800" },
  secCount: {
    backgroundColor: BLUE_D + "88",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: BLUE_L + "55",
  },
  secCountTxt: { color: BLUE_SK, fontSize: 11, fontWeight: "800" },
  secLine: { flex: 1, height: 1, backgroundColor: BORDER2 },
  cardOuter: { marginHorizontal: 20, marginBottom: 20 },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER2,
    elevation: 16,
    position: "relative",
  },
  stripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  imgWrap: { height: 200, position: "relative", backgroundColor: BORDER },
  img: { width: "100%", height: "100%" },
  typeBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(2,11,24,0.82)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  badgeIcon: { fontSize: 11 },
  badgeTxt: { fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  sourceBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  sourceTxt: { fontSize: 9, fontWeight: "800" },
  ratingBadge: {
    position: "absolute",
    bottom: 50,
    right: 12,
    backgroundColor: "rgba(2,11,24,0.85)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingTxt: { color: WHITE, fontSize: 11, fontWeight: "800" },
  imgBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14,
  },
  imgName: {
    color: WHITE,
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: -0.4,
    marginBottom: 4,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locDot: { fontSize: 11 },
  locTxt: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
  },
  body: { padding: 16 },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipIcon: { fontSize: 11 },
  chipTxt: { fontSize: 10, fontWeight: "700" },
  dataBox: { borderWidth: 1, borderRadius: 16, padding: 4, marginBottom: 14 },
  tagRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tagIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tagIcon: { fontSize: 15 },
  tagContent: { flex: 1 },
  tagLabel: {
    color: GREY,
    fontSize: 10,
    fontWeight: "600",
    marginBottom: 1,
    letterSpacing: 0.3,
  },
  tagValue: { color: OFF_W, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  noDataRow: { padding: 12, alignItems: "center" },
  noDataTxt: { color: GREY, fontSize: 12 },
  mapBtn: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
    height: 100,
    position: "relative",
  },
  mapImg: { width: "100%", height: "100%", backgroundColor: BORDER2 },
  mapOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mapCoords: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 10,
    fontWeight: "600",
    flex: 1,
  },
  mapOpenBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  mapOpenTxt: { color: WHITE, fontSize: 10, fontWeight: "800" },
  sep: { height: 1, backgroundColor: BORDER2, marginBottom: 14 },
  ctaWrapper: { borderRadius: 16, overflow: "hidden", elevation: 10 },
  ctaFull: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  ctaShine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "45%",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
  },
  ctaTxt: { color: WHITE, fontSize: 15, fontWeight: "900", letterSpacing: 0.2 },
  ctaArrow: { color: "rgba(255,255,255,0.7)", fontSize: 18, fontWeight: "800" },
  skLine: { backgroundColor: BORDER2, borderRadius: 6 },
  offlineBox: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER2,
    backgroundColor: SURFACE,
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  offlineIcon: { fontSize: 28 },
  offlineTxt: {
    color: GREY,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  refreshBtn: {
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER2,
    backgroundColor: SURFACE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
  },
  refreshIcon: { color: BLUE_L, fontSize: 18 },
  refreshTxt: { color: GREY, fontSize: 13, fontWeight: "700" },
  planWrapper: { borderRadius: 20, overflow: "hidden", elevation: 14 },
  planCard: {
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  planShine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "40%",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
  },
  planLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  planIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  planTitle: { color: WHITE, fontSize: 15, fontWeight: "900", marginBottom: 2 },
  planSub: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
  planArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  planArrowTxt: { color: WHITE, fontSize: 17, fontWeight: "900" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 28,
    marginTop: 4,
    marginBottom: 8,
  },
  footerLine: { flex: 1, height: 1, backgroundColor: BORDER },
  footerTxt: { color: GREY2, fontSize: 11, letterSpacing: 1 },
});

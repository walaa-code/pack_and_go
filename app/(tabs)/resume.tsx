import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTravelData } from "../../context/TravelContext";

// ─── Constantes visuelles ─────────────────────────────────────────────────────
const BG = "#F0F5FC";
const CARD_BG = "#FFFFFF";
const BLUE_PRIMARY = "#0A4DBF";
const BLUE_LIGHT = "#3B72E8";
const BLUE_DEEP = "#042A66";
const WHITE = "#FFFFFF";
const TEXT_MUTED = "#7A90B4";
const TEXT_MEDIUM = "#4A6080";
const BORDER = "#E2EAF5";
const GREEN = "#22C55E";
const GREEN_DARK = "#166534";
const ORANGE = "#F59E0B";
const BLUE_ULTRA_PALE = "#EEF4FF";
const BLUE_PALE = "#D6E4FF";

const API_BASE_URL = "http://192.168.1.8:5000";

// ─── Types ────────────────────────────────────────────────────────────────────
type StatutKey = "à venir" | "en cours" | "terminé" | "en_attente";

type Plan = {
  id: string;
  nom: string;
  destination: string;
  dateDebut: string;
  dateFin: string;
  duree: number;
  dateCreation: string;
  statut: StatutKey;
  voyageurs: number;
  nombreInvitesAttendus: number;
  activites: string[];
  hotels: string[];
  itinerary: any[];
  type: "gratuit" | "premium";
  inviteCode: string;
  guestPrefs?: any[];
  leaderPrefs?: Record<string, any>;
  budget?: number;
};

interface GroupPreference {
  role: string;
  email: string;
  full_name: string | null;
  phone?: string | null;
  hotel_type: string | null;
  hotel_location: string | null;
  activity_types: string | null;
  cafe_levels: string | null;
  voyage_type: string | null;
  budget: string | null;
  hotel_name: string | null;
  cafe_name: string | null;
}

interface VoyageInfo {
  destination: string;
  date_depart: string;
  date_arrivee: string;
  nuitees: number;
  leader_name: string;
  leader_email: string;
}

const ICONS: Record<string, string> = {
  ville: "📍",
  dateDebut: "📅",
  dateFin: "📅",
  hotelType: "🏨",
  hotelLocation: "🌍",
  activityTypes: "🎯",
  cafeLevels: "☕",
  voyageType: "✈️",
  budget: "💰",
  hotel: "🏨",
  cafe: "☕",
  ageRange: "🎂",
};

// ─── Utilitaires ──────────────────────────────────────────────────────────────
const normalizeCode = (code: string | null | undefined): string =>
  code?.trim().toUpperCase() || "";

const formatDate = (date: Date | string | null) => {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1,
  ).padStart(2, "0")}/${d.getFullYear()}`;
};

const generateLocalCode = (): string => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 8 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length)),
  ).join("");
};

// ─── Menu sombre (identique à formulaire.tsx) ────────────────────────────────
function AppMenuDark({ inviteCode }: { inviteCode: string | null }) {
  const [open, setOpen] = React.useState(false);

  const handleChatbot = () => {
    setOpen(false);
    router.push("/chatbot");
  };

  const handleGroupChat = () => {
    setOpen(false);
    if (!inviteCode) {
      Alert.alert(
        "Groupe non disponible",
        "Vous devez avoir un code voyage pour accéder au groupe de communication.",
      );
      return;
    }
    router.push({ pathname: "/group-chat", params: { inviteCode } } as any);
  };

  const handleChangePassword = () => {
    setOpen(false);
    router.push("/reset-password");
  };

  const handleLogout = () => {
    setOpen(false);
    setTimeout(() => {
      Alert.alert(
        "Déconnexion",
        "Êtes-vous sûr de vouloir vous déconnecter ?",
        [
          { text: "Annuler", style: "cancel" },
          { text: "Oui", onPress: () => router.replace("/") },
        ],
      );
    }, 300);
  };

  const MENU_ITEMS = [
    {
      icon: "robot-outline" as const,
      label: "Assistant IA",
      sub: "Posez vos questions voyage",
      color: "#0A4DBF",
      onPress: handleChatbot,
    },
    {
      icon: "message-group-outline" as const,
      label: "Groupe voyage",
      sub: inviteCode ? `Code : ${inviteCode}` : "Communiquer avec le groupe",
      color: "#3B72E8",
      onPress: handleGroupChat,
    },
    {
      icon: "lock-reset" as const,
      label: "Modifier le mot de passe",
      sub: "Changer vos identifiants",
      color: "#F59E0B",
      onPress: handleChangePassword,
    },
    {
      icon: "logout" as const,
      label: "Se déconnecter",
      sub: "Quitter l'application",
      color: "#EF4444",
      onPress: handleLogout,
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
        <MaterialCommunityIcons
          name="dots-vertical"
          size={28}
          color="#FFFFFF"
        />
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
                color="#4A6080"
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
                      name={item.icon}
                      size={20}
                      color={item.color}
                    />
                  </View>
                  <View style={menuStyles.menuTextBlock}>
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
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function ResumeScreen() {
  const { travelData, setTravelData } = useTravelData();

  const {
    ville,
    dateDebut,
    dateFin,
    hotelType,
    hotelLocation,
    activityTypes,
    cafeLevels,
    voyageType,
    budget,
    hotel,
    cafe,
    ageRange,
    emailInvites,
    inviteCode,
  } = travelData as any;

  const [groupPreferences, setGroupPreferences] = useState<GroupPreference[]>(
    [],
  );
  const [leaderPreference, setLeaderPreference] =
    useState<GroupPreference | null>(null);
  const [voyageInfo, setVoyageInfo] = useState<VoyageInfo | null>(null);
  const [loadingPrefs, setLoadingPrefs] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const hasInvites = (emailInvites?.length ?? 0) > 0;
  const totalInvites = emailInvites?.length ?? 0;
  const invitesHaveResponded = groupPreferences.length > 0;
  const allInvitesResponded =
    totalInvites > 0 && groupPreferences.length >= totalInvites;

  // Valeurs affichées : API > local
  const displayVille = voyageInfo?.destination || ville;
  const displayDateDebut = voyageInfo?.date_depart
    ? new Date(voyageInfo.date_depart)
    : dateDebut;
  const displayDateFin = voyageInfo?.date_arrivee
    ? new Date(voyageInfo.date_arrivee)
    : dateFin;

  // ─── Chargement groupe ──────────────────────────────────────────────────────
  const fetchGroupData = useCallback(
    async (showRefresh = false) => {
      const code = normalizeCode(inviteCode);
      if (!code) return;

      if (showRefresh) setRefreshing(true);
      else setLoadingPrefs(true);

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/group-summary?invite_code=${code}`,
        );
        if (res.ok) {
          const json = await res.json();
          console.log("📦 group-summary:", JSON.stringify(json));

          // ── Invités : tous ceux avec role === 'invite' ─────────────────────
          const guests: GroupPreference[] = (json.guests_prefs ?? []).filter(
            (g: GroupPreference) => g.role === "invite",
          );
          setGroupPreferences(guests);
          setLeaderPreference(json.leader_prefs ?? null);

          // ── Infos voyage ───────────────────────────────────────────────────
          if (json.voyage) {
            setVoyageInfo(json.voyage);
            setTravelData({
              ville: json.voyage.destination || ville,
              dateDebut: json.voyage.date_depart
                ? new Date(json.voyage.date_depart)
                : dateDebut,
              dateFin: json.voyage.date_arrivee
                ? new Date(json.voyage.date_arrivee)
                : dateFin,
            });
          }

          setLastSync(new Date());
        }
      } catch (e) {
        console.warn("fetchGroupPrefs error:", e);
      } finally {
        setLoadingPrefs(false);
        setRefreshing(false);
      }
    },
    [inviteCode],
  );

  useEffect(() => {
    fetchGroupData();
  }, [fetchGroupData]);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const getDuration = () => {
    if (!displayDateDebut || !displayDateFin) return null;
    const start =
      displayDateDebut instanceof Date
        ? displayDateDebut
        : new Date(displayDateDebut);
    const end =
      displayDateFin instanceof Date
        ? displayDateFin
        : new Date(displayDateFin);
    const diff = Math.ceil((end.getTime() - start.getTime()) / 86400000);
    return diff > 0 ? `${diff} nuit${diff > 1 ? "s" : ""}` : null;
  };

  const fmtTime = (d: Date | null) => {
    if (!d) return "";
    return `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")}`;
  };

  // ─── Sauvegarde AsyncStorage ─────────────────────────────────────────────────
  const savePlanToStorage = async (
    dateDebutStr: string,
    dateFinStr: string,
    finalCode: string,
    guestPrefs: GroupPreference[] = [],
    statut: StatutKey,
  ) => {
    const code = normalizeCode(finalCode);
    if (!code) {
      console.error("❌ savePlanToStorage : code vide !");
      return;
    }

    const existingJson = await AsyncStorage.getItem("@travel_plans");
    const existing: Plan[] = existingJson ? JSON.parse(existingJson) : [];

    const isDuplicate = existing.some(
      (p) => normalizeCode(p.inviteCode) === code,
    );

    if (isDuplicate) {
      const updated = existing.map((p) =>
        normalizeCode(p.inviteCode) === code
          ? {
              ...p,
              statut,
              guestPrefs,
              destination: displayVille || p.destination,
              dateDebut: dateDebutStr || p.dateDebut,
              dateFin: dateFinStr || p.dateFin,
            }
          : p,
      );
      await AsyncStorage.setItem("@travel_plans", JSON.stringify(updated));
      console.log("♻️ Plan existant mis à jour:", code, "statut:", statut);
      return;
    }

    const duree = (() => {
      if (!dateDebutStr || !dateFinStr) return 0;
      const diff = Math.ceil(
        (new Date(dateFinStr).getTime() - new Date(dateDebutStr).getTime()) /
          86400000,
      );
      return diff > 0 ? diff : 0;
    })();

    const newPlan: Plan = {
      id: code,
      nom: `Voyage à ${displayVille || "destination"}`,
      destination: displayVille || "",
      dateDebut: dateDebutStr,
      dateFin: dateFinStr,
      duree,
      dateCreation: new Date().toISOString(),
      statut,
      voyageurs: totalInvites + 1,
      nombreInvitesAttendus: totalInvites,
      activites: activityTypes ?? [],
      hotels: hotel ? [hotel] : [],
      itinerary: [],
      type: "gratuit",
      inviteCode: code,
      guestPrefs,
      leaderPrefs: {
        hotelType,
        hotelLocation,
        activityTypes,
        cafeLevels,
        voyageType,
        budget,
        hotel,
        cafe,
        ageRange,
      },
      budget: budget ?? undefined,
    };

    const newList = [newPlan, ...existing];
    await AsyncStorage.setItem("@travel_plans", JSON.stringify(newList));
    console.log("✅ Nouveau plan sauvegardé:", code, "statut:", statut);
  };

  // ─── Confirmation ────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    setConfirming(true);

    const dateDebutStr = voyageInfo?.date_depart
      ? voyageInfo.date_depart
      : displayDateDebut instanceof Date
        ? displayDateDebut.toISOString().split("T")[0]
        : String(displayDateDebut || "");

    const dateFinStr = voyageInfo?.date_arrivee
      ? voyageInfo.date_arrivee
      : displayDateFin instanceof Date
        ? displayDateFin.toISOString().split("T")[0]
        : String(displayDateFin || "");

    let finalCode = normalizeCode(inviteCode);
    if (!finalCode) {
      console.warn("⚠️ inviteCode vide — génération locale");
      finalCode = generateLocalCode();
      setTravelData({ inviteCode: finalCode } as any);
    }

    const statut: StatutKey = !hasInvites
      ? "à venir"
      : allInvitesResponded
        ? "à venir"
        : "en_attente";

    try {
      await savePlanToStorage(
        dateDebutStr,
        dateFinStr,
        finalCode,
        groupPreferences,
        statut,
      );

      if (allInvitesResponded) {
        Alert.alert(
          "Tous les invités ont répondu 🎉",
          "Vous pouvez maintenant créer votre plan de voyage !",
          [
            { text: "Annuler", style: "cancel" },
            {
              text: "Créer le plan 🗺️",
              onPress: () => router.push("/(tabs)/plan"),
            },
          ],
        );
      } else if (hasInvites && !invitesHaveResponded) {
        Alert.alert(
          "Résumé sauvegardé ⏳",
          `Code voyage : ${finalCode}\n\nVotre plan est en attente des réponses de vos invités. Retrouvez-le dans "Mes anciens plans".`,
          [{ text: "OK", onPress: () => router.replace("/promotion") }],
        );
      } else if (hasInvites && invitesHaveResponded) {
        Alert.alert(
          "Résumé enregistré ✅",
          `${groupPreferences.length} invité(s) ont répondu. Votre plan est en attente des ${
            totalInvites - groupPreferences.length
          } invité(s) restant(s).`,
          [{ text: "OK", onPress: () => router.replace("/promotion") }],
        );
      } else {
        Alert.alert("Résumé enregistré ✅", `Code voyage : ${finalCode}`, [
          { text: "OK", onPress: () => router.replace("/promotion") },
        ]);
      }
    } catch (err: any) {
      console.error("❌ handleConfirm crash:", err);
      Alert.alert("Erreur", "Impossible de sauvegarder : " + String(err));
    } finally {
      setConfirming(false);
    }
  };

  // ─── Sections données leader ──────────────────────────────────────────────
  const sections = [
    {
      title: "📍 Destination & Dates",
      items: [
        { label: "Destination", value: displayVille, icon: ICONS.ville },
        {
          label: "Arrivée",
          value: formatDate(displayDateDebut),
          icon: ICONS.dateDebut,
        },
        {
          label: "Départ",
          value: formatDate(displayDateFin),
          icon: ICONS.dateFin,
        },
        { label: "Durée", value: getDuration(), icon: "⏱️" },
      ],
    },
    {
      title: "🏨 Hébergement",
      items: [
        { label: "Type d'hôtel", value: hotelType, icon: ICONS.hotelType },
        {
          label: "Localisation",
          value: hotelLocation,
          icon: ICONS.hotelLocation,
        },
        { label: "Hôtel choisi", value: hotel, icon: ICONS.hotel },
      ],
    },
    {
      title: "🎯 Activités & Style",
      items: [
        {
          label: "Activités préférées",
          value: Array.isArray(activityTypes)
            ? activityTypes.join(", ")
            : activityTypes,
          icon: ICONS.activityTypes,
        },
        {
          label: "Voyage multi-villes",
          value: voyageType,
          icon: ICONS.voyageType,
        },
      ],
    },
    {
      title: "☕ Restauration & Budget",
      items: [
        {
          label: "Types de café",
          value: Array.isArray(cafeLevels) ? cafeLevels.join(", ") : cafeLevels,
          icon: ICONS.cafeLevels,
        },
        { label: "Café préféré", value: cafe, icon: ICONS.cafe },
        {
          label: "Budget total",
          value: budget ? `${budget} DT` : "",
          icon: ICONS.budget,
        },
      ],
    },
    {
      title: "👥 Groupe & Profil",
      items: [
        { label: "Tranche d'âge", value: ageRange, icon: ICONS.ageRange },
        {
          label: "Invités",
          value: emailInvites?.length
            ? `${emailInvites.length} personne${emailInvites.length > 1 ? "s" : ""}`
            : "",
          icon: "👥",
        },
        {
          label: "Code voyage",
          value: normalizeCode(inviteCode) || "—",
          icon: "🔑",
        },
      ],
    },
  ];

  const filteredSections = sections
    .map((s) => ({ ...s, items: s.items.filter((i) => i.value) }))
    .filter((s) => s.items.length > 0);

  const btnLabel = allInvitesResponded
    ? "Créer le plan 🗺️"
    : hasInvites
      ? "Sauvegarder & Attendre les invités"
      : "Sauvegarder le résumé";

  const btnIcon = allInvitesResponded ? "map-check" : "content-save";

  const btnColors: [string, string] = allInvitesResponded
    ? ["#16A34A", "#22C55E"]
    : confirming || loadingPrefs
      ? ["#94A3B8", "#94A3B8"]
      : [BLUE_PRIMARY, BLUE_LIGHT];

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchGroupData(true)}
            tintColor={BLUE_PRIMARY}
            colors={[BLUE_PRIMARY]}
          />
        }
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <AppMenuDark inviteCode={normalizeCode(inviteCode) || null} />
          <Image
            source={require("../../assets/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Récapitulatif de votre voyage</Text>
          <Text style={styles.subtitle}>
            Vérifiez vos informations avant de confirmer
          </Text>
        </View>

        {/* ── Bannière sync ── */}
        {loadingPrefs ? (
          <View style={styles.syncBanner}>
            <ActivityIndicator size="small" color={BLUE_PRIMARY} />
            <Text style={[styles.syncBannerText, { marginLeft: 8 }]}>
              Synchronisation en cours…
            </Text>
          </View>
        ) : lastSync ? (
          <View style={styles.syncBanner}>
            <Text style={styles.syncBannerIcon}>🔄</Text>
            <Text style={styles.syncBannerText}>
              Mis à jour à {fmtTime(lastSync)} · Tirez pour rafraîchir
            </Text>
          </View>
        ) : voyageInfo ? (
          <View style={styles.syncBanner}>
            <Text style={styles.syncBannerIcon}>🔄</Text>
            <Text style={styles.syncBannerText}>
              Infos synchronisées depuis la base de données
            </Text>
          </View>
        ) : null}

        {/* ── Bannière code voyage ── */}
        {normalizeCode(inviteCode) ? (
          <View style={styles.codeBanner}>
            <Text style={styles.codeBannerLabel}>🔑 Code voyage</Text>
            <Text style={styles.codeBannerValue}>
              {normalizeCode(inviteCode)}
            </Text>
            <Text style={styles.codeBannerHint}>
              Partagez ce code avec vos invités
            </Text>
          </View>
        ) : null}

        {/* ── Bannière statut invités ── */}
        {hasInvites && (
          <View style={styles.bannerWrapper}>
            {allInvitesResponded ? (
              <View style={[styles.banner, styles.bannerGreen]}>
                <Text style={styles.bannerIcon}>🎉</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bannerText, { color: GREEN_DARK }]}>
                    Tous les invités ont répondu ({groupPreferences.length}/
                    {totalInvites}) !
                  </Text>
                  <Text style={[styles.bannerSub, { color: GREEN_DARK }]}>
                    Vous pouvez maintenant créer le plan de voyage.
                  </Text>
                </View>
              </View>
            ) : invitesHaveResponded ? (
              <View style={[styles.banner, styles.bannerOrange]}>
                <Text style={styles.bannerIcon}>⏳</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bannerText, { color: "#92400E" }]}>
                    {groupPreferences.length}/{totalInvites} invité(s) ont
                    répondu
                  </Text>
                  <Text style={[styles.bannerSub, { color: "#92400E" }]}>
                    En attente des {totalInvites - groupPreferences.length}{" "}
                    invité(s) restant(s).
                  </Text>
                </View>
              </View>
            ) : (
              <View style={[styles.banner, styles.bannerOrange]}>
                <Text style={styles.bannerIcon}>⏳</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bannerText, { color: "#92400E" }]}>
                    En attente des invités (0/{totalInvites})
                  </Text>
                  <Text style={[styles.bannerSub, { color: "#92400E" }]}>
                    Tirez vers le bas pour rafraîchir.
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── Label leader ── */}
        <View style={styles.sectionLabelRow}>
          <View
            style={[styles.sectionDot, { backgroundColor: BLUE_PRIMARY }]}
          />
          <Text style={styles.sectionLabelText}>
            🧭 Vos préférences (leader)
          </Text>
        </View>

        {/* ── Sections leader ── */}
        {filteredSections.map((section, idx) => (
          <View key={idx} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionDot} />
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            <View style={styles.card}>
              {section.items.map((item, i) => (
                <View
                  key={i}
                  style={[
                    styles.row,
                    i === section.items.length - 1 && styles.rowLast,
                  ]}
                >
                  <View style={styles.rowLeft}>
                    <Text style={styles.rowIcon}>{item.icon}</Text>
                    <Text style={styles.rowLabel}>{item.label}</Text>
                  </View>
                  <Text style={styles.rowValue}>{item.value}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* ── Préférences invités ─────────────────────────────────────────────
            Affiché dès qu'au moins un invité a répondu.
            Chaque bloc montre toutes les données à jour de cet invité.
        ── */}
        {invitesHaveResponded && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: GREEN }]} />
              <Text style={[styles.sectionTitle, { color: GREEN_DARK }]}>
                🗳️ Préférences des invités ({groupPreferences.length}/
                {totalInvites})
              </Text>
            </View>
            <View style={styles.card}>
              {groupPreferences.map((pref, i) => (
                <View
                  key={pref.email ?? i}
                  style={[
                    styles.prefBlock,
                    i === groupPreferences.length - 1 &&
                      !!allInvitesResponded &&
                      styles.rowLast,
                    i < groupPreferences.length - 1 && styles.prefBlockBorder,
                  ]}
                >
                  {/* Entête invité */}
                  <View style={styles.prefHeaderRow}>
                    <Text style={styles.prefAvatar}>👤</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.prefEmail}>
                        {pref.full_name || pref.email}
                      </Text>
                      {pref.full_name && (
                        <Text style={styles.prefSubEmail}>{pref.email}</Text>
                      )}
                    </View>
                    <View style={styles.prefRoleBadge}>
                      <Text style={styles.prefRoleText}>invité</Text>
                    </View>
                  </View>

                  {/* Détails */}
                  <View style={styles.prefDetailsGrid}>
                    {pref.hotel_type && (
                      <PrefChip icon="🏨" label={pref.hotel_type} />
                    )}
                    {pref.hotel_location && (
                      <PrefChip icon="📍" label={pref.hotel_location} />
                    )}
                    {pref.activity_types && (
                      <PrefChip icon="🎯" label={pref.activity_types} />
                    )}
                    {pref.cafe_levels && (
                      <PrefChip icon="☕" label={pref.cafe_levels} />
                    )}
                    {pref.voyage_type && (
                      <PrefChip icon="✈️" label={pref.voyage_type} />
                    )}
                    {pref.budget && (
                      <PrefChip icon="💰" label={`${pref.budget} TND`} />
                    )}
                    {pref.hotel_name && (
                      <PrefChip
                        icon="🏠"
                        label={`Hôtel : ${pref.hotel_name}`}
                      />
                    )}
                    {pref.cafe_name && (
                      <PrefChip icon="🫖" label={`Café : ${pref.cafe_name}`} />
                    )}
                    {pref.phone && <PrefChip icon="📞" label={pref.phone} />}
                  </View>
                </View>
              ))}

              {/* Invités en attente */}
              {!allInvitesResponded && (
                <View style={[styles.prefBlock, styles.rowLast]}>
                  <View style={styles.pendingRow}>
                    <Text style={styles.pendingIcon}>⏳</Text>
                    <Text style={styles.pendingText}>
                      {totalInvites - groupPreferences.length} invité(s) n'ont
                      pas encore répondu
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── Bouton rafraîchir manuel ── */}
        {hasInvites && !allInvitesResponded && (
          <TouchableOpacity
            style={styles.refreshManualBtn}
            onPress={() => fetchGroupData(true)}
            disabled={refreshing || loadingPrefs}
          >
            {refreshing || loadingPrefs ? (
              <ActivityIndicator size="small" color={BLUE_PRIMARY} />
            ) : (
              <Text style={styles.refreshManualBtnText}>
                🔄 Vérifier les réponses
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* ── Actions ── */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>← Modifier</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleConfirm}
            activeOpacity={0.85}
            disabled={confirming || loadingPrefs}
            style={{ flex: 2 }}
          >
            <LinearGradient
              colors={btnColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.confirmButton}
            >
              {confirming ? (
                <ActivityIndicator size="small" color={WHITE} />
              ) : (
                <>
                  <Text style={styles.confirmButtonText}>{btnLabel}</Text>
                  <MaterialCommunityIcons
                    name={btnIcon as any}
                    size={20}
                    color={WHITE}
                  />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          En confirmant, vous acceptez nos conditions d'utilisation.
        </Text>
      </ScrollView>
    </>
  );
}

// ─── Sous-composant ───────────────────────────────────────────────────────────
function PrefChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={chipStyles.chip}>
      <Text style={chipStyles.icon}>{icon}</Text>
      <Text style={chipStyles.label}>{label}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F0F5FC",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#D6E4FF",
  },
  icon: { fontSize: 12 },
  label: { fontSize: 12, color: "#4A6080", fontWeight: "600" },
});

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { paddingBottom: 40 },

  // Header
  header: {
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 20,
    backgroundColor: WHITE,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    position: "relative",
  },
  logo: { width: 70, height: 70, marginBottom: 12 },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: BLUE_DEEP,
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: { fontSize: 13, color: TEXT_MUTED, textAlign: "center" },

  // Sync
  syncBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    padding: 10,
  },
  syncBannerIcon: { fontSize: 14, marginRight: 6 },
  syncBannerText: {
    flex: 1,
    fontSize: 11,
    color: "#1E40AF",
    fontWeight: "600",
  },

  // Code banner
  codeBanner: {
    backgroundColor: BLUE_DEEP,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    gap: 4,
  },
  codeBannerLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  codeBannerValue: {
    fontSize: 28,
    fontWeight: "900",
    color: WHITE,
    letterSpacing: 6,
    fontFamily: "monospace",
  },
  codeBannerHint: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
  },

  // Banners
  bannerWrapper: { paddingHorizontal: 16, marginBottom: 12 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  bannerGreen: { backgroundColor: "#DCFCE7", borderColor: "#BBF7D0" },
  bannerOrange: { backgroundColor: "#FEF3C7", borderColor: "#FDE68A" },
  bannerIcon: { fontSize: 22 },
  bannerText: { fontSize: 14, fontWeight: "700" },
  bannerSub: { fontSize: 12, marginTop: 2 },

  // Section labels
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 4,
    gap: 8,
  },
  sectionLabelText: {
    fontSize: 13,
    fontWeight: "700",
    color: BLUE_PRIMARY,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Sections
  section: { marginBottom: 16, paddingHorizontal: 16 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    paddingLeft: 4,
    gap: 8,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BLUE_PRIMARY,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: BLUE_DEEP,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  // Card
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: BORDER,
  },

  // Row
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  rowIcon: { fontSize: 18, width: 28 },
  rowLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: TEXT_MEDIUM,
    flexShrink: 1,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: "600",
    color: BLUE_DEEP,
    flexShrink: 1,
    textAlign: "right",
    maxWidth: "55%",
  },

  // Prefs invités
  prefBlock: {
    paddingVertical: 14,
    gap: 10,
  },
  prefBlockBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  prefHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  prefAvatar: { fontSize: 24 },
  prefEmail: { fontSize: 14, fontWeight: "700", color: BLUE_DEEP },
  prefSubEmail: { fontSize: 11, color: TEXT_MUTED, marginTop: 1 },
  prefRoleBadge: {
    backgroundColor: "#DCFCE7",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  prefRoleText: {
    fontSize: 10,
    fontWeight: "700",
    color: GREEN_DARK,
    textTransform: "uppercase",
  },
  prefDetailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },

  // Pending
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  pendingIcon: { fontSize: 16 },
  pendingText: {
    fontSize: 13,
    color: ORANGE,
    fontWeight: "600",
  },

  // Refresh btn
  refreshManualBtn: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BLUE_PRIMARY,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  refreshManualBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: BLUE_PRIMARY,
  },

  // Actions
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginTop: 8,
    gap: 12,
  },
  backButton: {
    flex: 1,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  backButtonText: { fontSize: 15, fontWeight: "600", color: TEXT_MUTED },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    paddingVertical: 14,
    shadowColor: BLUE_PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  confirmButtonText: { fontSize: 14, fontWeight: "700", color: WHITE },

  // Footer
  footer: {
    fontSize: 11,
    color: TEXT_MUTED,
    textAlign: "center",
    marginTop: 24,
    paddingHorizontal: 20,
  },
});

// ─── Styles du menu sombre (AppMenuDark) ──────────────────────────────────────
const menuStyles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    top: Platform.OS === "ios" ? 16 : 12,
    right: 16,
    zIndex: 9999,
  },
  trigger: {
    padding: 8,
    backgroundColor: BLUE_PRIMARY,
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
  menuTextBlock: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  menuSub: {
    fontSize: 11,
    color: "#4A6080",
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#1A2B45",
    marginVertical: 4,
    marginHorizontal: 16,
  },
});

import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const API = "http://192.168.1.8:5000";

const BLUE_DEEP = "#042A66";
const BLUE_PRIMARY = "#0A4DBF";
const BLUE_PALE = "#D6E4FF";
const BLUE_ULTRA_PALE = "#EEF4FF";
const GOLD = "#C89B3C";
const GOLD_LIGHT = "#E8B84B";
const GREEN = "#1B8A5A";
const GREEN_PALE = "#D4F5E9";
const ORANGE = "#E67E22";
const ORANGE_PALE = "#FEF0E3";
const PURPLE = "#7C3AED";
const PURPLE_PALE = "#EDE9FE";
const RED = "#DC2626";
const RED_PALE = "#FEE2E2";
const BLUE_LIGHT = "#3B72E8";
const WHITE = "#FFFFFF";
const TEXT_MUTED = "#4A6080";
const EXCURSION_COLOR = "#0891B2";
const LOCAL_ACT_BG = "#F5F3FF";
const LOCAL_ACT_BORDER = "#7C3AED";
const LOCAL_ACT_TEXT = "#4C1D95";
const LOCAL_ACT_HINT = "#6D28D9";
const LOCAL_PRIX_BG = "#EDE9FE";
const LOCAL_PRIX_BORDER = "#C4B5FD";
const LOCAL_PRIX_TEXT = "#5B21B6";

type StatutKey = "a venir" | "en cours" | "termine" | "en_attente";
type FilterKey = "tous" | "gratuit" | "premium" | "resume" | "plan";

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

type PendingInvite = { email: string; statut: string };

type LocalActivity = {
  name: string;
  prix?: string;
  description?: string;
};

type DayPlan = {
  title: string;
  ville?: string;
  hotel: {
    name: string;
    address: string;
    transport: string;
    image: string;
    rating?: string;
    lat?: number;
    lng?: number;
  };
  cafe: {
    name: string;
    address: string;
    image: string;
    specialty?: string;
    lat?: number;
    lng?: number;
  };
  activity: string;
  activity_location?: string;
  localActivity?: LocalActivity | string | null;
  transport?: string | null;
  meteo?: string | null;
  conseil?: string | null;
  isExcursion?: boolean;
  excursionCity?: string;
  mainDestination?: string;
  activitiesSource?: string;
  cost?: { hotel: number; cafe: number; activity: number; dailyTotal: number };
};

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
  itinerary: DayPlan[];
  type: "gratuit" | "premium";
  inviteCode: string;
  plan_code?: string;
  guestPrefs?: GuestPrefs[];
  leaderPrefs?: Record<string, any>;
  budget?: number;
  source?: "resume" | "plan";
};

/* --- Utilitaires --- */
const fetchWithTimeout = (url: string, options?: RequestInit, ms = 5000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
};

const normalizeEmail = (email: string | null | undefined): string =>
  email?.trim().toLowerCase() || "";

const normalizeCode = (code: string | null | undefined): string =>
  code?.trim().toUpperCase() || "";

const hasMajority = (ayantRepondu: number, attendus: number): boolean => {
  if (attendus === 0) return true;
  return ayantRepondu >= Math.ceil(attendus / 2);
};

const computeStatut = (plan: Plan, freshGuests: GuestPrefs[]): StatutKey => {
  const attendus = plan.nombreInvitesAttendus;
  const ayantRepondu = freshGuests.length;
  if (plan.statut === "en cours" || plan.statut === "termine")
    return plan.statut;
  if (attendus === 0) return "a venir";
  if (hasMajority(ayantRepondu, attendus)) return "a venir";
  return "en_attente";
};

const inferSource = (plan: Plan): "resume" | "plan" => {
  if (plan.source) return plan.source;
  return plan.itinerary && plan.itinerary.length > 0 ? "plan" : "resume";
};

const getSourceLabel = (source?: "resume" | "plan") =>
  source === "plan" ? "🗺️ Plan" : "📋 Résumé";

const getSourceColor = (source?: "resume" | "plan") =>
  source === "plan" ? GREEN : BLUE_PRIMARY;

const getSourceBg = (source?: "resume" | "plan") =>
  source === "plan" ? GREEN_PALE : BLUE_PALE;

const getStorageKey = (plan: Plan): string =>
  plan.type === "premium" ? "@premium_travel_plans" : "@travel_plans";

const getDisplayCode = (plan: Plan, preferPlanCode = false): string => {
  if (preferPlanCode) {
    if (plan.plan_code && plan.plan_code.trim() !== "") {
      return normalizeCode(plan.plan_code);
    }
  }
  if (plan.inviteCode && plan.inviteCode.trim() !== "") {
    return normalizeCode(plan.inviteCode);
  }
  if (plan.plan_code && plan.plan_code.trim() !== "") {
    return normalizeCode(plan.plan_code);
  }
  if (plan.id && plan.id.length >= 4) {
    const cleanId = plan.id.replace(/[^A-Za-z0-9]/g, "");
    return cleanId.slice(0, 8).toUpperCase();
  }
  return "—";
};

const getDisplayBudget = (plan: Plan): string => {
  if (plan.budget && plan.budget > 0) return `${plan.budget} TND`;
  if (plan.type === "premium" && plan.budget === 0) return "Non estimé";
  return "—";
};

/* --- Helpers localActivity --- */
const getLocalActivityName = (
  la: LocalActivity | string | null | undefined,
): string => {
  if (!la) return "";
  if (typeof la === "string") return la;
  return la.name || "";
};

const getLocalActivityDescription = (
  la: LocalActivity | string | null | undefined,
): string => {
  if (!la || typeof la === "string") return "";
  return la.description || "";
};

const getLocalActivityPrix = (
  la: LocalActivity | string | null | undefined,
): string => {
  if (!la || typeof la === "string") return "";
  return la.prix && la.prix !== "Variable" ? la.prix : "";
};

/* --- Ouvrir dans Maps --- */
const openInMaps = (
  name: string,
  address: string,
  lat?: number,
  lng?: number,
) => {
  let url = "";
  if (lat && lng) {
    url =
      Platform.OS === "ios"
        ? `maps://?q=${encodeURIComponent(name)}&ll=${lat},${lng}`
        : `geo:${lat},${lng}?q=${encodeURIComponent(name)}`;
  } else {
    const query = encodeURIComponent(`${name} ${address}`);
    url =
      Platform.OS === "ios"
        ? `maps://?q=${query}`
        : `https://www.google.com/maps/search/?api=1&query=${query}`;
  }
  Linking.canOpenURL(url).then((supported) => {
    if (supported) {
      Linking.openURL(url);
    } else {
      const fallback = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address}`)}`;
      Linking.openURL(fallback);
    }
  });
};

const MapButton = ({
  name,
  address,
  lat,
  lng,
}: {
  name: string;
  address: string;
  lat?: number;
  lng?: number;
}) => (
  <TouchableOpacity
    style={mapStyles.btn}
    onPress={() => openInMaps(name, address, lat, lng)}
    activeOpacity={0.7}
  >
    <MaterialCommunityIcons
      name="map-marker-outline"
      size={13}
      color={BLUE_PRIMARY}
    />
    <Text style={mapStyles.btnTxt}>Voir sur Maps</Text>
    <MaterialCommunityIcons name="open-in-new" size={11} color={BLUE_PRIMARY} />
  </TouchableOpacity>
);

/* --- Menu --- */
function AppMenuDark({ inviteCode }: { inviteCode: string | null }) {
  const [open, setOpen] = useState(false);
  const [promptVisible, setPromptVisible] = useState(false);
  const [promptCode, setPromptCode] = useState("");

  const handleJoinGroup = () => {
    const code = promptCode.trim().toUpperCase();
    if (code.length === 0) {
      Alert.alert("Erreur", "Le code est requis.");
      return;
    }
    setPromptVisible(false);
    setPromptCode("");
    router.push({ pathname: "/group-chat", params: { inviteCode: code } });
  };

  const handleChatbot = () => {
    setOpen(false);
    router.push("/chatbot");
  };

  const handleGroupChat = () => {
    setOpen(false);
    if (inviteCode) {
      router.push({ pathname: "/group-chat", params: { inviteCode } });
      return;
    }
    setPromptVisible(true);
  };

  const handleChangePassword = () => {
    setOpen(false);
    router.push("/reset-password");
  };

  const handleLogout = () => {
    setOpen(false);
    Alert.alert("Déconnexion", "Êtes-vous sûr de vouloir vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Oui", style: "destructive", onPress: () => router.replace("/") },
    ]);
  };

  const MENU_ITEMS = [
    {
      icon: "robot-outline" as const,
      label: "Assistant IA",
      sub: "Posez vos questions voyage",
      color: BLUE_PRIMARY,
      onPress: handleChatbot,
    },
    {
      icon: "message-group-outline" as const,
      label: "Groupe voyage",
      sub: inviteCode ? `Code : ${inviteCode}` : "Communiquer avec le groupe",
      color: BLUE_LIGHT,
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
                color={TEXT_MUTED}
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
        onRequestClose={() => {
          setPromptVisible(false);
          setPromptCode("");
        }}
      >
        <TouchableOpacity
          style={promptStyles.overlay}
          activeOpacity={1}
          onPress={() => {
            setPromptVisible(false);
            setPromptCode("");
          }}
        >
          <TouchableOpacity activeOpacity={1} style={promptStyles.card}>
            <View style={promptStyles.iconWrap}>
              <MaterialCommunityIcons
                name="arrow-right"
                size={28}
                color={BLUE_LIGHT}
              />
            </View>
            <Text style={promptStyles.title}>Rejoindre un groupe</Text>
            <Text style={promptStyles.subtitle}>
              Saisissez le code d'invitation du voyage
            </Text>
            <View style={promptStyles.inputWrap}>
              <MaterialCommunityIcons
                name="pound"
                size={18}
                color={BLUE_LIGHT}
                style={{ marginRight: 8 }}
              />
              <TextInput
                style={promptStyles.input}
                placeholder="Ex : ABCD12"
                placeholderTextColor={TEXT_MUTED}
                value={promptCode}
                onChangeText={setPromptCode}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={10}
              />
            </View>
            <View style={promptStyles.btnRow}>
              <TouchableOpacity
                style={promptStyles.btnCancel}
                onPress={() => {
                  setPromptVisible(false);
                  setPromptCode("");
                }}
                activeOpacity={0.7}
              >
                <Text style={promptStyles.btnCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={promptStyles.btnConfirm}
                onPress={handleJoinGroup}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={[BLUE_LIGHT, BLUE_PRIMARY]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={promptStyles.btnConfirmGrad}
                >
                  <Text style={promptStyles.btnConfirmText}>Rejoindre</Text>
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

/* --- Écran principal --- */
export default function AncienPlanScreen() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [filteredPlans, setFilteredPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("tous");
  const [searchQuery, setSearchQuery] = useState("");
  const [groupPrefsForModal, setGroupPrefsForModal] = useState<GuestPrefs[]>(
    [],
  );
  const [leaderPrefsForModal, setLeaderPrefsForModal] =
    useState<GuestPrefs | null>(null);
  const [loadingGroupPrefs, setLoadingGroupPrefs] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editEmailValue, setEditEmailValue] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [forfaitModalVisible, setForfaitModalVisible] = useState(false);
  const [pendingPlanForForfait, setPendingPlanForForfait] =
    useState<Plan | null>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletingPref, setDeletingPref] = useState<GuestPrefs | null>(null);
  const [deleteEmailInput, setDeleteEmailInput] = useState("");
  const [deletingInProgress, setDeletingInProgress] = useState(false);

  const menuInviteCode = selectedPlan
    ? normalizeCode(selectedPlan.inviteCode) || null
    : null;

  /* --- API helpers --- */
  const fetchGroupData = async (inviteCode: string) => {
    const code = normalizeCode(inviteCode);
    if (!code) return { guests: [], leader: null };
    try {
      const res = await fetchWithTimeout(
        `${API}/api/group-summary?invite_code=${code}`,
      );
      if (!res.ok) return { guests: [], leader: null };
      const json = await res.json();
      return {
        guests: (json.guests_prefs as GuestPrefs[]) || [],
        leader: (json.leader_prefs as GuestPrefs) || null,
      };
    } catch (e) {
      return { guests: [], leader: null };
    }
  };

  const fetchPendingInvites = async (
    inviteCode: string,
  ): Promise<PendingInvite[]> => {
    const code = normalizeCode(inviteCode);
    if (!code) return [];
    try {
      const res = await fetchWithTimeout(
        `${API}/api/pending-invites?invite_code=${code}`,
      );
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json.pending) ? json.pending : [];
    } catch (e) {
      return [];
    }
  };

  const checkOverlapForInvite = async (
    email: string,
    plan: Plan,
    inviteCode: string,
  ) => {
    try {
      const res = await fetchWithTimeout(`${API}/api/check-overlap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          invite_code: normalizeCode(inviteCode),
          destination: plan.destination,
          date_depart: plan.dateDebut,
          date_arrivee: plan.dateFin,
        }),
      });
      const json = await res.json();
      if (json.overlap && json.conflicts?.length > 0) {
        const details = (
          json.conflicts as Array<{
            destination: string;
            date_depart: string;
            date_arrivee: string;
            gap_days: number;
          }>
        )
          .map((c) =>
            c.gap_days === 0
              ? `• ${c.destination} (${c.date_depart} → ${c.date_arrivee}) — chevauchement direct`
              : `• ${c.destination} (${c.date_depart} → ${c.date_arrivee}) — écart : ${c.gap_days} jour(s)`,
          )
          .join("\n");
        Alert.alert(
          "⚠️ Chevauchement détecté",
          `${email} a déjà un voyage proche :\n\n${details}\n\nUn email d'alerte lui a été envoyé.`,
        );
      }
    } catch (e) {}
  };

  const deleteGuestWithPrompt = (plan: Plan, pref: GuestPrefs) => {
    const inviteCode = normalizeCode(plan.inviteCode);
    if (!inviteCode) {
      Alert.alert("Erreur", "Code d'invitation manquant.");
      return;
    }

    let suggestedEmail = pref.email || "";
    if (!suggestedEmail && pref.full_name && pendingInvites.length > 0) {
      const match = pendingInvites.find(
        (p) =>
          p.email.toLowerCase().includes(pref.full_name!.toLowerCase()) ||
          pref
            .full_name!.toLowerCase()
            .includes(p.email.split("@")[0].toLowerCase()),
      );
      if (match) suggestedEmail = match.email;
    }

    setDeletingPref(pref);
    setDeleteEmailInput(suggestedEmail);
    setDeleteModalVisible(true);
  };

  const performDelete = async (
    inviteCode: string,
    email: string,
    guestName: string | null,
  ) => {
    try {
      const response = await fetch(`${API}/api/delete-guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: inviteCode, email }),
      });

      const rawText = await response.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        throw new Error("Réponse invalide du serveur");
      }
      if (!response.ok) throw new Error(data.error || "Erreur serveur");

      if (
        selectedPlan &&
        normalizeCode(selectedPlan.inviteCode) === inviteCode
      ) {
        const [{ guests, leader }, pending] = await Promise.all([
          fetchGroupData(inviteCode),
          fetchPendingInvites(inviteCode),
        ]);
        setGroupPrefsForModal(guests);
        setLeaderPrefsForModal(leader);
        setPendingInvites(pending);
      }
      Alert.alert(
        "✅ Supprimé",
        `${guestName || email} a été retiré du voyage.`,
      );
    } catch (error: any) {
      Alert.alert("Erreur", error.message);
    }
  };

  const openModal = async (plan: Plan) => {
    setSelectedPlan(plan);
    setGroupPrefsForModal([]);
    setLeaderPrefsForModal(null);
    setPendingInvites([]);
    setEditingEmail(null);
    setModalVisible(true);
    setLoadingGroupPrefs(true);
    const [{ guests, leader }, pending] = await Promise.all([
      fetchGroupData(plan.inviteCode),
      fetchPendingInvites(plan.inviteCode),
    ]);
    setGroupPrefsForModal(guests);
    setLeaderPrefsForModal(leader);
    setPendingInvites(pending);
    setLoadingGroupPrefs(false);
  };

  const saveEditedEmail = async (plan: Plan, oldEmail: string) => {
    const newEmail = normalizeEmail(editEmailValue);
    const oldEmailNormalized = normalizeEmail(oldEmail);
    if (!newEmail || newEmail === oldEmailNormalized) {
      setEditingEmail(null);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      Alert.alert("Email invalide", "Veuillez saisir un email valide.");
      return;
    }
    setSavingEmail(true);
    try {
      const res = await fetchWithTimeout(`${API}/api/update-invite-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invite_code: normalizeCode(plan.inviteCode),
          old_email: oldEmailNormalized,
          new_email: newEmail,
          destination: plan.destination,
          date_depart: plan.dateDebut,
          date_arrivee: plan.dateFin,
        }),
      });
      if (!res.ok) throw new Error("Erreur serveur");
      await fetchWithTimeout(`${API}/send-invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invites: [newEmail],
          destination: plan.destination,
          date_depart: plan.dateDebut,
          date_arrivee: plan.dateFin,
          admin_id: plan.leaderPrefs?.email ?? "",
          invite_code: normalizeCode(plan.inviteCode),
        }),
      });
      await checkOverlapForInvite(newEmail, plan, plan.inviteCode);
      setPendingInvites((prev) =>
        prev.map((i) =>
          normalizeEmail(i.email) === oldEmailNormalized
            ? { ...i, email: newEmail }
            : i,
        ),
      );
      setEditingEmail(null);
      Alert.alert(
        "✅ Email modifié",
        `L'invitation a été renvoyée à ${newEmail}.`,
      );
    } catch (e) {
      Alert.alert("Erreur", "Impossible de modifier cet email.");
    } finally {
      setSavingEmail(false);
    }
  };

  const checkAndUpdate = async (
    plansList: Plan[],
    key: string,
  ): Promise<Plan[]> => {
    let changed = false;
    const updated = await Promise.all(
      plansList.map(async (plan) => {
        if (inferSource(plan) === "plan") return plan;
        if (plan.statut === "termine" || plan.statut === "en cours")
          return plan;
        try {
          const { guests } = await fetchGroupData(plan.inviteCode);
          const newStatut = computeStatut(plan, guests);
          if (newStatut !== plan.statut) {
            changed = true;
            return { ...plan, statut: newStatut, guestPrefs: guests };
          }
          return { ...plan, guestPrefs: guests };
        } catch {
          return plan;
        }
      }),
    );
    if (changed) await AsyncStorage.setItem(key, JSON.stringify(updated));
    return updated;
  };

  const removeConvertedResumes = async (
    freePlans: Plan[],
    premiumPlans: Plan[],
  ): Promise<{ free: Plan[]; premium: Plan[] }> => {
    const planKeys = new Set<string>();
    [...freePlans, ...premiumPlans].forEach((p) => {
      if (inferSource(p) === "plan") {
        if (p.inviteCode) planKeys.add(normalizeCode(p.inviteCode));
        if (p.plan_code) planKeys.add(normalizeCode(p.plan_code));
      }
    });

    const filterResumes = (plans: Plan[]) =>
      plans.filter((p) => {
        if (inferSource(p) !== "resume") return true;
        const invite = normalizeCode(p.inviteCode);
        const planC = normalizeCode(p.plan_code);
        const isConverted =
          (invite && planKeys.has(invite)) || (planC && planKeys.has(planC));
        return !isConverted;
      });

    const newFree = filterResumes(freePlans);
    const newPremium = filterResumes(premiumPlans);
    return { free: newFree, premium: newPremium };
  };

  const loadPlans = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);
    try {
      let freeJson = await AsyncStorage.getItem("@travel_plans");
      let premiumJson = await AsyncStorage.getItem("@premium_travel_plans");
      let freePlans: Plan[] = freeJson ? JSON.parse(freeJson) : [];
      let premiumPlans: Plan[] = premiumJson ? JSON.parse(premiumJson) : [];

      freePlans = await checkAndUpdate(freePlans, "@travel_plans");
      premiumPlans = await checkAndUpdate(
        premiumPlans,
        "@premium_travel_plans",
      );

      const { free: cleanedFree, premium: cleanedPremium } =
        await removeConvertedResumes(freePlans, premiumPlans);

      if (cleanedFree.length !== freePlans.length) {
        await AsyncStorage.setItem(
          "@travel_plans",
          JSON.stringify(cleanedFree),
        );
      }
      if (cleanedPremium.length !== premiumPlans.length) {
        await AsyncStorage.setItem(
          "@premium_travel_plans",
          JSON.stringify(cleanedPremium),
        );
      }

      const allPlans = [...cleanedFree, ...cleanedPremium].sort(
        (a, b) =>
          new Date(b.dateCreation).getTime() -
          new Date(a.dateCreation).getTime(),
      );
      setPlans(allPlans);
      setFilteredPlans(allPlans);
    } catch (e) {
      console.error("loadPlans error", e);
      setPlans([]);
      setFilteredPlans([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPlans();
    }, [loadPlans]),
  );

  useEffect(() => {
    let filtered = [...plans];
    if (activeFilter !== "tous") {
      if (activeFilter === "gratuit" || activeFilter === "premium") {
        filtered = filtered.filter((p) => p.type === activeFilter);
      } else if (activeFilter === "resume" || activeFilter === "plan") {
        filtered = filtered.filter((p) => inferSource(p) === activeFilter);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.nom.toLowerCase().includes(q) ||
          p.destination.toLowerCase().includes(q) ||
          getDisplayCode(p, inferSource(p) === "resume")
            .toLowerCase()
            .includes(q),
      );
    }
    setFilteredPlans(filtered);
  }, [activeFilter, searchQuery, plans]);

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString("fr-FR");
    } catch {
      return d;
    }
  };

  const statutConfig: Record<
    StatutKey,
    { color: string; bg: string; icon: string; label: string }
  > = {
    "a venir": {
      color: BLUE_PRIMARY,
      bg: BLUE_PALE,
      icon: "⏳",
      label: "À venir",
    },
    "en cours": { color: GREEN, bg: GREEN_PALE, icon: "✈️", label: "En cours" },
    termine: { color: "#555", bg: "#eee", icon: "✅", label: "Terminé" },
    en_attente: {
      color: ORANGE,
      bg: ORANGE_PALE,
      icon: "🕐",
      label: "En attente des invités",
    },
  };

  const buildLeaderPref = (
    plan: Plan,
    leaderPref: GuestPrefs | null,
  ): GuestPrefs | null => {
    if (leaderPref) {
      return {
        ...leaderPref,
        destination: plan.destination || leaderPref.destination || null,
        date_depart: plan.dateDebut || leaderPref.date_depart || null,
        date_arrivee: plan.dateFin || leaderPref.date_arrivee || null,
      };
    }
    if (plan.leaderPrefs) {
      return {
        role: "leader",
        email: normalizeEmail(plan.leaderPrefs.email || ""),
        full_name: plan.leaderPrefs.full_name || null,
        hotel_type:
          plan.leaderPrefs.hotelType || plan.leaderPrefs.hotel_type || null,
        hotel_location:
          plan.leaderPrefs.hotelLocation ||
          plan.leaderPrefs.hotel_location ||
          null,
        activity_types: Array.isArray(plan.leaderPrefs.activityTypes)
          ? plan.leaderPrefs.activityTypes.join(", ")
          : plan.leaderPrefs.activity_types || null,
        cafe_levels: Array.isArray(plan.leaderPrefs.cafeLevels)
          ? plan.leaderPrefs.cafeLevels.join(", ")
          : plan.leaderPrefs.cafe_levels || null,
        voyage_type:
          plan.leaderPrefs.voyageType || plan.leaderPrefs.voyage_type || null,
        budget: plan.leaderPrefs.budget
          ? String(plan.leaderPrefs.budget)
          : null,
        hotel_name:
          plan.leaderPrefs.hotel || plan.leaderPrefs.hotel_name || null,
        cafe_name: plan.leaderPrefs.cafe || plan.leaderPrefs.cafe_name || null,
        tranche_age:
          plan.leaderPrefs.ageRange || plan.leaderPrefs.tranche_age || null,
        destination: plan.destination || null,
        date_depart: plan.dateDebut || null,
        date_arrivee: plan.dateFin || null,
        phone: null,
      } as GuestPrefs;
    }
    return null;
  };

  const navigateToPlanWithPrefs = (
    plan: Plan,
    guestPrefs: GuestPrefs[],
    leaderPref: GuestPrefs | null,
  ) => {
    const invites = guestPrefs.filter((g) => g.role === "invite");
    const leader = buildLeaderPref(plan, leaderPref);
    router.push({
      pathname: "/plan",
      params: {
        groupPrefsJson: JSON.stringify(invites),
        leaderPrefsJson: leader ? JSON.stringify(leader) : "",
        inviteCode: plan.inviteCode ?? "",
        planNom: plan.nom ?? "",
      },
    });
  };

  const navigateToPremiumWithPrefs = (
    plan: Plan,
    guestPrefs: GuestPrefs[],
    leaderPref: GuestPrefs | null,
  ) => {
    const invites = guestPrefs.filter((g) => g.role === "invite");
    const leader = buildLeaderPref(plan, leaderPref);
    router.push({
      pathname: "/planpremium ",
      params: {
        groupPrefsJson: JSON.stringify(invites),
        leaderPrefsJson: leader ? JSON.stringify(leader) : "",
        inviteCode: plan.inviteCode ?? "",
        planNom: plan.nom ?? "",
      },
    } as any);
  };

  const openForfaitModal = (plan: Plan) => {
    setPendingPlanForForfait(plan);
    setForfaitModalVisible(true);
  };

  const handleForfaitChoice = async (choice: "gratuit" | "premium") => {
    setForfaitModalVisible(false);
    if (!pendingPlanForForfait) return;
    const { guests, leader } = await fetchGroupData(
      pendingPlanForForfait.inviteCode,
    );
    const guestPrefs =
      guests.length > 0 ? guests : (pendingPlanForForfait.guestPrefs ?? []);
    if (choice === "gratuit")
      navigateToPlanWithPrefs(pendingPlanForForfait, guestPrefs, leader);
    else navigateToPremiumWithPrefs(pendingPlanForForfait, guestPrefs, leader);
    setPendingPlanForForfait(null);
  };

  const handleCreatePlan = (plan: Plan) => {
    const ayantRepondu = groupPrefsForModal.length;
    if (!hasMajority(ayantRepondu, plan.nombreInvitesAttendus)) return;
    setModalVisible(false);
    openForfaitModal(plan);
  };

  const forceCheckPlan = async (plan: Plan) => {
    const code = normalizeCode(plan.inviteCode);
    if (!code) {
      Alert.alert("Erreur", "Ce plan n'a pas de code.");
      return;
    }
    try {
      const { guests } = await fetchGroupData(code);
      const storageKey = getStorageKey(plan);
      const existingJson = await AsyncStorage.getItem(storageKey);
      const existing: Plan[] = existingJson ? JSON.parse(existingJson) : [];
      const nouveauStatut = computeStatut(plan, guests);
      const updated = existing.map((p) =>
        normalizeCode(p.inviteCode) === code
          ? { ...p, statut: nouveauStatut, guestPrefs: guests }
          : p,
      );
      await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
      await loadPlans();
      const attendus = plan.nombreInvitesAttendus;
      const ayantRepondu = guests.length;
      if (ayantRepondu >= attendus && attendus > 0)
        Alert.alert(
          "🎉 Tous les invités ont répondu !",
          `${ayantRepondu}/${attendus} invités ont soumis leurs préférences.`,
        );
      else if (hasMajority(ayantRepondu, attendus))
        Alert.alert(
          "✅ Majorité atteinte !",
          `${ayantRepondu}/${attendus} invité(s) ont répondu.`,
        );
      else if (ayantRepondu > 0)
        Alert.alert(
          "✅ Mise à jour",
          `${ayantRepondu}/${attendus} invité(s) ont répondu.`,
        );
      else
        Alert.alert(
          "⏳ Toujours en attente",
          "Aucun invité n'a encore soumis ses préférences.",
        );
    } catch (e) {
      Alert.alert("Erreur", "Impossible de contacter le serveur.");
    }
  };

  const deletePlan = async (plan: Plan) => {
    const planSnapshot = { ...plan };
    Alert.alert(
      "Supprimer ce plan ?",
      `"${planSnapshot.nom}" sera définitivement supprimé.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            const storageKey = getStorageKey(planSnapshot);
            const existingJson = await AsyncStorage.getItem(storageKey);
            const existing: Plan[] = existingJson
              ? JSON.parse(existingJson)
              : [];
            const updated = existing.filter(
              (p) =>
                normalizeCode(p.inviteCode) !==
                normalizeCode(planSnapshot.inviteCode),
            );
            await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
            await loadPlans();
            setModalVisible(false);
          },
        },
      ],
    );
  };

  /* --- RENDER : Carte jour --- */
  const renderDayCard = (
    day: DayPlan | null | undefined,
    i: number,
    showFullCost = true,
  ) => {
    if (!day || !day.hotel || !day.cafe) return null;

    const localActName = getLocalActivityName(day.localActivity);
    const localActDesc = getLocalActivityDescription(day.localActivity);
    const localActPrix = getLocalActivityPrix(day.localActivity);
    const isExcursionDay = !!day.isExcursion;

    return (
      <View key={i} style={styles.dayCard}>
        <LinearGradient
          colors={
            isExcursionDay ? ["#0369A1", "#0891B2"] : [BLUE_DEEP, BLUE_PRIMARY]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.dayHeaderStrip}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.dayHeaderTitle}>{day.title ?? ""}</Text>
            {day.ville ? (
              <Text style={styles.dayHeaderVille}>{day.ville}</Text>
            ) : null}
          </View>
          {isExcursionDay && (
            <View style={styles.excursionBadge}>
              <Text style={styles.excursionBadgeTxt}>🗺️ EXCURSION</Text>
            </View>
          )}
        </LinearGradient>

        {isExcursionDay && day.excursionCity && day.mainDestination && (
          <View style={styles.excursionInfoBanner}>
            <Text style={styles.excursionInfoTxt}>
              🚌 Journée depuis{" "}
              <Text style={{ fontWeight: "800" }}>{day.mainDestination}</Text> →{" "}
              <Text style={{ fontWeight: "800" }}>{day.excursionCity}</Text>
            </Text>
          </View>
        )}

        <View style={styles.dayBody}>
          {/* Hôtel */}
          <View style={styles.daySectionBlock}>
            <View style={styles.daySectionLabelRow}>
              <Text style={styles.daySectionEmoji}>🏨</Text>
              <Text style={styles.daySectionLabel}>Hébergement</Text>
            </View>
            <View style={styles.dayInfoCard}>
              <View style={styles.dayInfoRow}>
                <Text style={styles.dayInfoName} numberOfLines={1}>
                  {day.hotel.name ?? ""}
                </Text>
                {day.hotel.rating ? (
                  <Text style={styles.dayRating}>⭐ {day.hotel.rating}</Text>
                ) : null}
              </View>
              {day.hotel.address ? (
                <Text style={styles.daySubRow}>📍 {day.hotel.address}</Text>
              ) : null}
              {day.hotel.transport ? (
                <Text style={styles.daySubRow}>
                  🚗{" "}
                  {typeof day.hotel.transport === "object"
                    ? ((day.hotel.transport as any).label ?? "")
                    : day.hotel.transport}
                </Text>
              ) : null}
            </View>
            <MapButton
              name={day.hotel.name ?? ""}
              address={day.hotel.address || day.hotel.name || ""}
              lat={day.hotel.lat}
              lng={day.hotel.lng}
            />
          </View>

          <View style={styles.dayDivider} />

          {/* Café */}
          <View style={styles.daySectionBlock}>
            <View style={styles.daySectionLabelRow}>
              <Text style={styles.daySectionEmoji}>☕</Text>
              <Text style={styles.daySectionLabel}>Pause café</Text>
            </View>
            <View style={[styles.dayInfoCard, styles.dayInfoCardCafe]}>
              <View style={styles.dayInfoRow}>
                <Text
                  style={[styles.dayInfoName, { color: "#5D4037" }]}
                  numberOfLines={1}
                >
                  {day.cafe.name ?? ""}
                </Text>
                {day.cafe.specialty ? (
                  <View style={styles.prixBadge}>
                    <Text style={styles.prixTxt}>{day.cafe.specialty}</Text>
                  </View>
                ) : null}
              </View>
              {day.cafe.address ? (
                <Text style={[styles.daySubRow, { color: "#8D6E63" }]}>
                  📍 {day.cafe.address}
                </Text>
              ) : null}
            </View>
            <MapButton
              name={day.cafe.name ?? ""}
              address={day.cafe.address || day.cafe.name || ""}
              lat={day.cafe.lat}
              lng={day.cafe.lng}
            />
          </View>

          <View style={styles.dayDivider} />

          {/* Activité principale */}
          <View style={styles.daySectionBlock}>
            <View style={styles.daySectionLabelRow}>
              <Text style={styles.daySectionEmoji}>🎯</Text>
              <Text style={styles.daySectionLabel}>Programme du jour</Text>
              {!isExcursionDay && (
                <View style={styles.geminiBadgeInline}>
                  <Text style={styles.geminiBadgeInlineTxt}>✦ IA</Text>
                </View>
              )}
              {isExcursionDay && (
                <View
                  style={[
                    styles.geminiBadgeInline,
                    { backgroundColor: "#E0F7FA", borderColor: "#80DEEA" },
                  ]}
                >
                  <Text
                    style={[styles.geminiBadgeInlineTxt, { color: "#0277BD" }]}
                  >
                    🗺️ Local
                  </Text>
                </View>
              )}
            </View>
            <View
              style={[
                styles.dayActCard,
                isExcursionDay && styles.dayActCardExcursion,
              ]}
            >
              <Text
                style={[
                  styles.dayActTxt,
                  isExcursionDay && { color: "#01579B" },
                ]}
              >
                {typeof day.activity === "string"
                  ? day.activity
                  : String(day.activity ?? "")}
              </Text>
            </View>
            {day.activity_location ? (
              <MapButton
                name={day.activity ?? ""}
                address={day.activity_location}
              />
            ) : null}
          </View>

          {/* Activité locale */}
          {localActName ? (
            <>
              <View style={styles.dayDivider} />
              <View style={styles.daySectionBlock}>
                <View style={styles.daySectionLabelRow}>
                  <Text style={styles.daySectionEmoji}>🎮</Text>
                  <Text style={styles.daySectionLabel}>
                    Loisir & Divertissement
                  </Text>
                  <View style={styles.localBadge}>
                    <Text style={styles.localBadgeTxt}>📍 Local</Text>
                  </View>
                </View>
                <View style={styles.localActCard}>
                  <Text style={styles.localActName}>{localActName}</Text>
                  {localActDesc ? (
                    <Text style={styles.localActDesc}>{localActDesc}</Text>
                  ) : null}
                  {localActPrix ? (
                    <View style={styles.loisirPrixBadge}>
                      <Text style={styles.loisirPrixTxt}>
                        💰 {localActPrix}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </>
          ) : null}

          {/* Transport */}
          {day.transport ? (
            <>
              <View style={styles.dayDivider} />
              <View style={styles.daySectionBlock}>
                <View style={styles.daySectionLabelRow}>
                  <Text style={styles.daySectionEmoji}>🚌</Text>
                  <Text style={styles.daySectionLabel}>
                    {isExcursionDay && day.excursionCity
                      ? `Transport vers ${day.excursionCity}`
                      : "Transport"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.transportCard,
                    isExcursionDay && styles.transportCardExcursion,
                  ]}
                >
                  <Text
                    style={[
                      styles.transportTxt,
                      isExcursionDay && { color: "#006064" },
                    ]}
                  >
                    {typeof day.transport === "object" && day.transport !== null
                      ? ((day.transport as any).label ??
                        (day.transport as any).prixStr ??
                        "")
                      : (day.transport ?? "")}
                  </Text>
                </View>
              </View>
            </>
          ) : null}

          {/* Météo */}
          {day.meteo ? (
            <>
              <View style={styles.dayDivider} />
              <View style={styles.daySectionBlock}>
                <View style={styles.daySectionLabelRow}>
                  <Text style={styles.daySectionEmoji}>🌤️</Text>
                  <Text style={styles.daySectionLabel}>Météo & Conseil</Text>
                </View>
                <View style={styles.conseilCard}>
                  <Text style={styles.conseilTxt}>
                    {typeof day.meteo === "object" && day.meteo !== null
                      ? `${(day.meteo as any).temp ?? ""}°C · ${(day.meteo as any).desc ?? ""}`.trim()
                      : (day.meteo ?? "")}
                  </Text>
                </View>
              </View>
            </>
          ) : null}

          {/* Conseil excursion */}
          {isExcursionDay && day.conseil ? (
            <>
              <View style={styles.dayDivider} />
              <View style={styles.daySectionBlock}>
                <View style={styles.daySectionLabelRow}>
                  <Text style={styles.daySectionEmoji}>💡</Text>
                  <Text style={styles.daySectionLabel}>Conseil du jour</Text>
                </View>
                <View style={[styles.conseilCard, styles.conseilCardExcursion]}>
                  <Text style={[styles.conseilTxt, { color: "#01579B" }]}>
                    {typeof day.conseil === "string" ? day.conseil : ""}
                  </Text>
                </View>
              </View>
            </>
          ) : null}

          {/* Coût */}
          {showFullCost && day.cost && (
            <View style={styles.dayCostRow}>
              <Text style={styles.dayCost}>
                💰 {day.cost.dailyTotal} TND/jour
              </Text>
              <View style={styles.dayCostDetails}>
                <Text style={styles.dayCostDetail}>
                  🏨 {day.cost.hotel} TND
                </Text>
                <Text style={styles.dayCostDetail}>☕ {day.cost.cafe} TND</Text>
                <Text style={styles.dayCostDetail}>
                  🎯 {day.cost.activity} TND
                </Text>
              </View>
            </View>
          )}
          {!showFullCost && day.cost && (
            <Text style={styles.dayCost}>
              💰 {day.cost.dailyTotal} TND/jour
            </Text>
          )}
        </View>
      </View>
    );
  };

  /* --- RENDER : Carte préférences invité --- */
  const renderPrefCard = (pref: GuestPrefs, index: number, isLast: boolean) => {
    const initials = (pref.full_name || pref.email || "?")
      .slice(0, 2)
      .toUpperCase();
    const isLeader = pref.role === "leader";

    let displayEmail = pref.email;
    if (
      !displayEmail &&
      selectedPlan &&
      pendingInvites.length > 0 &&
      pref.full_name
    ) {
      const match = pendingInvites.find(
        (p) =>
          p.email.toLowerCase().includes(pref.full_name!.toLowerCase()) ||
          pref
            .full_name!.toLowerCase()
            .includes(p.email.split("@")[0].toLowerCase()),
      );
      if (match) displayEmail = match.email;
    }

    return (
      <View
        key={index}
        style={[resumeStyles.guestCard, isLast && { marginBottom: 0 }]}
      >
        <View style={resumeStyles.guestHeaderRow}>
          <View
            style={[
              resumeStyles.avatar,
              { backgroundColor: isLeader ? "#EEF4FF" : GREEN_PALE },
            ]}
          >
            <Text
              style={[
                resumeStyles.avatarText,
                { color: isLeader ? BLUE_PRIMARY : GREEN },
              ]}
            >
              {initials}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={resumeStyles.guestName} numberOfLines={1}>
              {pref.full_name || pref.email || "Invité"}
            </Text>
            {displayEmail ? (
              <Text style={resumeStyles.guestEmail} numberOfLines={1}>
                {displayEmail}
              </Text>
            ) : (
              <Text style={[resumeStyles.guestEmail, { fontStyle: "italic" }]}>
                Email non disponible
              </Text>
            )}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View
              style={[
                resumeStyles.roleBadge,
                { backgroundColor: isLeader ? "#EEF4FF" : GREEN_PALE },
              ]}
            >
              <Text
                style={[
                  resumeStyles.roleBadgeText,
                  { color: isLeader ? BLUE_PRIMARY : GREEN },
                ]}
              >
                {isLeader ? "👑 Leader" : "👤 Invité"}
              </Text>
            </View>
            {!isLeader && selectedPlan && (
              <TouchableOpacity
                style={resumeStyles.deleteGuestBtn}
                onPress={() => deleteGuestWithPrompt(selectedPlan, pref)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name="delete-outline"
                  size={18}
                  color={RED}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {pref.tranche_age && (
          <View style={resumeStyles.ageBadgeRow}>
            <View style={resumeStyles.ageBadge}>
              <Text style={resumeStyles.ageBadgeText}>
                🎂 {pref.tranche_age}
              </Text>
            </View>
          </View>
        )}

        <View style={resumeStyles.tagsRow}>
          {pref.hotel_type && (
            <View style={resumeStyles.tag}>
              <Text style={resumeStyles.tagText}>🏨 {pref.hotel_type}</Text>
            </View>
          )}
          {pref.hotel_location && (
            <View style={resumeStyles.tag}>
              <Text style={resumeStyles.tagText}>📍 {pref.hotel_location}</Text>
            </View>
          )}
          {pref.activity_types && (
            <View style={resumeStyles.tag}>
              <Text style={resumeStyles.tagText}>🎯 {pref.activity_types}</Text>
            </View>
          )}
          {pref.cafe_levels && (
            <View style={resumeStyles.tag}>
              <Text style={resumeStyles.tagText}>☕ {pref.cafe_levels}</Text>
            </View>
          )}
          {pref.voyage_type && (
            <View style={resumeStyles.tag}>
              <Text style={resumeStyles.tagText}>✈️ {pref.voyage_type}</Text>
            </View>
          )}
          {pref.budget && (
            <View style={[resumeStyles.tag, { backgroundColor: "#FEF9C3" }]}>
              <Text style={[resumeStyles.tagText, { color: "#854D0E" }]}>
                💰 {pref.budget} TND
              </Text>
            </View>
          )}
          {pref.hotel_name && (
            <View style={resumeStyles.tag}>
              <Text style={resumeStyles.tagText}>🏠 {pref.hotel_name}</Text>
            </View>
          )}
          {pref.cafe_name && (
            <View style={resumeStyles.tag}>
              <Text style={resumeStyles.tagText}>🫖 {pref.cafe_name}</Text>
            </View>
          )}
        </View>

        {(pref.destination || pref.date_depart || pref.date_arrivee) && (
          <View style={resumeStyles.tripInfoRow}>
            {pref.destination && (
              <View style={[resumeStyles.tag, { backgroundColor: "#E0F2FE" }]}>
                <Text style={[resumeStyles.tagText, { color: "#0369A1" }]}>
                  🗺️ {pref.destination}
                </Text>
              </View>
            )}
            {pref.date_depart && pref.date_arrivee && (
              <View style={[resumeStyles.tag, { backgroundColor: "#F0FDF4" }]}>
                <Text style={[resumeStyles.tagText, { color: "#15803D" }]}>
                  📅 {formatDate(pref.date_depart)} →{" "}
                  {formatDate(pref.date_arrivee)}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderPendingInviteRow = (invite: PendingInvite, plan: Plan) => {
    const isEditing = editingEmail === normalizeEmail(invite.email);
    return (
      <View key={invite.email} style={resumeStyles.pendingRow}>
        <View style={resumeStyles.pendingIconBox}>
          <MaterialCommunityIcons
            name="clock-outline"
            size={16}
            color={ORANGE}
          />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <View style={resumeStyles.editRow}>
              <TextInput
                style={resumeStyles.editInput}
                value={editEmailValue}
                onChangeText={setEditEmailValue}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                autoFocus
                placeholder="Nouvel email…"
                placeholderTextColor="#AAB4C8"
              />
              <TouchableOpacity
                style={resumeStyles.editSaveBtn}
                onPress={() => saveEditedEmail(plan, invite.email)}
                disabled={savingEmail}
              >
                {savingEmail ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialCommunityIcons name="check" size={15} color="#fff" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={resumeStyles.editCancelBtn}
                onPress={() => {
                  setEditingEmail(null);
                  setEditEmailValue("");
                }}
              >
                <MaterialCommunityIcons name="close" size={15} color="#555" />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={resumeStyles.pendingEmail} numberOfLines={1}>
                {invite.email}
              </Text>
              <Text style={resumeStyles.pendingStatus}>
                N'a pas encore répondu
              </Text>
            </>
          )}
        </View>

        {!isEditing && (
          <View style={resumeStyles.pendingActions}>
            <Pressable
              style={({ pressed }) => [
                resumeStyles.actionBtn,
                pressed && { opacity: 0.6 },
              ]}
              onPress={() => {
                setEditingEmail(normalizeEmail(invite.email));
                setEditEmailValue(invite.email);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons
                name="pencil-outline"
                size={15}
                color={BLUE_PRIMARY}
              />
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  const renderPlanCard = ({ item }: { item: Plan }) => {
    const cfg = statutConfig[item.statut] ?? statutConfig["a venir"];
    const isPremium = item.type === "premium";
    const attendus = item.nombreInvitesAttendus ?? 0;
    const ayantRepondu = item.guestPrefs?.length ?? 0;
    const sourceInferred = inferSource(item);
    const displayCode = getDisplayCode(item, sourceInferred === "resume");
    const displayBudget = getDisplayBudget(item);
    const canCreate = hasMajority(ayantRepondu, attendus);
    const allResponded = attendus > 0 && ayantRepondu >= attendus;

    return (
      <TouchableOpacity
        style={[styles.card, isPremium && styles.cardPremium]}
        onPress={() => openModal(item)}
        activeOpacity={0.85}
      >
        <Image
          source={{
            uri:
              item.itinerary?.[0]?.hotel?.image ||
              "https://www.tunisia-rentcar.com/blog/wp-content/uploads/2022/05/tunisie.jpg",
          }}
          style={styles.cardImage}
        />
        <View
          style={[
            styles.typeBadge,
            isPremium ? styles.typeBadgePremium : styles.typeBadgeFree,
          ]}
        >
          <Text
            style={[
              styles.typeBadgeTxt,
              { color: isPremium ? "#3D2200" : BLUE_PRIMARY },
            ]}
          >
            {isPremium ? "✦ Premium" : "✦ Gratuit"}
          </Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.nom}
          </Text>
          <Text style={styles.cardCode}>🔑 {displayCode}</Text>
          <Text style={styles.cardDest}>📍 {item.destination}</Text>
          <Text style={styles.cardDate}>
            {formatDate(item.dateDebut)} → {formatDate(item.dateFin)} ·{" "}
            {item.duree}j
          </Text>
          {displayBudget !== "—" && (
            <Text style={styles.cardBudget}>
              💰 Budget total : {displayBudget}
            </Text>
          )}

          <View
            style={[
              styles.statutBadge,
              { backgroundColor: getSourceBg(sourceInferred) },
            ]}
          >
            <Text
              style={[
                styles.statutTxt,
                { color: getSourceColor(sourceInferred) },
              ]}
            >
              {getSourceLabel(sourceInferred)}
            </Text>
          </View>

          {sourceInferred === "plan" ? (
            <TouchableOpacity
              style={styles.viewPlanBtn}
              onPress={() => openModal(item)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={
                  isPremium ? [GOLD_LIGHT, GOLD] : [BLUE_LIGHT, BLUE_PRIMARY]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.viewPlanBtnGrad}
              >
                <Text style={styles.viewPlanBtnTxt}>
                  {isPremium
                    ? "👁️ Voir votre plan premium"
                    : "👁️ Voir votre plan"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <>
              <View style={[styles.statutBadge, { backgroundColor: cfg.bg }]}>
                <Text style={{ fontSize: 11 }}>{cfg.icon}</Text>
                <Text style={[styles.statutTxt, { color: cfg.color }]}>
                  {cfg.label}
                </Text>
              </View>
              {item.statut === "en_attente" && (
                <View style={styles.progressContainer}>
                  {attendus > 0 && (
                    <>
                      <View style={styles.progressBarBg}>
                        <View
                          style={[
                            styles.progressBarFill,
                            {
                              width: `${Math.min(100, (ayantRepondu / attendus) * 100)}%`,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.progressTxt}>
                        {ayantRepondu} / {attendus} invité(s) ont répondu
                      </Text>
                    </>
                  )}
                  <TouchableOpacity
                    style={styles.checkNowBtn}
                    onPress={() => forceCheckPlan(item)}
                  >
                    <Text style={styles.checkNowBtnTxt}>
                      ↻ Vérifier maintenant
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              {canCreate && item.statut !== "en_attente" && (
                <TouchableOpacity
                  style={[
                    styles.createPlanBtn,
                    !allResponded && styles.createPlanBtnMajority,
                  ]}
                  onPress={() => openForfaitModal(item)}
                >
                  <Text style={styles.createPlanBtnTxt}>
                    {allResponded
                      ? `✨ Créer le plan IA (${ayantRepondu}/${attendus} ont tous répondu)`
                      : `✨ Créer le plan IA (${ayantRepondu}/${attendus} — majorité atteinte)`}
                  </Text>
                </TouchableOpacity>
              )}
              {ayantRepondu > 0 &&
                !canCreate &&
                item.statut !== "en_attente" && (
                  <View style={styles.guestCountBadge}>
                    <Text style={styles.guestCountTxt}>
                      👥 {ayantRepondu}/{attendus} — en attente de la majorité
                    </Text>
                  </View>
                )}
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const filters: { key: FilterKey; label: string }[] = [
    { key: "tous", label: "Tous" },
    { key: "resume", label: "📋 Résumé" },
    { key: "plan", label: "🗺️ Plan" },
    { key: "premium", label: "✦ Premium" },
    { key: "gratuit", label: "Gratuit" },
  ];

  if (loading && !refreshing) {
    return (
      <LinearGradient colors={["#021B4E", "#0A4DBF"]} style={styles.centered}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={{ color: "#fff", marginTop: 12 }}>
          Chargement de vos plans…
        </Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#021B4E", "#0A4DBF"]} style={{ flex: 1 }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={{ color: "#fff", fontSize: 26 }}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes anciens plans</Text>
        <TouchableOpacity
          onPress={() => loadPlans(true)}
          style={styles.refreshBtn}
        >
          <Text style={{ fontSize: 20 }}>🔄</Text>
        </TouchableOpacity>
        <AppMenuDark inviteCode={menuInviteCode} />
      </View>

      {/* Recherche */}
      <View style={styles.searchBox}>
        <Text style={{ fontSize: 16 }}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un voyage ou un code…"
          placeholderTextColor="rgba(255,255,255,0.5)"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 18 }}>
              ✕
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filtres */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersRow}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[
              styles.filterChip,
              activeFilter === f.key && styles.filterChipActive,
            ]}
            onPress={() => setActiveFilter(f.key)}
          >
            <Text
              style={[
                styles.filterTxt,
                activeFilter === f.key && styles.filterTxtActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.planCount}>
        {filteredPlans.length} plan{filteredPlans.length !== 1 ? "s" : ""}
      </Text>

      {/* Liste */}
      <FlatList
        data={filteredPlans}
        keyExtractor={(item) => item.id}
        renderItem={renderPlanCard}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadPlans(true)}
            colors={["#fff"]}
            tintColor="#fff"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={{ fontSize: 48 }}>🗺️</Text>
            <Text style={styles.emptyTxt}>Aucun plan trouvé</Text>
            <Text style={styles.emptySubTxt}>
              Vos voyages sauvegardés apparaîtront ici
            </Text>
          </View>
        }
      />

      {/* ════ MODAL DÉTAIL PLAN ════ */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.handleBar} />
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 16 }}
              keyboardShouldPersistTaps="handled"
            >
              {selectedPlan &&
                (() => {
                  const isPlanning = inferSource(selectedPlan) === "plan";
                  const attendus = selectedPlan.nombreInvitesAttendus;
                  const ayantRepondu = groupPrefsForModal.length;
                  const canCreate = hasMajority(ayantRepondu, attendus);
                  const allResponded = attendus > 0 && ayantRepondu >= attendus;

                  return (
                    <>
                      {/* En-tête modal */}
                      <View style={styles.modalHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.modalTitle}>
                            {selectedPlan.nom}
                          </Text>
                          <Text style={styles.modalCode}>
                            🔑{" "}
                            {getDisplayCode(
                              selectedPlan,
                              inferSource(selectedPlan) === "resume",
                            )}
                          </Text>
                          <Text style={styles.modalDest}>
                            📍 {selectedPlan.destination}
                          </Text>
                          <Text style={styles.modalDate}>
                            {formatDate(selectedPlan.dateDebut)} →{" "}
                            {formatDate(selectedPlan.dateFin)} ·{" "}
                            {selectedPlan.duree}j
                          </Text>
                          {selectedPlan.budget && selectedPlan.budget > 0 && (
                            <Text style={styles.modalBudget}>
                              💰 Budget total : {selectedPlan.budget} TND
                            </Text>
                          )}
                        </View>
                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => deletePlan(selectedPlan)}
                        >
                          <Text style={styles.deleteBtnTxt}>🗑️</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Badges */}
                      <View style={styles.modalBadgesRow}>
                        <View
                          style={[
                            styles.statutBadge,
                            {
                              backgroundColor: getSourceBg(
                                inferSource(selectedPlan),
                              ),
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statutTxt,
                              {
                                color: getSourceColor(
                                  inferSource(selectedPlan),
                                ),
                              },
                            ]}
                          >
                            {getSourceLabel(inferSource(selectedPlan))}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statutBadge,
                            {
                              backgroundColor:
                                statutConfig[selectedPlan.statut]?.bg ??
                                BLUE_PALE,
                            },
                          ]}
                        >
                          <Text style={{ fontSize: 11 }}>
                            {statutConfig[selectedPlan.statut]?.icon}
                          </Text>
                          <Text
                            style={[
                              styles.statutTxt,
                              {
                                color:
                                  statutConfig[selectedPlan.statut]?.color ??
                                  BLUE_PRIMARY,
                              },
                            ]}
                          >
                            {statutConfig[selectedPlan.statut]?.label}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statutBadge,
                            {
                              backgroundColor:
                                selectedPlan.type === "premium"
                                  ? GOLD_LIGHT
                                  : BLUE_PALE,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statutTxt,
                              {
                                color:
                                  selectedPlan.type === "premium"
                                    ? "#3D2200"
                                    : BLUE_PRIMARY,
                              },
                            ]}
                          >
                            {selectedPlan.type === "premium"
                              ? "✦ Premium"
                              : "✦ Gratuit"}
                          </Text>
                        </View>
                      </View>

                      {isPlanning ? (
                        /* MODE PLAN */
                        <>
                          {selectedPlan.itinerary?.length > 0 ? (
                            <>
                              <View style={styles.planOnlyBanner}>
                                <Text style={styles.planOnlyBannerIcon}>
                                  🗺️
                                </Text>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.planOnlyBannerTitle}>
                                    Plan de voyage
                                  </Text>
                                  <Text style={styles.planOnlyBannerSub}>
                                    {selectedPlan.itinerary.length} jour
                                    {selectedPlan.itinerary.length > 1
                                      ? "s"
                                      : ""}{" "}
                                    · Appuyez sur "Voir sur Maps" pour naviguer
                                  </Text>
                                </View>
                              </View>
                              {selectedPlan.itinerary
                                .filter(Boolean)
                                .map((day, i) => renderDayCard(day, i, true))}
                            </>
                          ) : (
                            <View style={styles.noItinerary}>
                              <Text style={{ fontSize: 36, marginBottom: 8 }}>
                                📭
                              </Text>
                              <Text style={styles.noItineraryTxt}>
                                Aucun itinéraire disponible.
                              </Text>
                            </View>
                          )}
                        </>
                      ) : (
                        /* MODE RÉSUMÉ */
                        <>
                          {attendus > 0 && (
                            <View style={resumeStyles.progressSection}>
                              <View style={resumeStyles.progressHeader}>
                                <Text style={resumeStyles.progressLabel}>
                                  Réponses reçues
                                </Text>
                                <Text style={resumeStyles.progressCount}>
                                  {ayantRepondu} / {attendus}
                                </Text>
                              </View>
                              <View style={resumeStyles.progressBarBg}>
                                <View
                                  style={[
                                    resumeStyles.progressBarFill,
                                    {
                                      width: `${Math.min(100, (ayantRepondu / Math.max(1, attendus)) * 100)}%`,
                                    },
                                  ]}
                                />
                              </View>
                              <Text style={resumeStyles.progressSub}>
                                Majorité requise : {Math.ceil(attendus / 2)}{" "}
                                réponse{Math.ceil(attendus / 2) > 1 ? "s" : ""}
                              </Text>
                            </View>
                          )}

                          {canCreate && (
                            <TouchableOpacity
                              style={[
                                resumeStyles.ctaBtn,
                                !allResponded && resumeStyles.ctaBtnMajority,
                              ]}
                              onPress={() => handleCreatePlan(selectedPlan)}
                              activeOpacity={0.85}
                            >
                              <LinearGradient
                                colors={
                                  allResponded
                                    ? [GREEN, "#14704A"]
                                    : ["#22C55E", GREEN]
                                }
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={resumeStyles.ctaBtnGrad}
                              >
                                <Text style={resumeStyles.ctaBtnTitle}>
                                  {allResponded
                                    ? "✨ Créer le plan IA"
                                    : "✨ Créer le plan IA (majorité)"}
                                </Text>
                                <Text style={resumeStyles.ctaBtnSub}>
                                  {allResponded
                                    ? `Tous les invités ont répondu (${ayantRepondu}/${attendus})`
                                    : `${ayantRepondu}/${attendus} ont répondu · ${attendus - ayantRepondu} en attente`}
                                </Text>
                              </LinearGradient>
                            </TouchableOpacity>
                          )}

                          {selectedPlan.statut === "en_attente" &&
                            !canCreate && (
                              <View style={resumeStyles.waitingBlock}>
                                <View style={resumeStyles.waitingTopRow}>
                                  <MaterialCommunityIcons
                                    name="clock-alert-outline"
                                    size={20}
                                    color={ORANGE}
                                  />
                                  <Text style={resumeStyles.waitingTitle}>
                                    En attente des invités
                                  </Text>
                                </View>
                                <Text style={resumeStyles.waitingDesc}>
                                  Le plan se débloque quand la majorité des
                                  invités répond.
                                </Text>
                                <View style={resumeStyles.waitingBtns}>
                                  <TouchableOpacity
                                    style={resumeStyles.checkBtn}
                                    onPress={async () => {
                                      setModalVisible(false);
                                      await forceCheckPlan(selectedPlan);
                                    }}
                                  >
                                    <MaterialCommunityIcons
                                      name="refresh"
                                      size={14}
                                      color={ORANGE}
                                    />
                                    <Text style={resumeStyles.checkBtnTxt}>
                                      Vérifier les réponses
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            )}

                          {loadingGroupPrefs ? (
                            <View style={styles.loadingPrefs}>
                              <ActivityIndicator
                                size="small"
                                color={BLUE_PRIMARY}
                              />
                              <Text style={{ color: "#7A90B4", marginTop: 6 }}>
                                Chargement des préférences…
                              </Text>
                            </View>
                          ) : (
                            <>
                              {leaderPrefsForModal && (
                                <View style={resumeStyles.section}>
                                  <View style={resumeStyles.sectionHeader}>
                                    <Text style={resumeStyles.sectionTitle}>
                                      👑 Leader
                                    </Text>
                                  </View>
                                  {renderPrefCard(
                                    {
                                      ...leaderPrefsForModal,
                                      destination:
                                        selectedPlan.destination ||
                                        leaderPrefsForModal.destination ||
                                        null,
                                      date_depart:
                                        selectedPlan.dateDebut ||
                                        leaderPrefsForModal.date_depart ||
                                        null,
                                      date_arrivee:
                                        selectedPlan.dateFin ||
                                        leaderPrefsForModal.date_arrivee ||
                                        null,
                                    },
                                    0,
                                    true,
                                  )}
                                </View>
                              )}

                              {groupPrefsForModal.length > 0 && (
                                <View style={resumeStyles.section}>
                                  <View style={resumeStyles.sectionHeader}>
                                    <Text style={resumeStyles.sectionTitle}>
                                      ✅ Ont répondu
                                    </Text>
                                    <View style={resumeStyles.countPill}>
                                      <Text style={resumeStyles.countPillText}>
                                        {groupPrefsForModal.length} / {attendus}
                                      </Text>
                                    </View>
                                  </View>
                                  {groupPrefsForModal.map((g, idx) =>
                                    renderPrefCard(
                                      g,
                                      idx,
                                      idx === groupPrefsForModal.length - 1,
                                    ),
                                  )}
                                </View>
                              )}

                              {pendingInvites.length > 0 && (
                                <View style={resumeStyles.section}>
                                  <View style={resumeStyles.sectionHeader}>
                                    <Text style={resumeStyles.sectionTitle}>
                                      ⏳ N'ont pas répondu
                                    </Text>
                                    <View
                                      style={[
                                        resumeStyles.countPill,
                                        {
                                          backgroundColor: ORANGE_PALE,
                                          borderColor: ORANGE,
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          resumeStyles.countPillText,
                                          { color: ORANGE },
                                        ]}
                                      >
                                        {pendingInvites.length}
                                      </Text>
                                    </View>
                                  </View>
                                  {pendingInvites.map((invite) =>
                                    renderPendingInviteRow(
                                      invite,
                                      selectedPlan,
                                    ),
                                  )}
                                </View>
                              )}

                              {groupPrefsForModal.length === 0 &&
                                pendingInvites.length === 0 && (
                                  <View style={styles.noItinerary}>
                                    <Text
                                      style={{ fontSize: 28, marginBottom: 8 }}
                                    >
                                      👥
                                    </Text>
                                    <Text style={styles.noItineraryTxt}>
                                      Aucun invité n'a encore soumis ses
                                      préférences.
                                    </Text>
                                  </View>
                                )}
                            </>
                          )}

                          {selectedPlan.itinerary?.length > 0 && (
                            <>
                              <Text
                                style={[
                                  resumeStyles.sectionTitle,
                                  { marginTop: 8, marginBottom: 8 },
                                ]}
                              >
                                🗺️ Itinéraire ({selectedPlan.itinerary.length}{" "}
                                jour
                                {selectedPlan.itinerary.length > 1 ? "s" : ""})
                              </Text>
                              {selectedPlan.itinerary
                                .filter(Boolean)
                                .map((day, i) => renderDayCard(day, i, false))}
                            </>
                          )}
                        </>
                      )}
                    </>
                  );
                })()}
            </ScrollView>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.closeBtnTxt}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ════ MODAL FORFAIT ════ */}
      <Modal
        visible={forfaitModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setForfaitModalVisible(false);
          setPendingPlanForForfait(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingBottom: 36 }]}>
            <View style={styles.handleBar} />
            <View style={forfaitStyles.headerRow}>
              <View style={forfaitStyles.sparkleBox}>
                <Text style={{ fontSize: 28 }}>✨</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={forfaitStyles.title}>
                  Choisissez votre forfait
                </Text>
                <Text style={forfaitStyles.subtitle}>
                  Sélectionnez le type de plan à générer avec l'IA
                </Text>
              </View>
            </View>
            <View style={forfaitStyles.divider} />

            <TouchableOpacity
              style={forfaitStyles.cardGratuit}
              onPress={() => handleForfaitChoice("gratuit")}
              activeOpacity={0.82}
            >
              <LinearGradient
                colors={["#EEF4FF", "#D6E4FF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={forfaitStyles.cardGradient}
              >
                <View style={forfaitStyles.cardLeft}>
                  <View
                    style={[
                      forfaitStyles.iconCircle,
                      { backgroundColor: BLUE_PRIMARY },
                    ]}
                  >
                    <Text style={{ fontSize: 26 }}>🗺️</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={forfaitStyles.labelRow}>
                      <Text
                        style={[forfaitStyles.cardTitle, { color: BLUE_DEEP }]}
                      >
                        Forfait Gratuit
                      </Text>
                      <View
                        style={[
                          forfaitStyles.badge,
                          {
                            backgroundColor: BLUE_PALE,
                            borderColor: BLUE_PRIMARY,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            forfaitStyles.badgeTxt,
                            { color: BLUE_PRIMARY },
                          ]}
                        >
                          GRATUIT
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[forfaitStyles.cardDesc, { color: "#4A6080" }]}
                    >
                      Itinéraire essentiel · Hôtels & activités de base
                    </Text>
                    <View style={forfaitStyles.featureRow}>
                      {["🏨 Hébergement", "🎯 Activités", "☕ Cafés"].map(
                        (f) => (
                          <View
                            key={f}
                            style={[
                              forfaitStyles.featureChip,
                              { backgroundColor: "#fff" },
                            ]}
                          >
                            <Text
                              style={[
                                forfaitStyles.featureChipTxt,
                                { color: BLUE_PRIMARY },
                              ]}
                            >
                              {f}
                            </Text>
                          </View>
                        ),
                      )}
                    </View>
                  </View>
                </View>
                <View style={forfaitStyles.arrowBox}>
                  <Text style={{ fontSize: 20, color: BLUE_PRIMARY }}>›</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={forfaitStyles.cardPremium}
              onPress={() => handleForfaitChoice("premium")}
              activeOpacity={0.82}
            >
              <LinearGradient
                colors={["#FEF9E7", "#FDF3D0"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={forfaitStyles.cardGradient}
              >
                <View style={forfaitStyles.proBadge}>
                  <LinearGradient
                    colors={[GOLD_LIGHT, GOLD]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={forfaitStyles.proBadgeGrad}
                  >
                    <Text style={forfaitStyles.proBadgeTxt}>✦ PRO</Text>
                  </LinearGradient>
                </View>
                <View style={forfaitStyles.cardLeft}>
                  <View
                    style={[
                      forfaitStyles.iconCircle,
                      { backgroundColor: GOLD },
                    ]}
                  >
                    <Text style={{ fontSize: 26 }}>✦</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={forfaitStyles.labelRow}>
                      <Text
                        style={[forfaitStyles.cardTitle, { color: "#7A4A00" }]}
                      >
                        Forfait Premium
                      </Text>
                    </View>
                    <Text
                      style={[forfaitStyles.cardDesc, { color: "#A0704A" }]}
                    >
                      Itinéraire complet · Hôtels de luxe · Budget détaillé
                    </Text>
                    <View style={forfaitStyles.featureRow}>
                      {["🏆 Luxe", "💰 Budget", "🌟 Exclusif"].map((f) => (
                        <View
                          key={f}
                          style={[
                            forfaitStyles.featureChip,
                            { backgroundColor: "#fff" },
                          ]}
                        >
                          <Text
                            style={[
                              forfaitStyles.featureChipTxt,
                              { color: "#7A4A00" },
                            ]}
                          >
                            {f}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
                <View style={forfaitStyles.arrowBox}>
                  <Text style={{ fontSize: 20, color: GOLD }}>›</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.closeBtn,
                { backgroundColor: "#E5E7EB", marginTop: 12 },
              ]}
              onPress={() => {
                setForfaitModalVisible(false);
                setPendingPlanForForfait(null);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.closeBtnTxt, { color: "#374151" }]}>
                Annuler
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ════ MODAL SUPPRESSION INVITÉ ════ */}
      <Modal
        visible={deleteModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setDeleteModalVisible(false);
          setDeletingPref(null);
          setDeleteEmailInput("");
        }}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalCard, { paddingBottom: 36, maxHeight: "55%" }]}
          >
            <View style={styles.handleBar} />

            <View style={deleteModalStyles.header}>
              <View style={deleteModalStyles.iconBox}>
                <MaterialCommunityIcons
                  name="delete-outline"
                  size={24}
                  color={RED}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={deleteModalStyles.title}>Supprimer l'invité</Text>
                <Text style={deleteModalStyles.subtitle}>
                  {deletingPref?.full_name || "Cet invité"} sera retiré du
                  voyage
                </Text>
              </View>
            </View>

            <View style={deleteModalStyles.divider} />

            <Text style={deleteModalStyles.label}>
              Adresse email de l'invité :
            </Text>

            <View style={deleteModalStyles.inputWrap}>
              <MaterialCommunityIcons
                name="email-outline"
                size={18}
                color={BLUE_PRIMARY}
              />
              <TextInput
                style={deleteModalStyles.input}
                value={deleteEmailInput}
                onChangeText={setDeleteEmailInput}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                placeholder="email@exemple.com"
                placeholderTextColor={TEXT_MUTED}
              />
              {deleteEmailInput.length > 0 && (
                <TouchableOpacity onPress={() => setDeleteEmailInput("")}>
                  <MaterialCommunityIcons
                    name="close-circle"
                    size={18}
                    color={TEXT_MUTED}
                  />
                </TouchableOpacity>
              )}
            </View>

            <View style={deleteModalStyles.btnRow}>
              <TouchableOpacity
                style={deleteModalStyles.btnCancel}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setDeletingPref(null);
                  setDeleteEmailInput("");
                }}
                activeOpacity={0.7}
              >
                <Text style={deleteModalStyles.btnCancelTxt}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  deleteModalStyles.btnDelete,
                  deletingInProgress && { opacity: 0.6 },
                ]}
                onPress={async () => {
                  const email = deleteEmailInput.trim().toLowerCase();
                  if (!email) {
                    Alert.alert("Erreur", "Email requis.");
                    return;
                  }
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    Alert.alert(
                      "Email invalide",
                      "Veuillez saisir un email valide.",
                    );
                    return;
                  }
                  if (!selectedPlan) return;
                  const inviteCode = normalizeCode(selectedPlan.inviteCode);
                  setDeletingInProgress(true);
                  setDeleteModalVisible(false);
                  await performDelete(
                    inviteCode,
                    email,
                    deletingPref?.full_name ?? null,
                  );
                  setDeletingInProgress(false);
                  setDeletingPref(null);
                  setDeleteEmailInput("");
                }}
                disabled={deletingInProgress}
                activeOpacity={0.8}
              >
                {deletingInProgress ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialCommunityIcons
                    name="delete-outline"
                    size={18}
                    color="#fff"
                  />
                )}
                <Text style={deleteModalStyles.btnDeleteTxt}>
                  {deletingInProgress ? "Suppression…" : "Supprimer"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

/* --- STYLES --- */
const mapStyles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: BLUE_PALE,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#B8D0FF",
  },
  btnTxt: { fontSize: 11, color: BLUE_PRIMARY, fontWeight: "700" },
});

const deleteModalStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: RED_PALE,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 17, fontWeight: "800", color: BLUE_DEEP, marginBottom: 2 },
  subtitle: { fontSize: 12, color: TEXT_MUTED },
  divider: { height: 1, backgroundColor: "#E8EFFA", marginBottom: 16 },
  label: {
    fontSize: 13,
    color: TEXT_MUTED,
    marginBottom: 8,
    fontWeight: "600",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: BLUE_PRIMARY,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#F0F5FC",
    marginBottom: 20,
  },
  input: { flex: 1, fontSize: 14, color: BLUE_DEEP },
  btnRow: { flexDirection: "row", gap: 12 },
  btnCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  btnCancelTxt: { color: TEXT_MUTED, fontWeight: "700", fontSize: 14 },
  btnDelete: {
    flex: 1.5,
    backgroundColor: RED,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  btnDeleteTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
});

const resumeStyles = StyleSheet.create({
  progressSection: {
    backgroundColor: "#F0F5FC",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: BLUE_PALE,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressLabel: { fontSize: 13, fontWeight: "700", color: BLUE_DEEP },
  progressCount: { fontSize: 13, fontWeight: "800", color: BLUE_PRIMARY },
  progressBarBg: {
    height: 6,
    backgroundColor: "#D6E4FF",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 6,
  },
  progressBarFill: {
    height: 6,
    backgroundColor: BLUE_PRIMARY,
    borderRadius: 4,
  },
  progressSub: { fontSize: 11, color: TEXT_MUTED },
  ctaBtn: { borderRadius: 16, overflow: "hidden", marginBottom: 14 },
  ctaBtnMajority: { opacity: 0.92 },
  ctaBtnGrad: { padding: 16, alignItems: "center" },
  ctaBtnTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 3,
  },
  ctaBtnSub: { fontSize: 12, color: "rgba(255,255,255,0.85)" },
  waitingBlock: {
    backgroundColor: ORANGE_PALE,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#F5C49A",
  },
  waitingTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  waitingTitle: { fontSize: 14, fontWeight: "700", color: ORANGE },
  waitingDesc: { fontSize: 12, color: "#7A4A1E", marginBottom: 12 },
  waitingBtns: { flexDirection: "row", gap: 10 },
  checkBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: ORANGE,
  },
  checkBtnTxt: { fontSize: 12, color: ORANGE, fontWeight: "700" },
  section: {
    backgroundColor: "#F8FAFF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: BLUE_PALE,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: BLUE_DEEP },
  countPill: {
    backgroundColor: GREEN_PALE,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: GREEN,
  },
  countPillText: { fontSize: 11, fontWeight: "700", color: GREEN },
  guestCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2EAFF",
  },
  guestHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: { fontSize: 13, fontWeight: "700" },
  guestName: { fontSize: 14, fontWeight: "700", color: BLUE_DEEP },
  guestEmail: { fontSize: 11, color: TEXT_MUTED, marginTop: 1 },
  roleBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  roleBadgeText: { fontSize: 10, fontWeight: "800" },
  deleteGuestBtn: {
    backgroundColor: RED_PALE,
    padding: 6,
    borderRadius: 8,
    marginLeft: 4,
  },
  ageBadgeRow: { marginBottom: 6 },
  ageBadge: {
    alignSelf: "flex-start",
    backgroundColor: PURPLE_PALE,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#C4B5FD",
  },
  ageBadgeText: { fontSize: 11, color: PURPLE, fontWeight: "700" },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 4 },
  tag: {
    backgroundColor: "#EEF4FF",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: { fontSize: 11, color: BLUE_DEEP, fontWeight: "500" },
  tripInfoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: BLUE_PALE,
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 11,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  pendingIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ORANGE_PALE,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pendingEmail: { fontSize: 13, fontWeight: "700", color: BLUE_DEEP },
  pendingStatus: { fontSize: 11, color: ORANGE, marginTop: 2 },
  pendingActions: { flexDirection: "row", gap: 6, flexShrink: 0 },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: BLUE_PALE,
    alignItems: "center",
    justifyContent: "center",
  },
  editRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  editInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: BLUE_PRIMARY,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: BLUE_DEEP,
    backgroundColor: "#F0F5FC",
  },
  editSaveBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  editCancelBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
});

const forfaitStyles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 18,
  },
  sparkleBox: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: "#EEF4FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
  },
  title: { fontSize: 20, fontWeight: "800", color: BLUE_DEEP, marginBottom: 3 },
  subtitle: { fontSize: 12, color: TEXT_MUTED, lineHeight: 17 },
  divider: { height: 1, backgroundColor: "#E8EFFA", marginBottom: 18 },
  cardGratuit: {
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 14,
    borderWidth: 2,
    borderColor: BLUE_PRIMARY,
    shadowColor: BLUE_PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  cardPremium: {
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 4,
    borderWidth: 2,
    borderColor: GOLD,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  cardGradient: {
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.9,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  cardDesc: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  featureRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  featureChip: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  featureChipTxt: { fontSize: 11, fontWeight: "600" },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  badgeTxt: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  arrowBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  proBadge: {
    position: "absolute",
    top: 12,
    right: 52,
    borderRadius: 8,
    overflow: "hidden",
    zIndex: 1,
  },
  proBadgeGrad: { paddingHorizontal: 10, paddingVertical: 3 },
  proBadgeTxt: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.5,
  },
});

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

const promptStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
  },
  card: {
    backgroundColor: "#0C1829",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#1A2B45",
    padding: 24,
    shadowColor: "#1a6aff",
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 16,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: `${BLUE_LIGHT}18`,
    borderWidth: 1,
    borderColor: `${BLUE_LIGHT}30`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: { color: WHITE, fontSize: 20, fontWeight: "800", marginBottom: 6 },
  subtitle: {
    color: TEXT_MUTED,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 22,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#060F1E",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: `${BLUE_PRIMARY}60`,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    color: WHITE,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 4,
  },
  btnRow: { flexDirection: "row", gap: 12 },
  btnCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1A2B45",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  btnCancelText: { color: TEXT_MUTED, fontWeight: "600", fontSize: 15 },
  btnConfirm: { flex: 1.5, borderRadius: 14, overflow: "hidden" },
  btnConfirmGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
  },
  btnConfirmText: { color: WHITE, fontWeight: "700", fontSize: 15 },
});

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 56 : 36,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { padding: 8, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: "800", color: "#fff" },
  refreshBtn: { padding: 8 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 14 },
  filtersRow: { flexGrow: 0, marginBottom: 4 },
  filterChip: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  filterChipActive: { backgroundColor: "#fff" },
  filterTxt: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontWeight: "600",
  },
  filterTxtActive: { color: BLUE_PRIMARY },
  planCount: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  cardPremium: { borderWidth: 2, borderColor: GOLD },
  cardImage: { width: "100%", height: 140 },
  typeBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeBadgeFree: { backgroundColor: BLUE_PALE },
  typeBadgePremium: { backgroundColor: GOLD_LIGHT },
  typeBadgeTxt: { fontSize: 11, fontWeight: "800" },
  cardBody: { padding: 14, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: "800", color: BLUE_DEEP },
  cardCode: {
    fontSize: 11,
    color: "#7A90B4",
    marginBottom: 2,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  cardDest: { fontSize: 13, color: "#7A90B4" },
  cardDate: { fontSize: 12, color: "#AAB4C8" },
  cardBudget: { fontSize: 12, color: GREEN, fontWeight: "700", marginTop: 2 },
  statutBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  statutTxt: { fontSize: 11, fontWeight: "700" },
  progressContainer: { marginTop: 8, gap: 6 },
  progressBarBg: {
    height: 5,
    backgroundColor: "#F5C49A",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: { height: 5, backgroundColor: ORANGE, borderRadius: 4 },
  progressTxt: { fontSize: 11, color: ORANGE, fontWeight: "600" },
  checkNowBtn: {
    backgroundColor: ORANGE_PALE,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F5C49A",
  },
  checkNowBtnTxt: { fontSize: 12, color: ORANGE, fontWeight: "700" },
  createPlanBtn: {
    backgroundColor: GREEN_PALE,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    marginTop: 4,
    borderWidth: 1,
    borderColor: GREEN,
  },
  createPlanBtnMajority: {
    backgroundColor: "#ECFDF5",
    borderColor: "#6EE7B7",
    borderStyle: "dashed",
  },
  createPlanBtnTxt: { fontSize: 13, color: GREEN, fontWeight: "800" },
  guestCountBadge: {
    backgroundColor: ORANGE_PALE,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  guestCountTxt: { fontSize: 11, color: ORANGE, fontWeight: "700" },
  emptyBox: { alignItems: "center", paddingTop: 80, gap: 10 },
  emptyTxt: { color: "rgba(255,255,255,0.8)", fontSize: 18, fontWeight: "700" },
  emptySubTxt: { color: "rgba(255,255,255,0.5)", fontSize: 13 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2,27,78,0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: 40,
    maxHeight: "92%",
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: "#D6E4FF",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: BLUE_DEEP,
    marginBottom: 4,
  },
  modalCode: {
    fontSize: 12,
    color: "#7A90B4",
    marginBottom: 2,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  modalDest: { fontSize: 14, color: "#7A90B4", marginBottom: 2 },
  modalDate: { fontSize: 13, color: "#AAB4C8", marginBottom: 4 },
  modalBudget: { fontSize: 13, color: GREEN, fontWeight: "700", marginTop: 4 },
  modalBadgesRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  deleteBtn: {
    padding: 8,
    backgroundColor: "#FEE2E2",
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  deleteBtnTxt: { fontSize: 18 },
  planOnlyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: GREEN_PALE,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: GREEN,
  },
  planOnlyBannerIcon: { fontSize: 28 },
  planOnlyBannerTitle: { fontSize: 15, fontWeight: "800", color: GREEN },
  planOnlyBannerSub: { fontSize: 12, color: "#4B7A62", marginTop: 2 },
  loadingPrefs: { alignItems: "center", padding: 20, gap: 8 },
  noItinerary: {
    backgroundColor: "#F0F5FC",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    marginBottom: 10,
  },
  noItineraryTxt: { fontSize: 13, color: "#7A90B4", textAlign: "center" },
  dayCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 12,
    shadowColor: BLUE_PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(10,77,191,0.07)",
  },
  dayHeaderStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dayHeaderTitle: { fontSize: 15, fontWeight: "800", color: WHITE },
  dayHeaderVille: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },
  excursionBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  excursionBadgeTxt: { color: WHITE, fontSize: 10, fontWeight: "800" },
  excursionInfoBanner: {
    backgroundColor: "#E0F7FA",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#B2EBF2",
  },
  excursionInfoTxt: { fontSize: 12, color: "#006064", lineHeight: 18 },
  dayBody: { padding: 14, gap: 0 },
  daySectionBlock: { paddingVertical: 4 },
  daySectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  daySectionEmoji: { fontSize: 16 },
  daySectionLabel: { fontSize: 14, fontWeight: "700", color: BLUE_DEEP },
  dayDivider: {
    height: 1,
    backgroundColor: BLUE_ULTRA_PALE,
    marginVertical: 12,
  },
  dayInfoCard: {
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: BLUE_PALE,
    gap: 4,
  },
  dayInfoCardCafe: { backgroundColor: "#FFF8F0", borderColor: "#FFE0B2" },
  dayInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  dayInfoName: { fontSize: 14, fontWeight: "800", color: BLUE_DEEP, flex: 1 },
  dayRating: { fontSize: 11, color: "#F59E0B", fontWeight: "700" },
  daySubRow: { fontSize: 11, color: TEXT_MUTED, marginTop: 2 },
  prixBadge: {
    backgroundColor: "#FFF0D6",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#FFD18C",
  },
  prixTxt: { fontSize: 11, fontWeight: "700", color: "#8B5E00" },
  dayActCard: {
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: BLUE_PRIMARY,
  },
  dayActCardExcursion: {
    backgroundColor: "#E0F7FA",
    borderLeftColor: EXCURSION_COLOR,
  },
  dayActTxt: {
    fontSize: 13,
    fontWeight: "600",
    color: BLUE_DEEP,
    lineHeight: 19,
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
  geminiBadgeInlineTxt: { fontSize: 9, fontWeight: "800", color: "#1A73E8" },
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
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: LOCAL_ACT_BORDER,
    gap: 4,
  },
  localActName: {
    fontSize: 13,
    fontWeight: "700",
    color: LOCAL_ACT_TEXT,
    lineHeight: 19,
  },
  localActDesc: { fontSize: 11, color: LOCAL_ACT_HINT, lineHeight: 16 },
  loisirPrixBadge: {
    alignSelf: "flex-start",
    backgroundColor: LOCAL_PRIX_BG,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: LOCAL_PRIX_BORDER,
    marginTop: 4,
  },
  loisirPrixTxt: { fontSize: 11, fontWeight: "700", color: LOCAL_PRIX_TEXT },
  transportCard: {
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: BLUE_PRIMARY,
  },
  transportCardExcursion: {
    backgroundColor: "#E0F7FA",
    borderLeftColor: EXCURSION_COLOR,
  },
  transportTxt: { fontSize: 12, color: "#1E40AF", lineHeight: 18 },
  conseilCard: {
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#F59E0B",
  },
  conseilCardExcursion: {
    backgroundColor: "#E1F5FE",
    borderLeftColor: "#0288D1",
  },
  conseilTxt: {
    fontSize: 12,
    color: "#92400E",
    lineHeight: 18,
    fontStyle: "italic",
  },
  dayCostRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BLUE_PALE,
    gap: 4,
  },
  dayCost: { fontSize: 13, fontWeight: "700", color: GREEN },
  dayCostDetails: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  dayCostDetail: { fontSize: 11, color: "#4B7A62" },
  closeBtn: {
    backgroundColor: BLUE_PRIMARY,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },
  closeBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 16 },
  viewPlanBtn: { borderRadius: 12, overflow: "hidden", marginTop: 8 },
  viewPlanBtnGrad: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  viewPlanBtnTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },
});

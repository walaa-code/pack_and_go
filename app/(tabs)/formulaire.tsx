import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { API } from "../../constants/api";
import { useTravelData } from "../../context/TravelContext";

/* ─── Palette ─── */
const BG = "#060F1E";
const CARD_BG = "#0C1829";
const BORDER = "#1A2B45";
const BLUE_PRIMARY = "#0A4DBF";
const BLUE_LIGHT = "#3B72E8";
const BLUE_GLOW = "#1a6aff";
const WHITE = "#FFFFFF";
const TEXT_MUTED = "#4A6080";
const TEXT_MEDIUM = "#7A95B8";
const GREEN = "#4CAF50";
const GREEN_BG = "rgba(76,175,80,0.12)";
const GREEN_BORDER = "rgba(76,175,80,0.3)";

/* ─── Dates par défaut ─── */
const DEFAULT_START = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();
const DEFAULT_END = (() => {
  const d = new Date(DEFAULT_START);
  d.setDate(d.getDate() + 4);
  return d;
})();

const toLocalDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const VILLES = [
  "Carthage",
  "Bizerte",
  "Ain Draham",
  "Tabarka",
  "Zaghouan",
  "Hammamet",
  "Nabeul",
  "Kelibia",
  "El Haouaria",
  "Korba",
  "Korbous",
  "Sousse",
  "Monastir",
  "Mahdia",
  "Sfax",
  "Kerkennah",
  "Kairouan",
  "Djerba",
  "Tozeur",
  "Douz",
  "Zarzis",
  "Gabès",
];

const VILLE_FLAGS: Record<string, string> = {
  Carthage: "🏛️",
  Bizerte: "🗺️",
  "Ain Draham": "🌲",
  Tabarka: "🤿",
  Zaghouan: "🏞️",
  Hammamet: "🏖️",
  Nabeul: "🏺",
  Kelibia: "🏰",
  Korba: "🍓",
  Korbous: "♨️",
  "El Haouaria": "🦅",
  Sousse: "🌊",
  Monastir: "⚓",
  Mahdia: "⛵",
  Sfax: "🫒",
  Kerkennah: "🛶",
  Kairouan: "🕌",
  Djerba: "🌴",
  Tozeur: "🌵",
  Douz: "🐪",
  Zarzis: "🌅",
  Gabès: "🌿",
};

const VILLE_CATEGORIES = [
  { label: "🗺️ Tout", villes: VILLES },
  {
    label: "🏙️ Nord",
    villes: ["Carthage", "Bizerte", "Ain Draham", "Tabarka", "Zaghouan"],
  },
  {
    label: "🏖️ Cap Bon",
    villes: [
      "Hammamet",
      "Nabeul",
      "Kelibia",
      "El Haouaria",
      "Korba",
      "Korbous",
    ],
  },
  {
    label: "🌊 Sahel",
    villes: ["Sousse", "Monastir", "Mahdia", "Sfax", "Kerkennah", "Kairouan"],
  },
  { label: "🌵 Sud", villes: ["Djerba", "Tozeur", "Douz", "Zarzis", "Gabès"] },
];

function StepIndicator({ step }: { step: number }) {
  return (
    <View style={styles.stepRow}>
      {[1, 2].map((s) => (
        <React.Fragment key={s}>
          <View
            style={[styles.stepCircle, step >= s && styles.stepCircleActive]}
          >
            {step > s ? (
              <Text style={styles.stepCheck}>✓</Text>
            ) : (
              <Text
                style={[styles.stepNum, step === s && styles.stepNumActive]}
              >
                {s}
              </Text>
            )}
          </View>
          {s < 2 && (
            <View
              style={[styles.stepLine, step > 1 && styles.stepLineActive]}
            />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

/* ─── MENU ─── */
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
                name={"arrow-right" as any}
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

/* ─── COMPOSANT PRINCIPAL ─── */
export default function FormulaireScreen() {
  const params = useLocalSearchParams<{ userId?: string; ville?: string }>();

  const { travelData, setTravelData } = useTravelData();
  const uid: number | null = (() => {
    if (params.userId && params.userId.trim() !== "") {
      const n = Number(params.userId);
      if (!isNaN(n) && n > 0) return n;
    }
    if (travelData?.userId && Number(travelData.userId) > 0) {
      return Number(travelData.userId);
    }
    return null;
  })();

  const [ville, setVille] = useState(params.ville || "");
  const [dateDebut, setDateDebut] = useState<Date>(DEFAULT_START);
  const [dateFin, setDateFin] = useState<Date>(DEFAULT_END);
  const [showDateModal, setShowDateModal] = useState(false);
  const [dateModalType, setDateModalType] = useState<"debut" | "fin" | null>(
    null,
  );
  const [tempDay, setTempDay] = useState(1);
  const [tempMonth, setTempMonth] = useState(1);
  const [tempYear, setTempYear] = useState(new Date().getFullYear());
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [email, setEmail] = useState("");
  const [emailInvites, setEmailInvites] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(0);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    console.log(
      "🔍 FormulaireScreen — params.userId:",
      params.userId,
      "| travelData.userId:",
      travelData?.userId,
      "→ uid résolu:",
      uid,
    );
    if (!uid) {
      console.warn("⚠️ userId introuvable dans formulaire — session invalide");
    }
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 700,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const formatDate = (date: Date) =>
    `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;

  const openDateModal = (type: "debut" | "fin") => {
    setDateModalType(type);
    const d = type === "debut" ? dateDebut : dateFin;
    setTempDay(d.getDate());
    setTempMonth(d.getMonth() + 1);
    setTempYear(d.getFullYear());
    setShowDateModal(true);
  };

  const confirmDateModal = () => {
    const selected = new Date(tempYear, tempMonth - 1, tempDay);
    if (dateModalType === "debut") {
      setDateDebut(selected);
      if (dateFin <= selected) {
        const newEnd = new Date(selected);
        newEnd.setDate(newEnd.getDate() + 4);
        setDateFin(newEnd);
      }
    } else {
      if (selected <= dateDebut) {
        Alert.alert("Erreur", "La date de fin doit être après la date début");
        return;
      }
      setDateFin(selected);
    }
    setShowDateModal(false);
  };

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const addEmail = () => {
    const t = email.trim();
    if (!t) return;
    if (!isValidEmail(t)) {
      Alert.alert("Erreur", "Email invalide");
      return;
    }
    if (emailInvites.includes(t)) {
      Alert.alert("Erreur", "Email déjà ajouté");
      return;
    }
    setEmailInvites([...emailInvites, t]);
    setEmail("");
  };

  const removeEmail = (index: number) =>
    setEmailInvites(emailInvites.filter((_, i) => i !== index));

  /* ─── FIX : handleSubmit ─── */
  const handleSubmit = async () => {
    if (!ville) {
      Alert.alert("Destination requise", "Veuillez choisir une ville");
      return;
    }

    if (!uid) {
      Alert.alert("Session expirée", "Veuillez vous reconnecter.", [
        { text: "Se reconnecter", onPress: () => router.replace("/") },
      ]);
      return;
    }

    // save_trip en background — n'attend PAS la réponse
    fetch(`${API}/api/save_trip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: uid,
        destination: ville,
        arrival: toLocalDate(dateDebut),
        departure: toLocalDate(dateFin),
      }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.status === "succes")
          console.log("✅ Voyage enregistré — userId:", uid);
      })
      .catch((err) => console.error("❌ Erreur save_trip:", err));

    // Reset propre avant ouverture modal
    setInviteCode(null);
    setEmailInvites([]);
    setEmail("");
    setShowFriendsModal(true);
  };

  /* ─── FIX PRINCIPAL : handleFriendsSubmit ─── */
  const handleFriendsSubmit = async () => {
    // Bloquer les doubles clics
    if (sendingEmails || isSubmitting) return;

    // Si inviteCode déjà généré → naviguer directement
    if (inviteCode) {
      setShowFriendsModal(false);
      const code = inviteCode;
      setInviteCode(null);
      router.push({
        pathname: "/question",
        params: {
          inviteCode: code,
          userId: uid ? String(uid) : undefined,
        },
      });
      return;
    }

    // Auto-ajouter l'email en cours de saisie s'il est valide
    let finalInvites = [...emailInvites];
    const pendingEmail = email.trim();
    if (
      pendingEmail &&
      isValidEmail(pendingEmail) &&
      !finalInvites.includes(pendingEmail)
    ) {
      finalInvites = [...finalInvites, pendingEmail];
      setEmail("");
      setEmailInvites(finalInvites);
    }

    // Vérifier qu'il y a au moins un invité
    if (finalInvites.length === 0) {
      Alert.alert(
        "Invité requis",
        "Veuillez ajouter au moins un ami pour continuer.",
      );
      return;
    }

    setIsSubmitting(true);
    setSendingEmails(true);

    const endpoint = `${API}/send-invitations`;
    console.log(
      "🚀 Calling:",
      endpoint,
      "| uid:",
      uid,
      "| invites:",
      finalInvites,
    );

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          invites: finalInvites,
          destination: ville,
          date_arrivee: toLocalDate(dateDebut),
          date_depart: toLocalDate(dateFin),
          admin_id: uid ? String(uid) : undefined,
        }),
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text();
        console.error(`❌ HTTP ${res.status}:`, errText);
        throw new Error(`Serveur: HTTP ${res.status}`);
      }

      const data = await res.json();
      console.log("📨 send-invitations response:", JSON.stringify(data));

      if (data.invite_code) {
        const code = data.invite_code.trim().toUpperCase();
        setInviteCode(code);
        setTravelData({
          ville,
          dateDebut,
          dateFin,
          emailInvites: finalInvites,
          inviteCode: code,
          userId: uid,
        } as any);
        console.log("✅ inviteCode Flask → contexte :", code, "| userId:", uid);
        // Afficher le code dans le modal — ne pas fermer
      } else {
        console.warn("⚠️ Réponse reçue sans invite_code:", data);
        setTravelData({
          ville,
          dateDebut,
          dateFin,
          emailInvites: finalInvites,
          userId: uid,
        } as any);
        setShowFriendsModal(false);
        router.push({
          pathname: "/question",
          params: { userId: uid ? String(uid) : undefined },
        });
      }
    } catch (error: any) {
      console.error("❌ send-invitations:", error?.message || error);

      const isTimeout = error?.name === "AbortError";
      Alert.alert(
        isTimeout ? "Délai dépassé" : "Erreur d'envoi",
        isTimeout
          ? "Le serveur met trop de temps à répondre.\n\nVérifiez votre connexion ou réessayez dans quelques instants."
          : `Une erreur est survenue : ${error?.message || "inconnue"}`,
        [{ text: "Réessayer", style: "cancel" }],
      );
    } finally {
      setSendingEmails(false);
      setIsSubmitting(false);
    }
  };

  const getDuration = () => {
    const diff = Math.ceil(
      (dateFin.getTime() - dateDebut.getTime()) / 86400000,
    );
    return diff > 0 ? `${diff} nuit${diff > 1 ? "s" : ""}` : null;
  };

  const villesFiltrees = VILLE_CATEGORIES[selectedCategory]?.villes || VILLES;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <LinearGradient
          colors={["#021B4E", "#042A66", "#083A8A"]}
          style={styles.hero}
        >
          <View style={styles.menuContainer}>
            <AppMenuDark inviteCode={inviteCode} />
          </View>
          <View style={styles.orbTop} />
          <View style={styles.orbBot} />
          <Image
            source={require("../../assets/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.heroBadge}>
            <View style={styles.heroBadgeDot} />
            <Text style={styles.heroBadgeText}>PLANIFICATION</Text>
          </View>
          <Text style={styles.heroTitle}>Votre Séjour{"\n"}de Rêve</Text>
          <Text style={styles.heroSub}>
            Quelques étapes pour une expérience inoubliable
          </Text>
          <StepIndicator step={1} />
        </LinearGradient>

        {/* Form Card */}
        <Animated.View
          style={[
            styles.formCard,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.sectionHeader}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionLabel}>DESTINATION</Text>
          </View>
          <Text style={styles.fieldLabel}>Choisissez votre ville *</Text>

          <View style={styles.pickerBox}>
            <Text style={styles.pickerBoxIcon}>
              {ville ? VILLE_FLAGS[ville] || "📍" : "📍"}
            </Text>
            <Picker
              selectedValue={ville}
              onValueChange={setVille}
              style={styles.picker}
              dropdownIconColor={BLUE_LIGHT}
            >
              <Picker.Item
                label="— Sélectionner une destination —"
                value=""
                color={TEXT_MUTED}
              />
              {VILLES.map((v) => (
                <Picker.Item
                  key={v}
                  label={`${VILLE_FLAGS[v] || ""} ${v}`}
                  value={v}
                  color={WHITE}
                />
              ))}
            </Picker>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryScroll}
          >
            {VILLE_CATEGORIES.map((cat, idx) => (
              <TouchableOpacity
                key={cat.label}
                style={[
                  styles.categoryTab,
                  selectedCategory === idx && styles.categoryTabActive,
                ]}
                onPress={() => setSelectedCategory(idx)}
              >
                <Text
                  style={[
                    styles.categoryTabText,
                    selectedCategory === idx && styles.categoryTabTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.pillGrid}>
            {villesFiltrees.map((v) => (
              <TouchableOpacity
                key={v}
                style={[styles.pill, ville === v && styles.pillActive]}
                onPress={() => setVille(v)}
              >
                <Text
                  style={[
                    styles.pillText,
                    ville === v && styles.pillTextActive,
                  ]}
                >
                  {VILLE_FLAGS[v]}
                  {"  "}
                  {v}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.sectionHeader, { marginTop: 24 }]}>
            <View
              style={[styles.sectionDot, { backgroundColor: BLUE_LIGHT }]}
            />
            <Text style={styles.sectionLabel}>PÉRIODE</Text>
          </View>

          <View style={styles.datesRow}>
            {(["debut", "fin"] as const).map((type) => {
              const isDebut = type === "debut";
              const date = isDebut ? dateDebut : dateFin;
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.dateCard, styles.dateCardFilled]}
                  onPress={() => openDateModal(type)}
                >
                  <Text style={styles.dateCardLabel}>
                    {isDebut ? "Arrivée" : "Départ"}
                  </Text>
                  <Text style={styles.dateCardIcon}>📅</Text>
                  <Text style={styles.dateCardValue}>{formatDate(date)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.durationRow}>
            <View style={styles.durationLine} />
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>📆 {getDuration()}</Text>
            </View>
            <View style={styles.durationLine} />
          </View>

          {ville && (
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <Text style={styles.summaryHeaderIcon}>✦</Text>
                <Text style={styles.summaryHeaderText}>Récapitulatif</Text>
              </View>
              {[
                {
                  label: "Destination",
                  value: `${VILLE_FLAGS[ville]} ${ville}`,
                },
                { label: "Arrivée", value: formatDate(dateDebut) },
                { label: "Départ", value: formatDate(dateFin) },
                { label: "Durée", value: getDuration() || "" },
              ]
                .filter((i) => i.value)
                .map((item) => (
                  <View key={item.label} style={styles.summaryRow}>
                    <Text style={styles.summaryKey}>{item.label}</Text>
                    <Text style={styles.summaryVal}>{item.value}</Text>
                  </View>
                ))}
            </View>
          )}

          <TouchableOpacity
            onPress={handleSubmit}
            activeOpacity={0.85}
            style={{ marginTop: 24 }}
          >
            <LinearGradient
              colors={[BLUE_PRIMARY, BLUE_GLOW]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaBtn}
            >
              <Text style={styles.ctaBtnText}>Continuer</Text>
              <View style={styles.ctaArrow}>
                <Text style={styles.ctaArrowText}>→</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.secureNote}>
            🔒 Vos données sont protégées et sécurisées
          </Text>
        </Animated.View>
      </ScrollView>

      {/* Modal Date */}
      <Modal visible={showDateModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.dateModal}>
            <LinearGradient
              colors={["#042A66", BLUE_PRIMARY]}
              style={styles.modalTop}
            >
              <Text style={styles.modalTopText}>
                {dateModalType === "debut"
                  ? "📅 Date d'arrivée"
                  : "📅 Date de départ"}
              </Text>
            </LinearGradient>
            <View style={styles.pickerRow}>
              {[
                {
                  label: "Jour",
                  selected: tempDay,
                  onChange: setTempDay,
                  items: Array.from({ length: 31 }, (_, i) => ({
                    label: String(i + 1).padStart(2, "0"),
                    value: i + 1,
                  })),
                },
                {
                  label: "Mois",
                  selected: tempMonth,
                  onChange: setTempMonth,
                  items: [
                    "Jan",
                    "Fév",
                    "Mar",
                    "Avr",
                    "Mai",
                    "Jun",
                    "Jul",
                    "Aoû",
                    "Sep",
                    "Oct",
                    "Nov",
                    "Déc",
                  ].map((m, i) => ({ label: m, value: i + 1 })),
                },
                {
                  label: "Année",
                  selected: tempYear,
                  onChange: setTempYear,
                  items: [2025, 2026, 2027].map((y) => ({
                    label: String(y),
                    value: y,
                  })),
                },
              ].map((col) => (
                <View key={col.label} style={styles.pickerCol}>
                  <Text style={styles.pickerColLabel}>{col.label}</Text>
                  <Picker
                    selectedValue={col.selected}
                    onValueChange={col.onChange}
                    style={styles.pickerColInner}
                    itemStyle={{ color: WHITE, fontSize: 15 }}
                  >
                    {col.items.map((item) => (
                      <Picker.Item
                        key={item.value}
                        label={item.label}
                        value={item.value}
                      />
                    ))}
                  </Picker>
                </View>
              ))}
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => setShowDateModal(false)}
              >
                <Text style={styles.modalBtnCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={confirmDateModal}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={[BLUE_PRIMARY, BLUE_GLOW]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.modalBtnConfirm}
                >
                  <Text style={styles.modalBtnConfirmText}>Confirmer</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Amis */}
      <Modal visible={showFriendsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView
            style={{ width: "100%" }}
            contentContainerStyle={styles.friendsModalScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.friendsModal}>
              <StepIndicator step={2} />
              <Text style={styles.friendsTitle}>Voyagez en Groupe</Text>
              <Text style={styles.friendsSub}>
                Invitez vos amis à rejoindre l'aventure
              </Text>

              {!inviteCode && (
                <View style={styles.requiredBanner}>
                  <Text style={styles.requiredBannerIcon}>👥</Text>
                  <Text style={styles.requiredBannerText}>
                    Au moins 1 ami doit être invité pour continuer
                  </Text>
                </View>
              )}

              {!inviteCode && (
                <>
                  <View style={styles.emailRow}>
                    <TextInput
                      style={styles.emailInput}
                      placeholder="email@exemple.com"
                      placeholderTextColor={TEXT_MUTED}
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      editable={!sendingEmails}
                      onSubmitEditing={addEmail}
                      returnKeyType="done"
                    />
                    <TouchableOpacity
                      style={styles.addBtn}
                      onPress={addEmail}
                      activeOpacity={0.8}
                      disabled={sendingEmails}
                    >
                      <LinearGradient
                        colors={[BLUE_PRIMARY, BLUE_GLOW]}
                        style={[
                          styles.addBtnGrad,
                          sendingEmails && styles.disabledBtn,
                        ]}
                      >
                        <Text style={styles.addBtnText}>+</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>

                  {emailInvites.length > 0 && (
                    <View style={styles.inviteList}>
                      <Text style={styles.inviteListTitle}>
                        👥 {emailInvites.length} invité
                        {emailInvites.length > 1 ? "s" : ""}
                      </Text>
                      {emailInvites.map((e, i) => (
                        <View key={i} style={styles.inviteItem}>
                          <View style={styles.inviteAvatar}>
                            <Text style={styles.inviteAvatarText}>
                              {e[0].toUpperCase()}
                            </Text>
                          </View>
                          <Text style={styles.inviteEmail} numberOfLines={1}>
                            {e}
                          </Text>
                          {!sendingEmails && (
                            <TouchableOpacity
                              style={styles.removeBtn}
                              onPress={() => removeEmail(i)}
                            >
                              <Text style={styles.removeBtnText}>✕</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}

              {sendingEmails && (
                <View style={styles.sendingContainer}>
                  <ActivityIndicator size="large" color={BLUE_PRIMARY} />
                  <Text style={styles.sendingText}>
                    Envoi des invitations...
                  </Text>
                </View>
              )}

              {inviteCode && (
                <View style={styles.codeSection}>
                  <View style={styles.codeVoyageRecap}>
                    <Text style={styles.codeVoyageTitle}>
                      ✈️ Voyage confirmé
                    </Text>
                    {[
                      {
                        label: "Destination",
                        value: `${VILLE_FLAGS[ville]} ${ville}`,
                      },
                      { label: "Arrivée", value: formatDate(dateDebut) },
                      { label: "Départ", value: formatDate(dateFin) },
                      { label: "Durée", value: getDuration() || "" },
                      {
                        label: "Invités",
                        value: `${emailInvites.length} personne${emailInvites.length > 1 ? "s" : ""}`,
                      },
                    ].map((r) => (
                      <View key={r.label} style={styles.codeVoyageRow}>
                        <Text style={styles.codeVoyageLabel}>{r.label}</Text>
                        <Text style={styles.codeVoyageVal}>{r.value}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.codeBox}>
                    <Text style={styles.codeLabel}>🔑 CODE D'INVITATION</Text>
                    <View style={styles.codeLetters}>
                      {inviteCode.split("").map((char, idx) => (
                        <View key={idx} style={styles.codeLetter}>
                          <Text style={styles.codeLetterText}>{char}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={styles.codeSub}>
                      Partagez ce code avec vos amis pour qu'ils rejoignent le
                      voyage
                    </Text>
                    <View style={styles.codeEmailsSent}>
                      <Text style={styles.codeEmailsSentText}>
                        ✅ Code envoyé à {emailInvites.length} invité
                        {emailInvites.length > 1 ? "s" : ""} par email
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              <TouchableOpacity
                onPress={handleFriendsSubmit}
                activeOpacity={emailInvites.length > 0 || inviteCode ? 0.85 : 1}
                disabled={sendingEmails || isSubmitting}
                style={{ marginTop: 24 }}
              >
                <LinearGradient
                  colors={
                    emailInvites.length === 0 && !inviteCode && !email.trim()
                      ? ["#1A2B45", "#1A2B45"]
                      : [BLUE_PRIMARY, BLUE_GLOW]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[
                    styles.ctaBtn,
                    (sendingEmails || isSubmitting) && styles.ctaBtnDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.ctaBtnText,
                      emailInvites.length === 0 &&
                        !inviteCode &&
                        !email.trim() && { color: TEXT_MUTED },
                    ]}
                  >
                    {sendingEmails
                      ? "Envoi en cours..."
                      : inviteCode
                        ? "Continuer →"
                        : "Envoyer les invitations"}
                  </Text>
                  {!sendingEmails && (
                    <View style={styles.ctaArrow}>
                      <Text style={styles.ctaArrowText}>→</Text>
                    </View>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {!sendingEmails && !inviteCode && (
                <TouchableOpacity
                  onPress={() => setShowFriendsModal(false)}
                  style={styles.backLink}
                >
                  <Text style={styles.backLinkText}>← Retour</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

/* ─── STYLES MENU ─── */
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

/* ─── STYLES PROMPT ─── */
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
    shadowOffset: { width: 0, height: -4 },
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

/* ─── STYLES PRINCIPAUX ─── */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { paddingBottom: 48 },
  hero: {
    paddingTop: Platform.OS === "ios" ? 56 : 36,
    paddingBottom: 32,
    paddingHorizontal: 24,
    overflow: "hidden",
    position: "relative",
  },
  menuContainer: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 30,
    right: 15,
    zIndex: 99,
  },
  orbTop: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(255,255,255,0.04)",
    top: -80,
    right: -80,
  },
  orbBot: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.04)",
    bottom: -50,
    left: -50,
  },
  logo: { width: 46, height: 46, borderRadius: 12, marginBottom: 18 },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    marginBottom: 14,
  },
  heroBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#5B9BFF",
  },
  heroBadgeText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
  },
  heroTitle: {
    color: WHITE,
    fontSize: 36,
    fontWeight: "800",
    lineHeight: 42,
    letterSpacing: -1,
    marginBottom: 10,
  },
  heroSub: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 24,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleActive: {
    backgroundColor: BLUE_PRIMARY,
    borderColor: BLUE_PRIMARY,
  },
  stepNum: { color: TEXT_MUTED, fontSize: 14, fontWeight: "700" },
  stepNumActive: { color: WHITE },
  stepCheck: { color: WHITE, fontSize: 14, fontWeight: "800" },
  stepLine: {
    width: 60,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginHorizontal: 8,
  },
  stepLineActive: { backgroundColor: BLUE_PRIMARY },
  formCard: {
    margin: 16,
    backgroundColor: CARD_BG,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BLUE_PRIMARY,
  },
  sectionLabel: {
    color: TEXT_MUTED,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.5,
  },
  fieldLabel: {
    color: TEXT_MEDIUM,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
  },
  pickerBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingLeft: 12,
    marginBottom: 12,
    overflow: "hidden",
  },
  pickerBoxIcon: { fontSize: 20, marginRight: 4 },
  picker: { flex: 1, color: WHITE, height: 52 },
  categoryScroll: { marginBottom: 10 },
  categoryTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    marginRight: 8,
  },
  categoryTabActive: {
    backgroundColor: `${BLUE_PRIMARY}33`,
    borderColor: BLUE_LIGHT,
  },
  categoryTabText: { color: TEXT_MUTED, fontSize: 12, fontWeight: "600" },
  categoryTabTextActive: { color: BLUE_LIGHT },
  pillGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
  },
  pillActive: { backgroundColor: BLUE_PRIMARY, borderColor: BLUE_PRIMARY },
  pillText: { color: TEXT_MUTED, fontSize: 13, fontWeight: "600" },
  pillTextActive: { color: WHITE },
  datesRow: { flexDirection: "row", gap: 10 },
  dateCard: {
    flex: 1,
    backgroundColor: BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    alignItems: "center",
  },
  dateCardFilled: { borderColor: BLUE_PRIMARY, borderWidth: 1.5 },
  dateCardLabel: {
    color: TEXT_MUTED,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 6,
  },
  dateCardIcon: { fontSize: 20, marginBottom: 6 },
  dateCardValue: { color: WHITE, fontSize: 13, fontWeight: "700" },
  durationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  durationLine: { flex: 1, height: 1, backgroundColor: BORDER },
  durationBadge: {
    backgroundColor: `${BLUE_PRIMARY}22`,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: `${BLUE_PRIMARY}44`,
  },
  durationText: { color: BLUE_LIGHT, fontSize: 12, fontWeight: "700" },
  summaryCard: {
    marginTop: 20,
    backgroundColor: BG,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderLeftWidth: 3,
    borderLeftColor: BLUE_PRIMARY,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  summaryHeaderIcon: { color: BLUE_PRIMARY, fontSize: 13 },
  summaryHeaderText: {
    color: BLUE_PRIMARY,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  summaryKey: { color: TEXT_MUTED, fontSize: 13 },
  summaryVal: { color: WHITE, fontSize: 13, fontWeight: "600" },
  ctaBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    shadowColor: BLUE_PRIMARY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 12,
  },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaBtnText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  ctaArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaArrowText: { color: WHITE, fontSize: 16, fontWeight: "800" },
  secureNote: {
    color: "#1E3050",
    fontSize: 11,
    textAlign: "center",
    marginTop: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  dateModal: {
    width: "100%",
    backgroundColor: CARD_BG,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER,
  },
  modalTop: { paddingVertical: 18, paddingHorizontal: 24 },
  modalTopText: {
    color: WHITE,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  pickerRow: { flexDirection: "row", gap: 4, padding: 16, paddingBottom: 4 },
  pickerCol: { flex: 1, alignItems: "center" },
  pickerColLabel: {
    color: TEXT_MUTED,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 4,
  },
  pickerColInner: { width: "100%", color: WHITE },
  modalBtns: { flexDirection: "row", gap: 12, padding: 16 },
  modalBtnCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalBtnCancelText: { color: TEXT_MUTED, fontWeight: "600" },
  modalBtnConfirm: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalBtnConfirmText: { color: WHITE, fontWeight: "700" },
  friendsModalScroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  friendsModal: {
    width: "100%",
    backgroundColor: CARD_BG,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: BORDER,
  },
  friendsTitle: {
    color: WHITE,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 20,
    marginBottom: 6,
  },
  friendsSub: {
    color: TEXT_MUTED,
    fontSize: 13,
    textAlign: "center",
    marginBottom: 16,
  },
  requiredBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: `${BLUE_PRIMARY}18`,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${BLUE_PRIMARY}40`,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 18,
  },
  requiredBannerIcon: { fontSize: 18 },
  requiredBannerText: {
    color: BLUE_LIGHT,
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
    lineHeight: 18,
  },
  emailRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  emailInput: {
    flex: 1,
    backgroundColor: BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    color: WHITE,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 14,
  },
  addBtn: { width: 48, height: 48, borderRadius: 12, overflow: "hidden" },
  addBtnGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
  addBtnText: { color: WHITE, fontSize: 22, fontWeight: "300" },
  disabledBtn: { opacity: 0.5 },
  inviteList: {
    backgroundColor: BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 4,
  },
  inviteListTitle: {
    color: BLUE_LIGHT,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 12,
  },
  inviteItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  inviteAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BLUE_PRIMARY,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteAvatarText: { color: WHITE, fontWeight: "700", fontSize: 13 },
  inviteEmail: { flex: 1, color: TEXT_MEDIUM, fontSize: 13 },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: { color: TEXT_MUTED, fontSize: 12 },
  backLink: { alignItems: "center", marginTop: 14 },
  backLinkText: { color: TEXT_MUTED, fontSize: 13, fontWeight: "600" },
  sendingContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  sendingText: { color: WHITE, fontSize: 14, marginTop: 10 },
  codeSection: { marginTop: 8 },
  codeVoyageRecap: {
    backgroundColor: BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    borderLeftWidth: 3,
    borderLeftColor: BLUE_PRIMARY,
    padding: 16,
    marginBottom: 16,
  },
  codeVoyageTitle: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 12,
  },
  codeVoyageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  codeVoyageLabel: { color: TEXT_MUTED, fontSize: 13 },
  codeVoyageVal: { color: WHITE, fontSize: 13, fontWeight: "600" },
  codeBox: {
    backgroundColor: `${BLUE_PRIMARY}15`,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: `${BLUE_PRIMARY}80`,
    padding: 22,
    alignItems: "center",
  },
  codeLabel: {
    color: BLUE_LIGHT,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 3,
    marginBottom: 16,
  },
  codeLetters: { flexDirection: "row", gap: 6, marginBottom: 16 },
  codeLetter: {
    width: 36,
    height: 44,
    borderRadius: 8,
    backgroundColor: CARD_BG,
    borderWidth: 1.5,
    borderColor: BLUE_PRIMARY,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: BLUE_GLOW,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  codeLetterText: { color: WHITE, fontSize: 18, fontWeight: "800" },
  codeSub: {
    color: TEXT_MUTED,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 12,
  },
  codeEmailsSent: {
    backgroundColor: GREEN_BG,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GREEN_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  codeEmailsSentText: { color: GREEN, fontSize: 12, fontWeight: "600" },
});

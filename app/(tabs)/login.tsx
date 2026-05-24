import React, { useState } from "react";
import {
  ActivityIndicator,
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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useTravelData } from "../../context/TravelContext";
import { API } from "../../constants/api";

type RootStackParamList = {
  login: undefined;
  sign: undefined;
  "reset-password": undefined;
  question: undefined;
  questioninvi: undefined;
  formulaire: undefined;
  "mes-plans": undefined;
  ancienplan: undefined;
  promotion: undefined;
  "group-chat": { inviteCode: string; username: string; userId: number | null };
  resumeinvi: { inviteCode: string; userId: number | null; email: string };
  modifierinfo: {
    destination?: string;
    date_depart?: string;
    date_arrivee?: string;
    nuitees?: string;
    invite_code?: string;
    guest_email?: string;
  };
};

function FloatingInput({
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  icon,
  returnKeyType,
  onSubmitEditing,
}: any) {
  const [focused, setFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  return (
    <View style={[iStyles.wrapper, focused && iStyles.wrapperFocused]}>
      <Text style={iStyles.icon}>{icon}</Text>
      <TextInput
        style={iStyles.input}
        placeholder={placeholder}
        placeholderTextColor="#A8BDD8"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry && !passwordVisible}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? "sentences"}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
      />
      {secureTextEntry && (
        <TouchableOpacity
          onPress={() => setPasswordVisible(!passwordVisible)}
          style={iStyles.eyeBtn}
          activeOpacity={0.7}
        >
          <Text style={iStyles.eyeIcon}>{passwordVisible ? "🐵" : "🙈"}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const iStyles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF4FF",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#D6E4FF",
    marginBottom: 13,
    paddingHorizontal: 14,
  },
  wrapperFocused: { borderColor: "#0A4DBF", backgroundColor: "#E8F0FE" },
  icon: { fontSize: 16, marginRight: 10, color: "#0A4DBF" },
  input: { flex: 1, paddingVertical: 14, fontSize: 15, color: "#042A66" },
  eyeBtn: { padding: 4 },
  eyeIcon: { fontSize: 16 },
});
const BLUE_DEEP = "#042A66";
const BLUE_PRIMARY = "#0A4DBF";
const BLUE_PALE = "#D6E4FF";
const BLUE_ULTRA_PALE = "#EEF4FF";
const WHITE = "#FFFFFF";
const TEXT_MUTED = "#7A90B4";
const GREEN = "#16A34A";
const GREEN_PALE = "#DCFCE7";

export default function LoginScreen() {
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loggedEmail, setLoggedEmail] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [notifying, setNotifying] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [codeStatus, setCodeStatus] = useState<
    "idle" | "checking" | "valid" | "invalid"
  >("idle");
  const [codeInfo, setCodeInfo] = useState<{
    destination?: string;
    date_depart?: string;
    date_arrivee?: string;
    date_depart_raw?: string;
    date_arrivee_raw?: string;
    nuitees?: number;
  } | null>(null);
  const [codeExpiredMsg, setCodeExpiredMsg] = useState<string | null>(null);
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);
  const [alreadyJoined, setAlreadyJoined] = useState(false);
  const [planData, setPlanData] = useState<any | null>(null);

  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { setTravelData } = useTravelData();

  // ── Login ──────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Erreur", "Veuillez remplir tous les champs");
      return;
    }

    if (password.length < 6) {
      Alert.alert(
        "Erreur",
        "Le mot de passe doit contenir au moins 6 caractères",
      );
      return;
    }
    if (!/[A-Z]/.test(password)) {
      Alert.alert(
        "Erreur",
        "Le mot de passe doit contenir au moins une majuscule",
      );
      return;
    }
    if (!/[0-9]/.test(password)) {
      Alert.alert(
        "Erreur",
        "Le mot de passe doit contenir au moins un chiffre",
      );
      return;
    }

    try {
      const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.status === 200) {
        const cleanEmail = email.trim().toLowerCase();
        const userId = data.user?.id;
        const name = data.user?.fullName || cleanEmail;

        setCurrentUserId(userId);
        setLoggedEmail(cleanEmail);
        setFullName(name);
        setTravelData({ userId, fullName: name } as any);
        setModalVisible(true);
      } else {
        Alert.alert(
          "Erreur",
          data.message || "Email ou mot de passe incorrect",
        );
      }
    } catch {
      Alert.alert("Erreur", "Problème de connexion au serveur");
    }
  };

  // ── Vérifier le code ───────────────────────────────────────────────────────
  const checkInviteCode = async (
    code: string,
    emailOverride?: string,
    userIdOverride?: number | null,
  ) => {
    const cleaned = code.trim().toUpperCase();
    const useEmail = emailOverride ?? loggedEmail;
    const useId = userIdOverride ?? currentUserId;

    setInviteCode(cleaned);
    setOverlapWarning(null);
    setCodeExpiredMsg(null);
    setAlreadyJoined(false);
    setPlanData(null);

    if (cleaned.length < 8) {
      setCodeStatus("idle");
      setCodeInfo(null);
      return;
    }

    // ── Code PL → plan partagé ────────────────────────────────────────────
    if (cleaned.startsWith("PL")) {
      setCodeStatus("checking");
      try {
        const res = await fetch(`${API}/plan-by-code?code=${cleaned}`);
        const data = await res.json();
        if (res.ok && data.valid) {
          setCodeStatus("valid");
          setPlanData(data);
          setCodeInfo({
            destination: data.destination,
            date_depart: data.date_debut,
            date_arrivee: data.date_fin,
          });
        } else {
          setCodeStatus("invalid");
          setCodeInfo(null);
          setPlanData(null);
        }
      } catch {
        setCodeStatus("idle");
        setCodeInfo(null);
        setPlanData(null);
      }
      return;
    }

    // ── Code invitation classique ─────────────────────────────────────────
    setCodeStatus("checking");
    try {
      const res = await fetch(`${API}/check-invite-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: cleaned }),
      });
      const data = await res.json();

      if (res.ok && data.valid) {
        setCodeStatus("valid");
        setCodeInfo({
          destination: data.destination,
          date_depart: data.date_depart,
          date_arrivee: data.date_arrivee,
          date_depart_raw: data.date_depart_raw,
          date_arrivee_raw: data.date_arrivee_raw,
          nuitees: data.nuitees,
        });

        if (useEmail || useId) {
          try {
            const joinedRes = await fetch(`${API}/check-already-joined`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code: cleaned,
                user_id: useId,
                email: useEmail,
              }),
            });
            const joinedData = await joinedRes.json();
            if (joinedData.already_joined) setAlreadyJoined(true);
          } catch (e) {
            console.warn("check-already-joined silencieux", e);
          }
        }
      } else {
        setCodeStatus("invalid");
        setCodeInfo(null);
        if (data.reason === "expired")
          setCodeExpiredMsg(
            "Ce code a dépassé 24h et n'est plus valide. Demandez un nouveau lien à l'organisateur.",
          );
      }
    } catch {
      setCodeStatus("idle");
      setCodeInfo(null);
    }
  };

  const notifyLeader = async (action: "rejoint" | "modifie") => {
    try {
      await fetch(`${API}/notify-leader`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: inviteCode,
          guest_email: loggedEmail,
          action,
        }),
      });
    } catch {
      console.warn("Notification leader échouée");
    }
  };

  const checkOverlap = async (): Promise<{
    warning: string | null;
    blocked: boolean;
  }> => {
    if (!codeInfo || !loggedEmail) return { warning: null, blocked: false };
    const depart = codeInfo.date_depart_raw ?? codeInfo.date_depart ?? "";
    const arrivee = codeInfo.date_arrivee_raw ?? codeInfo.date_arrivee ?? "";
    try {
      const res = await fetch(`${API}/api/check-overlap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loggedEmail,
          invite_code: inviteCode,
          date_depart: depart,
          date_arrivee: arrivee,
        }),
      });
      const json = await res.json();

      if (json.blocked && json.conflicts?.length > 0) {
        const c = json.conflicts[0];
        const periodeMsg =
          c.gap_days === 0
            ? "il y a un chevauchement direct entre vos deux voyages"
            : `il n'y a que ${c.gap_days} jour(s) entre vos deux voyages (minimum requis : ${json.min_gap} jours)`;
        const warning =
          `Vous avez déjà un voyage vers ${c.destination} \n` +
          `📅 ${c.date_depart} → ${c.date_arrivee}\n\n` +
          `⏱ ${periodeMsg}.\n\n` +
          `Vous ne pouvez pas rejoindre ce voyage pour l'instant.`;
        return { warning, blocked: true };
      }
      return { warning: null, blocked: false };
    } catch (e) {
      console.warn("check-overlap erreur :", e);
      return {
        warning:
          "Impossible de vérifier la disponibilité pour le moment, veuillez réessayer.",
        blocked: true,
      };
    }
  };

  const handleGoToQuestions = async () => {
    if (!inviteCode || codeStatus !== "valid" || !codeInfo) return;
    if (alreadyJoined) {
      Alert.alert(
        "Déjà rejoint",
        "Vous avez déjà donné vos préférences pour ce voyage.",
      );
      return;
    }
    setOverlapWarning(null);
    setNotifying(true);

    try {
      const { warning: overlapMsg, blocked } = await checkOverlap();
      if (blocked) {
        setOverlapWarning(overlapMsg);
        setNotifying(false);
        return;
      }

      const joinRes = await fetch(`${API}/join-with-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: inviteCode,
          email: loggedEmail,
          user_id: currentUserId,
        }),
      });
      const joinJson = await joinRes.json();

      if (joinRes.status === 409) {
        setNotifying(false);
        setAlreadyJoined(true);
        Alert.alert(
          "Déjà rejoint",
          "Vous avez déjà donné vos préférences pour ce voyage.",
        );
        return;
      }
      if (!joinRes.ok) {
        setNotifying(false);
        Alert.alert(
          "Erreur",
          joinJson.error ||
            joinJson.message ||
            "Impossible de rejoindre ce voyage.",
        );
        return;
      }

      await notifyLeader("rejoint");
      setTravelData({
        ville: codeInfo.destination || "",
        inviteCode,
        userId: currentUserId,
      } as any);
      resetCodeState();
      setModalVisible(false);
      setNotifying(false);
      setTimeout(() => navigation.navigate("questioninvi"), 300);
    } catch (e) {
      console.warn("handleGoToQuestions error:", e);
      setNotifying(false);
      Alert.alert("Erreur", "Problème de connexion, réessayez");
    }
  };

  const handleOpenGroupChat = () => {
    if (!inviteCode || codeStatus !== "valid") {
      Alert.alert(
        "Code invalide",
        "Veuillez entrer un code d'invitation valide.",
      );
      return;
    }
    setModalVisible(false);
    resetCodeState();
    const chatUsername = fullName || loggedEmail;
    setTimeout(() => {
      navigation.navigate("group-chat", {
        inviteCode,
        username: chatUsername,
        userId: currentUserId,
      });
    }, 300);
  };

  const handleModifierInfo = () => {
    const savedInfo = {
      destination: codeInfo?.destination ?? "",
      date_depart: codeInfo?.date_depart ?? "",
      date_arrivee: codeInfo?.date_arrivee ?? "",
      nuitees: String(codeInfo?.nuitees ?? ""),
      invite_code: inviteCode,
      guest_email: loggedEmail,
    };
    setTravelData({
      ville: codeInfo?.destination || "",
      inviteCode,
      userId: currentUserId,
    } as any);
    resetCodeState();
    setModalVisible(false);
    setTimeout(
      () => navigation.navigate("modifierinfo", savedInfo as any),
      300,
    );
  };

  const handleViewFullPlan = async () => {
    if (!planData) return;

    const planType: "gratuit" | "premium" =
      planData.type === "premium" ? "premium" : "gratuit";

    const newPlan = {
      id: planData.plan_code || `plan-${Date.now()}`,
      nom: planData.nom || `Voyage à ${planData.destination}`,
      destination: planData.destination || "",
      dateDebut: planData.date_debut || "",
      dateFin: planData.date_fin || "",
      duree: planData.plan?.itinerary?.length || 1,
      dateCreation: new Date().toISOString(),
      statut: "à venir" as const,
      voyageurs: 1,
      nombreInvitesAttendus: 0,
      activites: [],
      hotels: [],
      itinerary: planData.plan?.itinerary || [],
      type: planType,
      inviteCode: planData.plan_code || inviteCode,
      source: "plan" as const,
      leaderPrefs: { email: planData.leader_email },
      budget: planData.plan?.budget,
    };

    try {
      const storageKey =
        planType === "premium" ? "@premium_travel_plans" : "@travel_plans";
      const existing = await AsyncStorage.getItem(storageKey);
      const plans: any[] = existing ? JSON.parse(existing) : [];
      const alreadyExists = plans.some(
        (p: any) =>
          (p.inviteCode || "").toUpperCase() ===
          (newPlan.inviteCode || "").toUpperCase(),
      );
      if (!alreadyExists) {
        plans.unshift(newPlan);
        await AsyncStorage.setItem(storageKey, JSON.stringify(plans));
      }
    } catch (e) {
      console.warn("Erreur sauvegarde plan partagé :", e);
    }

    setTravelData({
      ville: planData.destination || "",
      planCode: (planData.plan_code || "").trim().toUpperCase(),
      userId: currentUserId,
    } as any);

    resetCodeState();
    setModalVisible(false);
    setTimeout(() => navigation.navigate("ancienplan"), 300);
  };

  // ✅ FIX : handleNewPlan — userId garanti dans le contexte avant navigation
  const handleNewPlan = () => {
    setTravelData({ userId: currentUserId } as any);
    setModalVisible(false);
    resetCodeState();
    navigation.navigate("promotion");
  };

  // ✅ FIX : handleYourPlans — cohérence avec le reste
  const handleYourPlans = () => {
    setTravelData({ userId: currentUserId } as any);
    setModalVisible(false);
    resetCodeState();
    navigation.navigate("ancienplan");
  };

  const handleClose = () => {
    setModalVisible(false);
    resetCodeState();
  };

  const resetCodeState = () => {
    setInviteCode("");
    setCodeStatus("idle");
    setCodeInfo(null);
    setPlanData(null);
    setOverlapWarning(null);
    setCodeExpiredMsg(null);
    setAlreadyJoined(false);
    setNotifying(false);
  };

  return (
    <LinearGradient
      colors={["#021B4E", "#042A66", "#0A4DBF"]}
      style={styles.bg}
    >
      <View style={styles.circle1} />
      <View style={styles.circle2} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.kav}
      >
        <View style={styles.branding}>
          <View style={styles.logoRing}>
            <Image
              source={require("../../assets/logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.brandName}>Pack&Go</Text>
          <Text style={styles.brandTagline}>Votre aventure commence ici</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === "login" && styles.tabActive]}
              onPress={() => setActiveTab("login")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "login" && styles.tabTextActive,
                ]}
              >
                Connexion
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "signup" && styles.tabActive]}
              onPress={() => navigation.navigate("sign")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "signup" && styles.tabTextActive,
                ]}
              >
                Inscription
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.cardTitle}>Bon retour 👋</Text>
          <Text style={styles.cardSubtitle}>Connectez-vous pour continuer</Text>

          <FloatingInput
            placeholder="Adresse e-mail"
            value={email}
            onChangeText={setEmail}
            icon="✉"
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
          />
          <FloatingInput
            placeholder="Mot de passe"
            value={password}
            onChangeText={setPassword}
            icon="🔒"
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity
            onPress={() => navigation.navigate("reset-password")}
          >
            <Text style={styles.forgot}>Mot de passe oublié ?</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleLogin} activeOpacity={0.85}>
            <LinearGradient
              colors={["#0A4DBF", "#1a6aff"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitButton}
            >
              <Text style={styles.submitText}>Se connecter</Text>
              <Text style={styles.submitArrow}>→</Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.footerText}>
            Pas encore de compte ?{" "}
            <Text
              style={styles.footerLink}
              onPress={() => navigation.navigate("sign")}
            >
              S'inscrire
            </Text>
          </Text>
        </View>
      </KeyboardAvoidingView>

      {/* ══ MODAL APRÈS CONNEXION ══ */}
      <Modal
        animationType="slide"
        transparent
        visible={modalVisible}
        onRequestClose={handleClose}
      >
        <View style={styles.modalOverlay}>
          <ScrollView
            style={{ width: "100%" }}
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalCard}>
              <LinearGradient
                colors={["#042A66", "#0A4DBF"]}
                style={styles.modalAccent}
              >
                <Text style={styles.modalAccentIcon}>✈</Text>
              </LinearGradient>

              <Text style={styles.modalTitle}>Bienvenue !</Text>
              <Text style={styles.modalSubtitle}>
                Que souhaitez-vous faire ?
              </Text>

              <TouchableOpacity
                onPress={handleNewPlan}
                activeOpacity={0.85}
                style={styles.modalBtnWrapper}
              >
                <LinearGradient
                  colors={["#0A4DBF", "#1a6aff"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.modalBtnGradient}
                >
                  <Text style={styles.modalBtnIcon}>＋</Text>
                  <Text style={styles.modalBtnText}>Nouveau plan</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalBtnOutline}
                onPress={handleYourPlans}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnOutlineIcon}>📋</Text>
                <Text style={styles.modalBtnOutlineText}>
                  Vos plans existants
                </Text>
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerLabel}>
                  Ou rejoindre / voir un voyage
                </Text>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.inviteLabelRow}>
                <Text style={styles.inviteLabel}>
                  🎟️ Code d'invitation ou de plan
                </Text>
                <Text style={styles.inviteOptional}>(optionnel)</Text>
              </View>

              <View
                style={[
                  styles.inviteInputWrapper,
                  codeStatus === "valid" &&
                    !alreadyJoined &&
                    styles.inviteInputValid,
                  codeStatus === "valid" &&
                    alreadyJoined &&
                    styles.inviteInputAlreadyJoined,
                  codeStatus === "invalid" && styles.inviteInputInvalid,
                  codeStatus === "checking" && styles.inviteInputChecking,
                ]}
              >
                <Text style={styles.inviteInputIcon}>🔑</Text>
                <TextInput
                  style={styles.inviteInput}
                  placeholder="Ex: A3K9XZ2M ou PL3A9F2C"
                  placeholderTextColor="#A8BDD8"
                  value={inviteCode}
                  onChangeText={(code) =>
                    checkInviteCode(code, loggedEmail, currentUserId)
                  }
                  autoCapitalize="characters"
                  maxLength={10}
                  returnKeyType="done"
                />
                {codeStatus === "checking" && (
                  <ActivityIndicator
                    size="small"
                    color={BLUE_PRIMARY}
                    style={{ marginRight: 8 }}
                  />
                )}
                {codeStatus === "valid" && !alreadyJoined && (
                  <Text style={styles.inviteStatusIcon}>✅</Text>
                )}
                {codeStatus === "valid" && alreadyJoined && (
                  <Text style={styles.inviteStatusIcon}>⚠️</Text>
                )}
                {codeStatus === "invalid" && (
                  <Text style={styles.inviteStatusIcon}>❌</Text>
                )}
              </View>

              {codeStatus === "invalid" && (
                <Text
                  style={[
                    styles.inviteErrorText,
                    codeExpiredMsg ? styles.inviteExpiredText : null,
                  ]}
                >
                  {codeExpiredMsg ?? "Code invalide ou expiré"}
                </Text>
              )}

              {/* ══ CAS 1 : CODE PL → PLAN PARTAGÉ ══ */}
              {codeStatus === "valid" && planData && (
                <View style={styles.planCard}>
                  <LinearGradient
                    colors={["#042A66", "#0A4DBF"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.planCardHeader}
                  >
                    <Text style={styles.planCardHeaderIcon}>📋</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planCardHeaderTitle}>
                        Plan partagé trouvé
                      </Text>
                      <Text style={styles.planCardHeaderSub}>
                        {planData.nom || "Voyage"}
                      </Text>
                    </View>
                  </LinearGradient>

                  <View style={styles.planCardBody}>
                    <View style={styles.planInfoGrid}>
                      <View style={styles.planInfoCell}>
                        <Text style={styles.planInfoCellIcon}>📍</Text>
                        <Text style={styles.planInfoCellLabel}>
                          Destination
                        </Text>
                        <Text style={styles.planInfoCellVal}>
                          {planData.destination}
                        </Text>
                      </View>
                      <View style={styles.planInfoCell}>
                        <Text style={styles.planInfoCellIcon}>🛫</Text>
                        <Text style={styles.planInfoCellLabel}>Départ</Text>
                        <Text style={styles.planInfoCellVal}>
                          {planData.date_debut}
                        </Text>
                      </View>
                      <View style={styles.planInfoCell}>
                        <Text style={styles.planInfoCellIcon}>🛬</Text>
                        <Text style={styles.planInfoCellLabel}>Retour</Text>
                        <Text style={styles.planInfoCellVal}>
                          {planData.date_fin}
                        </Text>
                      </View>
                      <View style={styles.planInfoCell}>
                        <Text style={styles.planInfoCellIcon}>👤</Text>
                        <Text style={styles.planInfoCellLabel}>
                          Partagé par
                        </Text>
                        <Text
                          style={[styles.planInfoCellVal, { fontSize: 10 }]}
                          numberOfLines={1}
                        >
                          {planData.leader_email}
                        </Text>
                      </View>
                    </View>

                    {planData.plan?.itinerary?.length > 0 && (
                      <View style={{ marginTop: 14 }}>
                        <Text style={styles.planItineraryTitle}>
                          🗓️ Aperçu de l'itinéraire
                        </Text>
                        {planData.plan.itinerary
                          .slice(0, 5)
                          .map((day: any, i: number) => (
                            <View key={i} style={styles.planDayRow}>
                              <View style={styles.planDayBadge}>
                                <Text style={styles.planDayBadgeText}>
                                  J{i + 1}
                                </Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.planDayTitle}>
                                  {day.title || `Jour ${i + 1}`}
                                </Text>
                                {day.hotel?.name ? (
                                  <Text style={styles.planDayDetail}>
                                    🏨 {day.hotel.name}
                                  </Text>
                                ) : null}
                                {day.activity ? (
                                  <Text
                                    style={styles.planDayDetail}
                                    numberOfLines={1}
                                  >
                                    🎯 {day.activity}
                                  </Text>
                                ) : null}
                              </View>
                            </View>
                          ))}
                        {planData.plan.itinerary.length > 5 && (
                          <Text style={styles.planMoreDays}>
                            +{planData.plan.itinerary.length - 5} autres jours…
                          </Text>
                        )}
                      </View>
                    )}

                    <TouchableOpacity
                      onPress={handleViewFullPlan}
                      activeOpacity={0.85}
                      style={[styles.actionBtnWrapper, { marginTop: 16 }]}
                    >
                      <LinearGradient
                        colors={["#0A4DBF", "#1a6aff"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.actionBtn}
                      >
                        <Text style={styles.actionBtnIcon}>📋</Text>
                        <Text style={styles.actionBtnText}>
                          Voir le plan complet
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* ══ CAS 2 : CODE INVITATION CLASSIQUE ══ */}
              {codeStatus === "valid" && !planData && (
                <>
                  {alreadyJoined && (
                    <View style={styles.alreadyJoinedBanner}>
                      <Text style={styles.alreadyJoinedIcon}>🚫</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.alreadyJoinedTitle}>
                          Préférences déjà soumises
                        </Text>
                        <Text style={styles.alreadyJoinedText}>
                          Vous avez déjà donné vos préférences pour ce voyage.
                          Vous ne pouvez pas rejoindre à nouveau.
                        </Text>
                      </View>
                    </View>
                  )}

                  {overlapWarning && (
                    <View style={styles.overlapBlockedBanner}>
                      <Text style={styles.overlapBlockedIcon}>🚫</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.overlapBlockedTitle}>
                          Voyage bloqué
                        </Text>
                        <Text style={styles.overlapBlockedText}>
                          {overlapWarning}
                        </Text>
                      </View>
                    </View>
                  )}

                  {codeInfo && (
                    <View
                      style={[
                        styles.inviteInfoCard,
                        alreadyJoined && styles.inviteInfoCardDisabled,
                      ]}
                    >
                      <Text style={styles.inviteInfoTitle}>
                        {alreadyJoined
                          ? "🔒 Voyage (accès limité)"
                          : "✈️ Voyage trouvé !"}
                      </Text>
                      <View style={styles.inviteInfoRow}>
                        <Text style={styles.inviteInfoLabel}>Destination</Text>
                        <Text style={styles.inviteInfoVal}>
                          {codeInfo.destination}
                        </Text>
                      </View>
                      <View style={styles.inviteInfoRow}>
                        <Text style={styles.inviteInfoLabel}>Départ</Text>
                        <Text style={styles.inviteInfoVal}>
                          {codeInfo.date_depart}
                        </Text>
                      </View>
                      <View style={styles.inviteInfoRow}>
                        <Text style={styles.inviteInfoLabel}>Retour</Text>
                        <Text style={styles.inviteInfoVal}>
                          {codeInfo.date_arrivee}
                        </Text>
                      </View>
                      <View style={styles.inviteInfoRow}>
                        <Text style={styles.inviteInfoLabel}>Durée</Text>
                        <Text style={styles.inviteInfoVal}>
                          {codeInfo.nuitees} nuit(s)
                        </Text>
                      </View>

                      {alreadyJoined ? (
                        <View style={styles.blockedMsgBox}>
                          <Text style={styles.blockedMsgText}>
                            ✅ Vos préférences ont été enregistrées pour ce
                            voyage.{"\n"}
                            Aucune action supplémentaire n'est requise.
                          </Text>
                        </View>
                      ) : (
                        <>
                          <View style={styles.infoOriginalBanner}>
                            <Text style={styles.infoOriginalIcon}>ℹ️</Text>
                            <Text style={styles.infoOriginalText}>
                              Ces informations sont celles définies par
                              l'organisateur du voyage.
                            </Text>
                          </View>
                          <View style={styles.notifBanner}>
                            <Text style={styles.notifBannerIcon}>🔔</Text>
                            <Text style={styles.notifBannerText}>
                              Le leader sera notifié par email et notification
                              push
                            </Text>
                          </View>

                          <TouchableOpacity
                            onPress={handleGoToQuestions}
                            activeOpacity={0.85}
                            disabled={notifying || !!overlapWarning}
                            style={[
                              styles.actionBtnWrapper,
                              {
                                marginTop: 14,
                                opacity: overlapWarning ? 0.35 : 1,
                              },
                            ]}
                          >
                            <LinearGradient
                              colors={["#16A34A", "#22C55E"]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={styles.actionBtn}
                            >
                              {notifying ? (
                                <ActivityIndicator size="small" color={WHITE} />
                              ) : (
                                <>
                                  <Text style={styles.actionBtnIcon}>✅</Text>
                                  <Text style={styles.actionBtnText}>
                                    Rejoindre ce voyage
                                  </Text>
                                </>
                              )}
                            </LinearGradient>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={handleModifierInfo}
                            activeOpacity={0.85}
                            disabled={notifying || !!overlapWarning}
                            style={[
                              styles.actionBtnWrapper,
                              {
                                marginTop: 10,
                                opacity: overlapWarning ? 0.35 : 1,
                              },
                            ]}
                          >
                            <LinearGradient
                              colors={["#EA580C", "#FB923C"]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={styles.actionBtn}
                            >
                              {notifying ? (
                                <ActivityIndicator size="small" color={WHITE} />
                              ) : (
                                <>
                                  <Text style={styles.actionBtnIcon}>✏️</Text>
                                  <Text style={styles.actionBtnText}>
                                    Modifier mes informations
                                  </Text>
                                </>
                              )}
                            </LinearGradient>
                          </TouchableOpacity>
                        </>
                      )}

                      <TouchableOpacity
                        onPress={handleOpenGroupChat}
                        activeOpacity={0.85}
                        disabled={notifying}
                        style={[styles.actionBtnWrapper, { marginTop: 10 }]}
                      >
                        <LinearGradient
                          colors={["#042A66", "#0A4DBF"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.actionBtn}
                        >
                          <Text style={styles.actionBtnIcon}>💬</Text>
                          <Text style={styles.actionBtnText}>Chat Groupe</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}

              <TouchableOpacity style={styles.modalClose} onPress={handleClose}>
                <Text style={styles.modalCloseText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, alignItems: "center", justifyContent: "center" },
  circle1: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(255,255,255,0.04)",
    top: -80,
    right: -80,
  },
  circle2: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.04)",
    bottom: 60,
    left: -60,
  },
  kav: { width: "100%", alignItems: "center", paddingHorizontal: 20 },
  branding: { alignItems: "center", marginBottom: 28 },
  logoRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  logo: { width: "100%", height: "100%" },
  brandName: {
    fontSize: 26,
    fontWeight: "800",
    color: WHITE,
    letterSpacing: 0.5,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif" }),
  },
  brandTagline: {
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
    marginTop: 4,
  },
  card: {
    width: "100%",
    backgroundColor: WHITE,
    borderRadius: 28,
    padding: 26,
    shadowColor: "#021B4E",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 16,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 14,
    padding: 4,
    marginBottom: 22,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: "center",
    borderRadius: 11,
  },
  tabActive: {
    backgroundColor: BLUE_PRIMARY,
    shadowColor: BLUE_PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  tabText: { fontSize: 14, fontWeight: "600", color: TEXT_MUTED },
  tabTextActive: { color: WHITE },
  cardTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: BLUE_DEEP,
    marginBottom: 4,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif" }),
  },
  cardSubtitle: { fontSize: 13, color: TEXT_MUTED, marginBottom: 20 },
  forgot: {
    color: BLUE_PRIMARY,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
    marginBottom: 20,
    marginTop: -4,
  },
  submitButton: {
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  submitText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  submitArrow: { color: "rgba(255,255,255,0.65)", fontSize: 18 },
  footerText: {
    marginTop: 18,
    textAlign: "center",
    fontSize: 14,
    color: TEXT_MUTED,
  },
  footerLink: { color: BLUE_PRIMARY, fontWeight: "700" },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(2,27,78,0.6)",
  },
  modalScroll: { flexGrow: 1, justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 26,
    paddingBottom: 40,
    alignItems: "center",
    shadowColor: "#021B4E",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 20,
  },
  modalAccent: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginTop: -32,
    marginBottom: 16,
    shadowColor: BLUE_PRIMARY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  modalAccentIcon: { fontSize: 26 },
  modalTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: BLUE_DEEP,
    marginBottom: 6,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif" }),
  },
  modalSubtitle: {
    fontSize: 14,
    color: TEXT_MUTED,
    marginBottom: 28,
    textAlign: "center",
  },
  modalBtnWrapper: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 14,
  },
  modalBtnGradient: {
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  modalBtnIcon: { color: WHITE, fontSize: 16, fontWeight: "700" },
  modalBtnText: { color: WHITE, fontSize: 16, fontWeight: "800" },
  modalBtnOutline: {
    width: "100%",
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 14,
  },
  modalBtnOutlineIcon: { fontSize: 16 },
  modalBtnOutlineText: {
    color: BLUE_PRIMARY,
    fontSize: 16,
    fontWeight: "700",
  },
  modalClose: { paddingVertical: 10, marginTop: 8 },
  modalCloseText: { color: TEXT_MUTED, fontSize: 14, fontWeight: "500" },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    marginBottom: 16,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#E5EEF5" },
  dividerLabel: {
    fontSize: 11,
    color: TEXT_MUTED,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  inviteLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  inviteLabel: { fontSize: 13, fontWeight: "700", color: BLUE_DEEP },
  inviteOptional: { fontSize: 11, color: TEXT_MUTED, fontStyle: "italic" },
  inviteInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
    paddingHorizontal: 14,
    width: "100%",
  },
  inviteInputValid: { borderColor: GREEN, backgroundColor: GREEN_PALE },
  inviteInputAlreadyJoined: {
    borderColor: "#D97706",
    backgroundColor: "#FEF3C7",
  },
  inviteInputInvalid: { borderColor: "#EF4444", backgroundColor: "#FEF2F2" },
  inviteInputChecking: {
    borderColor: BLUE_PRIMARY,
    backgroundColor: "#E8F0FE",
  },
  inviteInputIcon: { fontSize: 16, marginRight: 10 },
  inviteInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: "700",
    color: BLUE_DEEP,
    letterSpacing: 3,
  },
  inviteStatusIcon: { fontSize: 18, marginRight: 4 },
  inviteErrorText: {
    color: "#EF4444",
    fontSize: 12,
    marginTop: 5,
    alignSelf: "flex-start",
    marginLeft: 4,
  },
  inviteExpiredText: {
    color: "#D97706",
    fontSize: 12,
    marginTop: 5,
    alignSelf: "flex-start",
    marginLeft: 4,
    fontWeight: "600",
  },
  planCard: {
    marginTop: 12,
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BLUE_PALE,
    shadowColor: BLUE_PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  planCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  planCardHeaderIcon: { fontSize: 22 },
  planCardHeaderTitle: {
    color: WHITE,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    opacity: 0.8,
  },
  planCardHeaderSub: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  planCardBody: { backgroundColor: WHITE, padding: 14 },
  planInfoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  planInfoCell: {
    flex: 1,
    minWidth: "44%",
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },
  planInfoCellIcon: { fontSize: 16, marginBottom: 3 },
  planInfoCellLabel: {
    fontSize: 10,
    color: TEXT_MUTED,
    fontWeight: "600",
    marginBottom: 2,
  },
  planInfoCellVal: {
    fontSize: 12,
    color: BLUE_DEEP,
    fontWeight: "800",
    textAlign: "center",
  },
  planItineraryTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: BLUE_DEEP,
    marginBottom: 8,
  },
  planDayRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 7,
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 10,
    padding: 9,
    borderLeftWidth: 3,
    borderLeftColor: BLUE_PRIMARY,
  },
  planDayBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: BLUE_PRIMARY,
    justifyContent: "center",
    alignItems: "center",
  },
  planDayBadgeText: { color: WHITE, fontSize: 10, fontWeight: "900" },
  planDayTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: BLUE_DEEP,
    marginBottom: 2,
  },
  planDayDetail: { fontSize: 11, color: "#374151", marginTop: 1 },
  planMoreDays: {
    textAlign: "center",
    fontSize: 11,
    color: TEXT_MUTED,
    fontStyle: "italic",
    marginTop: 4,
  },
  alreadyJoinedBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderLeftWidth: 4,
    borderLeftColor: "#D97706",
    padding: 12,
    marginTop: 10,
    width: "100%",
  },
  alreadyJoinedIcon: { fontSize: 18, marginTop: 1 },
  alreadyJoinedTitle: {
    color: "#92400E",
    fontWeight: "800",
    fontSize: 13,
    marginBottom: 3,
  },
  alreadyJoinedText: {
    color: "#92400E",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  inviteInfoCardDisabled: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    borderLeftColor: "#9CA3AF",
    opacity: 0.85,
  },
  blockedMsgBox: {
    marginTop: 12,
    backgroundColor: "#F0FDF4",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    padding: 12,
  },
  blockedMsgText: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
    textAlign: "center",
  },
  overlapBlockedBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    borderLeftWidth: 4,
    borderLeftColor: "#EF4444",
    padding: 12,
    marginTop: 10,
    width: "100%",
  },
  overlapBlockedIcon: { fontSize: 18, marginTop: 1 },
  overlapBlockedTitle: {
    color: "#991B1B",
    fontWeight: "800",
    fontSize: 13,
    marginBottom: 3,
  },
  overlapBlockedText: {
    color: "#991B1B",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
  },
  inviteInfoCard: {
    marginTop: 10,
    backgroundColor: GREEN_PALE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderLeftWidth: 3,
    borderLeftColor: GREEN,
    padding: 14,
    width: "100%",
  },
  inviteInfoTitle: {
    color: GREEN,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  inviteInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  inviteInfoLabel: { color: "#166534", fontSize: 12 },
  inviteInfoVal: { color: "#14532D", fontSize: 12, fontWeight: "700" },
  infoOriginalBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    padding: 10,
    marginTop: 10,
  },
  infoOriginalIcon: { fontSize: 13 },
  infoOriginalText: {
    flex: 1,
    fontSize: 11,
    color: "#1E40AF",
    fontWeight: "600",
    lineHeight: 16,
  },
  notifBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    padding: 10,
    marginTop: 10,
  },
  notifBannerIcon: { fontSize: 14 },
  notifBannerText: {
    flex: 1,
    fontSize: 11,
    color: "#1E40AF",
    fontWeight: "600",
    lineHeight: 16,
  },
  actionBtnWrapper: { width: "100%", borderRadius: 12, overflow: "hidden" },
  actionBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionBtnIcon: { fontSize: 16 },
  actionBtnText: { color: WHITE, fontSize: 15, fontWeight: "800" },
});

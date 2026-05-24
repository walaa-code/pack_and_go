import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
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
import { Provider } from "react-native-paper";
import { useTravelData } from "../../context/TravelContext";

const BLUE_DEEP = "#042A66";
const BLUE_PRIMARY = "#0A4DBF";
const BLUE_PALE = "#D6E4FF";
const BLUE_ULTRA_PALE = "#EEF4FF";
const WHITE = "#FFFFFF";
const TEXT_MUTED = "#7A90B4";
const GREEN = "#16A34A";
const GREEN_PALE = "#DCFCE7";

type RootStackParamList = {
  questioninvi: undefined;
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
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  editable = true,
}: {
  label: string;
  icon: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  editable?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrapper}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          focused && styles.inputRowFocused,
          !editable && styles.inputRowDisabled,
        ]}
      >
        <Text style={styles.fieldIcon}>{icon}</Text>
        <TextInput
          style={styles.fieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? ""}
          placeholderTextColor="#A8BDD8"
          keyboardType={keyboardType ?? "default"}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {editable && <Text style={styles.editIcon}>✎</Text>}
      </View>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────
   MENU SOMBRE — identique à formulaire.tsx (sans group-chat)
───────────────────────────────────────────────────────────── */
function AppMenuDark() {
  const [open, setOpen] = React.useState(false);

  const handleChatbot = () => {
    setOpen(false);
    router.push("/chatbot");
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
      color: "#0A4DBF",
      onPress: handleChatbot,
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

export default function ModifierInfoScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<any>();
  const params = route.params ?? {};

  // ✅ Récupère setTravelData depuis le contexte
  const { setTravelData } = useTravelData();

  const [destination, setDestination] = useState(params.destination ?? "");
  const [dateDepart, setDateDepart] = useState(params.date_depart ?? "");
  const [dateArrivee, setDateArrivee] = useState(params.date_arrivee ?? "");
  const [nuitees, setNuitees] = useState(params.nuitees ?? "");
  const [guestEmail, setGuestEmail] = useState(params.guest_email ?? "");
  const [saving, setSaving] = useState(false);

  const recalcNuitees = (depart: string, arrivee: string) => {
    try {
      const d1 = new Date(depart);
      const d2 = new Date(arrivee);
      const diff = Math.round(
        (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (!isNaN(diff) && diff >= 0) setNuitees(String(diff));
    } catch {}
  };

  const handleDepartChange = (v: string) => {
    setDateDepart(v);
    recalcNuitees(v, dateArrivee);
  };

  const handleArriveeChange = (v: string) => {
    setDateArrivee(v);
    recalcNuitees(dateDepart, v);
  };

  const handleSave = async () => {
    if (!destination.trim()) {
      Alert.alert("Erreur", "La destination est obligatoire");
      return;
    }

    setSaving(true);

    try {
      // Étape 1 : mettre à jour les infos du voyage dans la table invitations
      await fetch("${API}/update-invite-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invite_code: params.invite_code,
          guest_email: guestEmail,
          destination,
          date_depart: dateDepart,
          date_arrivee: dateArrivee,
          nuitees: Number(nuitees),
        }),
      });

      // ✅ Étape 2 : mettre à jour group_preferences (destination/dates) en BD
      // Les préférences de confort (hôtel, activités…) ne sont PAS touchées.
      await fetch("${API}/update-group-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invite_code: params.invite_code,
          guest_email: guestEmail,
          destination,
          date_depart: dateDepart,
          date_arrivee: dateArrivee,
          nuitees: Number(nuitees),
        }),
      });

      // Étape 3 : notifier le leader par email
      await fetch("${API}/notify-leader", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: params.invite_code,
          guest_email: guestEmail,
          action: "modifie",
        }),
      });

      setTravelData({
        ville: destination,
        dateDebut: dateDepart ? new Date(dateDepart) : null,
        dateFin: dateArrivee ? new Date(dateArrivee) : null,
      });
    } catch (e) {
      console.warn("handleSave error:", e);
    } finally {
      setSaving(false);
    }

    // Navigation vers le questionnaire invité
    navigation.navigate("questioninvi");
  };

  return (
    <Provider>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, backgroundColor: "#F0F5FC" }}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Header gradient ── */}
          <LinearGradient colors={["#042A66", "#0A4DBF"]} style={styles.header}>
            <View style={styles.menuWrapper}>
              <AppMenuDark />
            </View>

            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Text style={styles.backBtnText}>← Retour</Text>
            </TouchableOpacity>

            <View style={styles.headerContent}>
              <View style={styles.headerIcon}>
                <Text style={styles.headerIconText}>✏️</Text>
              </View>
              <Text style={styles.headerTitle}>Modifier mes informations</Text>
              <Text style={styles.headerSubtitle}>
                Mettez à jour les détails de votre voyage
              </Text>
            </View>
          </LinearGradient>

          {/* ── Carte récap ── */}
          <View style={styles.recapCard}>
            <Text style={styles.recapTitle}>✈️ Voyage actuel</Text>
            <View style={styles.recapRow}>
              <Text style={styles.recapLabel}>🗺️ Destination</Text>
              <Text style={styles.recapVal}>{destination || "—"}</Text>
            </View>
            <View style={styles.recapRow}>
              <Text style={styles.recapLabel}>📅 Départ</Text>
              <Text style={styles.recapVal}>{dateDepart || "—"}</Text>
            </View>
            <View style={styles.recapRow}>
              <Text style={styles.recapLabel}>📅 Retour</Text>
              <Text style={styles.recapVal}>{dateArrivee || "—"}</Text>
            </View>
            <View style={[styles.recapRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.recapLabel}>🌙 Durée</Text>
              <Text style={styles.recapVal}>{nuitees || "0"} nuit(s)</Text>
            </View>

            <View style={styles.notifBanner}>
              <Text style={styles.notifIcon}>🔔</Text>
              <Text style={styles.notifText}>
                Le leader sera notifié par email après modification
              </Text>
            </View>
          </View>

          {/* ── Formulaire éditable ── */}
          <View style={styles.formCard}>
            <Text style={styles.formCardTitle}>Modifier les informations</Text>

            <FloatingInput
              label="Destination"
              icon="🗺️"
              value={destination}
              onChangeText={setDestination}
              placeholder="Ex : Paris, Tunis..."
            />
            <FloatingInput
              label="Date de départ"
              icon="📅"
              value={dateDepart}
              onChangeText={handleDepartChange}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
            />
            <FloatingInput
              label="Date de retour"
              icon="📅"
              value={dateArrivee}
              onChangeText={handleArriveeChange}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
            />

            {/* Nuits auto */}
            <View style={styles.fieldWrapper}>
              <Text style={styles.fieldLabel}>🌙 Nombre de nuits</Text>
              <View style={[styles.inputRow, styles.inputRowDisabled]}>
                <Text style={styles.fieldIcon}>🌙</Text>
                <Text style={styles.autoValue}>
                  {nuitees ? `${nuitees} nuit(s)` : "Calculé automatiquement"}
                </Text>
                <View style={styles.autoBadge}>
                  <Text style={styles.autoBadgeText}>Auto</Text>
                </View>
              </View>
            </View>

            <FloatingInput
              label="Votre email"
              icon="✉️"
              value={guestEmail}
              onChangeText={setGuestEmail}
              placeholder="email@exemple.com"
              keyboardType="email-address"
            />
          </View>

          {/* ── Bouton Enregistrer ── */}
          <TouchableOpacity
            onPress={handleSave}
            activeOpacity={0.85}
            style={styles.saveWrapper}
            disabled={saving}
          >
            <LinearGradient
              colors={saving ? ["#94A3B8", "#94A3B8"] : ["#0A4DBF", "#1a6aff"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveBtn}
            >
              <Text style={styles.saveBtnIcon}>💾</Text>
              <Text style={styles.saveBtnText}>
                {saving ? "Enregistrement..." : "Enregistrer et continuer"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* ── Bouton Annuler ── */}
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelBtnText}>Annuler</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Provider>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 48, backgroundColor: "#F0F5FC" },
  menuWrapper: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    right: 15,
    zIndex: 9999,
  },
  menuBtn: {
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
  },
  menuPopup: {
    backgroundColor: "#0C1829",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1A2B45",
    marginTop: 35,
  },
  menuText: { color: "white", fontSize: 14 },
  header: {
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 32,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    marginBottom: 20,
  },
  backBtn: {
    alignSelf: "flex-start",
    marginBottom: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  backBtnText: { color: WHITE, fontSize: 13, fontWeight: "600" },
  headerContent: { alignItems: "center" },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
  },
  headerIconText: { fontSize: 28 },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: WHITE,
    marginBottom: 6,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif" }),
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
  },
  recapCard: {
    marginHorizontal: 16,
    backgroundColor: GREEN_PALE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderLeftWidth: 4,
    borderLeftColor: GREEN,
    padding: 16,
    marginBottom: 16,
  },
  recapTitle: {
    color: GREEN,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  recapRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#BBF7D0",
  },
  recapLabel: { color: "#166534", fontSize: 13 },
  recapVal: { color: "#14532D", fontSize: 13, fontWeight: "700" },
  notifBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    padding: 10,
    marginTop: 14,
  },
  notifIcon: { fontSize: 14 },
  notifText: {
    flex: 1,
    fontSize: 11,
    color: "#1E40AF",
    fontWeight: "600",
    lineHeight: 16,
  },
  formCard: {
    marginHorizontal: 16,
    backgroundColor: WHITE,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: BLUE_PRIMARY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
    borderWidth: 1,
    borderColor: "rgba(10,77,191,0.06)",
  },
  formCardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: BLUE_DEEP,
    marginBottom: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF4FF",
  },
  fieldWrapper: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: TEXT_MUTED,
    marginBottom: 7,
    letterSpacing: 0.3,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BLUE_ULTRA_PALE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
    paddingHorizontal: 14,
    gap: 10,
  },
  inputRowFocused: { borderColor: BLUE_PRIMARY, backgroundColor: "#E8F0FE" },
  inputRowDisabled: { backgroundColor: "#F5F7FA", borderColor: "#E2E8F0" },
  fieldIcon: { fontSize: 16 },
  fieldInput: { flex: 1, paddingVertical: 13, fontSize: 15, color: BLUE_DEEP },
  editIcon: { fontSize: 14, color: TEXT_MUTED },
  autoValue: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 14,
    color: TEXT_MUTED,
    fontStyle: "italic",
  },
  autoBadge: {
    backgroundColor: BLUE_PALE,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  autoBadgeText: { fontSize: 10, color: BLUE_PRIMARY, fontWeight: "700" },
  saveWrapper: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
  },
  saveBtn: {
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  saveBtnIcon: { fontSize: 18 },
  saveBtnText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  cancelBtn: {
    marginHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: BLUE_PALE,
  },
  cancelBtnText: { color: TEXT_MUTED, fontSize: 15, fontWeight: "600" },
});

/* ─────────────────────────────────────────────────────────────
   STYLES DU MENU SOMBRE (AppMenuDark)
───────────────────────────────────────────────────────────── */
const menuStyles = StyleSheet.create({
  wrapper: {
    position: "relative",
  },
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

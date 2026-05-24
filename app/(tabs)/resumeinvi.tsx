import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Platform,
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

/* ─────────────────────────────────────────────────────────────
   MENU DARK — identique à formulaire.tsx (sans groupe voyage)
───────────────────────────────────────────────────────────── */
function AppMenuDark() {
  const [open, setOpen] = useState(false);

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
      color: BLUE_PRIMARY,
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
          color={BLUE_DEEP}
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
                      name={item.icon}
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
    </View>
  );
}

const menuStyles = StyleSheet.create({
  wrapper: { position: "relative" },
  trigger: {
    padding: 8,
    backgroundColor: "rgba(10,77,191,0.08)",
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

// ─── Composant principal ──────────────────────────────────────────────────────
export default function ResumeInviScreen() {
  const { travelData } = useTravelData();

  const {
    ville,
    hotelType,
    hotelLocation,
    activityTypes,
    cafeLevels,
    ageRange,
    inviteCode,
  } = travelData;

  const voyageType = (travelData as any).voyageType || "";
  const budget = (travelData as any).budget || null;
  const hotelName = (travelData as any).hotel || "";
  const cafeName = (travelData as any).cafe || "";

  // ✅ Les dates sont lues depuis TravelContext — mises à jour par modifierinfo.tsx
  const dateDepart = (travelData as any).dateDebut
    ? formatDate(new Date((travelData as any).dateDebut))
    : "";
  const dateRetour = (travelData as any).dateFin
    ? formatDate(new Date((travelData as any).dateFin))
    : "";

  // ✅ La destination est lue depuis TravelContext — mise à jour par modifierinfo.tsx
  const villeAffichee = ville || "";

  const sections = [
    {
      title: "📍 Destination & Dates",
      items: [
        { label: "Destination", value: villeAffichee, icon: "📍" },
        { label: "Départ", value: dateDepart, icon: "📅" },
        { label: "Retour", value: dateRetour, icon: "📅" },
        { label: "Code voyage", value: inviteCode || "—", icon: "🔑" },
      ],
    },
    {
      title: "🎂 Profil du voyageur",
      items: [{ label: "Tranche d'âge", value: ageRange || "", icon: "🎂" }],
    },
    {
      title: "🏨 Hébergement",
      items: [
        { label: "Type d'hôtel", value: hotelType || "", icon: "🏨" },
        { label: "Localisation", value: hotelLocation || "", icon: "🌍" },
        { label: "Hôtel proposé", value: hotelName, icon: "🏠" },
      ],
    },
    {
      title: "🎯 Activités & Style",
      items: [
        {
          label: "Activités préférées",
          value: Array.isArray(activityTypes)
            ? activityTypes.join(", ")
            : activityTypes || "",
          icon: "🎯",
        },
        { label: "Voyage multi-villes", value: voyageType, icon: "✈️" },
      ],
    },
    {
      title: "☕ Restauration & Budget",
      items: [
        {
          label: "Types de café",
          value: Array.isArray(cafeLevels)
            ? cafeLevels.join(", ")
            : cafeLevels || "",
          icon: "☕",
        },
        { label: "Café proposé", value: cafeName, icon: "🫖" },
        {
          label: "Budget total",
          value: budget ? `${budget} DT` : "",
          icon: "💰",
        },
      ],
    },
  ];

  const filteredSections = sections
    .map((s) => ({ ...s, items: s.items.filter((i) => i.value) }))
    .filter((s) => s.items.length > 0);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.menuContainer}>
            <AppMenuDark />
          </View>
          <Image
            source={require("../../assets/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Résumé de mes préférences</Text>
          <Text style={styles.subtitle}>
            Vos choix enregistrés pour ce voyage
          </Text>
        </View>

        {/* ── Bannière code voyage ── */}
        {inviteCode ? (
          <View style={styles.codeBanner}>
            <Text style={styles.codeBannerLabel}>🔑 Code voyage</Text>
            <Text style={styles.codeBannerValue}>{inviteCode}</Text>
            <Text style={styles.codeBannerHint}>
              Partagez ce code avec le groupe
            </Text>
          </View>
        ) : null}

        {/* ── Label section ── */}
        <View style={styles.sectionLabelRow}>
          <View
            style={[styles.sectionDot, { backgroundColor: BLUE_PRIMARY }]}
          />
          <Text style={styles.sectionLabelText}>
            🧳 Vos préférences (invité)
          </Text>
        </View>

        {/* ── Sections ── */}
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

        {/* ── Actions ── */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>← Modifier</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.replace("/promotion")}
            activeOpacity={0.85}
            style={{ flex: 2 }}
          >
            <LinearGradient
              colors={[BLUE_PRIMARY, BLUE_LIGHT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.confirmButton}
            >
              <Text style={styles.confirmButtonText}>Terminer ✓</Text>
              <MaterialCommunityIcons
                name="check-circle"
                size={20}
                color={WHITE}
              />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Vos préférences ont été transmises au leader du groupe.
        </Text>
      </ScrollView>
    </>
  );
}

function formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { paddingBottom: 40 },
  header: {
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 20,
    backgroundColor: CARD_BG,
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
  menuContainer: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 24,
    right: 16,
    zIndex: 99,
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
  footer: {
    fontSize: 11,
    color: TEXT_MUTED,
    textAlign: "center",
    marginTop: 24,
    paddingHorizontal: 20,
  },
});

import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ─── Variables d'environnement ────────────────────────────────────────────────
const API_BASE_URL = "http://192.168.1.8:5000";

type RootStackParamList = {
  login: undefined;
  sign: undefined;
};

// ─────────────────────────────────────────────────────────────────────────────
// FloatingInput
// ─────────────────────────────────────────────────────────────────────────────
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
  editable = true,
}: any) {
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        inputStyles.wrapper,
        focused && inputStyles.wrapperFocused,
        !editable && inputStyles.wrapperDisabled,
      ]}
    >
      <Text style={inputStyles.icon}>{icon}</Text>
      <TextInput
        style={inputStyles.input}
        placeholder={placeholder}
        placeholderTextColor="#A8BDD8"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? "sentences"}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        editable={editable}
      />
      {!editable && <Text style={inputStyles.lock}>🔐</Text>}
    </View>
  );
}

const inputStyles = StyleSheet.create({
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
  wrapperDisabled: { opacity: 0.7, backgroundColor: "#F5F8FF" },
  icon: { fontSize: 16, marginRight: 10, color: "#0A4DBF" },
  input: { flex: 1, paddingVertical: 14, fontSize: 15, color: "#042A66" },
  lock: { fontSize: 12 },
});

const WHITE = "#FFFFFF";
const TEXT_MUTED = "#7A90B4";

// ─────────────────────────────────────────────────────────────────────────────
// SignupScreen
// ─────────────────────────────────────────────────────────────────────────────
export default function SignupScreen() {
  const [activeTab, setActiveTab] = useState<"login" | "signup">("signup");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  // États pour afficher/masquer les mots de passe
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // ── Inscription classique ───────────────────────────────────────────────────
  const handleSignup = async () => {
    if (!fullName || !email || !phone || !password || !confirmPassword) {
      Alert.alert("Erreur", "Veuillez remplir tous les champs");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert("Erreur", "Adresse e-mail invalide");
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
        "Le mot de passe doit contenir au moins 1 majuscule",
      );
      return;
    }
    if (!/[0-9]/.test(password)) {
      Alert.alert("Erreur", "Le mot de passe doit contenir au moins 1 chiffre");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Erreur", "Les mots de passe ne correspondent pas");
      return;
    }
    if (!agreeToTerms) {
      Alert.alert("Erreur", "Veuillez accepter les termes et conditions");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, phone, password }),
      });
      const data = await response.json();

      if (response.status === 201) {
        Alert.alert(
          "Succès 🎉",
          data.message || "Inscription réussie !",
          [
            {
              text: "Se connecter",
              style: "default",
              onPress: () => navigation.navigate("login"),
            },
          ],
          { cancelable: false },
        );
      } else if (response.status === 409) {
        Alert.alert("Compte existant", data.message, [
          { text: "Se connecter", onPress: () => navigation.navigate("login") },
          { text: "Annuler", style: "cancel" },
        ]);
      } else {
        Alert.alert("Erreur", data.message || "Inscription échouée");
      }
    } catch (_e) {
      Alert.alert(
        "Erreur réseau",
        `Impossible de joindre ${API_BASE_URL}.\n\n` +
          "• Vérifiez que Flask tourne\n" +
          "• Utilisez votre IP LAN (pas 127.0.0.1) dans .env\n" +
          "• Téléphone et PC sur le même Wi-Fi",
      );
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <LinearGradient
      colors={["#021B4E", "#042A66", "#0A4DBF"]}
      style={styles.bg}
    >
      <View style={styles.circle1} />
      <View style={styles.circle2} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, width: "100%" }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Branding */}
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

          {/* Card */}
          <View style={styles.card}>
            {/* Tabs */}
            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, activeTab === "login" && styles.tabActive]}
                onPress={() => {
                  setActiveTab("login");
                  navigation.navigate("login");
                }}
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
                onPress={() => setActiveTab("signup")}
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

            <Text style={styles.cardTitle}>Créer un compte</Text>
            <Text style={styles.cardSubtitle}>
              Rejoignez-nous pour planifier votre voyage
            </Text>

            {/* Form */}
            <FloatingInput
              placeholder="Nom complet"
              value={fullName}
              onChangeText={setFullName}
              icon="👤"
              returnKeyType="next"
            />
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
              placeholder="Numéro de téléphone"
              value={phone}
              onChangeText={setPhone}
              icon="📱"
              keyboardType="phone-pad"
              returnKeyType="next"
            />

            {/* Mot de passe avec œil */}
            <View style={inputStyles.wrapper}>
              <Text style={inputStyles.icon}>🔒</Text>
              <TextInput
                style={inputStyles.input}
                placeholder="Mot de passe"
                placeholderTextColor="#A8BDD8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="next"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={{ padding: 4 }}
              >
                <Text style={{ fontSize: 16 }}>
                  {showPassword ? "🐵" : "🙈"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Confirmation mot de passe avec œil */}
            <View style={inputStyles.wrapper}>
              <Text style={inputStyles.icon}>🔑</Text>
              <TextInput
                style={inputStyles.input}
                placeholder="Confirmer le mot de passe"
                placeholderTextColor="#A8BDD8"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                returnKeyType="done"
                onSubmitEditing={handleSignup}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{ padding: 4 }}
              >
                <Text style={{ fontSize: 16 }}>
                  {showConfirmPassword ? "🐵" : "🙈"}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.passwordHint}>
              🔐 au moins 6 caractères, au moins 1 majuscule et 1 chiffre
            </Text>

            {/* Terms */}
            <TouchableOpacity
              style={styles.termsRow}
              onPress={() => setAgreeToTerms(!agreeToTerms)}
              activeOpacity={0.7}
            >
              <View
                style={[styles.checkbox, agreeToTerms && styles.checkboxActive]}
              >
                {agreeToTerms && <Text style={styles.checkMark}>✓</Text>}
              </View>
              <Text style={styles.termsText}>
                J'accepte les{" "}
                <Text
                  style={styles.termsLink}
                  onPress={() =>
                    Alert.alert("Termes et Conditions", "Contenu des termes…")
                  }
                >
                  Termes et Conditions
                </Text>
              </Text>
            </TouchableOpacity>

            {/* Submit */}
            <TouchableOpacity
              onPress={handleSignup}
              activeOpacity={0.85}
              disabled={loading}
            >
              <LinearGradient
                colors={["#0A4DBF", "#1a6aff"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.submitButton, loading && { opacity: 0.7 }]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={WHITE} />
                ) : (
                  <>
                    <Text style={styles.submitText}>Créer mon compte</Text>
                    <Text style={styles.submitArrow}>→</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.footerText}>
              Déjà inscrit ?{" "}
              <Text
                style={styles.footerLink}
                onPress={() => navigation.navigate("login")}
              >
                Se connecter
              </Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  bg: { flex: 1, alignItems: "center" },
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
  scroll: {
    alignItems: "center",
    paddingVertical: 50,
    paddingHorizontal: 20,
    width: "100%",
  },

  branding: { alignItems: "center", marginBottom: 28 },
  logoRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    padding: 8,
  },
  logo: { width: "100%", height: "100%" },
  brandName: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
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
    backgroundColor: "#FFFFFF",
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
    backgroundColor: "#EEF4FF",
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
    backgroundColor: "#0A4DBF",
    shadowColor: "#0A4DBF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  tabText: { fontSize: 14, fontWeight: "600", color: TEXT_MUTED },
  tabTextActive: { color: "#FFFFFF" },

  cardTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#042A66",
    marginBottom: 4,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif" }),
  },
  cardSubtitle: { fontSize: 13, color: TEXT_MUTED, marginBottom: 20 },

  passwordHint: {
    fontSize: 11,
    color: TEXT_MUTED,
    marginTop: -6,
    marginBottom: 12,
    paddingHorizontal: 4,
  },

  termsRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#D6E4FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    backgroundColor: "#EEF4FF",
  },
  checkboxActive: { backgroundColor: "#0A4DBF", borderColor: "#0A4DBF" },
  checkMark: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  termsText: { fontSize: 13, color: TEXT_MUTED, flex: 1, lineHeight: 18 },
  termsLink: { color: "#0A4DBF", fontWeight: "700" },

  submitButton: {
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  submitText: {
    color: "#FFFFFF",
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
  footerLink: { color: "#0A4DBF", fontWeight: "700" },
});

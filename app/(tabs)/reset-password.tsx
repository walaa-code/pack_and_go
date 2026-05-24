import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const API_BASE_URL = "http://192.168.1.8:5000";

export default function ResetPasswordScreen() {
  const [step, setStep] = useState<"email" | "verification" | "newPassword">(
    "email",
  );
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const router = useRouter();

  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [step]);

  // ── Étape 1 : Envoi de l'email ──────────────────────────────────────────────
  const handleEmailSubmit = async () => {
    if (!email) {
      Alert.alert("Erreur", "Veuillez entrer votre adresse e-mail");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert("Erreur", "Adresse e-mail invalide");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });
      const data = await response.json();

      if (response.ok) {
        Alert.alert("✅ Succès", "Code de vérification envoyé par email");
        setStep("verification");
      } else {
        Alert.alert("Erreur", data.message || data.error || "Email non trouvé");
      }
    } catch (error) {
      Alert.alert(
        "Erreur réseau",
        `Impossible de contacter le serveur.\n\n` +
          "• Vérifiez que Flask tourne sur votre PC\n" +
          "• Remplacez l'IP dans le code par celle de votre PC\n" +
          "• Téléphone et PC doivent être sur le même Wi-Fi\n\n" +
          `IP actuelle : ${API_BASE_URL}`,
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Étape 2 : Vérification du code OTP ─────────────────────────────────────
  const handleVerificationSubmit = async () => {
    if (!verificationCode) {
      Alert.alert("Erreur", "Veuillez entrer le code de vérification");
      return;
    }
    if (verificationCode.length !== 6) {
      Alert.alert("Erreur", "Le code doit contenir 6 chiffres");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          otp: verificationCode,
        }),
      });
      const data = await response.json();

      if (response.ok) {
        Alert.alert(
          "✅ Code vérifié",
          "Vous pouvez maintenant choisir un nouveau mot de passe",
        );
        setStep("newPassword");
      } else {
        Alert.alert(
          "Erreur",
          data.message || data.error || "Code incorrect ou expiré",
        );
      }
    } catch (error) {
      Alert.alert("Erreur réseau", "Impossible de contacter le serveur");
    } finally {
      setLoading(false);
    }
  };

  // ── Étape 3 : Nouveau mot de passe ─────────────────────────────────────────
  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert("Erreur", "Veuillez remplir tous les champs");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert(
        "Erreur",
        "Le mot de passe doit contenir au moins 6 caractères",
      );
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      Alert.alert(
        "Erreur",
        "Le mot de passe doit contenir au moins 1 majuscule",
      );
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      Alert.alert("Erreur", "Le mot de passe doit contenir au moins 1 chiffre");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Erreur", "Les mots de passe ne correspondent pas");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/update-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          otp: verificationCode,
          new_password: newPassword,
        }),
      });
      const data = await response.json();

      if (response.ok) {
        Alert.alert(
          "Succès 🎉",
          "Votre mot de passe a été changé avec succès !",
          [
            {
              text: "Se connecter",
              onPress: () => router.replace("/login"),
            },
          ],
          { cancelable: false },
        );
      } else {
        Alert.alert(
          "Erreur",
          data.message || data.error || "Réinitialisation échouée",
        );
      }
    } catch (error) {
      Alert.alert("Erreur réseau", "Impossible de contacter le serveur");
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
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Réinitialiser le mot de passe</Text>

        {/* Progress steps */}
        <View style={styles.stepsRow}>
          {(["email", "verification", "newPassword"] as const).map((s, i) => (
            <View key={s} style={styles.stepItem}>
              <View
                style={[
                  styles.stepDot,
                  step === s && styles.stepDotActive,
                  (step === "verification" && i === 0) ||
                  (step === "newPassword" && i <= 1)
                    ? styles.stepDotDone
                    : null,
                ]}
              >
                <Text style={styles.stepDotText}>{i + 1}</Text>
              </View>
              {i < 2 && <View style={styles.stepLine} />}
            </View>
          ))}
        </View>

        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          {/* ── Étape 1 : Email ── */}
          {step === "email" && (
            <View>
              <Text style={styles.stepTitle}>Entrez votre e-mail</Text>
              <Text style={styles.stepDesc}>
                Nous enverrons un code de vérification à votre adresse e-mail.
              </Text>
              <Text style={styles.label}>Adresse e-mail</Text>
              <TextInput
                placeholder="exemple@domaine.com"
                placeholderTextColor="#A8BDD8"
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="done"
                onSubmitEditing={handleEmailSubmit}
              />
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleEmailSubmit}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.buttonText}>Envoyer le code →</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* ── Étape 2 : Code OTP ── */}
          {step === "verification" && (
            <View>
              <Text style={styles.stepTitle}>Vérification du code</Text>
              <Text style={styles.stepDesc}>
                Un code à 6 chiffres a été envoyé à{" "}
                <Text style={{ fontWeight: "700", color: "#042A66" }}>
                  {email}
                </Text>
              </Text>
              <Text style={styles.label}>Code de vérification</Text>
              <TextInput
                placeholder="000000"
                placeholderTextColor="#A8BDD8"
                style={[styles.input, styles.inputCode]}
                value={verificationCode}
                onChangeText={setVerificationCode}
                keyboardType="numeric"
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={handleVerificationSubmit}
              />
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleVerificationSubmit}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.buttonText}>Vérifier →</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setStep("email");
                  setVerificationCode("");
                }}
                style={styles.backBtn}
              >
                <Text style={styles.backLink}>↺ Changer d'adresse e-mail</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleEmailSubmit}
                style={styles.backBtn}
              >
                <Text style={styles.resendLink}>Renvoyer le code</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Étape 3 : Nouveau mot de passe ── */}
          {step === "newPassword" && (
            <View>
              <Text style={styles.stepTitle}>Nouveau mot de passe</Text>
              <Text style={styles.stepDesc}>
                Choisissez un mot de passe sécurisé.
              </Text>
              <Text style={styles.label}>Nouveau mot de passe</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  placeholder="••••••••"
                  placeholderTextColor="#A8BDD8"
                  secureTextEntry={!showNewPassword}
                  style={styles.passwordInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  returnKeyType="next"
                />
                <TouchableOpacity
                  onPress={() => setShowNewPassword(!showNewPassword)}
                  style={styles.eyeBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.eyeIcon}>
                    {showNewPassword ? "🐵" : "🙈"}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.label}>Confirmer le mot de passe</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  placeholder="••••••••"
                  placeholderTextColor="#A8BDD8"
                  secureTextEntry={!showConfirmPassword}
                  style={styles.passwordInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleResetPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.eyeIcon}>
                    {showConfirmPassword ? "🐵" : "🙈"}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.passwordHint}>
                🔐 au moins 6 caractères, 1 majuscule et 1 chiffre
              </Text>
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleResetPassword}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.buttonText}>Réinitialiser →</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setStep("verification");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                style={styles.backBtn}
              >
                <Text style={styles.backLink}>↺ Revenir</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    maxWidth: 450,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 28,
    elevation: 16,
    shadowColor: "#021B4E",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 20,
    color: "#042A66",
  },
  stepsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  stepItem: { flexDirection: "row", alignItems: "center" },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EEF4FF",
    borderWidth: 2,
    borderColor: "#D6E4FF",
    justifyContent: "center",
    alignItems: "center",
  },
  stepDotActive: { backgroundColor: "#0A4DBF", borderColor: "#0A4DBF" },
  stepDotDone: { backgroundColor: "#22c55e", borderColor: "#22c55e" },
  stepDotText: { fontSize: 11, fontWeight: "700", color: "#7A90B4" },
  stepLine: {
    width: 32,
    height: 2,
    backgroundColor: "#D6E4FF",
    marginHorizontal: 4,
  },
  content: { width: "100%" },
  stepTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#042A66",
    marginBottom: 6,
  },
  stepDesc: {
    fontSize: 13,
    color: "#7A90B4",
    marginBottom: 20,
    lineHeight: 18,
  },
  label: {
    color: "#0A4DBF",
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#EEF4FF",
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: "#D6E4FF",
    fontSize: 16,
    color: "#042A66",
  },
  inputCode: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 10,
    textAlign: "center",
  },
  passwordHint: {
    fontSize: 11,
    color: "#7A90B4",
    marginTop: -6,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  button: {
    backgroundColor: "#0A4DBF",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  backBtn: { marginTop: 14, alignItems: "center" },
  backLink: {
    color: "#7A90B4",
    fontSize: 13,
    fontWeight: "600",
  },
  resendLink: {
    color: "#0A4DBF",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6,
  },
  passwordWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF4FF",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#D6E4FF",
    marginBottom: 14,
    paddingHorizontal: 14,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 16,
    color: "#042A66",
  },
  eyeBtn: { padding: 4 },
  eyeIcon: { fontSize: 16 },
});

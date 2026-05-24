import axios from "axios";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Message = {
  id: string;
  text: string;
  sender: "user" | "bot";
};

const SERVER_IP = "10.48.255.197";
const BACKEND_URL = `http://${SERVER_IP}:3000/chat`;

// Message de bienvenue affiché au démarrage
const WELCOME_MESSAGE: Message = {
  id: "welcome",
  text:
    "👋 Bonjour ! Je suis l'assistant Pack & Go.\n\n" +
    "Je peux t'aider sur :\n" +
    "• 🔑 Modifier / réinitialiser le mot de passe\n" +
    "• 📋 Remplir le formulaire de voyage\n" +
    "• ❓ Questions de préférences (hôtel, activités, budget...)\n" +
    "• 👥 Invitations & rejoindre un voyage\n" +
    "• 💬 Chat de groupe\n" +
    "• 🗺️ Plan de voyage (Gratuit & Premium)\n" +
    "• 📂 Anciens plans\n" +
    "• 🏙️ Promotion & découverte de lieux\n" +
    "• ⭐ Différence entre plan Gratuit et Premium\n\n" +
    "Pose ta question !",
  sender: "bot",
};

const QUICK_SUGGESTIONS = [
  "Comment rejoindre un voyage ?",
  "Gratuit vs Premium ?",
  "Comment remplir le formulaire ?",
  "Comment modifier mon mot de passe ?",
  "Comment inviter des amis ?",
  "Comment utiliser le chat de groupe ?",
  "Voir mes anciens plans ?",
];

export default function ChatbotScreen() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const router = useRouter();

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);

    const userId = Date.now().toString();
    const botId = userId + "_bot";

    // Exclure le message de bienvenue et les placeholders de l'historique envoyé
    const history = messages.filter(
      (m) => m.id !== "welcome" && m.text !== "🤖 ...",
    );

    const userMessage: Message = { id: userId, text, sender: "user" };
    const botPlaceholder: Message = {
      id: botId,
      text: "🤖 ...",
      sender: "bot",
    };

    setMessages((prev) => [...prev, userMessage, botPlaceholder]);

    const payload = [...history, userMessage].map((m) => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.text,
    }));

    try {
      const response = await axios.post(
        BACKEND_URL,
        { messages: payload },
        { timeout: 25000 },
      );
      const reply = response?.data?.message || "❌ Aucune réponse reçue";
      setMessages((prev) =>
        prev.map((msg) => (msg.id === botId ? { ...msg, text: reply } : msg)),
      );
    } catch (error: any) {
      console.log("ERROR:", error?.message);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === botId
            ? {
                ...msg,
                text:
                  error?.code === "ECONNREFUSED" ||
                  error?.code === "ERR_NETWORK"
                    ? "❌ Serveur inaccessible. Vérifie que le serveur est démarré et que l'IP dans chatbot.tsx est correcte (même réseau Wi-Fi)."
                    : error?.code === "ECONNABORTED"
                      ? "⏱️ Délai d'attente dépassé. Le serveur met trop de temps à répondre."
                      : `❌ Erreur : ${error?.message || "inconnue"}`,
              }
            : msg,
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const showSuggestions = messages.length <= 1;

  return (
    <View style={styles.wrapper}>
      {/* ─── Header ─── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.botAvatar}>
            <Text style={styles.botAvatarText}>🧳</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>Assistant Pack & Go</Text>
            <Text style={styles.headerSubtitle}>
              {loading ? "En train de répondre..." : "En ligne"}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Text style={styles.closeIcon}>✕</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View
              style={[
                styles.messageWrapper,
                item.sender === "user"
                  ? styles.messageWrapperRight
                  : styles.messageWrapperLeft,
              ]}
            >
              {item.sender === "bot" && (
                <View style={styles.smallAvatar}>
                  <Text style={{ fontSize: 12 }}>🧳</Text>
                </View>
              )}
              <View
                style={[
                  styles.message,
                  item.sender === "user" ? styles.userMsg : styles.botMsg,
                ]}
              >
                <Text style={styles.text}>{item.text}</Text>
              </View>
            </View>
          )}
        />

        {/* ─── Suggestions rapides ─── */}
        {showSuggestions && (
          <View style={styles.suggestionsWrapper}>
            <Text style={styles.suggestionsLabel}>Questions fréquentes :</Text>
            <View style={styles.suggestions}>
              {QUICK_SUGGESTIONS.map((q) => (
                <TouchableOpacity
                  key={q}
                  style={styles.suggestionChip}
                  onPress={() => sendMessage(q)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.suggestionText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Posez votre question sur Pack & Go..."
            placeholderTextColor="#556"
            style={styles.input}
            editable={!loading}
            onSubmitEditing={() => sendMessage()}
            returnKeyType="send"
            multiline={false}
          />
          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={() => sendMessage()}
            disabled={loading}
          >
            <Text style={{ color: "#fff", fontSize: 16 }}>
              {loading ? "⏳" : "➤"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#060F1E",
  },
  // ─── Header ───
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 52 : 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#0C1829",
    borderBottomWidth: 1,
    borderColor: "#1A2B45",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  botAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0A4DBF",
    alignItems: "center",
    justifyContent: "center",
  },
  botAvatarText: {
    fontSize: 20,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  headerSubtitle: {
    color: "#4CAF50",
    fontSize: 12,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1A2B45",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2A3F5F",
  },
  closeIcon: {
    color: "#A0AEC0",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 18,
  },
  // ─── Chat ───
  container: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingTop: 12,
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  messageWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 10,
  },
  messageWrapperLeft: {
    justifyContent: "flex-start",
  },
  messageWrapperRight: {
    justifyContent: "flex-end",
  },
  smallAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#0A4DBF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
    marginBottom: 2,
  },
  message: {
    padding: 12,
    borderRadius: 16,
    maxWidth: "80%",
  },
  userMsg: {
    backgroundColor: "#0A4DBF",
    borderBottomRightRadius: 4,
  },
  botMsg: {
    backgroundColor: "#1A2B45",
    borderBottomLeftRadius: 4,
  },
  text: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 22,
  },
  // ─── Suggestions ───
  suggestionsWrapper: {
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  suggestionsLabel: {
    color: "#7A90B4",
    fontSize: 11,
    marginBottom: 6,
    marginLeft: 2,
  },
  suggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: "#0C1829",
    borderWidth: 1,
    borderColor: "#0A4DBF",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  suggestionText: {
    color: "#5B9BFF",
    fontSize: 12,
  },
  // ─── Input ───
  inputRow: {
    flexDirection: "row",
    padding: 10,
    borderTopWidth: 1,
    borderColor: "#1A2B45",
    alignItems: "center",
  },
  input: {
    flex: 1,
    backgroundColor: "#0C1829",
    color: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#1A2B45",
  },
  btn: {
    marginLeft: 10,
    backgroundColor: "#0A4DBF",
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: {
    backgroundColor: "#1A2B45",
  },
});

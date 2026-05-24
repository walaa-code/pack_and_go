import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { API } from "../constants/api";

interface Message {
  id: string;
  text: string;
  username: string;
  userId: string;
  timestamp: number;
}

interface GroupChatContentProps {
  inviteCode: string;
  username: string; // ← nom résolu, jamais vide
  userId?: string;
  onClose?: () => void;
  onNewMessage?: (msg: {
    id: string;
    senderName: string;
    text: string;
    timestamp: number;
  }) => void;
}

export default function GroupChatContent({
  inviteCode,
  username,
  userId,
  onClose,
  onNewMessage,
}: GroupChatContentProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Garde une référence aux IDs déjà vus pour détecter les nouveaux messages
  const seenIds = useRef<Set<string>>(new Set());

  const applyMessages = (incoming: Message[]) => {
    setMessages(incoming);

    // Notifier les nouveaux messages (pour le badge/toast)
    incoming.forEach((msg) => {
      if (!seenIds.current.has(msg.id)) {
        seenIds.current.add(msg.id);
        // Ne notifier que les messages des autres
        if (msg.username !== username && onNewMessage) {
          onNewMessage({
            id: msg.id,
            senderName: msg.username,
            text: msg.text,
            timestamp: msg.timestamp,
          });
        }
      }
    });
  };

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const res = await fetch(`${API}/messages/${inviteCode}`);
        const data = await res.json();
        applyMessages(data.messages || []);
      } catch (error) {
        console.error("Fetch error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/messages/${inviteCode}`);
        const data = await res.json();
        applyMessages(data.messages || []);
      } catch (e) {
        console.error(e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [inviteCode]);

  const sendMessage = async () => {
    if (!inputText.trim()) return;

    // Guard : si le username n'est pas résolu, on bloque
    if (!username || username === "Moi") {
      Alert.alert("Erreur", "Nom d'utilisateur non chargé, réessayez.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`${API}/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteCode,
          text: inputText.trim(),
          username, // ← nom correct garanti
          userId: userId || "unknown",
        }),
      });

      if (res.ok) {
        setInputText("");
        const updated = await fetch(`${API}/messages/${inviteCode}`);
        const data = await updated.json();
        applyMessages(data.messages || []);
      }
    } catch (error) {
      Alert.alert("Erreur", "Impossible d'envoyer le message");
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.userId === userId || item.username === username;
    return (
      <View
        style={[
          styles.messageRow,
          isMe ? styles.myMessageRow : styles.otherMessageRow,
        ]}
      >
        {!isMe && <Text style={styles.senderName}>{item.username}</Text>}
        <View
          style={[
            styles.messageBubble,
            isMe ? styles.myBubble : styles.otherBubble,
          ]}
        >
          <Text style={styles.messageText}>{item.text}</Text>
        </View>
        <Text style={styles.timestamp}>
          {new Date(item.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0A4DBF" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chat du groupe</Text>
        {/* Affiche le nom résolu pour debug — retire en prod */}
        <Text style={styles.headerSub}>connecté en tant que {username}</Text>
        {onClose && (
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="close" size={22} color="#7A95B8" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Écrivez un message..."
          placeholderTextColor="#7A95B8"
          multiline
        />
        <TouchableOpacity
          onPress={sendMessage}
          disabled={sending}
          style={styles.sendButton}
        >
          <LinearGradient
            colors={["#0A4DBF", "#1a6aff"]}
            style={styles.sendGradient}
          >
            <MaterialCommunityIcons name="send" size={20} color="white" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1A2B45",
    backgroundColor: "#0C1829",
  },
  headerTitle: { color: "white", fontSize: 16, fontWeight: "600" },
  headerSub: { color: "#4A6080", fontSize: 11, flex: 1, marginLeft: 8 },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#1A2B45",
    alignItems: "center",
    justifyContent: "center",
  },
  messagesList: { padding: 16, paddingBottom: 20 },
  messageRow: { marginBottom: 16, maxWidth: "80%" },
  myMessageRow: { alignSelf: "flex-end" },
  otherMessageRow: { alignSelf: "flex-start" },
  senderName: {
    fontSize: 11,
    color: "#4A6080",
    marginBottom: 2,
    marginLeft: 8,
  },
  messageBubble: { padding: 10, borderRadius: 18 },
  myBubble: { backgroundColor: "#0A4DBF", borderBottomRightRadius: 4 },
  otherBubble: {
    backgroundColor: "#0C1829",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#1A2B45",
  },
  messageText: { color: "white", fontSize: 14 },
  timestamp: {
    fontSize: 10,
    color: "#4A6080",
    marginTop: 4,
    alignSelf: "flex-end",
  },
  inputContainer: {
    flexDirection: "row",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#1A2B45",
    backgroundColor: "#0C1829",
  },
  input: {
    flex: 1,
    backgroundColor: "#060F1E",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: "white",
    marginRight: 8,
    maxHeight: 80,
  },
  sendButton: { width: 44, height: 44, borderRadius: 22, overflow: "hidden" },
  sendGradient: { flex: 1, alignItems: "center", justifyContent: "center" },
});

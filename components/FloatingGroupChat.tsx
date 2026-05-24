import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import GroupChatScreen from "../app/(tabs)/group-chat";
import { useTravelData } from "../context/TravelContext";

interface ChatMessage {
  id: string;
  senderName: string;
  text: string;
  timestamp: number;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function MessageToast({
  message,
  onPress,
}: {
  message: ChatMessage | null;
  onPress: () => void;
}) {
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [translateY, opacity]);

  useEffect(() => {
    if (!message) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        tension: 80,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    hideTimer.current = setTimeout(hide, 4000);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [message]);

  if (!message) return null;

  return (
    <Animated.View
      style={[styles.toast, { transform: [{ translateY }], opacity }]}
    >
      <TouchableOpacity
        style={styles.toastInner}
        activeOpacity={0.92}
        onPress={() => {
          hide();
          onPress();
        }}
      >
        <View style={styles.toastAvatar}>
          <Text style={styles.toastAvatarLetter}>
            {message.senderName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.toastContent}>
          <Text style={styles.toastSender} numberOfLines={1}>
            {message.senderName}
          </Text>
          <Text style={styles.toastText} numberOfLines={2}>
            {message.text}
          </Text>
        </View>
        <MaterialCommunityIcons
          name="forum-outline"
          size={18}
          color="#0A4DBF"
          style={{ marginLeft: 6 }}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function UnreadBadge({ count }: { count: number }) {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: count > 0 ? 1 : 0,
      tension: 120,
      friction: 6,
      useNativeDriver: true,
    }).start();
  }, [count]);

  if (count === 0) return null;

  return (
    <Animated.View style={[styles.badge, { transform: [{ scale }] }]}>
      <Text style={styles.badgeText}>{count > 99 ? "99+" : String(count)}</Text>
    </Animated.View>
  );
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const UNREAD_KEY = (code: string) => `@chat_unread_${code}`;
const LAST_READ_KEY = (code: string) => `@chat_lastRead_${code}`;

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FloatingGroupChat() {
  const { travelData } = useTravelData();
  const [modalVisible, setModalVisible] = useState(false);
  const [resolvedUsername, setResolvedUsername] = useState<string>("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [toastTrigger, setToastTrigger] = useState<ChatMessage | null>(null);

  const inviteCode = travelData?.inviteCode ?? null;

  // ── Résolution du nom — priorité : context > AsyncStorage ────────────────
  useEffect(() => {
    const resolve = async () => {
      // 1. Depuis le contexte (source la plus fiable)
      const fromContext = travelData?.fullName?.trim();
      if (fromContext) {
        setResolvedUsername(fromContext);
        return;
      }

      // 2. Fallback AsyncStorage
      try {
        const stored = await AsyncStorage.getItem("@user_fullName");
        if (stored?.trim()) {
          setResolvedUsername(stored.trim());
        }
      } catch (e) {
        console.warn("FloatingGroupChat: AsyncStorage error", e);
      }
    };

    resolve();
  }, [travelData?.fullName]); // Re-résoudre si le contexte change

  // ── Restaurer le count non-lu ─────────────────────────────────────────────
  useEffect(() => {
    if (!inviteCode) return;
    AsyncStorage.getItem(UNREAD_KEY(inviteCode))
      .then((v) => {
        if (v) setUnreadCount(parseInt(v, 10) || 0);
      })
      .catch(() => {});
  }, [inviteCode]);

  // ── Nouveau message entrant ───────────────────────────────────────────────
  const handleNewMessage = useCallback(
    async (msg: ChatMessage) => {
      if (modalVisible) return;
      if (msg.senderName === resolvedUsername) return;

      setUnreadCount((prev) => {
        const next = prev + 1;
        if (inviteCode) {
          AsyncStorage.setItem(UNREAD_KEY(inviteCode), String(next)).catch(
            () => {},
          );
        }
        return next;
      });

      setToastTrigger({ ...msg });
    },
    [modalVisible, resolvedUsername, inviteCode],
  );

  // ── Ouvrir le chat ────────────────────────────────────────────────────────
  const openChat = useCallback(async () => {
    // Dernière chance : recharger le nom si toujours vide
    if (!resolvedUsername) {
      const fromContext = travelData?.fullName?.trim();
      if (fromContext) {
        setResolvedUsername(fromContext);
      } else {
        try {
          const stored = await AsyncStorage.getItem("@user_fullName");
          if (stored?.trim()) setResolvedUsername(stored.trim());
        } catch (_) {}
      }
    }

    setModalVisible(true);
    setUnreadCount(0);
    setToastTrigger(null);

    if (inviteCode) {
      await AsyncStorage.setItem(UNREAD_KEY(inviteCode), "0");
      await AsyncStorage.setItem(LAST_READ_KEY(inviteCode), String(Date.now()));
    }
  }, [inviteCode, resolvedUsername, travelData?.fullName]);

  if (!inviteCode) return null;

  // Nom final garanti non-vide
  const username = resolvedUsername || "Moi";

  return (
    <>
      <MessageToast message={toastTrigger} onPress={openChat} />

      <TouchableOpacity
        style={styles.bubble}
        activeOpacity={0.8}
        onPress={openChat}
      >
        <LinearGradient
          colors={["#0A4DBF", "#1a6aff"]}
          style={styles.bubbleGradient}
        >
          <MaterialCommunityIcons
            name="forum-outline"
            size={28}
            color="white"
          />
        </LinearGradient>
        <UnreadBadge count={unreadCount} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={{ flex: 1 }}>
          <GroupChatScreen
            inviteCode={inviteCode}
            username={username}
            onClose={() => setModalVisible(false)}
            onNewMessage={handleNewMessage}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: "absolute",
    bottom: 25,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 9999,
  },
  bubbleGradient: {
    flex: 1,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#fff",
    zIndex: 10000,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700", lineHeight: 13 },
  toast: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 16,
    left: 12,
    right: 12,
    zIndex: 99999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
  toastInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(10,77,191,0.12)",
  },
  toastAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#0A4DBF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    flexShrink: 0,
  },
  toastAvatarLetter: { color: "#fff", fontSize: 16, fontWeight: "700" },
  toastContent: { flex: 1 },
  toastSender: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0A4DBF",
    marginBottom: 2,
  },
  toastText: { fontSize: 13, color: "#333", lineHeight: 17 },
});

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { io, Socket } from "socket.io-client";
import { useTravelData } from "../../context/TravelContext";

const BACKEND_URL = "http://192.168.1.8:5000";

type Message = {
  id: string;
  text: string;
  sender: string;
  timestamp?: string;
  isSystem?: boolean;
};

interface GroupChatScreenProps {
  inviteCode?: string;
  username?: string;
  onClose?: () => void;
  onNewMessage?: (msg: {
    id: string;
    senderName: string;
    text: string;
    timestamp: number;
  }) => void;
}

export default function GroupChatScreen({
  inviteCode: propInviteCode,
  username: propUsername,
  onClose,
  onNewMessage,
}: GroupChatScreenProps = {}) {
  const params = useLocalSearchParams();
  const { travelData } = useTravelData();
  const router = useRouter();

  const inviteCode = (
    propInviteCode || String(params.inviteCode || travelData?.inviteCode || "")
  )
    .trim()
    .toUpperCase();

  const myUsername =
    (
      propUsername || String(params.username || travelData?.fullName || "")
    ).trim() || "Moi";

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const onNewMessageRef = useRef(onNewMessage);
  useEffect(() => {
    onNewMessageRef.current = onNewMessage;
  }, [onNewMessage]);

  useEffect(() => {
    if (!inviteCode) return;

    const socket = io(BACKEND_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join_room", { inviteCode, username: myUsername });
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("history", (history: Message[]) => setMessages(history));

    socket.on("new_message", (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
      if (msg.sender !== myUsername && !msg.isSystem) {
        onNewMessageRef.current?.({
          id: msg.id,
          senderName: msg.sender,
          text: msg.text,
          timestamp: Date.now(),
        });
      }
    });

    socket.on("system_message", (msg: Message) =>
      setMessages((prev) => [...prev, msg]),
    );

    return () => {
      socket.emit("leave_room", { inviteCode, username: myUsername });
      socket.disconnect();
    };
  }, [inviteCode, myUsername]);

  const sendMessage = () => {
    if (!input.trim() || !socketRef.current) return;
    socketRef.current.emit("send_message", {
      inviteCode,
      message: { text: input.trim(), sender: myUsername },
    });
    setInput("");
  };

  const renderItem = ({ item }: { item: Message }) => {
    if (item.isSystem) {
      return (
        <View style={styles.systemMsgContainer}>
          <Text style={styles.systemText}>{item.text}</Text>
        </View>
      );
    }

    const isMe = item.sender === myUsername;
    return (
      <View
        style={[
          styles.messageWrapper,
          isMe ? styles.myWrapper : styles.otherWrapper,
        ]}
      >
        <View style={[styles.msgBox, isMe ? styles.myMsg : styles.otherMsg]}>
          <Text style={[styles.senderName, isMe && styles.mySenderName]}>
            {item.sender}
          </Text>
          <Text style={styles.messageText}>{item.text}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        {!onClose && (
          // ✅ FIX : userId préservé depuis TravelContext lors du retour vers promotion
          <TouchableOpacity
            onPress={() => {
              const uid = (travelData as any)?.userId;
              router.push({
                pathname: "/promotion",
                params: uid ? { userId: String(uid) } : {},
              } as any);
            }}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={22}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        )}

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>✈️ Groupe de Voyage</Text>
          <Text style={styles.headerSubtitle}>Code : {inviteCode}</Text>
        </View>

        <View
          style={[styles.statusDot, connected ? styles.online : styles.offline]}
        />

        {onClose && (
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="close" size={22} color="#7A95B8" />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Écrivez ici..."
            placeholderTextColor="#4A6080"
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
            <MaterialCommunityIcons name="send" size={18} color="white" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#060F1E" },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#081225",
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#1A2B45",
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1A2B45",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1A2B45",
  },
  headerCenter: { flex: 1 },
  headerTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  headerSubtitle: { color: "#3B72E8", fontSize: 12 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  online: { backgroundColor: "#22C55E" },
  offline: { backgroundColor: "#EF4444" },
  listContent: { padding: 14 },
  messageWrapper: { marginBottom: 10, width: "100%" },
  myWrapper: { alignItems: "flex-end" },
  otherWrapper: { alignItems: "flex-start" },
  msgBox: { padding: 12, borderRadius: 18, maxWidth: "80%" },
  myMsg: { backgroundColor: "#0A4DBF" },
  otherMsg: { backgroundColor: "#1A2B45" },
  senderName: {
    color: "#3B72E8",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
  },
  mySenderName: {
    color: "#93B4F0",
    textAlign: "right",
  },
  messageText: { color: "#FFFFFF", fontSize: 15 },
  inputContainer: {
    flexDirection: "row",
    padding: 10,
    backgroundColor: "#081225",
    gap: 10,
    alignItems: "center",
  },
  input: {
    flex: 1,
    backgroundColor: "#132137",
    color: "white",
    borderRadius: 20,
    paddingHorizontal: 15,
    height: 44,
    borderWidth: 1,
    borderColor: "#1A2B45",
  },
  sendBtn: {
    backgroundColor: "#0A4DBF",
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  systemMsgContainer: { alignSelf: "center", marginVertical: 8 },
  systemText: { color: "#7A90B4", fontSize: 12, fontStyle: "italic" },
});

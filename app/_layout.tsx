import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import FloatingGroupChat from "@/components/FloatingGroupChat";
import { TravelProvider } from "@/context/TravelContext";
import { useColorScheme } from "@/hooks/use-color-scheme";

export const unstable_settings = {
  anchor: "(tabs)",
};

const CHAT_ALLOWED_ROUTES = [
  "question",
  "questioninvi",
  "resume",
  "resumeinvi",
  "modifierinfo",
  "plan",
  "planpremium",
];

function FloatingChatController() {
  const segments = useSegments();
  const currentRoute = segments[segments.length - 1];
  const shouldShow = CHAT_ALLOWED_ROUTES.includes(currentRoute);

  if (!shouldShow) return null;
  return <FloatingGroupChat />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <TravelProvider>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="modal"
            options={{ presentation: "modal", title: "Modal" }}
          />
        </Stack>
        <StatusBar style="auto" />
        <FloatingChatController />
      </ThemeProvider>
    </TravelProvider>
  );
}

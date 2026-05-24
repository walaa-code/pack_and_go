import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width, height } = Dimensions.get("window");

/* ─── Palette ─── */
const NAVY = "#050E1F";
const DEEP_BLUE = "#071530";
const BLUE_VIVID = "#1158CC";
const ACCENT = "#4E90FF";
const GOLD = "#D4A843";
const GOLD_LIGHT = "#F5C842";
const WHITE = "#FFFFFF";
const WHITE_DIM = "rgba(255,255,255,0.55)";
const WHITE_PALE = "rgba(255,255,255,0.08)";

/* ─── Star ─── */
function Star({
  x,
  y,
  size,
  delay,
}: {
  x: number;
  y: number;
  size: number;
  delay: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.2,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.delay(Math.random() * 2000),
      ]),
    ).start();
  }, []);

  return (
    <Animated.View style={{ position: "absolute", top: y, left: x, opacity }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: WHITE,
        }}
      />
    </Animated.View>
  );
}

// Générés une seule fois hors du composant pour éviter le recalcul à chaque render
const STARS = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  x: Math.random() * width,
  y: Math.random() * height * 0.65,
  size: Math.random() * 2 + 0.8,
  delay: Math.random() * 3000,
}));

/* ─── Feature Pill ─── */
function FeaturePill({
  icon,
  label,
  delay,
  fade,
}: {
  icon: string;
  label: string;
  delay: number;
  fade: Animated.Value;
}) {
  const slide = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: 0,
      duration: 500,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={[
        pStyles.pill,
        { opacity: fade, transform: [{ translateY: slide }] },
      ]}
    >
      <Text style={pStyles.icon}>{icon}</Text>
      <Text style={pStyles.label}>{label}</Text>
    </Animated.View>
  );
}

const pStyles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: WHITE_PALE,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  icon: { fontSize: 14 },
  label: {
    color: WHITE_DIM,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});

/* ══════════════════════════════════════════ */
export default function HomeScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleLogo = useRef(new Animated.Value(0.5)).current;
  const scaleBtn = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.5)).current;
  const badgeSlide = useRef(new Animated.Value(-30)).current;
  const planeX = useRef(new Animated.Value(-70)).current;
  const planeY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Badge slide-in
    Animated.spring(badgeSlide, {
      toValue: 0,
      tension: 80,
      friction: 10,
      useNativeDriver: true,
    }).start();

    // Logo pop
    Animated.sequence([
      Animated.delay(300),
      Animated.spring(scaleLogo, {
        toValue: 1,
        tension: 55,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    // Fade + slide content
    Animated.sequence([
      Animated.delay(600),
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.4,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Avion qui traverse l'écran
    Animated.loop(
      Animated.sequence([
        Animated.delay(3000),
        Animated.parallel([
          Animated.timing(planeX, {
            toValue: width + 80,
            duration: 5000,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(planeY, {
            toValue: -40,
            duration: 5000,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(8000),
        // Reset position instantanément
        Animated.parallel([
          Animated.timing(planeX, {
            toValue: -70,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(planeY, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ).start();
  }, []);

  const onPressIn = () =>
    Animated.spring(scaleBtn, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();

  const onPressOut = () =>
    Animated.spring(scaleBtn, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();

  const FEATURES = [
    { icon: "🗺️", label: "Itinéraires", delay: 700 },
    { icon: "🏨", label: "Hôtels 5★", delay: 850 },
    { icon: "☕", label: "Gastronomie", delay: 1000 },
    { icon: "🎯", label: "Activités", delay: 1150 },
  ] as const;

  return (
    <View style={styles.bg}>
      {/* Sky gradient */}
      <LinearGradient
        colors={[NAVY, DEEP_BLUE, "#0A2055", "#0D3580"]}
        locations={[0, 0.4, 0.75, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Stars */}
      {STARS.map((s) => (
        <Star key={s.id} {...s} />
      ))}

      {/* ✈️ Grand avion qui traverse l'écran */}
      <Animated.View
        style={[
          styles.flyingPlane,
          { transform: [{ translateX: planeX }, { translateY: planeY }] },
        ]}
      >
        <Text style={{ fontSize: 30 }}>✈️</Text>
        <View style={styles.trail1} />
        <View style={styles.trail2} />
      </Animated.View>

      {/* Badge */}
      <Animated.View
        style={[styles.liveBadge, { transform: [{ translateY: badgeSlide }] }]}
      >
        <Text style={{ fontSize: 13 }}>✈️</Text>
        <Text style={styles.liveText}>PLANIFICATION INTELLIGENTE</Text>
      </Animated.View>

      {/* Logo */}
      <Animated.View
        style={[styles.logoZone, { transform: [{ scale: scaleLogo }] }]}
      >
        <Animated.View style={[styles.logoGlow, { opacity: glowAnim }]} />
        <LinearGradient
          colors={[BLUE_VIVID, ACCENT, "#6AADFF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.logoRing}
        >
          <Image
            source={require("../../assets/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </LinearGradient>
        <View style={styles.goldBadge}>
          <Text style={{ fontSize: 11 }}>⭐</Text>
        </View>
      </Animated.View>

      {/* Text */}
      <Animated.View
        style={[
          styles.textZone,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <Text style={styles.appSub}>VOTRE COMPAGNON DE VOYAGE</Text>
        <Text style={styles.appName}>
          Pack<Text style={styles.amp}>&</Text>Go
        </Text>
        <View style={styles.underlineRow}>
          <LinearGradient
            colors={[GOLD, GOLD_LIGHT, "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.underline}
          />
        </View>
        <Text style={styles.description}>
          Explorez, planifiez et vivez chaque aventure avec élégance.{"\n"}
          Votre destination de rêve n'a jamais été aussi proche.
        </Text>
      </Animated.View>

      {/* Pills */}
      <Animated.View style={[styles.pillsRow, { opacity: fadeAnim }]}>
        {FEATURES.map((f) => (
          <FeaturePill key={f.label} {...f} fade={fadeAnim} />
        ))}
      </Animated.View>

      {/* CTA */}
      <Animated.View
        style={[
          styles.btnContainer,
          { opacity: fadeAnim, transform: [{ scale: scaleBtn }] },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.push("/login")}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          activeOpacity={1}
        >
          <LinearGradient
            colors={[BLUE_VIVID, ACCENT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.button}
          >
            <View style={styles.btnShimmer} />
            <Text style={{ fontSize: 18 }}>✈️</Text>
            <Text style={styles.btnText}>Commencer l'aventure</Text>
            <View style={styles.btnArrowBubble}>
              <Text style={styles.btnArrow}>→</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
        <LinearGradient
          colors={[ACCENT, "transparent"]}
          style={styles.btnGlow}
        />
      </Animated.View>

      {/* Footer */}
      <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
        <View style={styles.footerLine} />
        <Text style={styles.footerText}>
          🌍 Gratuit · 🔒 Sécurisé · 🚫 Sans pub
        </Text>
        <View style={styles.footerLine} />
      </Animated.View>

      {/* Dots */}
      <Animated.View style={[styles.dots, { opacity: fadeAnim }]}>
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, alignItems: "center", justifyContent: "center" },

  flyingPlane: {
    position: "absolute",
    top: height * 0.17,
    left: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  trail1: {
    width: 50,
    height: 2,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginLeft: -6,
  },
  trail2: {
    width: 30,
    height: 1,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginLeft: 2,
  },

  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(78,144,255,0.12)",
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(78,144,255,0.25)",
    marginBottom: 24,
  },
  liveText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.5,
  },

  logoZone: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 26,
  },
  logoGlow: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: ACCENT,
    opacity: 0.15,
  },
  logoRing: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 18,
  },
  logo: { width: 60, height: 60 },
  goldBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 6,
  },

  textZone: { alignItems: "center", paddingHorizontal: 24, marginBottom: 20 },
  appSub: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 3.5,
    marginBottom: 8,
  },
  appName: {
    fontSize: 56,
    color: WHITE,
    fontWeight: "900",
    letterSpacing: -2,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif" }),
    lineHeight: 60,
  },
  amp: { color: GOLD_LIGHT },
  underlineRow: {
    width: "55%",
    marginTop: 6,
    marginBottom: 14,
    overflow: "hidden",
  },
  underline: { height: 3, borderRadius: 2, width: "100%" },
  description: {
    fontSize: 13.5,
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
    lineHeight: 21,
    letterSpacing: 0.2,
  },

  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginBottom: 26,
    paddingHorizontal: 20,
  },

  btnContainer: { width: width - 48, marginBottom: 18, position: "relative" },
  button: {
    borderRadius: 18,
    paddingVertical: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    overflow: "hidden",
  },
  btnShimmer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 18,
  },
  btnText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  btnArrowBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  btnArrow: { color: WHITE, fontSize: 16, fontWeight: "800" },
  btnGlow: {
    position: "absolute",
    bottom: -12,
    left: "20%",
    right: "20%",
    height: 16,
    borderRadius: 10,
    opacity: 0.3,
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  footerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    maxWidth: 28,
  },
  footerText: {
    color: "rgba(255,255,255,0.22)",
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.3,
  },

  dots: { flexDirection: "row", gap: 6 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  dotActive: { width: 22, borderRadius: 3, backgroundColor: GOLD },
});

import { useEffect, useRef } from "react";
import { Animated, StyleSheet, TouchableOpacity, View } from "react-native";
export default function HomeScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const onPressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };
  const onPressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };
  return (
    <View style={styles.container}>
      <Animated.Text style={[styles.subtitle, { opacity: fadeAnim }]}>
        VOTRE APPLICATION
      </Animated.Text>
      <Animated.Text
        style={[styles.title, { transform: [{ translateY: slideAnim }] }]}
      >
        Pack&Go
      </Animated.Text>
      <Animated.Text style={[styles.welcome, { opacity: fadeAnim }]}>
        Bienvenue dans notre application
      </Animated.Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => NavigationActivation.navigate("login")}
      >
        <Animated.Text
          style={[styles.buttonText, { transform: [{ scale: scaleAnim }] }]}
        >
          On commence
        </Animated.Text>
      </TouchableOpacity>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A4DBF",
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: {
    color: "#B3D9FF",
    fontSize: 14,
    letterSpacing: 2,
    fontWeight: "bold",
    marginBottom: 8,
  },
  title: { fontSize: 36, color: "#fff", fontWeight: "bold", marginBottom: 10 },
  welcome: { fontSize: 16, color: "#E0E0E0", marginBottom: 40 },
  button: {
    backgroundColor: "#3DDCFF",
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 30,
  },
  buttonText: { color: "#003366", fontSize: 16, fontWeight: "bold" },
});

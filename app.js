import * as Linking from "expo-linking";
import { useEffect } from "react";
import { Button, Text, View } from "react-native";

export default function App() {
  // TEST AUTOMATIQUE - Au démarrage
  useEffect(() => {
    // Test simple après 2 secondes
    setTimeout(() => {
      Linking.openURL("monapp://test")
        .then(() => console.log("✅ Lien ouvert avec succès"))
        .catch((err) => console.log("❌ Erreur:", err));
    }, 2000);
  }, []);

  // TEST MANUEL - Avec un bouton
  const testDeepLink = async () => {
    try {
      await Linking.openURL("monapp://produit/123");
      console.log("✅ Lien ouvert");
    } catch (error) {
      console.log("❌ Erreur:", error);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text>Mon Application</Text>
      <Button title="Tester Deep Link" onPress={testDeepLink} />
    </View>
  );
}

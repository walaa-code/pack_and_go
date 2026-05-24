import { NavigationContainer } from "@react-navigation/native";
import { reactNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "./screens/HomeScreen";
import LoginScreen from "./screens/loginScreen";
const stack = reactNativeStackNavigator();
export default function App() {
  return (
    <NavigationContainer>
      <stack.Navigator screenOptions={{ HeaderShown: false }}>
        <stack.screen name="Home" component={HomeScreen} />
        <stack.screen name="login" component={LoginScreen} />
      </stack.Navigator>
    </NavigationContainer>
  );
}

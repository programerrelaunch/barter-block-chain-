import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { api, setToken } from "../src/lib/api";
import { styles } from "../src/lib/theme";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("hello@coastalcafe.local");
  const [password, setPassword] = useState("member123");
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);
    try {
      const data = await api<{ token: string }>("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await setToken(data.token);
      router.replace("/(tabs)");
    } catch (e: any) {
      Alert.alert("Could not sign in", e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { justifyContent: "center" }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.brand}>
        Barter<Text style={styles.brandAccent}>Chain</Text>
      </Text>
      <Text style={[styles.muted, { marginBottom: 28, marginTop: 8 }]}>
        Trade dollars for real businesses. No wallets to manage — just pay and get paid.
      </Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
      />
      <Pressable style={styles.btn} onPress={login} disabled={loading}>
        <Text style={styles.btnText}>{loading ? "Signing in…" : "Continue"}</Text>
      </Pressable>
      <Text style={[styles.muted, { marginTop: 18 }]}>
        Demo: hello@coastalcafe.local / member123
      </Text>
    </KeyboardAvoidingView>
  );
}

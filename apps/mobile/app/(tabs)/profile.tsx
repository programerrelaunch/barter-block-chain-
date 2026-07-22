import { useEffect, useState } from "react";
import { View, Text, Switch, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { api, setToken } from "../../src/lib/api";
import { styles } from "../../src/lib/theme";

export default function ProfileScreen() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    api("/v1/auth/me").then(setMe).catch(console.error);
  }, []);

  async function toggleWants(value: boolean) {
    await api("/v1/members/me", {
      method: "PATCH",
      body: JSON.stringify({ wantsTradeFlag: value }),
    });
    setMe((prev: any) => ({
      ...prev,
      user: { ...prev.user, wantsTradeFlag: value },
    }));
  }

  if (!me) return <View style={styles.screen} />;

  return (
    <View style={styles.screen}>
      <Text style={styles.h1}>{me.user.businessName}</Text>
      <Text style={styles.muted}>{me.user.contactName}</Text>
      <Text style={[styles.muted, { marginBottom: 24 }]}>{me.user.email}</Text>

      <View style={[styles.card, styles.row, { justifyContent: "space-between" }]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontWeight: "700" }}>I really want trade</Text>
          <Text style={styles.muted}>Show brokers and members you are ready to deal.</Text>
        </View>
        <Switch
          value={!!me.user.wantsTradeFlag}
          onValueChange={toggleWants}
        />
      </View>

      <Pressable
        style={[styles.btnSecondary, { marginTop: 12 }]}
        onPress={async () => {
          await setToken(null);
          router.replace("/login");
        }}
      >
        <Text style={[styles.btnText, { color: "#1C2418" }]}>Sign out</Text>
      </Pressable>
    </View>
  );
}

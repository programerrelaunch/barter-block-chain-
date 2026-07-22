import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { api, money } from "../../src/lib/api";
import { styles } from "../../src/lib/theme";

export default function ActivityScreen() {
  const [trades, setTrades] = useState<any[]>([]);

  const load = useCallback(async () => {
    const data = await api<{ trades: any[] }>("/v1/trades");
    setTrades(data.trades);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(console.error);
    }, [load])
  );

  return (
    <ScrollView
      style={styles.screen}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
    >
      {trades.length === 0 ? (
        <Text style={styles.muted}>No activity yet.</Text>
      ) : (
        trades.map((t) => (
          <View key={t.id} style={styles.card}>
            <Text style={{ fontWeight: "700" }}>
              {t.direction === "sent" ? `Paid ${t.sellerName}` : `From ${t.buyerName}`}
            </Text>
            <Text style={{ fontSize: 22, fontWeight: "700", marginVertical: 4 }}>
              {money(t.grossCents)}
            </Text>
            <Text style={styles.muted}>
              {new Date(t.createdAt).toLocaleString()}
              {t.isCrossNetwork ? " · Cross-network fee applied" : " · In-network"}
            </Text>
            {t.direction === "received" && (
              <Text style={styles.muted}>Seller fee {money(t.feeCents)}</Text>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

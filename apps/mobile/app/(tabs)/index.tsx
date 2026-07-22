import { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api, money, setToken } from "../../src/lib/api";
import { styles } from "../../src/lib/theme";

export default function HomeScreen() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);

  const load = useCallback(async () => {
    const [profile, market, activity] = await Promise.all([
      api<any>("/v1/auth/me"),
      api<{ listings: any[] }>("/v1/listings"),
      api<{ trades: any[] }>("/v1/trades"),
    ]);
    setMe(profile);
    setListings(market.listings.filter((l) => l.featuredUntil).slice(0, 3));
    setTrades(activity.trades.slice(0, 4));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(console.error);
    }, [load])
  );

  if (!me) {
    return (
      <View style={styles.screen}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
    >
      <Text style={styles.muted}>{me.exchange?.name ?? "Your exchange"}</Text>
      <Text style={styles.h1}>{me.user.businessName}</Text>
      <Text style={[styles.muted, { marginTop: 16 }]}>Trade balance</Text>
      <Text style={styles.balance}>{money(me.user.balanceCents)}</Text>
      <Text style={styles.muted}>
        Credit available{" "}
        {money(me.credit?.availableCents ?? 0)}
      </Text>

      <View style={[styles.row, { marginVertical: 18 }]}>
        <Pressable style={[styles.btn, { flex: 1 }]} onPress={() => router.push("/pay")}>
          <Text style={styles.btnText}>Pay</Text>
        </Pressable>
        <Pressable
          style={[styles.btnSecondary, { flex: 1 }]}
          onPress={() => router.push("/(tabs)/receive")}
        >
          <Text style={[styles.btnText, { color: "#1C2418" }]}>Receive</Text>
        </Pressable>
      </View>

      <Text style={styles.h2}>Featured</Text>
      {listings.map((l) => (
        <Pressable
          key={l.id}
          style={styles.card}
          onPress={() => router.push(`/listing/${l.id}`)}
        >
          <Text style={{ fontWeight: "700", fontSize: 16 }}>{l.title}</Text>
          <Text style={styles.muted}>
            {l.businessName} · {money(l.priceCents)}
          </Text>
        </Pressable>
      ))}

      <Text style={[styles.h2, { marginTop: 8 }]}>Recent activity</Text>
      {trades.length === 0 ? (
        <Text style={styles.muted}>No trades yet.</Text>
      ) : (
        trades.map((t) => (
          <View key={t.id} style={styles.card}>
            <Text style={{ fontWeight: "600" }}>
              {t.direction === "sent" ? `Paid ${t.sellerName}` : `Received from ${t.buyerName}`}
            </Text>
            <Text style={styles.muted}>
              {money(t.grossCents)}
              {t.isCrossNetwork ? " · Cross-network" : ""} · {t.status}
            </Text>
          </View>
        ))
      )}

      <Pressable
        style={[styles.btnSecondary, { marginTop: 12, marginBottom: 40 }]}
        onPress={async () => {
          await setToken(null);
          router.replace("/login");
        }}
      >
        <Text style={[styles.btnText, { color: "#1C2418" }]}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

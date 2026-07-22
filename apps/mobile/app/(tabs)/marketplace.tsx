import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { api, money } from "../../src/lib/api";
import { styles } from "../../src/lib/theme";

export default function MarketplaceScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<"all" | "offer" | "want" | "new">("all");
  const [q, setQ] = useState("");
  const [listings, setListings] = useState<any[]>([]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (tab === "offer" || tab === "want") params.set("type", tab);
    if (tab === "new") params.set("newOnly", "1");
    if (q) params.set("q", q);
    api<{ listings: any[] }>(`/v1/listings?${params}`)
      .then((d) => setListings(d.listings))
      .catch(console.error);
  }, [tab, q]);

  return (
    <View style={styles.screen}>
      <TextInput
        style={styles.input}
        placeholder="Search listings…"
        value={q}
        onChangeText={setQ}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={styles.row}>
          {(
            [
              ["all", "All"],
              ["new", "New (72h)"],
              ["offer", "Offers"],
              ["want", "Wanted"],
            ] as const
          ).map(([key, label]) => (
            <Pressable
              key={key}
              style={[styles.chip, tab === key && styles.chipActive]}
              onPress={() => setTab(key)}
            >
              <Text style={tab === key ? styles.chipActiveText : styles.chipText}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <ScrollView>
        {listings.map((l) => (
          <Pressable
            key={l.id}
            style={styles.card}
            onPress={() => router.push(`/listing/${l.id}`)}
          >
            <Text style={{ fontWeight: "700", fontSize: 16, marginBottom: 4 }}>{l.title}</Text>
            <Text style={styles.muted}>
              {l.businessName} · {l.exchangeName}
            </Text>
            <Text style={{ marginTop: 8, fontWeight: "700" }}>{money(l.priceCents)} trade</Text>
            <Text style={styles.muted}>{l.type === "want" ? "Wanted" : "Offering"}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

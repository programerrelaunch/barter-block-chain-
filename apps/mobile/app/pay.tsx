import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, money } from "../src/lib/api";
import { styles, colors } from "../src/lib/theme";

export default function PayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    sellerId?: string;
    amount?: string;
    listingId?: string;
  }>();
  const [members, setMembers] = useState<any[]>([]);
  const [sellerId, setSellerId] = useState(params.sellerId ?? "");
  const [amount, setAmount] = useState(params.amount ?? "50");
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ members: any[] }>("/v1/directory")
      .then((d) => {
        setMembers(d.members);
        if (!sellerId && d.members[0]) setSellerId(d.members[0].id);
      })
      .catch(console.error);
  }, []);

  const grossCents = useMemo(() => Math.round(Number(amount || 0) * 100), [amount]);

  useEffect(() => {
    if (!sellerId || grossCents <= 0) {
      setPreview(null);
      return;
    }
    api("/v1/trades/preview", {
      method: "POST",
      body: JSON.stringify({ sellerId, grossCents }),
    })
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [sellerId, grossCents]);

  async function confirm() {
    if (!sellerId || grossCents <= 0) return;
    setLoading(true);
    try {
      const result = await api<any>("/v1/trades", {
        method: "POST",
        headers: { "Idempotency-Key": `pay-${Date.now()}` },
        body: JSON.stringify({
          sellerId,
          grossCents,
          listingId: params.listingId,
        }),
      });
      Alert.alert(
        "Payment sent",
        `Paid ${money(result.grossCents)}. ${
          result.isCrossNetwork
            ? "Cross-network fee applied on the seller side."
            : "In-network fee applied on the seller side."
        }`,
        [{ text: "Done", onPress: () => router.replace("/(tabs)/activity") }]
      );
    } catch (e: any) {
      Alert.alert("Payment failed", e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.screen}>
      <Text style={styles.h1}>Pay</Text>
      <Text style={[styles.muted, { marginBottom: 16 }]}>
        Enter amount and confirm. Fees are shown before you pay.
      </Text>

      <Text style={styles.muted}>Pay to</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 10 }}>
        <View style={styles.row}>
          {members.map((m) => (
            <Pressable
              key={m.id}
              style={[styles.chip, sellerId === m.id && styles.chipActive]}
              onPress={() => setSellerId(m.id)}
            >
              <Text style={sellerId === m.id ? styles.chipActiveText : styles.chipText}>
                {m.business_name}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Text style={styles.muted}>Amount (trade dollars)</Text>
      <TextInput
        style={[styles.input, { fontSize: 28, fontWeight: "700" }]}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />

      {preview && (
        <View
          style={[
            styles.card,
            preview.isCrossNetwork && { borderColor: colors.accent2, borderWidth: 1.5 },
          ]}
        >
          <Text style={{ fontWeight: "700", marginBottom: 8 }}>Fee preview</Text>
          <Text style={styles.muted}>{preview.message}</Text>
          <Text style={{ marginTop: 12 }}>
            You pay {money(preview.grossCents)} · Seller receives{" "}
            {money(preview.sellerNetCents)} after {money(preview.feeCents)} fee
          </Text>
          {preview.isCrossNetwork && (
            <Text style={{ color: colors.accent2, marginTop: 8, fontWeight: "600" }}>
              Cross-network: {(preview.feeBps / 100).toFixed(0)}% vs in-network{" "}
              {(preview.inNetworkFeeBps / 100).toFixed(0)}%
            </Text>
          )}
        </View>
      )}

      <Pressable style={styles.btn} onPress={confirm} disabled={loading || !preview}>
        <Text style={styles.btnText}>{loading ? "Sending…" : "Confirm payment"}</Text>
      </Pressable>
    </ScrollView>
  );
}

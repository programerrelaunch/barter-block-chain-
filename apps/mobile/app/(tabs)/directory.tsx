import { useEffect, useState } from "react";
import { View, Text, ScrollView, TextInput, Pressable } from "react-native";
import { api } from "../../src/lib/api";
import { styles } from "../../src/lib/theme";

export default function DirectoryScreen() {
  const [q, setQ] = useState("");
  const [wantsOnly, setWantsOnly] = useState(false);
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (wantsOnly) params.set("wantsTrade", "1");
    api<{ members: any[] }>(`/v1/directory?${params}`)
      .then((d) => setMembers(d.members))
      .catch(console.error);
  }, [q, wantsOnly]);

  return (
    <View style={styles.screen}>
      <TextInput
        style={styles.input}
        placeholder="Search businesses…"
        value={q}
        onChangeText={setQ}
      />
      <Pressable
        style={[styles.chip, wantsOnly && styles.chipActive, { alignSelf: "flex-start", marginBottom: 12 }]}
        onPress={() => setWantsOnly((v) => !v)}
      >
        <Text style={wantsOnly ? styles.chipActiveText : styles.chipText}>
          Really wants trade
        </Text>
      </Pressable>
      <ScrollView>
        {members.map((m) => (
          <View key={m.id} style={styles.card}>
            <Text style={{ fontWeight: "700", fontSize: 16 }}>{m.business_name}</Text>
            <Text style={styles.muted}>
              {m.contact_name} · {m.exchange_name}
            </Text>
            {!!m.wants_trade_flag && (
              <View style={[styles.chip, { marginTop: 10, alignSelf: "flex-start" }]}>
                <Text style={styles.chipText}>Wants trade</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

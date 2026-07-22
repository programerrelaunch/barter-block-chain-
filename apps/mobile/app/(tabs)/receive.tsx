import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { api } from "../../src/lib/api";
import { styles } from "../../src/lib/theme";

export default function ReceiveScreen() {
  const [wallet, setWallet] = useState<any>(null);

  useEffect(() => {
    api("/v1/wallet").then(setWallet).catch(console.error);
  }, []);

  return (
    <View style={[styles.screen, { alignItems: "center", paddingTop: 40 }]}>
      <Text style={styles.h1}>Receive</Text>
      <Text style={[styles.muted, { textAlign: "center", marginBottom: 24 }]}>
        Show this code at checkout. Members never see wallets or keys — just your business.
      </Text>
      <View
        style={[
          styles.card,
          {
            width: 260,
            height: 260,
            alignItems: "center",
            justifyContent: "center",
            borderStyle: "dashed",
          },
        ]}
      >
        <Text style={{ fontSize: 64, marginBottom: 8 }}>▣</Text>
        <Text style={{ fontWeight: "700", textAlign: "center" }}>
          {wallet ? JSON.parse(wallet.qrPayload).businessName : "…"}
        </Text>
        <Text style={[styles.muted, { marginTop: 8, textAlign: "center", fontSize: 12 }]}>
          Member ID: {wallet ? JSON.parse(wallet.qrPayload).memberId.slice(0, 12) : ""}…
        </Text>
      </View>
      <Text style={[styles.muted, { marginTop: 20 }]}>
        Balance {wallet?.displayBalance ?? "—"}
      </Text>
    </View>
  );
}

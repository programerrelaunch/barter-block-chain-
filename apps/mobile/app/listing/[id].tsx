import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, money } from "../../src/lib/api";
import { styles } from "../../src/lib/theme";

export default function ListingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [listing, setListing] = useState<any>(null);

  useEffect(() => {
    api<{ listing: any }>(`/v1/listings/${id}`)
      .then((d) => setListing(d.listing))
      .catch((e) => Alert.alert("Error", e.message));
  }, [id]);

  if (!listing) {
    return (
      <View style={styles.screen}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen}>
      <Text style={styles.h1}>{listing.title}</Text>
      <Text style={[styles.muted, { marginVertical: 8 }]}>
        {listing.businessName} · {listing.exchangeName}
      </Text>
      <Text style={{ fontSize: 28, fontWeight: "700", marginBottom: 16 }}>
        {money(listing.priceCents)} trade
      </Text>
      <Text style={[styles.muted, { marginBottom: 24, fontSize: 16, lineHeight: 24 }]}>
        {listing.description}
      </Text>
      <View style={styles.card}>
        <Text style={{ fontWeight: "700" }}>{listing.contactName}</Text>
        <Text style={styles.muted}>{listing.phone}</Text>
        {listing.wantsTradeFlag && (
          <View style={[styles.chip, { marginTop: 10, alignSelf: "flex-start" }]}>
            <Text style={styles.chipText}>Really wants trade</Text>
          </View>
        )}
      </View>
      {listing.type === "offer" && (
        <Pressable
          style={styles.btn}
          onPress={() =>
            router.push({
              pathname: "/pay",
              params: {
                sellerId: listing.userId,
                amount: String(listing.priceCents / 100),
                listingId: listing.id,
              },
            })
          }
        >
          <Text style={styles.btnText}>Pay now</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

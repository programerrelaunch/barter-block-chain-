import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { getToken } from "../src/lib/api";
import { colors } from "../src/lib/theme";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    getToken().then((t) => {
      setAuthed(!!t);
      setReady(true);
    });
  }, [segments]);

  useEffect(() => {
    if (!ready) return;
    const onAuth = segments[0] === "login";
    if (!authed && !onAuth) router.replace("/login");
    if (authed && onAuth) router.replace("/(tabs)");
  }, [ready, authed, segments]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.ink,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="listing/[id]" options={{ title: "Listing" }} />
        <Stack.Screen name="pay" options={{ title: "Pay" }} />
      </Stack>
    </>
  );
}

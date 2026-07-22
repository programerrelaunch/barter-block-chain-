import { Tabs } from "expo-router";
import { Text, View } from "react-native";
import { colors, styles } from "../../src/lib/theme";

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={styles.tabItem}>
      <Text style={{ fontSize: 16 }}>{label === "Home" ? "⌂" : label === "Market" ? "▣" : label === "Pay" ? "⇄" : label === "Directory" ? "◎" : "☺"}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { fontWeight: "700" },
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="marketplace"
        options={{
          title: "Marketplace",
          tabBarIcon: ({ focused }) => <TabIcon label="Market" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="receive"
        options={{
          title: "Receive",
          tabBarIcon: ({ focused }) => <TabIcon label="Pay" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="directory"
        options={{
          title: "Directory",
          tabBarIcon: ({ focused }) => <TabIcon label="Directory" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: "Activity",
          tabBarIcon: ({ focused }) => <TabIcon label="Activity" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          href: null,
        }}
      />
    </Tabs>
  );
}

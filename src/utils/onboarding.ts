import AsyncStorage from "@react-native-async-storage/async-storage";

export const ONBOARDING_KEY = "onboarding_complete_v1";

export async function completeOnboarding(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_KEY, "1");
}

export async function hasCompletedOnboarding(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDING_KEY)) === "1";
}

// Native-intent recovery parsing runs before screen modules initialize.
import "react-native-url-polyfill/auto";
// Normalize unused URL queries before Expo Router is initialized.
import "./src/lib/normalizeWebUrl";
import "expo-router/entry";

import { colors } from "./palette";
export const theme = {
  colors,
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 },
  radius: { sm: 10, md: 18, lg: 28 },
  typography: { title: 36, heading: 23, body: 16, caption: 13 },
  shadow: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
};

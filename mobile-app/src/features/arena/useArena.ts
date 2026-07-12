// The arena chrome hook: current theme + the child's chosen light-mode palette
// (students.palette, whitelisted — web `.arena[data-palette]` parity) resolved
// to concrete arena tokens. Falls back to the default palette until the
// student row loads; dark mode ignores the palette exactly like the web.
// Reusable by any student surface (layouts, screens, header components).
import { useTheme } from "@/theme/ThemeProvider";
import {
  arenaTokens,
  type ArenaPalette,
  type ArenaTokens,
  type ThemeName,
} from "@/theme/tokens";
import { useStudentSelf } from "./queries";

export type ArenaChrome = {
  theme: ThemeName;
  palette: ArenaPalette;
  arena: ArenaTokens;
};

export function useArena(): ArenaChrome {
  const { theme } = useTheme();
  const self = useStudentSelf();
  const palette: ArenaPalette = self.data?.palette ?? "default";
  return { theme, palette, arena: arenaTokens(theme, palette) };
}

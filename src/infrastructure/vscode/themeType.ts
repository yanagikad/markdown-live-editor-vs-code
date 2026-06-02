import * as vscode from "vscode";

export type ThemeType = "light" | "dark" | "high-contrast";

export function detectThemeType(kind: vscode.ColorThemeKind): ThemeType {
  if (kind === vscode.ColorThemeKind.Light) {
    return "light";
  }

  if (kind === vscode.ColorThemeKind.HighContrast || kind === vscode.ColorThemeKind.HighContrastLight) {
    return "high-contrast";
  }

  return "dark";
}

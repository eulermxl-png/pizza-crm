export const INCLUDED_IN_COMBO_NOTE = "Incluido en combo";

const COMBO_GROUP_PREFIX = "__combo_group:";

export function addComboGroupTag(
  customizations: string[],
  comboGroupId: string | null | undefined,
): string[] {
  if (!comboGroupId) return customizations;
  const withoutExisting = customizations.filter(
    (entry) => !entry.startsWith(COMBO_GROUP_PREFIX),
  );
  return [...withoutExisting, `${COMBO_GROUP_PREFIX}${comboGroupId}`];
}

export function parseComboCustomizations(raw: unknown): {
  visible: string[];
  comboGroupId: string | null;
} {
  if (!Array.isArray(raw)) {
    return { visible: [], comboGroupId: null };
  }

  const visible: string[] = [];
  let comboGroupId: string | null = null;

  for (const value of raw) {
    if (typeof value !== "string") continue;
    if (value.startsWith(COMBO_GROUP_PREFIX)) {
      const id = value.slice(COMBO_GROUP_PREFIX.length).trim();
      comboGroupId = id.length > 0 ? id : null;
      continue;
    }
    visible.push(value);
  }

  return { visible, comboGroupId };
}

import { LANG_NAMES, UI_LANGS } from "@andarama/schema";
import { Select } from "@andarama/ui";
import { useI18nStore, useT } from "../i18n";
import { chooseUiLang } from "../stores";

/**
 * Selector del idioma de la interfaz: los 32 idiomas, cada uno con su
 * nombre en su propia lengua. Cambia el Studio al momento y guarda la
 * elección en la cuenta.
 */
export function LangPicker({ id, className }: { id?: string; className?: string }): React.ReactNode {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  return (
    <Select id={id} aria-label={t("ui_language")} value={lang} onChange={(e) => void chooseUiLang(e.target.value)} className={className}>
      {UI_LANGS.map((code) => (
        <option key={code} value={code} lang={code}>
          {LANG_NAMES[code]}
        </option>
      ))}
    </Select>
  );
}

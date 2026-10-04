import { App, Modal } from "obsidian";
import { SUPPORT_URL } from "./update-notice";

/** Short what's-new lines for the current minor release. Edit per release. */
export const WHATS_NEW: string[] = [
  "Windows ARM64: fixed the missing conpty.dll error, with automatic repair of existing installs.",
  "Tab commands now target the focused pane, so split terminals behave.",
  "Escape keeps focus in the terminal (turn off in settings if you prefer).",
  "New minimum contrast setting for readable grey and dim text.",
  "This update notice appears only after minor or major releases and can be turned off in settings.",
];

export class UpdateNoticeModal extends Modal {
  constructor(app: App, private readonly version: string) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.setTitle(`Lean Terminal updated to v${this.version}`);

    contentEl.createEl("p", { text: "What's new:" });
    const list = contentEl.createEl("ul");
    for (const line of WHATS_NEW) list.createEl("li", { text: line });

    contentEl.createEl("p", {
      text:
        "Lean Terminal is free and built in my spare time. If it makes your " +
        "day easier, a small tip helps me keep improving it. Thank you!",
    });

    const buttons = contentEl.createDiv({ cls: "modal-button-container" });
    const support = buttons.createEl("button", { text: "Support development", cls: "mod-cta" });
    support.addEventListener("click", () => {
      window.open(SUPPORT_URL, "_blank", "noopener");
      this.close();
    });
    const later = buttons.createEl("button", { text: "Maybe later" });
    later.addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

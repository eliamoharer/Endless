import type { GameState, UpgradeKind } from "../game/types";

export class GameOverlay {
  private readonly upgradePanel: HTMLDivElement;
  private readonly mergePanel: HTMLDivElement;
  private readonly evolutionList: HTMLDivElement;
  private readonly mergeButton: HTMLButtonElement;
  private upgradeMarkup = "";
  private evolutionMarkup = "";
  private mergeHandler?: () => void;
  private upgradeHandler?: (kind: UpgradeKind) => void;

  constructor(root: HTMLElement) {
    root.innerHTML = "";

    this.upgradePanel = document.createElement("div");
    this.upgradePanel.className = "panel upgrade-panel";

    this.mergePanel = document.createElement("div");
    this.mergePanel.className = "panel merge-panel";
    this.mergePanel.innerHTML = `
      <div class="evolution-list" data-evolution-list></div>
      <div class="merge-line merge-command">
        <button class="ui-button merge-button" type="button" data-merge-button disabled>Merge</button>
      </div>
    `;

    root.append(this.upgradePanel, this.mergePanel);

    const evolutionList = this.mergePanel.querySelector<HTMLDivElement>("[data-evolution-list]");
    const mergeButton = this.mergePanel.querySelector<HTMLButtonElement>("[data-merge-button]");

    if (!evolutionList || !mergeButton) {
      throw new Error("Game overlay failed to initialize.");
    }

    this.evolutionList = evolutionList;
    this.mergeButton = mergeButton;

    this.mergeButton.addEventListener("click", () => {
      this.mergeHandler?.();
    });

    this.upgradePanel.addEventListener("pointerdown", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-upgrade-button]");
      const kind = button?.dataset.upgradeKind as UpgradeKind | undefined;

      if (kind) {
        event.preventDefault();
        this.upgradeHandler?.(kind);
      }
    });
  }

  setMergeHandler(handler: () => void): void {
    this.mergeHandler = handler;
  }

  setUpgradeHandler(handler: (kind: UpgradeKind) => void): void {
    this.upgradeHandler = handler;
  }

  update(state: GameState): void {
    const showMerge = state.mergeProgresses.length > 0;
    this.mergePanel.hidden = !showMerge;
    this.mergePanel.classList.toggle("is-ready", showMerge && state.mergeReady);
    this.renderUpgrades(state);
    this.renderEvolutionProgresses(state);
    this.mergeButton.disabled = !state.mergeReady;
    this.mergeButton.textContent = state.mergeReady ? `Merge ${state.mergeCandidateValue}` : "Merge";

  }

  private renderUpgrades(state: GameState): void {
    const markup = state.upgradeProgresses
      .map(
        (upgrade) => `
          <div class="upgrade-card">
            <div class="upgrade-copy">
              <span>${upgrade.name}</span>
              <span>${upgrade.detail}</span>
            </div>
            <div class="purchase-line">
              <div class="progress-track">
                <div class="progress-fill" style="width: ${upgrade.progress * 100}%"></div>
              </div>
              <button
                class="ui-button purchase-button"
                type="button"
                data-upgrade-button
                data-upgrade-kind="${upgrade.kind}"
                ${upgrade.canPurchase ? "" : "disabled"}
              >
                ${
                  upgrade.isMaxed
                    ? `<span class="cost-amount">Max</span>`
                    : `<span class="cost-amount">${upgrade.costAmount}</span>
                <span class="cost-value cost-value-${upgrade.costValue}">${upgrade.costValue}</span>`
                }
              </button>
            </div>
          </div>
        `,
      )
      .join("");

    if (markup !== this.upgradeMarkup) {
      this.upgradeMarkup = markup;
      this.upgradePanel.innerHTML = markup;
    }
  }

  private renderEvolutionProgresses(state: GameState): void {
    const markup = state.mergeProgresses
      .map((progress) => {
        const fill = Math.min(progress.count / progress.threshold, 1) * 100;

        return `
          <div class="evolution-row${progress.ready ? " is-ready" : ""}">
            <div class="evolution-row-copy">
              <span>Number ${progress.value}</span>
              <span>${progress.count} / ${progress.threshold}</span>
            </div>
            <div class="progress-track merge-track">
              <div class="progress-fill merge-fill" style="width: ${fill}%"></div>
            </div>
          </div>
        `;
      })
      .join("");

    if (markup !== this.evolutionMarkup) {
      this.evolutionMarkup = markup;
      this.evolutionList.innerHTML = markup;
    }
  }
}

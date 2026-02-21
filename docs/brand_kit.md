# Blizkperse Brand Kit

## Logo

The logo is a shield icon with a lock cutout, paired with the "blizkperse" wordmark. The shield stroke color adapts to the active chain via `currentColor`.

- **Header**: Inline SVG with `text-primary transition-colors duration-500`.
- **Landing page**: ASCII art rendered in `text-primary/70`.
- **Neutral state**: Gray shield on first load (no chain selected).
- **Monad**: Purple shield.
- **Celo**: Yellow shield.

## Design Philosophy

**Chain-Adaptive Theming**: The UI starts neutral (grayscale) and takes on chain-specific colors only when the user selects a chain. This positions Blizkperse as chain-agnostic rather than tied to any single ecosystem.

## Color Palette

We use oklch color space for all theme tokens. Dark mode is always on.

### Neutral Default (No Chain Selected)

| Role | Value | Description |
| :--- | :--- | :--- |
| **Background** | `oklch(0.09 0 0)` | Pure dark gray |
| **Surface / Card** | `oklch(0.13 0 0)` | Slightly lighter gray |
| **Primary** | `oklch(0.7 0 0)` | Medium gray accent |
| **Foreground** | `oklch(0.96 0 0)` | Near-white |
| **Muted** | `oklch(0.6 0 0)` | Subdued text |
| **Border** | `oklch(0.22 0 0)` | Subtle dividers |

### Monad Theme (`data-chain="monad"`)

| Role | Value | Description |
| :--- | :--- | :--- |
| **Background** | `oklch(0.09 0.015 280)` | Near-black with purple tint |
| **Primary** | `oklch(0.65 0.25 285)` | Vibrant purple |
| **Accent** | `oklch(0.72 0.2 285)` | Lighter purple |
| **Border** | `oklch(0.22 0.03 280)` | Purple-tinted dividers |

### Celo Theme (`data-chain="celo"`)

Based on the [Celo Brand Kit](https://celo.org/brand-kit).

| Role | Value | Source |
| :--- | :--- | :--- |
| **Background** | `oklch(0.10 0.05 310)` | Deep purple `#1e002b` |
| **Primary** | `oklch(0.95 0.19 110)` | Celo yellow `#fcff52` |
| **Accent** | `oklch(0.82 0.18 155)` | Celo lime green `#56df7c` |
| **Foreground** | `oklch(0.96 0.01 100)` | Warm white |

### Usage Rules
-   **Buttons**: `bg-primary text-primary-foreground` with rounded corners.
-   **Cards**: `bg-card` with `border-border`.
-   **Theme switching**: Colors transition with `duration-500` for smooth effect.
-   **Custom utilities**: `.glass` (glassmorphism), `.glow-purple` (glow shadow), `.gradient-text` (purple gradient text).

## Typography

**Font Family**: `Geist` (Google Fonts, loaded via `next/font`).

-   **Headings**: Bold, tight tracking.
-   **Body**: Regular weight, relaxed line-height.
-   **Mono**: `Geist Mono` for addresses, hashes, and code.

## Chain Selector

The header contains a `ChainSelector` dropdown showing:
- Colored dot per chain (purple for Monad, yellow for Celo).
- Chain name + chevron.
- "Active" label on the currently selected chain.

Selecting a chain sets `data-chain` on the `<html>` element, triggering the CSS variable swap across the entire UI.

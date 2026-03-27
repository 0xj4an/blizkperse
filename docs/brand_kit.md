# Blizkperse Brand Kit

> CSS implementation: [`web/app/globals.css`](../web/app/globals.css) (app) and [`landing/app/globals.css`](../landing/app/globals.css) (landing)

## Shared Design System

These fundamentals apply to both the landing page and the app.

### Design Philosophy

**Chain-Adaptive Theming**: The UI starts neutral (grayscale) and takes on chain-specific colors only when the user selects a chain. This positions Blizkperse as chain-agnostic rather than tied to any single ecosystem.

- **Dark mode**: Always-on via `className="dark"` on `<html>`.
- **Color space**: oklch for all theme tokens (perceptually uniform, wide gamut).
- **Transitions**: `transition-colors duration-500` for smooth theme switching.

### Logo

The logo is a shield icon with a lock cutout, paired with the "blizkperse" wordmark. The shield stroke color adapts to the active chain via `currentColor`.

- **Neutral state**: Gray shield on first load (no chain selected).
- **Monad**: Purple shield.
- **Celo**: Yellow shield.

### Typography

**Font Family**: `Geist` (loaded locally via `next/font/local`).

- **Headings**: Bold, tight tracking.
- **Body**: Regular weight, relaxed line-height.
- **Mono**: `Geist Mono` for addresses, hashes, and code.

### Neutral Palette

The base palette used everywhere before a chain is selected. Also the only palette used on the landing page.

| Role | Value | Description |
| :--- | :--- | :--- |
| **Background** | `oklch(0.09 0 0)` | Pure dark gray |
| **Surface / Card** | `oklch(0.13 0 0)` | Slightly lighter gray |
| **Primary** | `oklch(0.7 0 0)` | Medium gray accent |
| **Foreground** | `oklch(0.96 0 0)` | Near-white |
| **Muted** | `oklch(0.6 0 0)` | Subdued text |
| **Border** | `oklch(0.22 0 0)` | Subtle dividers |

### Usage Rules

- **Buttons**: `bg-primary text-primary-foreground` with rounded corners.
- **Cards**: `bg-card` with `border-border`.
- **Theme switching**: Colors transition with `duration-500` for smooth effect.

---

## Landing Page

The marketing landing page (`landing/`) uses only the neutral palette with no chain-adaptive switching. It stays on the grayscale (zero chroma oklch) for brand consistency.

- **Logo**: ASCII art rendered in `text-foreground/50` with `.glow-hero` text shadow.
- **Utilities**: `.glow-hero` (text glow), `.glass` (glassmorphism cards), `.gradient-text` (neutral gradient).

---

## App

The app (`web/`) uses the neutral palette as default, then swaps to chain-specific colors when the user selects a chain.

- **Logo**: Inline SVG in header with `text-primary transition-colors duration-500`.
- **Utilities**: `.glass` (glassmorphism), `.glow-primary` (chain-colored glow), `.gradient-text` (chain-colored gradient).

### Chain Selector

The header contains a `ChainSelector` dropdown that sets `data-chain` on the `<html>` element, triggering the CSS variable swap across the entire UI.

- Colored dot per chain (purple for Monad, yellow for Celo).
- Chain name + chevron.
- "Active" label on the currently selected chain.

### Monad Theme (`data-chain="monad"`)

| Role | Value | Description |
| :--- | :--- | :--- |
| **Background** | `oklch(0.09 0.015 280)` | Near-black with purple tint |
| **Primary** | `oklch(0.65 0.25 285)` | Vibrant purple |
| **Accent** | `oklch(0.72 0.2 285)` | Lighter purple |
| **Border** | `oklch(0.22 0.03 280)` | Purple-tinted dividers |

### Celo Theme (`data-chain="celo"`)

Based on the [Celo Brand Kit](https://celo.org/brand-kit).

| Role | Value | Description |
| :--- | :--- | :--- |
| **Background** | `oklch(0.10 0.05 310)` | Deep purple `#1e002b` |
| **Primary** | `oklch(0.95 0.19 110)` | Celo yellow `#fcff52` |
| **Accent** | `oklch(0.82 0.18 155)` | Celo lime green `#56df7c` |
| **Foreground** | `oklch(0.96 0.01 100)` | Warm white |

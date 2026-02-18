## 2024-05-23 - Accessibility Gaps in Icon Buttons
**Learning:** Icon-only buttons (e.g., menu toggle) frequently lacked `aria-label` and `focus-visible` states, making navigation inaccessible.
**Action:** Automatically check all icon-only buttons for `aria-label` and ensure `focus-visible` is applied for keyboard users.

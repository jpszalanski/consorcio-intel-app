# Palette's Journal

## 2024-05-23 - Navigation Accessibility Gap
**Learning:** The application uses custom `<button>` based navigation without semantic ARIA attributes, making the current page state invisible to screen readers.
**Action:** Ensure all navigation components (Sidebar, Tabs) include `aria-current="page"` for active states and `aria-label` for icon-only buttons.

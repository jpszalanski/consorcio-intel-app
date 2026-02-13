
## 2025-05-24 - Mobile Navigation Accessibility
**Learning:** The mobile sidebar close button used a `Menu` icon instead of `X`, confusing users. Also, navigation lacked `aria-current`.
**Action:** When implementing mobile menus, always use distinct icons for open/close states and ensure `aria-current="page"` is applied to the active link.

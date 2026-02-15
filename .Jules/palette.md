## 2026-02-15 - Form Label Association Pattern
**Learning:** React form components were using nested inputs inside `div`s with sibling `label` elements, breaking programmatic association. Implicit association (wrapping input in label) was not used, and explicit `htmlFor`/`id` association was missing.
**Action:** When auditing forms, always check for `htmlFor` matching `id` or ensure strict nesting. Add `autoComplete` attributes to standard fields (email, password) to reduce cognitive load and typing errors.

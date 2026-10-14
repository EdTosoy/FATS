# Design system

## Confirmed direction

The primary reference is `uiux/FATS Job Tracker Showcase.png`: light canvas, white surfaces, blue navigation/actions, compact application rows, gentle mint/amber guidance, restrained borders and shadows. The Job Search Dashboard reference informs onboarding, hierarchy, and contextual next steps. The Applicant Tracking reference informs application/document patterns; its dark-mode exploration is reserved for later.

All three originals remain untouched. This UI uses production-feasible native controls and a Radix dialog rather than copying the complete showcase.

## Tokens

| Token      | Value     | Use                                           |
| ---------- | --------- | --------------------------------------------- |
| Canvas     | `#F7F9FC` | Main workspace                                |
| Surface    | `#FFFFFF` | Cards, sidebar, dialog                        |
| Ink        | `#202C3B` | Headings and body                             |
| Primary    | `#427DAB` | Brand and accents                             |
| Mint       | `#42AD93` | Encouragement and progress accents            |
| Amber      | `#E6AE68` | Preparation and gentle guidance               |
| Border     | `#E5EAF0` | Surface separation                            |
| Coral      | `#E16B6B` | Brand/error accent                            |
| Action     | `#356B96` | Accessible white-on-blue buttons, links/focus |
| Muted text | `#617084` | Secondary readable copy                       |

Light mint/amber/coral fills use darker text rather than white text on accent colors. Status labels always include words; color is supplementary. The supplied blue remains the brand token; a darker action tone improves text contrast.

## Typography and spacing

Local font stack: Inter when installed, Segoe UI, Arial, sans-serif. No font download at runtime. Page titles 28–34px; card headings 14–17px; main explanatory text 12–14px. Small 9–11px labels are supplementary and never the only source of essential instructions. Spacing follows a 4px-based rhythm with 20–32px surface padding. Cards use 12px corners and subtle borders/shadows; buttons use 8px corners and at least 42px height.

## Components and interaction

`ui.tsx` provides Button, ActionLink, Card, StatusBadge, EmptyState, PageHeading, and TextLink. Inputs and selects remain native and labeled. The shared JobFormDialog uses Radix for modal semantics, focus containment, and Escape handling. Input failures preserve the draft; submitting disables duplicate submission, and failed writes do not announce success.

Desktop uses a fixed sidebar with Settings/Help separate below the main routes. Mobile uses a compact brand/action bar and an expandable navigation region. Application rows collapse into readable stacked cards on narrow screens. The form scrolls within the viewport; no horizontal content scrolling is required for the core journey. Visible focus outlines, a skip link, semantic headings, live status feedback, and reduced-motion support are included.

## Empty, loading, and error states

- Onboarding encourages finding an external opportunity, saving its link, and tracking progress; it does not start with unsupported resume upload.
- Empty lists offer one useful save action. A no-match search offers a clear filter reset.
- Interview sections distinguish application status from scheduled meetings.
- Storage errors explain the problem and recovery without inventing zero statistics or resetting data.
- Loading appears until local state is read, avoiding a flash of fabricated records.

## Assumptions

Light mode and English copy are sufficient for this slice. Broader accessibility audits, Filipino localization, user-tested font sizes/density, dark mode, and a fuller component catalog remain future work. Viewport and keyboard checks establish focused behavior, not full accessibility conformance.

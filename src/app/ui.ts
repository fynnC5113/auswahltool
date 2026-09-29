// Shared Tailwind classes (DESIGN.md), mobile first; sm (640 px) = web width.
// Pages use these instead of building their own variants.

// Page frames: public pages and login 680 px, team pages 880 px.
export const page = "mx-auto flex w-full max-w-[680px] flex-col gap-7 px-4 pt-6 pb-10 sm:gap-9 sm:px-6 sm:pt-10 sm:pb-14";
export const teamPage = "mx-auto flex w-full max-w-[880px] flex-col gap-7 px-4 pt-6 pb-10 sm:gap-9 sm:px-6 sm:pt-10 sm:pb-14";

// Type.
export const title = "text-title font-bold tracking-[-0.01em] text-balance";
export const sectionTitle = "text-section font-semibold";
export const lead = "text-note text-muted";

// A section: heading, optional lead, then a group. 8 px between.
export const section = "flex flex-col gap-2";

// Groups. formGroup: fields as filled areas inside; listGroup: rows with
// hairlines (row = listRow).
export const formGroup = "flex flex-col gap-4 rounded-group bg-surface p-4";
export const listGroup = "list flex flex-col rounded-group bg-surface";
export const listRow = "px-4 py-[11px]";

// Fields.
export const fieldLabel = "text-note font-medium";
export const input =
  "w-full min-w-0 appearance-none rounded-field bg-field px-3 py-[11px] text-body text-fg placeholder:text-muted focus-visible:outline-offset-1 aria-[invalid=true]:shadow-[inset_0_0_0_1.5px_var(--c-danger)]";
export const select = `${input} select-arrow pr-9`;
export const fieldError = "text-small text-danger";
export const checkRow = "flex cursor-pointer gap-3 px-4 py-[11px] text-body";

// Read-only value: small label over the value.
export const readLabel = "text-small text-muted";

// Buttons. One primary per section; full width on phones.
export const button =
  "inline-flex min-h-[50px] w-full items-center justify-center rounded-button bg-accent px-7 py-2 text-center text-body font-semibold text-on-accent disabled:opacity-50 sm:w-auto";
export const secondaryButton =
  "inline-flex min-h-[46px] w-full items-center justify-center rounded-button bg-surface px-5 py-2 text-center text-body font-medium text-accent shadow-[inset_0_0_0_1px_var(--c-line)] disabled:opacity-50 sm:w-auto";
// Primary action inside a bar or next to other controls (not full width).
export const barButton =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-button bg-accent px-5 text-body font-semibold text-on-accent disabled:opacity-50";
// Compact actions in team lists and toolbars (still 44 px to tap).
export const smallButton =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-button bg-surface px-4 text-note font-medium text-accent shadow-[inset_0_0_0_1px_var(--c-line)] disabled:opacity-50";
export const smallDangerButton =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-button bg-surface px-4 text-note font-medium text-danger shadow-[inset_0_0_0_1px_var(--c-line)] disabled:opacity-50";
export const textButton = "text-left text-note font-medium text-accent disabled:opacity-50";
export const link = "font-medium text-accent";
// Final actions: text first, the filled button only in the confirmation.
export const dangerTextButton = "text-left text-note font-medium text-danger disabled:opacity-50";
export const dangerButton =
  "inline-flex min-h-[50px] w-full items-center justify-center rounded-button bg-danger px-7 py-2 text-center text-body font-semibold text-on-accent disabled:opacity-50 sm:w-auto";

// Messages.
export const alertBox = "rounded-field bg-danger-soft px-4 py-3 text-note text-danger";
export const noticeBox = "rounded-field bg-warn-soft px-4 py-3 text-note text-warn";
export const okBox = "rounded-field bg-ok-soft px-4 py-3 text-note text-ok";
export const okText = "text-note font-medium text-ok";

// Status chip in lists.
export const chip = "inline-flex items-center rounded-full bg-field px-2.5 py-0.5 text-small font-medium whitespace-nowrap";

// Dialog (<dialog>): sheet from the bottom on phones, centered from lg.
export const dialog =
  "m-0 mt-auto w-full max-w-none rounded-t-group bg-surface p-0 text-fg shadow-[0_20px_60px_rgba(0,0,0,0.3)] lg:m-auto lg:max-w-lg lg:rounded-group";
export const dialogBody = "flex flex-col gap-4 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]";

// Bar fixed to the bottom (above the team tab bar on phones).
export const bottomBar = "border-t border-line bg-bar backdrop-blur-xl";

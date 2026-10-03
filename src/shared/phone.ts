// flrnoh fork (see FORK.md "The phone"): your phone, out (I) or away. The office keeps whether
// someone has it out as their `phone`, so everyone sees it in their hand (and whoever comes later).

export type PhoneClientMsg =
  /** Your phone out, or away. */
  { t: 'phone.hold'; on: boolean };

export type PhoneServerMsg =
  /** Someone took their phone out, or put it away. */
  { t: 'phone.held'; id: string; on: boolean };

/** How often (ms) the office takes it out or away from one person. */
export const PHONE_THROTTLE_MS = 150;

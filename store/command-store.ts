import { create } from 'zustand';

/** Shared open state for the ⌘K command palette, so a header search bar (or
 *  any other control) can open it — not just the keyboard shortcut. */
interface CommandState {
   open: boolean;
   setOpen: (open: boolean) => void;
}

export const useCommandStore = create<CommandState>((set) => ({
   open: false,
   setOpen: (open) => set({ open }),
}));

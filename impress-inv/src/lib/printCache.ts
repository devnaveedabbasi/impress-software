// How long a print page keeps what it read, in the browser's storage (shared by the tabs). A print opens in a new
// tab: without this, every Print click would ask the server for the same data again. Any save clears it at once.
export const PRINT_KEEP_MS = 5 * 60 * 1000;

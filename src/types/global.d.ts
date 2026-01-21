// Global type declarations

export {};

declare global {
  interface Window {
    electronAPI: {
      ping: () => Promise<string>;
      // More methods will be added in Week 2
    };
  }
}

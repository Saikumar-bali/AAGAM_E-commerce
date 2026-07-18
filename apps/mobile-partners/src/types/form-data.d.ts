export {};

declare global {
  interface FormData {
    append(name: string, value: any, fileName?: string): void;
  }
}

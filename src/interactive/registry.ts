export interface Question {
  id: string;
  label: string;
  description: string;
  default: boolean;
  /** For boolean questions */
  flagYes?: string;
  flagNo?: string;
  /** For choice questions */
  choices?: Array<{ value: string; label: string; flag: string }>;
}

export interface FrameworkEntry {
  name: string;
  displayName: string;
  patterns: RegExp[];
  /** Any of these flags present in command = already configured, allow through */
  answerFlags: string[];
  questions: Question[];
  docsUrl?: string;
}

export class FrameworkRegistry {
  private entries: FrameworkEntry[] = [];

  register(entry: FrameworkEntry): void {
    this.entries.push(entry);
  }

  /** Find the first matching framework for a command */
  match(command: string): FrameworkEntry | null {
    return this.entries.find(e => e.patterns.some(p => p.test(command))) ?? null;
  }

  getAll(): FrameworkEntry[] {
    return [...this.entries];
  }
}

export const registry = new FrameworkRegistry();
